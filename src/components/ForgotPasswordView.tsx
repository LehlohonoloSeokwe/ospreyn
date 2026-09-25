import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export const ForgotPasswordView: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
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

        {sent ? (
          <div className="rounded border border-[#1f242e] bg-[#0e1116] p-6 text-center">
            <MailCheck className="mx-auto h-8 w-8 text-white" />
            <h1 className="mt-3 text-sm font-semibold text-white">Check your inbox</h1>
            <p className="mt-2 text-xs leading-relaxed text-[#8c94a0]">
              If an account exists for <span className="text-white">{email}</span>, a reset link
              is on its way. It expires in an hour.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold text-white">Reset your password</h1>
            <p className="mb-6 text-sm text-[#8c94a0]">
              Enter the email on your account and we'll send you a reset link.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs text-[#8c94a0]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white placeholder-[#5c6574] outline-none focus:border-white"
                />
              </div>
              {error && (
                <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded bg-white px-4 py-2.5 text-sm font-semibold text-[#0c0e12] transition-colors hover:bg-[#e2e2e2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Send reset link
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
