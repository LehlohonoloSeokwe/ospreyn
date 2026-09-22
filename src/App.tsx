import React, { useCallback, useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { AuditEvent, Organisation, PlanDefinition, Song, User } from './types';
import { api, ApiError } from './lib/api';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { CreateSongModal } from './components/CreateSongModal';
import { RightsRecordView } from './components/RightsRecordView';
import { ExportModal } from './components/ExportModal';
import { ReviewPortalView } from './components/ReviewPortalView';
import { LoginView } from './components/LoginView';
import { LandingPage } from './components/LandingPage';
import { LegalPage } from './components/legal/LegalPage';
import { AccountSettingsView } from './components/AccountSettingsView';
import { AdminPortalView } from './components/admin/AdminPortalView';

interface Metrics {
  totalSongs: number;
  completedCount: number;
  needsAttentionCount: number;
  awaitingConfirmationCount: number;
  recentActivity: AuditEvent[];
}

const EMPTY_METRICS: Metrics = {
  totalSongs: 0,
  completedCount: 0,
  needsAttentionCount: 0,
  awaitingConfirmationCount: 0,
  recentActivity: [],
};

type AuthState = 'checking' | 'authenticated' | 'anonymous';

const Spinner: React.FC = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#ffffff] border-t-transparent" />
  </div>
);

export default function App() {
  const navigate = useNavigate();

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organisation | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [songs, setSongs] = useState<Song[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [plans, setPlans] = useState<Record<string, PlanDefinition>>({});
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    // Public endpoint — fetched once regardless of auth state, so the
    // dashboard's usage indicator and the create-record paywall always
    // reflect the same limits the backend actually enforces.
    api
      .get<Record<string, PlanDefinition>>('/plans')
      .then(setPlans)
      .catch(() => undefined);
  }, []);

  const loadWorkspace = useCallback(async () => {
    try {
      const data = await api.get('/me');
      setUser(data.user);
      setCurrentOrg(data.organisation);
      setRole(data.role);
      setSongs(data.songs || []);
      setMetrics({ ...EMPTY_METRICS, ...data.metrics });
      setAuthState('authenticated');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthState('anonymous');
      } else {
        console.error('Could not load workspace:', err);
        setAuthState('anonymous');
      }
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSignOut = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
    setCurrentOrg(null);
    setSongs([]);
    setMetrics(EMPTY_METRICS);
    setAuthState('anonymous');
    navigate('/login', { replace: true });
  };

  const handleUpgradeToPro = async () => {
    setUpgrading(true);
    try {
      const { authorizationUrl } = await api.post<{ authorizationUrl: string }>(
        '/billing/checkout',
      );
      window.location.href = authorizationUrl; // full navigation to Paystack, not an in-app route
    } catch (err) {
      console.error('Could not start checkout:', err);
      setUpgrading(false);
    }
  };

  const handleCreateSong = async (payload: Record<string, unknown>) => {
    const song = await api.post('/songs', payload);
    await loadWorkspace();
    setIsCreateModalOpen(false);
    navigate(`/songs/${song.id}`);
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#090a0d] text-[#c5cbd4] antialiased selection:bg-[#ffffff]/30 selection:text-[#ffffff]">
      <Header
        user={user}
        currentOrg={currentOrg}
        role={role}
        activeView="app"
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onGoHome={() => navigate('/')}
        onSignOut={handleSignOut}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      <CreateSongModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateSong}
      />
    </div>
  );

  const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (authState === 'checking') {
      return (
        <div className="min-h-screen bg-[#090a0d]">
          <Spinner />
        </div>
      );
    }
    if (authState === 'anonymous') return <Navigate to="/login" replace />;
    return <>{children}</>;
  };

  const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (authState === 'checking') {
      return (
        <div className="min-h-screen bg-[#090a0d]">
          <Spinner />
        </div>
      );
    }
    if (authState === 'anonymous') return <Navigate to="/login" replace />;
    if (!user?.isPlatformAdmin) return <Navigate to="/" replace />;
    return <>{children}</>;
  };

  return (
    <Routes>
      {/* Public: contributors follow a link here and never sign in. */}
      <Route path="/review/:token" element={<ReviewPortalRoute />} />

      {/* Public: policy pages, linked from the landing page, login and footer. */}
      <Route path="/legal/:slug" element={<LegalPage />} />

      <Route
        path="/login"
        element={
          authState === 'authenticated' ? (
            <Navigate to="/" replace />
          ) : (
            <LoginView
              onSignedIn={async () => {
                await loadWorkspace();
                navigate('/', { replace: true });
              }}
            />
          )
        }
      />

      <Route
        path="/"
        element={
          authState === 'checking' ? (
            <div className="min-h-screen bg-[#090a0d]">
              <Spinner />
            </div>
          ) : authState === 'anonymous' ? (
            <LandingPage />
          ) : (
            shell(
              <DashboardView
                user={user}
                songs={songs}
                metrics={metrics}
                currentOrg={currentOrg}
                plan={plans[currentOrg?.plan || 'free']}
                onSelectSong={(id: string) => navigate(`/songs/${id}`)}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
                onUpgradeToPro={handleUpgradeToPro}
                upgrading={upgrading}
              />,
            )
          )
        }
      />

      <Route
        path="/billing/return"
        element={
          <RequireAuth>
            <BillingReturnRoute onWorkspaceChanged={loadWorkspace} />
          </RequireAuth>
        }
      />

      <Route
        path="/songs/:songId"
        element={
          <RequireAuth>
            {shell(<SongRoute onWorkspaceChanged={loadWorkspace} />)}
          </RequireAuth>
        }
      />

      <Route
        path="/account"
        element={
          <RequireAuth>
            {shell(
              <AccountSettingsView
                user={user}
                onAccountDeleted={handleSignOut}
                onUserUpdated={setUser}
              />,
            )}
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={<RequireAdmin>{shell(<AdminPortalView />)}</RequireAdmin>}
      />

      {/* Legacy in-app paths and anything unrecognised return to the dashboard. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * The rights record workspace. Reads its song id from the URL, so a refresh or
 * a pasted link lands on the same record.
 */
/**
 * Landed on after Paystack redirects back from checkout (PAYSTACK_CALLBACK_URL
 * in .env.example should point here). Verifies the transaction server-side
 * — the ?reference= in the URL is not itself proof of payment, so the actual
 * upgrade only happens once GET /billing/verify/:reference confirms it with
 * Paystack directly — then bounces back to the dashboard either way.
 */
const BillingReturnRoute: React.FC<{ onWorkspaceChanged: () => Promise<void> }> = ({
  onWorkspaceChanged,
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference) {
      setStatus('failed');
      return;
    }
    api
      .get(`/billing/verify/${encodeURIComponent(reference)}`)
      .then(async () => {
        await onWorkspaceChanged();
        setStatus('success');
        setTimeout(() => navigate('/', { replace: true }), 1500);
      })
      .catch((err) => {
        console.error('Payment verification failed:', err);
        setStatus('failed');
      });
    // Only run once per landing — re-running on every onWorkspaceChanged
    // identity change would re-verify (harmless, but pointless) each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#090a0d] px-4 text-center">
      {status === 'verifying' && (
        <>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <p className="text-sm text-[#c5cbd4]">Confirming your payment with Paystack…</p>
        </>
      )}
      {status === 'success' && (
        <p className="text-sm text-emerald-300">
          You're on the Pro plan. Taking you back to your dashboard…
        </p>
      )}
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-rose-300">
            We couldn't confirm this payment. If you were charged, contact support before trying
            again.
          </p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="rounded bg-white px-3.5 py-2 text-xs font-semibold text-[#0c0e12] hover:bg-white/90"
          >
            Back to dashboard
          </button>
        </div>
      )}
    </div>
  );
};

