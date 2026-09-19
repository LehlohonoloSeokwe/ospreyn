/**
 * Ospreyn database layer.
 *
 * A single pg Pool backed by DATABASE_URL. Every piece of Ospreyn state lives
 * here; there is no in-process cache and no fallback store. If DATABASE_URL is
 * absent the process refuses to start, because silently running on memory is
 * how a rights ledger quietly loses a rights ledger.
 */

import pg from 'pg';
import type { PoolClient } from 'pg';

const { Pool, types } = pg;

// Return DATE columns as plain 'YYYY-MM-DD' strings rather than JS Dates, so
// release_date round-trips without timezone drift.
types.setTypeParser(1082, (value: string) => value);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Ospreyn requires a PostgreSQL 16+ database. ' +
      'See .env.example for the expected format.',
  );
}

const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Run a set of statements in a single transaction. Used anywhere a partial
 * write would leave the rights record in a state that misrepresents what the
 * contributors actually agreed to.
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** snake_case DB row -> camelCase domain object. */
export function camel<T = any>(row: Record<string, any> | null | undefined): T | null {
  if (!row) return null;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    out[camelKey] = value instanceof Date ? value.toISOString() : value;
  }
  return out as T;
}

export function camelAll<T = any>(rows: Record<string, any>[]): T[] {
  return rows.map((r) => camel<T>(r) as T);
}

export async function verifyConnection(): Promise<void> {
  const row = await queryOne<{ version: string }>('SELECT version() AS version');
  console.log(`[db] connected: ${row?.version?.split(',')[0] ?? 'postgres'}`);
}
