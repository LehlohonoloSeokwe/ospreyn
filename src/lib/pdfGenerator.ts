/**
 * Ospreyn Professional PDF Generator
 * Generates high-fidelity, lawyer-ready, styled PDFs for:
 * 1. Split Sheet Agreements (Song details, ownership tables, confirmation signatures, legal disclaimers)
 * 2. Evidence Export Packages (Full rights dossier, audit ledger, vault evidence inventory)
 *
 * Visual Palette:
 * - Primary Dark: #141820 (Charcoal)
 * - Accent Gold: #E6B359 (Warm Gold)
 * - Accent Secondary: #34D399 (Emerald Green)
 * - Clean White canvas with crisp contrast, balanced margins, and typography
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Song, Agreement, OwnershipAllocation, Contributor, ContributorConfirmation } from '../types';

// Color definitions (RGB)
const COLOR_CHARCOAL: [number, number, number] = [20, 24, 32];
const COLOR_GOLD: [number, number, number] = [230, 179, 89];
const COLOR_MUTED: [number, number, number] = [107, 117, 133];
const COLOR_LIGHT_GRAY: [number, number, number] = [245, 247, 250];
const COLOR_BORDER: [number, number, number] = [220, 225, 232];
const COLOR_EMERALD: [number, number, number] = [16, 149, 106];

/**
 * Generates and downloads a high-fidelity PDF Split Agreement
 */
