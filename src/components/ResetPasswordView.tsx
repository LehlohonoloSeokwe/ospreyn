import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export const ResetPasswordView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This link may have expired. Request a new one.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-6 flex items-center gap-1.5 text-xs text-[#8c94a0] hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>

        {done ? (
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h1 className="mt-3 text-sm font-semibold text-white">Password changed</h1>
            <p className="mt-2 text-xs leading-relaxed text-[#8c94a0]">
              Every other device has been signed out. Sign in again with your new password.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 rounded bg-white px-4 py-2 text-xs font-semibold text-[#0c0e12] hover:bg-[#e2e2e2]"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold text-white">Choose a new password</h1>
            <p className="mb-6 text-sm text-[#8c94a0]">At least 10 characters.</p>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-[#8c94a0]">New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-[#8c94a0]">Confirm new password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white"
                />
              </div>
              {error && (
                <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !token}
                className="flex w-full items-center justify-center gap-2 rounded bg-white px-4 py-2.5 text-sm font-semibold text-[#0c0e12] transition-colors hover:bg-[#e2e2e2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Reset password
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
