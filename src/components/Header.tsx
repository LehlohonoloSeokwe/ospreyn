import React from 'react';
import { Shield, Music2, Building2, Bell, ExternalLink, Download } from 'lucide-react';
import { User, Organisation } from '../types';

interface HeaderProps {
  user: User | null;
  currentOrg: Organisation | null;
  onOpenCreateModal: () => void;
  onGoHome: () => void;
  onGoLanding: () => void;
  activeView: string;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  currentOrg,
  onOpenCreateModal,
  onGoHome,
  onGoLanding,
  activeView,
}) => {
  return (
    <header className="border-b border-[#222730] bg-[#0c0e12] px-4 py-3 sm:px-6 sticky top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Left: Brand & Workspace */}
        <div className="flex items-center space-x-4 sm:space-x-6">
          <button
            onClick={onGoLanding}
            className="flex items-center space-x-2.5 text-left group transition-opacity hover:opacity-90 cursor-pointer"
            title="Go to Ospreyn Home Page"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#e6b359] text-[#0c0e12] font-semibold">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-white uppercase flex items-center gap-1.5">
                Ospreyn
                <span className="text-[10px] tracking-normal font-normal text-amber-300/80 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                  MVP 1.1
                </span>
              </div>
              <div className="text-[11px] text-[#8c94a0] font-mono">Music Rights Infrastructure</div>
            </div>
          </button>

          {/* Navigation links: Home / Workspace */}
          <nav className="hidden md:flex items-center space-x-1 border-l border-[#222730] pl-4">
            <button
              onClick={onGoLanding}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                activeView === 'landing'
                  ? 'bg-[#181e29] text-[#e6b359] font-medium'
                  : 'text-[#8c94a0] hover:text-white'
              }`}
            >
              Home
            </button>
            <button
              onClick={onGoHome}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                activeView !== 'landing' && activeView !== 'review'
                  ? 'bg-[#181e29] text-[#e6b359] font-medium'
                  : 'text-[#8c94a0] hover:text-white'
              }`}
            >
              Workspace
            </button>
          </nav>

          {/* Workspace Pill */}
          <div className="hidden lg:flex items-center space-x-2 border-l border-[#222730] pl-4">
            <div className="flex items-center space-x-2 rounded border border-[#262c36] bg-[#141820] px-2.5 py-1 text-xs text-[#c5cbd4]">
              <Building2 className="h-3.5 w-3.5 text-[#8c94a0]" />
              <span className="font-medium">{currentOrg?.name || 'Workspace'}</span>
              <span className="text-[10px] text-[#636c7a] bg-[#1b202a] px-1.5 py-0.5 rounded">Owner</span>
            </div>
          </div>
        </div>

        {/* Right: Actions & User Identity */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <a
            href="/api/download-zip"
            download="ospreyn-music-rights-project.zip"
            className="flex items-center space-x-1.5 rounded border border-[#2e3747] bg-[#161b24] hover:bg-[#1e2430] hover:border-[#3d495c] text-[#c5cbd4] hover:text-white px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-sm"
            title="Download the entire application source code as a ZIP file"
          >
            <Download className="h-3.5 w-3.5 text-[#e6b359]" />
            <span className="hidden sm:inline">Download ZIP</span>
          </a>

          {activeView === 'landing' ? (
            <button
              onClick={onGoHome}
              className="flex items-center space-x-1.5 rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-colors cursor-pointer shadow-sm"
            >
              <span>Enter Workspace</span>
            </button>
          ) : (
            activeView !== 'review' && (
              <button
                onClick={onOpenCreateModal}
                className="flex items-center space-x-1.5 rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-colors cursor-pointer shadow-sm"
              >
                <span>+ Create Rights Record</span>
              </button>
            )
          )}

          {/* User profile */}
          <div className="flex items-center space-x-2 border-l border-[#222730] pl-2.5 sm:pl-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1e2430] border border-[#2c3444] text-xs font-medium text-[#c5cbd4]">
              {user?.fullName ? user.fullName[0] : 'H'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-medium text-white leading-none">{user?.fullName || 'Hloni Mokoena'}</div>
              <div className="text-[10px] text-[#798394] font-mono mt-0.5">{user?.stageName ? `"${user.stageName}"` : 'Creator'}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
