import React, { useState } from 'react';
import {
  UserPlus,
  Send,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Shield,
  Key,
} from 'lucide-react';
import {
  Song,
  RightsRecordVersion,
  SongContributor,
  Contributor,
  Invitation,
  ContributorConfirmation,
  RightsValidationSummary,
} from '../types';

interface ContributorsTabProps {
  song: Song;
  currentVersion: RightsRecordVersion;
  songContributors: SongContributor[];
  invitations: Invitation[];
  confirmations: ContributorConfirmation[];
  validation: RightsValidationSummary | null;
  onAddContributor: (data: {
    fullName: string;
    professionalName?: string;
    email: string;
    phone?: string;
    role: string;
    customRoleTitle?: string;
  }) => Promise<void>;
  onRemoveContributor: (songContributorId: string) => Promise<void>;
  onSendInvitations: (contributorIds: string[]) => Promise<any>;
}

export const ContributorsTab: React.FC<ContributorsTabProps> = ({
  song,
  currentVersion,
  songContributors,
  invitations,
  confirmations,
  validation,
  onAddContributor,
  onRemoveContributor,
  onSendInvitations,
}) => {
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);

  // Add form fields
  const [fullName, setFullName] = useState('');
  const [professionalName, setProfessionalName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('songwriter');
  const [customRoleTitle, setCustomRoleTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite response links
  const [lastDispatchedInvites, setLastDispatchedInvites] = useState<any[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onAddContributor({
        fullName: fullName.trim(),
        professionalName: professionalName.trim() || undefined,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        customRoleTitle: customRoleTitle.trim() || undefined,
      });
      setIsAddModalOpen(false);
      setFullName('');
      setProfessionalName('');
      setEmail('');
      setPhone('');
      setCustomRoleTitle('');
    } catch (err: any) {
      setError(err.message || 'Failed to add contributor.');
    } finally {
      setLoading(false);
    }
  };

  const handleDispatchInvites = async () => {
    if (selectedInviteIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await onSendInvitations(selectedInviteIds);
      if (res && res.invitations) {
        setLastDispatchedInvites(res.invitations);
      }
      setIsInviteModalOpen(false);
      setSelectedInviteIds([]);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch invitations.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, token: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getConfirmationBadge = (contributorId: string) => {
    const conf = confirmations.find((c) => c.contributorId === contributorId && c.versionId === currentVersion.id);
    if (conf) {
      if (conf.action === 'confirmed') {
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Confirmed
          </span>
        );
      } else {
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-950/60 border border-rose-500/30 px-2 py-0.5 text-[10px] font-medium text-rose-400">
            <AlertTriangle className="h-3 w-3" />
            Change Requested
          </span>
        );
      }
    }

    // Check invitation status in invitations table
    const inv = invitations.find(
      (i) => i.contributorId === contributorId && i.versionId === currentVersion.id && i.status === 'pending'
    );
    if (inv) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          <Clock className="h-3 w-3" />
          Awaiting Confirmation
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded bg-[#1e232d] px-2 py-0.5 text-[10px] text-[#798394]">
        Uninvited
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#11141b] border border-[#1e232d] p-4 rounded">
        <div>
          <h3 className="text-sm font-semibold text-white">Contributors &amp; Invitation Lifecycle</h3>
          <p className="text-xs text-[#798394] mt-0.5">
            Role is distinct from ownership. Issue single-use review links for participants to confirm their split.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded border border-[#2a3240] bg-[#161a22] hover:bg-[#1e2430] text-[#c5cbd4] hover:text-white px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ Add Contributor</span>
          </button>
          <button
            onClick={() => {
              // Preselect contributors who haven't confirmed
              const unconfirmed = songContributors
                .map((sc) => sc.contributorId)
                .filter((cid, idx, arr) => arr.indexOf(cid) === idx);
              setSelectedInviteIds(unconfirmed);
              setIsInviteModalOpen(true);
            }}
            disabled={!validation?.canProceedToInvite}
            className="flex items-center gap-1.5 rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send Invitations</span>
          </button>
        </div>
      </div>

      {!validation?.canProceedToInvite && (
        <div className="flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/5 px-3.5 py-2 text-xs text-amber-400">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Invitations unlock when Composition and Master ownership each total exactly 100.00% (10,000 basis points).
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Dispatched Links Helper (After sending invitations) */}
      {lastDispatchedInvites.length > 0 && (
        <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
          <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Invitations Dispatched Successfully
          </div>
          <p className="text-xs text-[#a0a8b5]">
            Copy each link and send it to the contributor now. Ospreyn stores only a hash of these
            links and cannot show them again. Each one expires and can be used once.
          </p>
          <div className="space-y-2">
            {lastDispatchedInvites.map((inv, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded bg-[#0e1116] border border-[#232936] p-2.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-white">{inv.contributorName}</span>
                  <span className="text-[#798394] ml-2">({inv.email})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(inv.reviewUrl, inv.rawToken)}
                    className="flex items-center gap-1 rounded bg-[#161a22] px-2 py-1 text-[11px] text-[#c5cbd4] hover:text-white"
                  >
                    {copiedToken === inv.rawToken ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedToken === inv.rawToken ? 'Copied' : 'Copy URL'}</span>
                  </button>
                  <a
                    href={inv.reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <span>Open link</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contributors Table */}
      <div className="rounded border border-[#1f242e] bg-[#0e1116] overflow-hidden">
        <div className="p-4 border-b border-[#1b2029]">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Song Contributor Roster</h4>
        </div>

        {songContributors.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#5e6675]">
            No contributors have been added to this song yet.
          </div>
        ) : (
          <div className="divide-y divide-[#181c24]">
            {songContributors.map((sc) => {
              const c = sc.contributor;
              if (!c) return null;
              return (
                <div key={sc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-[#12161f] transition-colors">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{c.fullName}</span>
                      {c.professionalName && (
                        <span className="text-xs text-[#8c94a0] italic">"{c.professionalName}"</span>
                      )}
                      <span className="font-mono text-[10px] uppercase bg-[#1a202c] px-2 py-0.5 rounded text-[#9ba4b4] border border-[#273042]">
                        {sc.customRoleTitle || sc.role.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6b7585] font-mono">{c.email}</div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {getConfirmationBadge(c.id)}
                    <button
                      onClick={() => onRemoveContributor(sc.id)}
                      className="text-[#4a5260] hover:text-rose-400 p-1 transition-colors"
                      title="Remove contributor from song"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invitations Table (Separated Entity) */}
      <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">
            Invitation history
          </h4>
          <span className="text-[11px] text-[#5e6675] font-mono flex items-center gap-1">
            <Key className="h-3 w-3" />
            Links stored as SHA-256 hashes
          </span>
        </div>

        {invitations.length === 0 ? (
          <p className="text-xs text-[#5e6675]">No review links issued for this version yet.</p>
        ) : (
          <div className="divide-y divide-[#181c24]">
            {invitations.map((inv) => (
              <div key={inv.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{inv.contributor?.fullName || 'Contributor'}</span>
                  <span className="font-mono text-[10px] text-[#798394] bg-[#161a22] px-1.5 py-0.5 rounded">
                    Status: {inv.status}
                  </span>
                  <span className="text-[11px] text-[#5e6675]">
                    Expires: {new Date(inv.expiresAt).toLocaleDateString('en-ZA')}
                  </span>
                </div>
                <span className="text-[11px] text-[#5e6675]">
                  {inv.usedAt
                    ? `Responded ${new Date(inv.usedAt).toLocaleDateString('en-ZA')}`
                    : 'Link not retrievable — reissue to send again'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Contributor Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Add Contributor to Song</h3>
            <form onSubmit={handleAdd} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kabelo Sithole"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#e6b359] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">Professional / Stage Name</label>
                <input
                  type="text"
                  placeholder="e.g. K-Soul"
                  value={professionalName}
                  onChange={(e) => setProfessionalName(e.target.value)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#e6b359] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="kabelo@example.co.za"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#e6b359] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c5cbd4] mb-1">Primary Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white focus:border-[#e6b359] focus:outline-hidden"
                >
                  <option value="songwriter">Songwriter</option>
                  <option value="composer">Composer</option>
                  <option value="producer">Producer</option>
                  <option value="artist">Primary Artist</option>
                  <option value="featured_artist">Featured Artist</option>
                  <option value="musician">Musician / Sessionist</option>
                  <option value="engineer">Mixing / Mastering Engineer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded border border-[#282f3d] bg-transparent px-3 py-1.5 text-xs text-[#8c94a0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold"
                >
                  {loading ? 'Adding...' : 'Add Contributor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Invitations Dialog */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Generate Review Invitations</h3>
            <p className="text-xs text-[#8c94a0]">
              Select which contributors to invite for Version {currentVersion.versionNumber}.0. Each gets a single-use review link, shown once.
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto border border-[#222834] rounded p-2.5">
              {Array.from(
                new Map(songContributors.map((sc) => [sc.contributorId, sc.contributor])).values()
              )
                .filter(Boolean)
                .map((c) => {
                  const isChecked = selectedInviteIds.includes(c!.id);
                  return (
                    <label
                      key={c!.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-[#141820] cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedInviteIds((prev) => [...prev, c!.id]);
                            } else {
                              setSelectedInviteIds((prev) => prev.filter((id) => id !== c!.id));
                            }
                          }}
                          className="rounded border-[#2c3444] text-[#e6b359] focus:ring-0"
                        />
                        <div>
                          <div className="text-xs font-medium text-white">{c!.fullName}</div>
                          <div className="text-[11px] text-[#6b7585]">{c!.email}</div>
                        </div>
                      </div>
                      {getConfirmationBadge(c!.id)}
                    </label>
                  );
                })}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="rounded border border-[#282f3d] bg-transparent px-3 py-1.5 text-xs text-[#8c94a0]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || selectedInviteIds.length === 0}
                onClick={handleDispatchInvites}
                className="rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {loading ? 'Generating...' : `Dispatch ${selectedInviteIds.length} Invitation(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
