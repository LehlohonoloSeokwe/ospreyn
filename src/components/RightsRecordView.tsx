import React, { useState } from 'react';
import {
  ArrowLeft,
  Music2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Users,
  Percent,
  FileText,
  Lock,
  History,
  Info,
  ShieldCheck,
} from 'lucide-react';
import {
  Song,
  RightsRecordVersion,
  SongContributor,
  OwnershipAllocation,
  Invitation,
  ContributorConfirmation,
  Agreement,
  DocumentRecord,
  AuditEvent,
  RightsValidationSummary,
} from '../types';
import { OwnershipTab } from './OwnershipTab';
import { ContributorsTab } from './ContributorsTab';
import { AgreementsTab } from './AgreementsTab';
import { DocumentVaultTab } from './DocumentVaultTab';
import { AuditTrailTab } from './AuditTrailTab';

interface RightsRecordViewProps {
  song: Song;
  versions: RightsRecordVersion[];
  currentVersion: RightsRecordVersion;
  songContributors: SongContributor[];
  allocations: OwnershipAllocation[];
  validation: RightsValidationSummary | null;
  confirmations: ContributorConfirmation[];
  invitations: Invitation[];
  agreements: Agreement[];
  documents: DocumentRecord[];
  audit: AuditEvent[];
  onBack: () => void;
  onUpdateSongMetadata: (data: Partial<Song>) => Promise<void>;
  onSaveOwnership: (allocations: Array<{ contributorId: string; rightType: 'COMPOSITION' | 'MASTER'; basisPoints: number }>) => Promise<void>;
  onBumpVersion: (changeReason: string) => Promise<void>;
  onAddContributor: (data: any) => Promise<void>;
  onRemoveContributor: (scId: string) => Promise<void>;
  onSendInvitations: (contributorIds: string[]) => Promise<any>;
  onGenerateAgreement: () => Promise<void>;
  onUploadDocument: (data: any) => Promise<void>;
  onOpenExportModal: () => void;
  onOpenReviewPortal: (rawToken: string) => void;
}

