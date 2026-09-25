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
import { camel, query, queryOne, tx } from './db';
import * as repo from './repo';
import { DISCLAIMER_TEXT, generateSplitSheetAgreementText } from './agreements';
import {
  sendEmail,
  invitationEmail,
  confirmationNotificationEmail,
  passwordResetEmail,
  emailVerificationEmail,
  organisationInviteEmail,
} from './email';
import { rateLimit, emailKey } from './rateLimit';
import { computeEvidenceStrength } from './evidence';
import {
  sendInvitationWhatsApp,
  sendOwnerNotificationWhatsApp,
  toWhatsAppAddress,
  verifyTwilioSignature,
} from './whatsapp';
import { TERMS_VERSION } from './legal';
import { PLANS, PLAN_COMPARISON_ROWS, getPlan, isValidPlanId, isValidBillingInterval, nextPlan } from './plans';
import { initializeTransaction, verifyTransaction, verifyPaystackSignature } from './paystack';
import {
  clearSessionCookie,
  clientIp,
  consumeActionToken,
  createActionToken,
  createSession,
  hashPassword,
  readSessionToken,
  requireAdmin,
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

// Public — the pricing page needs this before sign-in, so it's the single
// source of truth both the landing page and plan enforcement read from
// (server/plans.ts), rather than duplicating limits/prices in the frontend.
apiRouter.get('/plans', (_req: Request, res: Response) => {
  res.json(PLANS);
});

apiRouter.get('/plans/comparison', (_req: Request, res: Response) => {
  res.json(PLAN_COMPARISON_ROWS);
});

// ==========================================
// 1. AUTHENTICATION
// ==========================================

apiRouter.post(
  '/auth/login',
  rateLimit({
    scope: 'login',
    max: 8,
    windowMs: 15 * 60 * 1000,
    keyExtra: emailKey,
    message: 'Too many sign-in attempts. Try again in a few minutes, or reset your password.',
  }),
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
  rateLimit({
    scope: 'register',
    max: 10,
    windowMs: 60 * 60 * 1000,
    message: 'Too many accounts created from this connection recently. Try again later.',
  }),
  ah(async (req, res) => {
    if (process.env.ALLOW_REGISTRATION === 'false') {
      return res.status(403).json({ error: 'Registration is closed on this instance.' });
    }

    const { email, password, fullName, stageName, organisationName, acceptedTerms } = req.body || {};
    if (!email?.trim() || !password || !fullName?.trim()) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (String(password).length < 10) {
      return res.status(400).json({ error: 'Choose a password of at least 10 characters.' });
    }
    if (!acceptedTerms) {
      return res
        .status(400)
        .json({ error: 'You must agree to the Terms of Service and Privacy Policy to register.' });
    }

    const existing = await queryOne(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
    if (existing) {
      return res.status(409).json({ error: 'An account already exists for that email.' });
    }

    const result = await tx(async (client) => {
      const userRow = (
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, stage_name, terms_accepted_at, terms_version)
           VALUES (lower($1), $2, $3, $4, now(), $5) RETURNING *`,
          [email.trim(), hashPassword(password), fullName.trim(), stageName?.trim() || null, TERMS_VERSION],
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

/**
 * Lets a signed-in user set/update their WhatsApp number, so workspace-owner
 * notifications (a contributor confirmed, requested a change, etc.) have
 * somewhere to send WhatsApp messages to. Email notifications work without
 * this; phone is optional and WhatsApp delivery is simply skipped without it.
 */
apiRouter.patch(
  '/account/profile',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { fullName, stageName, bio, socialLinks, phone } = req.body || {};

    if (fullName !== undefined && !String(fullName).trim()) {
      return res.status(400).json({ error: 'Full name cannot be empty.' });
    }
    if (phone !== undefined && phone !== null && phone !== '' && !toWhatsAppAddress(phone)) {
      return res.status(400).json({ error: 'That does not look like a valid phone number.' });
    }
    if (bio !== undefined && bio !== null && String(bio).length > 1000) {
      return res.status(400).json({ error: 'Bio must be under 1000 characters.' });
    }
    let cleanSocialLinks: Record<string, string> | undefined;
    if (socialLinks !== undefined) {
      const allowedKeys = ['website', 'instagram', 'twitter', 'tiktok', 'spotify', 'youtube'];
      cleanSocialLinks = {};
      for (const key of allowedKeys) {
        const value = socialLinks?.[key];
        if (typeof value === 'string' && value.trim()) {
          if (value.trim().length > 300) {
            return res.status(400).json({ error: `${key} link is too long.` });
          }
          cleanSocialLinks[key] = value.trim();
        }
      }
    }

    const updated = await repo.updateUserProfile(user.id, {
      ...(fullName !== undefined ? { fullName: String(fullName).trim() } : {}),
      ...(stageName !== undefined ? { stageName: stageName?.trim() || null } : {}),
      ...(bio !== undefined ? { bio: bio?.trim() || null } : {}),
      ...(cleanSocialLinks !== undefined ? { socialLinks: cleanSocialLinks } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
    });

    res.json({ user: updated });
  }),
);

/**
 * Changing the email address requires the current password as a second
 * factor (same standard as password change and account deletion), and
 * resets email_verified_at — the new address is unverified until the person
 * clicks the link this sends. Existing sessions are left alone; only the
 * password itself signs everyone else out (see /account/password).
 */
apiRouter.post(
  '/account/email',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { email, currentPassword } = req.body || {};

    if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: 'Enter your current password to confirm this change.' });
    }

    const row = await queryOne<any>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const existing = await queryOne(`SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2`, [
      email.trim(),
      user.id,
    ]);
    if (existing) {
      return res.status(409).json({ error: 'Another account already uses that email.' });
    }

    const updated = await repo.updateUserEmail(user.id, email.trim());

    const { rawToken } = await createActionToken(user.id, 'email_verification', 60 * 24);
    void sendEmail({
      to: updated.email,
      ...emailVerificationEmail({ fullName: updated.fullName, verifyUrl: appUrlFor(`/verify-email/${rawToken}`) }),
    });

    await repo.logAuditEvent(undefined, {
      organisationId: req.auth!.organisation.id,
      entityType: 'workspace',
      entityId: user.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'EMAIL_CHANGED',
      metadata: {},
    });

    res.json({ user: updated });
  }),
);

/** Changes the password. Requires the current password; revokes every other session on success. */
apiRouter.post(
  '/account/password',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are both required.' });
    }
    if (String(newPassword).length < 10) {
      return res.status(400).json({ error: 'Choose a new password of at least 10 characters.' });
    }

    const row = await queryOne<any>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    await repo.updateUserPassword(user.id, hashPassword(newPassword));

    // Re-issue this session's own cookie, then revoke every other active
    // session, so a stolen session elsewhere is cut off the moment the
    // password changes without signing the person themselves out.
    const currentToken = readSessionToken(req);
    await query(
      `UPDATE sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2`,
      [user.id, currentToken ? crypto.createHash('sha256').update(currentToken).digest('hex') : ''],
    );

    await repo.logAuditEvent(undefined, {
      organisationId: req.auth!.organisation.id,
      entityType: 'workspace',
      entityId: user.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'PASSWORD_CHANGED',
      metadata: {},
    });

    res.json({ success: true });
  }),
);

/**
 * Forgot-password. Always responds the same way whether or not the email is
 * registered, so the endpoint can't be used to enumerate accounts. Rate
 * limited per email + per IP (see server/rateLimit.ts) to slow down abuse.
 */
apiRouter.post(
  '/auth/forgot-password',
  rateLimit({ scope: 'forgot-password', max: 5, windowMs: 15 * 60 * 1000, keyExtra: emailKey }),
  ah(async (req, res) => {
    const { email } = req.body || {};
    if (!email?.trim()) return res.status(400).json({ error: 'Enter your email address.' });

    const user = await repo.getUserByEmail(email.trim());
    if (user) {
      const { rawToken } = await createActionToken(user.id, 'password_reset', 60);
      void sendEmail({
        to: user.email,
        ...passwordResetEmail({
          fullName: user.fullName,
          resetUrl: appUrlFor(`/reset-password/${rawToken}`),
          expiresInMinutes: 60,
        }),
      });
    }

    res.json({ success: true, message: 'If an account exists for that email, a reset link is on its way.' });
  }),
);

apiRouter.post(
  '/auth/reset-password',
  rateLimit({ scope: 'reset-password', max: 10, windowMs: 15 * 60 * 1000 }),
  ah(async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'A reset token and new password are required.' });
    }
    if (String(newPassword).length < 10) {
      return res.status(400).json({ error: 'Choose a password of at least 10 characters.' });
    }

    const userId = await consumeActionToken(token, 'password_reset');
    if (!userId) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    }

    await repo.updateUserPassword(userId, hashPassword(newPassword));
    await query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
      userId,
    ]);

    // No organisation context is available at this unauthenticated endpoint
    // (a person can belong to several workspaces), so this isn't written to
    // any workspace's own audit_events trail — audit_events requires a real
    // organisation_id. Server logs remain the record of this action.
    console.log(`[password-reset] password reset via token for user ${userId}`);

    res.json({ success: true });
  }),
);

apiRouter.post(
  '/auth/verify-email/:token',
  ah(async (req, res) => {
    const userId = await consumeActionToken(req.params.token, 'email_verification');
    if (!userId) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
    }
    await repo.markEmailVerified(userId);
    res.json({ success: true });
  }),
);

apiRouter.post(
  '/account/resend-verification',
  requireAuth,
  rateLimit({ scope: 'resend-verification', max: 3, windowMs: 15 * 60 * 1000 }),
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { rawToken } = await createActionToken(user.id, 'email_verification', 60 * 24);
    void sendEmail({
      to: user.email,
      ...emailVerificationEmail({ fullName: user.fullName, verifyUrl: appUrlFor(`/verify-email/${rawToken}`) }),
    });
    res.json({ success: true });
  }),
);

// --- Avatar (same private-object-storage/presigned-URL model as the document vault) ---

apiRouter.post(
  '/account/avatar/upload-url',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { fileName, mimeType, fileSize } = req.body || {};

    if (!mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      return res.status(400).json({ error: 'Avatars must be PNG, JPEG or WebP.' });
    }
    if (!Number.isFinite(Number(fileSize)) || Number(fileSize) <= 0 || Number(fileSize) > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Avatar images must be under 5 MB.' });
    }

    const safeName = (fileName || 'avatar').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const storageKey = `avatars/${user.id}/${Date.now()}-${safeName}`;
    const uploadUrl = await createUploadUrl(storageKey, mimeType, undefined, requestOrigin(req));

    res.json({ storageKey, uploadUrl });
  }),
);

apiRouter.post(
  '/account/avatar/complete',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { storageKey } = req.body || {};
    if (!storageKey?.startsWith(`avatars/${user.id}/`)) {
      return res.status(400).json({ error: 'Invalid storage key.' });
    }

    const head = await headObject(storageKey);
    if (!head) {
      return res.status(409).json({ error: 'The upload did not complete. Try again.' });
    }

    // Best-effort cleanup of the previous avatar so orphaned images don't accumulate.
    if (user.avatarKey && user.avatarKey !== storageKey) {
      deleteObject(user.avatarKey).catch(() => undefined);
    }

    const updated = await repo.setUserAvatarKey(user.id, storageKey);
    res.json({ user: updated });
  }),
);

apiRouter.delete(
  '/account/avatar',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    if (user.avatarKey) deleteObject(user.avatarKey).catch(() => undefined);
    const updated = await repo.setUserAvatarKey(user.id, null);
    res.json({ user: updated });
  }),
);

apiRouter.get(
  '/account/avatar-url',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    if (!user.avatarKey) return res.json({ url: null });
    const url = await createDownloadUrl(user.avatarKey, 'avatar', requestOrigin(req));
    res.json({ url });
  }),
);

/**
 * Read-only summary of what this build actually does to protect an account —
 * powers the in-product "Trust & security" panel. Every field here is either
 * a fact about how the code works (no interpretation needed) or a real
 * environment flag, never a claim the code doesn't back up.
 */
apiRouter.get(
  '/account/security',
  requireAuth,
  ah(async (_req, res) => {
    res.json({
      passwordAlgorithm: 'scrypt (per-user salt, constant-time verification)',
      sessionModel: 'Server-side sessions; only a SHA-256 hash of the session token is stored',
      documentIntegrity: 'SHA-256 checksum verified against every stored document',
      auditTrail: 'Append-only — every ownership, invitation and confirmation event is logged and cannot be edited or deleted',
      backupsConfigured: process.env.DATABASE_BACKUPS_CONFIGURED === 'true',
      rateLimited: true,
    });
  }),
);

/**
 * Permanent account deletion. Requires the current password as a second
 * factor, since this is irreversible.
 *
 * Design note: rather than deleting the users row outright, deletion
 * anonymises it in place (email/name/password replaced, login disabled) and
 * revokes every session. The row itself is kept because other people's audit
 * trails — invitations this person sent, documents they uploaded, versions
 * they created — reference it by id, and overwriting who-did-what in someone
 * else's evidence record would undermine the exact record-keeping this
 * product exists to provide. This is the standard "erase personal data,
 * retain the minimum needed for legitimate record-keeping" approach GDPR
 * Article 17(3) and similar regimes anticipate; see the Privacy Policy's
 * "Deleting your account" section.
 *
 * Any workspace this person solely owns is deleted in full, including its
 * documents in object storage — there is no one else it could be preserved
 * for. A workspace with other members cannot yet be deleted this way (there
 * is no ownership-transfer flow in this build); it blocks with a clear error
 * instead of silently orphaning collaborators.
 */
apiRouter.delete(
  '/account',
  requireAuth,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { password, confirmation } = req.body || {};

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Enter your password to confirm.' });
    }

    const row = await queryOne<any>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    const ownedOrgs = await repo.getOwnedOrganisationsForDeletion(user.id);
    const blockedOrgs = ownedOrgs.filter((o) => o.memberCount > 1);
    if (blockedOrgs.length > 0) {
      return res.status(409).json({
        error:
          `You own ${blockedOrgs.length === 1 ? 'a workspace' : 'workspaces'} with other members ` +
          `(${blockedOrgs.map((o) => o.name).join(', ')}). Remove the other members or contact ` +
          `support to transfer ownership before deleting your account.`,
      });
    }

    const ownedOrgIds = ownedOrgs.map((o) => o.id);
    const storageKeysToDelete = await repo.listDocumentStorageKeysForOrganisations(ownedOrgIds);

    await tx(async (client) => {
      // Cascades away every song, contributor, version, allocation, invitation,
      // confirmation, agreement, document row and audit event that belonged
      // to this workspace — see the foreign keys in schema.sql.
      if (ownedOrgIds.length > 0) {
        await client.query(`DELETE FROM organisations WHERE id = ANY($1::uuid[])`, [ownedOrgIds]);
      }
      // Membership in any workspace this person doesn't own (not reachable in
      // this build's single-workspace-per-user model, kept for when it is).
      await client.query(`DELETE FROM organisation_members WHERE user_id = $1`, [user.id]);
      await client.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1`, [user.id]);

      const tombstone = `deleted-${crypto.randomBytes(12).toString('hex')}@deleted.ospreyn.invalid`;
      await client.query(
        `UPDATE users
            SET email = $2, password_hash = $3, full_name = 'Deleted user', stage_name = NULL, updated_at = now()
          WHERE id = $1`,
        [user.id, tombstone, hashPassword(crypto.randomBytes(24).toString('hex'))],
      );
    });

    // Object storage isn't transactional with the database, so this runs
    // after commit as a best-effort cleanup. A key left behind here is
    // orphaned (unreachable — its DB row is already gone) rather than
    // dangling, so a failure here never leaves an inconsistent record.
    for (const key of storageKeysToDelete) {
      await deleteObject(key).catch((err) =>
        console.error('[account-deletion] failed to delete storage object:', key, err.message),
      );
    }

    clearSessionCookie(res);
    res.json({ success: true });
  }),
);

// ==========================================
// 1b. TEAM MANAGEMENT — invite, list, remove workspace members
// ==========================================
// organisation_members covers people who already hold membership;
// organisation_invitations covers someone named by email who may not have
// an account yet. maxTeamMembers is enforced from the plan (see
// server/plans.ts) the same way maxSongs is enforced on song creation.

apiRouter.get(
  '/team/members',
  requireAuth,
  ah(async (req, res) => {
    res.json(await repo.listOrganisationMembers(req.auth!.organisation.id));
  }),
);

apiRouter.get(
  '/team/invitations',
  requireAuth,
  requireRole('owner', 'admin'),
  ah(async (req, res) => {
    res.json(await repo.listTeamInvitations(req.auth!.organisation.id));
  }),
);

apiRouter.post(
  '/team/invitations',
  requireAuth,
  requireRole('owner', 'admin'),
  ah(async (req, res) => {
    const { user, organisation } = req.auth!;
    const { email, role } = req.body || {};

    if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({ error: 'Role must be "admin" or "member".' });
    }

    const plan = getPlan(organisation.plan);
    if (plan.maxTeamMembers !== null) {
      const [memberCount, pendingInvites] = await Promise.all([
        repo.countOrganisationMembers(organisation.id),
        repo.listTeamInvitations(organisation.id),
      ]);
      if (memberCount + pendingInvites.length >= plan.maxTeamMembers) {
        const upgrade = nextPlan(plan.id);
        return res.status(402).json({
          error: upgrade
            ? `This workspace is at its ${plan.maxTeamMembers}-member limit on the ${plan.name} plan. Upgrade to ${upgrade.name} for more seats.`
            : `This workspace is at its ${plan.maxTeamMembers}-member limit on the ${plan.name} plan.`,
          code: 'PLAN_LIMIT_REACHED',
          suggestedPlan: upgrade?.id || null,
        });
      }
    }

    const alreadyMember = await queryOne(
      `SELECT om.id FROM organisation_members om JOIN users u ON u.id = om.user_id
        WHERE om.organisation_id = $1 AND lower(u.email) = lower($2)`,
      [organisation.id, email.trim()],
    );
    if (alreadyMember) {
      return res.status(409).json({ error: 'That person is already a member of this workspace.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await repo.createTeamInvitation({
      organisationId: organisation.id,
      email: email.trim(),
      role,
      invitedBy: user.id,
      rawToken,
      expiresAt,
    });

    void sendEmail({
      to: email.trim(),
      ...organisationInviteEmail({
        organisationName: organisation.name,
        inviterName: user.fullName,
        role,
        acceptUrl: appUrlFor(`/team/accept/${rawToken}`),
        expiresAt: expiresAt.toISOString(),
      }),
    });

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'workspace',
      entityId: invitation.id,
      actorType: 'user',
      actorId: user.id,
      actorName: user.fullName,
      eventType: 'TEAM_MEMBER_INVITED',
      metadata: { email: email.trim(), role },
    });

    res.status(201).json(invitation);
  }),
);

