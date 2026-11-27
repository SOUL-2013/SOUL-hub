import { useEffect, useState } from 'react';
import { FileCode2, Folder, GitBranch, History, Plus, Upload } from 'lucide-react';
import { MarkdownView } from '../../components/MarkdownView';
import { useToast } from '../../context/ToastContext';
import { gitApi, type GitBranchInfo, type GitCommitInfo, type GitTagInfo, type GitTreeEntry } from '../../lib/api';
import { Link, useRouter } from '../../lib/router';
import { formatBytes } from '../../lib/validation';
import type { RepositoryDoc } from '../../types/domain';

export function RepoOverviewTab({
  repo,
  branches,
  tags,
  commits,
  entries,
  langStats,
  activeRef,
  isOwner,
  onChangeRef,
  onReload,
}: {
  repo: RepositoryDoc;
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  commits: GitCommitInfo[];
  entries: GitTreeEntry[];
  langStats: { totalBytes: number; languages: Array<{ language: string; bytes: number; percentage: number }> };
  activeRef: string;
  isOwner: boolean;
  onChangeRef: (ref: string) => void;
  onReload: () => void;
}) {
  const { pushToast } = useToast();
  const { navigate } = useRouter();
  const [currentPath, setCurrentPath] = useState('');
  const [treeEntries, setTreeEntries] = useState<GitTreeEntry[]>(entries);
  const [readmeContent, setReadmeContent] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileBody, setNewFileBody] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTreeEntries(entries);
    setCurrentPath('');
  }, [entries, activeRef]);

  useEffect(() => {
    const readmeEntry = entries.find((e) => e.name.toLowerCase() === 'readme.md' && e.type === 'blob');
    if (readmeEntry) {
      gitApi
        .getBlob(repo.ownerUsername, repo.slug, activeRef, readmeEntry.path)
        .then((res) => setReadmeContent(res.text || ''))
        .catch(() => setReadmeContent(''));
    } else {
      setReadmeContent('');
    }
  }, [repo.ownerUsername, repo.slug, activeRef, entries]);

  const navigateFolder = async (folderPath: string) => {
    setCurrentPath(folderPath);
    try {
      const res = await gitApi.getTree(repo.ownerUsername, repo.slug, activeRef, folderPath);
      setTreeEntries(res.entries);
    } catch {
      setTreeEntries([]);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) return;
    setBusy(true);
    try {
      const base64 = btoa(unescape(encodeURIComponent(newFileBody)));
      await gitApi.commitFiles(repo.ownerUsername, repo.slug, {
        branch: activeRef,
        message: commitMsg.trim() || `Add ${newFilePath.trim()}`,
        files: [{ action: 'upsert', path: newFilePath.trim(), contentBase64: base64 }],
      });
      pushToast({ type: 'success', title: 'Committed file', message: `${newFilePath.trim()} pushed to ${activeRef}` });
      setNewFileOpen(false);
      setNewFilePath('');
      setNewFileBody('');
      setCommitMsg('');
      onReload();
    } catch (err) {
      pushToast({ type: 'error', title: 'Commit failed', message: err instanceof Error ? err.message : 'Unable to commit.' });
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      pushToast({ type: 'error', title: 'File too large', message: 'Browser Git upload limit is 4 MB per file.' });
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const targetPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      await gitApi.commitFiles(repo.ownerUsername, repo.slug, {
        branch: activeRef,
        message: `Upload ${targetPath}`,
        files: [{ action: 'upsert', path: targetPath, contentBase64: base64 }],
      });
      pushToast({ type: 'success', title: 'File uploaded & committed', message: targetPath });
      onReload();
    } catch (err) {
      pushToast({ type: 'error', title: 'Upload failed', message: err instanceof Error ? err.message : 'Commit error.' });
    } finally {
      setBusy(false);
    }
  };

  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-9 space-y-6">
        {/* Branch / Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-slate-400" />
              <select
                aria-label="Select branch or tag"
                value={activeRef}
                onChange={(e) => onChangeRef(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D111A] text-xs font-mono"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    branch: {b.name}
                  </option>
                ))}
                {tags.map((t) => (
                  <option key={t.name} value={t.name}>
                    tag: {t.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {branches.length} branches · {tags.length} tags
            </span>
          </div>

          {isOwner && !repo.isArchived && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNewFileOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New File</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
                <input type="file" className="hidden" onChange={handleUploadFile} disabled={busy} />
              </label>
            </div>
          )}
        </div>

        {/* Inline New File Form */}
        {newFileOpen && (
          <form onSubmit={handleCreateFile} className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D111A] p-5 space-y-3">
            <h2 className="text-sm font-semibold">Create & Commit New File to {activeRef}</h2>
            <input
              type="text"
              required
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              placeholder="e.g. src/utils/helper.ts"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
            />
            <textarea
              rows={6}
              value={newFileBody}
              onChange={(e) => setNewFileBody(e.target.value)}
              placeholder="File contents..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
            />
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message (optional)"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? 'Committing...' : 'Commit File'}
              </button>
            </div>
          </form>
        )}

        {/* File Tree Table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0A0E17] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-mono">
              <button
                type="button"
                onClick={() => void navigateFolder('')}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {repo.slug}
              </button>
              {breadcrumbs.map((seg, i) => {
                const target = breadcrumbs.slice(0, i + 1).join('/');
                return (
                  <span key={target} className="flex items-center gap-1.5">
                    <span className="text-slate-400">/</span>
                    <button
                      type="button"
                      onClick={() => void navigateFolder(target)}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
            </div>

            {commits[0] && (
              <Link
                to={`/repo/${repo.ownerUsername}/${repo.slug}/commits`}
                className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              >
                <History className="w-3.5 h-3.5" />
                <span className="truncate max-w-[260px]">{commits[0].message}</span>
                <span className="font-mono text-slate-400">{commits[0].shortSha}</span>
              </Link>
            )}
          </div>

          {treeEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Empty directory or uninitialized branch. Push over Git Smart HTTP or create a file above.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {currentPath && (
                <button
                  type="button"
                  onClick={() => void navigateFolder(breadcrumbs.slice(0, -1).join('/'))}
                  className="w-full px-4 py-2.5 text-left text-xs font-mono text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  ..
                </button>
              )}
              {treeEntries.map((entry) => (
                <div
                  key={entry.path}
                  className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {entry.type === 'tree' ? (
                      <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : (
                      <FileCode2 className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    {entry.type === 'tree' ? (
                      <button
                        type="button"
                        onClick={() => void navigateFolder(entry.path)}
                        className="font-mono font-medium text-slate-900 dark:text-slate-100 hover:text-blue-500 truncate"
                      >
                        {entry.name}/
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(`/repo/${repo.ownerUsername}/${repo.slug}/code?ref=${encodeURIComponent(activeRef)}&path=${encodeURIComponent(entry.path)}`)}
                        className="font-mono text-slate-800 dark:text-slate-200 hover:text-blue-500 truncate"
                      >
                        {entry.name}
                      </button>
                    )}
                  </div>
                  <span className="hidden md:block text-slate-500 dark:text-slate-400 truncate max-w-xs flex-1">
                    {entry.lastCommitMessage || ''}
                  </span>
                  <span className="text-slate-400 font-mono tabular-nums shrink-0">
                    {entry.type === 'blob' ? formatBytes(entry.size) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* README Renderer */}
        {readmeContent && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
            <p className="text-xs font-mono text-slate-400 mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">README.md</p>
            <MarkdownView content={readmeContent} />
          </div>
        )}
      </div>

      {/* Right Metadata Column */}
      <aside className="lg:col-span-3 space-y-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">About</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {repo.description || 'No description provided.'}
          </p>
          <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <p>License: {repo.license || 'Unspecified'}</p>
            <p>Total Git payload: {formatBytes(langStats.totalBytes)}</p>
            <p>Commits: {commits.length}{commits.length >= 15 ? '+' : ''}</p>
          </div>
          {repo.topics && repo.topics.length > 0 && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {repo.topics.map((t) => `#${t}`).join(' · ')}
            </p>
          )}
        </div>

        {langStats.languages.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Languages</h2>
            <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800">
              {langStats.languages.map((lang, idx) => {
                const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-cyan-500'];
                return (
                  <div
                    key={lang.language}
                    style={{ width: `${lang.percentage}%` }}
                    className={colors[idx % colors.length]}
                    title={`${lang.language}: ${lang.percentage}%`}
                  />
                );
              })}
            </div>
            <div className="space-y-1.5 text-xs">
              {langStats.languages.map((lang) => (
                <div key={lang.language} className="flex items-center justify-between text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>{lang.language}</span>
                  <span className="font-mono text-slate-400">{lang.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
