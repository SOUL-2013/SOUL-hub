import { useEffect, useState } from 'react';
import { Package, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { firestoreRepo } from '../lib/firestoreRepo';
import type { PackageDoc, RepositoryDoc } from '../types/domain';

export function PackagesPage() {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();

  const [packages, setPackages] = useState<PackageDoc[]>([]);
  const [userRepos, setUserRepos] = useState<RepositoryDoc[]>([]);
  const [queryText, setQueryText] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);

  const [pkgName, setPkgName] = useState('');
  const [pkgVersion, setPkgVersion] = useState('1.0.0');
  const [pkgRepoId, setPkgRepoId] = useState('');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgVisibility, setPkgVisibility] = useState<'public' | 'private'>('public');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const pub = await firestoreRepo.listPublicPackages();
        const combined = [...pub];
        if (firebaseUser) {
          const [ownedPkgs, repos] = await Promise.all([
            firestoreRepo.listPackagesByOwner(firebaseUser.uid).catch(() => []),
            firestoreRepo.listUserRepositories(firebaseUser.uid).catch(() => []),
          ]);
          ownedPkgs.forEach((p) => {
            if (!combined.some((x) => x.id === p.id)) combined.push(p);
          });
          setUserRepos(repos);
          if (repos[0]) setPkgRepoId(repos[0].id);
        }
        setPackages(combined);
      } catch (err) {
        pushToast({ type: 'error', title: 'Failed to load packages', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [firebaseUser?.uid]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !pkgRepoId) {
      pushToast({ type: 'info', title: 'Repository required', message: 'Create a repository first to link your package.' });
      return;
    }
    setBusy(true);
    try {
      const created = await firestoreRepo.createPackage({
        name: pkgName.trim(),
        version: pkgVersion.trim(),
        repoId: pkgRepoId,
        ownerId: firebaseUser.uid,
        ownerUsername: profile.username,
        description: pkgDesc.trim(),
        visibility: pkgVisibility,
      });
      setPackages((prev) => [created, ...prev]);
      setPublishOpen(false);
      setPkgName('');
      setPkgDesc('');
      pushToast({ type: 'success', title: 'Package published', message: `${created.name}@${created.version}` });
    } catch (err) {
      pushToast({ type: 'error', title: 'Publish failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (pkgId: string) => {
    try {
      await firestoreRepo.deletePackage(pkgId);
      setPackages((prev) => prev.filter((p) => p.id !== pkgId));
      pushToast({ type: 'success', title: 'Package removed' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Error' });
    }
  };

  const filtered = packages.filter((p) => {
    const q = queryText.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || p.ownerUsername.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white">Package Registry</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Publish and track versioned developer packages linked to SOUL HUB repositories.
          </p>
        </div>
        {firebaseUser && (
          <button
            type="button"
            onClick={() => setPublishOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Publish Package</span>
          </button>
        )}
      </div>

      {publishOpen && (
        <form onSubmit={handlePublish} className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <h2 className="text-base font-semibold">Register Package Release</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              placeholder="@soul-labs/ui-kit"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm font-mono"
            />
            <input
              type="text"
              required
              value={pkgVersion}
              onChange={(e) => setPkgVersion(e.target.value)}
              placeholder="1.0.0"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm font-mono"
            />
            <select
              value={pkgVisibility}
              onChange={(e) => setPkgVisibility(e.target.value as 'public' | 'private')}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <select
            value={pkgRepoId}
            onChange={(e) => setPkgRepoId(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          >
            {userRepos.length === 0 ? (
              <option value="">Create a repository first</option>
            ) : (
              userRepos.map((r) => (
                <option key={r.id} value={r.id}>
                  Link to repository: {r.fullName}
                </option>
              ))
            )}
          </select>
          <input
            type="text"
            value={pkgDesc}
            onChange={(e) => setPkgDesc(e.target.value)}
            placeholder="Package summary..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          />
          <button type="submit" disabled={busy || userRepos.length === 0} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-50">
            {busy ? 'Publishing...' : 'Publish Package'}
          </button>
        </form>
      )}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="search"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Filter packages by name or maintainer..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D111A] text-sm"
        />
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-10 text-center text-sm text-slate-500">
          No packages published matching your query yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((pkg) => (
            <div key={pkg.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  <h2 className="font-mono font-semibold text-sm text-slate-950 dark:text-white">{pkg.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">v{pkg.version}</span>
                  {firebaseUser?.uid === pkg.ownerId && (
                    <button
                      type="button"
                      aria-label={`Delete ${pkg.name}`}
                      onClick={() => void handleDelete(pkg.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{pkg.description || 'No description provided.'}</p>
              <p className="text-xs text-slate-500">
                @{pkg.ownerUsername} · {pkg.visibility} · {pkg.downloadsCount} downloads
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