export const RightsRecordView: React.FC<RightsRecordViewProps> = ({
  song,
  versions,
  currentVersion,
  songContributors,
  allocations,
  validation,
  confirmations,
  invitations,
  agreements,
  documents,
  audit,
  onBack,
  onUpdateSongMetadata,
  onSaveOwnership,
  onBumpVersion,
  onAddContributor,
  onRemoveContributor,
  onSendInvitations,
  onGenerateAgreement,
  onUploadDocument,
  onOpenExportModal,
  onOpenReviewPortal,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'ownership' | 'contributors' | 'agreements' | 'documents' | 'audit'>('overview');

  // Metadata inline edit
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [primaryArtist, setPrimaryArtist] = useState(song.primaryArtist);
  const [isrc, setIsrc] = useState(song.isrc || '');
  const [releaseDate, setReleaseDate] = useState(song.releaseDate || '');
  const [genre, setGenre] = useState(song.genre || '');
  const [catalogueRef, setCatalogueRef] = useState(song.catalogueReference || '');
  const [notes, setNotes] = useState(song.notes || '');

  const handleSaveMetadata = async () => {
    await onUpdateSongMetadata({
      title,
      primaryArtist,
      isrc: isrc.trim() || undefined,
      releaseDate: releaseDate || undefined,
      genre: genre.trim() || undefined,
      catalogueReference: catalogueRef.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setIsEditingMetadata(false);
  };

  const getStatusBadge = () => {
    switch (song.status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-teal-950/70 border border-teal-500/40 px-2.5 py-1 text-xs font-semibold text-teal-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Confirmed
          </span>
        );
      case 'proposed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            Awaiting Confirmation
          </span>
        );
      case 'change_requested':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-950/70 border border-rose-500/40 px-2.5 py-1 text-xs font-semibold text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Change Requested
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-[#1e232d] border border-[#2d3545] px-2.5 py-1 text-xs font-semibold text-[#9ba4b4]">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#8c94a0] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Catalogue</span>
        </button>

        <button
          onClick={onOpenExportModal}
          className="inline-flex items-center gap-1.5 rounded border border-[#2c3444] bg-[#141820] hover:bg-[#1a202c] text-[#c5cbd4] hover:text-white px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Evidence Package</span>
        </button>
      </div>

      {/* Main Header (Section 19 & 22 of Technical Handoff) */}
      <div className="rounded border border-[#1f242e] bg-[#0e1116] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{song.title}</h1>
              <span className="font-mono text-xs font-semibold text-[#e6b359] bg-[#221c10] border border-[#382d1a] px-2 py-0.5 rounded">
                v{song.currentVersionNumber}.0
              </span>
              {getStatusBadge()}
            </div>
            <div className="text-sm text-[#8c94a0] flex flex-wrap items-center gap-4">
              <span>{song.primaryArtist}</span>
              {song.isrc && (
                <span className="font-mono text-xs text-[#6b7585] bg-[#141820] px-2 py-0.5 rounded border border-[#222834]">
                  ISRC: {song.isrc}
                </span>
              )}
              {song.releaseDate && (
                <span className="text-xs text-[#6b7585]">
                  Release: {song.releaseDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Completion Progress Bar */}
        <div className="pt-2 border-t border-[#181c24] space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-[#8c94a0]">Rights Completion Indicator</span>
            <span className="text-white font-semibold">
              {validation?.isCompositionComplete && validation?.isMasterComplete
                ? validation?.pendingConfirmationsCount === 0
                  ? '100% — Ready for Final Agreement Execution'
                  : '75% — Ownership Complete, Awaiting Confirmations'
                : '30% — Ownership Allocation Incomplete'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#171b24] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                song.status === 'completed'
                  ? 'bg-emerald-400 w-full'
                  : song.status === 'confirmed'
                  ? 'bg-teal-400 w-4/5'
                  : song.status === 'proposed'
                  ? 'bg-amber-400 w-3/5'
                  : 'bg-[#5e6675] w-1/4'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[#1f242e] flex items-center space-x-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'border-[#e6b359] text-white font-semibold'
              : 'border-transparent text-[#8c94a0] hover:text-white'
          }`}
        >
          <Info className="h-3.5 w-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('ownership')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ownership'
              ? 'border-[#e6b359] text-white font-semibold'
              : 'border-transparent text-[#8c94a0] hover:text-white'
          }`}
        >
          <Percent className="h-3.5 w-3.5" />
          <span>Ownership (Composition &amp; Master)</span>
          {validation && (!validation.isCompositionComplete || !validation.isMasterComplete) && (
            <span className="h-2 w-2 rounded-full bg-amber-400" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('contributors')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'contributors'
              ? 'border-[#e6b359] text-white font-semibold'
              : 'border-transparent text-[#8c94a0] hover:text-white'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Contributors &amp; Invitations</span>
          <span className="font-mono text-[10px] bg-[#161a22] text-[#8c94a0] px-1.5 py-0.2 rounded">
            {songContributors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('agreements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'agreements'
              ? 'border-[#e6b359] text-white font-semibold'
              : 'border-transparent text-[#8c94a0] hover:text-white'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Agreements</span>
          {agreements.length > 0 && (
            <span className="font-mono text-[10px] bg-[#161a22] text-[#8c94a0] px-1.5 py-0.2 rounded">
              {agreements.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'documents'
              ? 'border-[#e6b359] text-white font-semibold'
              : 'border-transparent text-[#8c94a0] hover:text-white'
          }`}
        >
          <Lock className="h-3.5 w-3.5" />
          <span>Document Vault</span>
          {documents.length > 0 && (
            <span className="font-mono text-[10px] bg-[#161a22] text-[#8c94a0] px-1.5 py-0.2 rounded">
              {documents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'audit'
              ? 'border-[#e6b359] text-white font-semibold'
              : 'border-transparent text-[#8c94a0] hover:text-white'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Audit Trail</span>
          <span className="font-mono text-[10px] bg-[#161a22] text-[#8c94a0] px-1.5 py-0.2 rounded">
            {audit.length}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1b202a] pb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Song Metadata</h3>
              <button
                onClick={() => setIsEditingMetadata(!isEditingMetadata)}
                className="text-xs text-[#e6b359] hover:underline cursor-pointer"
              >
                {isEditingMetadata ? 'Cancel' : 'Edit Metadata'}
              </button>
            </div>

            {isEditingMetadata ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#798394] mb-1">Song Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#798394] mb-1">Primary Artist</label>
                  <input
                    type="text"
                    value={primaryArtist}
                    onChange={(e) => setPrimaryArtist(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#798394] mb-1">ISRC</label>
                  <input
                    type="text"
                    value={isrc}
                    placeholder="ZA-XXX-26-XXXXX"
                    onChange={(e) => setIsrc(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#798394] mb-1">Catalogue Reference</label>
                  <input
                    type="text"
                    value={catalogueRef}
                    onChange={(e) => setCatalogueRef(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#798394] mb-1">Release Date</label>
                  <input
                    type="date"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#798394] mb-1">Genre</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[#798394] mb-1">Internal Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    onClick={handleSaveMetadata}
                    className="rounded bg-[#e6b359] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[#5e6675] block font-mono text-[10px] uppercase">ISRC</span>
                  <span className="text-white font-mono mt-0.5 block">{song.isrc || '—'}</span>
                </div>
                <div>
                  <span className="text-[#5e6675] block font-mono text-[10px] uppercase">Catalogue Ref</span>
                  <span className="text-white font-mono mt-0.5 block">{song.catalogueReference || '—'}</span>
                </div>
                <div>
                  <span className="text-[#5e6675] block font-mono text-[10px] uppercase">Release Date</span>
                  <span className="text-white mt-0.5 block">{song.releaseDate || '—'}</span>
                </div>
                <div>
                  <span className="text-[#5e6675] block font-mono text-[10px] uppercase">Genre</span>
                  <span className="text-white mt-0.5 block">{song.genre || '—'}</span>
                </div>
                {song.notes && (
                  <div className="col-span-2 sm:col-span-4 bg-[#090b0e] border border-[#191d26] p-3 rounded text-[#8c94a0]">
                    <span className="text-[#5e6675] block font-mono text-[10px] uppercase mb-1">Notes</span>
                    {song.notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Composition Quick Summary */}
            <div className="rounded border border-[#1f242e] bg-[#0e1116] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Composition Splits</span>
                <span className="font-mono text-xs font-semibold text-[#e6b359]">
                  {validation?.compositionPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="divide-y divide-[#161a22]">
                {allocations
                  .filter((a) => a.rightType === 'COMPOSITION' && a.basisPoints > 0)
                  .map((a, idx) => (
                    <div key={a.id || `comp-alloc-${a.contributorId}-${idx}`} className="py-2 flex items-center justify-between text-xs">
                      <span className="text-[#c5cbd4]">{a.contributor?.fullName || 'Contributor'}</span>
                      <span className="font-mono text-white">{(a.basisPoints / 100).toFixed(2)}%</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Master Quick Summary */}
            <div className="rounded border border-[#1f242e] bg-[#0e1116] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Master Splits</span>
                <span className="font-mono text-xs font-semibold text-[#e6b359]">
                  {validation?.masterPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="divide-y divide-[#161a22]">
                {allocations
                  .filter((a) => a.rightType === 'MASTER' && a.basisPoints > 0)
                  .map((a, idx) => (
                    <div key={a.id || `master-alloc-${a.contributorId}-${idx}`} className="py-2 flex items-center justify-between text-xs">
                      <span className="text-[#c5cbd4]">{a.contributor?.fullName || 'Contributor'}</span>
                      <span className="font-mono text-white">{(a.basisPoints / 100).toFixed(2)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ownership' && (
        <OwnershipTab
          song={song}
          currentVersion={currentVersion}
          versions={versions}
          allocations={allocations}
          songContributors={songContributors}
          validation={validation}
          onSaveOwnership={onSaveOwnership}
          onBumpVersion={onBumpVersion}
          onNavigateToContributors={() => setActiveTab('contributors')}
        />
      )}

      {activeTab === 'contributors' && (
        <ContributorsTab
          song={song}
          currentVersion={currentVersion}
          songContributors={songContributors}
          invitations={invitations}
          confirmations={confirmations}
          validation={validation}
          onAddContributor={onAddContributor}
          onRemoveContributor={onRemoveContributor}
          onSendInvitations={onSendInvitations}
          onOpenReviewPortal={onOpenReviewPortal}
        />
      )}

      {activeTab === 'agreements' && (
        <AgreementsTab
          song={song}
          currentVersion={currentVersion}
          agreements={agreements}
          validation={validation}
          allocations={allocations}
          confirmations={confirmations}
          contributors={songContributors.map((sc) => sc.contributor!).filter(Boolean)}
          onGenerateAgreement={onGenerateAgreement}
        />
      )}

      {activeTab === 'documents' && (
        <DocumentVaultTab
          song={song}
          currentVersion={currentVersion}
          documents={documents}
          onUploadDocument={onUploadDocument}
        />
      )}

      {activeTab === 'audit' && <AuditTrailTab auditEvents={audit} />}
    </div>
  );
};
