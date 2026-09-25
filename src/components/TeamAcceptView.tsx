import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export const TeamAcceptView: React.FC<{ onAccepted: () => Promise<void> }> = ({ onAccepted }) => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .post(`/team/invitations/token/${token}/accept`)
      .then(async () => {
        await onAccepted();
        setStatus('success');
        setTimeout(() => navigate('/', { replace: true }), 1200);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'This invitation is invalid or has expired.');
        setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-12">
      <div className="w-full max-w-sm rounded border border-[#1f242e] bg-[#0e1116] p-6 text-center">
        {status === 'loading' && <Loader2 className="mx-auto h-8 w-8 animate-spin text-white" />}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h1 className="mt-3 text-sm font-semibold text-white">You're in</h1>
            <p className="mt-2 text-xs text-[#8c94a0]">Taking you to your dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-8 w-8 text-red-400" />
            <h1 className="mt-3 text-sm font-semibold text-white">Couldn't accept invitation</h1>
            <p className="mt-2 text-xs text-[#8c94a0]">{error}</p>
          </>
        )}
      </div>
    </div>
  );
};
