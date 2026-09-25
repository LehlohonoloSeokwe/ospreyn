import React, { useEffect, useState } from 'react';
import { Users, Building2, Music, ShieldCheck, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { PlanDefinition, PlanId } from '../../types';

interface AdminStats {
  totalUsers: number;
  totalOrganisations: number;
  totalSongs: number;
  organisationsByPlan: Record<string, number>;
}

interface AdminOrganisation {
  id: string;
  name: string;
  plan: PlanId;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  memberCount: number;
  songCount: number;
  createdAt: string;
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  createdAt: string;
  organisationCount: number;
}

const StatCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ElementType }> = ({
  label,
  value,
  icon: Icon,
}) => (
  <div className="rounded border border-[#1f242e] bg-[#0e1116] p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wide text-[#798394]">{label}</span>
      <Icon className="h-3.5 w-3.5 text-[#5c6574]" />
    </div>
    <div className="mt-2 text-2xl font-bold text-white">{value}</div>
  </div>
);

export const AdminPortalView: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanDefinition>>({});
  const [organisations, setOrganisations] = useState<AdminOrganisation[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrgId, setUpdatingOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<'organisations' | 'users'>('organisations');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, orgsRes, usersRes] = await Promise.all([
        api.get<{ stats: AdminStats; plans: Record<string, PlanDefinition> }>('/admin/stats'),
        api.get<AdminOrganisation[]>('/admin/organisations'),
        api.get<AdminUser[]>('/admin/users'),
      ]);
      setStats(statsRes.stats);
      setPlans(statsRes.plans);
      setOrganisations(orgsRes);
      setUsers(usersRes);
    } catch (err: any) {
      setError(err?.message || 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handlePlanChange = async (orgId: string, plan: PlanId) => {
    setUpdatingOrgId(orgId);
    try {
      await api.post(`/admin/organisations/${orgId}/plan`, { plan });
      setOrganisations((prev) => prev.map((o) => (o.id === orgId ? { ...o, plan } : o)));
      await load(); // re-derive organisationsByPlan from the server rather than hand-rolling the diff
    } catch (err: any) {
      setError(err?.message || 'Could not update plan.');
    } finally {
      setUpdatingOrgId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#8c94a0]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-white" />
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Admin portal</h1>
            <p className="text-xs text-[#798394]">Platform-wide organisations, plans and users.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded border border-[#2c3444] bg-[#141820] px-3 py-1.5 text-xs text-[#c5cbd4] hover:text-white hover:border-[#3d495c] transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
          <StatCard label="Users" value={stats.totalUsers} icon={Users} />
          <StatCard label="Workspaces" value={stats.totalOrganisations} icon={Building2} />
          <StatCard label="Rights Records" value={stats.totalSongs} icon={Music} />
          {Object.entries(plans).map(([planId, plan]) => (
            <StatCard
              key={planId}
              label={plan.name}
              value={stats.organisationsByPlan[planId] ?? 0}
              icon={Building2}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-[#1f242e]">
        {(['organisations', 'users'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === t
                ? 'border-white text-white'
                : 'border-transparent text-[#798394] hover:text-[#c5cbd4]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'organisations' && (
        <div className="rounded border border-[#1f242e] bg-[#0e1116] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f242e] text-left text-[#798394]">
                <th className="px-4 py-2.5 font-medium">Workspace</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Members</th>
                <th className="px-4 py-2.5 font-medium">Rights Records</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
              </tr>
            </thead>
            <tbody>
              {organisations.map((org) => (
                <tr key={org.id} className="border-b border-[#171b23] last:border-0">
                  <td className="px-4 py-2.5 text-white font-medium">{org.name}</td>
                  <td className="px-4 py-2.5 text-[#c5cbd4]">
                    {org.ownerName}
                    <div className="text-[10px] text-[#5c6574] font-mono">{org.ownerEmail}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[#c5cbd4]">{org.memberCount}</td>
                  <td className="px-4 py-2.5 text-[#c5cbd4]">{org.songCount}</td>
                  <td className="px-4 py-2.5 text-[#798394] font-mono">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={org.plan}
                      disabled={updatingOrgId === org.id}
                      onChange={(e) => handlePlanChange(org.id, e.target.value as PlanId)}
                      className="rounded border border-[#2c3444] bg-[#141820] px-2 py-1 text-xs text-white disabled:opacity-50 cursor-pointer"
                    >
                      {Object.entries(plans).map(([planId, plan]) => (
                        <option key={planId} value={planId}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {organisations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5c6574]">
                    No workspaces yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'users' && (
        <div className="rounded border border-[#1f242e] bg-[#0e1116] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f242e] text-left text-[#798394]">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Workspaces</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
                <th className="px-4 py-2.5 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[#171b23] last:border-0">
                  <td className="px-4 py-2.5 text-white font-medium">{u.fullName}</td>
                  <td className="px-4 py-2.5 text-[#c5cbd4] font-mono">{u.email}</td>
                  <td className="px-4 py-2.5 text-[#c5cbd4]">{u.organisationCount}</td>
                  <td className="px-4 py-2.5 text-[#798394] font-mono">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.isPlatformAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-[10px] text-white">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#5c6574]">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-[#5c6574]">
        Plan changes here take effect immediately and bypass Paystack — use this for manual
        arrangements (EFT, comped accounts, Enterprise deals) or to correct a workspace's plan.
        Most upgrades happen through the self-serve checkout on the workspace's own dashboard.
      </p>
    </div>
  );
};
