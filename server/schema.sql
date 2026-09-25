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
-- Category list intentionally broad — see the "Evidence Strength" scoring in
-- server/evidence.ts, which groups these into what a dispute, a royalty
-- claim, or a CMO registration actually needs to see.
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    version_id UUID REFERENCES rights_record_versions(id) ON DELETE SET NULL,
    storage_key VARCHAR(512) UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL, -- SHA-256 checksum
    category VARCHAR(50) NOT NULL CHECK (category IN ('split_agreement', 'contract', 'licensing_agreement', 'producer_agreement', 'master_recording', 'lyrics_sheet', 'session_notes', 'stems_project_files', 'invoice', 'isrc_documentation', 'copyright_registration', 'correspondence', 'supporting_document', 'other')),
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

-- Evidence that the account holder agreed to the Terms of Service and
-- Privacy Policy at registration, and which version they agreed to (bump
-- TERMS_VERSION in server/legal.ts whenever the policies materially change,
-- which re-prompts existing users to accept the new version).
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);

-- WhatsApp delivery, for owners who want owner-side notifications on the
-- Growth/Pro tiers. Optional: workspace owners without a phone on file
-- simply get email-only notifications.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- WhatsApp dispatch log (send + inbound button-reply correlation).
-- Kept separate from audit_events (which is the user-facing, per-song
-- ledger) because this table exists to answer an operational question —
-- "what did the WhatsApp API actually say?" — and to let the inbound
-- webhook resolve a button click back to the outbound message that
-- produced it via provider_message_sid. Every row is also mirrored into
-- audit_events for anything that changes record state, so the append-only
-- audit trail requirement is satisfied without this table.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
    song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
    invitation_id UUID REFERENCES invitations(id) ON DELETE SET NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    purpose VARCHAR(50) NOT NULL, -- 'contributor_invite', 'owner_notification', 'inbound_reply'
    to_number VARCHAR(30),
    from_number VARCHAR(30),
    provider VARCHAR(20) NOT NULL DEFAULT 'twilio',
    provider_message_sid VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'queued', -- queued | sent | delivered | failed | received
    payload JSONB DEFAULT '{}'::jsonb NOT NULL, -- raw request/response or webhook body, for the audit trail
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sid ON whatsapp_messages(provider_message_sid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_invitation ON whatsapp_messages(invitation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org ON whatsapp_messages(organisation_id);

-- ==========================================
-- Plans & platform administration
-- ==========================================
-- No payment processor is integrated yet. 'plan' is the source of truth for
-- what an organisation is entitled to, and today it is set by a platform
-- admin via /admin (e.g. after an offline/EFT payment) rather than by a
-- checkout flow — see server/plans.ts for what each plan actually unlocks.
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
DO $$ BEGIN
    ALTER TABLE organisations ADD CONSTRAINT organisations_plan_check
        CHECK (plan IN ('free', 'pro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Platform administrators can access /admin to manage organisations, plans
-- and users across the whole platform. This is deliberately separate from
-- organisation_members.role ('owner'/'admin'/'member'), which only grants
-- control within a single workspace — a workspace admin is not a platform
-- admin. Grant this by hand in the database, or see ADMIN_BOOTSTRAP_EMAIL
-- in .env.example for granting it automatically on first migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ==========================================
-- Billing (Paystack)
-- ==========================================
-- 'plan' above is still the single source of truth for what an
-- organisation is entitled to — these columns exist only so the app can
-- reconcile with Paystack (renew, cancel, look a customer up) rather than
-- driving entitlement decisions directly.
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(50);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(50);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_organisations_paystack_customer ON organisations(paystack_customer_code);

-- Every checkout attempt and webhook event, for support/dispute purposes
-- ("I paid but it says Free" is a support ticket this table answers).
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
    reference VARCHAR(100),
    event_type VARCHAR(50) NOT NULL, -- 'checkout_initialized' | 'charge.success' | webhook event name
    status VARCHAR(30) NOT NULL,
    amount_zar_cents INTEGER,
    payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organisation_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);

-- Widen the documents.category check to the fuller evidence taxonomy above
-- (older deployments were created before session notes / stems / invoices /
-- ISRC / copyright-registration / correspondence existed as categories).
DO $$ BEGIN
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_check;
    ALTER TABLE documents ADD CONSTRAINT documents_category_check
        CHECK (category IN ('split_agreement', 'contract', 'licensing_agreement', 'producer_agreement', 'master_recording', 'lyrics_sheet', 'session_notes', 'stems_project_files', 'invoice', 'isrc_documentation', 'copyright_registration', 'correspondence', 'supporting_document', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- Profiles: avatar, bio, social links, email verification
-- ==========================================
-- avatar_key is an object-storage key (see server/storage.ts) — the same
-- private-bucket/presigned-URL model as the document vault, not a public
-- URL, so avatars never require a separate public bucket or CDN.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(512);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Single-use tokens for password reset and email verification. Only the hash
-- is stored (same pattern as sessions.token_hash and invitations.token_hash)
-- so a database dump never hands over a usable reset link.
CREATE TABLE IF NOT EXISTS user_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('password_reset', 'email_verification')),
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_action_tokens_hash ON user_action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_action_tokens_user ON user_action_tokens(user_id, purpose);

-- ==========================================
-- Team invitations (workspace membership by email, not yet an account holder)
-- ==========================================
-- organisation_members (table 3, above) only covers people who already have
-- a row in users. An invitation lets an owner/admin name someone by email —
-- who may not have signed up yet — before they hold any membership. Accepting
-- converts it into an organisation_members row and marks the invite used.
CREATE TABLE IF NOT EXISTS organisation_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'member')),
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    invited_by UUID REFERENCES users(id) NOT NULL,
    invited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organisation_invitations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON organisation_invitations(token_hash);

-- ==========================================
-- Plans: five tiers + monthly/annual billing interval
-- ==========================================
-- Existing organisations on the old two-tier scheme map 'pro' -> the closest
-- equivalent in the new lineup before the check constraint is tightened, so
-- this migration never leaves a row violating its own new constraint.
UPDATE organisations SET plan = 'professional' WHERE plan = 'pro';

DO $$ BEGIN
    ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_plan_check;
    ALTER TABLE organisations ADD CONSTRAINT organisations_plan_check
        CHECK (plan IN ('free', 'starter', 'professional', 'label', 'enterprise'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(10) NOT NULL DEFAULT 'monthly';
DO $$ BEGIN
    ALTER TABLE organisations ADD CONSTRAINT organisations_billing_interval_check
        CHECK (billing_interval IN ('monthly', 'annual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- Operational note: automated backups
-- ==========================================
-- This flag is NOT a real backup mechanism — Ospreyn cannot provision your
-- database provider's backups from application code. It exists purely so
-- the in-product "Trust & security" panel can tell a user the honest state
-- (configured vs. not) instead of silently claiming protection that may not
-- exist. Set DATABASE_BACKUPS_CONFIGURED=true in the API environment (see
-- .env.example) once you have actually turned on point-in-time recovery or
-- scheduled pg_dump backups with your provider — see DEPLOYMENT.md.
