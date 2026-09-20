import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Lock,
  Shield,
  Download,
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  X,
  Server,
  Cloud,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import {
  Song,
  RightsRecordVersion,
  DocumentRecord,
  DocumentCategory,
} from '../types';

interface DocumentVaultTabProps {
  song: Song;
  currentVersion: RightsRecordVersion;
  documents: DocumentRecord[];
  onUploadDocument: (data: any) => Promise<void>;
}

export const DocumentVaultTab: React.FC<DocumentVaultTabProps> = ({
  song,
  currentVersion,
  documents,
  onUploadDocument,
}) => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('split_agreement');
  const [fileSize, setFileSize] = useState<number>(245000);
  const [mimeType, setMimeType] = useState<string>('application/pdf');
  const [fileData, setFileData] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copiedChecksum, setCopiedChecksum] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<{
    s3Configured: boolean;
    storageMode: string;
    bucket: string | null;
    region: string;
    guidance?: any;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/storage/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStorageStatus(data);
      })
      .catch(() => {
        // Fallback default
        setStorageStatus({
          s3Configured: false,
          storageMode: 'local_storage',
          bucket: null,
          region: 'eu-west-1',
        });
      });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    setMimeType(file.type || 'application/octet-stream');
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;
    setUploading(true);
    setUploadError(null);

    try {
      await onUploadDocument({
        fileName: fileName.trim(),
        category,
        fileSize,
        mimeType,
        versionId: currentVersion.id,
        fileData: fileData || undefined,
      });
      setIsUploadOpen(false);
      setFileName('');
      setFileData(null);
    } catch (err: any) {
      console.error('Document upload failed:', err);
      setUploadError(
        err.message ||
          'Upload failed. If using S3, ensure S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are set on your backend host.'
      );
    } finally {
      setUploading(false);
    }
  };

  const copyChecksum = (checksum: string) => {
    navigator.clipboard.writeText(checksum);
    setCopiedChecksum(checksum);
    setTimeout(() => setCopiedChecksum(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#11141b] border border-[#1e232d] p-4 rounded">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-emerald-400" />
              Private Document Vault
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono ${
                storageStatus?.s3Configured
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  : 'bg-[#181d28] text-[#8c94a0] border border-[#273042]'
              }`}
            >
              {storageStatus?.s3Configured ? (
                <>
                  <Cloud className="h-2.5 w-2.5 text-emerald-400" />
                  S3 Cloud Storage Active
                </>
              ) : (
                <>
                  <Server className="h-2.5 w-2.5 text-[#e6b359]" />
                  Local Server Storage Fallback
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-[#798394] mt-0.5">
            Files stored securely; cryptographic SHA-256 checksums and immutable metadata registered on the audit ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="flex items-center gap-1 rounded border border-[#242b38] bg-[#141822] hover:bg-[#1c2230] text-[#8c94a0] hover:text-white px-3 py-1.5 text-xs transition-colors cursor-pointer"
            title="View S3 object storage setup instructions"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#e6b359]" />
            <span>Storage Guide</span>
          </button>
          <button
            onClick={() => {
              setUploadError(null);
              setIsUploadOpen(true);
            }}
            className="flex items-center gap-1.5 rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-colors cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>+ Upload Document</span>
          </button>
        </div>
      </div>

      {/* Documents List */}
      <div className="rounded border border-[#1f242e] bg-[#0e1116] overflow-hidden">
        <div className="p-4 border-b border-[#1b2029] flex items-center justify-between">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">
            Stored Evidence &amp; Supporting Files ({documents.length})
          </h4>
          <span className="text-[11px] text-[#5e6675] font-mono flex items-center gap-1">
            <Shield className="h-3 w-3 text-emerald-400" />
            Signed URL Access Only
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#5e6675]">
            No documents uploaded to this vault yet. Click "+ Upload Document" above to upload agreements, lyric sheets, or stems.
          </div>
        ) : (
          <div className="divide-y divide-[#1b2029]">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#12151c]/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#e6b359]" />
                    <span className="text-xs font-semibold text-white">{doc.fileName}</span>
                    <span className="text-[10px] font-mono uppercase bg-[#181c26] text-[#8c94a0] px-1.5 py-0.2 rounded border border-[#232836]">
                      {doc.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#5e6675] flex items-center gap-3">
                    <span>{formatBytes(doc.fileSize)}</span>
                    <span>•</span>
                    <span>{new Date(doc.createdAt).toISOString().slice(0, 10)}</span>
                    <span>•</span>
                    <span className="text-[#798394] truncate max-w-xs">{doc.storageKey}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <button
                      onClick={() => copyChecksum(doc.checksum)}
                      className="text-[10px] font-mono text-[#5e6675] hover:text-[#9aa3b2] flex items-center gap-1 justify-end cursor-pointer"
                      title="SHA-256 Checksum"
                    >
                      <span>SHA: {doc.checksum.slice(0, 8)}...</span>
                      {copiedChecksum === doc.checksum ? (
                        <Check className="h-2.5 w-2.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </div>
                  <a
                    href={`/api/songs/${song.id}/documents/${doc.id}/download`}
                    className="flex items-center gap-1 rounded border border-[#252c38] bg-[#141820] hover:bg-[#1e2430] text-[#c5cbd4] hover:text-white px-2.5 py-1 text-xs transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1b2029] pb-3">
              <h3 className="text-base font-semibold text-white">Upload to Document Vault</h3>
              <button
                onClick={() => setIsUploadOpen(false)}
                className="text-[#6c7686] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {uploadError && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                  <span>Upload Notice</span>
                </div>
                <p>{uploadError}</p>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-3.5">
              {/* File input / Drag drop area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded border-2 border-dashed border-[#283244] hover:border-[#e6b359]/60 bg-[#121620] p-4 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Upload className="h-6 w-6 text-[#e6b359] mx-auto mb-1.5" />
                <div className="text-xs text-white font-medium">
                  {fileName ? fileName : 'Choose file or drag & drop here'}
                </div>
                <div className="text-[11px] text-[#6c7686] mt-0.5">
                  PDF, DOCX, WAV, MP3, TXT, or ZIP up to 50MB
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">File Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master_Recording_WAV_Agreement.pdf"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#e6b359] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">Document Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#e6b359] focus:outline-hidden"
                >
                  <option value="split_agreement">Split Agreement (Executed / Signed)</option>
                  <option value="producer_agreement">Producer Agreement</option>
                  <option value="master_recording">Master Sound Recording Proof</option>
                  <option value="lyrics_sheet">Lyrics &amp; Lead Sheet</option>
                  <option value="supporting_document">Supporting Email / Correspondence</option>
                  <option value="other">Other Commercial Evidence</option>
                </select>
              </div>

              <div className="rounded border border-[#222834] bg-[#0c0e12] p-3 text-[11px] text-[#798394] space-y-1 font-mono">
                <div>• Cryptographic SHA-256 checksum generated on save</div>
                <div>• Bound permanently to Song Version v{currentVersion.versionNumber}.0</div>
                <div>• Storage Mode: {storageStatus?.s3Configured ? 'Amazon S3 / R2' : 'Local Server Storage'}</div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="rounded border border-[#282f3d] bg-transparent px-3 py-1.5 text-xs text-[#8c94a0] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !fileName.trim()}
                  className="rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? 'Registering...' : 'Save Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Storage Setup Guide Modal */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1d222d] pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-[#e6b359]" />
                <h3 className="text-base font-semibold text-white">Document Storage Setup Guide</h3>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="text-[#6c7686] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-[#9aa4b2] leading-relaxed">
              <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-300">
                <strong className="block text-emerald-200 mb-1 flex items-center gap-1.5">
                  <Check className="h-4 w-4" />
                  Local Storage Fallback is Active
                </strong>
                The application stores uploaded files in the server filesystem (`uploads/`) by default, so uploading and downloading works immediately even without cloud credentials.
              </div>

              <div className="space-y-1.5">
                <h4 className="text-white font-semibold flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-[#e6b359]" />
                  How to configure Amazon S3 or Cloudflare R2:
                </h4>
                <p>
                  To use cloud object storage in production, provide these environment variables on your backend API host:
                </p>
                <div className="rounded bg-[#090b0e] border border-[#1d222d] p-3 font-mono text-[11px] text-[#c5cbd4] space-y-1">
                  <div>S3_BUCKET=ospreyn-documents</div>
                  <div>S3_REGION=eu-west-1</div>
                  <div>S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE</div>
                  <div>S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY</div>
                  <div className="text-[#6c7686]"># For Cloudflare R2 / MinIO:</div>
                  <div>S3_ENDPOINT=https://&lt;account-id&gt;.r2.cloudflarestorage.com</div>
                </div>
              </div>

              <div className="space-y-1.5 rounded border border-amber-500/20 bg-amber-500/5 p-3 text-amber-200">
                <strong className="block text-amber-100 mb-0.5">Netlify Frontend vs Backend Architecture:</strong>
                <p>
                  Because you are deploying the frontend on Netlify and the backend separately, remember:
                </p>
                <ul className="list-disc pl-4 space-y-1 mt-1 text-amber-200/90">
                  <li><strong>Netlify:</strong> Only needs <code className="font-mono bg-black/40 px-1 py-0.5 rounded">VITE_API_BASE_URL</code> pointing to your API server.</li>
                  <li><strong>Backend Server:</strong> Set your S3, Resend, or Postmark API keys here. Never set S3 secret keys in Netlify frontend variables.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#1d222d]">
              <button
                onClick={() => setIsGuideOpen(false)}
                className="rounded bg-[#e6b359] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
