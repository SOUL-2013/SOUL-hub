import { useEffect, useState } from 'react';
import { Bell, Bookmark, Check, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link } from '../lib/router';
import type { NotificationDoc, RepositoryDoc } from '../types/domain';

export function NotificationsPage() {
  const { firebaseUser } = useAuth();
  const { pushToast } = useToast();
  const [items, setItems] = useState<NotificationDoc[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) {
      setLoading(false);
      return;
    }
    firestoreRepo
      .listNotifications(firebaseUser.uid)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [firebaseUser?.uid]);

  if (!firebaseUser) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-slate-500">Sign in to view activity notifications and review mentions.</p>
        <Link to="/login" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          Sign in
        </Link>
      </div>
    );
  }

  const visible = items.filter((n) => filter === 'all' || !n.isRead);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" />
            <span>Notification Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Stars, forks, organization invites, and repository mentions.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-lg ${filter === 'unread' ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
          >
            Unread ({items.filter((i) => !i.isRead).length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-10 text-center text-sm text-slate-500">
          Your inbox is caught up.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] divide-y divide-slate-200 dark:divide-slate-800">
          {visible.map((n) => (
            <div key={n.id} className={`p-4 flex items-center justify-between gap-4 ${n.isRead ? 'opacity-70' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase text-blue-500">{n.type}</span>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</h2>
                </div>
                {n.message && <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>}
                {n.link && (
                  <Link to={n.link} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block">
                    Open context →
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!n.isRead && (
                  <button
                    type="button"
                    aria-label="Mark as read"
                    onClick={async () => {
                      await firestoreRepo.markNotificationRead(n.id, true);
                      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
                      pushToast({ type: 'success', title: 'Marked read' });
                    }}
                    className="p-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Delete notification"
                  onClick={async () => {
                    await firestoreRepo.deleteNotification(n.id);
                    setItems((prev) => prev.filter((x) => x.id !== n.id));
                  }}
                  className="p-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BookmarksPage() {
  const { firebaseUser } = useAuth();
  const [repos, setRepos] = useState<RepositoryDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!firebaseUser) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [ids, pubRepos, ownedRepos] = await Promise.all([
          firestoreRepo.listUserBookmarks(firebaseUser.uid),
          firestoreRepo.listPublicRepositories(100),
          firestoreRepo.listUserRepositories(firebaseUser.uid),
        ]);
        const all = [...pubRepos, ...ownedRepos];
        const unique = new Map<string, RepositoryDoc>();
        for (const r of all) {
          if (ids.includes(r.id)) unique.set(r.id, r);
        }
        setRepos(Array.from(unique.values()));
      } catch {
        setRepos([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [firebaseUser?.uid]);

  if (!firebaseUser) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-bold">Saved Bookmarks</h1>
        <p className="text-sm text-slate-500">Sign in to bookmark repositories for quick access.</p>
        <Link to="/login" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-blue-500" />
          <span>Bookmarked Repositories</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Saved repositories across your SOUL HUB workspace.</p>
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      ) : repos.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-10 text-center text-sm text-slate-500">
          No bookmarked repositories yet. Click <strong>Save</strong> on any repository header to add it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repos.map((r) => (
            <Link
              key={r.id}
              to={`/repo/${r.ownerUsername}/${r.slug}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 hover:border-blue-500/50 transition-colors block space-y-2"
            >
              <h2 className="font-mono font-semibold text-sm text-blue-600 dark:text-blue-400">{r.fullName}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">{r.description || 'No description.'}</p>
              <p className="text-xs text-slate-500 tabular-nums">
                {r.primaryLanguage || 'Text'} · {r.starsCount} stars · {r.forksCount} forks
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
