import { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  Code2,
  Copy,
  Download,
  GitBranch,
  GitFork,
  GitPullRequest,
  Globe,
  History,
  Kanban,
  MessageSquare,
  PlayCircle,
  Settings,
  Shield,
  Star,
  Tag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { gitApi, type GitBranchInfo, type GitCommitInfo, type GitTagInfo, type GitTreeEntry } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import { slugifyRepoName } from '../lib/validation';
import type { RepositoryDoc } from '../types/domain';
import { RepoOverviewTab } from './repo/RepoOverviewTab';
import { RepoCodeView } from './repo/RepoCodeView';
import { RepoCommitsTab } from './repo/RepoCommitsTab';
import { RepoIssuesTab } from './repo/RepoIssuesTab';
import { RepoPullRequestsTab } from './repo/RepoPullRequestsTab';
import { RepoAutomationDeployTab } from './repo/RepoAutomationDeployTab';

export type RepoSubTab =
  | 'overview'
  | 'code'
  | 'commits'
  | 'branches'
  | 'tags'
  | 'issues'
  | 'projects'
  | 'discussions'
  | 'pulls'
  | 'automation'
  | 'releases'
  | 'security'
  | 'settings';

export function RepoLayout({
  owner,
  slug,
  subtab,
}: {
  owner: string;
  slug: string;
  subtab: RepoSubTab;
}) {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();
  const { navigate } = useRouter();

  const [repo, setRepo] = useState<RepositoryDoc | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [tags, setTags] = useState<GitTagInfo[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [entries, setEntries] = useState<GitTreeEntry[]>([]);
  const [langStats, setLangStats] = useState<{ totalBytes: number; languages: Array<{ language: string; bytes: number; percentage: number }> }>({
    totalBytes: 0,
    languages: [],
  });
  const [protectedBranches, setProtectedBranches] = useState<string[]>([]);
  const [activeRef, setActiveRef] = useState('main');
  const [starred, setStarred] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [copiedClone, setCopiedClone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const loadRepo = async (refOverride?: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      let found: RepositoryDoc | null = null;
      const showcaseRes = await gitApi.getShowcase().catch(() => ({ repositories: [] }));
      const showcaseMatch = showcaseRes.repositories.find((r) => r.ownerUsername === owner && r.slug === slug);
      if (showcaseMatch) {
        found = { ...showcaseMatch, isArchived: false, isShowcase: true };
      }

      if (!found && firebaseUser) {
        found = await firestoreRepo.findOwnedRepositoryByFullName(firebaseUser.uid, owner, slug);
      }
      if (!found) {
        found = await firestoreRepo.findRepositoryByFullName(owner, slug);
      }

      if (!found) {
        setRepo(null);
        setErrorMsg('Repository not found or access denied.');
        setLoading(false);
        return;
      }

      setRepo(found);
      const targetRef = refOverride || found.defaultBranch || 'main';
      setActiveRef(targetRef);

      const summary = await gitApi.getSummary(owner, slug, targetRef);
      setBranches(summary.branches);
      setTags(summary.tags);
      setCommits(summary.commits);
      setEntries(summary.entries);
      setLangStats(summary.langStats);
      setProtectedBranches(summary.manifest.protectedBranches || []);

      if (firebaseUser && !found.isShowcase) {
        const [isSt, bms] = await Promise.all([
          firestoreRepo.hasStarred(found.id, firebaseUser.uid),
          firestoreRepo.listUserBookmarks(firebaseUser.uid),
        ]);
        setStarred(isSt);
        setBookmarked(bms.includes(found.id));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load repository.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRepo();
  }, [owner, slug, firebaseUser?.uid]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
        <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
        <div className="h-96 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  if (!repo || errorMsg) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Repository Unavailable</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{errorMsg || 'This repository could not be found.'}</p>
        <Link to="/explore" className="mt-6 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
          Explore Public Repositories
        </Link>
      </div>
    );
  }

  const isOwner = Boolean(firebaseUser && (repo.ownerId === firebaseUser.uid));
  const cloneUrl = `${window.location.origin}/git/${owner}/${slug}.git`;

  const handleStar = async () => {
    if (!firebaseUser || repo.isShowcase) {
      pushToast({
        type: 'info',
        title: repo.isShowcase ? 'Showcase repository' : 'Sign in required',
        message: repo.isShowcase ? 'Fork or create your own repository to star Firestore-tracked projects.' : 'Sign in to star repositories.',
      });
      return;
    }
    const next = await firestoreRepo.toggleStar(repo.id, firebaseUser.uid);
    setStarred(next);
    setRepo((prev) => (prev ? { ...prev, starsCount: Math.max(0, prev.starsCount + (next ? 1 : -1)) } : prev));
  };

  const handleBookmark = async () => {
    if (!firebaseUser || repo.isShowcase) {
      pushToast({ type: 'info', title: 'Sign in required', message: 'Sign in on user-created repositories to save bookmarks.' });
      return;
    }
    const next = await firestoreRepo.toggleBookmark(repo.id, firebaseUser.uid);
    setBookmarked(next);
    pushToast({ type: 'success', title: next ? 'Bookmarked' : 'Removed bookmark' });
  };

  const handleFork = async () => {
    if (!firebaseUser || !profile) {
      pushToast({ type: 'info', title: 'Sign in required', message: 'Sign in to fork repositories into your account.' });
      return;
    }
    try {
      const dstSlug = slugifyRepoName(`${slug}-fork`) || slug;
      const dstRepoId = `repo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await gitApi.forkRepo({
        srcOwner: owner,
        srcRepo: slug,
        dstOwner: profile.username,
        dstRepo: dstSlug,
        dstRepoId,
      });
      await firestoreRepo.createRepository({
        id: dstRepoId,
        ownerId: firebaseUser.uid,
        ownerUsername: profile.username,
        name: `${repo.name} (Fork)`,
        slug: dstSlug,
        fullName: `${profile.username}/${dstSlug}`,
        description: repo.description || '',
        visibility: repo.visibility,
        defaultBranch: repo.defaultBranch,
        topics: repo.topics || [],
        license: repo.license || '',
        primaryLanguage: repo.primaryLanguage || 'TypeScript',
        forkedFrom: repo.fullName,
      });
      pushToast({ type: 'success', title: 'Repository forked', message: `Cloned to ${profile.username}/${dstSlug}` });
      navigate(`/repo/${profile.username}/${dstSlug}`);
    } catch (err) {
      pushToast({ type: 'error', title: 'Fork failed', message: err instanceof Error ? err.message : 'Unable to fork.' });
    }
  };

  const tabs: Array<{ key: RepoSubTab; label: string; path: string; icon: typeof Code2 }> = [
    { key: 'overview', label: 'Code', path: `/repo/${owner}/${slug}`, icon: Code2 },
    { key: 'commits', label: 'Commits', path: `/repo/${owner}/${slug}/commits`, icon: History },
    { key: 'branches', label: 'Branches', path: `/repo/${owner}/${slug}/branches`, icon: GitBranch },
    { key: 'issues', label: 'Issues', path: `/repo/${owner}/${slug}/issues`, icon: MessageSquare },
    { key: 'pulls', label: 'Pull Requests', path: `/repo/${owner}/${slug}/pulls`, icon: GitPullRequest },
    { key: 'projects', label: 'Projects', path: `/repo/${owner}/${slug}/projects`, icon: Kanban },
    { key: 'discussions', label: 'Discussions', path: `/repo/${owner}/${slug}/discussions`, icon: MessageSquare },
    { key: 'automation', label: 'CI/CD & Deploy', path: `/repo/${owner}/${slug}/deploy`, icon: PlayCircle },
    { key: 'releases', label: 'Releases', path: `/repo/${owner}/${slug}/releases`, icon: Tag },
    { key: 'security', label: 'Security', path: `/repo/${owner}/${slug}/security`, icon: Shield },
    ...(isOwner ? [{ key: 'settings' as RepoSubTab, label: 'Settings', path: `/repo/${owner}/${slug}/settings`, icon: Settings }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Repository Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-lg font-display font-bold text-slate-950 dark:text-white">
            <Link to={`/u/${owner}`} className="text-blue-600 dark:text-blue-400 hover:underline">
              {owner}
            </Link>
            <span className="text-slate-400">/</span>
            <span>{slug}</span>
            <span className="text-xs font-normal font-mono text-slate-500 ml-2">
              {repo.visibility}{repo.isArchived ? ' · archived' : ''}
            </span>
          </div>
          {repo.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{repo.description}</p>}
          {repo.liveUrl && (
            <a
              href={repo.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live Deployed Site: {repo.liveUrl}</span>
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleStar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
          >
            <Star className={`w-3.5 h-3.5 ${starred ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>{starred ? 'Starred' : 'Star'}</span>
            <span className="text-slate-500">{repo.starsCount}</span>
          </button>

          <button
            type="button"
            onClick={handleFork}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Fork</span>
            <span className="text-slate-500">{repo.forksCount}</span>
          </button>

          {!repo.isShowcase && (
            <button
              type="button"
              onClick={handleBookmark}
              aria-label="Bookmark repository"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-blue-500 text-blue-500' : ''}`} />
              <span>{bookmarked ? 'Saved' : 'Save'}</span>
            </button>
          )}

          {isOwner && (
            <Link
              to={`/repo/${owner}/${slug}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 whitespace-nowrap"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Open in Editor</span>
            </Link>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setCloneOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <span>Clone / ZIP</span>
            </button>
            {cloneOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] shadow-xl p-4 z-30 space-y-3">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Clone over Smart HTTP</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={cloneUrl}
                    className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
                  />
                  <button
                    type="button"
                    aria-label="Copy clone URL"
                    onClick={() => {
                      void navigator.clipboard.writeText(`git clone ${cloneUrl}`);
                      setCopiedClone(true);
                      setTimeout(() => setCopiedClone(false), 1800);
                    }}
                    className="p-2 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {copiedClone ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  For private repos or <code className="font-mono">git push</code>, generate a Personal Access Token in Developer Settings.
                </p>
                <a
                  href={`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/archive/${encodeURIComponent(activeRef)}.zip`}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download ZIP ({activeRef})</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Repository Tab Bar */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-px" aria-label="Repository sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active =
            subtab === t.key ||
            (t.key === 'overview' && subtab === 'code') ||
            (t.key === 'branches' && subtab === 'tags');
          return (
            <Link
              key={t.key}
              to={t.path}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Active Tab Content */}
      {subtab === 'overview' && (
        <RepoOverviewTab
          repo={repo}
          branches={branches}
          tags={tags}
          commits={commits}
          entries={entries}
          langStats={langStats}
          activeRef={activeRef}
          isOwner={isOwner}
          onChangeRef={(r) => void loadRepo(r)}
          onReload={() => void loadRepo(activeRef)}
        />
      )}
      {subtab === 'code' && (
        <RepoCodeView
          repo={repo}
          branches={branches}
          activeRef={activeRef}
          isOwner={isOwner}
          onChangeRef={(r) => void loadRepo(r)}
          onReload={() => void loadRepo(activeRef)}
        />
      )}
      {(subtab === 'commits' || subtab === 'branches' || subtab === 'tags') && (
        <RepoCommitsTab
          repo={repo}
          mode={subtab}
          branches={branches}
          tags={tags}
          commits={commits}
          protectedBranches={protectedBranches}
          activeRef={activeRef}
          isOwner={isOwner}
          onChangeRef={(r) => void loadRepo(r)}
          onReload={() => void loadRepo(activeRef)}
        />
      )}
      {(subtab === 'issues' || subtab === 'projects' || subtab === 'discussions') && (
        <RepoIssuesTab repo={repo} mode={subtab} isOwner={isOwner} />
      )}
      {subtab === 'pulls' && (
        <RepoPullRequestsTab
          repo={repo}
          branches={branches}
          isOwner={isOwner}
          onMerged={() => void loadRepo(activeRef)}
        />
      )}
      {(subtab === 'automation' || subtab === 'releases' || subtab === 'security' || subtab === 'settings') && (
        <RepoAutomationDeployTab
          repo={repo}
          mode={subtab}
          branches={branches}
          tags={tags}
          commits={commits}
          langStats={langStats}
          protectedBranches={protectedBranches}
          isOwner={isOwner}
          onReload={() => void loadRepo(activeRef)}
        />
      )}
    </div>
  );
}