apiRouter.delete(
  '/team/invitations/:id',
  requireAuth,
  requireRole('owner', 'admin'),
  ah(async (req, res) => {
    await repo.revokeTeamInvitation(req.params.id, req.auth!.organisation.id);
    res.json({ success: true });
  }),
);

/** Public lookup so the accept page can show who/what before the person signs in. */
apiRouter.get(
  '/team/invitations/token/:rawToken',
  ah(async (req, res) => {
    const invitation = await repo.findTeamInvitationByToken(req.params.rawToken);
    if (!invitation) return res.status(404).json({ error: 'This invitation is invalid or has expired.' });
    res.json({ email: invitation.email, role: invitation.role, organisationId: invitation.organisationId });
  }),
);

/** Accepting requires being signed in as the invited email — someone without an account is sent to register first. */
apiRouter.post(
  '/team/invitations/token/:rawToken/accept',
  requireAuth,
  ah(async (req, res) => {
    const invitation = await repo.findTeamInvitationByToken(req.params.rawToken);
    if (!invitation) return res.status(404).json({ error: 'This invitation is invalid or has expired.' });
    if (invitation.email.toLowerCase() !== req.auth!.user.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address.' });
    }

    const member = await repo.acceptTeamInvitation(invitation.id, req.auth!.user.id);

    await repo.logAuditEvent(undefined, {
      organisationId: invitation.organisationId,
      entityType: 'workspace',
      entityId: member.id,
      actorType: 'user',
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.fullName,
      eventType: 'TEAM_MEMBER_JOINED',
      metadata: { role: invitation.role },
    });

    res.json({ success: true, member });
  }),
);

