/**
 * Ospreyn Core Domain Types
 * Based on Product Requirements Document & Technical Handoff v1.1
 */

export type WorkspaceRole = 'owner' | 'admin' | 'member';

/** Freeform links a user chooses to show on their profile. All optional. */
export interface SocialLinks {
  website?: string;
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  spotify?: string;
  youtube?: string;
}

export interface User {
  id: string; // UUID
  email: string;
  fullName: string;
  stageName?: string;
  bio?: string | null;
  socialLinks?: SocialLinks;
  /** Object-storage key for the avatar (see server/storage.ts). Not a public URL — fetch a signed URL via GET /account/avatar. */
  avatarKey?: string | null;
  emailVerifiedAt?: string | null;
  // WhatsApp owner notifications (dual-confirmation, agreement sign-off,
  // ownership changes) are only sent if this is set. Any SA phone format
  // works — the backend normalises it.
  phone?: string | null;
  // Grants access to the /admin portal. Distinct from a workspace's own
  // owner/admin/member role — see server/schema.sql.
  isPlatformAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PlanId = 'free' | 'starter' | 'professional' | 'label' | 'enterprise';
export type BillingInterval = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMonthlyZar: number | null;
  priceAnnualZar: number | null;
  maxSongs: number | null;
  maxTeamMembers: number | null;
  tagline: string;
  features: string[];
  cta: string;
  recommended?: boolean;
}

export interface PlanComparisonRow {
  label: string;
  values: Record<PlanId, string>;
}

