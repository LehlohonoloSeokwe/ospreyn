import React, { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Music2,
  FileText,
  UserCheck,
  Send,
  Lock,
} from 'lucide-react';

interface ReviewPortalViewProps {
  token: string;
  onExit: () => void;
  onRefreshParent: () => void;
}

export const ReviewPortalView: React.FC<ReviewPortalViewProps> = ({
  token,
  onExit,
  onRefreshParent,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [hasAgreedCheck, setHasAgreedCheck] = useState(false);
  const [changeNotes, setChangeNotes] = useState('');
  const [isChangeMode, setIsChangeMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<any>(null);

  const fetchReviewDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/review/${token}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Invalid or expired invitation token.');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewDetails();
  }, [token]);

  const handleConfirm = async () => {
    if (!hasAgreedCheck) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invitations/review/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirmed',
          notes: 'Confirmed via Ospreyn Contributor Review Portal',
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit confirmation.');
      }
      const json = await res.json();
      setSubmittedResult(json);
      onRefreshParent();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeNotes.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invitations/review/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_requested',
          notes: changeNotes.trim(),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to request changes.');
      }
      const json = await res.json();
      setSubmittedResult(json);
      onRefreshParent();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-6 w-6 border-2 border-[#e6b359] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs text-[#8c94a0] font-mono">Loading Rights Record Review...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto my-12 rounded border border-rose-500/30 bg-[#120f12] p-6 text-center space-y-4">
        <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-semibold text-white">Review Invitation Unavailable</h3>
        <p className="text-xs text-[#8c94a0]">{error}</p>
        <button
          onClick={onExit}
          className="rounded border border-[#282f3d] bg-[#141820] text-white px-4 py-1.5 text-xs cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const { song, version, contributor, myAllocations, allAllocations, draftAgreement } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      {/* Top Header for Reviewer */}
      <div className="flex items-center justify-between border-b border-[#1f242e] pb-4">
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-xs text-[#8c94a0] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Exit Review Portal</span>
        </button>

        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#e6b359]" />
          <span className="text-xs font-mono font-semibold text-white uppercase tracking-wider">
            Ospreyn Contributor Review
          </span>
        </div>
      </div>

      {/* Confirmation Success Screen */}
      {submittedResult ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-950/20 p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-white">
            {submittedResult.action === 'confirmed' ? 'Contribution & Splits Confirmed' : 'Change Request Registered'}
          </h2>
          <p className="text-xs text-[#a0a8b5] max-w-md mx-auto">
            {submittedResult.message || 'Your response has been sealed into the immutable rights audit ledger.'}
          </p>
          <div className="rounded bg-[#0c0e12] border border-[#202735] p-3 max-w-md mx-auto text-left font-mono text-[11px] text-[#8c94a0] space-y-1">
            <div>Work: {song.title}</div>
            <div>Contributor: {contributor.fullName}</div>
            <div>Timestamp: {new Date().toUTCString()}</div>
            <div>Audit Status: Logged</div>
          </div>
          <button
            onClick={onExit}
            className="rounded bg-[#e6b359] text-[#0c0e12] px-4 py-2 text-xs font-semibold cursor-pointer"
          >
            Return to Catalogue
          </button>
        </div>
      ) : (
        <>
          {/* Greeting Card */}
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-6 space-y-3">
            <div className="text-xs font-mono uppercase text-[#e6b359] tracking-wider">
              Invitation for {contributor.fullName} {contributor.professionalName ? `("${contributor.professionalName}")` : ''}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Review Rights Record: "{song.title}"
            </h1>
            <p className="text-xs text-[#8c94a0]">
              You have been invited to review and verify the proposed composition and sound recording ownership splits for this musical work (Version {version.versionNumber}.0).
            </p>
          </div>

          {/* Your Proposed Ownership Shares */}
          <div className="rounded border border-[#252c38] bg-[#12161f] p-5 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#9aa3b2]">Your Proposed Rights Shares</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded bg-[#0c0e12] border border-[#1e232d] p-4">
                <div className="text-[11px] text-[#798394] uppercase font-mono">Composition Share</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {(myAllocations.compositionBps / 100).toFixed(2)}%
                </div>
                <div className="text-[11px] text-[#5e6675] font-mono mt-0.5">
                  {myAllocations.compositionBps} Basis Points
                </div>
              </div>

              <div className="rounded bg-[#0c0e12] border border-[#1e232d] p-4">
                <div className="text-[11px] text-[#798394] uppercase font-mono">Master Recording Share</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {(myAllocations.masterBps / 100).toFixed(2)}%
                </div>
                <div className="text-[11px] text-[#5e6675] font-mono mt-0.5">
                  {myAllocations.masterBps} Basis Points
                </div>
              </div>
            </div>
          </div>

          {/* Full Split Breakdown */}
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Complete Proposed Splits</h3>
            <div className="divide-y divide-[#181c24]">
              {allAllocations.map((a: any, idx: number) => {
                const itemKey = a.id || `${a.rightType || 'RIGHT'}-${a.contributorId || a.contributorName || 'c'}-${idx}`;
                const contributorDisplayName =
                  a.contributor?.fullName || a.contributorName || 'Contributor';
                return (
                  <div key={itemKey} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-white">{contributorDisplayName}</span>
                      <span className="text-[#6b7585] ml-2 font-mono text-[11px]">({a.rightType})</span>
                    </div>
                    <span className="font-mono text-white">{(a.basisPoints / 100).toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Draft Agreement Preview */}
          {draftAgreement && (
            <div className="rounded border border-[#1f242e] bg-[#0e1116] overflow-hidden">
              <div className="p-3.5 bg-[#12161f] border-b border-[#1b2029] flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-[#e6b359]" />
                  Split Agreement Terms
                </span>
                <span className="text-[10px] text-[#798394] font-mono">Draft v{version.versionNumber}.0</span>
              </div>
              <div className="p-4 font-mono text-xs text-[#9aa3b2] max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed bg-[#090b0e]">
                {draftAgreement.documentContent}
              </div>
            </div>
          )}

          {/* Neutral Legal Confirmation Language (PRD Section 11 & Technical Handoff Section 17) */}
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="agree"
                checked={hasAgreedCheck}
                onChange={(e) => setHasAgreedCheck(e.target.checked)}
                className="mt-1 rounded border-[#3a4454] text-[#e6b359] focus:ring-0 cursor-pointer h-4 w-4"
              />
              <label htmlFor="agree" className="text-xs text-[#c5cbd4] leading-relaxed cursor-pointer select-none">
                <strong>Confirmation of Agreed Understanding:</strong> "I confirm that the information above accurately records our agreed understanding regarding contributions and ownership for this work."
              </label>
            </div>

            <div className="text-[11px] text-[#798394] border-t border-amber-500/20 pt-3">
              <strong>Notice:</strong> This confirmation records mutual intent and agreement details. It does not constitute a formal electronic signature under statutory digital signature legislation.
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              onClick={() => setIsChangeMode(!isChangeMode)}
              className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
            >
              {isChangeMode ? 'Cancel change request' : 'Something look incorrect? Request a change'}
            </button>

            <button
              onClick={handleConfirm}
              disabled={!hasAgreedCheck || submitting}
              className="w-full sm:w-auto rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-6 py-2.5 text-xs font-semibold tracking-tight transition-colors disabled:opacity-40 cursor-pointer"
            >
              {submitting ? 'Registering Confirmation...' : 'Confirm Contribution & Splits'}
            </button>
          </div>

          {/* Change Request Form */}
          {isChangeMode && (
            <form onSubmit={handleChangeRequest} className="rounded border border-rose-500/30 bg-rose-950/20 p-4 space-y-3">
              <h4 className="text-xs font-semibold text-rose-300">Request Adjustment</h4>
              <textarea
                required
                rows={3}
                placeholder="Explain what needs to be changed (e.g., 'My composition split was agreed at 30% rather than 25%')..."
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                className="w-full rounded border border-[#2a3240] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:outline-hidden"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !changeNotes.trim()}
                  className="rounded bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Change Request'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};
