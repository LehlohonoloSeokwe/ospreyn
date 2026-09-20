/**
 * Evidence package -> PDF.
 *
 * Rather than pull in a PDF-generation library, this renders a clean,
 * print-optimised HTML document in a new tab and calls window.print(),
 * letting the browser's native "Save as PDF" do the actual PDF encoding.
 * That keeps this dependency-free and avoids fighting a client-side PDF
 * library's limited layout engine for what is, in the end, a document the
 * user will print or save — exactly what browsers already do well.
 */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function section(title: string, bodyHtml: string): string {
  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      ${bodyHtml}
    </section>`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<p class="empty">None recorded.</p>`;
  }
  return `
    <table>
      <thead>
        <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
          .join('')}
      </tbody>
    </table>`;
}

export function printEvidencePackage(exportData: any) {
  if (!exportData) return;

  const logoUrl = `${window.location.origin}/assets/logo-gold.png`;
  const song = exportData.song || {};
  const ownership = exportData.ownershipSplits || [];
  const confirmations = exportData.confirmationsRecord || [];
  const agreements = exportData.agreements || [];
  const documents = exportData.documentVault || [];
  const audit = exportData.auditLedger || [];

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Ospreyn Evidence Package — ${escapeHtml(song.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #16181d;
    margin: 0;
    padding: 0;
  }
  .page { max-width: 780px; margin: 0 auto; padding: 48px 40px; }
  .cover {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 2px solid #16181d;
    padding-bottom: 20px;
    margin-bottom: 24px;
  }
  .cover img { height: 28px; width: 28px; }
  .cover .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .cover .sub { font-size: 11px; color: #666; font-family: ui-monospace, Menlo, monospace; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 4px; }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
    font-size: 12px;
    margin: 20px 0 32px;
    padding: 16px;
    background: #f5f5f6;
    border-radius: 6px;
  }
  .meta-grid div span.label { color: #666; display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .section { margin-bottom: 32px; page-break-inside: avoid; }
  .section h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #d8d8dc;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e6e6e9; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
  .empty { font-size: 12px; color: #888; font-style: italic; }
  .agreement-block {
    background: #f5f5f6;
    border: 1px solid #e6e6e9;
    border-radius: 6px;
    padding: 16px;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 11px;
    white-space: pre-wrap;
    margin-bottom: 12px;
  }
  .legal {
    font-size: 10.5px;
    color: #666;
    border-top: 1px solid #d8d8dc;
    padding-top: 16px;
    margin-top: 40px;
  }
  @media print {
    .page { padding: 0; max-width: none; }
    @page { margin: 18mm 16mm; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <img src="${logoUrl}" alt="" />
      <div>
        <div class="brand">Ospreyn</div>
        <div class="sub">Music Rights Infrastructure — Evidence Package</div>
      </div>
    </div>

    <h1>${escapeHtml(song.title)}</h1>
    <div class="meta">Primary artist: ${escapeHtml(song.primaryArtist)}</div>
    <div class="meta">Record: ${escapeHtml(exportData.recordIdentifier)}</div>

    <div class="meta-grid">
      <div><span class="label">ISRC</span>${escapeHtml(song.isrc || '—')}</div>
      <div><span class="label">Catalogue reference</span>${escapeHtml(song.catalogueReference || '—')}</div>
      <div><span class="label">Genre</span>${escapeHtml(song.genre || '—')}</div>
      <div><span class="label">Release date</span>${escapeHtml(song.releaseDate || '—')}</div>
      <div><span class="label">Status</span>${escapeHtml(song.status || '—')}</div>
      <div><span class="label">Version</span>v${escapeHtml(song.version ?? '—')}</div>
      <div><span class="label">Exported</span>${formatDate(exportData.exportTimestamp)}</div>
    </div>

    ${section(
      'Ownership splits',
      table(
        ['Contributor', 'Email', 'Right', 'Share'],
        ownership.map((o: any) => [
          escapeHtml(o.contributorName),
          escapeHtml(o.email),
          escapeHtml(o.rightType),
          escapeHtml(o.percentage),
        ]),
      ),
    )}

    ${section(
      'Contributor confirmations',
      table(
        ['Participant', 'Identity reference', 'Action', 'Confirmed at', 'IP address'],
        confirmations.map((c: any) => [
          escapeHtml(c.participantName),
          escapeHtml(c.identityReference),
          escapeHtml(c.action),
          formatDate(c.confirmedAt),
          escapeHtml(c.ipAddress),
        ]),
      ) +
        confirmations
          .filter((c: any) => c.changeRequestComment)
          .map(
            (c: any) =>
              `<p class="empty" style="margin-top:8px;"><strong>${escapeHtml(
                c.participantName,
              )}'s note:</strong> "${escapeHtml(c.changeRequestComment)}"</p>`,
          )
          .join(''),
    )}

    ${section(
      'Agreements',
      agreements.length === 0
        ? '<p class="empty">None generated.</p>'
        : agreements
            .map(
              (a: any) => `
          <div class="meta"><strong>${escapeHtml(a.title)}</strong> — v${escapeHtml(a.version)} · ${escapeHtml(
                a.status,
              )} · generated ${formatDate(a.generatedAt)}</div>
          <div class="agreement-block">${escapeHtml(a.content)}</div>`,
            )
            .join(''),
    )}

    ${section(
      'Document vault',
      table(
        ['File', 'Category', 'Size', 'Checksum (SHA-256)', 'Added'],
        documents.map((d: any) => [
          escapeHtml(d.fileName),
          escapeHtml(d.category),
          `${((d.fileSize || 0) / 1024).toFixed(1)} KB`,
          `<span style="font-family:ui-monospace,Menlo,monospace;">${escapeHtml(
            (d.checksumSha256 || '').slice(0, 16),
          )}${d.checksumSha256 ? '…' : '—'}</span>`,
          formatDate(d.createdAt),
        ]),
      ),
    )}

    ${section(
      'Audit ledger',
      table(
        ['Event', 'Actor', 'Timestamp'],
        audit.map((e: any) => [
          escapeHtml(e.eventType),
          escapeHtml(e.actorName),
          formatDate(e.createdAt || e.timestamp),
        ]),
      ),
    )}

    <div class="legal">${escapeHtml(exportData.legalNotice)}</div>
  </div>

  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 200);
    };
  </script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to generate the PDF.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
