import { useEffect, useState } from 'react';
import { Activity, BookOpen, Code2, FolderGit2, GitBranch, Plus, Star, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { gitApi, type ShowcaseRepoResponse } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link } from '../lib/router';
import type { ActivityEventDoc, NotificationDoc, RepositoryDoc } from '../types/domain';

export function DashboardPage() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [myRepos, setMyRepos] = useState<RepositoryDoc[]>([]);
  const [showcase, setShowcase] = useState<ShowcaseRepoResponse[]>([]);
  const [activity, setActivity] = useState<ActivityEventDoc[]>([]);
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [showcaseRes, actList] = await Promise.all([
          gitApi.getShowcase().catch(() => ({ repositories: [] })),
          firestoreRepo.listPublicActivity(12).catch(() => []),
        ]);
        if (!active) return;
        setShowcase(Array.isArray(showcaseRes?.repositories) ? showcaseRes.repositories : []);
        setActivity(actList);

        if (firebaseUser) {
          const [owned, notifs] = await Promise.all([
            firestoreRepo.listUserRepositories(firebaseUser.uid),
            firestoreRepo.listNotifications(firebaseUser.uid),
          ]);
          if (!active) return;
          setMyRepos(owned);
          setNotifications(notifs.slice(0, 6));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  if (authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
          <div className="h-80 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
            {profile ? `Welcome back, ${profile.displayName}` : 'SOUL HUB Developer Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {profile
              ? `Signed in as @${profile.username} · ${myRepos.length} repositories · ${profile.followersCount} followers`
              : 'Sign in with Google to create repositories, commit code, and manage pull requests.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            to="/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Repository</span>
          </Link>
          <Link
            to="/editor"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Code2 className="w-4 h-4" />
            <span>Open Code Editor</span>
          </Link>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Your Repositories */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-blue-500" />
                <span>Your Repositories</span>
              </h2>
              <Link to="/new" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Create new
              </Link>
            </div>

            {!firebaseUser ? (
              <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400">Sign in to manage your personal and private Git repositories.</p>
                <Link
                  to="/login"
                  className="mt-3 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
                >
                  Sign in with Google
                </Link>
              </div>
            ) : myRepos.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400">You have not initialized any repositories yet.</p>
                <Link
                  to="/new"
                  className="mt-3 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
                >
                  Initialize First Repository
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {myRepos.map((repo) => (
                  <div key={repo.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        to={`/repo/${repo.ownerUsername}/${repo.slug}`}
                        className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-500 truncate block"
                      >
                        {repo.fullName}
                      </Link>
                      {repo.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{repo.description}</p>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 tabular-nums">
                      <span>{repo.visibility}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{repo.starsCount} stars</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Activity Feed */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-500" />
              <span>Platform Activity</span>
            </h2>
            {activity.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Recent repository creations, commits, pull requests, and deployments will appear here.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {activity.map((ev) => (
                  <div key={ev.id} className="py-3 flex items-start justify-between gap-4 text-sm">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">@{ev.actorUsername}</span>{' '}
                      <span className="text-slate-600 dark:text-slate-400">{ev.summary}</span>
                    </div>
                    {ev.repoFullName && (
                      <Link
                        to={`/repo/${ev.repoFullName}`}
                        className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        {ev.repoFullName}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Links */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Quick Shortcuts</h2>
            <div className="space-y-2 text-sm">
              <Link to="/orgs" className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300 hover:text-blue-500 py-1">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Organizations & Teams</span>
              </Link>
              <Link to="/settings/developer" className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300 hover:text-blue-500 py-1">
                <GitBranch className="w-4 h-4 text-slate-400" />
                <span>Git CLI Setup & Access Tokens</span>
              </Link>
              <Link to="/docs/api" className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300 hover:text-blue-500 py-1">
                <BookOpen className="w-4 h-4 text-slate-400" />
                <span>REST & Git HTTP API Reference</span>
              </Link>
            </div>
          </section>

          {/* Unread Notifications */}
          {firebaseUser && (
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h2>
                <Link to="/notifications" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  View all
                </Link>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">All caught up.</p>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((n) => (
                    <Link
                      key={n.id}
                      to={n.link || '/notifications'}
                      className="block p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-blue-500/40 text-xs"
                    >
                      <p className="font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                      {n.message && <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">{n.message}</p>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Trending Showcase */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Trending on SOUL HUB</h2>
              <Link to="/trending" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                More
              </Link>
            </div>
            <div className="space-y-3">
              {showcase.map((repo) => (
                <Link
                  key={repo.id}
                  to={`/repo/${repo.ownerUsername}/${repo.slug}`}
                  className="block p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{repo.fullName}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums shrink-0">
                      <Star className="w-3 h-3" />
                      {repo.starsCount}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{repo.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
