import React, { useRef, useState } from 'react';
import {
  Upload,
  Download,
  Lock,
  Shield,
  Copy,
  Check,
  FileCheck,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';
import {
  RightsRecordVersion,
  DocumentCategory,
  DocumentRecord,
  Song,
  EvidenceStrength,
  DOCUMENT_CATEGORY_INFO,
  EVIDENCE_LABEL_TEXT,
  EVIDENCE_LABEL_COLOR,
} from '../types';
import { api, ApiError, sha256Base64 } from '../lib/api';

interface DocumentVaultTabProps {
  song: Song;
  songId: string;
  currentVersion: RightsRecordVersion;
  documents: DocumentRecord[];
  evidence?: EvidenceStrength | null;
  /** Refreshes the parent record once an upload has been confirmed. */
  onUploadDocument: () => Promise<void>;
}

type Stage = 'idle' | 'hashing' | 'uploading' | 'confirming';

const STAGE_LABEL: Record<Stage, string> = {
  idle: 'Upload file',
  hashing: 'Checking file…',
  uploading: 'Uploading…',
  confirming: 'Confirming…',
};

const CATEGORY_OPTIONS: DocumentCategory[] = [
  'split_agreement',
  'contract',
  'licensing_agreement',
  'producer_agreement',
  'master_recording',
  'lyrics_sheet',
  'session_notes',
  'stems_project_files',
  'invoice',
  'isrc_documentation',
  'copyright_registration',
  'correspondence',
  'supporting_document',
  'other',
];

export const DocumentVaultTab: React.FC<DocumentVaultTabProps> = ({
  songId,
  currentVersion,
  documents,
  evidence,
  onUploadDocument,
}) => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('split_agreement');
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedChecksum, setCopiedChecksum] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = stage !== 'idle';

  const reset = () => {
    setFile(null);
    setStage('idle');
    setProgress(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Three steps: ask the API for a presigned URL, PUT the bytes straight to
   * object storage, then tell the API to verify the object landed. The file
   * never passes through the Ospreyn server.
   */
  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setError(null);
    let documentId: string | null = null;

    try {
      setStage('hashing');
      const checksumSha256 = await sha256Base64(file);

      const reservation = await api.post(`/songs/${songId}/documents/upload-url`, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        category,
        checksumSha256,
      });
      documentId = reservation.documentId;

      setStage('uploading');
      await putWithProgress(reservation.uploadUrl, file, reservation.requiredHeaders, setProgress);

      setStage('confirming');
      await api.post(`/songs/${songId}/documents/${documentId}/complete`, {});

      await onUploadDocument();
      setIsUploadOpen(false);
      reset();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The upload did not complete.',
      );
      setStage('idle');
      setProgress(0);
    }
  };

  const startDownload = async (doc: DocumentRecord) => {
    try {
      const { url } = await api.get(`/songs/${songId}/documents/${doc.id}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open that document.');
    }
  };

  const copyChecksum = (checksum: string) => {
    void navigator.clipboard.writeText(checksum);
    setCopiedChecksum(checksum);
    setTimeout(() => setCopiedChecksum(null), 2000);
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Why this matters */}
      <div className="flex items-start gap-3 rounded border border-[#1e232d] bg-[#11141b] p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8c94a0]" />
        <div className="text-xs leading-relaxed text-[#8c94a0]">
          <span className="font-semibold text-white">Why upload documents?</span> A confirmed
          split is strong, but paperwork is what actually holds up if it's ever questioned.
          Documents here can help <strong className="text-[#b8c0cc]">prove ownership</strong>,
          {' '}<strong className="text-[#b8c0cc]">resolve disputes</strong>,{' '}
          <strong className="text-[#b8c0cc]">verify contributor agreements</strong>,{' '}
          <strong className="text-[#b8c0cc]">support royalty claims</strong>,{' '}
          <strong className="text-[#b8c0cc]">establish a creation timeline</strong>,{' '}
          <strong className="text-[#b8c0cc]">demonstrate chain of title</strong>, and{' '}
          <strong className="text-[#b8c0cc]">prepare registrations with collection societies</strong>.
        </div>
      </div>

      {evidence && <EvidenceStrengthCard evidence={evidence} />}

      <div className="flex flex-col gap-3 rounded border border-[#1e232d] bg-[#11141b] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-emerald-400" />
            Private document vault
          </h3>
          <p className="mt-0.5 text-xs text-[#798394]">
            Files upload straight to private object storage. Ospreyn keeps the storage key and the
            SHA-256 of the stored bytes, so a stored file's integrity can always be verified.
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded bg-[#ffffff] px-3.5 py-1.5 text-xs font-semibold tracking-tight text-[#0c0e12] transition-colors hover:bg-[#e2e2e2]"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload document</span>
        </button>
      </div>

      {error && !isUploadOpen && (
        <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded border border-[#1f242e] bg-[#0e1116]">
        <div className="flex items-center justify-between border-b border-[#1b2029] p-4">
          <h4 className="font-mono text-xs uppercase tracking-wider text-[#8c94a0]">
            Stored files ({documents.length})
          </h4>
          <span className="flex items-center gap-1 font-mono text-[11px] text-[#5e6675]">
            <Shield className="h-3 w-3 text-emerald-400" />
            Signed URL access only
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#5e6675]">
            Nothing stored yet. A split sheet or a signed agreement is the single most useful
            thing you can add here.
          </div>
        ) : (
          <div className="divide-y divide-[#181c24]">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-[#12161f] md:flex-row md:items-center"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 shrink-0 text-[#ffffff]" />
                    <span className="text-xs font-semibold text-white truncate">{doc.fileName}</span>
                    <span className="shrink-0 rounded border border-[#273042] bg-[#1a202c] px-2 py-0.5 font-mono text-[10px] uppercase text-[#9ba4b4]">
                      {DOCUMENT_CATEGORY_INFO[doc.category]?.label || doc.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="max-w-xl truncate font-mono text-[11px] text-[#6b7585]">
                    Key: <span className="text-[#8c94a0]">{doc.storageKey}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-[11px] text-[#8c94a0]">
                      {formatBytes(doc.fileSize)}
                    </div>
                    {doc.checksum ? (
                      <button
                        onClick={() => copyChecksum(doc.checksum!)}
                        className="flex items-center justify-end gap-1 font-mono text-[10px] text-[#5e6675] hover:text-[#9aa3b2]"
                        title="SHA-256 of the stored file"
                      >
                        <span>SHA: {doc.checksum.slice(0, 8)}…</span>
                        {copiedChecksum === doc.checksum ? (
                          <Check className="h-2.5 w-2.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-2.5 w-2.5" />
                        )}
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] text-[#5e6675]">No checksum</span>
                    )}
                  </div>
                  <button
                    onClick={() => startDownload(doc)}
                    className="flex items-center gap-1 rounded border border-[#252c38] bg-[#141820] px-2.5 py-1 text-xs text-[#c5cbd4] transition-colors hover:bg-[#1e2430] hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Upload to the vault</h3>

            <form onSubmit={handleUpload} className="space-y-3.5">
              <div>
                <label
                  htmlFor="vault-file"
                  className="mb-1 block text-xs font-medium text-[#c5cbd4]"
                >
                  File
                </label>
                <input
                  id="vault-file"
                  ref={fileInputRef}
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.mp3,.wav,.zip"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setError(null);
                  }}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white file:mr-3 file:rounded file:border-0 file:bg-[#232936] file:px-2.5 file:py-1 file:text-xs file:text-[#c5cbd4] focus:border-[#ffffff] focus:outline-hidden"
                />
                {file && (
                  <p className="mt-1.5 font-mono text-[11px] text-[#798394]">
                    {file.name} · {formatBytes(file.size)}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="vault-category"
                  className="mb-1 block text-xs font-medium text-[#c5cbd4]"
                >
                  Category
                </label>
                <select
                  id="vault-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#ffffff] focus:outline-hidden"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {DOCUMENT_CATEGORY_INFO[cat].label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#798394]">
                  {DOCUMENT_CATEGORY_INFO[category].helper}
                </p>
              </div>

              {busy && (
                <div className="space-y-1.5">
                  <div className="h-1 overflow-hidden rounded bg-[#1a1f29]">
                    <div
                      className="h-full bg-[#ffffff] transition-all duration-200"
                      style={{ width: `${stage === 'uploading' ? progress : 100}%` }}
                    />
                  </div>
                  <p className="font-mono text-[11px] text-[#798394]">
                    {STAGE_LABEL[stage]}
                    {stage === 'uploading' ? ` ${progress}%` : ''}
                  </p>
                </div>
              )}

              <div className="space-y-1 rounded border border-[#222834] bg-[#0c0e12] p-3 font-mono text-[11px] text-[#798394]">
                <div>Uploads directly to private storage, not through this server</div>
                <div>Checksum is taken from the stored bytes</div>
                <div>Attached to version {currentVersion.versionNumber}.0</div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-400">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setIsUploadOpen(false);
                    reset();
                  }}
                  className="rounded border border-[#282f3d] bg-transparent px-3 py-1.5 text-xs text-[#8c94a0] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !file}
                  className="flex items-center gap-1.5 rounded bg-[#ffffff] px-4 py-1.5 text-xs font-semibold text-[#0c0e12] hover:bg-[#e2e2e2] disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  {STAGE_LABEL[stage]}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const EvidenceStrengthCard: React.FC<{ evidence: EvidenceStrength }> = ({ evidence }) => {
  const color = EVIDENCE_LABEL_COLOR[evidence.label];
  return (
    <div className="rounded border border-[#1f242e] bg-[#0e1116] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-white">{EVIDENCE_LABEL_TEXT[evidence.label]}</span>
        </div>
        <span className="font-mono text-xs text-[#8c94a0]">{evidence.score}/100</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1a1e26]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${evidence.score}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-2 text-[11px] text-[#798394]">
        {evidence.groupsCovered} of {evidence.groupsTotal} evidence categories covered
        {evidence.missingGroups.length > 0 && (
          <> — consider adding: {evidence.missingGroups.join(', ')}</>
        )}
        .
      </p>
    </div>
  );
};

/** XHR rather than fetch, because fetch cannot report upload progress. */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    for (const [key, value] of Object.entries(headers || {})) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new Error(
            `Object storage rejected the upload (${xhr.status}). Check the bucket CORS rules allow PUT from this site.`,
          ),
        );
    };

    xhr.onerror = () =>
      reject(new Error('Network error during upload. Check the bucket CORS configuration.'));

    xhr.send(file);
  });
}
