import React from 'react';
import {
  Music2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileText,
  Plus,
} from 'lucide-react';
import { Song, AuditEvent, User } from '../types';

interface DashboardViewProps {
  user: User | null;
  songs: Song[];
  metrics: {
    totalSongs: number;
    completedCount: number;
    needsAttentionCount: number;
    awaitingConfirmationCount: number;
    recentActivity: AuditEvent[];
  };
  onSelectSong: (songId: string) => void;
  onOpenCreateModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  songs,
  metrics,
  onSelectSong,
  onOpenCreateModal,
}) => {
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
            Change Requested
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

  return (
    <div className="space-y-8">
      {/* Top Greeting & North Star Metric Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1f242e] pb-6">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Good afternoon, {user?.fullName ? user.fullName.split(' ')[0] : 'Hloni'}
          </h1>
          <p className="text-xs text-[#8c94a0] mt-1 font-mono">
            Catalogue Overview · Independent Rights Infrastructure
          </p>
        </div>
        <button
          onClick={onOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded bg-[#ffffff] hover:bg-[#e2e2e2] text-[#0c0e12] px-4 py-2 text-xs font-semibold tracking-tight transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Rights Record</span>
        </button>
      </div>

      {/* Metrics Row (Strictly Aligned with Technical Handoff Section 21) */}
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

        <div className="rounded border border-[#262c38] bg-[#12161f] p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#97a2b5]">Needs Attention</div>
          <div className="text-2xl font-bold text-white mt-1.5">{metrics.needsAttentionCount}</div>
          <div className="text-[11px] text-[#798394] mt-1">Draft or change requested</div>
        </div>
      </div>

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
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-[#ffffff] transition-colors">
                        {song.title}
                      </span>
                      <span className="text-[10px] font-mono text-[#798394] bg-[#161a22] px-1.5 py-0.5 rounded border border-[#232936]">
                        v{song.currentVersionNumber}.0
                      </span>
                    </div>
                    <div className="text-xs text-[#8c94a0] flex items-center gap-3">
                      <span>{song.primaryArtist}</span>
                      {song.isrc && <span className="font-mono text-[11px] text-[#6b7585]">{song.isrc}</span>}
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
