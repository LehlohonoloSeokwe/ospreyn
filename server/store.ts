/**
 * Ospreyn Persistent Data Store
 * Conforms strictly to PostgreSQL 16 schema v1.1
 * - Single source of truth: ownership_allocations with integer basis points (10000 = 100.00%)
 * - Separate invitations table with SHA-256 token hashes
 * - Neutral confirmation language with legal review notice
 * - Audit events with organisationId, entityType, and entityId
 */

import crypto from 'crypto';
import {
  User,
  Organisation,
  OrganisationMember,
  Song,
  Contributor,
  SongContributor,
  RightsRecordVersion,
  OwnershipAllocation,
  Invitation,
  ContributorConfirmation,
  Agreement,
  DocumentRecord,
  AuditEvent,
  RightsValidationSummary,
} from '../src/types';

export class OspreynStore {
  public users: Map<string, User> = new Map();
  public organisations: Map<string, Organisation> = new Map();
  public organisationMembers: Map<string, OrganisationMember> = new Map();
  public songs: Map<string, Song> = new Map();
  public contributors: Map<string, Contributor> = new Map();
  public songContributors: Map<string, SongContributor> = new Map();
  public rightsRecordVersions: Map<string, RightsRecordVersion> = new Map();
  public ownershipAllocations: Map<string, OwnershipAllocation> = new Map();
  public invitations: Map<string, Invitation> = new Map();
  public contributorConfirmations: Map<string, ContributorConfirmation> = new Map();
  public agreements: Map<string, Agreement> = new Map();
  public documents: Map<string, DocumentRecord> = new Map();
  public auditEvents: AuditEvent[] = [];

  constructor() {
    this.seedInitialData();
  }

