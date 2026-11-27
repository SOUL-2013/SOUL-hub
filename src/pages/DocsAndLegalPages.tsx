import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, FileText, HelpCircle, Server, ShieldCheck } from 'lucide-react';
import { Link } from '../lib/router';

export function DocsApiPage() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://soulhub.ai.studio';
  const endpoints = [
    { method: 'GET', path: '/api/health', desc: 'Checks server availability, Git binary status, and uptime.' },
    { method: 'GET', path: '/api/public/showcase', desc: 'Returns live showcase bare repositories with latest commit and language stats.' },
    { method: 'GET', path: '/api/git/:owner/:repo/summary?ref=main', desc: 'Fetches branches, tags, commits, root tree entries, and byte breakdown.' },
    { method: 'GET', path: '/api/git/:owner/:repo/blob?ref=main&path=...', desc: 'Reads raw UTF-8 or base64 file blob directly from bare Git repository.' },
    { method: 'POST', path: '/api/git/:owner/:repo/commit', desc: 'Commits file upserts/deletes directly into the target Git branch (Bearer ID Token required).' },
    { method: 'GET', path: '/api/git/:owner/:repo/compare?base=main&head=feat', desc: 'Computes real Git diff, commit log, and 3-way conflict detection.' },
    { method: 'POST', path: '/api/git/:owner/:repo/merge', desc: 'Performs merge, squash, or rebase merge directly on the bare Git repository.' },
    { method: 'POST', path: '/api/deployments/:owner/:repo', desc: 'Extracts static HTML/CSS/JS build output and publishes to /sites/:owner/:repo/.' },
    { method: 'GET/POST', path: '/git/:owner/:repo.git/*', desc: 'Standard Git Smart HTTP transport supporting git clone and git push with PAT.' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-blue-500" />
          <span>SOUL HUB API & Git Protocol Reference</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Authenticate REST requests using your Firebase ID Token (<code className="font-mono">Authorization: Bearer &lt;token&gt;</code>) and Git CLI over Smart HTTP using Personal Access Tokens.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] divide-y divide-slate-200 dark:divide-slate-800">
        {endpoints.map((ep) => (
          <div key={ep.path} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                <span className="text-blue-600 dark:text-blue-400 mr-2">{ep.method}</span>
                {ep.path}
              </p>
              <p className="text-xs text-slate-500 mt-1">{ep.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-3">
        <h2 className="text-base font-semibold">Example: Inspect Showcase Repositories via cURL</h2>
        <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto">
{`curl -s "${origin}/api/public/showcase" | jq '.repositories[].fullName'`}
        </pre>
      </div>
    </div>
  );
}

export function HelpStatusPage() {
  const [health, setHealth] = useState<{ ok: boolean; gitAvailable?: boolean; version?: string; timestamp?: string } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-3">
          <HelpCircle className="w-7 h-7 text-blue-500" />
          <span>Help Center & Platform Status</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Transparent free-tier limits, runtime capabilities, and live service health for SOUL HUB.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Server className="w-4 h-4 text-emerald-500" />
            <span>Git & HTTP Engine</span>
          </div>
          <p className="text-xs text-slate-500">
            Status: {health ? (health.ok && health.gitAvailable ? 'Operational' : 'Degraded') : 'Checking...'}
          </p>
          {health?.version && <p className="text-xs font-mono text-slate-400">{health.version}</p>}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
            <span>Free-Tier Quotas</span>
          </div>
          <p className="text-xs text-slate-500">
            50 MB object storage per user · 5 MB max file upload · 20 MB max static deployment bundle.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4 text-violet-500" />
            <span>Execution Boundaries</span>
          </div>
          <p className="text-xs text-slate-500">
            Static sites host live on <code className="font-mono">/sites/:owner/:repo/</code>. Arbitrary CI shell runners require external workers.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
        <h2 className="text-base font-semibold">Frequently Asked Questions</h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Are repositories backed by real Git?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Yes. Every repository creates a real bare Git repository on the server filesystem, supporting commits, branches, tags, blame, 3-way merge checks, ZIP archives, and standard <code className="font-mono">git clone</code> / <code className="font-mono">git push</code> over Smart HTTP.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">How do charges and storage limits work?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              SOUL HUB operates within Google AI Studio & Firebase Starter Tier quotas without paid third-party SaaS dependencies. Storage and compute quotas are enforced per account (50 MB object storage, 5 MB/file) rather than promising unlimited free storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegalPage({ docType }: { docType: 'terms' | 'privacy' | 'guidelines' }) {
  const titles = {
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    guidelines: 'Community & Security Guidelines',
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center gap-2.5">
        <FileText className="w-6 h-6 text-blue-500" />
        <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white">{titles[docType]}</h1>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {docType === 'terms' && (
          <>
            <p>
              SOUL HUB is operated by SOUL — Soumadip Orbit Universal Labs as a developer collaboration, Git hosting, and static site deployment workspace.
            </p>
            <p>
              Accounts are subject to fair-use quotas (50 MB object storage, 5 MB file limit, 20 MB static deployment limit). Attempting to bypass path confinement, execute unauthorized binaries, or abuse shared infrastructure results in account suspension.
            </p>
          </>
        )}
        {docType === 'privacy' && (
          <>
            <p>
              Private account data (email addresses, block/mute lists, notification settings, and storage metrics) is stored in a dedicated isolated Firestore collection accessible only to your authenticated UID and platform administrators.
            </p>
            <p>
              Personal Access Tokens are stored strictly as HMAC-SHA256 hashes. You can export your JSON data or permanently delete your account at any time from Account Settings.
            </p>
          </>
        )}
        {docType === 'guidelines' && (
          <>
            <p>
              Constructive code review, responsible vulnerability disclosure, and honest open-source attribution are foundational to SOUL HUB.
            </p>
            <p>
              Do not commit plaintext secrets, malicious payloads, or SVG scripts. Use any repository&apos;s Security tab to file private security advisories.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-4">
      <p className="font-mono text-sm text-blue-500">404 · ROUTE NOT FOUND</p>
      <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white">Orbit coordinates missing</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The repository, profile, or documentation path you requested does not exist on SOUL HUB.
      </p>
      <div className="pt-2 flex items-center justify-center gap-3">
        <Link to="/" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          Return Home
        </Link>
        <Link to="/explore" className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium">
          Explore Repositories
        </Link>
      </div>
    </div>
  );
}
