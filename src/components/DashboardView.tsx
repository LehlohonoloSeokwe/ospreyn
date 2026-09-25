import React, { useState } from 'react';
import {
  Music2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileText,
  Plus,
  FolderOpen,
  HardDrive,
  Users,
  Gauge,
} from 'lucide-react';
import { Song, AuditEvent, User, Organisation, PlanDefinition, DashboardSummary, BillingInterval } from '../types';

interface DashboardViewProps {
  user: User | null;
  songs: Song[];
  metrics: {
    totalSongs: number;
    completedCount: number;
    disputedCount: number;
    needsAttentionCount: number;
    awaitingConfirmationCount: number;
    recentActivity: AuditEvent[];
  };
  usage?: DashboardSummary | null;
  currentOrg?: Organisation | null;
  plan?: PlanDefinition;
  plans?: Record<string, PlanDefinition>;
  onSelectSong: (songId: string) => void;
  onOpenCreateModal: () => void;
  onCheckout: (planId: string, interval?: BillingInterval) => void;
  upgrading?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = -1;
  do {
    value /= 1024;
    i++;
  } while (value >= 1024 && i < units.length - 1);
  return `${value.toFixed(1)} ${units[i]}`;
}

function nextPlanOf(plans: Record<string, PlanDefinition> | undefined, planId?: string) {
  const order = ['free', 'starter', 'professional', 'label', 'enterprise'];
  const idx = order.indexOf(planId || 'free');
  if (idx === -1 || idx === order.length - 1) return null;
  return plans?.[order[idx + 1]] || null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  songs,
  metrics,
  usage,
  currentOrg,
  plan,
  plans,
  onSelectSong,
  onOpenCreateModal,
  onCheckout,
  upgrading,
}) => {
  const atLimit = Boolean(plan?.maxSongs != null && metrics.totalSongs >= plan.maxSongs);
  const upgrade = nextPlanOf(plans, currentOrg?.plan);

  const getStatusBadge = (status: Song['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Complete
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-teal-950/70 border border-teal-500/30 px-2 py-0.5 text-[11px] font-medium text-teal-400">
            <ShieldCheck className="h-3 w-3" />
            Confirmed
          </span>
        );
      case 'proposed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            <Clock className="h-3 w-3" />
            Awaiting Confirmation
          </span>
        );
      case 'change_requested':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-950/70 border border-rose-500/30 px-2 py-0.5 text-[11px] font-medium text-rose-400">
            <AlertTriangle className="h-3 w-3" />
            Dispute — Change Requested
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-[#1e232d] border border-[#2d3545] px-2 py-0.5 text-[11px] font-medium text-[#9ba4b4]">
            Draft
          </span>
        );
    }
  };

  if (songs.length === 0) {
    return <ZeroState user={user} onOpenCreateModal={onOpenCreateModal} />;
  }

  return (
    <div className="space-y-8">
      {/* Top Greeting & North Star Metric Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1f242e] pb-6">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-xs text-[#8c94a0] mt-1 font-mono">
            Catalogue Overview · Independent Rights Infrastructure
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={onOpenCreateModal}
            disabled={atLimit}
            title={atLimit ? `You've reached the ${plan?.maxSongs} Rights Record limit on the ${plan?.name} plan.` : undefined}
            className="inline-flex items-center justify-center gap-2 rounded bg-[#ffffff] hover:bg-[#e2e2e2] disabled:opacity-40 disabled:cursor-not-allowed text-[#0c0e12] px-4 py-2 text-xs font-semibold tracking-tight transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Rights Record</span>
          </button>
          {plan && plan.maxSongs != null && (
            <span className="text-[10px] font-mono text-[#798394]">
              {metrics.totalSongs} / {plan.maxSongs} Rights Records · {plan.name} plan
            </span>
          )}
        </div>
      </div>

      {atLimit && (
        <div className="rounded border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-[#c5cbd4] flex items-center justify-between gap-3 flex-wrap">
          <span>
            You've used all {plan?.maxSongs} Rights Records on the {plan?.name} plan.
            {upgrade ? ` Upgrade to ${upgrade.name} for ${upgrade.maxSongs === null ? 'unlimited' : `up to ${upgrade.maxSongs}`} Rights Records.` : ''}
          </span>
          {upgrade && (
            <button
              type="button"
              onClick={() => onCheckout(upgrade.id, 'monthly')}
              disabled={upgrading}
              className="shrink-0 rounded bg-white text-[#0c0e12] px-3 py-1.5 font-semibold hover:bg-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {upgrading ? 'Redirecting to Paystack…' : `Upgrade to ${upgrade.name} — R${upgrade.priceMonthlyZar}/mo`}
            </button>
          )}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded border border-[#202530] bg-[#101318] p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#798394]">Total Records</div>
          <div className="text-2xl font-bold text-white mt-1.5">{metrics.totalSongs}</div>
          <div className="text-[11px] text-[#5e6675] mt-1">In active catalogue</div>
        </div>

        <div className="rounded border border-[#1b3327] bg-[#0c1812] p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400/90">Completed Records</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1.5">{metrics.completedCount}</div>
          <div className="text-[11px] text-emerald-500/70 mt-1">Confirmed & agreement generated</div>
        </div>

        <div className="rounded border border-[#3b2a14] bg-[#19130a] p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400/90">Awaiting Confirmation</div>
          <div className="text-2xl font-bold text-amber-400 mt-1.5">{metrics.awaitingConfirmationCount}</div>
          <div className="text-[11px] text-amber-500/70 mt-1">Invited collaborators reviewing</div>
        </div>

        <div className="rounded border border-[#3b1a1a] bg-[#190c0c] p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-rose-400/90">Ownership Disputes</div>
          <div className="text-2xl font-bold text-rose-400 mt-1.5">{metrics.disputedCount}</div>
          <div className="text-[11px] text-rose-500/70 mt-1">Change requested by a contributor</div>
        </div>
      </div>

      {/* Evidence, storage, team usage */}
      {usage && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <UsageCard
            icon={FileText}
            label="Evidence strength (avg.)"
            value={`${usage.averageEvidenceScore}/100`}
            hint={
              usage.missingDocumentationCount > 0
                ? `${usage.missingDocumentationCount} record${usage.missingDocumentationCount === 1 ? '' : 's'} with no documents at all`
                : 'Every record has at least one document'
            }
            warn={usage.missingDocumentationCount > 0}
          />
          <UsageCard
            icon={HardDrive}
            label="Storage used"
            value={formatBytes(usage.storageUsedBytes)}
            hint={usage.storageLimitBytes ? `of ${formatBytes(usage.storageLimitBytes)} on ${plan?.name}` : 'Unlimited on this plan'}
          />
          <UsageCard
            icon={Users}
            label="Team seats"
            value={usage.teamMemberLimit ? `${usage.teamMemberCount} / ${usage.teamMemberLimit}` : `${usage.teamMemberCount}`}
            hint={usage.teamMemberLimit ? `${plan?.name} plan` : 'Unlimited seats'}
          />
        </div>
      )}

      {/* Main Content: Catalogue Table & Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Songs */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Recent Rights Records</h2>
            <span className="text-xs text-[#5e6675]">Showing {songs.length} records</span>
          </div>

          <div className="rounded border border-[#1f242e] bg-[#0e1116] overflow-hidden">
            <div className="divide-y divide-[#1b2029]">
              {songs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => onSelectSong(song.id)}
                  className="p-4 flex items-center justify-between hover:bg-[#141820] transition-colors cursor-pointer group"
                >
                  <div className="space-y-1 pr-4 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-[#ffffff] transition-colors truncate">
                        {song.title}
                      </span>
                      <span className="text-[10px] font-mono text-[#798394] bg-[#161a22] px-1.5 py-0.5 rounded border border-[#232936] shrink-0">
                        v{song.currentVersionNumber}.0
                      </span>
                    </div>
                    <div className="text-xs text-[#8c94a0] flex items-center gap-3">
                      <span className="truncate">{song.primaryArtist}</span>
                      {song.isrc && <span className="font-mono text-[11px] text-[#6b7585] shrink-0">{song.isrc}</span>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    {getStatusBadge(song.status)}
                    <ArrowRight className="h-4 w-4 text-[#4a5260] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Audit History Feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Recent Activity Log</h2>
            <span className="text-xs text-[#5e6675]">Append-only</span>
          </div>

          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-4 space-y-3.5 max-h-[460px] overflow-y-auto">
            {metrics.recentActivity.length === 0 ? (
              <div className="text-xs text-[#5e6675] py-4 text-center">No activity recorded yet.</div>
            ) : (
              metrics.recentActivity.map((event) => (
                <div key={event.id} className="text-xs space-y-1 border-b border-[#181c24] pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-white">{event.actorName}</span>
                    <span className="font-mono text-[#5e6675]">
                      {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-[#8c94a0] flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-[#ffffff] uppercase bg-[#201d14] px-1 py-0.2 rounded">
                      {event.eventType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="text-[11px] text-[#6b7585] font-mono truncate">
                      {JSON.stringify(event.metadata)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const UsageCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}> = ({ icon: Icon, label, value, hint, warn }) => (
  <div className="rounded border border-[#1f242e] bg-[#0e1116] p-4 flex items-start gap-3">
    <div className={`rounded p-2 ${warn ? 'bg-amber-500/10 text-amber-400' : 'bg-[#161a22] text-[#8c94a0]'}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div>
      <div className="text-[11px] text-[#798394]">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className={`text-[11px] mt-0.5 ${warn ? 'text-amber-400/80' : 'text-[#5e6675]'}`}>{hint}</div>
    </div>
  </div>
);

/**
 * Shown the moment a brand-new workspace has zero songs — the very first
 * screen a new user sees after signup. Explains what a Rights Record is and
 * why the workflow (splits → confirmations → documentation) exists, instead
 * of dropping them onto a blank dashboard.
 */
const ZeroState: React.FC<{ user: User | null; onOpenCreateModal: () => void }> = ({
  user,
  onOpenCreateModal,
}) => {
  const [step, setStep] = useState(0);
  const steps = [
    {
      icon: Music2,
      title: 'A Rights Record is your song\u2019s single source of truth',
      body: 'One place per song for who owns what — composition and master shares, every contributor, and a version history that never gets overwritten.',
    },
    {
      icon: Gauge,
      title: 'Ownership percentages have to total exactly 100%',
      body: 'Composition (the song itself) and master (the recording) are tracked separately, and each has to add up to 100% before you can move a record forward.',
    },
    {
      icon: Users,
      title: 'Contributors confirm their own share',
      body: 'Each collaborator gets a private link to review and confirm — or dispute — their percentage. No accounts needed on their end, and every response is timestamped.',
    },
    {
      icon: FolderOpen,
      title: 'Documentation backs it all up',
      body: 'Split sheets, contracts, session notes — anything that helps prove ownership if it\u2019s ever questioned. Ospreyn scores how well each song is documented.',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-white">
          Welcome{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''} — let's document your first release
        </h1>
        <p className="mt-2 text-sm text-[#8c94a0]">
          Here's how Ospreyn protects your ownership, in four short steps.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className={`rounded border p-4 transition-colors ${
              step === i ? 'border-white/40 bg-[#12151c]' : 'border-[#1f242e] bg-[#0e1116]'
            }`}
            onMouseEnter={() => setStep(i)}
          >
            <s.icon className="h-4 w-4 text-white" />
            <div className="mt-2 text-sm font-semibold text-white">{s.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-[#8c94a0]">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          onClick={onOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded bg-white hover:bg-[#e2e2e2] text-[#0c0e12] px-5 py-2.5 text-sm font-semibold tracking-tight transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create your first Rights Record
        </button>
      </div>
    </div>
  );
};