apiRouter.patch(
  '/team/members/:id',
  requireAuth,
  requireRole('owner'),
  ah(async (req, res) => {
    const { role } = req.body || {};
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({ error: 'Role must be "admin" or "member".' });
    }
    const updated = await repo.updateMemberRole(req.params.id, req.auth!.organisation.id, role);
    if (!updated) return res.status(404).json({ error: 'Member not found.' });
    res.json(updated);
  }),
);

apiRouter.delete(
  '/team/members/:id',
  requireAuth,
  requireRole('owner'),
  ah(async (req, res) => {
    const { organisation } = req.auth!;
    const member = await queryOne<any>(
      `SELECT * FROM organisation_members WHERE id = $1 AND organisation_id = $2`,
      [req.params.id, organisation.id],
    );
    if (!member) return res.status(404).json({ error: 'Member not found.' });
    if (member.role === 'owner') {
      return res.status(400).json({ error: 'The workspace owner cannot be removed. Transfer ownership first.' });
    }
    await repo.removeMember(req.params.id, organisation.id);
    res.json({ success: true });
  }),
);

// ==========================================
// 2. DASHBOARD HYDRATION
// ==========================================

/** ZAR-free storage allowance per plan, in bytes. Mirrors the figures in PLAN_COMPARISON_ROWS. */
const STORAGE_LIMIT_BYTES: Record<string, number | null> = {
  free: 100 * 1024 * 1024,
  starter: 2 * 1024 * 1024 * 1024,
  professional: 25 * 1024 * 1024 * 1024,
  label: 100 * 1024 * 1024 * 1024,
  enterprise: null,
};

