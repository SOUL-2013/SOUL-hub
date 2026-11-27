import { useEffect, useState } from 'react';
import { ArrowRight, Code2, GitBranch, Globe, Layers, Lock, ShieldCheck, Terminal } from 'lucide-react';
import { gitApi, type ShowcaseRepoResponse } from '../lib/api';
import { formatBytes } from '../lib/validation';
import { Link } from '../lib/router';

export function LandingPage() {
  const [showcase, setShowcase] = useState<ShowcaseRepoResponse[]>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(true);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    gitApi
      .getShowcase()
      .then((res) => setShowcase(Array.isArray(res?.repositories) ? res.repositories : []))
      .catch(() => setShowcase([]))
      .finally(() => setShowcaseLoading(false));
  }, []);

  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-wide">
            Soumadip Orbit Universal Labs (SOUL)
          </p>
          <h1 className="mt-3 font-display font-bold tracking-tight text-slate-950 dark:text-white text-[clamp(2.25rem,4vw,3.75rem)] leading-[1.08] text-balance">
            Where Developers Build the Future.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
            SOUL HUB combines real bare Git hosting over Smart HTTP, an integrated Monaco code workspace, branch-compared pull requests, issue tracking, and static website publishing in one unified engineering platform.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              <span>Explore Live Repositories</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors whitespace-nowrap"
            >
              <span>Create Developer Account</span>
            </Link>
          </div>

          <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-3 gap-6 max-w-md">
            <div>
              <p className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums">Git 2.34</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Smart HTTP transport</p>
            </div>
            <div>
              <p className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums">50 MB</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Free storage quota</p>
            </div>
            <div>
              <p className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums">19+</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Highlighted languages</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 flex items-stretch">
          <div className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0A0E17] min-h-[320px] flex items-center justify-center relative">
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/soulhub_hero_architecture_1795710290241.jpg"
                alt="SOUL HUB orbital modular code architecture"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="p-10 text-center">
                <GitBranch className="w-12 h-12 text-blue-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-slate-300">SOUL HUB Architecture</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Live Repositories Showcase */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Live Git Repositories on Disk
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Real bare Git repositories served directly by SOUL HUB's Smart HTTP transport and file browser.
            </p>
          </div>
          <Link to="/explore" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
            View all repositories
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {showcaseLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
            ))
          ) : (
            showcase.map((repo) => (
              <Link
                key={repo.id}
                to={`/repo/${repo.ownerUsername}/${repo.slug}`}
                className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 hover:border-blue-500/60 transition-colors flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-500 transition-colors">
                    {repo.fullName}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{repo.description}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{repo.primaryLanguage}</span>
                  <span aria-hidden="true">·</span>
                  <span>{repo.branchesCount} branches</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(repo.totalBytes)}</span>
                  {repo.liveUrl && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Live site</span>
                    </>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* Core Platform Capabilities */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="max-w-2xl mb-10">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            01. Built for Real Engineering Workflows
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Every core primitive runs against real Git objects, Firebase Authentication, and Firestore security rules.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Terminal,
              title: '01. Smart HTTP Git Server',
              desc: 'Clone, fetch, pull, and push using standard Git CLI over HTTP Basic Auth with Personal Access Tokens.',
            },
            {
              icon: Code2,
              title: '02. Integrated Monaco Workspace',
              desc: 'Edit multiple files, compare diffs, inspect line-by-line Git blame, and commit straight to branches.',
            },
            {
              icon: GitBranch,
              title: '03. Branch Diffs & Merge Control',
              desc: 'Compare commits, detect 3-way merge conflicts via git merge-tree, and execute merge, squash, or rebase.',
            },
            {
              icon: Layers,
              title: '04. Issues, Kanban & Discussions',
              desc: 'Coordinate tasks with markdown issues, board views, milestones, and technical Q&A threads.',
            },
            {
              icon: Globe,
              title: '05. Static Site Publishing',
              desc: 'Publish static HTML/CSS/JS bundles directly from any repository branch with preview URLs and rollback.',
            },
            {
              icon: Lock,
              title: '06. Zero-Trust Rule Enforcement',
              desc: 'Private repositories are isolated in both Firestore security rules and server-side Git HTTP handlers.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6"
              >
                <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Honest Free-Tier Transparency & Quotas */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-display text-xl font-bold text-slate-950 dark:text-white">
                Transparent Free-Tier Limits & Architecture
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
                SOUL HUB runs on Firebase Starter Tier and single-container Node.js hosting with no mandatory paid APIs. To protect platform stability, honest resource quotas apply:
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 pr-4 font-medium">Resource</th>
                  <th className="py-3 pr-4 font-medium">Free-Tier Allowance</th>
                  <th className="py-3 font-medium">Technical Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                <tr>
                  <td className="py-3 pr-4 font-medium">Developer Storage Quota</td>
                  <td className="py-3 pr-4 font-mono tabular-nums">50 MB / user</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">Covers avatars, attachments, and uploads (5 MB max per file).</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Static Website Deployments</td>
                  <td className="py-3 pr-4 font-mono tabular-nums">20 MB / site</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">Served on /sites/:owner/:repo/ from repository output directories.</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">CI/CD Execution Runners</td>
                  <td className="py-3 pr-4 font-mono">Config + Queue</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">Workflow YAML validation and run tracking included; isolated container runners require external worker infrastructure.</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Firestore & Auth</td>
                  <td className="py-3 pr-4 font-mono">Firebase Spark Tier</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">Daily read/write limits reset daily; upgrading Cloud billing only applies if you exceed Spark limits.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
