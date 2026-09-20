/**
 * Local-disk document storage fallback.
 *
 * Used automatically when S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 * are not set. It mimics the shape of the real S3 presigned-URL flow (an
 * "upload URL" the browser PUTs bytes to directly, a "download URL" it GETs
 * from) so the frontend needs zero changes to work against either backend —
 * only the URLs point back at this API server instead of an S3-compatible
 * bucket, guarded by a short-lived HMAC token instead of AWS SigV4.
 *
 * This is a stopgap for local development and hosts without a bucket wired
 * up yet — NOT durable storage. On most hosting platforms (Netlify
 * functions, most container platforms without a persistent volume) the
 * local disk is wiped on every deploy/restart. Wire up real S3-compatible
 * storage before relying on this in production.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import express, { Request, Response } from 'express';

const ROOT = process.env.LOCAL_STORAGE_DIR
  ? path.resolve(process.env.LOCAL_STORAGE_DIR)
  : path.resolve(process.cwd(), 'local-uploads');

// Falls back to a per-process random secret if nothing is configured, so
// tokens still can't be forged — they just won't survive a server restart,
// which is fine since the underlying files may not either in this mode.
const SECRET =
  process.env.LOCAL_STORAGE_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const UPLOAD_URL_TTL_MS = Number(process.env.S3_UPLOAD_URL_TTL || 900) * 1000;
const DOWNLOAD_URL_TTL_MS = Number(process.env.S3_DOWNLOAD_URL_TTL || 300) * 1000;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);

function sign(storageKey: string, expiresAt: number, action: 'put' | 'get'): string {
  return crypto.createHmac('sha256', SECRET).update(`${action}:${storageKey}:${expiresAt}`).digest('hex');
}

function verify(storageKey: string, expiresAt: number, action: 'put' | 'get', token: string): boolean {
  if (!token || Date.now() > expiresAt) return false;
  const expected = sign(storageKey, expiresAt, action);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function resolvePath(storageKey: string): string {
  // storageKey is always produced by buildStorageKey() (org/.../file), never
  // taken from the client as a path, but this guards against any traversal
  // regardless of where a key came from.
  const normalized = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(ROOT, normalized);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) {
    throw Object.assign(new Error('Invalid storage key.'), { statusCode: 400 });
  }
  return full;
}

/**
 * apiBaseUrl must be this API server's own public origin (e.g.
 * "https://api.example.com" or, in dev, "http://localhost:3000") — NOT
 * APP_ORIGIN, which points at the separate frontend deployment. Callers
 * derive it from the incoming request (see requestOrigin() below) so this
 * works correctly regardless of what domain the API is actually reached at.
 */
export function buildLocalUploadUrl(storageKey: string, apiBaseUrl: string): string {
  const expiresAt = Date.now() + UPLOAD_URL_TTL_MS;
  const token = sign(storageKey, expiresAt, 'put');
  return `${apiBaseUrl}/api/local-storage/objects?key=${encodeURIComponent(
    storageKey,
  )}&expires=${expiresAt}&token=${token}`;
}

export function buildLocalDownloadUrl(storageKey: string, fileName: string, apiBaseUrl: string): string {
  const expiresAt = Date.now() + DOWNLOAD_URL_TTL_MS;
  const token = sign(storageKey, expiresAt, 'get');
  return `${apiBaseUrl}/api/local-storage/objects?key=${encodeURIComponent(
    storageKey,
  )}&expires=${expiresAt}&token=${token}&download=${encodeURIComponent(fileName)}`;
}

/** Derives this server's own public origin from the incoming request. */
export function requestOrigin(req: { protocol: string; get(name: string): string | undefined }): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = (forwardedProto || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('host') || 'localhost';
  return `${protocol}://${host}`;
}

export async function headLocalObject(
  storageKey: string,
): Promise<{ size: number; sha256Hex?: string } | null> {
  try {
    const stat = await fsp.stat(resolvePath(storageKey));
    if (!stat.isFile()) return null;
    return { size: stat.size };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

export async function deleteLocalObject(storageKey: string): Promise<void> {
  await fsp.unlink(resolvePath(storageKey)).catch((err: any) => {
    if (err?.code !== 'ENOENT') throw err;
  });
}

/**
 * Express router mounted directly on the app (before the global JSON body
 * parser — see server/index.ts) so the PUT handler can read the raw upload
 * body itself.
 */
export const localStorageRouter = express.Router();

localStorageRouter.put(
  '/objects',
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    try {
      const key = String(req.query.key || '');
      const expires = Number(req.query.expires || 0);
      const token = String(req.query.token || '');

      if (!key || !verify(key, expires, 'put', token)) {
        return res.status(403).json({ error: 'This upload link is invalid or has expired.' });
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'No file data received.' });
      }
      if (body.length > MAX_UPLOAD_BYTES) {
        return res
          .status(413)
          .json({ error: `Files must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` });
      }

      const full = resolvePath(key);
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, body);

      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('[local-storage] upload failed:', err.message);
      res.status(err.statusCode || 500).json({ error: 'Upload failed.' });
    }
  },
);

localStorageRouter.get('/objects', async (req: Request, res: Response) => {
  try {
    const key = String(req.query.key || '');
    const expires = Number(req.query.expires || 0);
    const token = String(req.query.token || '');

    if (!key || !verify(key, expires, 'get', token)) {
      return res.status(403).json({ error: 'This download link is invalid or has expired.' });
    }

    const full = resolvePath(key);
    if (!fs.existsSync(full)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const downloadName = req.query.download ? String(req.query.download) : undefined;
    if (downloadName) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    }
    fs.createReadStream(full).pipe(res);
  } catch (err: any) {
    console.error('[local-storage] download failed:', err.message);
    res.status(err.statusCode || 500).json({ error: 'Download failed.' });
  }
});