/**
 * Everything the dashboard needs beyond the raw song list: evidence-strength
 * rollup, storage usage, and plan/team usage against limits. Shared between
 * GET /me and GET /dashboard/metrics so both stay consistent.
 */
async function buildEvidenceAndUsageSummary(orgId: string, plan: ReturnType<typeof getPlan>) {
  const [orgDocuments, songCount, teamMemberCount] = await Promise.all([
    repo.listDocumentsForOrganisation(orgId),
    repo.countSongsForOrganisation(orgId),
    repo.countOrganisationMembers(orgId),
  ]);

  const bySong = new Map<string, typeof orgDocuments>();
  for (const doc of orgDocuments) {
    const list = bySong.get(doc.songId) || [];
    list.push(doc);
    bySong.set(doc.songId, list);
  }

  const songIds = await repo.listSongs(orgId).then((songs) => songs.map((s) => s.id));
  let missingDocumentationCount = 0;
  let scoreSum = 0;
  for (const songId of songIds) {
    const docs = bySong.get(songId) || [];
    const strength = computeEvidenceStrength(docs);
    if (docs.length === 0) missingDocumentationCount += 1;
    scoreSum += strength.score;
  }

  const storageUsedBytes = orgDocuments.reduce((sum, d) => sum + (d.fileSize || 0), 0);

  return {
    missingDocumentationCount,
    averageEvidenceScore: songIds.length ? Math.round(scoreSum / songIds.length) : 0,
    storageUsedBytes,
    storageLimitBytes: STORAGE_LIMIT_BYTES[plan.id] ?? null,
    planId: plan.id,
    songLimit: plan.maxSongs,
    songCount,
    teamMemberLimit: plan.maxTeamMembers,
    teamMemberCount,
  };
}

apiRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const orgId = req.auth!.organisation.id;
    const plan = getPlan(req.auth!.organisation.plan);
    const [songs, metrics, recentActivity, usage] = await Promise.all([
      repo.listSongs(orgId),
      repo.getDashboardMetrics(orgId),
      repo.listOrgAudit(orgId, 15),
      buildEvidenceAndUsageSummary(orgId, plan),
    ]);

    res.json({
      user: req.auth!.user,
      organisation: req.auth!.organisation,
      role: req.auth!.role,
      songs,
      metrics: { ...metrics, recentActivity },
      usage,
    });
  }),
);

apiRouter.get(
  '/dashboard/metrics',
  requireAuth,
  ah(async (req, res) => {
    const orgId = req.auth!.organisation.id;
    const plan = getPlan(req.auth!.organisation.plan);
    const [metrics, songs, recentActivity, usage] = await Promise.all([
      repo.getDashboardMetrics(orgId),
      repo.listSongs(orgId),
      repo.listOrgAudit(orgId, 8),
      buildEvidenceAndUsageSummary(orgId, plan),
    ]);
    res.json({ ...metrics, recentSongs: songs.slice(0, 6), recentActivity, usage });
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

    const plan = getPlan(organisation.plan);
    if (plan.maxSongs !== null) {
      const existingCount = await repo.countSongsForOrganisation(organisation.id);
      if (existingCount >= plan.maxSongs) {
        const upgrade = nextPlan(plan.id);
        return res.status(402).json({
          error: upgrade
            ? `You've reached the ${plan.maxSongs}-record limit on the ${plan.name} plan. Upgrade to ${upgrade.name} for ${upgrade.maxSongs === null ? 'unlimited' : `up to ${upgrade.maxSongs}`} Rights Records.`
            : `You've reached the ${plan.maxSongs}-record limit on the ${plan.name} plan.`,
          code: 'PLAN_LIMIT_REACHED',
          plan: plan.id,
          limit: plan.maxSongs,
          suggestedPlan: upgrade?.id || null,
        });
      }
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
      evidence: computeEvidenceStrength(documents),
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

      // Fetched once and sliced per contributor below, so the WhatsApp/email
      // templates can show a role and a share percentage instead of just a link.
      const [allAllocations, allSongContributors] = await Promise.all([
        repo.listAllocations(currentVersion.id, client),
        repo.listSongContributors(song.id, client),
      ]);

      const out: Array<{
        invitationId: string;
        rawToken: string;
        reviewUrl: string;
        contributorName: string;
        email: string;
        phone: string | null;
        expiresAt: string;
        role: string;
        sharePercent: string;
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

        const roles = allSongContributors
          .filter((sc) => sc.contributorId === contributor.id)
          .map((sc) => sc.customRoleTitle || sc.role);
        const compBps = allAllocations
          .filter((a) => a.contributorId === contributor.id && a.rightType === 'COMPOSITION')
          .reduce((sum, a) => sum + a.basisPoints, 0);
        const masterBps = allAllocations
          .filter((a) => a.contributorId === contributor.id && a.rightType === 'MASTER')
          .reduce((sum, a) => sum + a.basisPoints, 0);
        const shareParts: string[] = [];
        if (compBps > 0) shareParts.push(`Composition ${(compBps / 100).toFixed(2)}%`);
        if (masterBps > 0) shareParts.push(`Master ${(masterBps / 100).toFixed(2)}%`);

        out.push({
          invitationId: invitation.id,
          rawToken,
          reviewUrl: reviewUrlFor(rawToken),
          contributorName: contributor.fullName,
          email: contributor.email,
          phone: contributor.phone || null,
          expiresAt: expiresAt.toISOString(),
          role: roles.join(', ') || 'Contributor',
          sharePercent: shareParts.join(', ') || '0.00%',
        });
      }

      await repo.updateSongFields(client, song.id, { status: 'proposed' });
      await repo.setVersionStatus(client, currentVersion.id, 'proposed');

      return out;
    });

    // Best-effort, both channels: a contributor without delivery on either
    // still has their raw link in the response below, so a failed send here
    // never blocks the request. Per-invitation so one bad number/address
    // never stops the rest of the batch from going out.
    for (const invitation of generated) {
      const { subject, html, text } = invitationEmail({
        contributorName: invitation.contributorName,
        songTitle: song.title,
        organisationName: organisation.name,
        reviewUrl: invitation.reviewUrl,
        expiresAt: invitation.expiresAt,
      });
      void sendEmail({ to: invitation.email, subject, html, text });

      const waAddress = toWhatsAppAddress(invitation.phone);
      if (waAddress) {
        void sendInvitationWhatsApp({
          to: waAddress,
          contributorName: invitation.contributorName,
          songTitle: song.title,
          artistName: song.primaryArtist,
          role: invitation.role,
          sharePercent: invitation.sharePercent,
          reviewUrl: invitation.reviewUrl,
          rawToken: invitation.rawToken,
        })
          .then((result) =>
            repo.recordWhatsAppMessage(undefined, {
              organisationId: organisation.id,
              songId: song.id,
              invitationId: invitation.invitationId,
              direction: 'outbound',
              purpose: 'contributor_invite',
              toNumber: waAddress,
              providerMessageSid: result.messageSid,
              status: result.status,
              payload: result.raw ? { response: result.raw } : {},
              error: result.error || null,
            }),
          )
          .catch((err) => console.error('[ospreyn:whatsapp] invite send/log failed:', err.message));
      }
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

/**
 * Core of the dual-confirmation workflow: records a contributor's
 * confirmed/change-requested response and notifies the workspace owner on
 * every channel available for them (email always; WhatsApp when the owner
 * has a phone number on file). Shared by the web review portal
 * (respondToInvitation, below) and the WhatsApp inbound webhook
 * (whatsappWebhook, further below) — a contributor can confirm from
 * *either* channel and the result is identical either way, per the
 * "confirm via EITHER channel" requirement.
 */
async function processInvitationResponse(input: {
  rawToken: string;
  action: 'confirmed' | 'change_requested';
  participantName?: string | null;
  changeRequestComment?: string | null;
  ip: string | null;
  userAgent: string;
  channel: 'web' | 'whatsapp';
}) {
  const { rawToken, action, participantName, changeRequestComment, ip, userAgent, channel } = input;

  if (!['confirmed', 'change_requested'].includes(action)) {
    throw Object.assign(new Error('Action must be confirmed or change_requested.'), {
      statusCode: 400,
    });
  }
  if (
    action === 'change_requested' &&
    (!changeRequestComment || changeRequestComment.trim().length < 5)
  ) {
    throw Object.assign(new Error('Describe the change you are asking for.'), {
      statusCode: 400,
    });
  }

  const { invitation, song, version, contributor } = await loadInvitationContext(rawToken);

  if (invitation.usedAt) {
    throw Object.assign(new Error('You have already responded to this invitation.'), {
      statusCode: 410,
    });
  }

  const result = await tx(async (client) => {
    // Serialise responses so a double-submit (or a web confirm racing a
    // WhatsApp button tap on the same invitation) cannot record twice.
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
      ipAddress: ip ?? undefined,
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
        channel,
      },
    });

    return { confirmation, songStatus };
  });

  // Best-effort notification to the workspace owner, on every channel
  // available for them. Never blocks the response above, which is already
  // committed by this point.
  repo
    .getOrganisationOwner(song.organisationId)
    .then(async (owner) => {
      if (!owner) return;
      const { subject, html, text } = confirmationNotificationEmail({
        ownerName: owner.fullName,
        contributorName: contributor.fullName,
        songTitle: song.title,
        action: action as 'confirmed' | 'change_requested',
        comment: changeRequestComment?.trim() || null,
        songUrl: appUrlFor(`/songs/${song.id}`),
      });
      await sendEmail({ to: owner.email, subject, html, text });

      const waAddress = toWhatsAppAddress(owner.phone);
      if (waAddress) {
        const waResult = await sendOwnerNotificationWhatsApp({
          to: waAddress,
          ownerName: owner.fullName,
          contributorName: contributor.fullName,
          songTitle: song.title,
          action: action as 'confirmed' | 'change_requested',
          comment: changeRequestComment?.trim() || null,
          songUrl: appUrlFor(`/songs/${song.id}`),
        });
        await repo.recordWhatsAppMessage(undefined, {
          organisationId: song.organisationId,
          songId: song.id,
          invitationId: invitation.id,
          direction: 'outbound',
          purpose: 'owner_notification',
          toNumber: waAddress,
          providerMessageSid: waResult.messageSid,
          status: waResult.status,
          payload: waResult.raw ? { response: waResult.raw } : {},
          error: waResult.error || null,
        });
      }
    })
    .catch((err) => console.error('[ospreyn:notify] owner notification failed:', err.message));

  return { invitation, song, version, contributor, confirmation: result.confirmation, songStatus: result.songStatus };
}