export function generateAgreementPdf(params: {
  song: Song;
  agreement: Agreement;
  allocations?: OwnershipAllocation[];
  contributors?: Contributor[];
  confirmations?: ContributorConfirmation[];
}): jsPDF {
  const { song, agreement, allocations = [], contributors = [], confirmations = [] } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // 1. TOP HEADER BANNER
  doc.setFillColor(...COLOR_CHARCOAL);
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Gold accent rule
  doc.setFillColor(...COLOR_GOLD);
  doc.rect(0, 57, pageWidth, 3, 'F');

  // Brand Name
  doc.setTextColor(...COLOR_GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('OSPREYN', margin, 28);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('MUSIC RIGHTS & SPLIT INFRASTRUCTURE', margin + 74, 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 188, 200);
  doc.text('CANONICAL SPLIT SHEET AGREEMENT', pageWidth - margin, 28, { align: 'right' });
  doc.text(`VERSION ${agreement.agreementVersion}.0`, pageWidth - margin, 42, { align: 'right' });

  // 2. DOCUMENT TITLE & STATUS
  let y = 85;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text(song.title, margin, y);

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(`Primary Artist: ${song.primaryArtist}`, margin, y);

  // Status Badge on right
  const isConfirmed = agreement.status === 'fully_confirmed';
  const badgeText = isConfirmed ? 'FULLY CONFIRMED & SEALED' : 'PENDING CONFIRMATIONS';
  const badgeWidth = doc.getTextWidth(badgeText) + 16;
  const badgeX = pageWidth - margin - badgeWidth;

  doc.setFillColor(...(isConfirmed ? COLOR_EMERALD : COLOR_GOLD));
  doc.roundedRect(badgeX, 75, badgeWidth, 20, 3, 3, 'F');
  doc.setTextColor(isConfirmed ? 255 : 20, isConfirmed ? 255 : 24, isConfirmed ? 255 : 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(badgeText, badgeX + badgeWidth / 2, 88, { align: 'center' });

  // Metadata Panel Box
  y += 16;
  doc.setFillColor(...COLOR_LIGHT_GRAY);
  doc.setDrawColor(...COLOR_BORDER);
  doc.roundedRect(margin, y, contentWidth, 42, 3, 3, 'FD');

  const colWidth = contentWidth / 4;
  const metaY1 = y + 15;
  const metaY2 = y + 31;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR_MUTED);
  doc.text('ISRC CODE', margin + 12, metaY1);
  doc.text('GENRE / RELEASE', margin + colWidth + 12, metaY1);
  doc.text('RECORD VERSION', margin + colWidth * 2 + 12, metaY1);
  doc.text('EXECUTION DATE', margin + colWidth * 3 + 12, metaY1);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text(song.isrc || 'NOT ASSIGNED', margin + 12, metaY2);
  doc.text(`${song.genre || 'General'}${song.releaseDate ? ` (${song.releaseDate})` : ''}`, margin + colWidth + 12, metaY2);
  doc.text(`Version ${agreement.agreementVersion}.0`, margin + colWidth * 2 + 12, metaY2);
  doc.text(new Date(agreement.generatedAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }), margin + colWidth * 3 + 12, metaY2);

  y += 58;

  // Filter Composition and Master allocations
  const compAllocs = allocations.filter((a) => a.rightType === 'COMPOSITION');
  const masterAllocs = allocations.filter((a) => a.rightType === 'MASTER');

  // 3. TABLE 1: COMPOSITION (PUBLISHING / MUSICAL WORK)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text('1. Composition Ownership (Musical Work & Publishing)', margin, y);

  y += 6;

  const compBody = compAllocs.map((a) => {
    const c: any = contributors.find((item) => item.id === a.contributorId) || a.contributor;
    const isConf = confirmations.some((cf) => cf.contributorId === a.contributorId && cf.action === 'confirmed');
    const roleText = Array.isArray(c?.assignedRoles) ? c.assignedRoles.join(', ') : c?.role || 'Songwriter';
    return [
      c?.fullName || 'Contributor',
      c?.professionalName || '—',
      roleText,
      `${a.basisPoints} bps`,
      `${(a.basisPoints / 100).toFixed(2)}%`,
      isConf ? 'Confirmed' : 'Pending',
    ];
  });

  const compTotalBps = compAllocs.reduce((sum, a) => sum + a.basisPoints, 0);

  autoTable(doc, {
    startY: y,
    head: [['Contributor Legal Name', 'Professional Name', 'Role(s)', 'Basis Points', 'Split %', 'Status']],
    body: compBody.length > 0 ? compBody : [['No allocations recorded', '—', '—', '0 bps', '0.00%', '—']],
    foot: [['Composition Total', '', '', `${compTotalBps} bps`, `${(compTotalBps / 100).toFixed(2)}%`, compTotalBps === 10000 ? 'Reconciled (100%)' : 'Incomplete']],
    theme: 'grid',
    headStyles: {
      fillColor: COLOR_CHARCOAL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    footStyles: {
      fillColor: COLOR_LIGHT_GRAY,
      textColor: COLOR_CHARCOAL,
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: COLOR_CHARCOAL,
      lineColor: COLOR_BORDER,
      lineWidth: 0.5,
    },
    columnStyles: {
      3: { halign: 'right', font: 'courier' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'center' },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // 4. TABLE 2: MASTER SOUND RECORDING
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text('2. Master Sound Recording Ownership', margin, y);

  y += 6;

  const masterBody = masterAllocs.map((a) => {
    const c: any = contributors.find((item) => item.id === a.contributorId) || a.contributor;
    const isConf = confirmations.some((cf) => cf.contributorId === a.contributorId && cf.action === 'confirmed');
    const roleText = Array.isArray(c?.assignedRoles) ? c.assignedRoles.join(', ') : c?.role || 'Producer / Artist';
    return [
      c?.fullName || 'Contributor',
      c?.professionalName || '—',
      roleText,
      `${a.basisPoints} bps`,
      `${(a.basisPoints / 100).toFixed(2)}%`,
      isConf ? 'Confirmed' : 'Pending',
    ];
  });

  const masterTotalBps = masterAllocs.reduce((sum, a) => sum + a.basisPoints, 0);

  autoTable(doc, {
    startY: y,
    head: [['Contributor Legal Name', 'Professional Name', 'Role(s)', 'Basis Points', 'Split %', 'Status']],
    body: masterBody.length > 0 ? masterBody : [['No allocations recorded', '—', '—', '0 bps', '0.00%', '—']],
    foot: [['Master Recording Total', '', '', `${masterTotalBps} bps`, `${(masterTotalBps / 100).toFixed(2)}%`, masterTotalBps === 10000 ? 'Reconciled (100%)' : 'Incomplete']],
    theme: 'grid',
    headStyles: {
      fillColor: COLOR_CHARCOAL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    footStyles: {
      fillColor: COLOR_LIGHT_GRAY,
      textColor: COLOR_CHARCOAL,
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: COLOR_CHARCOAL,
      lineColor: COLOR_BORDER,
      lineWidth: 0.5,
    },
    columnStyles: {
      3: { halign: 'right', font: 'courier' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'center' },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // Check if we need a new page for signatures & legal terms
  if (y > pageHeight - 220) {
    doc.addPage();
    y = 50;
  }

  // 5. TABLE 3: ELECTRONIC SIGNATURE & CONFIRMATION AUDIT RECORD
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text('3. Contributor Electronic Confirmations & Evidence Ledger', margin, y);

  y += 6;

  const confBody = confirmations.map((c) => {
    return [
      c.participantName,
      c.identityReference,
      c.action.toUpperCase(),
      new Date(c.timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      (c as any).verificationReference || c.ipAddress || 'Verified Link Token',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Participant Name', 'Identity Reference', 'Action', 'Timestamp (UTC)', 'Verification Stamp']],
    body: confBody.length > 0 ? confBody : [['Pending collaborator confirmations via secure review portal.', '—', 'PENDING', '—', '—']],
    theme: 'grid',
    headStyles: {
      fillColor: COLOR_CHARCOAL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 5,
      textColor: COLOR_CHARCOAL,
      lineColor: COLOR_BORDER,
      lineWidth: 0.5,
    },
    columnStyles: {
      3: { font: 'courier' },
      4: { font: 'courier', fontSize: 7 },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 16;

  // Check if disclaimer fits on current page
  if (y > pageHeight - 140) {
    doc.addPage();
    y = 50;
  }

  // 6. LEGAL TERMS & DISCLAIMER BOX
  doc.setFillColor(254, 252, 247); // Light gold tint
  doc.setDrawColor(...COLOR_GOLD);
  doc.setLineWidth(1);
  doc.roundedRect(margin, y, contentWidth, 70, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(160, 110, 20); // Dark gold
  doc.text('LEGAL REVIEW NOTICE & REGISTRATION ADVISORY', margin + 12, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 75, 85);
  const disclaimerLines = doc.splitTextToSize(
    'Ospreyn provides independent rights-documentation and workflow infrastructure. It does not provide legal advice or make claims regarding statutory enforceability of private confirmations. Agreement terms and confirmation mechanisms should be reviewed by qualified legal counsel before formal execution. All parties agree that ownership percentages stated above represent the complete and final division of rights for this version, and supersedes any prior informal or verbal arrangements.',
    contentWidth - 24
  );
  doc.text(disclaimerLines, margin + 12, y + 28);

  // 7. FOOTER ON ALL PAGES
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Document ID: ${agreement.id} • Generated via Ospreyn Rights Ledger`, margin, pageHeight - 18);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
  }

  return doc;
}

/**
 * Generates and downloads the complete Evidence Export Dossier as a PDF
 */
export function generateEvidencePackagePdf(params: {
  song: Song;
  exportData: any;
}): jsPDF {
  const { song, exportData } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // 1. TOP HEADER BANNER
  doc.setFillColor(...COLOR_CHARCOAL);
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Gold accent rule
  doc.setFillColor(...COLOR_GOLD);
  doc.rect(0, 57, pageWidth, 3, 'F');

  // Brand Name
  doc.setTextColor(...COLOR_GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('OSPREYN', margin, 28);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('RIGHTS RECORD EVIDENCE PACKAGE & AUDIT DOSSIER', margin + 74, 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 188, 200);
  doc.text('IMMUTABLE EVIDENCE ARCHIVE', pageWidth - margin, 28, { align: 'right' });
  doc.text(`EXPORT DATE: ${new Date().toISOString().slice(0, 10)}`, pageWidth - margin, 42, { align: 'right' });

  let y = 85;

  // 2. DOSSIER TITLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text(`Evidence Archive: ${song.title}`, margin, y);

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(`Primary Artist: ${song.primaryArtist} | Version ${song.currentVersionNumber}.0 | Status: ${song.status.toUpperCase()}`, margin, y);

  // Summary Metrics Box
  y += 14;
  doc.setFillColor(...COLOR_LIGHT_GRAY);
  doc.setDrawColor(...COLOR_BORDER);
  doc.roundedRect(margin, y, contentWidth, 38, 3, 3, 'FD');

  const colWidth = contentWidth / 4;
  const metaY1 = y + 14;
  const metaY2 = y + 28;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR_MUTED);
  doc.text('ALLOCATIONS', margin + 12, metaY1);
  doc.text('CONFIRMATIONS', margin + colWidth + 12, metaY1);
  doc.text('VAULT DOCUMENTS', margin + colWidth * 2 + 12, metaY1);
  doc.text('AUDIT EVENTS', margin + colWidth * 3 + 12, metaY1);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text(`${exportData?.ownershipSplits?.length || 0} Records`, margin + 12, metaY2);
  doc.text(`${exportData?.confirmationsRecord?.length || 0} Signed`, margin + colWidth + 12, metaY2);
  doc.text(`${exportData?.documentVault?.length || 0} Files Sealed`, margin + colWidth * 2 + 12, metaY2);
  doc.text(`${exportData?.auditTrail?.length || 0} Ledger Entries`, margin + colWidth * 3 + 12, metaY2);

  y += 54;

  // 3. SECTION: OWNERSHIP ALLOCATIONS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text('1. Verified Ownership Allocations', margin, y);

  y += 6;

  const allocs = exportData?.ownershipSplits || [];
  const allocBody = allocs.map((a: any) => [
    a.rightType,
    a.contributor?.fullName || a.contributorName || 'Contributor',
    a.contributor?.professionalName || '—',
    `${a.basisPoints} bps`,
    `${(a.basisPoints / 100).toFixed(2)}%`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Right Type', 'Contributor Name', 'Professional Name', 'Basis Points', 'Percentage']],
    body: allocBody.length > 0 ? allocBody : [['No allocations recorded', '—', '—', '0 bps', '0.00%']],
    theme: 'grid',
    headStyles: { fillColor: COLOR_CHARCOAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 5, textColor: COLOR_CHARCOAL, lineColor: COLOR_BORDER, lineWidth: 0.5 },
    columnStyles: { 3: { halign: 'right', font: 'courier' }, 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 18;

  // 4. SECTION: STORED DOCUMENTS IN VAULT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text('2. Document Vault Evidence & Cryptographic Checksums', margin, y);

  y += 6;

  const docs = exportData?.documentVault || [];
  const docBody = docs.map((d: any) => [
    d.fileName,
    d.category.replace(/_/g, ' ').toUpperCase(),
    `${(d.fileSize / 1024).toFixed(1)} KB`,
    d.checksum ? `${d.checksum.slice(0, 16)}...` : '—',
    d.storageKey || 'Private Bucket',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['File Name', 'Category', 'Size', 'SHA-256 Checksum', 'Storage Key Reference']],
    body: docBody.length > 0 ? docBody : [['No documents currently stored in vault', '—', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: COLOR_CHARCOAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 5, textColor: COLOR_CHARCOAL, lineColor: COLOR_BORDER, lineWidth: 0.5 },
    columnStyles: { 3: { font: 'courier', fontSize: 7 }, 4: { font: 'courier', fontSize: 7 } },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 18;

  // Check if we need page break for audit ledger
  if (y > pageHeight - 180) {
    doc.addPage();
    y = 50;
  }

  // 5. SECTION: AUDIT TRAIL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_CHARCOAL);
  doc.text('3. Complete Immutable Audit Ledger', margin, y);

  y += 6;

  const audit = exportData?.auditTrail || [];
  const auditBody = audit.slice(0, 25).map((e: any) => [
    new Date(e.createdAt).toISOString().replace('T', ' ').slice(0, 19),
    e.eventType.replace(/_/g, ' '),
    e.actorName || e.actorType,
    e.entityType ? `${e.entityType} (${(e.entityId || '').slice(0, 8)})` : 'Song Record',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Timestamp (UTC)', 'Event Type', 'Actor', 'Target Entity']],
    body: auditBody.length > 0 ? auditBody : [['No audit entries recorded', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: COLOR_CHARCOAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 4, textColor: COLOR_CHARCOAL, lineColor: COLOR_BORDER, lineWidth: 0.5 },
    columnStyles: { 0: { font: 'courier' } },
    margin: { left: margin, right: margin },
  });

  // Footer on all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Ospreyn Evidence Archive • Song ID: ${song.id}`, margin, pageHeight - 18);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
  }

  return doc;
}

/**
 * Trigger download of the split agreement PDF directly in the user's browser
 */
export function downloadSplitAgreementPdf(params: {
  song: Song;
  agreement: Agreement;
  allocations?: OwnershipAllocation[];
  contributors?: Contributor[];
  confirmations?: ContributorConfirmation[];
}) {
  const doc = generateAgreementPdf(params);
  const cleanTitle = params.song.title.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${cleanTitle}_Split_Agreement_v${params.agreement.agreementVersion}.pdf`);
}

/**
 * Trigger download of the evidence export package PDF directly in the user's browser
 */
export function downloadEvidencePackagePdf(params: {
  song: Song;
  exportData: any;
}) {
  const doc = generateEvidencePackagePdf(params);
  const cleanTitle = params.song.title.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Ospreyn_Evidence_Package_${cleanTitle}_v${params.song.currentVersionNumber}.pdf`);
}
