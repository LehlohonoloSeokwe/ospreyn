import React, { useCallback, useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AuditEvent, Organisation, Song, User } from './types';
import { api, ApiError } from './lib/api';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { CreateSongModal } from './components/CreateSongModal';
import { RightsRecordView } from './components/RightsRecordView';
import { ExportModal } from './components/ExportModal';
import { ReviewPortalView } from './components/ReviewPortalView';
import { LoginView } from './components/LoginView';
import { LandingPage } from './components/LandingPage';

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

  return (
    <Routes>
      {/* Public: contributors follow a link here and never sign in. */}
      <Route path="/review/:token" element={<ReviewPortalRoute />} />

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
                onSelectSong={(id: string) => navigate(`/songs/${id}`)}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
              />,
            )
          )
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

      {/* Legacy in-app paths and anything unrecognised return to the dashboard. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * The rights record workspace. Reads its song id from the URL, so a refresh or
 * a pasted link lands on the same record.
 */
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
