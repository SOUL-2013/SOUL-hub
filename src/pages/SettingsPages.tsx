import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Moon,
  Palette,
  Shield,
  Sun,
  Terminal,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { accountApi } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import { formatBytes } from '../lib/validation';

export type SettingsTab = 'account' | 'appearance' | 'security' | 'developer';

export function SettingsPages({ tab }: { tab: SettingsTab }) {
  const { firebaseUser, profile, privateUser, refreshProfile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { pushToast } = useToast();
  const { navigate } = useRouter();

  // Account fields
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [company, setCompany] = useState(profile?.company || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [website, setWebsite] = useState(profile?.website || '');
  const [statusText, setStatusText] = useState(profile?.statusText || '');
  const [profileReadme, setProfileReadme] = useState(profile?.profileReadme || '');
  const [isPrivateProfile, setIsPrivateProfile] = useState(Boolean(profile?.isPrivateProfile));
  const [emailNotifications, setEmailNotifications] = useState(Boolean(privateUser?.emailNotifications ?? true));
  const [securityAlerts, setSecurityAlerts] = useState(Boolean(privateUser?.securityAlerts ?? true));

  // Storage & PATs
  const [usage, setUsage] = useState<{ usedBytes: number; quotaLimitBytes: number; maxFileBytes: number }>({
    usedBytes: privateUser?.storageUsedBytes || 0,
    quotaLimitBytes: privateUser?.quotaLimitBytes || 52428800,
    maxFileBytes: 5242880,
  });
  const [tokens, setTokens] = useState<Array<{ id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null }>>([]);
  const [tokenName, setTokenName] = useState('');
  const [newRawToken, setNewRawToken] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);

  // Block/Mute & Delete
  const [blockUidInput, setBlockUidInput] = useState('');
  const [muteUidInput, setMuteUidInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setBio(profile.bio || '');
      setCompany(profile.company || '');
      setLocation(profile.location || '');
      setWebsite(profile.website || '');
      setStatusText(profile.statusText || '');
      setProfileReadme(profile.profileReadme || '');
      setIsPrivateProfile(Boolean(profile.isPrivateProfile));
    }
    if (privateUser) {
      setEmailNotifications(privateUser.emailNotifications ?? true);
      setSecurityAlerts(privateUser.securityAlerts ?? true);
    }
  }, [profile, privateUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    accountApi.getStorageUsage().then(setUsage).catch(() => {});
    if (tab === 'developer') {
      accountApi.listTokens().then((res) => setTokens(res.tokens)).catch(() => {});
    }
  }, [firebaseUser?.uid, tab]);

  if (!firebaseUser || !profile) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Sign in with your developer account to configure profile, appearance, security, and Git tokens.</p>
        <Link to="/login" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          Sign in
        </Link>
      </div>
    );
  }

  const navTabs: Array<{ key: SettingsTab; label: string; path: string; icon: typeof UserIcon }> = [
    { key: 'account', label: 'Account & Profile', path: '/settings/account', icon: UserIcon },
    { key: 'appearance', label: 'Appearance', path: '/settings/appearance', icon: Palette },
    { key: 'security', label: 'Security & Privacy', path: '/settings/security', icon: Shield },
    { key: 'developer', label: 'Developer Tokens & Git CLI', path: '/settings/developer', icon: KeyRound },
  ];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await firestoreRepo.updatePublicProfile(firebaseUser.uid, {
        displayName: displayName.trim() || profile.username,
        bio: bio.trim(),
        company: company.trim(),
        location: location.trim(),
        website: website.trim(),
        statusText: statusText.trim(),
        profileReadme,
        isPrivateProfile,
      });
      await refreshProfile();
      pushToast({ type: 'success', title: 'Profile updated' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'avatarUrl' | 'coverUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const res = await accountApi.uploadFile(file, field === 'avatarUrl' ? 'avatars' : 'covers');
      await firestoreRepo.updatePublicProfile(firebaseUser.uid, { [field]: res.url });
      await refreshProfile();
      const updatedUsage = await accountApi.getStorageUsage();
      setUsage(updatedUsage);
      pushToast({ type: 'success', title: field === 'avatarUrl' ? 'Avatar updated' : 'Cover image updated' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Upload failed', message: err instanceof Error ? err.message : 'Upload rejected' });
    } finally {
      setBusy(false);
    }
  };

  const handleExportAccount = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      platform: 'SOUL HUB',
      profile,
      preferences: {
        email: privateUser?.email,
        emailNotifications: privateUser?.emailNotifications,
        securityAlerts: privateUser?.securityAlerts,
        themePreference: theme,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soulhub-${profile.username}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) return;
    setBusy(true);
    try {
      const res = await accountApi.createToken(tokenName.trim(), profile.username);
      setNewRawToken(res.rawToken);
      setTokens((prev) => [{ ...res.record, lastUsedAt: null }, ...prev]);
      setTokenName('');
      pushToast({ type: 'success', title: 'Personal Access Token created', message: 'Copy it now — it will not be displayed again.' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Token creation failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setBusy(true);
    try {
      await firestoreRepo.deleteAccountData(firebaseUser.uid, profile.username);
      await signOut();
      pushToast({ type: 'success', title: 'Account data deleted' });
      navigate('/');
    } catch (err) {
      pushToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
      <aside className="lg:col-span-3 space-y-1">
        <h1 className="text-lg font-display font-bold px-3 pb-3">Settings</h1>
        {navTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              to={t.path}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-blue-600/12 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </aside>

      <div className="lg:col-span-9 space-y-6">
        {tab === 'account' && (
          <>
            <form onSubmit={handleSaveProfile} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold">Developer Profile</h2>
                  <p className="text-xs text-slate-500">Username: <span className="font-mono">@{profile.username}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Avatar</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handleImageUpload(e, 'avatarUrl')} />
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Cover</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handleImageUpload(e, 'coverUrl')} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Developer Status</label>
                  <input
                    type="text"
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    placeholder="Shipping distributed Git engines"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Company / Lab</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Biography</label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Profile README (Markdown)</label>
                <textarea
                  rows={5}
                  value={profileReadme}
                  onChange={(e) => setProfileReadme(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={isPrivateProfile} onChange={(e) => setIsPrivateProfile(e.target.checked)} />
                <span>Private profile (hide profile page from public discovery)</span>
              </label>

              <div>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
                  {busy ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>

            {/* Free-tier Storage Quota + Export + Delete */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between text-xs font-medium mb-2">
                  <span>Object Storage Quota (Free Tier: 50 MB / user, 5 MB / file)</span>
                  <span className="font-mono tabular-nums">{formatBytes(usage.usedBytes)} / {formatBytes(usage.quotaLimitBytes)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${Math.min(100, Math.round((usage.usedBytes / Math.max(1, usage.quotaLimitBytes)) * 100))}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-sm font-medium">Export Account Data</p>
                  <p className="text-xs text-slate-500">Download a portable JSON snapshot of your profile and preferences.</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportAccount}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete Account</p>
                    <p className="text-xs text-slate-500">Removes your SOUL HUB profile, private preferences, and releases your username.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen((v) => !v)}
                    className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-medium"
                  >
                    Delete Account
                  </button>
                </div>
                {deleteOpen && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder='Type "DELETE" to confirm'
                      className="flex-1 px-3 py-1.5 rounded border border-red-500/40 bg-white dark:bg-[#07090F] text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={deleteConfirm !== 'DELETE' || busy}
                      onClick={() => void handleDeleteAccount()}
                      className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-medium disabled:opacity-40"
                    >
                      Permanently Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'appearance' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold">Theme & Interface</h2>
              <p className="text-xs text-slate-500 mt-1">Default midnight dark surface with optional high-contrast light mode.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={async () => {
                  setTheme('dark');
                  await firestoreRepo.updatePrivateUser(firebaseUser.uid, { themePreference: 'dark' }).catch(() => {});
                }}
                className={`p-4 rounded-xl border text-left space-y-2 ${
                  theme === 'dark' ? 'border-blue-500 bg-blue-600/10' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Moon className="w-4 h-4 text-blue-500" />
                  <span>Midnight Dark (Default)</span>
                </div>
                <p className="text-xs text-slate-500">Deep obsidian #07090F canvas with luminous blue/violet accents.</p>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setTheme('light');
                  await firestoreRepo.updatePrivateUser(firebaseUser.uid, { themePreference: 'light' }).catch(() => {});
                }}
                className={`p-4 rounded-xl border text-left space-y-2 ${
                  theme === 'light' ? 'border-blue-500 bg-blue-600/10' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Daylight Slate</span>
                </div>
                <p className="text-xs text-slate-500">Crisp high-contrast light surface for bright workspaces.</p>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-semibold">Notification Preferences</h3>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={async (e) => {
                    setEmailNotifications(e.target.checked);
                    await firestoreRepo.updatePrivateUser(firebaseUser.uid, { emailNotifications: e.target.checked });
                    pushToast({ type: 'success', title: 'Preferences saved' });
                  }}
                />
                <span>Receive issue & pull request notification digests</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={securityAlerts}
                  onChange={async (e) => {
                    setSecurityAlerts(e.target.checked);
                    await firestoreRepo.updatePrivateUser(firebaseUser.uid, { securityAlerts: e.target.checked });
                    pushToast({ type: 'success', title: 'Preferences saved' });
                  }}
                />
                <span>Receive security & token access alerts</span>
              </label>
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
              <h2 className="text-base font-semibold">Authentication & Active Session</h2>
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <p>Primary Email: <span className="font-mono text-slate-900 dark:text-slate-200">{firebaseUser.email}</span></p>
                <p>Verification Status: {firebaseUser.emailVerified ? 'Verified via Identity Provider' : 'Unverified'}</p>
                <p>Last Sign-In: <span className="font-mono">{firebaseUser.metadata.lastSignInTime || 'Current session'}</span></p>
                <p className="pt-2 text-slate-500">
                  Two-factor authentication (2FA / Passkeys) is enforced directly by your Google Workspace or Google Identity account security policy.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
              >
                Sign out of current session
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
              <h2 className="text-base font-semibold">Blocked & Muted Users</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <p className="font-medium">Blocked UIDs / Usernames ({privateUser?.blockedUserIds?.length || 0})</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={blockUidInput}
                      onChange={(e) => setBlockUidInput(e.target.value)}
                      placeholder="username or uid"
                      className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!blockUidInput.trim()) return;
                        const next = Array.from(new Set([...(privateUser?.blockedUserIds || []), blockUidInput.trim()]));
                        await firestoreRepo.updatePrivateUser(firebaseUser.uid, { blockedUserIds: next });
                        await refreshProfile();
                        setBlockUidInput('');
                        pushToast({ type: 'success', title: 'User blocked' });
                      }}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white"
                    >
                      Block
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="font-medium">Muted UIDs / Usernames ({privateUser?.mutedUserIds?.length || 0})</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={muteUidInput}
                      onChange={(e) => setMuteUidInput(e.target.value)}
                      placeholder="username or uid"
                      className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!muteUidInput.trim()) return;
                        const next = Array.from(new Set([...(privateUser?.mutedUserIds || []), muteUidInput.trim()]));
                        await firestoreRepo.updatePrivateUser(firebaseUser.uid, { mutedUserIds: next });
                        await refreshProfile();
                        setMuteUidInput('');
                        pushToast({ type: 'success', title: 'User muted' });
                      }}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white"
                    >
                      Mute
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'developer' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
              <h2 className="text-base font-semibold">Personal Access Tokens (Git Smart HTTP)</h2>
              <p className="text-xs text-slate-500">
                Tokens are HMAC-SHA256 hashed on the server. Use your token as the password when pushing over HTTPS.
              </p>

              <form onSubmit={handleCreateToken} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  required
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Token label (e.g. MacBook Pro Git CLI)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
                />
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
                  Generate Token
                </button>
              </form>

              {newRawToken && (
                <div className="p-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 space-y-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Copy your Personal Access Token now — it cannot be retrieved again:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto">
                      {newRawToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(newRawToken);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 1800);
                      }}
                      className="p-2 rounded border border-emerald-500/40 text-emerald-500"
                      aria-label="Copy token"
                    >
                      {copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {tokens.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">No active Personal Access Tokens.</p>
                ) : (
                  tokens.map((tok) => (
                    <div key={tok.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{tok.name}</p>
                        <p className="font-mono text-slate-500">{tok.prefix}… · {tok.scopes.join(', ')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await accountApi.revokeToken(tok.id);
                          setTokens((prev) => prev.filter((t) => t.id !== tok.id));
                          pushToast({ type: 'success', title: 'Token revoked' });
                        }}
                        className="inline-flex items-center gap-1 text-red-500 hover:underline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-500" />
                <span>Git CLI Setup Guide</span>
              </h2>
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed">
{`# Clone a repository over SOUL HUB Smart HTTP
git clone ${window.location.origin}/git/${profile.username}/<repo-slug>.git

# Push local commits using your username + Personal Access Token
git remote add origin ${window.location.origin}/git/${profile.username}/<repo-slug>.git
git push -u origin main`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
