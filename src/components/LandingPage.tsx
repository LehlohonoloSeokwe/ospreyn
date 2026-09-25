import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Users, History, Lock, PenLine, Send, ShieldCheck, Check, Minus } from 'lucide-react';
import { api } from '../lib/api';
import { PlanDefinition, PlanComparisonRow, PlanId, BillingInterval } from '../types';

const PLAN_ORDER: PlanId[] = ['free', 'starter', 'professional', 'label', 'enterprise'];

// Mirrors server/plans.ts, used only if /api/plans can't be reached (e.g.
// before the backend is deployed) so the pricing section still renders.
const FALLBACK_PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthlyZar: 0,
    priceAnnualZar: 0,
    maxSongs: 5,
    maxTeamMembers: 1,
    tagline: 'Try it on a couple of releases before you commit to anything.',
    features: [
      'Up to 5 Rights Records',
      'Composition & master ownership splits',
      'Email invitations & confirmations',
      'Split-sheet PDF generation',
      'Basic document vault (100 MB)',
    ],
    cta: 'Start free',
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthlyZar: 89,
    priceAnnualZar: 890,
    maxSongs: 25,
    maxTeamMembers: 1,
    tagline: 'An affordable entry point for one independent artist getting organised.',
    features: [
      'Up to 25 Rights Records',
      'Everything in Free',
      'Full document vault (2 GB) with Evidence Strength scoring',
      'WhatsApp owner notifications',
    ],
    cta: 'Get started',
  },
  {
    id: 'professional',
    name: 'Professional',
    priceMonthlyZar: 249,
    priceAnnualZar: 2490,
    maxSongs: null,
    maxTeamMembers: 3,
    tagline: 'Full catalogue management and collaboration for an active release schedule.',
    features: [
      'Unlimited Rights Records',
      'Everything in Starter',
      'Up to 3 workspace members',
      'Document vault (25 GB)',
      'Priority support',
    ],
    cta: 'Get started',
    recommended: true,
  },
  {
    id: 'label',
    name: 'Label',
    priceMonthlyZar: 699,
    priceAnnualZar: 6990,
    maxSongs: null,
    maxTeamMembers: 10,
    tagline: 'A multi-user workspace for a small label, publisher or management team.',
    features: [
      'Unlimited Rights Records',
      'Everything in Professional',
      'Up to 10 workspace members with role-based access',
      'Document vault (100 GB)',
      'Team activity oversight across the whole catalogue',
    ],
    cta: 'Get started',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthlyZar: null,
    priceAnnualZar: null,
    maxSongs: null,
    maxTeamMembers: null,
    tagline: 'Custom limits, custom terms, unlimited scale.',
    features: [
      'Unlimited Rights Records, members and storage',
      'Everything in Label',
      'Custom contract & data-retention terms',
      'Dedicated support channel',
    ],
    cta: 'Talk to us',
  },
];

const FALLBACK_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    label: 'Rights Records',
    values: { free: 'Up to 5', starter: 'Up to 25', professional: 'Unlimited', label: 'Unlimited', enterprise: 'Unlimited' },
  },
  {
    label: 'Workspace members',
    values: { free: '1 (just you)', starter: '1 (just you)', professional: 'Up to 3', label: 'Up to 10', enterprise: 'Custom' },
  },
  {
    label: 'Document vault storage',
    values: { free: '100 MB', starter: '2 GB', professional: '25 GB', label: '100 GB', enterprise: 'Custom' },
  },
  {
    label: 'Evidence Strength scoring',
    values: { free: '—', starter: '✓', professional: '✓', label: '✓', enterprise: '✓' },
  },
  {
    label: 'WhatsApp owner notifications',
    values: { free: '—', starter: '✓', professional: '✓', label: '✓', enterprise: '✓' },
  },
  {
    label: 'Priority support',
    values: { free: '—', starter: '—', professional: '✓', label: '✓', enterprise: '✓ Dedicated' },
  },
  {
    label: 'Role-based team access',
    values: { free: '—', starter: '—', professional: '—', label: '✓', enterprise: '✓' },
  },
];

const features = [
  {
    icon: FileCheck,
    title: 'Ownership records',
    body: 'Record song splits with version history, so every change to who owns what is captured, not overwritten.',
  },
  {
    icon: Users,
    title: 'Contributor confirmations',
    body: 'Invite collaborators to review and confirm their share. No more chasing signatures over email.',
  },
  {
    icon: History,
    title: 'Full audit trail',
    body: 'Every invitation, confirmation and revision is logged with a timestamp, so the history speaks for itself.',
  },
  {
    icon: Lock,
    title: 'Evidence packages',
    body: 'Export a complete record of ownership, confirmations and documents whenever you need to show your work.',
  },
];