  // --- Seed Demo Data ---
  private seedInitialData() {
    const userId = 'u-hloni-1001';
    const orgId = 'org-soweto-2001';

    // 1. User: Hloni (Creator / Producer)
    const user: User = {
      id: userId,
      email: 'hloni@sowetosoundworks.co.za',
      fullName: 'Hloni Mokoena',
      stageName: 'Hloni Deep',
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    this.users.set(user.id, user);

    // 2. Organisation: Soweto Soundworks
    const org: Organisation = {
      id: orgId,
      name: 'Soweto Soundworks',
      ownerId: userId,
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    this.organisations.set(org.id, org);

    const member: OrganisationMember = {
      id: 'om-1001',
      organisationId: orgId,
      userId: userId,
      role: 'owner',
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    this.organisationMembers.set(member.id, member);

    // 3. Contributors
    const c1: Contributor = {
      id: 'c-hloni',
      organisationId: orgId,
      fullName: 'Hloni Mokoena',
      professionalName: 'Hloni Deep',
      email: 'hloni@sowetosoundworks.co.za',
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    const c2: Contributor = {
      id: 'c-lerato',
      organisationId: orgId,
      fullName: 'Lerato Moloi',
      professionalName: 'Queen Lerato',
      email: 'lerato@moloi-music.com',
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    const c3: Contributor = {
      id: 'c-thabo',
      organisationId: orgId,
      fullName: 'Thabo Khumalo',
      professionalName: 'TK Beats',
      email: 'thabo@tkbeats.co.za',
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    const c4: Contributor = {
      id: 'c-kabelo',
      organisationId: orgId,
      fullName: 'Kabelo Sithole',
      professionalName: 'K-Soul',
      email: 'kabelo.sithole@gmail.com',
      createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    };
    this.contributors.set(c1.id, c1);
    this.contributors.set(c2.id, c2);
    this.contributors.set(c3.id, c3);
    this.contributors.set(c4.id, c4);

    // 4. Seed Song 1: "Amapiano Nights" (Completed Rights Record)
    const s1Id = 'song-amapiano-nights-1';
    const s1: Song = {
      id: s1Id,
      organisationId: orgId,
      title: 'Amapiano Nights',
      primaryArtist: 'Hloni Deep feat. Queen Lerato',
      releaseDate: '2026-10-12',
      genre: 'Amapiano / Afro House',
      isrc: 'ZA-A82-26-00104',
      catalogueReference: 'SSW-2026-001',
      notes: 'Lead single for summer EP. Recorded at Soweto Soundworks Studio A.',
      status: 'completed',
      currentVersionNumber: 1,
      createdAt: new Date('2026-09-10T14:03:00Z').toISOString(),
      updatedAt: new Date('2026-09-14T16:15:00Z').toISOString(),
    };
    this.songs.set(s1.id, s1);

    // Song contributors
    this.addSongContributor(s1Id, c1.id, 'artist');
    this.addSongContributor(s1Id, c1.id, 'producer');
    this.addSongContributor(s1Id, c2.id, 'featured_artist');
    this.addSongContributor(s1Id, c2.id, 'songwriter');
    this.addSongContributor(s1Id, c3.id, 'composer');

    // Version 1
    const v1Id = 'v1-amapiano';
    const v1: RightsRecordVersion = {
      id: v1Id,
      songId: s1Id,
      versionNumber: 1,
      status: 'confirmed',
      createdBy: userId,
      createdAt: new Date('2026-09-10T14:05:00Z').toISOString(),
      confirmedAt: new Date('2026-09-14T16:01:00Z').toISOString(),
    };
    this.rightsRecordVersions.set(v1.id, v1);

    // Ownership Allocations in Basis Points (10,000 = 100.00%)
    // Composition: Lerato (5000 bps = 50%), Hloni (2500 bps = 25%), Thabo (2500 bps = 25%)
    this.setOwnership(v1Id, s1Id, c2.id, 'COMPOSITION', 5000);
    this.setOwnership(v1Id, s1Id, c1.id, 'COMPOSITION', 2500);
    this.setOwnership(v1Id, s1Id, c3.id, 'COMPOSITION', 2500);

    // Master: Hloni (7000 bps = 70%), Lerato (3000 bps = 30%)
    this.setOwnership(v1Id, s1Id, c1.id, 'MASTER', 7000);
    this.setOwnership(v1Id, s1Id, c2.id, 'MASTER', 3000);

    // Confirmations for v1
    this.recordConfirmation({
      songId: s1Id,
      versionId: v1Id,
      agreementVersion: 1,
      contributorId: c1.id,
      action: 'confirmed',
      participantName: c1.fullName,
      identityReference: c1.email,
      ipAddress: '197.89.24.12',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      timestamp: new Date('2026-09-10T14:15:00Z').toISOString(),
    });
    this.recordConfirmation({
      songId: s1Id,
      versionId: v1Id,
      agreementVersion: 1,
      contributorId: c2.id,
      action: 'confirmed',
      participantName: c2.fullName,
      identityReference: c2.email,
      ipAddress: '105.210.14.88',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)',
      timestamp: new Date('2026-09-11T09:24:00Z').toISOString(),
    });
    this.recordConfirmation({
      songId: s1Id,
      versionId: v1Id,
      agreementVersion: 1,
      contributorId: c3.id,
      action: 'confirmed',
      participantName: c3.fullName,
      identityReference: c3.email,
      ipAddress: '41.13.120.4',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      timestamp: new Date('2026-09-14T16:01:00Z').toISOString(),
    });

    // Generated Agreement
    const agreementContent = this.generateSplitSheetAgreementText(s1, v1);
    const agr: Agreement = {
      id: 'agr-amapiano-v1',
      songId: s1Id,
      versionId: v1Id,
      agreementVersion: 1,
      agreementType: 'split_sheet',
      title: 'Music Rights Split Agreement — Amapiano Nights (v1)',
      documentContent: agreementContent,
      disclaimerText: 'Notice: Ospreyn provides independent rights-documentation and workflow infrastructure. It does not provide legal advice or make claims regarding the legal enforceability of private confirmations. Agreement terms and confirmation mechanisms should be reviewed by qualified South African legal counsel before formal execution.',
      status: 'fully_confirmed',
      generatedAt: new Date('2026-09-14T16:08:00Z').toISOString(),
    };
    this.agreements.set(agr.id, agr);

    // Document in Vault
    const doc1: DocumentRecord = {
      id: 'doc-amapiano-1',
      songId: s1Id,
      versionId: v1Id,
      storageKey: `org_${orgId}/song_${s1Id}/v1/split_agreement_executed.pdf`,
      fileName: 'Amapiano_Nights_Split_Agreement_v1.pdf',
      mimeType: 'application/pdf',
      fileSize: 184520,
      checksum: crypto.createHash('sha256').update('seed-split-doc-content-v1').digest('hex'),
      category: 'split_agreement',
      uploadedBy: userId,
      createdAt: new Date('2026-09-14T16:12:00Z').toISOString(),
    };
    this.documents.set(doc1.id, doc1);

    // Audit logs for Song 1
    this.logAuditEvent({
      organisationId: orgId,
      entityType: 'song',
      entityId: s1Id,
      songId: s1Id,
      actorType: 'user',
      actorId: userId,
      actorName: 'Hloni Mokoena',
      eventType: 'SONG_CREATED',
      metadata: { title: s1.title, primaryArtist: s1.primaryArtist },
      createdAt: '2026-09-10T14:03:00Z',
    });
    this.logAuditEvent({
      organisationId: orgId,
      entityType: 'ownership',
      entityId: v1Id,
      songId: s1Id,
      actorType: 'user',
      actorId: userId,
      actorName: 'Hloni Mokoena',
      eventType: 'OWNERSHIP_PROPOSED',
      metadata: { composition: '100.00%', master: '100.00%', version: 1 },
      createdAt: '2026-09-10T14:10:00Z',
    });
    this.logAuditEvent({
      organisationId: orgId,
      entityType: 'confirmation',
      entityId: v1Id,
      songId: s1Id,
      actorType: 'contributor',
      actorId: c2.id,
      actorName: 'Lerato Moloi',
      eventType: 'CONTRIBUTOR_CONFIRMED',
      metadata: { role: 'featured_artist, songwriter', share: '50.00% comp, 30.00% master' },
      createdAt: '2026-09-11T09:24:00Z',
    });
    this.logAuditEvent({
      organisationId: orgId,
      entityType: 'agreement',
      entityId: agr.id,
      songId: s1Id,
      actorType: 'system',
      actorName: 'Ospreyn Rights Engine',
      eventType: 'AGREEMENT_COMPLETED',
      metadata: { agreementId: agr.id, agreementVersion: 1 },
      createdAt: '2026-09-14T16:14:00Z',
    });

    // 5. Seed Song 2: "Sunset in Braamfontein" (Proposed — In Contributor Review)
    const s2Id = 'song-braam-sunset-2';
    const s2: Song = {
      id: s2Id,
      organisationId: orgId,
      title: 'Sunset in Braamfontein',
      primaryArtist: 'Hloni Deep & K-Soul',
      releaseDate: '2026-11-20',
      genre: 'Deep House',
      isrc: '',
      catalogueReference: 'SSW-2026-002',
      notes: 'Collab with K-Soul. Waiting for Kabelo to confirm split or request change.',
      status: 'proposed',
      currentVersionNumber: 1,
      createdAt: new Date('2026-09-16T11:00:00Z').toISOString(),
      updatedAt: new Date('2026-09-16T11:20:00Z').toISOString(),
    };
    this.songs.set(s2.id, s2);
    this.addSongContributor(s2Id, c1.id, 'artist');
    this.addSongContributor(s2Id, c1.id, 'producer');
    this.addSongContributor(s2Id, c4.id, 'songwriter');
    this.addSongContributor(s2Id, c4.id, 'musician');

    const v2_s2_Id = 'v1-braam';
    const v2_s2: RightsRecordVersion = {
      id: v2_s2_Id,
      songId: s2Id,
      versionNumber: 1,
      status: 'proposed',
      createdBy: userId,
      createdAt: new Date('2026-09-16T11:05:00Z').toISOString(),
    };
    this.rightsRecordVersions.set(v2_s2.id, v2_s2);

    // 60% Hloni, 40% Kabelo for Comp; 50/50 for Master
    this.setOwnership(v2_s2_Id, s2Id, c1.id, 'COMPOSITION', 6000);
    this.setOwnership(v2_s2_Id, s2Id, c4.id, 'COMPOSITION', 4000);
    this.setOwnership(v2_s2_Id, s2Id, c1.id, 'MASTER', 5000);
    this.setOwnership(v2_s2_Id, s2Id, c4.id, 'MASTER', 5000);

    // Creator confirmed their own share
    this.recordConfirmation({
      songId: s2Id,
      versionId: v2_s2_Id,
      agreementVersion: 1,
      contributorId: c1.id,
      action: 'confirmed',
      participantName: c1.fullName,
      identityReference: c1.email,
      ipAddress: '197.89.24.12',
      timestamp: new Date('2026-09-16T11:10:00Z').toISOString(),
    });

    // Invitation for Kabelo (K-Soul) with raw token "demo-token-kabelo-2026"
    const rawDemoToken = 'demo-token-kabelo-2026';
    const demoTokenHash = crypto.createHash('sha256').update(rawDemoToken).digest('hex');
    const inv1: Invitation = {
      id: 'inv-braam-kabelo',
      songId: s2Id,
      contributorId: c4.id,
      versionId: v2_s2_Id,
      tokenHash: demoTokenHash,
      status: 'pending',
      invitedAt: new Date('2026-09-16T11:12:00Z').toISOString(),
      expiresAt: new Date('2026-09-23T11:12:00Z').toISOString(),
      createdBy: userId,
      rawToken: rawDemoToken,
    };
    this.invitations.set(inv1.id, inv1);

    this.logAuditEvent({
      organisationId: orgId,
      entityType: 'song',
      entityId: s2Id,
      songId: s2Id,
      actorType: 'user',
      actorId: userId,
      actorName: 'Hloni Mokoena',
      eventType: 'SONG_CREATED',
      metadata: { title: s2.title },
      createdAt: '2026-09-16T11:00:00Z',
    });
    this.logAuditEvent({
      organisationId: orgId,
      entityType: 'invitation',
      entityId: inv1.id,
      songId: s2Id,
      actorType: 'user',
      actorId: userId,
      actorName: 'Hloni Mokoena',
      eventType: 'CONTRIBUTOR_INVITED',
      metadata: { contributor: c4.fullName, role: 'Songwriter, Musician' },
      createdAt: '2026-09-16T11:12:00Z',
    });
  }

  // --- Helper Methods ---

  public logAuditEvent(params: {
    organisationId: string;
    entityType: 'workspace' | 'song' | 'ownership' | 'invitation' | 'confirmation' | 'agreement' | 'document';
    entityId: string;
    songId?: string;
    actorType: 'user' | 'contributor' | 'system';
    actorId?: string;
    actorName: string;
    eventType: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): AuditEvent {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      organisationId: params.organisationId,
      entityType: params.entityType,
      entityId: params.entityId,
      songId: params.songId,
      actorType: params.actorType,
      actorId: params.actorId,
      actorName: params.actorName,
      eventType: params.eventType,
      metadata: params.metadata || {},
      createdAt: params.createdAt || new Date().toISOString(),
    };
    this.auditEvents.unshift(event);
    return event;
  }

  public addSongContributor(songId: string, contributorId: string, role: string, customTitle?: string) {
    const id = crypto.randomUUID();
    const sc: SongContributor = {
      id,
      songId,
      contributorId,
      role: role as any,
      customRoleTitle: customTitle,
      createdAt: new Date().toISOString(),
    };
    this.songContributors.set(id, sc);
    return sc;
  }

  public setOwnership(versionId: string, songId: string, contributorId: string, rightType: 'COMPOSITION' | 'MASTER', basisPoints: number) {
    // Find existing
    let existingId: string | undefined;
    for (const [id, alloc] of this.ownershipAllocations) {
      if (alloc.versionId === versionId && alloc.contributorId === contributorId && alloc.rightType === rightType) {
        existingId = id;
        break;
      }
    }

    if (existingId) {
      const existing = this.ownershipAllocations.get(existingId)!;
      existing.basisPoints = basisPoints;
      return existing;
    }

    const newAlloc: OwnershipAllocation = {
      id: crypto.randomUUID(),
      versionId,
      songId,
      contributorId,
      rightType,
      basisPoints,
      createdAt: new Date().toISOString(),
    };
    this.ownershipAllocations.set(newAlloc.id, newAlloc);
    return newAlloc;
  }

  public getOwnershipValidation(versionId: string): RightsValidationSummary {
    let compBps = 0;
    let mastBps = 0;

    for (const alloc of this.ownershipAllocations.values()) {
      if (alloc.versionId === versionId) {
        if (alloc.rightType === 'COMPOSITION') {
          compBps += alloc.basisPoints;
        } else if (alloc.rightType === 'MASTER') {
          mastBps += alloc.basisPoints;
        }
      }
    }

    const isCompositionComplete = compBps === 10000;
    const isMasterComplete = mastBps === 10000;
    const isOverallocated = compBps > 10000 || mastBps > 10000;

    // Check confirmed contributors
    let confirmedCount = 0;
    for (const c of this.contributorConfirmations.values()) {
      if (c.versionId === versionId && c.action === 'confirmed') {
        confirmedCount++;
      }
    }

    // Unique contributors with allocations or assigned roles
    const contributorsInAlloc = new Set<string>();
    for (const alloc of this.ownershipAllocations.values()) {
      if (alloc.versionId === versionId && alloc.basisPoints > 0) {
        contributorsInAlloc.add(alloc.contributorId);
      }
    }

    const totalContributorsCount = contributorsInAlloc.size;
    const pendingConfirmationsCount = Math.max(0, totalContributorsCount - confirmedCount);

    return {
      compositionBasisPoints: compBps,
      masterBasisPoints: mastBps,
      compositionPercentage: Number((compBps / 100).toFixed(2)),
      masterPercentage: Number((mastBps / 100).toFixed(2)),
      isCompositionComplete,
      isMasterComplete,
      isOverallocated,
      canProceedToInvite: isCompositionComplete && isMasterComplete,
      canProceedToAgreement: isCompositionComplete && isMasterComplete && pendingConfirmationsCount === 0 && totalContributorsCount > 0,
      pendingConfirmationsCount,
      totalContributorsCount,
    };
  }

  public recordConfirmation(params: {
    songId: string;
    versionId: string;
    agreementVersion: number;
    contributorId: string;
    action: 'confirmed' | 'change_requested';
    participantName: string;
    identityReference: string;
    changeRequestComment?: string;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: string;
  }): ContributorConfirmation {
    // Check if entry already exists for this version + contributor
    let existingId: string | undefined;
    for (const [id, c] of this.contributorConfirmations) {
      if (c.versionId === params.versionId && c.contributorId === params.contributorId) {
        existingId = id;
        break;
      }
    }

    const confirmationStatement =
      params.action === 'confirmed'
        ? 'I confirm that the information above accurately records our agreed understanding regarding contributions and ownership for this work.'
        : 'Change requested by contributor.';

    const confirmation: ContributorConfirmation = {
      id: existingId || crypto.randomUUID(),
      songId: params.songId,
      versionId: params.versionId,
      agreementVersion: params.agreementVersion,
      contributorId: params.contributorId,
      action: params.action,
      confirmationStatement,
      identityReference: params.identityReference,
      participantName: params.participantName,
      changeRequestComment: params.changeRequestComment,
      ipAddress: params.ipAddress || '127.0.0.1',
      userAgent: params.userAgent || 'Ospreyn Client',
      timestamp: params.timestamp || new Date().toISOString(),
    };

    this.contributorConfirmations.set(confirmation.id, confirmation);
    return confirmation;
  }

  public generateSplitSheetAgreementText(song: Song, version: RightsRecordVersion): string {
    // Gather contributors & splits
    const compSplits: Array<{ name: string; role: string; pct: string }> = [];
    const masterSplits: Array<{ name: string; role: string; pct: string }> = [];

    // Get song contributors
    const rolesByContributor: Record<string, string[]> = {};
    for (const sc of this.songContributors.values()) {
      if (sc.songId === song.id) {
        if (!rolesByContributor[sc.contributorId]) rolesByContributor[sc.contributorId] = [];
        rolesByContributor[sc.contributorId].push(sc.customRoleTitle || sc.role);
      }
    }

    for (const alloc of this.ownershipAllocations.values()) {
      if (alloc.versionId === version.id) {
        const c = this.contributors.get(alloc.contributorId);
        const name = c ? `${c.fullName}${c.professionalName ? ` ("${c.professionalName}")` : ''}` : 'Unknown';
        const role = rolesByContributor[alloc.contributorId]?.join(', ') || 'Contributor';
        const pct = `${(alloc.basisPoints / 100).toFixed(2)}%`;

        if (alloc.rightType === 'COMPOSITION' && alloc.basisPoints > 0) {
          compSplits.push({ name, role, pct });
        } else if (alloc.rightType === 'MASTER' && alloc.basisPoints > 0) {
          masterSplits.push({ name, role, pct });
        }
      }
    }

    const confirmationsList: string[] = [];
    for (const conf of this.contributorConfirmations.values()) {
      if (conf.versionId === version.id) {
        confirmationsList.push(`- **${conf.participantName}** (${conf.identityReference}): Confirmed on ${new Date(conf.timestamp).toUTCString()} [IP: ${conf.ipAddress || 'Verified'}]`);
      }
    }

    return `
# MUSIC RIGHTS SPLIT AGREEMENT & OWNERSHIP RECORD
**Document Identifier:** OSPREYN-REC-${song.id.slice(0, 8).toUpperCase()}-V${version.versionNumber}  
**Date of Record:** ${new Date(version.createdAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}  
**Rights Record Version:** ${version.versionNumber}.0 (${version.status.toUpperCase()})  

---

### 1. WORK DETAILS
- **Title of Work:** ${song.title}
- **Primary Artist:** ${song.primaryArtist}
- **ISRC:** ${song.isrc || 'Pending / Unregistered'}
- **Catalogue Reference:** ${song.catalogueReference || 'None'}
- **Release Date:** ${song.releaseDate || 'TBD'}

---

### 2. COMPOSITION RIGHTS (Songwriting & Publishing)
The parties hereby confirm that the copyright in the musical composition and lyrics of the Work is allocated as follows:

| Contributor / Legal Name | Role | Agreed Percentage | Basis Points |
| :--- | :--- | :--- | :--- |
${compSplits.map((s) => `| ${s.name} | ${s.role} | **${s.pct}** | ${(parseFloat(s.pct) * 100).toFixed(0)} bps |`).join('\n')}
| **TOTAL COMPOSITION** | | **100.00%** | **10,000 bps** |

---

### 3. MASTER RECORDING RIGHTS (Sound Recording)
The parties hereby confirm that the proprietary interest and sound recording ownership of the master recording of the Work is allocated as follows:

| Rights Holder / Contributor | Role | Agreed Percentage | Basis Points |
| :--- | :--- | :--- | :--- |
${masterSplits.map((s) => `| ${s.name} | ${s.role} | **${s.pct}** | ${(parseFloat(s.pct) * 100).toFixed(0)} bps |`).join('\n')}
| **TOTAL MASTER** | | **100.00%** | **10,000 bps** |

---

### 4. ELECTRONIC CONFIRMATIONS RECORD
The following participants have reviewed and submitted electronic confirmation regarding the split terms specified in Version ${version.versionNumber}.0:

${confirmationsList.length > 0 ? confirmationsList.join('\n') : '*No confirmations recorded yet.*'}

---

### 5. NOTICE & LEGAL DISCLAIMER
*This document is generated directly from structured rights and contribution data recorded within Ospreyn. Ospreyn provides independent documentation and workflow infrastructure and does not provide legal counsel. The parties should have this agreement and execution mechanisms reviewed by qualified South African legal counsel before formal execution.*
`.trim();
  }
}

export const db = new OspreynStore();
