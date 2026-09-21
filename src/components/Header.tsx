import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, LogOut, Settings } from 'lucide-react';
import { User, Organisation } from '../types';

interface HeaderProps {
  user: User | null;
  currentOrg: Organisation | null;
  role?: string;
  onOpenCreateModal: () => void;
  onGoHome: () => void;
  onSignOut: () => void;
  activeView: string;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  currentOrg,
  role,
  onOpenCreateModal,
  onGoHome,
  onSignOut,
  activeView,
}) => {
  return (
    <header className="border-b border-[#222730] bg-[#0c0e12] px-4 py-3 sm:px-6 sticky top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Left: Brand & Workspace */}
        <div className="flex items-center space-x-6">
          <button
            onClick={onGoHome}
            className="flex items-center space-x-2.5 text-left group transition-opacity hover:opacity-90 cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center">
              <img src="/assets/logo-white.png" alt="Ospreyn" className="h-6 w-6 object-contain" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-white uppercase flex items-center gap-1.5">
                Ospreyn
                <span className="text-[10px] tracking-normal font-normal text-amber-300/80 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                  v1.2
                </span>
              </div>
              <div className="text-[11px] text-[#8c94a0] font-mono">Music Rights Infrastructure</div>
            </div>
          </button>

          {/* Workspace Pill */}
          <div className="hidden md:flex items-center space-x-2 border-l border-[#222730] pl-6">
            <div className="flex items-center space-x-2 rounded border border-[#262c36] bg-[#141820] px-2.5 py-1 text-xs text-[#c5cbd4]">
              <Building2 className="h-3.5 w-3.5 text-[#8c94a0]" />
              <span className="font-medium">{currentOrg?.name || 'Workspace'}</span>
              {role && (
                <span className="text-[10px] text-[#636c7a] bg-[#1b202a] px-1.5 py-0.5 rounded capitalize">
                  {role}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & User Identity */}
        <div className="flex items-center space-x-3">
          {activeView !== 'review' && (
            <button
              onClick={onOpenCreateModal}
              className="flex items-center space-x-1.5 rounded bg-[#ffffff] hover:bg-[#e2e2e2] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-colors cursor-pointer shadow-sm"
            >
              <span>+ Create Rights Record</span>
            </button>
          )}

          {/* User profile */}
          <div className="flex items-center space-x-2.5 border-l border-[#222730] pl-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1e2430] border border-[#2c3444] text-xs font-medium text-[#c5cbd4]">
              {user?.fullName ? user.fullName[0].toUpperCase() : '?'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-medium text-white leading-none">{user?.fullName || ''}</div>
              <div className="text-[10px] text-[#798394] font-mono mt-0.5">
                {user?.stageName ? `"${user.stageName}"` : user?.email || ''}
              </div>
            </div>
            <Link
              to="/account"
              title="Account settings"
              aria-label="Account settings"
              className="flex h-7 w-7 items-center justify-center rounded border border-[#2c3444] bg-[#161b24] text-[#8c94a0] transition-colors hover:border-[#3d495c] hover:text-white cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded border border-[#2c3444] bg-[#161b24] text-[#8c94a0] transition-colors hover:border-[#3d495c] hover:text-white cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
