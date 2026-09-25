/**
 * Ospreyn authentication.
 *
 * Cookie-based sessions backed by the `sessions` table. Session tokens are
 * 32 random bytes; only their SHA-256 hash is stored, so a database dump does
 * not hand over live sessions. Passwords use scrypt with a per-user salt.
 *
 * Every /api route except the public review-portal endpoints and /auth/login
 * passes through requireAuth, which resolves the real user from the cookie.
 * Organisation scope is derived from membership, never from a client header.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { camel, query, queryOne } from './db';
import { Organisation, User, WorkspaceRole } from '../src/types';

const SESSION_COOKIE = 'ospreyn_session';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);
const SCRYPT_KEYLEN = 64;

export interface AuthContext {
  user: User;
  organisation: Organisation;
  role: WorkspaceRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// --- Password hashing (scrypt, no external dependency) ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = crypto.scryptSync(password, salt, expected.length);
  // Constant-time compare to avoid leaking the hash through response timing.
  return crypto.timingSafeEqual(derived, expected);
}

// --- Session lifecycle ---

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createSession(
  userId: string,
  req: Request,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,
      (req.headers['user-agent'] || '').slice(0, 255),
      clientIp(req),
      expiresAt,
    ],
  );

  return { rawToken, expiresAt };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(rawToken)],
  );
}

export function setSessionCookie(res: Response, rawToken: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, rawToken, cookieOptions(expiresAt));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function cookieOptions(expiresAt?: Date) {
  const crossSite = process.env.COOKIE_SAMESITE === 'none' || isCrossSiteDeployment();
  return {
    httpOnly: true,
    // A Netlify frontend calling an API on another host is a cross-site
    // request, which requires SameSite=None and therefore Secure.
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
    secure: crossSite || process.env.NODE_ENV === 'production',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    expires: expiresAt,
  };
}

function isCrossSiteDeployment(): boolean {
  const appOrigin = process.env.APP_ORIGIN;
  const apiOrigin = process.env.API_ORIGIN;
  if (!appOrigin || !apiOrigin) return process.env.NODE_ENV === 'production';
  try {
    return new URL(appOrigin).host !== new URL(apiOrigin).host;
  } catch {
    return true;
  }
}

export function readSessionToken(req: Request): string | null {
  const fromCookie = (req as any).cookies?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  // Bearer fallback for non-browser API clients.
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 45);
  }
  return (req.socket.remoteAddress || 'unknown').slice(0, 45);
}

/**
 * Resolve the session cookie to a user, their active organisation and their
 * role in it. The active organisation is the one named by the
 * `x-org-id` header *only if* the user is a member of it; otherwise it falls
 * back to their default membership. A header can select among workspaces the
 * user already belongs to. It can never grant access to one they do not.
 */
export async function resolveAuth(req: Request): Promise<AuthContext | null> {
  const rawToken = readSessionToken(req);
  if (!rawToken) return null;

  const row = await queryOne<any>(
    `SELECT u.id, u.email, u.full_name, u.stage_name, u.phone, u.is_platform_admin,
            u.avatar_key, u.bio, u.social_links, u.email_verified_at,
            u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [hashToken(rawToken)],
  );
  if (!row) return null;

  const user = camel<User>(row) as User;

  const requestedOrgId = req.headers['x-org-id'] as string | undefined;
  let membership: any = null;

  if (requestedOrgId) {
    membership = await queryOne<any>(
      `SELECT om.role, o.*
         FROM organisation_members om
         JOIN organisations o ON o.id = om.organisation_id
        WHERE om.user_id = $1 AND om.organisation_id = $2`,
      [user.id, requestedOrgId],
    );
  }

  if (!membership) {
    membership = await queryOne<any>(
      `SELECT om.role, o.*
         FROM organisation_members om
         JOIN organisations o ON o.id = om.organisation_id
        WHERE om.user_id = $1
        ORDER BY om.created_at ASC
        LIMIT 1`,
      [user.id],
    );
  }

  if (!membership) return null;

  const { role, ...orgRow } = membership;
  return {
    user,
    organisation: camel<Organisation>(orgRow) as Organisation,
    role: role as WorkspaceRole,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return res.status(401).json({ error: 'Not signed in.' });
    }
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

/** Route guard for actions restricted to workspace owners and admins. */
export function requireRole(...roles: WorkspaceRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Not signed in.' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Your workspace role does not permit this action.' });
    }
    next();
  };
}

// --- Single-use action tokens (password reset, email verification) ---
// Same shape as session tokens: 32 random bytes, only the SHA-256 hash
// stored, raw value shown/emailed exactly once. See user_action_tokens in
// schema.sql.

export async function createActionToken(
  userId: string,
  purpose: 'password_reset' | 'email_verification',
  ttlMinutes: number,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  // Invalidate any earlier outstanding token of the same purpose for this
  // user first — only the most recently requested reset/verification link
  // should work, so an old email lying around in an inbox can't be replayed
  // after a newer one was issued.
  await query(
    `UPDATE user_action_tokens SET used_at = now()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );

  await query(
    `INSERT INTO user_action_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, tokenHash, expiresAt],
  );

  return { rawToken, expiresAt };
}

/** Consumes a token if valid, returning the user id it belonged to, or null. */
export async function consumeActionToken(
  rawToken: string,
  purpose: 'password_reset' | 'email_verification',
): Promise<string | null> {
  const row = await queryOne<{ id: string; user_id: string }>(
    `UPDATE user_action_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING id, user_id`,
    [hashToken(rawToken), purpose],
  );
  return row?.user_id || null;
}

/**
 * Route guard for the /admin platform-administration API. This checks
 * users.is_platform_admin, which is entirely separate from a workspace's own
 * owner/admin/member role — a workspace admin is not a platform admin.
 * Must run after requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Not signed in.' });
  if (!req.auth.user.isPlatformAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}
