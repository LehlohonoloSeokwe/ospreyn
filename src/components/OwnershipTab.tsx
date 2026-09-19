import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  History,
  Info,
  Shield,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  Song,
  RightsRecordVersion,
  OwnershipAllocation,
  RightsValidationSummary,
  Contributor,
  SongContributor,
} from '../types';

interface OwnershipTabProps {
  song: Song;
  currentVersion: RightsRecordVersion;
  versions: RightsRecordVersion[];
  allocations: OwnershipAllocation[];
  songContributors: SongContributor[];
  validation: RightsValidationSummary | null;
  onSaveOwnership: (allocations: Array<{ contributorId: string; rightType: 'COMPOSITION' | 'MASTER'; basisPoints: number }>) => Promise<void>;
  onBumpVersion: (changeReason: string) => Promise<void>;
  onNavigateToContributors: () => void;
}

export const OwnershipTab: React.FC<OwnershipTabProps> = ({
  song,
  currentVersion,
  versions,
  allocations,
  songContributors,
  validation,
  onSaveOwnership,
  onBumpVersion,
  onNavigateToContributors,
}) => {
  // Local state for allocations map: key `${contributorId}_${rightType}` => basisPoints (integer)
  const [localBps, setLocalBps] = useState<Record<string, number>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bump version modal state
  const [isBumpModalOpen, setIsBumpModalOpen] = useState(false);
  const [bumpReason, setBumpReason] = useState('');
  const [bumping, setBumping] = useState(false);

  // Sync incoming allocations
  useEffect(() => {
    const map: Record<string, number> = {};
    for (const a of allocations) {
      map[`${a.contributorId}_${a.rightType}`] = a.basisPoints;
    }
    setLocalBps(map);
    setIsDirty(false);
  }, [allocations, currentVersion.id]);

  // Unique contributors from songContributors
  const uniqueContributors = Array.from(
    new Map(songContributors.map((sc) => [sc.contributorId, sc.contributor])).values()
  ).filter(Boolean) as Contributor[];

  // Calculate live basis points & percentages
  const compTotalBps = uniqueContributors.reduce((sum, c) => {
    return sum + (localBps[`${c.id}_COMPOSITION`] || 0);
  }, 0);

  const masterTotalBps = uniqueContributors.reduce((sum, c) => {
    return sum + (localBps[`${c.id}_MASTER`] || 0);
  }, 0);

  const isConfirmedOrCompleted =
    currentVersion.status === 'confirmed' || song.status === 'completed';

  const handleBpsChange = (
    contributorId: string,
    rightType: 'COMPOSITION' | 'MASTER',
    rawInput: string
  ) => {
    if (isConfirmedOrCompleted) return;

    // Convert input: user can type percentage (e.g. 25 or 33.34) or direct basis points
    // Let's interpret user percentage input (e.g. 50% = 5000 bps, 33.34% = 3334 bps)
    const cleaned = rawInput.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    let bps = 0;
    if (!isNaN(num)) {
      bps = Math.round(num * 100); // 50 -> 5000, 33.34 -> 3334
    }
    if (bps > 10000) bps = 10000;
    if (bps < 0) bps = 0;

    setLocalBps((prev) => ({
      ...prev,
      [`${contributorId}_${rightType}`]: bps,
    }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const items: Array<{ contributorId: string; rightType: 'COMPOSITION' | 'MASTER'; basisPoints: number }> = [];

      for (const c of uniqueContributors) {
        items.push({
          contributorId: c.id,
          rightType: 'COMPOSITION',
          basisPoints: localBps[`${c.id}_COMPOSITION`] || 0,
        });
        items.push({
          contributorId: c.id,
          rightType: 'MASTER',
          basisPoints: localBps[`${c.id}_MASTER`] || 0,
        });
      }

      await onSaveOwnership(items);
      setIsDirty(false);
    } catch (err: any) {
      if (err.requiresVersionBump) {
        setIsBumpModalOpen(true);
      } else {
        setSaveError(err.message || 'Failed to save ownership.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerBump = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bumpReason.trim() || bumpReason.trim().length < 5) return;
    setBumping(true);
    try {
      await onBumpVersion(bumpReason.trim());
      setIsBumpModalOpen(false);
      setBumpReason('');
    } catch (err: any) {
      setSaveError(err.message || 'Failed to create new rights record version.');
    } finally {
      setBumping(false);
    }
  };

  // Helper for 33.34 / 33.33 split precision explanation
  const renderValidationBanner = (
    label: string,
    totalBps: number
  ) => {
    const pct = (totalBps / 100).toFixed(2);
    if (totalBps === 10000) {
      return (
        <div className="flex items-center justify-between rounded border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              <strong>{label} Allocated:</strong> 100.00% (10,000 basis points) — Allocation complete.
            </span>
          </div>
          <span className="font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded">
            Valid
          </span>
        </div>
      );
    } else if (totalBps < 10000) {
      const remainingBps = 10000 - totalBps;
      const remPct = (remainingBps / 100).toFixed(2);
      return (
        <div className="flex items-center justify-between rounded border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>{label} Incomplete:</strong> {pct}% allocated. ({remPct}% / {remainingBps} bps remaining)
            </span>
          </div>
          <span className="font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded">
            Incomplete
          </span>
        </div>
      );
    } else {
      const overBps = totalBps - 10000;
      const overPct = (overBps / 100).toFixed(2);
      return (
        <div className="flex items-center justify-between rounded border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>
              <strong>{label} Overallocated:</strong> {pct}% allocated ({overPct}% / {overBps} bps excess). Total must equal exactly 100.00%.
            </span>
          </div>
          <span className="font-mono text-[11px] bg-rose-500/10 px-2 py-0.5 rounded">
            Invalid
          </span>
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Immutability / Version Lock Warning */}
      {isConfirmedOrCompleted ? (
        <div className="rounded border border-teal-500/30 bg-teal-950/20 p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-teal-300">
                Rights Record Version {currentVersion.versionNumber}.0 is Confirmed & Locked
              </div>
              <p className="text-xs text-[#a0a8b5] mt-0.5">
                In accordance with Ospreyn data integrity rules, confirmed rights information cannot be overwritten in place. To change ownership, create a new version with a documented reason.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsBumpModalOpen(true)}
            className="shrink-0 flex items-center gap-1.5 rounded border border-teal-400/40 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
          >
            <History className="h-3.5 w-3.5" />
            <span>Propose New Version</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#11141b] border border-[#1e232d] p-3.5 rounded">
          <div className="flex items-center gap-2 text-xs text-[#9aa3b2]">
            <Info className="h-4 w-4 text-[#e6b359] shrink-0" />
            <span>
              Editing Version <strong>v{currentVersion.versionNumber}.0</strong> ({currentVersion.status.toUpperCase()}). Deterministic Basis Points (10,000 = 100.00%).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold tracking-tight transition-colors disabled:opacity-40 cursor-pointer"
            >
              {saving ? 'Saving...' : isDirty ? 'Save Allocations' : 'Allocations Saved'}
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {uniqueContributors.length === 0 ? (
        <div className="rounded border border-[#1f242e] bg-[#0e1116] p-8 text-center space-y-3">
          <p className="text-xs text-[#8c94a0]">
            No contributors have been added to this song yet. Add contributors before assigning composition and master shares.
          </p>
          <button
            onClick={onNavigateToContributors}
            className="inline-flex items-center gap-1.5 rounded bg-[#e6b359] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Contributors First</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panel 1: COMPOSITION OWNERSHIP */}
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1b202a] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">Composition Ownership</h3>
                <p className="text-[11px] text-[#798394] mt-0.5">Songwriting, lyrics, and musical work copyright</p>
              </div>
              <span className="font-mono text-xs font-semibold text-white">
                {(compTotalBps / 100).toFixed(2)}%
              </span>
            </div>

            {renderValidationBanner('Composition', compTotalBps)}

            <div className="divide-y divide-[#181c24]">
              {uniqueContributors.map((c) => {
                const bps = localBps[`${c.id}_COMPOSITION`] || 0;
                const pct = (bps / 100).toFixed(2);
                return (
                  <div key={`comp_${c.id}`} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-medium text-white">{c.fullName}</div>
                      <div className="text-[11px] text-[#798394] font-mono">
                        {c.professionalName ? `"${c.professionalName}" · ` : ''}
                        {c.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          disabled={isConfirmedOrCompleted}
                          value={bps === 0 ? '' : pct}
                          placeholder="0.00"
                          onChange={(e) => handleBpsChange(c.id, 'COMPOSITION', e.target.value)}
                          className="w-24 text-right rounded border border-[#262c38] bg-[#141820] px-2.5 py-1 text-xs text-white font-mono focus:border-[#e6b359] focus:outline-hidden disabled:bg-[#0c0e12] disabled:text-[#798394]"
                        />
                        <span className="absolute right-7 top-1.5 text-xs text-[#5e6675] pointer-events-none">%</span>
                      </div>
                      <div className="w-16 text-right font-mono text-[11px] text-[#5e6675]">
                        {bps} bps
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel 2: MASTER OWNERSHIP */}
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1b202a] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">Master Recording Ownership</h3>
                <p className="text-[11px] text-[#798394] mt-0.5">Sound recording copyright and production ownership</p>
              </div>
              <span className="font-mono text-xs font-semibold text-white">
                {(masterTotalBps / 100).toFixed(2)}%
              </span>
            </div>

            {renderValidationBanner('Master', masterTotalBps)}

            <div className="divide-y divide-[#181c24]">
              {uniqueContributors.map((c) => {
                const bps = localBps[`${c.id}_MASTER`] || 0;
                const pct = (bps / 100).toFixed(2);
                return (
                  <div key={`mast_${c.id}`} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-medium text-white">{c.fullName}</div>
                      <div className="text-[11px] text-[#798394] font-mono">
                        {c.professionalName ? `"${c.professionalName}" · ` : ''}
                        {c.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          disabled={isConfirmedOrCompleted}
                          value={bps === 0 ? '' : pct}
                          placeholder="0.00"
                          onChange={(e) => handleBpsChange(c.id, 'MASTER', e.target.value)}
                          className="w-24 text-right rounded border border-[#262c38] bg-[#141820] px-2.5 py-1 text-xs text-white font-mono focus:border-[#e6b359] focus:outline-hidden disabled:bg-[#0c0e12] disabled:text-[#798394]"
                        />
                        <span className="absolute right-7 top-1.5 text-xs text-[#5e6675] pointer-events-none">%</span>
                      </div>
                      <div className="w-16 text-right font-mono text-[11px] text-[#5e6675]">
                        {bps} bps
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Version History Table */}
      <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Rights Record Version History</h3>
        <div className="divide-y divide-[#181c24]">
          {versions.map((v) => (
            <div key={v.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-white">v{v.versionNumber}.0</span>
                <span className="font-mono text-[10px] uppercase bg-[#181c24] px-1.5 py-0.5 rounded text-[#9aa3b2] border border-[#252c38]">
                  {v.status}
                </span>
                {v.changeReason && <span className="text-[#8c94a0] italic">"{v.changeReason}"</span>}
              </div>
              <div className="font-mono text-[11px] text-[#5e6675]">
                {new Date(v.createdAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bump Version Modal */}
      {isBumpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-semibold text-white">Bump Rights Record Version</h3>
              <p className="text-xs text-[#8c94a0] mt-1">
                You are creating Version {currentVersion.versionNumber + 1}.0. The current confirmed record will remain preserved in historical evidence.
              </p>
            </div>

            <form onSubmit={handleTriggerBump} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                  Reason for Revision <span className="text-amber-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={bumpReason}
                  placeholder="e.g. Added featured guitarist Kabelo Sithole; rebalanced composition shares from 50/50 to 40/35/25..."
                  onChange={(e) => setBumpReason(e.target.value)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#e6b359] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBumpModalOpen(false)}
                  className="rounded border border-[#282f3d] bg-transparent px-3.5 py-1.5 text-xs text-[#8c94a0] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bumping || bumpReason.trim().length < 5}
                  className="rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {bumping ? 'Creating Version...' : `Create Version ${currentVersion.versionNumber + 1}.0`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
