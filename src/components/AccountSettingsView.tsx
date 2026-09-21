import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { User } from '../types';
import { api, ApiError } from '../lib/api';

interface AccountSettingsViewProps {
  user: User | null;
  onAccountDeleted: () => void;
}

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  user,
  onAccountDeleted,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = password.length > 0 && confirmation === 'DELETE' && !submitting;

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.delete('/account', { password, confirmation });
      onAccountDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete your account. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-lg font-semibold text-white">Account settings</h1>
      <p className="mt-1 text-sm text-[#8c94a0]">Manage your Ospreyn account.</p>

      <div className="mt-6 rounded border border-[#1f242e] bg-[#0e1116] p-5">
        <h2 className="text-sm font-semibold text-white">Profile</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[#8c94a0]">Legal name</dt>
            <dd className="text-white">{user?.fullName || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#8c94a0]">Professional name</dt>
            <dd className="text-white">{user?.stageName || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#8c94a0]">Email</dt>
            <dd className="text-white">{user?.email || '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded border border-red-500/20 bg-red-500/5 p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-300" />
          <h2 className="text-sm font-semibold text-white">Danger zone</h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#8c94a0]">
          Permanently delete your account. If you're the sole member of your workspace, this also
          deletes every song, split, invitation, confirmation, agreement, document and audit event
          in it — this cannot be undone. If your workspace has other members, remove them or
          contact support to transfer ownership first.
        </p>

        {!isConfirming ? (
          <button
            onClick={() => setIsConfirming(true)}
            className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20"
          >
            Delete my account
          </button>
        ) : (
          <form onSubmit={handleDelete} className="mt-4 space-y-3">
            <div>
              <label htmlFor="deletePassword" className="mb-1.5 block text-xs text-[#8c94a0]">
                Enter your password to confirm
              </label>
              <input
                id="deletePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-red-400/60"
                required
              />
            </div>
            <div>
              <label htmlFor="deleteConfirm" className="mb-1.5 block text-xs text-[#8c94a0]">
                Type <span className="font-mono text-white">DELETE</span> to confirm
              </label>
              <input
                id="deleteConfirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-red-400/60"
                required
              />
            </div>

            {error && (
              <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-2 rounded bg-red-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Permanently delete my account
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirming(false);
                  setError(null);
                  setPassword('');
                  setConfirmation('');
                }}
                className="rounded border border-[#2c3444] px-3.5 py-1.5 text-xs text-[#8c94a0] transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
