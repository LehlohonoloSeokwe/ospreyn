import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Camera,
  X,
  Lock,
  Mail,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { SecurityStatus, User } from '../types';
import { api, ApiError } from '../lib/api';

interface AccountSettingsViewProps {
  user: User | null;
  onAccountDeleted: () => void;
  onUserUpdated: (user: User) => void;
}

const SOCIAL_FIELDS: Array<{ key: keyof NonNullable<User['socialLinks']>; label: string; placeholder: string }> = [
  { key: 'website', label: 'Website', placeholder: 'https://yoursite.com' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/you' },
  { key: 'twitter', label: 'X / Twitter', placeholder: 'https://x.com/you' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@you' },
  { key: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/...' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@you' },
];

/** How complete this profile is, out of 100 — drives the banner at the top of the page. */
function profileCompletion(user: User | null): { percent: number; missing: string[] } {
  if (!user) return { percent: 0, missing: [] };
  const checks: Array<[boolean, string]> = [
    [Boolean(user.fullName?.trim()), 'Full name'],
    [Boolean(user.stageName?.trim()), 'Stage name'],
    [Boolean(user.avatarKey), 'Profile picture'],
    [Boolean(user.bio?.trim()), 'Bio'],
    [Boolean(user.socialLinks && Object.keys(user.socialLinks).length > 0), 'A social link'],
    [Boolean(user.phone?.trim()), 'WhatsApp number'],
    [Boolean(user.emailVerifiedAt), 'Verified email'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  user,
  onAccountDeleted,
  onUserUpdated,
}) => {
  const completion = useMemo(() => profileCompletion(user), [user]);

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <h1 className="text-lg font-semibold text-white">Account settings</h1>
      <p className="mt-1 text-sm text-[#8c94a0]">
        Keep your profile current — it's what contributors and collaborators see when you invite
        them into a Rights Record.
      </p>

      <ProfileCompletionBanner percent={completion.percent} missing={completion.missing} />
      <AvatarCard user={user} onUserUpdated={onUserUpdated} />
      <ProfileCard user={user} onUserUpdated={onUserUpdated} />
      <SocialLinksCard user={user} onUserUpdated={onUserUpdated} />
      <EmailCard user={user} onUserUpdated={onUserUpdated} />
      <PasswordCard />
      <SecurityCard />
      <DangerZoneCard onAccountDeleted={onAccountDeleted} />
    </div>
  );
};

// --- Profile completion banner ---

const ProfileCompletionBanner: React.FC<{ percent: number; missing: string[] }> = ({ percent, missing }) => {
  if (percent >= 100) {
    return (
      <div className="mt-6 flex items-center gap-2.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Your profile is complete.
      </div>
    );
  }
  return (
    <div className="mt-6 rounded border border-[#1f242e] bg-[#0e1116] p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white">Profile completion</span>
        <span className="text-[#8c94a0]">{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1a1e26]">
        <div
          className="h-full rounded-full bg-white transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="mt-2 text-[11px] text-[#5c6574]">
          Still missing: {missing.join(', ')}.
        </p>
      )}
    </div>
  );
};

// --- Avatar ---

const AvatarCard: React.FC<{ user: User | null; onUserUpdated: (u: User) => void }> = ({
  user,
  onUserUpdated,
}) => {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.avatarKey) {
      setAvatarUrl(null);
      return;
    }
    api
      .get<{ url: string | null }>('/account/avatar-url')
      .then((r) => setAvatarUrl(r.url))
      .catch(() => setAvatarUrl(null));
  }, [user?.avatarKey]);

  const initials = (user?.stageName || user?.fullName || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleFile = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Please choose a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Images must be under 5 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { storageKey, uploadUrl } = await api.post<{ storageKey: string; uploadUrl: string }>(
        '/account/avatar/upload-url',
        { fileName: file.name, mimeType: file.type, fileSize: file.size },
      );
      const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putRes.ok) throw new Error('Upload failed. Try again.');
      const { user: updated } = await api.post<{ user: User }>('/account/avatar/complete', { storageKey });
      onUserUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload your photo. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const { user: updated } = await api.delete<{ user: User }>('/account/avatar');
      onUserUpdated(updated);
      setAvatarUrl(null);
    } catch {
      setError('Could not remove your photo. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4 rounded border border-[#1f242e] bg-[#0e1116] p-5">
      <h2 className="text-sm font-semibold text-white">Profile picture</h2>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[#262c36] bg-[#1a1e26]">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
              {initials}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded border border-[#2c3444] bg-[#141820] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#3d495c] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {user?.avatarKey ? 'Change photo' : 'Upload photo'}
          </button>
          {user?.avatarKey && (
            <button
              type="button"
              disabled={uploading}
              onClick={handleRemove}
              className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-[#8c94a0] transition-colors hover:text-red-300"
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
    </div>
  );
};

// --- Basic profile info (name, stage name, bio, phone) ---

const ProfileCard: React.FC<{ user: User | null; onUserUpdated: (u: User) => void }> = ({
  user,
  onUserUpdated,
}) => {
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [stageName, setStageName] = useState(user?.stageName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user?.fullName || '');
    setStageName(user?.stageName || '');
    setBio(user?.bio || '');
    setPhone(user?.phone || '');
  }, [user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { user: updated } = await api.patch<{ user: User }>('/account/profile', {
        fullName: fullName.trim(),
        stageName: stageName.trim() || null,
        bio: bio.trim() || null,
        phone: phone.trim() || null,
      });
      onUserUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="mt-4 rounded border border-[#1f242e] bg-[#0e1116] p-5">
      <h2 className="text-sm font-semibold text-white">Profile</h2>
      <p className="mt-1 text-xs text-[#8c94a0]">
        Your legal name is what appears on generated agreements; your stage name is what
        contributors see on invitations.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-[#8c94a0]">Full (legal) name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-[#8c94a0]">Stage / professional name</label>
          <input
            value={stageName}
            onChange={(e) => setStageName(e.target.value)}
            placeholder="Optional"
            className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs text-[#8c94a0]">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="A short bio — genre, background, what you're working on."
          className="w-full resize-none rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
        />
        <div className="mt-1 text-right text-[10px] text-[#5c6574]">{bio.length}/1000</div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs text-[#8c94a0]">WhatsApp number</label>
        <p className="mb-2 text-[11px] leading-relaxed text-[#5c6574]">
          Used for WhatsApp notifications when a contributor confirms a split or requests a
          change, alongside email. Optional.
        </p>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="082 123 4567"
          className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
        />
      </div>

      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded bg-white px-3.5 py-2 text-xs font-semibold text-[#0c0e12] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save profile
        </button>
        {saved && !error && <span className="text-xs text-emerald-300">Saved.</span>}
      </div>
    </form>
  );
};

// --- Social links ---

const SocialLinksCard: React.FC<{ user: User | null; onUserUpdated: (u: User) => void }> = ({
  user,
  onUserUpdated,
}) => {
  const [links, setLinks] = useState<Record<string, string>>((user?.socialLinks as Record<string, string>) || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLinks((user?.socialLinks as Record<string, string>) || {});
  }, [user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { user: updated } = await api.patch<{ user: User }>('/account/profile', { socialLinks: links });
      onUserUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your links. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="mt-4 rounded border border-[#1f242e] bg-[#0e1116] p-5">
      <h2 className="text-sm font-semibold text-white">Social links</h2>
      <p className="mt-1 text-xs text-[#8c94a0]">Shown alongside your profile where relevant.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SOCIAL_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1.5 block text-xs text-[#8c94a0]">{field.label}</label>
            <input
              value={links[field.key] || ''}
              onChange={(e) => setLinks((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-xs text-white outline-none focus:border-white/40"
            />
          </div>
        ))}
      </div>

      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded bg-white px-3.5 py-2 text-xs font-semibold text-[#0c0e12] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save links
        </button>
        {saved && !error && <span className="text-xs text-emerald-300">Saved.</span>}
      </div>
    </form>
  );
};

// --- Email ---

const EmailCard: React.FC<{ user: User | null; onUserUpdated: (u: User) => void }> = ({
  user,
  onUserUpdated,
}) => {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { user: updated } = await api.post<{ user: User }>('/account/email', {
        email: email.trim(),
        currentPassword,
      });
      onUserUpdated(updated);
      setEditing(false);
      setCurrentPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your email. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.post('/account/resend-verification');
      setResendSent(true);
    } catch {
      // Silently ignore — this is a low-stakes convenience action.
    }
  };

  return (
    <div className="mt-4 rounded border border-[#1f242e] bg-[#0e1116] p-5">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-[#8c94a0]" />
        <h2 className="text-sm font-semibold text-white">Email address</h2>
      </div>

      {!editing ? (
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-white">{user?.email}</div>
            {user?.emailVerifiedAt ? (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Verified
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-300">
                Not verified
                <button type="button" onClick={handleResend} className="underline hover:text-amber-200">
                  {resendSent ? 'Sent' : 'Resend link'}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-[#2c3444] bg-[#141820] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#3d495c]"
          >
            Change
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-3 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-[#8c94a0]">New email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[#8c94a0]">Current password (to confirm)</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
          </div>
          {error && <div className="text-xs text-red-300">{error}</div>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded bg-white px-3.5 py-2 text-xs font-semibold text-[#0c0e12] transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save email
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEmail(user?.email || '');
                setError(null);
              }}
              className="rounded border border-[#2c3444] px-3.5 py-2 text-xs text-[#8c94a0] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// --- Password ---

const PasswordCard: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/account/password', { currentPassword, newPassword });
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="mt-4 rounded border border-[#1f242e] bg-[#0e1116] p-5">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-[#8c94a0]" />
        <h2 className="text-sm font-semibold text-white">Password</h2>
      </div>
      <p className="mt-1 text-xs text-[#8c94a0]">
        Changing your password signs out every other device that's currently signed in.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs text-[#8c94a0]">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-[#8c94a0]">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
              className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[#8c94a0]">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
              className="w-full rounded border border-[#262c36] bg-[#0f1319] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
          </div>
        </div>
      </div>

      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded bg-white px-3.5 py-2 text-xs font-semibold text-[#0c0e12] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Change password
        </button>
        {saved && !error && <span className="text-xs text-emerald-300">Password changed.</span>}
      </div>
    </form>
  );
};

// --- Trust & security ---

const SecurityCard: React.FC = () => {
  const [status, setStatus] = useState<SecurityStatus | null>(null);

  useEffect(() => {
    api.get<SecurityStatus>('/account/security').then(setStatus).catch(() => undefined);
  }, []);

  if (!status) return null;

  const rows: Array<[string, string]> = [
    ['Password storage', status.passwordAlgorithm],
    ['Sessions', status.sessionModel],
    ['Document integrity', status.documentIntegrity],
    ['Audit trail', status.auditTrail],
    ['Sign-in rate limiting', status.rateLimited ? 'Enabled' : 'Not enabled'],
    ['Automated database backups', status.backupsConfigured ? 'Configured' : 'Not yet configured on this deployment'],
  ];

  return (
    <div className="mt-4 rounded border border-[#1f242e] bg-[#0e1116] p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[#8c94a0]" />
        <h2 className="text-sm font-semibold text-white">Trust &amp; security</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#8c94a0]">
        What this deployment actually does to protect your account and your evidence — not a
        marketing claim, a description of the code.
      </p>
      <dl className="mt-4 space-y-2.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4">
            <dt className="text-[#8c94a0]">{label}</dt>
            <dd className="text-right text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// --- Danger zone ---

const DangerZoneCard: React.FC<{ onAccountDeleted: () => void }> = ({ onAccountDeleted }) => {
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
    <div className="mt-6 rounded border border-red-500/20 bg-red-500/5 p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-300" />
        <h2 className="text-sm font-semibold text-white">Danger zone</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#8c94a0]">
        Permanently delete your account. If you're the sole member of your workspace, this also
        deletes every song, split, invitation, confirmation, agreement, document and audit event
        in it — this cannot be undone. If your workspace has other members, remove them or
        transfer ownership from the Team page first.
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
  );
};