const respondToInvitation = ah(async (req: Request, res: Response) => {
  const rawToken = req.params.rawToken || req.body?.rawToken;
  const action = req.body?.action;
  const participantName = req.body?.participantName;
  const changeRequestComment = req.body?.changeRequestComment ?? req.body?.notes;

  if (!rawToken || !action) {
    return res.status(400).json({ error: 'Missing invitation token or action.' });
  }

  const { confirmation, songStatus } = await processInvitationResponse({
    rawToken,
    action,
    participantName,
    changeRequestComment,
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || 'Web browser'),
    channel: 'web',
  });

  res.json({ success: true, action, confirmation, songStatus });
});

apiRouter.post('/invitations/review/:rawToken/confirm', respondToInvitation);
apiRouter.post('/invitations/respond', respondToInvitation);

// ==========================================
// 7b. WHATSAPP INBOUND WEBHOOK (public, Twilio-signed)
// ==========================================
//
// Handles the quick-reply button taps from the invitation template sent in
// sendInvitationWhatsApp. Twilio POSTs inbound messages/button events as
// application/x-www-form-urlencoded, so this route has its own urlencoded
// parser mounted ahead of it in index.ts — see WHATSAPP_WEBHOOK_PATH there.
//
// Button payload is the invitation's raw review token (see the comment on
// sendInvitationWhatsApp for why that's safe to echo back). As a second
// factor, the replying WhatsApp number must match the phone number on file
// for that invitation's contributor, so a forwarded message can't be used
// to confirm on someone else's behalf.
apiRouter.post(
  '/webhooks/whatsapp',
  ah(async (req: Request, res: Response) => {
    const params = (req.body || {}) as Record<string, string>;

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;
    const signature = req.headers['x-twilio-signature'] as string | undefined;

    if (process.env.NODE_ENV === 'production' && !verifyTwilioSignature(fullUrl, params, signature)) {
      return res.status(403).send('Invalid signature.');
    }

    await repo.recordWhatsAppMessage(undefined, {
      direction: 'inbound',
      purpose: 'inbound_reply',
      fromNumber: params.From || null,
      toNumber: params.To || null,
      providerMessageSid: params.MessageSid || params.SmsMessageSid || null,
      status: 'received',
      payload: params,
    });

    const buttonPayload = params.ButtonPayload; // the rawToken (see sendInvitationWhatsApp)
    const buttonText = (params.ButtonText || '').toLowerCase();

    if (!buttonPayload) {
      // Freeform text reply, not a button tap — nothing actionable to do.
      return res.status(200).send('<Response></Response>');
    }

    const action = buttonText.includes('change') ? 'change_requested' : 'confirmed';

    try {
      const { invitation, contributor } = await loadInvitationContext(buttonPayload);

      const senderAddress = toWhatsAppAddress(contributor.phone);
      if (!senderAddress || senderAddress !== params.From) {
        console.warn(
          `[ospreyn:whatsapp] button reply from ${params.From} did not match contributor phone on file for invitation ${invitation.id}; ignoring.`,
        );
        return res.status(200).send('<Response></Response>');
      }

      await processInvitationResponse({
        rawToken: buttonPayload,
        action,
        participantName: contributor.fullName,
        changeRequestComment:
          action === 'change_requested'
            ? 'Change requested via WhatsApp quick reply — contributor did not provide a written comment. Follow up directly.'
            : null,
        ip: null,
        userAgent: 'WhatsApp Business API',
        channel: 'whatsapp',
      });
    } catch (err: any) {
      // Invalid/expired/already-used token, etc. Logged, not surfaced to
      // Twilio as a failure — retries wouldn't help and Twilio doesn't need
      // to know why.
      console.error('[ospreyn:whatsapp] webhook response processing failed:', err.message);
    }

    res.status(200).send('<Response></Response>');
  }),
);

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
// BILLING (Paystack)
// ==========================================
// Upgrades an organisation from Free to Pro. Checkout is owner-only
// (requireRole('owner')) since it's a spending decision for the workspace;
// verify and the webhook are the two ways a successful charge actually
// changes plan — verify for the instant redirect-back confirmation, the
// webhook as the durable source of truth (see server/paystack.ts).

