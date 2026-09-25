/**
 * Ospreyn data access.
 *
 * Every function here reads or writes PostgreSQL. This module replaces the
 * former in-memory OspreynStore entirely; nothing is cached in process.
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { camel, camelAll, query, queryOne, tx } from './db';
import {
  Agreement,
  AuditEvent,
  Contributor,
  ContributorConfirmation,
  DocumentRecord,
  Invitation,
  Organisation,
  OrganisationMember,
  OwnershipAllocation,
  RightsRecordVersion,
  RightsValidationSummary,
  Song,
  SongContributor,
  TeamInvitation,
  User,
} from '../src/types';

type Executor = Pick<PoolClient, 'query'>;

async function run<T = any>(
  exec: Executor | undefined,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (exec) return (await exec.query(text, params)).rows as T[];
  return query<T>(text, params);
}

async function runOne<T = any>(
  exec: Executor | undefined,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await run<T>(exec, text, params);
  return rows.length ? rows[0] : null;
}

// ==========================================
// Songs
// ==========================================

export async function listSongs(organisationId: string): Promise<Song[]> {
  return camelAll<Song>(
    await query(
      `SELECT * FROM songs WHERE organisation_id = $1 ORDER BY updated_at DESC`,
      [organisationId],
    ),
  );
}

/**
 * Fetch a song, scoped to the caller's organisation. Passing organisationId is
 * mandatory: it is what stops one workspace reading another's rights records
 * by guessing a UUID.
 */
export async function getSong(songId: string, organisationId: string): Promise<Song | null> {
  return camel<Song>(
    await queryOne(`SELECT * FROM songs WHERE id = $1 AND organisation_id = $2`, [
      songId,
      organisationId,
    ]),
  );
}

/** Unscoped lookup, used only by the token-guarded review portal. */
export async function getSongById(songId: string, exec?: Executor): Promise<Song | null> {
  return camel<Song>(await runOne(exec, `SELECT * FROM songs WHERE id = $1`, [songId]));
}

export async function createSong(
  exec: Executor,
  data: {
    organisationId: string;
    title: string;
    primaryArtist: string;
    releaseDate?: string | null;
    genre?: string | null;
    isrc?: string | null;
    catalogueReference?: string | null;
    notes?: string | null;
  },
): Promise<Song> {
  const row = await runOne(
    exec,
    `INSERT INTO songs (organisation_id, title, primary_artist, release_date, genre, isrc, catalogue_reference, notes, status, current_version_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 1)
     RETURNING *`,
    [
      data.organisationId,
      data.title,
      data.primaryArtist,
      data.releaseDate || null,
      data.genre || null,
      data.isrc || null,
      data.catalogueReference || null,
      data.notes || null,
    ],
  );
  return camel<Song>(row) as Song;
}

export async function updateSongFields(
  exec: Executor | undefined,
  songId: string,
  fields: Record<string, unknown>,
): Promise<Song | null> {
  const columns = Object.keys(fields);
  if (columns.length === 0) return getSongById(songId, exec);

  const assignments = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
  const row = await runOne(
    exec,
    `UPDATE songs SET ${assignments}, updated_at = now() WHERE id = $1 RETURNING *`,
    [songId, ...columns.map((c) => fields[c])],
  );
  return camel<Song>(row);
}

// ==========================================
// Versions
// ==========================================

export async function listVersions(songId: string, exec?: Executor): Promise<RightsRecordVersion[]> {
  return camelAll<RightsRecordVersion>(
    await run(
      exec,
      `SELECT * FROM rights_record_versions WHERE song_id = $1 ORDER BY version_number ASC`,
      [songId],
    ),
  );
}

