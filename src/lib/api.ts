/**
 * Ospreyn API client.
 *
 * The API lives on a different host from this static bundle, so every request
 * goes through here: one configurable base URL, credentials included so the
 * session cookie travels, and one place that turns an error response into a
 * thrown Error with the server's message.
 *
 * Set VITE_API_BASE_URL at build time. Leaving it empty makes requests
 * same-origin, which is what you want when running the API behind a local
 * proxy in development.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
export const API_BASE_URL = RAW_BASE.replace(/\/$/, '');

if (import.meta.env.PROD && !API_BASE_URL) {
  // A production bundle with no API host will send /api/* to the Netlify CDN,
  // which has no such routes. Fail loudly in the console rather than showing
  // an empty dashboard.
  console.error(
    'VITE_API_BASE_URL is not set. Set it to your API host (e.g. https://api.example.com) ' +
      'in Netlify > Site configuration > Environment variables, then redeploy.',
  );
}

export class ApiError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }

  get requiresVersionBump(): boolean {
    return Boolean(this.payload?.requiresVersionBump);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiFetch<T = any>(path: string, options: Options = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...rest,
    // Sends and accepts the session cookie across origins.
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 204) return undefined as T;

  let payload: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error || `Request failed (${response.status})`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path),
  post: <T = any>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  put: <T = any>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  patch: <T = any>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T = any>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** SHA-256 of a file, base64-encoded, for end-to-end upload integrity. */
export async function sha256Base64(file: File): Promise<string | undefined> {
  if (!crypto?.subtle) return undefined;
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  } catch {
    return undefined;
  }
}