export const LandingPage: React.FC = () => {
  const [plans, setPlans] = useState<PlanDefinition[]>(FALLBACK_PLANS);
  const [comparisonRows, setComparisonRows] = useState<PlanComparisonRow[]>(FALLBACK_COMPARISON_ROWS);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Record<string, PlanDefinition>>('/plans')
      .then((data) => {
        if (cancelled) return;
        const ordered = PLAN_ORDER.map((id) => data[id]).filter((p): p is PlanDefinition => Boolean(p));
        if (ordered.length > 0) setPlans(ordered);
      })
      .catch(() => {
        // Keep the static fallback — the pricing section should never be
        // blank just because the API host isn't reachable yet.
      });
    api
      .get<PlanComparisonRow[]>('/plans/comparison')
      .then((rows) => {
        if (!cancelled && rows?.length > 0) setComparisonRows(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#090a0d] text-[#c5cbd4] antialiased">
      {/* Nav */}
      <header className="border-b border-[#1a1e26] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <img src="/assets/logo-white.png" alt="Ospreyn" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold uppercase tracking-wide text-white">Ospreyn</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#pricing" className="hidden sm:block text-xs text-[#8c94a0] hover:text-white transition-colors">
              Pricing
            </a>
            <Link
              to="/login"
              className="rounded border border-[#2c3444] bg-[#141820] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#3d495c]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6 flex justify-center">
            <img src="/assets/logo-white.png" alt="" className="h-16 w-16 object-contain opacity-90" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Music rights infrastructure for independent teams
          </h1>
          <p className="mt-4 text-sm text-[#8c94a0] sm:text-base">
            Record splits, collect contributor confirmations, and keep a clean audit trail,
            from the first draft of a song to the finished agreement.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to="/login"
              className="rounded bg-white px-5 py-2.5 text-sm font-semibold text-[#0c0e12] transition-colors hover:bg-[#e2e2e2]"
            >
              Create your workspace
            </Link>
            <Link
              to="/login"
              className="rounded border border-[#2c3444] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-[#3d495c]"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded border border-[#1f242e] bg-[#1f242e] sm:grid-cols-3">
          <div className="bg-[#0e1116] px-6 py-5 text-center">
            <div className="text-xl font-semibold text-white">Minutes</div>
            <div className="mt-1 text-[11px] text-[#8c94a0]">to record a split and send it out</div>
          </div>
          <div className="bg-[#0e1116] px-6 py-5 text-center">
            <div className="text-xl font-semibold text-white">Zero</div>
            <div className="mt-1 text-[11px] text-[#8c94a0]">email threads chasing signatures</div>
          </div>
          <div className="bg-[#0e1116] px-6 py-5 text-center">
            <div className="text-xl font-semibold text-white">100%</div>
            <div className="mt-1 text-[11px] text-[#8c94a0]">of activity timestamped and logged</div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-white">
            How it works
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              {
                icon: PenLine,
                step: '01',
                title: 'Define the splits',
                body: 'Add a song, list every contributor, and set composition and master shares until they total exactly 100%.',
              },
              {
                icon: Send,
                step: '02',
                title: 'Send for confirmation',
                body: 'Each collaborator gets a private link to review and confirm their share, or ask for a change; no account required.',
              },
              {
                icon: ShieldCheck,
                step: '03',
                title: 'Export the evidence',
                body: 'Once everyone has confirmed, pull a complete package: splits, signatures, timestamps and supporting documents.',
              },
            ].map(({ icon: Icon, step, title, body }) => (
              <div key={step} className="text-center sm:text-left">
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <span className="font-mono text-[11px] text-[#5c6574]">{step}</span>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="mt-3 text-sm font-semibold text-white">{title}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#8c94a0]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-white">
            What's inside
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded border border-[#1f242e] bg-[#0e1116] p-5">
                <Icon className="h-5 w-5 text-white" />
                <div className="mt-3 text-sm font-semibold text-white">{title}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#8c94a0]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div id="pricing" className="mt-24">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-white">
            Pricing
          </h2>
          <p className="mx-auto mt-2 max-w-md text-center text-xs text-[#8c94a0]">
            Start free. Upgrade when your catalogue or your team outgrows it.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setInterval('monthly')}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                interval === 'monthly' ? 'bg-white text-[#0c0e12]' : 'text-[#8c94a0] hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('annual')}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                interval === 'annual' ? 'bg-white text-[#0c0e12]' : 'text-[#8c94a0] hover:text-white'
              }`}
            >
              Annual
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  interval === 'annual' ? 'bg-[#0c0e12] text-white' : 'bg-[#1f242e] text-[#8c94a0]'
                }`}
              >
                Save 17%
              </span>
            </button>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {plans.map((plan) => {
              const price = interval === 'annual' ? plan.priceAnnualZar : plan.priceMonthlyZar;
              const isCustom = price === null;
              const displayPrice = isCustom ? 'Custom' : plan.priceMonthlyZar === 0 ? 'R0' : `R${price}`;
              return (
                <div
                  key={plan.id}
                  className={`rounded-lg border p-5 flex flex-col ${
                    plan.recommended
                      ? 'border-white bg-[#12151c] shadow-[0_0_0_1px_rgba(255,255,255,0.15)]'
                      : 'border-[#1f242e] bg-[#0e1116]'
                  }`}
                >
                  {plan.recommended && (
                    <span className="self-start rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0c0e12] mb-3">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                  <p className="mt-1 text-[11px] text-[#8c94a0] leading-relaxed">{plan.tagline}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">{displayPrice}</span>
                    {!isCustom && (
                      <span className="text-[11px] text-[#798394]">
                        {interval === 'annual' ? '/ year' : '/ month'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-[#5c6574]">
                    {plan.maxSongs === null
                      ? 'Unlimited Rights Records'
                      : `Up to ${plan.maxSongs} Rights Records`}
                  </p>

                  <ul className="mt-5 space-y-2 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[11px] text-[#b8c0cc]">
                        <Check className="h-3.5 w-3.5 text-white shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/login"
                    className={`mt-5 rounded px-4 py-2.5 text-center text-xs font-semibold transition-colors ${
                      plan.recommended
                        ? 'bg-white text-[#0c0e12] hover:bg-[#d4d4d8]'
                        : 'border border-[#2c3444] bg-[#141820] text-white hover:border-[#3d495c]'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-8 max-w-6xl text-center">
            <button
              onClick={() => setShowComparison((v) => !v)}
              className="text-xs font-semibold text-white underline decoration-[#3d495c] underline-offset-4 hover:decoration-white"
            >
              {showComparison ? 'Hide full comparison' : 'Compare every feature'}
            </button>
          </div>

          {showComparison && (
            <div className="mx-auto mt-6 max-w-6xl overflow-x-auto rounded-lg border border-[#1f242e]">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1f242e] bg-[#0e1116]">
                    <th className="px-4 py-3 font-semibold text-[#8c94a0]">Feature</th>
                    {plans.map((p) => (
                      <th key={p.id} className="px-4 py-3 font-semibold text-white">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="border-b border-[#1a1e26] last:border-0">
                      <td className="px-4 py-3 text-[#b8c0cc]">{row.label}</td>
                      {plans.map((p) => {
                        const value = row.values[p.id];
                        return (
                          <td key={p.id} className="px-4 py-3 text-[#8c94a0]">
                            {value === '—' ? <Minus className="h-3 w-3 text-[#3d4552]" /> : value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mx-auto mt-6 max-w-md text-center text-[10px] text-[#5c6574]">
            Card checkout is available for Starter, Professional and Label directly from your
            dashboard. Enterprise pricing is arranged by contacting us.
          </p>
        </div>

        {/* Legal note */}
        <p className="mx-auto mt-20 max-w-xl text-center text-[11px] text-[#5c6574]">
          Ospreyn provides independent rights-documentation and workflow infrastructure. It does
          not provide legal advice or make claims regarding the statutory enforceability of
          private confirmations.
        </p>
      </main>

      <footer className="border-t border-[#1a1e26] px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center text-[11px] text-[#5c6574] sm:flex-row sm:justify-between sm:text-left">
          <span>© {new Date().getFullYear()} Ospreyn. Music Rights Infrastructure.</span>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link to="/legal/terms" className="hover:text-[#8c94a0]">
              Terms
            </Link>
            <Link to="/legal/privacy" className="hover:text-[#8c94a0]">
              Privacy
            </Link>
            <Link to="/legal/cookies" className="hover:text-[#8c94a0]">
              Cookies
            </Link>
            <Link to="/legal/acceptable-use" className="hover:text-[#8c94a0]">
              Acceptable use
            </Link>
            <Link to="/legal/copyright" className="hover:text-[#8c94a0]">
              Copyright
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