export interface Organisation {
  id: string; // UUID
  name: string;
  ownerId: string;
  plan: PlanId;
  billingInterval: BillingInterval;
  paystackCustomerCode?: string | null;
  paystackSubscriptionCode?: string | null;
  planRenewsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationMember {
  id: string;
  organisationId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  // Joined for UI convenience
  fullName?: string;
  stageName?: string;
  email?: string;
}

export type TeamInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface TeamInvitation {
  id: string;
  organisationId: string;
  email: string;
  role: 'admin' | 'member';
  status: TeamInvitationStatus;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

export type RightsRecordStatus = 
  | 'draft' 
  | 'proposed' 
  | 'change_requested' 
  | 'confirmed' 
  | 'completed';

export interface Song {
  id: string; // UUID
  organisationId: string;
  title: string;
  primaryArtist: string;
  releaseDate?: string;
  genre?: string;
  isrc?: string;
  catalogueReference?: string;
  notes?: string;
  status: RightsRecordStatus;
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export type ContributorRole = 
  | 'artist' 
  | 'songwriter' 
  | 'composer' 
  | 'producer' 
  | 'featured_artist' 
  | 'musician' 
  | 'engineer' 
  | 'other';

export interface Contributor {
  id: string;
  organisationId: string;
  fullName: string;
  professionalName?: string;
  email: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SongContributor {
  id: string;
  songId: string;
  contributorId: string;
  role: ContributorRole;
  customRoleTitle?: string;
  createdAt: string;
  // Joined fields for UI convenience
  contributor?: Contributor;
}

export type VersionStatus = 'draft' | 'proposed' | 'confirmed' | 'superseded';

export interface RightsRecordVersion {
  id: string; // UUID
  songId: string;
  versionNumber: number;
  status: VersionStatus;
  changeReason?: string;
  createdBy: string;
  createdAt: string;
  confirmedAt?: string;
}

export type RightType = 'COMPOSITION' | 'MASTER';

/**
 * Basis Points: 10,000 = 100.00%
 * 1 bps = 0.01%
 * 5,000 bps = 50.00%
 * 3,334 bps = 33.34%
 */
export interface OwnershipAllocation {
  id: string;
  versionId: string;
  songId: string;
  contributorId: string;
  rightType: RightType;
  basisPoints: number; // 0 to 10,000
  createdAt: string;
  // Joined for display
  contributor?: Contributor;
}

export type InvitationStatus = 
  | 'pending' 
  | 'viewed' 
  | 'confirmed' 
  | 'change_requested' 
  | 'expired' 
  | 'revoked';

export interface Invitation {
  id: string;
  songId: string;
  contributorId: string;
  versionId: string;
  status: InvitationStatus;
  invitedAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  createdBy: string;
  // Joined for UI display
  contributor?: Contributor;
}

/**
 * Returned once, from the invitation creation endpoint only. The raw token is
 * never stored and can never be retrieved again.
 */
export interface IssuedInvitationLink {
  invitationId: string;
  rawToken: string;
  reviewUrl: string;
  contributorName: string;
  email: string;
  expiresAt: string;
}

export type ConfirmationAction = 'confirmed' | 'change_requested';

export interface ContributorConfirmation {
  id: string;
  songId: string;
  versionId: string;
  agreementVersion: number;
  contributorId: string;
  action: ConfirmationAction;
  confirmationStatement: string;
  identityReference: string;
  participantName: string;
  changeRequestComment?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  // Joined
  contributor?: Contributor;
}

export type AgreementType = 'split_sheet' | 'producer_agreement' | 'master_ownership_agreement';
export type AgreementStatus = 'draft' | 'pending_confirmations' | 'fully_confirmed';

export interface Agreement {
  id: string;
  songId: string;
  versionId: string;
  agreementVersion: number;
  agreementType: AgreementType;
  title: string;
  documentContent: string;
  disclaimerText: string;
  status: AgreementStatus;
  generatedAt: string;
}

export type DocumentCategory =
  | 'split_agreement'
  | 'contract'
  | 'licensing_agreement'
  | 'producer_agreement'
  | 'master_recording'
  | 'lyrics_sheet'
  | 'session_notes'
  | 'stems_project_files'
  | 'invoice'
  | 'isrc_documentation'
  | 'copyright_registration'
  | 'correspondence'
  | 'supporting_document'
  | 'other';

/** Label + one-line explanation of why a category is worth uploading, shown at every upload surface. */
export const DOCUMENT_CATEGORY_INFO: Record<DocumentCategory, { label: string; helper: string }> = {
  split_agreement: {
    label: 'Split sheet',
    helper: 'The single strongest piece of evidence for a composition or master dispute.',
  },
  contract: {
    label: 'Contract',
    helper: 'Establishes the terms everyone actually agreed to, in writing.',
  },
  licensing_agreement: {
    label: 'Licensing agreement',
    helper: 'Proves who can use the work, and on what terms — essential if a sync or licence is ever questioned.',
  },
  producer_agreement: {
    label: 'Producer agreement',
    helper: 'Confirms what a producer was engaged to do and what share, if any, they hold.',
  },
  master_recording: {
    label: 'Master recording',
    helper: 'Ties the paperwork to the actual recording it describes.',
  },
  lyrics_sheet: {
    label: 'Lyrics sheet',
    helper: 'Timestamps the words themselves — useful in a composition ownership dispute.',
  },
  session_notes: {
    label: 'Session notes',
    helper: 'Establishes exactly who did what, and when, during creation.',
  },
  stems_project_files: {
    label: 'Stems / project files',
    helper: 'Proves you hold the underlying multitracks, not just a finished export.',
  },
  invoice: {
    label: 'Invoice',
    helper: 'Supports a royalty or payment claim with a paper trail.',
  },
  isrc_documentation: {
    label: 'ISRC documentation',
    helper: 'Needed to register or verify this recording with distributors and collection societies.',
  },
  copyright_registration: {
    label: 'Copyright registration',
    helper: 'Your strongest formal proof of ownership, where one exists.',
  },
  correspondence: {
    label: 'Correspondence',
    helper: 'Emails, messages or letters that show what was agreed and when — often decisive in a dispute.',
  },
  supporting_document: {
    label: 'Supporting document',
    helper: 'Anything else that helps establish the timeline or chain of title.',
  },
  other: {
    label: 'Other',
    helper: 'Anything else worth preserving as evidence.',
  },
};

export type DocumentUploadStatus = 'pending' | 'stored' | 'failed';

export interface DocumentRecord {
  id: string;
  songId: string;
  versionId?: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  /** Null until object storage confirms what actually landed. */
  fileSize: number | null;
  /** SHA-256 of the stored bytes. Null until the upload is confirmed. */
  checksum: string | null;
  category: DocumentCategory;
  uploadStatus: DocumentUploadStatus;
  uploadedAt?: string | null;
  uploadedBy: string;
  createdAt: string;
}

export type ActorType = 'user' | 'contributor' | 'system';

export interface AuditEvent {
  id: string;
  organisationId: string; // Workspace-level scoping
  entityType: 'workspace' | 'song' | 'ownership' | 'invitation' | 'confirmation' | 'agreement' | 'document';
  entityId: string;
  songId?: string; // Nullable for workspace/account-wide events
  actorType: ActorType;
  actorId?: string;
  actorName: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RightsValidationSummary {
  compositionBasisPoints: number;
  masterBasisPoints: number;
  compositionPercentage: number; // e.g. 100.00
  masterPercentage: number;
  isCompositionComplete: boolean;
  isMasterComplete: boolean;
  isOverallocated: boolean;
  canProceedToInvite: boolean;
  canProceedToAgreement: boolean;
  pendingConfirmationsCount: number;
  totalContributorsCount: number;
}

// ==========================================
// Evidence Strength
// ==========================================

export type EvidenceLabel = 'weak' | 'moderate' | 'strong' | 'complete';

export interface EvidenceStrength {
  score: number; // 0-100
  label: EvidenceLabel;
  documentCount: number;
  groupsCovered: number;
  groupsTotal: number;
  missingGroups: string[];
}

export const EVIDENCE_LABEL_TEXT: Record<EvidenceLabel, string> = {
  weak: 'Weak evidence',
  moderate: 'Moderate evidence',
  strong: 'Strong evidence',
  complete: 'Complete documentation',
};

export const EVIDENCE_LABEL_COLOR: Record<EvidenceLabel, string> = {
  weak: '#dc6b52',
  moderate: '#c9a13b',
  strong: '#4f9d69',
  complete: '#3f8f6f',
};

// ==========================================
// Dashboard summary
// ==========================================

export interface DashboardSummary {
  totalSongs: number;
  completedCount: number;
  awaitingConfirmationCount: number;
  disputedCount: number;
  needsAttentionCount: number;
  missingDocumentationCount: number;
  averageEvidenceScore: number;
  storageUsedBytes: number;
  storageLimitBytes: number | null;
  planId: PlanId;
  songLimit: number | null;
  songCount: number;
  teamMemberLimit: number | null;
  teamMemberCount: number;
}

// ==========================================
// Security / trust
// ==========================================

export interface SecurityStatus {
  passwordAlgorithm: string;
  sessionModel: string;
  documentIntegrity: string;
  auditTrail: string;
  backupsConfigured: boolean;
  rateLimited: boolean;
}
