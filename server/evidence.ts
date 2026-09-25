/**
 * Evidence Strength scoring.
 *
 * A song's ownership splits can be 100% allocated and fully confirmed and
 * still be very poorly documented — no executed agreement, no session
 * proof, no correspondence trail. This score is deliberately about
 * *documentation*, separate from the ownership/confirmation completeness
 * already tracked by RightsValidationSummary (see src/types.ts) and shown
 * in the Rights Record's "completion" indicator.
 *
 * The four groups below map to what actually gets asked for in a dispute,
 * a royalty claim, or a CMO (SAMRO/CAPASSO/etc.) registration: something
 * that proves the agreement, something from the session itself, something
 * that proves the numbers (invoices, ISRC/registration paperwork), and a
 * correspondence trail. A song scores highest when it has at least one
 * document from each group, not just a pile of documents from one.
 */

import { DocumentCategory, DocumentRecord } from '../src/types';

export type EvidenceLabel = 'weak' | 'moderate' | 'strong' | 'complete';

export interface EvidenceStrength {
  score: number; // 0-100
  label: EvidenceLabel;
  documentCount: number;
  groupsCovered: number; // 0-4
  groupsTotal: number;
  missingGroups: string[];
}

const EVIDENCE_GROUPS: Array<{ key: string; label: string; categories: DocumentCategory[] }> = [
  {
    key: 'agreement',
    label: 'An executed agreement (split sheet, contract or licence)',
    categories: ['split_agreement', 'contract', 'licensing_agreement', 'producer_agreement'],
  },
  {
    key: 'creation',
    label: 'Proof of the creation process (session notes, stems or lyrics)',
    categories: ['session_notes', 'stems_project_files', 'lyrics_sheet', 'master_recording'],
  },
  {
    key: 'registration',
    label: 'Registration or financial paperwork (invoice, ISRC or copyright registration)',
    categories: ['invoice', 'isrc_documentation', 'copyright_registration'],
  },
  {
    key: 'correspondence',
    label: 'A correspondence trail',
    categories: ['correspondence', 'supporting_document', 'other'],
  },
];

export function scoreLabel(score: number): EvidenceLabel {
  if (score >= 85) return 'complete';
  if (score >= 55) return 'strong';
  if (score >= 25) return 'moderate';
  return 'weak';
}

export const EVIDENCE_LABEL_TEXT: Record<EvidenceLabel, string> = {
  weak: 'Weak evidence',
  moderate: 'Moderate evidence',
  strong: 'Strong evidence',
  complete: 'Complete documentation',
};

/**
 * documentCount contributes up to 40 points (10 per stored document, capped
 * at 4 — a 5th split-agreement scan doesn't prove anything a duplicate
 * hasn't already), and group coverage contributes up to 60 (15 per group
 * that has at least one document), so a song can't reach "Strong" purely by
 * uploading five copies of the same thing.
 */
export function computeEvidenceStrength(documents: Pick<DocumentRecord, 'category'>[]): EvidenceStrength {
  const documentCount = documents.length;
  const countScore = Math.min(documentCount, 4) * 10;

  const groupsPresent = EVIDENCE_GROUPS.filter((group) =>
    documents.some((doc) => group.categories.includes(doc.category as DocumentCategory)),
  );
  const groupScore = groupsPresent.length * 15;

  const score = Math.min(100, countScore + groupScore);

  return {
    score,
    label: scoreLabel(score),
    documentCount,
    groupsCovered: groupsPresent.length,
    groupsTotal: EVIDENCE_GROUPS.length,
    missingGroups: EVIDENCE_GROUPS.filter((g) => !groupsPresent.includes(g)).map((g) => g.label),
  };
}