apiRouter.post(
  '/billing/checkout',
  requireAuth,
  requireRole('owner'),
  ah(async (req: Request, res: Response) => {
    const { user, organisation } = req.auth!;
    const { planId, interval } = req.body || {};

    if (!isValidPlanId(planId) || planId === 'free' || planId === 'enterprise') {
      return res.status(400).json({
        error: 'Choose Starter, Professional or Label to check out. Enterprise is sales-assisted — contact us instead.',
      });
    }
    if (!isValidBillingInterval(interval)) {
      return res.status(400).json({ error: 'Billing interval must be "monthly" or "annual".' });
    }
    if (organisation.plan === planId && organisation.billingInterval === interval) {
      return res.status(400).json({ error: `This workspace is already on ${getPlan(planId).name} (${interval}).` });
    }

    const targetPlan = getPlan(planId);
    const price = interval === 'annual' ? targetPlan.priceAnnualZar : targetPlan.priceMonthlyZar;
    if (price === null) {
      return res.status(400).json({ error: 'This plan does not have self-serve pricing.' });
    }

    const result = await initializeTransaction({
      email: user.email,
      amountZarCents: Math.round(price * 100),
      organisationId: organisation.id,
      planId,
      interval,
    });

    await repo.recordPayment({
      organisationId: organisation.id,
      reference: result.reference,
      eventType: 'checkout_initialized',
      status: 'pending',
      amountZarCents: Math.round(price * 100),
      payload: { planId, interval },
    });

    res.json({ authorizationUrl: result.authorizationUrl, reference: result.reference });
  }),
);

/**
 * Called by the frontend after Paystack redirects back with ?reference=...
 * Idempotent — safe to call more than once for the same reference (e.g. a
 * refreshed page), since it just re-verifies and re-applies the same plan.
 */
