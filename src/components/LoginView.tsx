import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface LoginViewProps {
  onSignedIn: () => void;
}

type Mode = 'signin' | 'register';

export const LoginView: React.FC<LoginViewProps> = ({ onSignedIn }) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [stageName, setStageName] = useState('');
  const [organisationName, setOrganisationName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await api.post('/auth/login', { email, password });
      } else {
        await api.post('/auth/register', {
          email,
          password,
          fullName,
          stageName: stageName || undefined,
          organisationName: organisationName || undefined,
          acceptedTerms,
        });
      }
      onSignedIn();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the Ospreyn API. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white placeholder-[#5c6574] outline-none transition-colors focus:border-[#ffffff]';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center space-x-2.5 w-fit">
          <div className="flex h-9 w-9 items-center justify-center">
            <img src="/assets/logo-white.png" alt="Ospreyn" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-white">Ospreyn</div>
            <div className="font-mono text-[11px] text-[#8c94a0]">Music Rights Infrastructure</div>
          </div>
        </Link>

        <h1 className="mb-1 text-xl font-semibold text-white">
          {mode === 'signin' ? 'Sign in to your workspace' : 'Create your workspace'}
        </h1>
        <p className="mb-6 text-sm text-[#8c94a0]">
          {mode === 'signin'
            ? 'Your rights records, splits and confirmation history live here.'
            : 'Start recording splits and collecting contributor confirmations.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="fullName" className="mb-1.5 block text-xs text-[#8c94a0]">
                  Legal name
                </label>
                <input
                  id="fullName"
                  className={inputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="As it should appear on split sheets"
                  required
                />
              </div>
              <div>
                <label htmlFor="stageName" className="mb-1.5 block text-xs text-[#8c94a0]">
                  Professional name <span className="text-[#5c6574]">(optional)</span>
                </label>
                <input
                  id="stageName"
                  className={inputClass}
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="orgName" className="mb-1.5 block text-xs text-[#8c94a0]">
                  Workspace name <span className="text-[#5c6574]">(optional)</span>
                </label>
                <input
                  id="orgName"
                  className={inputClass}
                  value={organisationName}
                  onChange={(e) => setOrganisationName(e.target.value)}
                  placeholder="Your label, studio or collective"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs text-[#8c94a0]">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-xs text-[#8c94a0]">
                Password
              </label>
              {mode === 'signin' && (
                <Link to="/forgot-password" className="text-[11px] text-[#8c94a0] underline hover:text-white">
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 10 : undefined}
            />
            {mode === 'register' && (
              <p className="mt-1.5 text-[11px] text-[#5c6574]">At least 10 characters.</p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          {mode === 'register' && (
            <label className="flex items-start gap-2 text-[11px] text-[#8c94a0]">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[#262c36] bg-[#0f1319] accent-white"
              />
              <span>
                I agree to the{' '}
                <Link to="/legal/terms" target="_blank" className="text-white underline underline-offset-2">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/legal/privacy" target="_blank" className="text-white underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting || (mode === 'register' && !acceptedTerms)}
            className="flex w-full items-center justify-center gap-2 rounded bg-[#ffffff] px-4 py-2.5 text-sm font-semibold text-[#0c0e12] transition-colors hover:bg-[#e2e2e2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'signin' ? 'Sign in' : 'Create workspace'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'register' : 'signin');
            setError(null);
          }}
          className="mt-5 w-full text-center text-xs text-[#8c94a0] transition-colors hover:text-[#c5cbd4]"
        >
          {mode === 'signin'
            ? 'No workspace yet? Create one'
            : 'Already have a workspace? Sign in'}
        </button>

        <div className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-[#5c6574]">
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
    </div>
  );
};
