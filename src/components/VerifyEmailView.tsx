import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export const VerifyEmailView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .post(`/auth/verify-email/${token}`)
      .then(() => setStatus('success'))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'This link is invalid or has expired.');
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-12">
      <div className="w-full max-w-sm rounded border border-[#1f242e] bg-[#0e1116] p-6 text-center">
        {status === 'loading' && <Loader2 className="mx-auto h-8 w-8 animate-spin text-white" />}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h1 className="mt-3 text-sm font-semibold text-white">Email verified</h1>
            <p className="mt-2 text-xs text-[#8c94a0]">Your email address has been confirmed.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-8 w-8 text-red-400" />
            <h1 className="mt-3 text-sm font-semibold text-white">Verification failed</h1>
            <p className="mt-2 text-xs text-[#8c94a0]">{error}</p>
          </>
        )}
        <Link to="/" className="mt-4 inline-block rounded bg-white px-4 py-2 text-xs font-semibold text-[#0c0e12] hover:bg-[#e2e2e2]">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
};
