import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Users, History, Lock, PenLine, Send, ShieldCheck, Check } from 'lucide-react';
import { api } from '../lib/api';
import { PlanDefinition } from '../types';

// Mirrors server/plans.ts, used only if /api/plans can't be reached (e.g.
// before the backend is deployed) so the pricing section still renders.
const FALLBACK_PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthlyZar: 0,
    maxSongs: 7,
    tagline: 'Get your first releases properly documented.',
    features: [
      'Up to 7 Rights Records',
      'Unlimited contributors per song',
      'Composition & master ownership splits',
      'Email invitations & confirmations',
      'Split-sheet PDF generation',
      'Document vault',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthlyZar: 249,
    maxSongs: null,
    tagline: 'For active catalogues and small labels.',
    features: [
      'Unlimited Rights Records',
      'Everything in Free',
      'WhatsApp owner notifications',
      'Priority support',
    ],
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

  useEffect(() => {
    let cancelled = false;
    api
      .get<Record<string, PlanDefinition>>('/plans')
      .then((data) => {
        if (cancelled) return;
        const ordered = ['free', 'pro']
          .map((id) => data[id])
          .filter((p): p is PlanDefinition => Boolean(p));
        if (ordered.length > 0) setPlans(ordered);
      })
      .catch(() => {
        // Keep the static fallback — the pricing section should never be
        // blank just because the API host isn't reachable yet.
      });
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
            Record splits, collect contributor confirmations, and keep a clean audit trail —
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
                body: 'Each collaborator gets a private link to review and confirm their share, or ask for a change — no account required.',
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
            Start free. Upgrade when your catalogue outgrows it.
          </p>

          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            {plans.map((plan) => {
              const isPro = plan.id === 'pro';
              return (
                <div
                  key={plan.id}
                  className={`rounded-lg border p-6 flex flex-col ${
                    isPro
                      ? 'border-white bg-[#12151c] shadow-[0_0_0_1px_rgba(255,255,255,0.15)]'
                      : 'border-[#1f242e] bg-[#0e1116]'
                  }`}
                >
                  {isPro && (
                    <span className="self-start rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0c0e12] mb-3">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                  <p className="mt-1 text-xs text-[#8c94a0]">{plan.tagline}</p>

                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">
                      {plan.priceMonthlyZar === 0 ? 'R0' : `R${plan.priceMonthlyZar}`}
                    </span>
                    <span className="text-xs text-[#798394]">/ month</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#5c6574]">
                    {plan.maxSongs === null
                      ? 'Unlimited Rights Records'
                      : `Up to ${plan.maxSongs} Rights Records`}
                  </p>

                  <ul className="mt-6 space-y-2.5 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-[#b8c0cc]">
                        <Check className="h-3.5 w-3.5 text-white shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/login"
                    className={`mt-6 rounded px-4 py-2.5 text-center text-xs font-semibold transition-colors ${
                      isPro
                        ? 'bg-white text-[#0c0e12] hover:bg-[#d4d4d8]'
                        : 'border border-[#2c3444] bg-[#141820] text-white hover:border-[#3d495c]'
                    }`}
                  >
                    {plan.priceMonthlyZar === 0 ? 'Start free' : 'Get started'}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="mx-auto mt-6 max-w-md text-center text-[10px] text-[#5c6574]">
            Pro is enabled manually after payment is arranged — reach out once you're ready to
            upgrade. Card checkout is coming soon.
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
