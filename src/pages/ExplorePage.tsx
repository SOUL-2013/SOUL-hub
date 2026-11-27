import { useEffect, useState } from 'react';
import { Code2, Search, Star, TrendingUp, Users } from 'lucide-react';
import { gitApi, type ShowcaseRepoResponse } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import type { PublicProfile, RepositoryDoc } from '../types/domain';

export function ExplorePage({ mode }: { mode: 'explore' | 'trending' | 'search' }) {
  const { search } = useRouter();
  const initialQ = new URLSearchParams(search).get('q') || '';
  const [queryText, setQueryText] = useState(initialQ);
  const [tab, setTab] = useState<'repos' | 'code' | 'developers'>(mode === 'search' && initialQ ? 'repos' : 'repos');
  const [languageFilter, setLanguageFilter] = useState('All');
  const [repos, setRepos] = useState<RepositoryDoc[]>([]);
  const [developers, setDevelopers] = useState<PublicProfile[]>([]);
  const [codeResults, setCodeResults] = useState<Array<{ fullName: string; path: string; lineNumber: number; text: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQueryText(new URLSearchParams(search).get('q') || '');
  }, [search]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [showcaseRes, firestoreRepos, profiles] = await Promise.all([
          gitApi.getShowcase(),
          firestoreRepo.listPublicRepositories(50).catch(() => []),
          firestoreRepo.listPublicProfiles(30).catch(() => []),
        ]);
        if (!active) return;

        const merged = new Map<string, RepositoryDoc>();
        showcaseRes.repositories.forEach((s: ShowcaseRepoResponse) => {
          merged.set(s.fullName, { ...s, isArchived: false, isShowcase: true });
        });
        firestoreRepos.forEach((r) => {
          merged.set(r.fullName, r);
        });
        setRepos(Array.from(merged.values()));
        setDevelopers(profiles);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (queryText.trim().length < 2) {
      setCodeResults([]);
      return;
    }
    const timer = setTimeout(() => {
      gitApi
        .globalCodeSearch(queryText.trim())
        .then((res) => setCodeResults(res.results))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [queryText]);

  const q = queryText.trim().toLowerCase();
  const languages = ['All', ...Array.from(new Set(repos.map((r) => r.primaryLanguage).filter(Boolean) as string[]))];

  const filteredRepos = repos
    .filter((r) => {
      if (languageFilter !== 'All' && r.primaryLanguage !== languageFilter) return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.topics || []).some((t) => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => (mode === 'trending' ? b.starsCount - a.starsCount : 0));

  const filteredDevelopers = developers.filter((d) => {
    if (!q) return true;
    return d.username.toLowerCase().includes(q) || d.displayName.toLowerCase().includes(q) || (d.bio || '').toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white flex items-center gap-2.5">
            {mode === 'trending' && <TrendingUp className="w-6 h-6 text-blue-500" />}
            <span>{mode === 'trending' ? 'Trending Repositories' : mode === 'search' ? 'Global Search' : 'Explore SOUL HUB'}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Search public Git repositories, real source code lines, and developer profiles.
          </p>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search repositories, code, or developers"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Filter by repository, topic, or code snippet..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D111A] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filter & Tab Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0D111A] rounded-lg border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('repos')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'repos' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Repositories ({filteredRepos.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('code')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'code' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Code Matches ({codeResults.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('developers')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'developers' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Developers ({filteredDevelopers.length})
          </button>
        </div>

        {tab === 'repos' && (
          <div className="flex items-center gap-2">
            <label htmlFor="lang-filter" className="text-xs text-slate-500">
              Language:
            </label>
            <select
              id="lang-filter"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D111A] text-xs text-slate-800 dark:text-slate-200"
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : tab === 'repos' ? (
        filteredRepos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">No repositories matched your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredRepos.map((repo) => (
              <Link
                key={repo.fullName}
                to={`/repo/${repo.ownerUsername}/${repo.slug}`}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 hover:border-blue-500/60 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{repo.fullName}</h2>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums shrink-0">
                      <Star className="w-3.5 h-3.5" />
                      {repo.starsCount}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {repo.description || 'No description provided.'}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{repo.primaryLanguage || 'Git'}</span>
                  {repo.license && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{repo.license}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{repo.forksCount} forks</span>
                  {repo.topics?.slice(0, 3).map((t) => (
                    <span key={t}>· #{t}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )
      ) : tab === 'code' ? (
        <div className="space-y-3">
          {queryText.trim().length < 2 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
              Enter at least 2 characters in the search bar to run a real-time <code className="font-mono">git grep</code> across hosted repositories.
            </div>
          ) : codeResults.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
              No source code lines matched "{queryText}".
            </div>
          ) : (
            codeResults.map((match, idx) => (
              <Link
                key={`${match.fullName}-${match.path}-${match.lineNumber}-${idx}`}
                to={`/repo/${match.fullName}/code?path=${encodeURIComponent(match.path)}&line=${match.lineNumber}`}
                className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 hover:border-blue-500/60 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Code2 className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{match.fullName}</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-mono">{match.path}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Line {match.lineNumber}</span>
                </div>
                <pre className="mt-2 font-mono text-xs text-slate-700 dark:text-slate-300 overflow-x-auto">{match.text}</pre>
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevelopers.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
              No public developer profiles matched.
            </div>
          ) : (
            filteredDevelopers.map((dev) => (
              <Link
                key={dev.uid}
                to={`/u/${dev.username}`}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 hover:border-blue-500/60 transition-colors flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-600/15 text-blue-500 flex items-center justify-center font-semibold text-sm shrink-0 overflow-hidden">
                  {dev.avatarUrl ? (
                    <img src={dev.avatarUrl} alt={dev.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    dev.username.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{dev.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">@{dev.username}</p>
                  {dev.bio && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{dev.bio}</p>}
                  <p className="mt-2 text-xs text-slate-500 tabular-nums flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>{dev.followersCount} followers</span>
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
