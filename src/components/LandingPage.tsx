import React from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Users, History, Lock } from 'lucide-react';

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
  return (
    <div className="min-h-screen bg-[#090a0d] text-[#c5cbd4] antialiased">
      {/* Nav */}
      <header className="border-b border-[#1a1e26] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <img src="/assets/logo-white.png" alt="Ospreyn" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold uppercase tracking-wide text-white">Ospreyn</span>
          </div>
          <Link
            to="/login"
            className="rounded border border-[#2c3444] bg-[#141820] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#3d495c]"
          >
            Sign in
          </Link>
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

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded border border-[#1f242e] bg-[#0e1116] p-5"
            >
              <Icon className="h-5 w-5 text-white" />
              <div className="mt-3 text-sm font-semibold text-white">{title}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-[#8c94a0]">{body}</p>
            </div>
          ))}
        </div>

        {/* Legal note */}
        <p className="mx-auto mt-20 max-w-xl text-center text-[11px] text-[#5c6574]">
          Ospreyn provides independent rights-documentation and workflow infrastructure. It does
          not provide legal advice or make claims regarding the statutory enforceability of
          private confirmations.
        </p>
      </main>

      <footer className="border-t border-[#1a1e26] px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl text-center text-[11px] text-[#5c6574]">
          © {new Date().getFullYear()} Ospreyn. Music Rights Infrastructure.
        </div>
      </footer>
    </div>
  );
};
