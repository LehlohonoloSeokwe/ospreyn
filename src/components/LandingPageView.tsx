import React from 'react';
import {
  Shield,
  FileCheck,
  Users,
  Lock,
  ArrowRight,
  CheckCircle2,
  Scale,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Disc,
  FileText,
  Download,
} from 'lucide-react';

interface LandingPageViewProps {
  onEnterApp: () => void;
  onOpenDemoReview?: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onEnterApp,
  onOpenDemoReview,
}) => {
  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-xl border border-[#222938] bg-linear-to-b from-[#11151e] via-[#0d1017] to-[#090b0e] p-8 sm:p-12 lg:p-16 text-center">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#e6b359]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e6b359]/30 bg-[#e6b359]/10 px-3.5 py-1 text-xs font-medium text-[#e6b359]">
            <Shield className="h-3.5 w-3.5" />
            <span>Music Rights &amp; Split Infrastructure</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
            Document who owns what in every song. <span className="text-[#e6b359]">Get proof before disputes happen.</span>
          </h1>

          <p className="text-sm sm:text-base text-[#9ba4b4] max-w-2xl mx-auto leading-relaxed">
            Ospreyn helps independent artists, producers, and small labels document exact composition and master ownership splits, collect single-use electronic confirmations, and maintain cryptographic audit trails for lawyers, CMOs, and distributors.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-[#6e7787] font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              10,000 Basis-Point Precision
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Zero-Login Contributor Reviews
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Signed PDF &amp; Evidence Exports
            </span>
          </div>
        </div>
      </section>

      {/* The 4-Step Lifecycle */}
      <section className="space-y-6">
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-white tracking-tight">The Rights-Recording Lifecycle</h2>
          <p className="text-xs text-[#798394]">
            A single, deterministic path from studio session to enforceable evidence package.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-3">
            <div className="h-8 w-8 rounded bg-[#161a22] border border-[#273042] flex items-center justify-center text-xs font-mono font-bold text-[#e6b359]">
              01
            </div>
            <h3 className="text-sm font-semibold text-white">Define Splits in Basis Points</h3>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Track Composition and Master splits independently in exact basis points (10,000 = 100.00%). Avoid the rounding errors that break streaming royalties.
            </p>
          </div>

          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-3">
            <div className="h-8 w-8 rounded bg-[#161a22] border border-[#273042] flex items-center justify-center text-xs font-mono font-bold text-[#e6b359]">
              02
            </div>
            <h3 className="text-sm font-semibold text-white">Invite Collaborators</h3>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Send single-use, cryptographically hashed review links directly via email. Contributors review proposed shares without having to create an account.
            </p>
          </div>

          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-3">
            <div className="h-8 w-8 rounded bg-[#161a22] border border-[#273042] flex items-center justify-center text-xs font-mono font-bold text-[#e6b359]">
              03
            </div>
            <h3 className="text-sm font-semibold text-white">Collect Confirmations</h3>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Record electronic confirmations with UTC timestamps, IP logs, and user identity stamps. Change requests trigger version bumps with recorded audit notes.
            </p>
          </div>

          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-5 space-y-3">
            <div className="h-8 w-8 rounded bg-[#161a22] border border-[#273042] flex items-center justify-center text-xs font-mono font-bold text-[#e6b359]">
              04
            </div>
            <h3 className="text-sm font-semibold text-white">Preserve &amp; Export Proof</h3>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Generate structured split agreement PDFs, store producer contracts with SHA-256 checksums, and export complete audit dossiers for labels or lawyers.
            </p>
          </div>
        </div>
      </section>

      {/* Why Music Creators Use Ospreyn */}
      <section className="rounded border border-[#1e232d] bg-[#0e1116] p-6 sm:p-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#1b2029] pb-6">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#e6b359]">Built For Modern Music Teams</span>
            <h2 className="text-xl font-bold text-white mt-1">Why Independent Teams Choose Ospreyn</h2>
          </div>
          <button
            onClick={onEnterApp}
            className="self-start md:self-auto inline-flex items-center gap-1.5 rounded bg-[#161a22] border border-[#283244] hover:bg-[#1e2432] text-xs font-semibold text-white px-3.5 py-2 transition-colors cursor-pointer"
          >
            <span>Launch Catalogue</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#e6b359]" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Scale className="h-4 w-4 text-[#e6b359]" />
              <span>Composition vs Master Separation</span>
            </div>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Publishing rights (songwriting and composition) and sound recording master rights operate under completely different legal regimes. Ospreyn enforces strict separation between both.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>Immutable Document Vault</span>
            </div>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Store producer agreements, lyric lead sheets, and vocal stem proofs. Every file receives a cryptographic SHA-256 checksum permanently registered on your audit ledger.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileCheck className="h-4 w-4 text-[#e6b359]" />
              <span>Lawyer-Ready PDF Exports</span>
            </div>
            <p className="text-xs text-[#8c94a0] leading-relaxed">
              Produce beautifully styled, official PDF split sheets and complete evidence packages with dark charcoal and gold branding that you can immediately hand to sync supervisors, labels, or attorneys.
            </p>
          </div>
        </div>
      </section>

      {/* Advisory & Legal Notice */}
      <section className="rounded border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-[#9ba4b4] flex items-start gap-3">
        <Scale className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">Independent Rights Infrastructure Notice:</strong> Ospreyn provides digital documentation and workflow verification tools. It does not provide legal advice or make representations regarding the statutory enforceability of private confirmations in any specific jurisdiction. Review terms with qualified legal counsel before executing major commercial assignments.
        </div>
      </section>
    </div>
  );
};
