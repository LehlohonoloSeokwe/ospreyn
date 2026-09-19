import React from 'react';
import { History, Shield, CheckCircle2, AlertCircle, FileText, UserCheck, Key } from 'lucide-react';
import { AuditEvent } from '../types';

interface AuditTrailTabProps {
  auditEvents: AuditEvent[];
}

export const AuditTrailTab: React.FC<AuditTrailTabProps> = ({ auditEvents }) => {
  const getEventIcon = (eventType: string) => {
    if (eventType.includes('CONFIRMED')) return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    if (eventType.includes('CHANGE_REQUESTED')) return <AlertCircle className="h-4 w-4 text-rose-400" />;
    if (eventType.includes('INVITED')) return <Key className="h-4 w-4 text-amber-400" />;
    if (eventType.includes('AGREEMENT')) return <FileText className="h-4 w-4 text-[#e6b359]" />;
    return <Shield className="h-4 w-4 text-[#798394]" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#11141b] border border-[#1e232d] p-4 rounded flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <History className="h-4 w-4 text-[#e6b359]" />
            Append-Only Audit Ledger
          </h3>
          <p className="text-xs text-[#798394] mt-0.5">
            Immutable log of all ownership allocations, invitations, electronic confirmations, and agreement versions.
          </p>
        </div>
        <span className="font-mono text-xs bg-[#191e29] border border-[#262f40] px-2.5 py-1 rounded text-[#9ba4b4]">
          {auditEvents.length} Events Sealed
        </span>
      </div>

      {/* Audit Timeline */}
      <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5">
        {auditEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#5e6675]">No audit events recorded yet.</div>
        ) : (
          <div className="relative border-l border-[#1f2530] ml-3 pl-6 space-y-6">
            {auditEvents.map((event) => (
              <div key={event.id} className="relative group">
                {/* Dot marker */}
                <div className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#141820] border border-[#2c3444]">
                  {getEventIcon(event.eventType)}
                </div>

                <div className="space-y-1.5 bg-[#12151c] border border-[#1d222c] p-3.5 rounded group-hover:border-[#2d3648] transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#e6b359]">
                        {event.eventType.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] font-mono text-[#798394] bg-[#1a1f29] px-1.5 py-0.5 rounded border border-[#232936]">
                        {event.entityType}:{event.entityId.slice(0, 8)}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#6b7585]">
                      {new Date(event.createdAt).toUTCString()}
                    </span>
                  </div>

                  <div className="text-xs text-[#c5cbd4] flex items-center gap-2">
                    <span className="font-medium text-white">{event.actorName}</span>
                    <span className="text-[10px] uppercase font-mono bg-[#161a22] px-1.5 py-0.2 rounded text-[#798394]">
                      {event.actorType}
                    </span>
                  </div>

                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="mt-2 rounded bg-[#090b0e] border border-[#1b2029] p-2.5 font-mono text-[11px] text-[#8c94a0] whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(event.metadata, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
