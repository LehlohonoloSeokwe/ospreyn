import React, { useState, useEffect } from 'react';
import { User, Organisation, Song, AuditEvent } from './types';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { CreateSongModal } from './components/CreateSongModal';
import { RightsRecordView } from './components/RightsRecordView';
import { ExportModal } from './components/ExportModal';
import { ReviewPortalView } from './components/ReviewPortalView';
import { LandingPageView } from './components/LandingPageView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organisation | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [metrics, setMetrics] = useState<{
    totalSongs: number;
    completedCount: number;
    needsAttentionCount: number;
    awaitingConfirmationCount: number;
    recentActivity: AuditEvent[];
  }>({
    totalSongs: 0,
    completedCount: 0,
    needsAttentionCount: 0,
    awaitingConfirmationCount: 0,
    recentActivity: [],
  });

  const [loading, setLoading] = useState(true);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedSongDetail, setSelectedSongDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Landing page vs Workspace view state
  const [isLandingView, setIsLandingView] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/review/')) return false;
      if (window.location.hash === '#workspace' || window.location.hash === '#dashboard') return false;
    }
    return false; // Start on dashboard for immediate app access, while home tab is easily accessible
  });

  // Review portal state
  const [activeReviewToken, setActiveReviewToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/review/')) {
      return window.location.pathname.replace('/review/', '');
    }
    return null;
  });

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportData, setExportData] = useState<any>(null);

  // Fetch current user and catalogue data
  const loadDashboardData = async () => {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const data = await res.json();
      setUser(data.user);
      setCurrentOrg(data.organisation);
      setSongs(data.songs);
      setMetrics(data.metrics);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch full song details when selected
  const loadSongDetail = async (songId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/songs/${songId}`);
      if (!res.ok) throw new Error('Failed to load song details');
      const data = await res.json();
      setSelectedSongDetail(data);
    } catch (err) {
      console.error('Error loading song detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (selectedSongId) {
      loadSongDetail(selectedSongId);
    } else {
      setSelectedSongDetail(null);
    }
  }, [selectedSongId]);

  // Actions
  const handleCreateSong = async (payload: {
    title: string;
    primaryArtist: string;
    releaseDate?: string;
    genre?: string;
    isrc?: string;
    catalogueReference?: string;
    notes?: string;
  }) => {
    const res = await fetch('/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create rights record');
    }
    const data = await res.json();
    await loadDashboardData();
    setSelectedSongId(data.song.id);
  };

  const handleUpdateSongMetadata = async (data: Partial<Song>) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update metadata');
    }
    await loadSongDetail(selectedSongId);
    await loadDashboardData();
  };

  const handleSaveOwnership = async (allocations: Array<{ contributorId: string; rightType: 'COMPOSITION' | 'MASTER'; basisPoints: number }>) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/ownership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations }),
    });
    const json = await res.json();
    if (!res.ok) {
      const err: any = new Error(json.error || 'Failed to save ownership');
      if (json.requiresVersionBump) err.requiresVersionBump = true;
      throw err;
    }
    await loadSongDetail(selectedSongId);
    await loadDashboardData();
  };

  const handleBumpVersion = async (changeReason: string) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/bump-version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeReason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create new rights record version');
    }
    await loadSongDetail(selectedSongId);
    await loadDashboardData();
  };

  const handleAddContributor = async (data: any) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/contributors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add contributor');
    }
    await loadSongDetail(selectedSongId);
  };

  const handleRemoveContributor = async (songContributorId: string) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/contributors/${songContributorId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to remove contributor');
    }
    await loadSongDetail(selectedSongId);
  };

  const handleSendInvitations = async (contributorIds: string[]) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributorIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send invitations');
    }
    const json = await res.json();
    await loadSongDetail(selectedSongId);
    await loadDashboardData();
    return json;
  };

  const handleGenerateAgreement = async () => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to generate split agreement');
    }
    await loadSongDetail(selectedSongId);
    await loadDashboardData();
  };

  const handleUploadDocument = async (data: any) => {
    if (!selectedSongId) return;
    const res = await fetch(`/api/songs/${selectedSongId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save document metadata');
    }
    await loadSongDetail(selectedSongId);
  };

  const handleOpenExportModal = async () => {
    if (!selectedSongId) return;
    try {
      const res = await fetch(`/api/songs/${selectedSongId}/export`);
      if (!res.ok) throw new Error('Failed to export evidence package');
      const data = await res.json();
      setExportData(data);
      setIsExportModalOpen(true);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0d] text-[#c5cbd4] antialiased selection:bg-[#e6b359]/30 selection:text-[#e6b359]">
      {/* Top Application Header */}
      <Header
        user={user}
        currentOrg={currentOrg}
        activeView={
          activeReviewToken
            ? 'review'
            : isLandingView
            ? 'landing'
            : selectedSongId
            ? 'record'
            : 'dashboard'
        }
        onOpenCreateModal={() => {
          setIsLandingView(false);
          setIsCreateModalOpen(true);
        }}
        onGoHome={() => {
          setIsLandingView(false);
          setSelectedSongId(null);
          setActiveReviewToken(null);
        }}
        onGoLanding={() => {
          setIsLandingView(true);
          setSelectedSongId(null);
          setActiveReviewToken(null);
        }}
      />

      {/* Main Viewport */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 border-2 border-[#e6b359] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeReviewToken ? (
          /* View 3: External Collaborator Review Portal */
          <ReviewPortalView
            token={activeReviewToken}
            onExit={() => {
              setActiveReviewToken(null);
              loadDashboardData();
              if (selectedSongId) loadSongDetail(selectedSongId);
            }}
            onRefreshParent={() => {
              loadDashboardData();
              if (selectedSongId) loadSongDetail(selectedSongId);
            }}
          />
        ) : isLandingView ? (
          /* View 0: Public Landing & Explanation Page */
          <LandingPageView
            onEnterApp={() => setIsLandingView(false)}
            onOpenDemoReview={() => setActiveReviewToken('demo-token-kabelo-2026')}
          />
        ) : selectedSongId && selectedSongDetail ? (
          /* View 2: Rights Record Workspace */
          <RightsRecordView
            song={selectedSongDetail.song}
            versions={selectedSongDetail.versions}
            currentVersion={selectedSongDetail.currentVersion}
            songContributors={selectedSongDetail.songContributors}
            allocations={selectedSongDetail.allocations}
            validation={selectedSongDetail.validation}
            confirmations={selectedSongDetail.confirmations}
            invitations={selectedSongDetail.invitations}
            agreements={selectedSongDetail.agreements}
            documents={selectedSongDetail.documents}
            audit={selectedSongDetail.audit}
            onBack={() => {
              setSelectedSongId(null);
              loadDashboardData();
            }}
            onUpdateSongMetadata={handleUpdateSongMetadata}
            onSaveOwnership={handleSaveOwnership}
            onBumpVersion={handleBumpVersion}
            onAddContributor={handleAddContributor}
            onRemoveContributor={handleRemoveContributor}
            onSendInvitations={handleSendInvitations}
            onGenerateAgreement={handleGenerateAgreement}
            onUploadDocument={handleUploadDocument}
            onOpenExportModal={handleOpenExportModal}
            onOpenReviewPortal={(rawToken) => setActiveReviewToken(rawToken)}
          />
        ) : (
          /* View 1: Catalogue Dashboard */
          <DashboardView
            user={user}
            songs={songs}
            metrics={metrics}
            onSelectSong={(id) => setSelectedSongId(id)}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenReviewPortal={(rawToken) => setActiveReviewToken(rawToken)}
          />
        )}
      </main>

      {/* Global Modals */}
      <CreateSongModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateSong}
      />

      {isExportModalOpen && selectedSongDetail && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          song={selectedSongDetail.song}
          exportData={exportData}
        />
      )}
    </div>
  );
}