const SongRoute: React.FC<{ onWorkspaceChanged: () => Promise<void> }> = ({
  onWorkspaceChanged,
}) => {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportData, setExportData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!songId) return;
    setLoading(true);
    try {
      setDetail(await api.get(`/songs/${songId}`));
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else console.error('Could not load rights record:', err);
    } finally {
      setLoading(false);
    }
  }, [songId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
    await onWorkspaceChanged();
  };

  if (loading && !detail) return <Spinner />;

  if (notFound) {
    return (
      <div className="rounded border border-[#1f242e] bg-[#0e1116] p-8 text-center">
        <p className="text-sm text-white">This rights record is not available.</p>
        <p className="mt-1 text-xs text-[#8c94a0]">
          It may have been removed, or it belongs to another workspace.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded bg-[#ffffff] px-3.5 py-1.5 text-xs font-semibold text-[#0c0e12]"
        >
          Back to catalogue
        </button>
      </div>
    );
  }

  if (!detail) return <Spinner />;

  return (
    <>
      <RightsRecordView
        song={detail.song}
        versions={detail.versions}
        currentVersion={detail.currentVersion}
        songContributors={detail.songContributors}
        allocations={detail.allocations}
        validation={detail.validation}
        confirmations={detail.confirmations}
        invitations={detail.invitations}
        agreements={detail.agreements}
        documents={detail.documents}
        audit={detail.audit}
        onBack={() => navigate('/')}
        onUpdateSongMetadata={async (data: any) => {
          await api.put(`/songs/${songId}`, data);
          await refresh();
        }}
        onSaveOwnership={async (allocations: any) => {
          await api.post(`/songs/${songId}/ownership`, { allocations });
          await refresh();
        }}
        onBumpVersion={async (changeReason: string) => {
          await api.post(`/songs/${songId}/bump-version`, { changeReason });
          await refresh();
        }}
        onAddContributor={async (data: any) => {
          await api.post(`/songs/${songId}/contributors`, data);
          await refresh();
        }}
        onRemoveContributor={async (songContributorId: string) => {
          await api.delete(`/songs/${songId}/contributors/${songContributorId}`);
          await refresh();
        }}
        onSendInvitations={async (contributorIds: string[]) => {
          const result = await api.post(`/songs/${songId}/invitations`, { contributorIds });
          await refresh();
          return result;
        }}
        onGenerateAgreement={async () => {
          await api.post(`/songs/${songId}/agreements`);
          await refresh();
        }}
        onUploadDocument={refresh}
        songId={songId!}
        onOpenExportModal={async () => {
          setExportData(await api.get(`/songs/${songId}/export`));
          setIsExportModalOpen(true);
        }}
      />

      {isExportModalOpen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          song={detail.song}
          exportData={exportData}
        />
      )}
    </>
  );
};

/**
 * The contributor review portal. Deliberately outside the authenticated shell:
 * an invited collaborator has a link, not an account.
 */
const ReviewPortalRoute: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-[#090a0d] text-[#c5cbd4] antialiased">
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <ReviewPortalView token={token!} onExit={undefined} onRefreshParent={() => undefined} />
      </main>
    </div>
  );
};
