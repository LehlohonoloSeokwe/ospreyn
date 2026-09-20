/**
 * Ospreyn document vault: private object storage.
 *
 * Files never touch the API server's filesystem. The browser uploads directly
 * to object storage using a short-lived presigned PUT URL, and downloads using
 * a short-lived presigned GET URL. The bucket must be private; these URLs are
 * the only way in.
 *
 * Works against any S3-compatible store (AWS S3, Cloudflare R2, Backblaze B2,
 * MinIO) by setting S3_ENDPOINT.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildLocalUploadUrl, buildLocalDownloadUrl, headLocalObject, deleteLocalObject } from './localStorage';

const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION || 'us-east-1';
const endpoint = process.env.S3_ENDPOINT || undefined;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

/** True when real S3-compatible object storage is configured. */
export const s3Configured = Boolean(bucket && accessKeyId && secretAccessKey);

/**
 * Storage is always "configured" in the sense that uploads are accepted —
 * when S3 isn't set up, requests fall back to local disk (see
 * ./localStorage.ts) rather than being rejected outright. Kept for the
 * routes that used to gate on it.
 */
export const storageConfigured = true;

export const storageMode: 'S3' | 'local-disk' = s3Configured ? 'S3' : 'local-disk';

if (!s3Configured) {
  console.warn(
    '[storage] S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not all set. ' +
      'Falling back to local-disk storage — durable on a persistent volume, but wiped on ' +
      'most platforms\' deploys/restarts. Configure S3 before relying on this in production.',
  );
}

const client = s3Configured
  ? new S3Client({
      region,
      endpoint,
      // R2, B2 and MinIO require path-style addressing.
      forcePathStyle: Boolean(endpoint) && process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    })
  : null;

const UPLOAD_URL_TTL = Number(process.env.S3_UPLOAD_URL_TTL || 900); // 15 minutes
const DOWNLOAD_URL_TTL = Number(process.env.S3_DOWNLOAD_URL_TTL || 300); // 5 minutes

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function requireClient(): S3Client {
  if (!client) {
    throw Object.assign(new Error('Object storage is not configured on this server.'), {
      statusCode: 503,
    });
  }
  return client;
}

export function buildStorageKey(params: {
  organisationId: string;
  songId: string;
  versionNumber: number;
  documentId: string;
  fileName: string;
}): string {
  const safeName = params.fileName
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
  return `org/${params.organisationId}/song/${params.songId}/v${params.versionNumber}/${params.documentId}/${safeName}`;
}

export async function createUploadUrl(
  storageKey: string,
  mimeType: string,
  checksumSha256Base64: string | undefined,
  localApiBaseUrl: string,
): Promise<string> {
  if (!s3Configured) return buildLocalUploadUrl(storageKey, localApiBaseUrl);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
    // When the client supplies a SHA-256, S3 verifies the body against it and
    // rejects the upload on mismatch. That is what makes the stored checksum
    // meaningful rather than decorative.
    ...(checksumSha256Base64 ? { ChecksumSHA256: checksumSha256Base64 } : {}),
    ServerSideEncryption: process.env.S3_SSE === 'false' ? undefined : 'AES256',
  });
  return getSignedUrl(requireClient(), command, { expiresIn: UPLOAD_URL_TTL });
}

export async function createDownloadUrl(
  storageKey: string,
  fileName: string,
  localApiBaseUrl: string,
): Promise<string> {
  if (!s3Configured) return buildLocalDownloadUrl(storageKey, fileName, localApiBaseUrl);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
  });
  return getSignedUrl(requireClient(), command, { expiresIn: DOWNLOAD_URL_TTL });
}

/**
 * Confirm the object actually landed. Returns the size and, where the store
 * recorded one, the SHA-256 digest of the stored bytes.
 */
export async function headObject(
  storageKey: string,
): Promise<{ size: number; checksumSha256Base64?: string; mimeType?: string } | null> {
  if (!s3Configured) {
    const local = await headLocalObject(storageKey);
    return local ? { size: local.size } : null;
  }

  try {
    const result = await requireClient().send(
      new HeadObjectCommand({ Bucket: bucket, Key: storageKey, ChecksumMode: 'ENABLED' }),
    );
    return {
      size: Number(result.ContentLength || 0),
      checksumSha256Base64: result.ChecksumSHA256,
      mimeType: result.ContentType,
    };
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
    throw err;
  }
}

export async function deleteObject(storageKey: string): Promise<void> {
  if (!s3Configured) return deleteLocalObject(storageKey);
  await requireClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

/** base64 (as S3 reports it) -> hex (as the schema stores it). */
export function base64ToHex(value?: string): string | null {
  if (!value) return null;
  return Buffer.from(value, 'base64').toString('hex');
}