apiRouter.get(
  '/billing/verify/:reference',
  requireAuth,
  requireRole('owner'),
  ah(async (req: Request, res: Response) => {
    const { organisation } = req.auth!;
    const result = await verifyTransaction(req.params.reference);

    await repo.recordPayment({
      organisationId: organisation.id,
      reference: result.reference,
      eventType: 'transaction.verify',
      status: result.status,
      amountZarCents: result.amountZarCents,
      payload: { raw: result.raw },
    });

    if (!result.ok) {
      return res.status(402).json({ error: 'Payment was not successful.', status: result.status });
    }

    const plan = isValidPlanId(result.targetPlan) ? result.targetPlan : 'professional';
    const interval = isValidBillingInterval(result.billingInterval) ? result.billingInterval : 'monthly';

    await repo.setOrganisationPaystackDetails(organisation.id, {
      plan,
      billingInterval: interval,
      paystackCustomerCode: result.customerCode,
      paystackSubscriptionCode: result.subscriptionCode,
      planRenewsAt: result.subscriptionCode
        ? new Date(Date.now() + (interval === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000) // Paystack's webhook corrects this to the real date on subscription.create
        : null,
    });

    await repo.logAuditEvent(undefined, {
      organisationId: organisation.id,
      entityType: 'billing',
      entityId: organisation.id,
      actorType: 'user',
      actorName: 'Paystack checkout',
      eventType: 'PLAN_UPGRADED',
      metadata: { plan, interval, reference: result.reference },
    });

    res.json({ success: true, plan, interval });
  }),
);

/**
 * Paystack webhook — public, signature-verified. Mounted with express.raw()
 * ahead of express.json() in index.ts because signature verification needs
 * the exact raw request body, not Express's re-serialized parsed copy.
 */
apiRouter.post(
  '/webhooks/paystack',
  ah(async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer)?.toString('utf8') || '';
    const signature = req.headers['x-paystack-signature'] as string | undefined;

    if (!verifyPaystackSignature(rawBody, signature)) {
      return res.status(401).send('Invalid signature.');
    }

    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const organisationId: string | null = data.metadata?.organisationId || null;

    // Resolve the organisation by customer code when the event doesn't carry
    // our metadata directly (subscription lifecycle events often don't).
    const organisation = organisationId
      ? { id: organisationId }
      : data.customer?.customer_code
        ? await repo.getOrganisationByPaystackCustomerCode(data.customer.customer_code)
        : null;

    await repo.recordPayment({
      organisationId: organisation?.id || null,
      reference: data.reference || data.subscription_code || null,
      eventType: event.event || 'unknown',
      status: data.status || 'received',
      amountZarCents: data.amount ?? null,
      payload: event,
    });

    // Subscription lifecycle events carry the plan in our own metadata
    // (see initializeTransaction), same as verifyTransaction reads it back.
    const targetPlan = isValidPlanId(data.metadata?.targetPlan) ? data.metadata.targetPlan : undefined;
    const targetInterval = isValidBillingInterval(data.metadata?.billingInterval)
      ? data.metadata.billingInterval
      : undefined;

    if (organisation) {
      switch (event.event) {
        case 'charge.success':
          await repo.setOrganisationPaystackDetails(organisation.id, {
            ...(targetPlan ? { plan: targetPlan } : {}),
            ...(targetInterval ? { billingInterval: targetInterval } : {}),
            paystackCustomerCode: data.customer?.customer_code,
          });
          break;

        case 'subscription.create':
          await repo.setOrganisationPaystackDetails(organisation.id, {
            ...(targetPlan ? { plan: targetPlan } : {}),
            ...(targetInterval ? { billingInterval: targetInterval } : {}),
            paystackSubscriptionCode: data.subscription_code,
            planRenewsAt: data.next_payment_date ? new Date(data.next_payment_date) : null,
          });
          break;

        case 'invoice.update':
          if (data.status === 'success' && data.subscription?.next_payment_date) {
            await repo.setOrganisationPaystackDetails(organisation.id, {
              planRenewsAt: new Date(data.subscription.next_payment_date),
            });
          }
          break;

        // Subscription ended (cancelled, or non-renewing after a failed
        // retry cycle): downgrade back to Free rather than leaving the
        // organisation on Pro with nothing actually being billed.
        case 'subscription.disable':
        case 'subscription.not_renew':
          await repo.setOrganisationPaystackDetails(organisation.id, {
            plan: 'free',
            planRenewsAt: null,
          });
          await repo.logAuditEvent(undefined, {
            organisationId: organisation.id,
            entityType: 'billing',
            entityId: organisation.id,
            actorType: 'system',
            actorName: 'Paystack',
            eventType: 'PLAN_DOWNGRADED',
            metadata: { reason: event.event },
          });
          break;

        default:
          break; // logged above via recordPayment either way
      }
    }

    // Paystack only cares that this 2xx's — no meaningful body expected.
    res.sendStatus(200);
  }),
);

// ==========================================
// PLATFORM ADMIN (/admin) — requires users.is_platform_admin
// ==========================================
// Separate from a workspace's own owner/admin/member role. See
// server/auth.ts (requireAdmin) and .env.example (ADMIN_BOOTSTRAP_EMAIL).

apiRouter.get('/admin/me', requireAuth, requireAdmin, (req: Request, res: Response) => {
  res.json({ user: req.auth!.user });
});

apiRouter.get(
  '/admin/stats',
  requireAuth,
  requireAdmin,
  ah(async (_req, res) => {
    res.json({ stats: await repo.getAdminStats(), plans: PLANS });
  }),
);

apiRouter.get(
  '/admin/organisations',
  requireAuth,
  requireAdmin,
  ah(async (_req, res) => {
    res.json(await repo.listAllOrganisationsForAdmin());
  }),
);

apiRouter.post(
  '/admin/organisations/:id/plan',
  requireAuth,
  requireAdmin,
  ah(async (req, res) => {
    const { user } = req.auth!;
    const { plan } = req.body || {};
    if (!isValidPlanId(plan)) {
      return res.status(400).json({ error: `Plan must be one of: ${Object.keys(PLANS).join(', ')}.` });
    }

    await repo.setOrganisationPlan(req.params.id, plan);

    await repo.logAuditEvent(undefined, {
      organisationId: req.params.id,
      entityType: 'organisation',
      entityId: req.params.id,
      actorType: 'user',
      actorId: user.id,
      actorName: `${user.fullName} (platform admin)`,
      eventType: 'PLAN_CHANGED',
      metadata: { plan },
    }).catch(() => undefined); // best-effort: org may not have prior audit context

    res.json({ success: true, plan });
  }),
);

apiRouter.get(
  '/admin/users',
  requireAuth,
  requireAdmin,
  ah(async (_req, res) => {
    res.json(await repo.listAllUsersForAdmin());
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
