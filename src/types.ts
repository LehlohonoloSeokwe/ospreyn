/**
 * Ospreyn Core Domain Types
 * Based on Product Requirements Document & Technical Handoff v1.1
 */

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface User {
  id: string; // UUID
  email: string;
  fullName: string;
  stageName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organisation {
  id: string; // UUID
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationMember {
  id: string;
  organisationId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
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
  | 'producer_agreement' 
  | 'master_recording' 
  | 'lyrics_sheet' 
  | 'supporting_document' 
  | 'other';

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
