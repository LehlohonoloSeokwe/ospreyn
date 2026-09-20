/**
 * Ospreyn REST API.
 *
 * Create -> Define Ownership -> Invite -> Confirm -> Preserve Evidence -> Export
 *
 * Everything below reads and writes PostgreSQL. Authenticated routes resolve
 * the caller from a session cookie; the only unauthenticated routes are the
 * token-guarded contributor review portal and the sign-in endpoints.
 */

import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { camel, queryOne, tx } from './db';
import * as repo from './repo';
import { DISCLAIMER_TEXT, generateSplitSheetAgreementText } from './agreements';
import { sendEmail, invitationEmail, confirmationNotificationEmail } from './email';
import {
  clearSessionCookie,
  clientIp,
  createSession,
  hashPassword,
  readSessionToken,
  requireAuth,
  requireRole,
  revokeSession,
  setSessionCookie,
  verifyPassword,
} from './auth';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  base64ToHex,
  buildStorageKey,
  createDownloadUrl,
  createUploadUrl,
  deleteObject,
  headObject,
  storageMode,
} from './storage';
import { requestOrigin } from './localStorage';
import { User } from '../src/types';

export const apiRouter = express.Router();

/** Express 4 does not forward rejected promises, so every handler is wrapped. */
const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

const APP_ORIGIN = (process.env.APP_ORIGIN || '').replace(/\/$/, '');

function reviewUrlFor(rawToken: string): string {
  return APP_ORIGIN ? `${APP_ORIGIN}/review/${rawToken}` : `/review/${rawToken}`;
}

function appUrlFor(path: string): string {
  return APP_ORIGIN ? `${APP_ORIGIN}${path}` : path;
}

// ==========================================
// 1. AUTHENTICATION
// ==========================================

