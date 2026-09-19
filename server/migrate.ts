/**
 * Schema migration runner.
 *
 * Applies server/schema.sql, which is written to be idempotent, so this is
 * safe to run on every deploy. Optionally bootstraps a first owner account
 * from BOOTSTRAP_* environment variables.
 *
 *   npm run migrate
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query, queryOne } from './db';
import { hashPassword } from './auth';

const here = path.dirname(fileURLToPath(import.meta.url));

async function applySchema() {
  const candidates = [
    path.join(here, 'schema.sql'),
    path.join(process.cwd(), 'server', 'schema.sql'),
    path.join(process.cwd(), 'schema.sql'),
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error(`schema.sql not found. Looked in:\n  ${candidates.join('\n  ')}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log(`[migrate] applying ${schemaPath}`);
  await pool.query(sql);
  console.log('[migrate] schema applied');
}

/**
 * Create the first owner account so a fresh deployment has something to sign
 * in with. Skipped entirely unless BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD are
 * both set, and skipped again if that user already exists.
 */
async function bootstrapOwner() {
  const email = process.env.BOOTSTRAP_EMAIL;
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.log('[migrate] no BOOTSTRAP_EMAIL/BOOTSTRAP_PASSWORD set, skipping owner bootstrap');
    return;
  }
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_PASSWORD must be at least 12 characters.');
  }

  const existing = await queryOne(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  if (existing) {
    console.log(`[migrate] user ${email} already exists, skipping bootstrap`);
    return;
  }

  const fullName = process.env.BOOTSTRAP_FULL_NAME || 'Ospreyn Owner';
  const orgName = process.env.BOOTSTRAP_ORG_NAME || 'My Workspace';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = (
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, stage_name)
         VALUES (lower($1), $2, $3, $4) RETURNING *`,
        [email, hashPassword(password), fullName, process.env.BOOTSTRAP_STAGE_NAME || null],
      )
    ).rows[0];

    const org = (
      await client.query(`INSERT INTO organisations (name, owner_id) VALUES ($1, $2) RETURNING *`, [
        orgName,
        user.id,
      ])
    ).rows[0];

    await client.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [org.id, user.id],
    );

    await client.query(
      `INSERT INTO contributors (organisation_id, full_name, professional_name, email)
       VALUES ($1, $2, $3, lower($4)) ON CONFLICT (organisation_id, email) DO NOTHING`,
      [org.id, fullName, process.env.BOOTSTRAP_STAGE_NAME || null, email],
    );

    await client.query('COMMIT');
    console.log(`[migrate] created owner ${email} and workspace "${orgName}"`);
    console.log('[migrate] remove BOOTSTRAP_PASSWORD from your environment now that it is used');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  await applySchema();
  await bootstrapOwner();

  const counts = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log(`[migrate] ${counts.length} tables present: ${counts.map((c) => c.table_name).join(', ')}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('[migrate] failed:', err.message);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
