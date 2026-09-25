/**
 * Rate limiting for authentication endpoints.
 *
 * In-memory and per-process — good enough for a single API instance, and
 * dramatically better than the "not yet built" this project shipped with
 * before, but it resets on restart and does not coordinate across multiple
 * instances. If you run more than one API process behind a load balancer,
 * replace the Map below with a shared store (Redis's INCR + EXPIRE is the
 * standard approach) so limits are enforced across all of them rather than
 * per-instance.
 *
 * Keyed by IP + a route-specific key (e.g. the email being attempted), so a
 * single attacker can't lock out someone else's account by spraying failed
 * logins for one address, and one person mistyping their own password
 * repeatedly doesn't get blocked by traffic elsewhere on the same NAT.
 */

import { Request, Response, NextFunction } from 'express';
import { clientIp } from './auth';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Sweep expired buckets occasionally so this doesn't grow unbounded on a
// long-running process. Not exact, just cheap housekeeping.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  },
  10 * 60 * 1000,
).unref();

export function rateLimit(options: {
  /** Distinguishes this limiter's routes from others sharing the module (e.g. 'login' vs 'register'). */
  scope: string;
  /** Max attempts allowed within the window. */
  max: number;
  windowMs: number;
  /** Extra key material beyond IP — e.g. the attempted email, lowercased. Falls back to IP-only. */
  keyExtra?: (req: Request) => string | undefined;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const extra = options.keyExtra?.(req);
    const key = `${options.scope}:${clientIp(req)}:${extra || ''}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error:
          options.message ||
          `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60) || 1} minute(s).`,
      });
    }

    next();
  };
}

/** Emails are matched case-insensitively everywhere else in auth, so key on the same normalisation. */
export function emailKey(req: Request): string | undefined {
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : undefined;
}