apiRouter.post(
  '/auth/login',
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const row = await queryOne<any>(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);

    // Do comparable work whether or not the account exists, so the endpoint
    // does not reveal which emails are registered.
    const comparisonHash =
      row?.password_hash || `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
    const passwordOk = verifyPassword(password, comparisonHash);

    if (!row || !passwordOk) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    const { rawToken, expiresAt } = await createSession(row.id, req);
    setSessionCookie(res, rawToken, expiresAt);

    const { password_hash, ...safeUser } = row;
    const user = camel<User>(safeUser) as User;
    const organisations = await repo.listOrganisationsForUser(user.id);

    res.json({ user, organisations, currentOrganisation: organisations[0] || null });
  }),
);

apiRouter.post(
  '/auth/logout',
  ah(async (req, res) => {
    const rawToken = readSessionToken(req);
    if (rawToken) await revokeSession(rawToken);
    clearSessionCookie(res);
    res.json({ success: true });
  }),
);

/**
 * Self-service registration creates the user and their first workspace in one
 * transaction. Set ALLOW_REGISTRATION=false to run a closed beta.
 */
apiRouter.post(
  '/auth/register',
  ah(async (req, res) => {
    if (process.env.ALLOW_REGISTRATION === 'false') {
      return res.status(403).json({ error: 'Registration is closed on this instance.' });
    }

    const { email, password, fullName, stageName, organisationName } = req.body || {};
    if (!email?.trim() || !password || !fullName?.trim()) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (String(password).length < 10) {
      return res.status(400).json({ error: 'Choose a password of at least 10 characters.' });
    }

    const existing = await queryOne(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
    if (existing) {
      return res.status(409).json({ error: 'An account already exists for that email.' });
    }

    const result = await tx(async (client) => {
      const userRow = (
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, stage_name)
           VALUES (lower($1), $2, $3, $4) RETURNING *`,
          [email.trim(), hashPassword(password), fullName.trim(), stageName?.trim() || null],
        )
      ).rows[0];

      const orgRow = (
        await client.query(
          `INSERT INTO organisations (name, owner_id) VALUES ($1, $2) RETURNING *`,
          [organisationName?.trim() || `${fullName.trim()}'s workspace`, userRow.id],
        )
      ).rows[0];

      await client.query(
        `INSERT INTO organisation_members (organisation_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [orgRow.id, userRow.id],
      );

      // The account holder is also a contributor, so they can hold a split.
      await client.query(
        `INSERT INTO contributors (organisation_id, full_name, professional_name, email)
         VALUES ($1, $2, $3, lower($4)) ON CONFLICT (organisation_id, email) DO NOTHING`,
        [orgRow.id, fullName.trim(), stageName?.trim() || null, email.trim()],
      );

      return { userRow, orgRow };
    });

    const { rawToken, expiresAt } = await createSession(result.userRow.id, req);
    setSessionCookie(res, rawToken, expiresAt);

    const { password_hash, ...safeUser } = result.userRow;
    res.status(201).json({
      user: camel<User>(safeUser),
      currentOrganisation: camel(result.orgRow),
      organisations: [camel(result.orgRow)],
    });
  }),
);

apiRouter.get(
  '/auth/me',
  requireAuth,
  ah(async (req, res) => {
    const organisations = await repo.listOrganisationsForUser(req.auth!.user.id);
    res.json({
      user: req.auth!.user,
      currentOrganisation: req.auth!.organisation,
      role: req.auth!.role,
      organisations,
    });
  }),
);

apiRouter.post(
  '/auth/switch-org',
  requireAuth,
  ah(async (req, res) => {
    const { orgId } = req.body || {};
    const membership = await queryOne<any>(
      `SELECT o.* FROM organisations o
         JOIN organisation_members om ON om.organisation_id = o.id
        WHERE om.user_id = $1 AND o.id = $2`,
      [req.auth!.user.id, orgId],
    );
    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of that workspace.' });
    }
    res.json({ currentOrganisation: camel(membership) });
  }),
);

// ==========================================
// 2. DASHBOARD HYDRATION
// ==========================================

apiRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const orgId = req.auth!.organisation.id;
    const [songs, metrics, recentActivity] = await Promise.all([
      repo.listSongs(orgId),
      repo.getDashboardMetrics(orgId),
      repo.listOrgAudit(orgId, 15),
    ]);

    res.json({
      user: req.auth!.user,
      organisation: req.auth!.organisation,
      role: req.auth!.role,
      songs,
      metrics: { ...metrics, recentActivity },
    });
  }),
);

apiRouter.get(
  '/dashboard/metrics',
  requireAuth,
  ah(async (req, res) => {
    const orgId = req.auth!.organisation.id;
    const [metrics, songs, recentActivity] = await Promise.all([
      repo.getDashboardMetrics(orgId),
      repo.listSongs(orgId),
      repo.listOrgAudit(orgId, 8),
    ]);
    res.json({ ...metrics, recentSongs: songs.slice(0, 6), recentActivity });
  }),
);

// ==========================================
// 3. SONGS (RIGHTS RECORDS)
// ==========================================

apiRouter.get(
  '/songs',
  requireAuth,
  ah(async (req, res) => {
    res.json(await repo.listSongs(req.auth!.organisation.id));
  }),
);

apiRouter.post(
  '/songs',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const { title, primaryArtist, releaseDate, genre, isrc, catalogueReference, notes } =
      req.body || {};

    if (!title?.trim() || !primaryArtist?.trim()) {
      return res.status(400).json({ error: 'Song title and primary artist are required.' });
    }

    const song = await tx(async (client) => {
      const created = await repo.createSong(client, {
        organisationId: organisation.id,
        title: title.trim(),
        primaryArtist: primaryArtist.trim(),
        releaseDate: releaseDate || null,
        genre: genre || null,
        isrc: isrc || null,
        catalogueReference: catalogueReference || null,
        notes: notes || null,
      });

      await repo.createVersion(client, {
        songId: created.id,
        versionNumber: 1,
        status: 'draft',
        createdBy: user.id,
      });

      // If the signed-in user exists as a contributor here, seed them onto the
      // record as the artist.
      const self = await repo.findContributorByEmail(organisation.id, user.email, client);
      if (self) {
        await repo.addSongContributor(client, created.id, self.id, 'artist');
      }

      await repo.logAuditEvent(client, {
        organisationId: organisation.id,
        entityType: 'song',
        entityId: created.id,
        songId: created.id,
        actorType: 'user',
        actorId: user.id,
        actorName: user.fullName,
        eventType: 'SONG_CREATED',
        metadata: { title: created.title, primaryArtist: created.primaryArtist },
      });

      return created;
    });

    res.status(201).json(song);
  }),
);

apiRouter.get(
  '/songs/:id',
  requireAuth,
  ah(async (req, res) => {
    const song = await repo.getSong(req.params.id, req.auth!.organisation.id);
    if (!song) return res.status(404).json({ error: 'Rights record not found.' });

    const versions = await repo.listVersions(song.id);
    const currentVersion = versions[versions.length - 1] || null;

    const [
      songContributors,
      allocations,
      validation,
      confirmations,
      invitations,
      agreements,
      documents,
      audit,
    ] = await Promise.all([
      repo.listSongContributors(song.id),
      currentVersion ? repo.listAllocations(currentVersion.id) : Promise.resolve([]),
      currentVersion ? repo.getOwnershipValidation(currentVersion.id) : Promise.resolve(null),
      currentVersion ? repo.listConfirmations(currentVersion.id) : Promise.resolve([]),
      currentVersion ? repo.listInvitations(song.id, currentVersion.id) : Promise.resolve([]),
      repo.listAgreements(song.id),
      repo.listDocuments(song.id),
      repo.listSongAudit(song.id),
    ]);

    res.json({
      song,
      versions,
      currentVersion,
      songContributors,
      allocations,
      validation,
      confirmations,
      // listInvitations never selects token_hash, and the raw token is shown
      // exactly once, at creation.
      invitations,
      agreements,
      documents,
      audit,
    });
  }),
);

const updateSong = ah(async (req: Request, res: Response) => {
  const { user, organisation } = req.auth!;
  const song = await repo.getSong(req.params.id, organisation.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const body = req.body || {};
  const fields: Record<string, unknown> = {};
  if (body.title?.trim()) fields.title = body.title.trim();
  if (body.primaryArtist?.trim()) fields.primary_artist = body.primaryArtist.trim();
  if (body.releaseDate !== undefined) fields.release_date = body.releaseDate || null;
  if (body.genre !== undefined) fields.genre = body.genre || null;
  if (body.isrc !== undefined) fields.isrc = body.isrc || null;
  if (body.catalogueReference !== undefined)
    fields.catalogue_reference = body.catalogueReference || null;
  if (body.notes !== undefined) fields.notes = body.notes || null;

  const updated = await repo.updateSongFields(undefined, song.id, fields);

  await repo.logAuditEvent(undefined, {
    organisationId: organisation.id,
    entityType: 'song',
    entityId: song.id,
    songId: song.id,
    actorType: 'user',
    actorId: user.id,
    actorName: user.fullName,
    eventType: 'SONG_METADATA_UPDATED',
    metadata: { changed: Object.keys(fields) },
  });

  res.json(updated);
});

apiRouter.patch('/songs/:id', requireAuth, updateSong);
apiRouter.put('/songs/:id', requireAuth, updateSong);

// ==========================================
// 4. CONTRIBUTORS
// ==========================================

apiRouter.get(
  '/contributors',
  requireAuth,
  ah(async (req, res) => {
    res.json(await repo.listContributors(req.auth!.organisation.id));
  }),
);

apiRouter.post(
  '/songs/:id/contributors',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const {
      fullName,
      professionalName,
      email,
      phone,
      role,
      customRoleTitle,
      existingContributorId,
    } = req.body || {};

    const result = await tx(async (client) => {
      let contributor;

      if (existingContributorId) {
        contributor = await repo.getContributor(existingContributorId, organisation.id, client);
        if (!contributor) {
          throw Object.assign(new Error('Selected contributor not found in this workspace.'), {
            statusCode: 404,
          });
        }
      } else {
        if (!fullName?.trim() || !email?.trim()) {
          throw Object.assign(new Error('Full name and email are required to add a contributor.'), {
            statusCode: 400,
          });
        }
        contributor = await repo.upsertContributor(client, {
          organisationId: organisation.id,
          fullName: fullName.trim(),
          professionalName: professionalName?.trim() || null,
          email: email.trim(),
          phone: phone?.trim() || null,
        });
      }

      const songContributor = await repo.addSongContributor(
        client,
        song.id,
        contributor.id,
        role || 'other',
        customRoleTitle || null,
      );

      await repo.logAuditEvent(client, {
        organisationId: organisation.id,
        entityType: 'song',
        entityId: song.id,
        songId: song.id,
        actorType: 'user',
        actorId: user.id,
        actorName: user.fullName,
        eventType: 'CONTRIBUTOR_ADDED',
        metadata: { contributorName: contributor.fullName, role: songContributor.role },
      });

      return { songContributor, contributor };
    });

    res.status(201).json(result);
  }),
);

apiRouter.delete(
  '/songs/:id/contributors/:songContributorId',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const sc = await repo.getSongContributor(req.params.songContributorId, song.id);
    if (!sc) return res.status(404).json({ error: 'Contributor role not found on this record.' });

    const contributor = await repo.getContributor(sc.contributorId, organisation.id);
    await repo.removeSongContributor(sc.id);

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'song',
      entityId: song.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'CONTRIBUTOR_REMOVED',
      metadata: { contributorName: contributor?.fullName, role: sc.role },
    });

    res.json({ success: true });
  }),
);

// ==========================================
// 5. OWNERSHIP ALLOCATIONS (basis points, 10,000 = 100.00%)
// ==========================================

apiRouter.post(
  '/songs/:id/ownership',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const { allocations } = req.body || {};
    if (!Array.isArray(allocations)) {
      return res.status(400).json({ error: 'Invalid allocations array.' });
    }

    for (const item of allocations) {
      const bps = Number(item?.basisPoints);
      if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
        return res
          .status(400)
          .json({ error: 'Basis points must be a whole number between 0 and 10,000.' });
      }
      if (item?.rightType !== 'COMPOSITION' && item?.rightType !== 'MASTER') {
        return res.status(400).json({ error: 'Right type must be COMPOSITION or MASTER.' });
      }
    }

    const result = await tx(async (client) => {
      const currentVersion = await repo.getCurrentVersion(song.id, client);
      if (!currentVersion) {
        throw Object.assign(new Error('No active rights record version.'), { statusCode: 400 });
      }

      // Lock the version so two editors cannot race each other to 100%.
      await client.query(`SELECT id FROM rights_record_versions WHERE id = $1 FOR UPDATE`, [
        currentVersion.id,
      ]);

      if (currentVersion.status === 'confirmed') {
        throw Object.assign(
          new Error(
            'Confirmed rights records cannot be edited in place. Bump the version to propose new rights.',
          ),
          { statusCode: 409, requiresVersionBump: true },
        );
      }

      for (const item of allocations) {
        const contributor = await repo.getContributor(item.contributorId, organisation.id, client);
        if (!contributor) {
          throw Object.assign(
            new Error('One or more contributors do not belong to this workspace.'),
            { statusCode: 400 },
          );
        }
        await repo.setOwnership(
          client,
          currentVersion.id,
          song.id,
          item.contributorId,
          item.rightType,
          Number(item.basisPoints),
        );
      }

      const validation = await repo.getOwnershipValidation(currentVersion.id, client);
      const complete = validation.isCompositionComplete && validation.isMasterComplete;
      const nextStatus = complete ? 'proposed' : 'draft';

      await repo.setVersionStatus(client, currentVersion.id, nextStatus);
      await repo.updateSongFields(client, song.id, { status: nextStatus });

      await repo.logAuditEvent(client, {
        organisationId: organisation.id,
        entityType: 'ownership',
        entityId: currentVersion.id,
        songId: song.id,
        actorType: 'user',
        actorId: user.id,
        actorName: user.fullName,
        eventType: 'OWNERSHIP_UPDATED',
        metadata: {
          version: currentVersion.versionNumber,
          compositionBps: validation.compositionBasisPoints,
          masterBps: validation.masterBasisPoints,
          isComplete: validation.canProceedToInvite,
        },
      });

      return {
        version: { ...currentVersion, status: nextStatus },
        validation,
        allocations: await repo.listAllocations(currentVersion.id, client),
      };
    });

    res.json(result);
  }),
);

// ==========================================
// 6. VERSION CONTROL
// ==========================================

const bumpVersion = ah(async (req: Request, res: Response) => {
  const { user, organisation } = req.auth!;
  const { changeReason } = req.body || {};

  if (!changeReason || changeReason.trim().length < 5) {
    return res
      .status(400)
      .json({ error: 'Describe why the rights are changing (at least 5 characters).' });
  }

  const song = await repo.getSong(req.params.id, organisation.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const result = await tx(async (client) => {
    const oldVersion = await repo.getCurrentVersion(song.id, client);
    const newVersionNumber = (oldVersion?.versionNumber || 0) + 1;

    if (oldVersion) {
      await repo.setVersionStatus(client, oldVersion.id, 'superseded');
      // Links already sent refer to terms that no longer apply.
      await client.query(
        `UPDATE invitations SET status = 'revoked', revoked_at = now()
          WHERE version_id = $1 AND status IN ('pending', 'viewed')`,
        [oldVersion.id],
      );
    }

    const newVersion = await repo.createVersion(client, {
      songId: song.id,
      versionNumber: newVersionNumber,
      status: 'draft',
      changeReason: changeReason.trim(),
      createdBy: user.id,
    });

    if (oldVersion) {
      await repo.cloneAllocations(client, oldVersion.id, newVersion.id);
    }

    const updatedSong = await repo.updateSongFields(client, song.id, {
      current_version_number: newVersionNumber,
      status: 'draft',
    });

    await repo.logAuditEvent(client, {
      organisationId: organisation.id,
      entityType: 'ownership',
      entityId: newVersion.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'RIGHTS_VERSION_BUMPED',
      metadata: {
        fromVersion: oldVersion?.versionNumber,
        toVersion: newVersionNumber,
        changeReason: changeReason.trim(),
      },
    });

    return { newVersion, song: updatedSong };
  });

  res.status(201).json(result);
});

apiRouter.post('/songs/:id/bump-version', requireAuth, bumpVersion);
apiRouter.post('/songs/:id/versions/bump', requireAuth, bumpVersion);

// ==========================================
// 7. INVITATIONS
// ==========================================

apiRouter.post(
  '/songs/:id/invitations',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const { contributorIds } = req.body || {};
    if (!Array.isArray(contributorIds) || contributorIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one contributor to invite.' });
    }

    const ttlDays = Number(process.env.INVITATION_TTL_DAYS || 7);

    const generated = await tx(async (client) => {
      const currentVersion = await repo.getCurrentVersion(song.id, client);
      if (!currentVersion) {
        throw Object.assign(new Error('No active rights record version.'), { statusCode: 400 });
      }

      const validation = await repo.getOwnershipValidation(currentVersion.id, client);
      if (!validation.canProceedToInvite) {
        throw Object.assign(
          new Error(
            'Composition and Master must each total exactly 100.00% before review links can be issued.',
          ),
          { statusCode: 400 },
        );
      }

      const out: Array<{
        invitationId: string;
        rawToken: string;
        reviewUrl: string;
        contributorName: string;
        email: string;
        expiresAt: string;
      }> = [];

      for (const contributorId of contributorIds) {
        const contributor = await repo.getContributor(contributorId, organisation.id, client);
        if (!contributor) continue;

        await repo.revokePendingInvitations(client, song.id, contributor.id);

        const rawToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

        const invitation = await repo.createInvitation(client, {
          songId: song.id,
          contributorId: contributor.id,
          versionId: currentVersion.id,
          tokenHash: repo.hashInvitationToken(rawToken),
          expiresAt,
          createdBy: user.id,
        });

        await repo.logAuditEvent(client, {
          organisationId: organisation.id,
          entityType: 'invitation',
          entityId: invitation.id,
          songId: song.id,
          actorType: 'user',
          actorId: user.id,
          actorName: user.fullName,
          eventType: 'CONTRIBUTOR_INVITED',
          metadata: {
            contributorName: contributor.fullName,
            email: contributor.email,
            version: currentVersion.versionNumber,
            expiresAt: expiresAt.toISOString(),
          },
        });

        out.push({
          invitationId: invitation.id,
          rawToken,
          reviewUrl: reviewUrlFor(rawToken),
          contributorName: contributor.fullName,
          email: contributor.email,
          expiresAt: expiresAt.toISOString(),
        });
      }

      await repo.updateSongFields(client, song.id, { status: 'proposed' });
      await repo.setVersionStatus(client, currentVersion.id, 'proposed');

      return out;
    });

    // Best-effort: a contributor without email delivery still has their raw
    // link in the response below, so a failed send here never blocks the request.
    for (const invitation of generated) {
      const { subject, html, text } = invitationEmail({
        contributorName: invitation.contributorName,
        songTitle: song.title,
        organisationName: organisation.name,
        reviewUrl: invitation.reviewUrl,
        expiresAt: invitation.expiresAt,
      });
      void sendEmail({ to: invitation.email, subject, html, text });
    }

    res.status(201).json({
      message: `Generated ${generated.length} review link${generated.length === 1 ? '' : 's'}.`,
      invitations: generated,
      notice:
        'Copy these links now. Ospreyn stores only a hash of each one and cannot show them again.',
    });
  }),
);

// ==========================================
// 8. CONTRIBUTOR REVIEW PORTAL (public, token-guarded)
// ==========================================

async function loadInvitationContext(rawToken: string) {
  if (!rawToken || rawToken.length < 32) {
    throw Object.assign(new Error('This invitation link is not valid.'), { statusCode: 400 });
  }
  const invitation = await repo.findInvitationByTokenHash(repo.hashInvitationToken(rawToken));
  if (!invitation) {
    throw Object.assign(new Error('This invitation link is not valid.'), { statusCode: 404 });
  }
  if (invitation.revokedAt) {
    throw Object.assign(
      new Error('This invitation was withdrawn. A newer link may have been sent to you.'),
      { statusCode: 410 },
    );
  }
  if (new Date() > new Date(invitation.expiresAt)) {
    throw Object.assign(new Error('This invitation link has expired. Ask for a new one.'), {
      statusCode: 410,
    });
  }

  const [song, version, contributor] = await Promise.all([
    repo.getSongById(invitation.songId),
    repo.getVersionById(invitation.versionId),
    repo.getContributor(invitation.contributorId),
  ]);

  if (!song || !version || !contributor) {
    throw Object.assign(new Error('This invitation points to a record that no longer exists.'), {
      statusCode: 410,
    });
  }

  return { invitation, song, version, contributor };
}

apiRouter.get(
  '/invitations/review/:rawToken',
  ah(async (req, res) => {
    const { invitation, song, version, contributor } = await loadInvitationContext(
      req.params.rawToken,
    );

    await repo.markInvitationViewed(invitation.id);

    const [allocations, songContributors, confirmations] = await Promise.all([
      repo.listAllocations(version.id),
      repo.listSongContributors(song.id),
      repo.listConfirmations(version.id),
    ]);

    const roles = songContributors
      .filter((sc) => sc.contributorId === contributor.id)
      .map((sc) => sc.customRoleTitle || sc.role);

    let yourCompBps = 0;
    let yourMasterBps = 0;

    const mapAlloc = (a: (typeof allocations)[number]) => {
      const isYou = a.contributorId === contributor.id;
      if (isYou && a.rightType === 'COMPOSITION') yourCompBps = a.basisPoints;
      if (isYou && a.rightType === 'MASTER') yourMasterBps = a.basisPoints;
      return {
        id: a.id,
        contributorId: a.contributorId,
        contributorName: a.contributor?.fullName || 'Contributor',
        contributor: {
          id: a.contributorId,
          fullName: a.contributor?.fullName || 'Contributor',
          professionalName: a.contributor?.professionalName || '',
        },
        role: isYou ? roles.join(', ') || 'Contributor' : 'Collaborator',
        rightType: a.rightType,
        basisPoints: a.basisPoints,
        percentage: Number((a.basisPoints / 100).toFixed(2)),
        isYou,
      };
    };

    const compositionAllocations = allocations
      .filter((a) => a.rightType === 'COMPOSITION')
      .map(mapAlloc);
    const masterAllocations = allocations.filter((a) => a.rightType === 'MASTER').map(mapAlloc);

    const agreementText = generateSplitSheetAgreementText({
      song,
      version,
      allocations,
      songContributors,
      confirmations,
    });

    const existingConfirmation = await repo.findConfirmation(version.id, contributor.id);

    res.json({
      invitation: {
        id: invitation.id,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        usedAt: invitation.usedAt,
      },
      contributor: {
        id: contributor.id,
        fullName: contributor.fullName,
        professionalName: contributor.professionalName,
        email: contributor.email,
        assignedRoles: roles,
      },
      song: {
        id: song.id,
        title: song.title,
        primaryArtist: song.primaryArtist,
        releaseDate: song.releaseDate,
        genre: song.genre,
        isrc: song.isrc,
      },
      version: {
        versionNumber: version.versionNumber,
        status: version.status,
        changeReason: version.changeReason,
      },
      yourProposedShares: {
        compositionBasisPoints: yourCompBps,
        compositionPercentage: Number((yourCompBps / 100).toFixed(2)),
        masterBasisPoints: yourMasterBps,
        masterPercentage: Number((yourMasterBps / 100).toFixed(2)),
      },
      myAllocations: { compositionBps: yourCompBps, masterBps: yourMasterBps },
      allAllocations: [...compositionAllocations, ...masterAllocations],
      compositionAllocations,
      masterAllocations,
      draftAgreement: {
        title: `Draft split sheet — ${song.title}`,
        documentContent: agreementText,
      },
      agreementDraft: agreementText,
      existingConfirmation,
    });
  }),
);

const respondToInvitation = ah(async (req: Request, res: Response) => {
  const rawToken = req.params.rawToken || req.body?.rawToken;
  const action = req.body?.action;
  const participantName = req.body?.participantName;
  const changeRequestComment = req.body?.changeRequestComment ?? req.body?.notes;

  if (!rawToken || !action) {
    return res.status(400).json({ error: 'Missing invitation token or action.' });
  }
  if (!['confirmed', 'change_requested'].includes(action)) {
    return res.status(400).json({ error: 'Action must be confirmed or change_requested.' });
  }
  if (
    action === 'change_requested' &&
    (!changeRequestComment || changeRequestComment.trim().length < 5)
  ) {
    return res.status(400).json({ error: 'Describe the change you are asking for.' });
  }

  const { invitation, song, version, contributor } = await loadInvitationContext(rawToken);

  if (invitation.usedAt) {
    return res.status(410).json({ error: 'You have already responded to this invitation.' });
  }

  const ip = clientIp(req);
  const userAgent = String(req.headers['user-agent'] || 'Web browser');

  const result = await tx(async (client) => {
    // Serialise responses so a double-submit cannot record twice.
    const locked = (
      await client.query(
        `SELECT used_at FROM invitations WHERE id = $1 FOR UPDATE`,
        [invitation.id],
      )
    ).rows[0];
    if (locked?.used_at) {
      throw Object.assign(new Error('You have already responded to this invitation.'), {
        statusCode: 410,
      });
    }

    const confirmation = await repo.recordConfirmation(client, {
      songId: song.id,
      versionId: version.id,
      agreementVersion: version.versionNumber,
      contributorId: contributor.id,
      action,
      participantName: participantName?.trim() || contributor.fullName,
      identityReference: contributor.email,
      changeRequestComment: changeRequestComment?.trim() || null,
      ipAddress: ip,
      userAgent,
    });

    await repo.markInvitationUsed(client, invitation.id, action);

    let songStatus: string;

    if (action === 'change_requested') {
      songStatus = 'change_requested';
      await repo.setVersionStatus(client, version.id, 'draft');
    } else {
      const validation = await repo.getOwnershipValidation(version.id, client);
      if (validation.canProceedToAgreement) {
        songStatus = 'confirmed';
        await repo.setVersionStatus(client, version.id, 'confirmed', new Date());

        const [allocations, songContributors, confirmations] = await Promise.all([
          repo.listAllocations(version.id, client),
          repo.listSongContributors(song.id, client),
          repo.listConfirmations(version.id, client),
        ]);

        await repo.createAgreement(client, {
          songId: song.id,
          versionId: version.id,
          agreementVersion: version.versionNumber,
          title: `Music Rights Split Agreement — ${song.title} (v${version.versionNumber})`,
          documentContent: generateSplitSheetAgreementText({
            song,
            version: { ...version, status: 'confirmed' },
            allocations,
            songContributors,
            confirmations,
          }),
          disclaimerText: DISCLAIMER_TEXT,
          status: 'fully_confirmed',
        });
      } else {
        songStatus = 'proposed';
      }
    }

    await repo.updateSongFields(client, song.id, { status: songStatus });

    await repo.logAuditEvent(client, {
      organisationId: song.organisationId,
      entityType: 'confirmation',
      entityId: confirmation.id,
      songId: song.id,
      actorType: 'contributor',
      actorId: contributor.id,
      actorName: contributor.fullName,
      eventType: action === 'confirmed' ? 'CONTRIBUTOR_CONFIRMED' : 'CHANGE_REQUESTED',
      metadata: {
        action,
        comment: changeRequestComment || null,
        version: version.versionNumber,
        ipAddress: ip,
      },
    });

    return { confirmation, songStatus };
  });

  // Best-effort notification to the workspace owner. Never blocks the
  // contributor's response, which has already been recorded above.
  repo
    .getOrganisationOwner(song.organisationId)
    .then((owner) => {
      if (!owner) return;
      const { subject, html, text } = confirmationNotificationEmail({
        ownerName: owner.fullName,
        contributorName: contributor.fullName,
        songTitle: song.title,
        action,
        comment: changeRequestComment?.trim() || null,
        songUrl: appUrlFor(`/songs/${song.id}`),
      });
      return sendEmail({ to: owner.email, subject, html, text });
    })
    .catch((err) => console.error('[ospreyn:email] owner notification failed:', err.message));

  res.json({ success: true, action, ...result });
});

apiRouter.post('/invitations/review/:rawToken/confirm', respondToInvitation);
apiRouter.post('/invitations/respond', respondToInvitation);

// ==========================================
// 9. AGREEMENTS
// ==========================================

const generateAgreement = ah(async (req: Request, res: Response) => {
  const { user, organisation } = req.auth!;
  const song = await repo.getSong(req.params.id, organisation.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const agreement = await tx(async (client) => {
    const currentVersion = await repo.getCurrentVersion(song.id, client);
    if (!currentVersion) {
      throw Object.assign(new Error('No rights record version available.'), { statusCode: 400 });
    }

    const [allocations, songContributors, confirmations] = await Promise.all([
      repo.listAllocations(currentVersion.id, client),
      repo.listSongContributors(song.id, client),
      repo.listConfirmations(currentVersion.id, client),
    ]);

    const created = await repo.createAgreement(client, {
      songId: song.id,
      versionId: currentVersion.id,
      agreementVersion: currentVersion.versionNumber,
      title: `Music Rights Split Agreement — ${song.title} (v${currentVersion.versionNumber})`,
      documentContent: generateSplitSheetAgreementText({
        song,
        version: currentVersion,
        allocations,
        songContributors,
        confirmations,
      }),
      disclaimerText: DISCLAIMER_TEXT,
      status: currentVersion.status === 'confirmed' ? 'fully_confirmed' : 'pending_confirmations',
    });

    if (currentVersion.status === 'confirmed') {
      await repo.updateSongFields(client, song.id, { status: 'completed' });
    }

    await repo.logAuditEvent(client, {
      organisationId: organisation.id,
      entityType: 'agreement',
      entityId: created.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'AGREEMENT_GENERATED',
      metadata: {
        agreementId: created.id,
        version: currentVersion.versionNumber,
        status: created.status,
      },
    });

    return created;
  });

  res.status(201).json(agreement);
});

apiRouter.post('/songs/:id/agreements', requireAuth, generateAgreement);
apiRouter.post('/songs/:id/agreements/generate', requireAuth, generateAgreement);

// ==========================================
// 10. DOCUMENT VAULT (private object storage)
// ==========================================

/** Lets the frontend show the operator which storage backend is active. */
apiRouter.get(
  '/storage/status',
  requireAuth,
  ah(async (_req, res) => {
    res.json({
      mode: storageMode,
      durable: storageMode === 'S3',
    });
  }),
);

/**
 * Step 1: reserve a document row and return a short-lived presigned PUT URL.
 * The browser uploads the bytes straight to object storage; they never pass
 * through this server.
 */
apiRouter.post(
  '/songs/:id/documents/upload-url',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const { fileName, mimeType, fileSize, category, checksumSha256 } = req.body || {};

    if (!fileName?.trim()) return res.status(400).json({ error: 'File name is required.' });
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return res
        .status(400)
        .json({ error: `Files of type ${mimeType || 'unknown'} are not accepted.` });
    }
    if (!Number.isFinite(Number(fileSize)) || Number(fileSize) <= 0) {
      return res.status(400).json({ error: 'A valid file size is required.' });
    }
    if (Number(fileSize) > MAX_UPLOAD_BYTES) {
      return res
        .status(413)
        .json({ error: `Files must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` });
    }

    const currentVersion = await repo.getCurrentVersion(song.id);
    const documentId = crypto.randomUUID();
    const storageKey = buildStorageKey({
      organisationId: organisation.id,
      songId: song.id,
      versionNumber: currentVersion?.versionNumber || 1,
      documentId,
      fileName: fileName.trim(),
    });

    await repo.createPendingDocument({
      id: documentId,
      songId: song.id,
      versionId: currentVersion?.id || null,
      storageKey,
      fileName: fileName.trim(),
      mimeType,
      fileSize: Number(fileSize),
      category: category || 'supporting_document',
      uploadedBy: user.id,
    });

    const uploadUrl = await createUploadUrl(
      storageKey,
      mimeType,
      checksumSha256 || undefined,
      requestOrigin(req),
    );

    res.status(201).json({
      documentId,
      uploadUrl,
      storageKey,
      requiredHeaders: {
        'Content-Type': mimeType,
        ...(checksumSha256 ? { 'x-amz-checksum-sha256': checksumSha256 } : {}),
      },
    });
  }),
);

/**
 * Step 2: confirm the object landed. The row only becomes visible in the vault
 * once storage reports the bytes are there, and the checksum recorded is the
 * digest of those bytes rather than of their metadata.
 */
apiRouter.post(
  '/songs/:id/documents/:documentId/complete',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const doc = await repo.getDocument(req.params.documentId, song.id);
    if (!doc) return res.status(404).json({ error: 'Document record not found.' });

    const head = await headObject(doc.storageKey);
    if (!head) {
      await repo.deleteDocumentRow(doc.id);
      return res
        .status(409)
        .json({ error: 'The upload did not complete. Nothing was stored; try again.' });
    }

    const checksum = base64ToHex(head.checksumSha256Base64) || req.body?.checksumSha256Hex || null;
    const stored = await repo.markDocumentStored(doc.id, head.size, checksum);

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'document',
      entityId: doc.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'DOCUMENT_UPLOADED',
      metadata: {
        fileName: doc.fileName,
        storageKey: doc.storageKey,
        fileSize: head.size,
        checksum,
      },
    });

    res.status(201).json(stored);
  }),
);

/** Step 3: issue a short-lived presigned GET URL. The bucket stays private. */
apiRouter.get(
  '/songs/:id/documents/:documentId/download',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const doc = await repo.getDocument(req.params.documentId, song.id);
    if (!doc || doc.uploadStatus !== 'stored') {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const url = await createDownloadUrl(doc.storageKey, doc.fileName, requestOrigin(req));

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'document',
      entityId: doc.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'DOCUMENT_ACCESSED',
      metadata: { fileName: doc.fileName },
    });

    res.json({ url, expiresInSeconds: Number(process.env.S3_DOWNLOAD_URL_TTL || 300) });
  }),
);

apiRouter.delete(
  '/songs/:id/documents/:documentId',
  requireAuth,
  requireRole('owner', 'admin'),
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const doc = await repo.getDocument(req.params.documentId, song.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    await deleteObject(doc.storageKey).catch(() => undefined);
    await repo.deleteDocumentRow(doc.id);

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'document',
      entityId: doc.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'DOCUMENT_DELETED',
      metadata: { fileName: doc.fileName, storageKey: doc.storageKey },
    });

    res.json({ success: true });
  }),
);

// ==========================================
// 11. AUDIT LEDGER
// ==========================================

apiRouter.get(
  '/songs/:id/audit',
  requireAuth,
  ah(async (req, res) => {
    const song = await repo.getSong(req.params.id, req.auth!.organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });
    res.json(await repo.listSongAudit(song.id));
  }),
);

apiRouter.get(
  '/audit',
  requireAuth,
  ah(async (req, res) => {
    res.json(await repo.listOrgAudit(req.auth!.organisation.id));
  }),
);

// ==========================================
// 12. EVIDENCE EXPORT
// ==========================================

apiRouter.get(
  '/songs/:id/export',
  requireAuth,
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const song = await repo.getSong(req.params.id, organisation.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });

    const currentVersion = await repo.getCurrentVersion(song.id);

    const [allocations, confirmations, agreements, documents, auditTrail] = await Promise.all([
      currentVersion ? repo.listAllocations(currentVersion.id) : Promise.resolve([]),
      currentVersion ? repo.listConfirmations(currentVersion.id) : Promise.resolve([]),
      repo.listAgreements(song.id),
      repo.listDocuments(song.id),
      repo.listSongAudit(song.id),
    ]);

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'song',
      entityId: song.id,
      songId: song.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'RIGHTS_RECORD_EXPORTED',
      metadata: { version: currentVersion?.versionNumber, format: 'EVIDENCE_PACKAGE_JSON' },
    });

    res.json({
      ospreynEvidencePackageVersion: '1.2',
      exportTimestamp: new Date().toISOString(),
      recordIdentifier: `OSPREYN-EVIDENCE-${song.id.slice(0, 8).toUpperCase()}`,
      song: {
        id: song.id,
        title: song.title,
        primaryArtist: song.primaryArtist,
        releaseDate: song.releaseDate,
        genre: song.genre,
        isrc: song.isrc,
        catalogueReference: song.catalogueReference,
        status: song.status,
        version: currentVersion?.versionNumber,
      },
      ownershipSplits: allocations.map((a) => ({
        contributorName: a.contributor?.fullName,
        email: a.contributor?.email,
        rightType: a.rightType,
        basisPoints: a.basisPoints,
        percentage: `${(a.basisPoints / 100).toFixed(2)}%`,
      })),
      confirmationsRecord: confirmations.map((c) => ({
        participantName: c.participantName,
        identityReference: c.identityReference,
        action: c.action,
        confirmedAt: c.timestamp,
        ipAddress: c.ipAddress,
        confirmationStatement: c.confirmationStatement,
        changeRequestComment: c.changeRequestComment,
      })),
      agreements: agreements.map((a) => ({
        id: a.id,
        title: a.title,
        version: a.agreementVersion,
        status: a.status,
        generatedAt: a.generatedAt,
        content: a.documentContent,
      })),
      documentVault: documents.map((d) => ({
        fileName: d.fileName,
        storageKey: d.storageKey,
        fileSize: d.fileSize,
        checksumSha256: d.checksum,
        category: d.category,
        createdAt: d.createdAt,
      })),
      auditLedger: auditTrail,
      legalNotice: DISCLAIMER_TEXT,
    });
  }),
);

// ==========================================
// Error handling
// ==========================================

apiRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.statusCode || 500;
  if (status >= 500) console.error('[api]', err);

  const payload: Record<string, unknown> = {
    error: status >= 500 ? 'Something went wrong on our side.' : err.message,
  };
  if (err?.requiresVersionBump) payload.requiresVersionBump = true;
  res.status(status).json(payload);
});
