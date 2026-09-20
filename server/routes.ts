/**
 * Ospreyn REST API Router
 * Implements strict MVP endpoints:
 * Create -> Define Ownership -> Invite -> Confirm -> Preserve Evidence -> Export
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './store';
import { emailService } from './email';
import {
  Song,
  Contributor,
  RightsRecordVersion,
  DocumentRecord,
  Agreement,
} from '../src/types';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

export const apiRouter = express.Router();

// Helper to get active user & org from request
function getContext(req: Request) {
  // In single-tenant/demo context, default to Hloni Mokoena and Soweto Soundworks
  const userId = (req.headers['x-user-id'] as string) || 'u-hloni-1001';
  const orgId = (req.headers['x-org-id'] as string) || 'org-soweto-2001';
  const user = db.users.get(userId);
  const org = db.organisations.get(orgId);
  return { user, org, userId, orgId };
}

// ==========================================
// 1. AUTH & WORKSPACE
// ==========================================

// Composite endpoint for fast app hydration
apiRouter.get('/me', (req: Request, res: Response) => {
  const { user, org, orgId } = getContext(req);
  const songs = Array.from(db.songs.values())
    .filter((s) => s.organisationId === orgId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let completedCount = 0;
  let needsAttentionCount = 0;
  let awaitingConfirmationCount = 0;
  for (const s of songs) {
    if (s.status === 'completed') completedCount++;
    else if (s.status === 'confirmed' || s.status === 'proposed') awaitingConfirmationCount++;
    else needsAttentionCount++;
  }

  const recentActivity = Array.from(db.auditEvents.values())
    .filter((e) => e.organisationId === orgId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 15);

  res.json({
    user,
    organisation: org,
    songs,
    metrics: {
      totalSongs: songs.length,
      completedCount,
      needsAttentionCount,
      awaitingConfirmationCount,
      recentActivity,
    },
  });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const { user, org } = getContext(req);
  res.json({
    user,
    currentOrganisation: org,
    organisations: Array.from(db.organisations.values()),
  });
});

apiRouter.post('/auth/switch-org', (req: Request, res: Response) => {
  const { orgId } = req.body;
  const org = db.organisations.get(orgId);
  if (!org) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ currentOrganisation: org });
});

// ==========================================
// 2. DASHBOARD
// ==========================================

apiRouter.get('/dashboard/metrics', (req: Request, res: Response) => {
  const { orgId } = getContext(req);
  const songs = Array.from(db.songs.values()).filter((s) => s.organisationId === orgId);

  let completedCount = 0;
  let needsAttentionCount = 0;
  let awaitingConfirmationCount = 0;

  for (const song of songs) {
    if (song.status === 'completed' || song.status === 'confirmed') {
      completedCount++;
    } else if (song.status === 'proposed') {
      awaitingConfirmationCount++;
    } else {
      needsAttentionCount++;
    }
  }

  // Recent audit activity
  const recentActivity = db.auditEvents
    .filter((e) => e.organisationId === orgId)
    .slice(0, 8);

  res.json({
    totalSongs: songs.length,
    completedCount,
    needsAttentionCount,
    awaitingConfirmationCount,
    recentSongs: songs.slice(0, 6),
    recentActivity,
  });
});

// ==========================================
// 3. SONGS (RIGHTS RECORDS)
// ==========================================

apiRouter.get('/songs', (req: Request, res: Response) => {
  const { orgId } = getContext(req);
  const songs = Array.from(db.songs.values())
    .filter((s) => s.organisationId === orgId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json(songs);
});

apiRouter.post('/songs', (req: Request, res: Response) => {
  const { user, orgId, userId } = getContext(req);
  const { title, primaryArtist, releaseDate, genre, isrc, catalogueReference, notes } = req.body;

  if (!title || !primaryArtist) {
    return res.status(400).json({ error: 'Song title and primary artist are required.' });
  }

  const songId = crypto.randomUUID();
  const newSong: Song = {
    id: songId,
    organisationId: orgId,
    title: title.trim(),
    primaryArtist: primaryArtist.trim(),
    releaseDate: releaseDate || undefined,
    genre: genre || undefined,
    isrc: isrc || undefined,
    catalogueReference: catalogueReference || undefined,
    notes: notes || undefined,
    status: 'draft',
    currentVersionNumber: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.songs.set(newSong.id, newSong);

  // Automatically create Version 1
  const versionId = crypto.randomUUID();
  const v1: RightsRecordVersion = {
    id: versionId,
    songId: newSong.id,
    versionNumber: 1,
    status: 'draft',
    createdBy: userId,
    createdAt: new Date().toISOString(),
  };
  db.rightsRecordVersions.set(v1.id, v1);

  // Automatically associate creator as artist/producer contributor
  const creatorContributor = Array.from(db.contributors.values()).find((c) => c.email === user?.email);
  if (creatorContributor) {
    db.addSongContributor(newSong.id, creatorContributor.id, 'artist');
  }

  // Audit log
  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'song',
    entityId: newSong.id,
    songId: newSong.id,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'SONG_CREATED',
    metadata: { title: newSong.title, primaryArtist: newSong.primaryArtist },
  });

  res.status(201).json(newSong);
});

apiRouter.get('/songs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const song = db.songs.get(id);
  if (!song) return res.status(404).json({ error: 'Rights record not found.' });

  // Current version
  const versions = Array.from(db.rightsRecordVersions.values())
    .filter((v) => v.songId === id)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const currentVersion = versions[versions.length - 1];

  // Song contributors with profile details
  const songContributors = Array.from(db.songContributors.values())
    .filter((sc) => sc.songId === id)
    .map((sc) => ({
      ...sc,
      contributor: db.contributors.get(sc.contributorId),
    }));

  // Ownership allocations for current version
  const allocations = Array.from(db.ownershipAllocations.values())
    .filter((a) => a.versionId === currentVersion?.id)
    .map((a) => ({
      ...a,
      contributor: db.contributors.get(a.contributorId),
    }));

  // Validation
  const validation = currentVersion ? db.getOwnershipValidation(currentVersion.id) : null;

  // Confirmations
  const confirmations = Array.from(db.contributorConfirmations.values())
    .filter((c) => c.versionId === currentVersion?.id)
    .map((c) => ({
      ...c,
      contributor: db.contributors.get(c.contributorId),
    }));

  // Invitations
  const invitations = Array.from(db.invitations.values())
    .filter((inv) => inv.songId === id && inv.versionId === currentVersion?.id)
    .map((inv) => ({
      ...inv,
      contributor: db.contributors.get(inv.contributorId),
    }));

  // Agreements
  const agreements = Array.from(db.agreements.values()).filter((a) => a.songId === id);

  // Documents
  const documents = Array.from(db.documents.values()).filter((d) => d.songId === id);

  // Audit
  const audit = db.auditEvents
    .filter((e) => e.songId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    song,
    versions,
    currentVersion,
    songContributors,
    allocations,
    validation,
    confirmations,
    invitations,
    agreements,
    documents,
    audit,
  });
});

apiRouter.patch('/songs/:id', (req: Request, res: Response) => {
  return handleUpdateSong(req, res);
});

apiRouter.put('/songs/:id', (req: Request, res: Response) => {
  return handleUpdateSong(req, res);
});

function handleUpdateSong(req: Request, res: Response) {
  const { id } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const { title, primaryArtist, releaseDate, genre, isrc, catalogueReference, notes } = req.body;
  if (title) song.title = title.trim();
  if (primaryArtist) song.primaryArtist = primaryArtist.trim();
  if (releaseDate !== undefined) song.releaseDate = releaseDate;
  if (genre !== undefined) song.genre = genre;
  if (isrc !== undefined) song.isrc = isrc;
  if (catalogueReference !== undefined) song.catalogueReference = catalogueReference;
  if (notes !== undefined) song.notes = notes;
  song.updatedAt = new Date().toISOString();

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'song',
    entityId: song.id,
    songId: song.id,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'SONG_METADATA_UPDATED',
    metadata: { title: song.title, isrc: song.isrc },
  });

  res.json(song);
}

// ==========================================
// 4. CONTRIBUTORS MANAGEMENT
// ==========================================

apiRouter.get('/contributors', (req: Request, res: Response) => {
  const { orgId } = getContext(req);
  const list = Array.from(db.contributors.values()).filter((c) => c.organisationId === orgId);
  res.json(list);
});

apiRouter.post('/songs/:id/contributors', (req: Request, res: Response) => {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const { fullName, professionalName, email, phone, role, customRoleTitle, existingContributorId } = req.body;

  let contributorId = existingContributorId;
  let contributor: Contributor | undefined;

  if (contributorId) {
    contributor = db.contributors.get(contributorId);
    if (!contributor) return res.status(404).json({ error: 'Selected contributor not found.' });
  } else {
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email are required to add a contributor.' });
    }
    // Check if contributor exists with same email
    const existing = Array.from(db.contributors.values()).find(
      (c) => c.organisationId === orgId && c.email.toLowerCase() === email.toLowerCase().trim()
    );
    if (existing) {
      contributor = existing;
      contributorId = existing.id;
    } else {
      contributorId = crypto.randomUUID();
      contributor = {
        id: contributorId,
        organisationId: orgId,
        fullName: fullName.trim(),
        professionalName: professionalName ? professionalName.trim() : undefined,
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.contributors.set(contributor.id, contributor);
    }
  }

  // Add relationship to song_contributors
  const sc = db.addSongContributor(songId, contributorId, role || 'other', customRoleTitle);

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'song',
    entityId: songId,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'CONTRIBUTOR_ADDED',
    metadata: {
      contributorName: contributor?.fullName,
      role: sc.role,
    },
  });

  res.status(201).json({ songContributor: sc, contributor });
});

apiRouter.delete('/songs/:id/contributors/:songContributorId', (req: Request, res: Response) => {
  const { id: songId, songContributorId } = req.params;
  const { user, orgId, userId } = getContext(req);

  const sc = db.songContributors.get(songContributorId);
  if (!sc || sc.songId !== songId) {
    return res.status(404).json({ error: 'Song contributor relationship not found.' });
  }

  const contributor = db.contributors.get(sc.contributorId);
  db.songContributors.delete(songContributorId);

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'song',
    entityId: songId,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'CONTRIBUTOR_REMOVED',
    metadata: { contributorName: contributor?.fullName, role: sc.role },
  });

  res.json({ success: true });
});

// ==========================================
// 5. OWNERSHIP ALLOCATIONS (BASIS POINTS 10,000 = 100%)
// Single Source of Truth
// ==========================================

apiRouter.post('/songs/:id/ownership', (req: Request, res: Response) => {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  // Get current version
  const versions = Array.from(db.rightsRecordVersions.values())
    .filter((v) => v.songId === songId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const currentVersion = versions[versions.length - 1];
  if (!currentVersion) return res.status(400).json({ error: 'No active rights record version.' });

  // If the record was already confirmed or completed, block silent edits!
  if (currentVersion.status === 'confirmed') {
    return res.status(409).json({
      error: 'Confirmed rights records cannot be edited in place. You must bump the version to propose new rights.',
      requiresVersionBump: true,
    });
  }

  const { allocations } = req.body;
  // allocations: Array<{ contributorId: string, rightType: 'COMPOSITION' | 'MASTER', basisPoints: number }>

  if (!Array.isArray(allocations)) {
    return res.status(400).json({ error: 'Invalid allocations array.' });
  }

  // Update allocations
  for (const item of allocations) {
    if (item.basisPoints < 0 || item.basisPoints > 10000) {
      return res.status(400).json({ error: 'Basis points must be between 0 and 10,000 (0.00% to 100.00%).' });
    }
    db.setOwnership(currentVersion.id, songId, item.contributorId, item.rightType, Number(item.basisPoints));
  }

  const validation = db.getOwnershipValidation(currentVersion.id);

  // Update song status based on completeness
  if (validation.isCompositionComplete && validation.isMasterComplete) {
    if (song.status === 'draft') {
      song.status = 'proposed';
      currentVersion.status = 'proposed';
    }
  } else {
    song.status = 'draft';
    currentVersion.status = 'draft';
  }
  song.updatedAt = new Date().toISOString();

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'ownership',
    entityId: currentVersion.id,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'OWNERSHIP_UPDATED',
    metadata: {
      version: currentVersion.versionNumber,
      compositionBps: validation.compositionBasisPoints,
      masterBps: validation.masterBasisPoints,
      isComplete: validation.canProceedToInvite,
    },
  });

  res.json({
    version: currentVersion,
    validation,
    allocations: Array.from(db.ownershipAllocations.values()).filter((a) => a.versionId === currentVersion.id),
  });
});

// ==========================================
// 6. VERSION CONTROL (BUMP VERSION)
// ==========================================

apiRouter.post('/songs/:id/bump-version', (req: Request, res: Response) => {
  return handleBumpVersion(req, res);
});

apiRouter.post('/songs/:id/versions/bump', (req: Request, res: Response) => {
  return handleBumpVersion(req, res);
});

function handleBumpVersion(req: Request, res: Response) {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const { changeReason } = req.body;

  if (!changeReason || changeReason.trim().length < 5) {
    return res.status(400).json({ error: 'A valid change reason (minimum 5 characters) is required to bump rights version.' });
  }

  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const versions = Array.from(db.rightsRecordVersions.values())
    .filter((v) => v.songId === songId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const oldVersion = versions[versions.length - 1];

  const newVersionNumber = (oldVersion?.versionNumber || 0) + 1;
  const newVersionId = crypto.randomUUID();

  // Mark old version superseded if it was confirmed
  if (oldVersion) {
    oldVersion.status = 'superseded';
  }

  const newVersion: RightsRecordVersion = {
    id: newVersionId,
    songId,
    versionNumber: newVersionNumber,
    status: 'draft',
    changeReason: changeReason.trim(),
    createdBy: userId,
    createdAt: new Date().toISOString(),
  };
  db.rightsRecordVersions.set(newVersion.id, newVersion);

  // Clone ownership allocations from previous version into new version as the starting point
  if (oldVersion) {
    for (const alloc of db.ownershipAllocations.values()) {
      if (alloc.versionId === oldVersion.id) {
        db.setOwnership(newVersion.id, songId, alloc.contributorId, alloc.rightType, alloc.basisPoints);
      }
    }
  }

  song.currentVersionNumber = newVersionNumber;
  song.status = 'draft';
  song.updatedAt = new Date().toISOString();

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'ownership',
    entityId: newVersion.id,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'RIGHTS_VERSION_BUMPED',
    metadata: {
      fromVersion: oldVersion?.versionNumber,
      toVersion: newVersionNumber,
      changeReason: changeReason.trim(),
    },
  });

  res.status(201).json({
    newVersion,
    song,
  });
}

// ==========================================
// 7. INVITATIONS (CRYPTOGRAPHIC SHA-256 HASH LIFECYCLE)
// Separate invitations table
// ==========================================

apiRouter.post('/songs/:id/invitations', (req: Request, res: Response) => {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const versions = Array.from(db.rightsRecordVersions.values())
    .filter((v) => v.songId === songId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const currentVersion = versions[versions.length - 1];
  if (!currentVersion) return res.status(400).json({ error: 'No active rights record version.' });

  const validation = db.getOwnershipValidation(currentVersion.id);
  if (!validation.canProceedToInvite) {
    return res.status(400).json({
      error: 'Ownership allocations must total exactly 100.00% (10,000 basis points) for both Composition and Master before invitations can be dispatched.',
    });
  }

  const { contributorIds } = req.body;
  if (!Array.isArray(contributorIds) || contributorIds.length === 0) {
    return res.status(400).json({ error: 'Please select at least one contributor to invite.' });
  }

  const generatedInvitations: Array<{
    invitation: any;
    rawToken: string;
    reviewUrl: string;
    contributorName: string;
    email: string;
  }> = [];

  for (const cid of contributorIds) {
    const contributor = db.contributors.get(cid);
    if (!contributor) continue;

    // Revoke any previous active invitations for this contributor on this song version
    for (const existingInv of db.invitations.values()) {
      if (existingInv.songId === songId && existingInv.contributorId === cid && existingInv.status === 'pending') {
        existingInv.status = 'revoked';
        existingInv.revokedAt = new Date().toISOString();
      }
    }

    // Generate 32-byte cryptographically secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Compute SHA-256 hash to store in DB
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const invId = crypto.randomUUID();
    const inv = {
      id: invId,
      songId,
      contributorId: cid,
      versionId: currentVersion.id,
      tokenHash,
      status: 'pending' as const,
      invitedAt: new Date().toISOString(),
      expiresAt,
      createdBy: userId,
      rawToken, // temporarily attached for response
    };
    db.invitations.set(invId, inv);

    // Audit log for this invitation
    db.logAuditEvent({
      organisationId: orgId,
      entityType: 'invitation',
      entityId: invId,
      songId,
      actorType: 'user',
      actorId: userId,
      actorName: user?.fullName || 'User',
      eventType: 'CONTRIBUTOR_INVITED',
      metadata: {
        contributorName: contributor.fullName,
        email: contributor.email,
        version: currentVersion.versionNumber,
        expiresAt,
      },
    });

    generatedInvitations.push({
      invitation: inv,
      rawToken,
      reviewUrl: `/review/${rawToken}`,
      contributorName: contributor.fullName,
      email: contributor.email,
    });

    // Wire up transactional email send to the invited contributor
    emailService.sendContributorInvitation({
      to: contributor.email,
      contributorName: contributor.fullName,
      songTitle: song.title,
      primaryArtist: song.primaryArtist,
      reviewUrl: `/review/${rawToken}`,
      expiresAt,
      ownerName: user?.fullName || 'the song rights owner',
    }).catch((err) => {
      console.error(`[EmailService] Failed to dispatch invitation email to ${contributor.email}:`, err);
    });
  }

  // Update song status to proposed
  song.status = 'proposed';
  currentVersion.status = 'proposed';
  song.updatedAt = new Date().toISOString();

  res.status(201).json({
    message: `Generated ${generatedInvitations.length} invitation link(s).`,
    invitations: generatedInvitations,
  });
});

// ==========================================
// 8. CONTRIBUTOR REVIEW PORTAL (TOKEN-GUARDED PUBLIC ENDPOINTS)
// ==========================================

apiRouter.get('/invitations/review/:rawToken', (req: Request, res: Response) => {
  const { rawToken } = req.params;
  if (!rawToken || rawToken.length < 16) {
    return res.status(400).json({ error: 'Invalid invitation token format.' });
  }

  // Hash incoming raw token to look up in DB
  const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const invitation = Array.from(db.invitations.values()).find((i) => i.tokenHash === incomingHash);
  if (!invitation) {
    return res.status(404).json({ error: 'Invitation link is invalid or does not exist.' });
  }

  if (invitation.revokedAt) {
    return res.status(410).json({ error: 'This invitation has been revoked by the record owner. A newer invitation may have been issued.' });
  }
  if (new Date() > new Date(invitation.expiresAt)) {
    return res.status(410).json({ error: 'This invitation link has expired. Please request a new invitation link.' });
  }

  // Mark viewed if pending
  if (invitation.status === 'pending') {
    invitation.status = 'viewed';
  }

  const song = db.songs.get(invitation.songId);
  const version = db.rightsRecordVersions.get(invitation.versionId);
  const contributor = db.contributors.get(invitation.contributorId);

  if (!song || !version || !contributor) {
    return res.status(500).json({ error: 'Corrupted invitation record reference.' });
  }

  // Gather allocations for this contributor and overall
  const compAllocations: Array<{ contributorName: string; role: string; basisPoints: number; percentage: number; isYou: boolean }> = [];
  const masterAllocations: Array<{ contributorName: string; role: string; basisPoints: number; percentage: number; isYou: boolean }> = [];

  // Get contributor roles on this song
  const roles: string[] = [];
  for (const sc of db.songContributors.values()) {
    if (sc.songId === song.id && sc.contributorId === contributor.id) {
      roles.push(sc.customRoleTitle || sc.role);
    }
  }

  let yourCompBps = 0;
  let yourMasterBps = 0;

  for (const alloc of db.ownershipAllocations.values()) {
    if (alloc.versionId === version.id) {
      const c = db.contributors.get(alloc.contributorId);
      const isYou = alloc.contributorId === contributor.id;
      const entry = {
        id: alloc.id,
        contributorId: alloc.contributorId,
        contributorName: c?.fullName || 'Contributor',
        contributor: {
          id: c?.id || alloc.contributorId,
          fullName: c?.fullName || 'Contributor',
          professionalName: c?.professionalName || '',
        },
        role: isYou ? roles.join(', ') : 'Collaborator',
        rightType: alloc.rightType,
        basisPoints: alloc.basisPoints,
        percentage: Number((alloc.basisPoints / 100).toFixed(2)),
        isYou,
      };

      if (alloc.rightType === 'COMPOSITION') {
        compAllocations.push(entry);
        if (isYou) yourCompBps = alloc.basisPoints;
      } else if (alloc.rightType === 'MASTER') {
        masterAllocations.push(entry);
        if (isYou) yourMasterBps = alloc.basisPoints;
      }
    }
  }

  // Check if this contributor has already confirmed or requested changes for this version
  const existingConfirmation = Array.from(db.contributorConfirmations.values()).find(
    (c) => c.versionId === version.id && c.contributorId === contributor.id
  );

  const agreementText = db.generateSplitSheetAgreementText(song, version);

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
    myAllocations: {
      compositionBps: yourCompBps,
      masterBps: yourMasterBps,
    },
    allAllocations: [
      ...compAllocations.map((c: any) => ({ ...c, rightType: 'COMPOSITION' })),
      ...masterAllocations.map((m: any) => ({ ...m, rightType: 'MASTER' })),
    ],
    draftAgreement: {
      title: `Draft Split Sheet — ${song.title}`,
      documentContent: agreementText,
    },
    compositionAllocations: compAllocations,
    masterAllocations: masterAllocations,
    agreementDraft: agreementText,
    existingConfirmation,
  });
});

// Alias for direct confirmation from review portal
apiRouter.post('/invitations/review/:rawToken/confirm', (req: Request, res: Response) => {
  const { rawToken } = req.params;
  const { action, notes } = req.body;
  req.body.rawToken = rawToken;
  req.body.changeRequestComment = notes;
  // Delegate to standard respond handler
  return handleInvitationRespond(req, res);
});

apiRouter.post('/invitations/respond', (req: Request, res: Response) => {
  return handleInvitationRespond(req, res);
});

function handleInvitationRespond(req: Request, res: Response) {
  const { rawToken, action, participantName, changeRequestComment } = req.body;
  // action: 'confirmed' | 'change_requested'

  if (!rawToken || !action) {
    return res.status(400).json({ error: 'Missing token or action.' });
  }
  if (!['confirmed', 'change_requested'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be confirmed or change_requested.' });
  }

  const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const invitation = Array.from(db.invitations.values()).find((i) => i.tokenHash === incomingHash);
  if (!invitation) return res.status(404).json({ error: 'Invitation not found or invalid.' });

  if (invitation.revokedAt) return res.status(410).json({ error: 'Invitation was revoked.' });
  if (invitation.usedAt) return res.status(410).json({ error: 'This invitation has already been used.' });
  if (new Date() > new Date(invitation.expiresAt)) return res.status(410).json({ error: 'Invitation expired.' });

  const song = db.songs.get(invitation.songId);
  const version = db.rightsRecordVersions.get(invitation.versionId);
  const contributor = db.contributors.get(invitation.contributorId);

  if (!song || !version || !contributor) {
    return res.status(500).json({ error: 'Invalid record associations.' });
  }

  if (action === 'change_requested' && (!changeRequestComment || changeRequestComment.trim().length < 5)) {
    return res.status(400).json({ error: 'Please provide a clear description of the change you are requesting.' });
  }

  // Record confirmation event
  const confirmation = db.recordConfirmation({
    songId: song.id,
    versionId: version.id,
    agreementVersion: version.versionNumber,
    contributorId: contributor.id,
    action,
    participantName: participantName ? participantName.trim() : contributor.fullName,
    identityReference: contributor.email,
    changeRequestComment: changeRequestComment ? changeRequestComment.trim() : undefined,
    ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'Web Browser',
  });

  // Mark invitation used
  invitation.status = action;
  invitation.usedAt = new Date().toISOString();

  // Update song status
  if (action === 'change_requested') {
    song.status = 'change_requested';
    version.status = 'draft';
  } else {
    // Check if ALL contributors with allocations on this version have confirmed
    const validation = db.getOwnershipValidation(version.id);
    if (validation.canProceedToAgreement) {
      song.status = 'confirmed';
      version.status = 'confirmed';
      version.confirmedAt = new Date().toISOString();

      // Automatically compile finalized agreement
      const agreementContent = db.generateSplitSheetAgreementText(song, version);
      const agrId = crypto.randomUUID();
      const agr: Agreement = {
        id: agrId,
        songId: song.id,
        versionId: version.id,
        agreementVersion: version.versionNumber,
        agreementType: 'split_sheet',
        title: `Music Rights Split Agreement — ${song.title} (v${version.versionNumber})`,
        documentContent: agreementContent,
        disclaimerText: 'Notice: Ospreyn provides independent rights-documentation and workflow infrastructure. It does not provide legal advice or make claims regarding the legal enforceability of private confirmations. Agreement terms and confirmation mechanisms should be reviewed by qualified South African legal counsel before formal execution.',
        status: 'fully_confirmed',
        generatedAt: new Date().toISOString(),
      };
      db.agreements.set(agr.id, agr);
    }
  }
  song.updatedAt = new Date().toISOString();

  // Log audit event with organisationId + entityType + entityId
  db.logAuditEvent({
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
      comment: changeRequestComment,
      version: version.versionNumber,
      ipAddress: confirmation.ipAddress,
    },
  });

  // Notify the song rights owner via transactional email
  const ownerUser = Array.from(db.users.values()).find((u) => u.id === song.organisationId || u.email) || Array.from(db.users.values())[0];
  const ownerEmail = ownerUser?.email || 'owner@ospreyn.com';
  emailService.sendOwnerConfirmationNotification({
    to: ownerEmail,
    ownerName: ownerUser?.fullName || 'Rights Owner',
    contributorName: contributor.fullName,
    songTitle: song.title,
    action,
    versionNumber: version.versionNumber,
    comment: changeRequestComment,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
  }).catch((err) => {
    console.error(`[EmailService] Failed to send owner confirmation notification to ${ownerEmail}:`, err);
  });

  res.json({
    success: true,
    action,
    confirmation,
    songStatus: song.status,
  });
}

// ==========================================
// 9. AGREEMENTS & EVIDENCE EXPORT
// ==========================================

apiRouter.post('/songs/:id/agreements', (req: Request, res: Response) => {
  return handleGenerateAgreement(req, res);
});

apiRouter.post('/songs/:id/agreements/generate', (req: Request, res: Response) => {
  return handleGenerateAgreement(req, res);
});

function handleGenerateAgreement(req: Request, res: Response) {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const versions = Array.from(db.rightsRecordVersions.values())
    .filter((v) => v.songId === songId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const currentVersion = versions[versions.length - 1];
  if (!currentVersion) return res.status(400).json({ error: 'No version available.' });

  const text = db.generateSplitSheetAgreementText(song, currentVersion);
  const agrId = crypto.randomUUID();
  const agreement: Agreement = {
    id: agrId,
    songId,
    versionId: currentVersion.id,
    agreementVersion: currentVersion.versionNumber,
    agreementType: 'split_sheet',
    title: `Music Rights Split Agreement — ${song.title} (v${currentVersion.versionNumber})`,
    documentContent: text,
    disclaimerText: 'Notice: Ospreyn provides independent rights-documentation and workflow infrastructure. It does not provide legal advice or make claims regarding the legal enforceability of private confirmations. Agreement terms and confirmation mechanisms should be reviewed by qualified South African legal counsel before formal execution.',
    status: currentVersion.status === 'confirmed' ? 'fully_confirmed' : 'pending_confirmations',
    generatedAt: new Date().toISOString(),
  };
  db.agreements.set(agreement.id, agreement);

  // Mark record as completed if confirmed
  if (currentVersion.status === 'confirmed') {
    song.status = 'completed';
    song.updatedAt = new Date().toISOString();
  }

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'agreement',
    entityId: agreement.id,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'AGREEMENT_GENERATED',
    metadata: {
      agreementId: agreement.id,
      version: currentVersion.versionNumber,
      status: agreement.status,
    },
  });

  res.status(201).json(agreement);
}

// ==========================================
// 10. DOCUMENT VAULT (PRIVATE OBJECT STORAGE METADATA & STREAMING)
// ==========================================

apiRouter.post('/songs/:id/documents', (req: Request, res: Response) => {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const { fileName, category, fileSize, mimeType, versionId, fileData } = req.body;
  if (!fileName) return res.status(400).json({ error: 'File name is required.' });

  const docId = crypto.randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `org_${orgId}/song_${songId}/v${song.currentVersionNumber}/${docId}_${safeName}`;
  
  let actualSize = fileSize || 245000;
  let checksum = crypto.createHash('sha256').update(docId + fileName + Date.now()).digest('hex');

  // If client provided actual file content (base64)
  if (fileData && typeof fileData === 'string') {
    try {
      const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      actualSize = buffer.length;
      checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      
      const targetFilePath = path.join(UPLOAD_DIR, `${docId}_${safeName}`);
      fs.writeFileSync(targetFilePath, buffer);
    } catch (e) {
      console.warn('[DocumentVault] Could not write file to local disk, continuing with metadata:', e);
    }
  }

  const document: DocumentRecord = {
    id: docId,
    songId,
    versionId: versionId || undefined,
    storageKey,
    fileName,
    mimeType: mimeType || 'application/pdf',
    fileSize: actualSize,
    checksum,
    category: category || 'supporting_document',
    uploadedBy: userId,
    createdAt: new Date().toISOString(),
  };
  db.documents.set(document.id, document);

  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'document',
    entityId: document.id,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'DOCUMENT_UPLOADED',
    metadata: {
      fileName: document.fileName,
      storageKey: document.storageKey,
      checksum: document.checksum,
    },
  });

  res.status(201).json(document);
});

// Download a document from the vault
apiRouter.get('/songs/:id/documents/:docId/download', (req: Request, res: Response) => {
  const { id: songId, docId } = req.params;
  const doc = db.documents.get(docId);
  if (!doc || doc.songId !== songId) {
    return res.status(404).json({ error: 'Document not found in vault.' });
  }

  const safeName = doc.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(UPLOAD_DIR, `${doc.id}_${safeName}`);

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');

  if (fs.existsSync(filePath)) {
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback for initial demo items or when file was registered without binary data
  const fallbackPdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length 120>>stream\nBT /F1 14 Tf 50 780 Td (OSPREYN CERTIFIED VAULT RECORD) Tj /F1 10 Tf 50 750 Td (File: ${doc.fileName}) Tj /F1 9 Tf 50 730 Td (SHA-256: ${doc.checksum}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000216 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n388\n%%EOF`;
  return res.send(Buffer.from(fallbackPdf));
});

// Object storage configuration status & walkthrough guide
apiRouter.get('/storage/status', (req: Request, res: Response) => {
  const s3Bucket = process.env.S3_BUCKET;
  const s3Key = process.env.S3_ACCESS_KEY_ID;
  const s3Secret = process.env.S3_SECRET_ACCESS_KEY;
  const s3Configured = Boolean(s3Bucket && s3Key && s3Secret);

  res.json({
    s3Configured,
    storageMode: s3Configured ? 's3' : 'local_storage',
    bucket: s3Bucket || null,
    region: process.env.S3_REGION || 'eu-west-1',
    guidance: {
      title: 'Object Storage Setup Instructions',
      summary: s3Configured
        ? 'S3 object storage is configured and active on this server.'
        : 'Running in Local Server Storage mode. Files are securely stored in the local filesystem.',
      variablesRequiredOnBackend: [
        'S3_BUCKET (e.g. ospreyn-documents)',
        'S3_REGION (e.g. eu-west-1 or auto)',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'S3_ENDPOINT (Optional for Cloudflare R2, MinIO, or Backblaze B2)',
      ],
      netlifyFrontendNotice:
        'Frontend on Netlify only requires VITE_API_BASE_URL. Never set S3 secret keys on Netlify; keep all S3 credentials on your backend API host.',
    },
  });
});

// ==========================================
// 11. AUDIT LOGS
// ==========================================

apiRouter.get('/songs/:id/audit', (req: Request, res: Response) => {
  const { id } = req.params;
  const list = db.auditEvents
    .filter((e) => e.songId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(list);
});

apiRouter.get('/audit', (req: Request, res: Response) => {
  const { orgId } = getContext(req);
  const list = db.auditEvents
    .filter((e) => e.organisationId === orgId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(list);
});

// ==========================================
// 12. EVIDENCE EXPORT PACKAGE
// ==========================================

apiRouter.get('/songs/:id/export', (req: Request, res: Response) => {
  const { id: songId } = req.params;
  const { user, orgId, userId } = getContext(req);
  const song = db.songs.get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found.' });

  const versions = Array.from(db.rightsRecordVersions.values())
    .filter((v) => v.songId === songId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const currentVersion = versions[versions.length - 1];

  const allocations = Array.from(db.ownershipAllocations.values())
    .filter((a) => a.versionId === currentVersion?.id)
    .map((a) => ({
      ...a,
      contributor: db.contributors.get(a.contributorId),
    }));

  const confirmations = Array.from(db.contributorConfirmations.values())
    .filter((c) => c.versionId === currentVersion?.id)
    .map((c) => ({
      ...c,
      contributor: db.contributors.get(c.contributorId),
    }));

  const agreements = Array.from(db.agreements.values()).filter((a) => a.songId === songId);
  const documents = Array.from(db.documents.values()).filter((d) => d.songId === songId);
  const auditTrail = db.auditEvents
    .filter((e) => e.songId === songId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Log export event
  db.logAuditEvent({
    organisationId: orgId,
    entityType: 'song',
    entityId: songId,
    songId,
    actorType: 'user',
    actorId: userId,
    actorName: user?.fullName || 'User',
    eventType: 'RIGHTS_RECORD_EXPORTED',
    metadata: {
      version: currentVersion?.versionNumber,
      format: 'EVIDENCE_PACKAGE_JSON',
    },
  });

  const packageData = {
    ospreynEvidencePackageVersion: '1.1',
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
      checksum: d.checksum,
      category: d.category,
      createdAt: d.createdAt,
    })),
    auditLedger: auditTrail,
    legalNotice: 'Notice: Ospreyn provides independent rights-documentation and workflow infrastructure. It does not provide legal advice or make claims regarding the legal enforceability of private confirmations. Agreement terms and confirmation mechanisms should be reviewed by qualified South African legal counsel before formal execution.',
  };

  res.json(packageData);
});

// ==========================================
// 12. PROJECT SOURCE ARCHIVE DOWNLOAD (.ZIP)
// ==========================================

apiRouter.get('/download-zip', (req: Request, res: Response) => {
  return handleDownloadZip(req, res);
});

apiRouter.get('/download-project-zip', (req: Request, res: Response) => {
  return handleDownloadZip(req, res);
});

function handleDownloadZip(req: Request, res: Response) {
  const zipPath = path.join(process.cwd(), 'public', 'ospreyn-source.zip');
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ospreyn-music-rights-project.zip"');
    const fileStream = fs.createReadStream(zipPath);
    return fileStream.pipe(res);
  }
  return res.status(404).json({ error: 'Zip package not found on server.' });
}

