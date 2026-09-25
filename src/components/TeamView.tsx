import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, X, Users, Crown } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Organisation, OrganisationMember, PlanDefinition, TeamInvitation } from '../types';

interface TeamViewProps {
  currentOrg: Organisation | null;
  role?: string;
  plan?: PlanDefinition;
}

export const TeamView: React.FC<TeamViewProps> = ({ currentOrg, role, plan }) => {
  const [members, setMembers] = useState<OrganisationMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = role === 'owner' || role === 'admin';
  const seatLimit = plan?.maxTeamMembers ?? null;
  const seatsUsed = members.length + invitations.length;

  const load = async () => {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        api.get<OrganisationMember[]>('/team/members'),
        canManage ? api.get<TeamInvitation[]>('/team/invitations') : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvitations(i);
    } catch {
      // Leave lists empty — the page still renders.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await api.post('/team/invitations', { email: email.trim(), role: inviteRole });
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    await api.delete(`/team/invitations/${id}`).catch(() => undefined);
    await load();
  };

  const handleRoleChange = async (memberId: string, newRole: 'admin' | 'member') => {
    await api.patch(`/team/members/${memberId}`, { role: newRole }).catch(() => undefined);
    await load();
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Remove this person from the workspace?')) return;
    await api.delete(`/team/members/${memberId}`).catch(() => undefined);
    await load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-white" />
        <h1 className="text-lg font-semibold text-white">Team</h1>
      </div>
      <p className="mt-1 text-sm text-[#8c94a0]">
        Everyone with access to <span className="text-white">{currentOrg?.name || 'this workspace'}</span>.
        {seatLimit !== null && (
          <span className="text-[#5c6574]">
            {' '}
            {seatsUsed} of {seatLimit} seats used on the {plan?.name || 'current'} plan.
          </span>
        )}
      </p>

      {canManage && (
        <form onSubmit={handleInvite} className="mt-6 rounded border border-[#1f242e] bg-[#0e1116] p-5">
          <h2 className="text-sm font-semibold text-white">Invite someone</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="flex-1 rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              className="rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting || (seatLimit !== null && seatsUsed >= seatLimit)}
              className="flex items-center justify-center gap-2 rounded bg-white px-4 py-2 text-xs font-semibold text-[#0c0e12] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Invite
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#5c6574]">
            Admins can invite and remove members. Members can work in the catalogue but can't
            manage the team or billing.
          </p>
          {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
          {seatLimit !== null && seatsUsed >= seatLimit && (
            <div className="mt-2 text-xs text-amber-300">
              You're at the seat limit for the {plan?.name} plan. Upgrade for more seats.
            </div>
          )}
        </form>
      )}

      <div className="mt-6 rounded border border-[#1f242e] bg-[#0e1116]">
        <div className="border-b border-[#1f242e] px-5 py-3 text-xs font-semibold text-white">Members</div>
        {loading ? (
          <div className="p-5 text-xs text-[#8c94a0]">Loading…</div>
        ) : (
          <ul className="divide-y divide-[#1a1e26]">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm text-white">
                    {m.stageName || m.fullName}
                    {m.role === 'owner' && <Crown className="h-3 w-3 text-amber-300" />}
                  </div>
                  <div className="text-[11px] text-[#5c6574]">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as 'admin' | 'member')}
                      className="rounded border border-[#262c36] bg-[#0f1319] px-2 py-1 text-xs text-white outline-none"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="text-[11px] capitalize text-[#8c94a0]">{m.role}</span>
                  )}
                  {canManage && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="rounded p-1 text-[#5c6574] transition-colors hover:text-red-300"
                      title="Remove from workspace"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && invitations.length > 0 && (
        <div className="mt-6 rounded border border-[#1f242e] bg-[#0e1116]">
          <div className="border-b border-[#1f242e] px-5 py-3 text-xs font-semibold text-white">
            Pending invitations
          </div>
          <ul className="divide-y divide-[#1a1e26]">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm text-white">{inv.email}</div>
                  <div className="text-[11px] capitalize text-[#5c6574]">
                    {inv.role} · invited {new Date(inv.invitedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  className="text-[11px] text-[#8c94a0] underline hover:text-red-300"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
