/**
 * Split-sheet agreement rendering.
 *
 * Pure formatting over data already read from PostgreSQL. Nothing here reads
 * or writes state, so the same function serves the review portal preview and
 * the stored, immutable agreement record.
 */

import {
  ContributorConfirmation,
  OwnershipAllocation,
  RightsRecordVersion,
  Song,
  SongContributor,
} from '../src/types';

export const DISCLAIMER_TEXT =
  'Notice: Ospreyn provides independent rights-documentation and workflow infrastructure. ' +
  'It does not provide legal advice or make claims regarding the legal enforceability of ' +
  'private confirmations. Agreement terms and confirmation mechanisms should be reviewed by ' +
  'qualified South African legal counsel before formal execution.';

export function generateSplitSheetAgreementText(input: {
  song: Song;
  version: RightsRecordVersion;
  allocations: OwnershipAllocation[];
  songContributors: SongContributor[];
  confirmations: ContributorConfirmation[];
}): string {
  const { song, version, allocations, songContributors, confirmations } = input;

  const rolesByContributor: Record<string, string[]> = {};
  for (const sc of songContributors) {
    if (!rolesByContributor[sc.contributorId]) rolesByContributor[sc.contributorId] = [];
    rolesByContributor[sc.contributorId].push(sc.customRoleTitle || sc.role);
  }

  const rows = (rightType: 'COMPOSITION' | 'MASTER') =>
    allocations
      .filter((a) => a.rightType === rightType && a.basisPoints > 0)
      .sort((a, b) => b.basisPoints - a.basisPoints)
      .map((a) => {
        const c = a.contributor;
        const name = c
          ? `${c.fullName}${c.professionalName ? ` ("${c.professionalName}")` : ''}`
          : 'Unknown contributor';
        const role = rolesByContributor[a.contributorId]?.join(', ') || 'Contributor';
        return `| ${name} | ${role} | **${(a.basisPoints / 100).toFixed(2)}%** | ${a.basisPoints} bps |`;
      });

  const total = (rightType: 'COMPOSITION' | 'MASTER') =>
    allocations
      .filter((a) => a.rightType === rightType)
      .reduce((sum, a) => sum + a.basisPoints, 0);

  const compRows = rows('COMPOSITION');
  const masterRows = rows('MASTER');
  const compTotal = total('COMPOSITION');
  const masterTotal = total('MASTER');

  const confirmationLines = confirmations
    .filter((c) => c.action === 'confirmed')
    .map(
      (c) =>
        `- **${c.participantName}** (${c.identityReference}): Confirmed on ${new Date(
          c.timestamp,
        ).toUTCString()} [IP: ${c.ipAddress || 'not recorded'}]`,
    );

  const changeRequests = confirmations
    .filter((c) => c.action === 'change_requested')
    .map(
      (c) =>
        `- **${c.participantName}** requested a change on ${new Date(
          c.timestamp,
        ).toUTCString()}: ${c.changeRequestComment || 'no detail supplied'}`,
    );

  return `
# MUSIC RIGHTS SPLIT AGREEMENT & OWNERSHIP RECORD
**Document Identifier:** OSPREYN-REC-${song.id.slice(0, 8).toUpperCase()}-V${version.versionNumber}
**Date of Record:** ${new Date(version.createdAt).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}
**Rights Record Version:** ${version.versionNumber}.0 (${version.status.toUpperCase()})

---

### 1. WORK DETAILS
- **Title of Work:** ${song.title}
- **Primary Artist:** ${song.primaryArtist}
- **ISRC:** ${song.isrc || 'Pending / Unregistered'}
- **Catalogue Reference:** ${song.catalogueReference || 'None'}
- **Release Date:** ${song.releaseDate || 'To be confirmed'}

---

### 2. COMPOSITION RIGHTS (Songwriting & Publishing)
The parties confirm that the copyright in the musical composition and lyrics of the Work is allocated as follows:

| Contributor / Legal Name | Role | Agreed Percentage | Basis Points |
| :--- | :--- | :--- | :--- |
${compRows.length ? compRows.join('\n') : '| *No composition allocations recorded* | | | |'}
| **TOTAL COMPOSITION** | | **${(compTotal / 100).toFixed(2)}%** | **${compTotal.toLocaleString('en-ZA')} bps** |

---

### 3. MASTER RECORDING RIGHTS (Sound Recording)
The parties confirm that the proprietary interest and sound recording ownership of the master recording of the Work is allocated as follows:

| Rights Holder / Contributor | Role | Agreed Percentage | Basis Points |
| :--- | :--- | :--- | :--- |
${masterRows.length ? masterRows.join('\n') : '| *No master allocations recorded* | | | |'}
| **TOTAL MASTER** | | **${(masterTotal / 100).toFixed(2)}%** | **${masterTotal.toLocaleString('en-ZA')} bps** |

---

### 4. ELECTRONIC CONFIRMATIONS RECORD
The following participants reviewed and submitted electronic confirmation regarding the split terms specified in Version ${version.versionNumber}.0:

${confirmationLines.length > 0 ? confirmationLines.join('\n') : '*No confirmations recorded yet.*'}
${changeRequests.length > 0 ? `\n**Outstanding change requests:**\n${changeRequests.join('\n')}` : ''}

---

### 5. NOTICE & LEGAL DISCLAIMER
*${DISCLAIMER_TEXT}*
`.trim();
}