export async function getCurrentVersion(
  songId: string,
  exec?: Executor,
): Promise<RightsRecordVersion | null> {
  return camel<RightsRecordVersion>(
    await runOne(
      exec,
      `SELECT * FROM rights_record_versions WHERE song_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [songId],
    ),
  );
}

export async function getVersionById(
  versionId: string,
  exec?: Executor,
): Promise<RightsRecordVersion | null> {
  return camel<RightsRecordVersion>(
    await runOne(exec, `SELECT * FROM rights_record_versions WHERE id = $1`, [versionId]),
  );
}

export async function createVersion(
  exec: Executor,
  data: {
    songId: string;
    versionNumber: number;
    status: string;
    changeReason?: string | null;
    createdBy: string;
  },
): Promise<RightsRecordVersion> {
  const row = await runOne(
    exec,
    `INSERT INTO rights_record_versions (song_id, version_number, status, change_reason, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.songId, data.versionNumber, data.status, data.changeReason || null, data.createdBy],
  );
  return camel<RightsRecordVersion>(row) as RightsRecordVersion;
}

export async function setVersionStatus(
  exec: Executor | undefined,
  versionId: string,
  status: string,
  confirmedAt?: Date | null,
): Promise<void> {
  await run(
    exec,
    `UPDATE rights_record_versions
        SET status = $2, confirmed_at = COALESCE($3, confirmed_at)
      WHERE id = $1`,
    [versionId, status, confirmedAt || null],
  );
}

// ==========================================
// Contributors
// ==========================================

export async function listContributors(organisationId: string): Promise<Contributor[]> {
  return camelAll<Contributor>(
    await query(
      `SELECT * FROM contributors WHERE organisation_id = $1 ORDER BY full_name ASC`,
      [organisationId],
    ),
  );
}

export async function getContributor(
  contributorId: string,
  organisationId?: string,
  exec?: Executor,
): Promise<Contributor | null> {
  const sql = organisationId
    ? `SELECT * FROM contributors WHERE id = $1 AND organisation_id = $2`
    : `SELECT * FROM contributors WHERE id = $1`;
  const params = organisationId ? [contributorId, organisationId] : [contributorId];
  return camel<Contributor>(await runOne(exec, sql, params));
}

export async function findContributorByEmail(
  organisationId: string,
  email: string,
  exec?: Executor,
): Promise<Contributor | null> {
  return camel<Contributor>(
    await runOne(
      exec,
      `SELECT * FROM contributors WHERE organisation_id = $1 AND lower(email) = lower($2)`,
      [organisationId, email],
    ),
  );
}

export async function upsertContributor(
  exec: Executor,
  data: {
    organisationId: string;
    fullName: string;
    professionalName?: string | null;
    email: string;
    phone?: string | null;
  },
): Promise<Contributor> {
  const row = await runOne(
    exec,
    `INSERT INTO contributors (organisation_id, full_name, professional_name, email, phone)
     VALUES ($1, $2, $3, lower($4), $5)
     ON CONFLICT (organisation_id, email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           professional_name = COALESCE(EXCLUDED.professional_name, contributors.professional_name),
           phone = COALESCE(EXCLUDED.phone, contributors.phone),
           updated_at = now()
     RETURNING *`,
    [
      data.organisationId,
      data.fullName,
      data.professionalName || null,
      data.email,
      data.phone || null,
    ],
  );
  return camel<Contributor>(row) as Contributor;
}

export async function listSongContributors(
  songId: string,
  exec?: Executor,
): Promise<SongContributor[]> {
  const rows = await run(
    exec,
    `SELECT sc.*, row_to_json(c.*) AS contributor_json
       FROM song_contributors sc
       JOIN contributors c ON c.id = sc.contributor_id
      WHERE sc.song_id = $1
      ORDER BY sc.created_at ASC`,
    [songId],
  );
  return rows.map((row: any) => {
    const { contributor_json, ...rest } = row;
    const sc = camel<SongContributor>(rest) as SongContributor;
    sc.contributor = camel<Contributor>(contributor_json) as Contributor;
    return sc;
  });
}

export async function addSongContributor(
  exec: Executor,
  songId: string,
  contributorId: string,
  role: string,
  customRoleTitle?: string | null,
): Promise<SongContributor> {
  const row = await runOne(
    exec,
    `INSERT INTO song_contributors (song_id, contributor_id, role, custom_role_title)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (song_id, contributor_id, role) DO UPDATE
       SET custom_role_title = EXCLUDED.custom_role_title
     RETURNING *`,
    [songId, contributorId, role, customRoleTitle || null],
  );
  return camel<SongContributor>(row) as SongContributor;
}

export async function getSongContributor(
  songContributorId: string,
  songId: string,
): Promise<SongContributor | null> {
  return camel<SongContributor>(
    await queryOne(`SELECT * FROM song_contributors WHERE id = $1 AND song_id = $2`, [
      songContributorId,
      songId,
    ]),
  );
}

export async function removeSongContributor(songContributorId: string): Promise<void> {
  await query(`DELETE FROM song_contributors WHERE id = $1`, [songContributorId]);
}

// ==========================================
// Ownership allocations
// ==========================================

export async function listAllocations(
  versionId: string,
  exec?: Executor,
): Promise<OwnershipAllocation[]> {
  const rows = await run(
    exec,
    `SELECT oa.*, row_to_json(c.*) AS contributor_json
       FROM ownership_allocations oa
       JOIN contributors c ON c.id = oa.contributor_id
      WHERE oa.version_id = $1
      ORDER BY oa.right_type ASC, oa.basis_points DESC`,
    [versionId],
  );
  return rows.map((row: any) => {
    const { contributor_json, ...rest } = row;
    const alloc = camel<OwnershipAllocation>(rest) as OwnershipAllocation;
    alloc.contributor = camel<Contributor>(contributor_json) as Contributor;
    return alloc;
  });
}

export async function setOwnership(
  exec: Executor,
  versionId: string,
  songId: string,
  contributorId: string,
  rightType: 'COMPOSITION' | 'MASTER',
  basisPoints: number,
): Promise<void> {
  if (basisPoints === 0) {
    await run(
      exec,
      `DELETE FROM ownership_allocations
        WHERE version_id = $1 AND contributor_id = $2 AND right_type = $3`,
      [versionId, contributorId, rightType],
    );
    return;
  }
  await run(
    exec,
    `INSERT INTO ownership_allocations (version_id, song_id, contributor_id, right_type, basis_points)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (version_id, contributor_id, right_type) DO UPDATE
       SET basis_points = EXCLUDED.basis_points`,
    [versionId, songId, contributorId, rightType, basisPoints],
  );
}

export async function cloneAllocations(
  exec: Executor,
  fromVersionId: string,
  toVersionId: string,
): Promise<void> {
  await run(
    exec,
    `INSERT INTO ownership_allocations (version_id, song_id, contributor_id, right_type, basis_points)
     SELECT $2, song_id, contributor_id, right_type, basis_points
       FROM ownership_allocations WHERE version_id = $1
     ON CONFLICT (version_id, contributor_id, right_type) DO NOTHING`,
    [fromVersionId, toVersionId],
  );
}

/**
 * Ownership completeness, computed in SQL so the totals always reflect what is
 * actually stored rather than whatever the client last sent.
 */
export async function getOwnershipValidation(
  versionId: string,
  exec?: Executor,
): Promise<RightsValidationSummary> {
  const row = await runOne<any>(
    exec,
    `WITH alloc AS (
        SELECT right_type, contributor_id, basis_points
          FROM ownership_allocations WHERE version_id = $1
     )
     SELECT
       COALESCE((SELECT SUM(basis_points) FROM alloc WHERE right_type = 'COMPOSITION'), 0)::int AS comp_bps,
       COALESCE((SELECT SUM(basis_points) FROM alloc WHERE right_type = 'MASTER'), 0)::int AS master_bps,
       (SELECT COUNT(DISTINCT contributor_id) FROM alloc WHERE basis_points > 0)::int AS total_contributors,
       (SELECT COUNT(*) FROM contributor_confirmations
          WHERE version_id = $1 AND action = 'confirmed'
            AND contributor_id IN (SELECT DISTINCT contributor_id FROM alloc WHERE basis_points > 0)
       )::int AS confirmed_count`,
    [versionId],
  );

  const compBps = row?.comp_bps ?? 0;
  const masterBps = row?.master_bps ?? 0;
  const totalContributorsCount = row?.total_contributors ?? 0;
  const confirmedCount = row?.confirmed_count ?? 0;

  const isCompositionComplete = compBps === 10000;
  const isMasterComplete = masterBps === 10000;
  const pendingConfirmationsCount = Math.max(0, totalContributorsCount - confirmedCount);

  return {
    compositionBasisPoints: compBps,
    masterBasisPoints: masterBps,
    compositionPercentage: Number((compBps / 100).toFixed(2)),
    masterPercentage: Number((masterBps / 100).toFixed(2)),
    isCompositionComplete,
    isMasterComplete,
    isOverallocated: compBps > 10000 || masterBps > 10000,
    canProceedToInvite: isCompositionComplete && isMasterComplete,
    canProceedToAgreement:
      isCompositionComplete &&
      isMasterComplete &&
      pendingConfirmationsCount === 0 &&
      totalContributorsCount > 0,
    pendingConfirmationsCount,
    totalContributorsCount,
  };
}

// ==========================================
// Invitations
// ==========================================

export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Invitations for a version. token_hash is excluded in the query rather than
 * stripped afterwards, so there is no code path where it reaches a response.
 */
export async function listInvitations(
  songId: string,
  versionId: string,
): Promise<Invitation[]> {
  const rows = await query(
    `SELECT i.id, i.song_id, i.contributor_id, i.version_id, i.status,
            i.invited_at, i.expires_at, i.used_at, i.revoked_at, i.created_by,
            row_to_json(c.*) AS contributor_json
       FROM invitations i
       JOIN contributors c ON c.id = i.contributor_id
      WHERE i.song_id = $1 AND i.version_id = $2
      ORDER BY i.invited_at DESC`,
    [songId, versionId],
  );
  return rows.map((row: any) => {
    const { contributor_json, ...rest } = row;
    const inv = camel<Invitation>(rest) as Invitation;
    inv.contributor = camel<Contributor>(contributor_json) as Contributor;
    return inv;
  });
}

export async function revokePendingInvitations(
  exec: Executor,
  songId: string,
  contributorId: string,
): Promise<void> {
  await run(
    exec,
    `UPDATE invitations SET status = 'revoked', revoked_at = now()
      WHERE song_id = $1 AND contributor_id = $2 AND status IN ('pending', 'viewed')`,
    [songId, contributorId],
  );
}

export async function createInvitation(
  exec: Executor,
  data: {
    songId: string;
    contributorId: string;
    versionId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  },
): Promise<Invitation> {
  const row = await runOne(
    exec,
    `INSERT INTO invitations (song_id, contributor_id, version_id, token_hash, status, expires_at, created_by)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
    [
      data.songId,
      data.contributorId,
      data.versionId,
      data.tokenHash,
      data.expiresAt,
      data.createdBy,
    ],
  );
  return camel<Invitation>(row) as Invitation;
}

export async function findInvitationByTokenHash(
  tokenHash: string,
  exec?: Executor,
): Promise<Invitation | null> {
  return camel<Invitation>(
    await runOne(exec, `SELECT * FROM invitations WHERE token_hash = $1`, [tokenHash]),
  );
}

export async function markInvitationViewed(invitationId: string): Promise<void> {
  await query(`UPDATE invitations SET status = 'viewed' WHERE id = $1 AND status = 'pending'`, [
    invitationId,
  ]);
}

export async function markInvitationUsed(
  exec: Executor,
  invitationId: string,
  status: string,
): Promise<void> {
  await run(exec, `UPDATE invitations SET status = $2, used_at = now() WHERE id = $1`, [
    invitationId,
    status,
  ]);
}

// ==========================================
// Confirmations
// ==========================================

export async function listConfirmations(
  versionId: string,
  exec?: Executor,
): Promise<ContributorConfirmation[]> {
  const rows = await run(
    exec,
    `SELECT cc.*, row_to_json(c.*) AS contributor_json
       FROM contributor_confirmations cc
       JOIN contributors c ON c.id = cc.contributor_id
      WHERE cc.version_id = $1
      ORDER BY cc.timestamp ASC`,
    [versionId],
  );
  return rows.map((row: any) => {
    const { contributor_json, ...rest } = row;
    const conf = camel<ContributorConfirmation>(rest) as ContributorConfirmation;
    conf.contributor = camel<Contributor>(contributor_json) as Contributor;
    return conf;
  });
}

export async function findConfirmation(
  versionId: string,
  contributorId: string,
): Promise<ContributorConfirmation | null> {
  return camel<ContributorConfirmation>(
    await queryOne(
      `SELECT * FROM contributor_confirmations WHERE version_id = $1 AND contributor_id = $2`,
      [versionId, contributorId],
    ),
  );
}

export async function recordConfirmation(
  exec: Executor,
  params: {
    songId: string;
    versionId: string;
    agreementVersion: number;
    contributorId: string;
    action: 'confirmed' | 'change_requested';
    participantName: string;
    identityReference: string;
    changeRequestComment?: string | null;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<ContributorConfirmation> {
  const confirmationStatement =
    params.action === 'confirmed'
      ? 'I confirm that the information above accurately records our agreed understanding regarding contributions and ownership for this work.'
      : 'Change requested by contributor.';

  const row = await runOne(
    exec,
    `INSERT INTO contributor_confirmations
       (song_id, version_id, agreement_version, contributor_id, action, confirmation_statement,
        identity_reference, participant_name, change_request_comment, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (version_id, contributor_id) DO UPDATE
       SET action = EXCLUDED.action,
           confirmation_statement = EXCLUDED.confirmation_statement,
           participant_name = EXCLUDED.participant_name,
           change_request_comment = EXCLUDED.change_request_comment,
           ip_address = EXCLUDED.ip_address,
           user_agent = EXCLUDED.user_agent,
           timestamp = now()
     RETURNING *`,
    [
      params.songId,
      params.versionId,
      params.agreementVersion,
      params.contributorId,
      params.action,
      confirmationStatement,
      params.identityReference,
      params.participantName,
      params.changeRequestComment || null,
      params.ipAddress || null,
      (params.userAgent || '').slice(0, 255) || null,
    ],
  );
  return camel<ContributorConfirmation>(row) as ContributorConfirmation;
}

// ==========================================
// Agreements
// ==========================================

export async function listAgreements(songId: string, exec?: Executor): Promise<Agreement[]> {
  return camelAll<Agreement>(
    await run(exec, `SELECT * FROM agreements WHERE song_id = $1 ORDER BY generated_at DESC`, [
      songId,
    ]),
  );
}

export async function createAgreement(
  exec: Executor,
  data: {
    songId: string;
    versionId: string;
    agreementVersion: number;
    title: string;
    documentContent: string;
    disclaimerText: string;
    status: string;
  },
): Promise<Agreement> {
  const row = await runOne(
    exec,
    `INSERT INTO agreements (song_id, version_id, agreement_version, agreement_type, title, document_content, disclaimer_text, status)
     VALUES ($1, $2, $3, 'split_sheet', $4, $5, $6, $7) RETURNING *`,
    [
      data.songId,
      data.versionId,
      data.agreementVersion,
      data.title,
      data.documentContent,
      data.disclaimerText,
      data.status,
    ],
  );
  return camel<Agreement>(row) as Agreement;
}

// ==========================================
// Documents
// ==========================================

export async function listDocuments(songId: string): Promise<DocumentRecord[]> {
  return camelAll<DocumentRecord>(
    await query(
      `SELECT * FROM documents WHERE song_id = $1 AND upload_status = 'stored' ORDER BY created_at DESC`,
      [songId],
    ),
  );
}

export async function createPendingDocument(data: {
  id: string;
  songId: string;
  versionId?: string | null;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  uploadedBy: string;
}): Promise<DocumentRecord> {
  const row = await queryOne(
    `INSERT INTO documents (id, song_id, version_id, storage_key, file_name, mime_type, file_size, category, uploaded_by, upload_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING *`,
    [
      data.id,
      data.songId,
      data.versionId || null,
      data.storageKey,
      data.fileName,
      data.mimeType,
      data.fileSize,
      data.category,
      data.uploadedBy,
    ],
  );
  return camel<DocumentRecord>(row) as DocumentRecord;
}

export async function getDocument(
  documentId: string,
  songId?: string,
): Promise<DocumentRecord | null> {
  const sql = songId
    ? `SELECT * FROM documents WHERE id = $1 AND song_id = $2`
    : `SELECT * FROM documents WHERE id = $1`;
  return camel<DocumentRecord>(await queryOne(sql, songId ? [documentId, songId] : [documentId]));
}

export async function markDocumentStored(
  documentId: string,
  fileSize: number,
  checksum: string | null,
): Promise<DocumentRecord | null> {
  return camel<DocumentRecord>(
    await queryOne(
      `UPDATE documents
          SET upload_status = 'stored', uploaded_at = now(), file_size = $2, checksum = $3
        WHERE id = $1 RETURNING *`,
      [documentId, fileSize, checksum],
    ),
  );
}

export async function deleteDocumentRow(documentId: string): Promise<void> {
  await query(`DELETE FROM documents WHERE id = $1`, [documentId]);
}

// ==========================================
// Audit ledger
// ==========================================

export async function logAuditEvent(
  exec: Executor | undefined,
  params: {
    organisationId: string;
    entityType: string;
    entityId: string;
    songId?: string | null;
    actorType: 'user' | 'contributor' | 'system';
    actorId?: string | null;
    actorName: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AuditEvent> {
  const row = await runOne(
    exec,
    `INSERT INTO audit_events (organisation_id, entity_type, entity_id, song_id, actor_type, actor_id, actor_name, event_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      params.organisationId,
      params.entityType,
      params.entityId,
      params.songId || null,
      params.actorType,
      params.actorId || null,
      params.actorName,
      params.eventType,
      JSON.stringify(params.metadata || {}),
    ],
  );
  return camel<AuditEvent>(row) as AuditEvent;
}

export async function listSongAudit(songId: string): Promise<AuditEvent[]> {
  return camelAll<AuditEvent>(
    await query(`SELECT * FROM audit_events WHERE song_id = $1 ORDER BY created_at DESC`, [songId]),
  );
}

export async function listOrgAudit(organisationId: string, limit = 200): Promise<AuditEvent[]> {
  return camelAll<AuditEvent>(
    await query(
      `SELECT * FROM audit_events WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organisationId, limit],
    ),
  );
}

// ==========================================
// Dashboard
// ==========================================

export async function getDashboardMetrics(organisationId: string) {
  const row = await queryOne<any>(
    `SELECT
        COUNT(*)::int AS total_songs,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status IN ('proposed', 'confirmed'))::int AS awaiting_confirmation_count,
        COUNT(*) FILTER (WHERE status = 'change_requested')::int AS disputed_count,
        COUNT(*) FILTER (WHERE status IN ('draft', 'change_requested'))::int AS needs_attention_count
      FROM songs WHERE organisation_id = $1`,
    [organisationId],
  );
  return {
    totalSongs: row?.total_songs ?? 0,
    completedCount: row?.completed_count ?? 0,
    awaitingConfirmationCount: row?.awaiting_confirmation_count ?? 0,
    disputedCount: row?.disputed_count ?? 0,
    needsAttentionCount: row?.needs_attention_count ?? 0,
  };
}

// ==========================================
// Account / profile
// ==========================================

export async function updateUserProfile(
  userId: string,
  fields: {
    fullName?: string;
    stageName?: string | null;
    bio?: string | null;
    socialLinks?: Record<string, string>;
    phone?: string | null;
  },
): Promise<User> {
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [userId];

  if (fields.fullName !== undefined) {
    values.push(fields.fullName);
    sets.push(`full_name = $${values.length}`);
  }
  if (fields.stageName !== undefined) {
    values.push(fields.stageName);
    sets.push(`stage_name = $${values.length}`);
  }
  if (fields.bio !== undefined) {
    values.push(fields.bio);
    sets.push(`bio = $${values.length}`);
  }
  if (fields.socialLinks !== undefined) {
    values.push(JSON.stringify(fields.socialLinks));
    sets.push(`social_links = $${values.length}::jsonb`);
  }
  if (fields.phone !== undefined) {
    values.push(fields.phone);
    sets.push(`phone = $${values.length}`);
  }

  const row = await queryOne<any>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  const { password_hash, ...safe } = row || {};
  return camel<User>(safe) as User;
}

/** Changing the email address resets verification — the new address hasn't been proven yet. */
export async function updateUserEmail(userId: string, email: string): Promise<User> {
  const row = await queryOne<any>(
    `UPDATE users SET email = lower($2), email_verified_at = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [userId, email],
  );
  const { password_hash, ...safe } = row || {};
  return camel<User>(safe) as User;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
    userId,
    passwordHash,
  ]);
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query(`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, [
    userId,
  ]);
}

export async function setUserAvatarKey(userId: string, avatarKey: string | null): Promise<User> {
  const row = await queryOne<any>(
    `UPDATE users SET avatar_key = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [userId, avatarKey],
  );
  const { password_hash, ...safe } = row || {};
  return camel<User>(safe) as User;
}

export async function getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const row = await queryOne<any>(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
  if (!row) return null;
  return camel<User & { passwordHash: string }>({ ...row, password_hash: row.password_hash });
}

export async function getUserById(userId: string): Promise<User | null> {
  const row = await queryOne<any>(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return camel<User>(safe) as User;
}

// ==========================================
// Evidence Strength & catalogue-wide documents
// ==========================================

/** Every stored document across every song in an organisation — the basis for the dashboard's evidence rollup and storage usage. */
export async function listDocumentsForOrganisation(
  organisationId: string,
): Promise<Array<Pick<DocumentRecord, 'id' | 'songId' | 'category' | 'fileSize'>>> {
  return camelAll(
    await query(
      `SELECT d.id, d.song_id, d.category, d.file_size
         FROM documents d
         JOIN songs s ON s.id = d.song_id
        WHERE s.organisation_id = $1 AND d.upload_status = 'stored'`,
      [organisationId],
    ),
  );
}

// ==========================================
// Team members & invitations
// ==========================================

export async function countOrganisationMembers(organisationId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM organisation_members WHERE organisation_id = $1`,
    [organisationId],
  );
  return Number(row?.count ?? 0);
}

export async function listOrganisationMembers(organisationId: string): Promise<OrganisationMember[]> {
  return camelAll(
    await query(
      `SELECT om.id, om.organisation_id, om.user_id, om.role, om.created_at,
              u.full_name, u.stage_name, u.email
         FROM organisation_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.organisation_id = $1
        ORDER BY om.created_at ASC`,
      [organisationId],
    ),
  );
}

export async function updateMemberRole(
  memberId: string,
  organisationId: string,
  role: 'admin' | 'member',
): Promise<OrganisationMember | null> {
  return camel(
    await queryOne(
      `UPDATE organisation_members SET role = $3
        WHERE id = $1 AND organisation_id = $2 RETURNING *`,
      [memberId, organisationId, role],
    ),
  );
}

export async function removeMember(memberId: string, organisationId: string): Promise<void> {
  await query(`DELETE FROM organisation_members WHERE id = $1 AND organisation_id = $2`, [
    memberId,
    organisationId,
  ]);
}

export function hashActionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createTeamInvitation(params: {
  organisationId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
  rawToken: string;
  expiresAt: Date;
}): Promise<TeamInvitation> {
  const row = await queryOne(
    `INSERT INTO organisation_invitations (organisation_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, lower($2), $3, $4, $5, $6) RETURNING *`,
    [
      params.organisationId,
      params.email,
      params.role,
      hashActionToken(params.rawToken),
      params.invitedBy,
      params.expiresAt,
    ],
  );
  return camel<TeamInvitation>(row) as TeamInvitation;
}

export async function listTeamInvitations(organisationId: string): Promise<TeamInvitation[]> {
  return camelAll(
    await query(
      `SELECT * FROM organisation_invitations
        WHERE organisation_id = $1 AND status = 'pending'
        ORDER BY invited_at DESC`,
      [organisationId],
    ),
  );
}

export async function revokeTeamInvitation(id: string, organisationId: string): Promise<void> {
  await query(
    `UPDATE organisation_invitations SET status = 'revoked', revoked_at = now()
      WHERE id = $1 AND organisation_id = $2 AND status = 'pending'`,
    [id, organisationId],
  );
}

export async function findTeamInvitationByToken(rawToken: string): Promise<TeamInvitation | null> {
  return camel(
    await queryOne(
      `SELECT * FROM organisation_invitations
        WHERE token_hash = $1 AND status = 'pending' AND expires_at > now()`,
      [hashActionToken(rawToken)],
    ),
  );
}

/** Converts an accepted invitation into workspace membership, in one transaction. */
export async function acceptTeamInvitation(
  invitationId: string,
  userId: string,
): Promise<OrganisationMember> {
  return tx(async (client) => {
    const invitation = (
      await client.query(
        `UPDATE organisation_invitations SET status = 'accepted', accepted_at = now()
          WHERE id = $1 AND status = 'pending' RETURNING *`,
        [invitationId],
      )
    ).rows[0];
    if (!invitation) throw Object.assign(new Error('Invitation is no longer valid.'), { statusCode: 410 });

    const member = (
      await client.query(
        `INSERT INTO organisation_members (organisation_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organisation_id, user_id) DO UPDATE SET role = EXCLUDED.role
         RETURNING *`,
        [invitation.organisation_id, userId, invitation.role],
      )
    ).rows[0];

    return camel<OrganisationMember>(member) as OrganisationMember;
  });
}

export async function getOrganisationOwner(
  organisationId: string,
): Promise<{ id: string; fullName: string; email: string; phone: string | null } | null> {
  const row = await queryOne<any>(
    `SELECT u.id, u.full_name, u.email, u.phone
       FROM organisations o
       JOIN users u ON u.id = o.owner_id
      WHERE o.id = $1`,
    [organisationId],
  );
  return row ? camel(row) : null;
}

// ==========================================
// WhatsApp dispatch log
// ==========================================

export interface WhatsAppMessageRecord {
  id: string;
  organisationId: string | null;
  songId: string | null;
  invitationId: string | null;
  direction: 'outbound' | 'inbound';
  purpose: string;
  toNumber: string | null;
  fromNumber: string | null;
  provider: string;
  providerMessageSid: string | null;
  status: string;
  payload: Record<string, unknown>;
  error: string | null;
  createdAt: string;
}

export async function recordWhatsAppMessage(
  exec: Executor | undefined,
  params: {
    organisationId?: string | null;
    songId?: string | null;
    invitationId?: string | null;
    direction: 'outbound' | 'inbound';
    purpose: string;
    toNumber?: string | null;
    fromNumber?: string | null;
    provider?: string;
    providerMessageSid?: string | null;
    status: string;
    payload?: Record<string, unknown>;
    error?: string | null;
  },
): Promise<WhatsAppMessageRecord> {
  const row = await runOne(
    exec,
    `INSERT INTO whatsapp_messages
       (organisation_id, song_id, invitation_id, direction, purpose, to_number, from_number,
        provider, provider_message_sid, status, payload, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      params.organisationId || null,
      params.songId || null,
      params.invitationId || null,
      params.direction,
      params.purpose,
      params.toNumber || null,
      params.fromNumber || null,
      params.provider || 'twilio',
      params.providerMessageSid || null,
      params.status,
      JSON.stringify(params.payload || {}),
      params.error || null,
    ],
  );
  return camel<WhatsAppMessageRecord>(row) as WhatsAppMessageRecord;
}

/** Resolves an inbound button-reply webhook back to the invitation it answers. */
export async function findWhatsAppMessageBySid(
  providerMessageSid: string,
): Promise<WhatsAppMessageRecord | null> {
  const row = await queryOne<any>(
    `SELECT * FROM whatsapp_messages WHERE provider_message_sid = $1 AND direction = 'outbound'
      ORDER BY created_at DESC LIMIT 1`,
    [providerMessageSid],
  );
  return row ? (camel(row) as WhatsAppMessageRecord) : null;
}

export async function getOwnedOrganisationsForDeletion(
  userId: string,
): Promise<Array<{ id: string; name: string; memberCount: number; songCount: number }>> {
  return camelAll(
    await query(
      `SELECT o.id, o.name,
              (SELECT COUNT(*) FROM organisation_members om WHERE om.organisation_id = o.id) AS member_count,
              (SELECT COUNT(*) FROM songs s WHERE s.organisation_id = o.id) AS song_count
         FROM organisations o
        WHERE o.owner_id = $1`,
      [userId],
    ),
  );
}

export async function listDocumentStorageKeysForOrganisations(
  organisationIds: string[],
): Promise<string[]> {
  if (organisationIds.length === 0) return [];
  const rows = await query<{ storage_key: string }>(
    `SELECT d.storage_key
       FROM documents d
       JOIN songs s ON s.id = d.song_id
      WHERE s.organisation_id = ANY($1::uuid[])`,
    [organisationIds],
  );
  return rows.map((r) => r.storage_key);
}

export async function listOrganisationsForUser(userId: string) {
  return camelAll(
    await query(
      `SELECT o.* FROM organisations o
         JOIN organisation_members om ON om.organisation_id = o.id
        WHERE om.user_id = $1 ORDER BY om.created_at ASC`,
      [userId],
    ),
  );
}

// ==========================================
// Plans & platform admin
// ==========================================

export async function countSongsForOrganisation(organisationId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM songs WHERE organisation_id = $1`,
    [organisationId],
  );
  return Number(row?.count ?? 0);
}

export interface AdminOrganisationRow {
  id: string;
  name: string;
  plan: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  memberCount: number;
  songCount: number;
  createdAt: string;
}

/** Every organisation on the platform, for the admin portal. */
export async function listAllOrganisationsForAdmin(): Promise<AdminOrganisationRow[]> {
  return camelAll(
    await query(
      `SELECT o.id, o.name, o.plan, o.owner_id, o.created_at,
              u.email AS owner_email, u.full_name AS owner_name,
              (SELECT COUNT(*) FROM organisation_members om WHERE om.organisation_id = o.id) AS member_count,
              (SELECT COUNT(*) FROM songs s WHERE s.organisation_id = o.id) AS song_count
         FROM organisations o
         JOIN users u ON u.id = o.owner_id
        ORDER BY o.created_at DESC`,
    ),
  );
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  createdAt: string;
  organisationCount: number;
}

/** Every user on the platform, for the admin portal. */
export async function listAllUsersForAdmin(): Promise<AdminUserRow[]> {
  return camelAll(
    await query(
      `SELECT u.id, u.email, u.full_name, u.is_platform_admin, u.created_at,
              (SELECT COUNT(*) FROM organisation_members om WHERE om.user_id = u.id) AS organisation_count
         FROM users u
        ORDER BY u.created_at DESC`,
    ),
  );
}

export async function setOrganisationPlan(organisationId: string, plan: string): Promise<void> {
  await query(`UPDATE organisations SET plan = $2, updated_at = now() WHERE id = $1`, [
    organisationId,
    plan,
  ]);
}

// ==========================================
// Billing (Paystack)
// ==========================================

export async function recordPayment(params: {
  organisationId: string | null;
  reference?: string | null;
  eventType: string;
  status: string;
  amountZarCents?: number | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO payments (organisation_id, reference, event_type, status, amount_zar_cents, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.organisationId,
      params.reference || null,
      params.eventType,
      params.status,
      params.amountZarCents ?? null,
      JSON.stringify(params.payload || {}),
    ],
  );
}

export async function setOrganisationPaystackDetails(
  organisationId: string,
  details: {
    plan?: string;
    billingInterval?: string;
    paystackCustomerCode?: string | null;
    paystackSubscriptionCode?: string | null;
    planRenewsAt?: Date | null;
  },
): Promise<void> {
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [organisationId];

  if (details.plan !== undefined) {
    values.push(details.plan);
    sets.push(`plan = $${values.length}`);
  }
  if (details.billingInterval !== undefined) {
    values.push(details.billingInterval);
    sets.push(`billing_interval = $${values.length}`);
  }
  if (details.paystackCustomerCode !== undefined) {
    values.push(details.paystackCustomerCode);
    sets.push(`paystack_customer_code = $${values.length}`);
  }
  if (details.paystackSubscriptionCode !== undefined) {
    values.push(details.paystackSubscriptionCode);
    sets.push(`paystack_subscription_code = $${values.length}`);
  }
  if (details.planRenewsAt !== undefined) {
    values.push(details.planRenewsAt);
    sets.push(`plan_renews_at = $${values.length}`);
  }

  await query(`UPDATE organisations SET ${sets.join(', ')} WHERE id = $1`, values);
}

/** Looks an organisation up by its Paystack customer code, for webhook events
 * that identify the customer/subscription but not our organisationId directly
 * (some subscription events don't echo back the metadata set at checkout). */
export async function getOrganisationByPaystackCustomerCode(
  customerCode: string,
): Promise<Organisation | null> {
  const row = await queryOne<any>(`SELECT * FROM organisations WHERE paystack_customer_code = $1`, [
    customerCode,
  ]);
  return row ? camel<Organisation>(row) : null;
}

export interface AdminStats {
  totalUsers: number;
  totalOrganisations: number;
  totalSongs: number;
  organisationsByPlan: Record<string, number>;
}

export async function getAdminStats(): Promise<AdminStats> {
  const row = await queryOne<any>(
    `SELECT
        (SELECT COUNT(*) FROM users)::int AS total_users,
        (SELECT COUNT(*) FROM organisations)::int AS total_organisations,
        (SELECT COUNT(*) FROM songs)::int AS total_songs`,
  );
  const planRows = await query<{ plan: string; count: string }>(
    `SELECT plan, COUNT(*)::int AS count FROM organisations GROUP BY plan`,
  );
  const organisationsByPlan: Record<string, number> = {};
  for (const r of planRows) organisationsByPlan[r.plan] = Number(r.count);

  return {
    totalUsers: row?.total_users ?? 0,
    totalOrganisations: row?.total_organisations ?? 0,
    totalSongs: row?.total_songs ?? 0,
    organisationsByPlan,
  };
}
