-- Ospreyn PostgreSQL Schema Specification v1.1 (Production)
-- Category: Music Rights Infrastructure
-- Target DB: PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    stage_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Organisations (Workspaces)
CREATE TABLE IF NOT EXISTS organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Organisation Members
CREATE TABLE IF NOT EXISTS organisation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(organisation_id, user_id)
);

-- 4. Songs
CREATE TABLE IF NOT EXISTS songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    primary_artist VARCHAR(255) NOT NULL,
    release_date DATE,
    genre VARCHAR(100),
    isrc VARCHAR(50),
    catalogue_reference VARCHAR(100),
    notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'change_requested', 'confirmed', 'completed')),
    current_version_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Contributors
CREATE TABLE IF NOT EXISTS contributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    professional_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(organisation_id, email)
);

-- 6. External Rights Identifiers (Optional decoupling for future CMO integration)
CREATE TABLE IF NOT EXISTS external_rights_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contributor_id UUID REFERENCES contributors(id) ON DELETE CASCADE NOT NULL,
    organisation VARCHAR(50) NOT NULL, -- e.g. 'SAMRO', 'CAPASSO', 'SAMPRA', 'BMI', 'ASCAP'
    identifier VARCHAR(100) NOT NULL,  -- e.g. IPI/CAE number
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Song Contributors (Role assignment on a song)
CREATE TABLE IF NOT EXISTS song_contributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    contributor_id UUID REFERENCES contributors(id) ON DELETE RESTRICT NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('artist', 'songwriter', 'composer', 'producer', 'featured_artist', 'musician', 'engineer', 'other')),
    custom_role_title VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(song_id, contributor_id, role)
);

-- 8. Rights Record Versions
CREATE TABLE IF NOT EXISTS rights_record_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    version_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'proposed', 'confirmed', 'superseded')),
    change_reason TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    confirmed_at TIMESTAMPTZ,
    UNIQUE(song_id, version_number)
);

-- 9. Ownership Allocations (Single source of truth for splits; Basis points: 10000 = 100%)
CREATE TABLE IF NOT EXISTS ownership_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES rights_record_versions(id) ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    contributor_id UUID REFERENCES contributors(id) ON DELETE RESTRICT NOT NULL,
    right_type VARCHAR(20) NOT NULL CHECK (right_type IN ('COMPOSITION', 'MASTER')),
    basis_points INTEGER NOT NULL CHECK (basis_points >= 0 AND basis_points <= 10000),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(version_id, contributor_id, right_type)
);

-- 10. Invitations (Lifecycle data separated from song_contributors)
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    contributor_id UUID REFERENCES contributors(id) ON DELETE RESTRICT NOT NULL,
    version_id UUID REFERENCES rights_record_versions(id) ON DELETE CASCADE NOT NULL,
    token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of raw invitation token
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'confirmed', 'change_requested', 'expired', 'revoked')),
    invited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) NOT NULL
);

-- 11. Contributor Confirmations (Electronic Acceptance, Not Signature)
CREATE TABLE IF NOT EXISTS contributor_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    version_id UUID REFERENCES rights_record_versions(id) ON DELETE CASCADE NOT NULL,
    agreement_version INTEGER NOT NULL,
    contributor_id UUID REFERENCES contributors(id) ON DELETE RESTRICT NOT NULL,
    action VARCHAR(30) NOT NULL CHECK (action IN ('confirmed', 'change_requested')),
    confirmation_statement TEXT NOT NULL,
    identity_reference VARCHAR(255) NOT NULL,
    participant_name VARCHAR(255) NOT NULL,
    change_request_comment TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(version_id, contributor_id)
);

-- 12. Agreements (Generated from structured data)
CREATE TABLE IF NOT EXISTS agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    version_id UUID REFERENCES rights_record_versions(id) ON DELETE RESTRICT NOT NULL,
    agreement_version INTEGER NOT NULL,
    agreement_type VARCHAR(50) NOT NULL CHECK (agreement_type IN ('split_sheet', 'producer_agreement', 'master_ownership_agreement')),
    title VARCHAR(255) NOT NULL,
    document_content TEXT NOT NULL,
    disclaimer_text TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_confirmations', 'fully_confirmed')),
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 13. Documents (Document Vault: Private object storage metadata)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    version_id UUID REFERENCES rights_record_versions(id) ON DELETE SET NULL,
    storage_key VARCHAR(512) UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL, -- SHA-256 checksum
    category VARCHAR(50) NOT NULL CHECK (category IN ('split_agreement', 'producer_agreement', 'master_recording', 'lyrics_sheet', 'supporting_document', 'other')),
    uploaded_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 14. Audit Events (Append-only audit ledger with organisation_id + entity_type + entity_id)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'workspace', 'song', 'ownership', 'invitation', 'confirmation', 'agreement', 'document'
    entity_id UUID NOT NULL,
    song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'contributor', 'system')),
    actor_id UUID,
    actor_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Immutability index & rule on audit_events
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(organisation_id);
CREATE INDEX IF NOT EXISTS idx_audit_song ON audit_events(song_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);

-- 15. Sessions (server-side session store for cookie auth)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 of the raw session token; raw value never stored
    user_agent VARCHAR(255),
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Document vault upload lifecycle.
-- A row is created as 'pending' when a presigned upload URL is issued, and only
-- becomes 'stored' once the object is confirmed present in object storage.
-- checksum is the SHA-256 of the actual file bytes, computed by the client and
-- verified against the object store's recorded digest. It is NULL until then.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;
ALTER TABLE documents ALTER COLUMN checksum DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN file_size DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE documents ADD CONSTRAINT documents_upload_status_check
        CHECK (upload_status IN ('pending', 'stored', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_songs_org ON songs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_versions_song ON rights_record_versions(song_id);
CREATE INDEX IF NOT EXISTS idx_alloc_version ON ownership_allocations(version_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_documents_song ON documents(song_id);
CREATE INDEX IF NOT EXISTS idx_contributors_org ON contributors(organisation_id);
