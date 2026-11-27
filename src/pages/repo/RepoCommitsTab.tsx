import { useState } from 'react';
import { GitBranch, History, Plus, Tag, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { gitApi, type GitBranchInfo, type GitCommitInfo, type GitTagInfo } from '../../lib/api';
import type { RepositoryDoc } from '../../types/domain';

export function RepoCommitsTab({
  repo,
  mode,
  branches,
  tags,
  commits,
  protectedBranches,
  activeRef,
  isOwner,
  onChangeRef,
  onReload,
}: {
  repo: RepositoryDoc;
  mode: 'commits' | 'branches' | 'tags';
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  commits: GitCommitInfo[];
  protectedBranches: string[];
  activeRef: string;
  isOwner: boolean;
  onChangeRef: (ref: string) => void;
  onReload: () => void;
}) {
  const { pushToast, confirm } = useToast();
  const [selectedCommit, setSelectedCommit] = useState<{ commit: GitCommitInfo; stats: string; patch: string } | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [fromRef, setFromRef] = useState(activeRef);
  const [newTagName, setNewTagName] = useState('');
  const [newTagMsg, setNewTagMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const inspectCommit = async (sha: string) => {
    try {
      const detail = await gitApi.getCommitDetail(repo.ownerUsername, repo.slug, sha);
      setSelectedCommit(detail);
    } catch (err) {
      pushToast({ type: 'error', title: 'Diff error', message: err instanceof Error ? err.message : 'Unable to load commit.' });
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setBusy(true);
    try {
      await gitApi.createBranch(repo.ownerUsername, repo.slug, newBranchName.trim(), fromRef);
      pushToast({ type: 'success', title: 'Branch created', message: `${newBranchName.trim()} from ${fromRef}` });
      setNewBranchName('');
      onReload();
    } catch (err) {
      pushToast({ type: 'error', title: 'Branch error', message: err instanceof Error ? err.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    const ok = await confirm({
      title: `Delete branch ${branchName}?`,
      message: 'This deletes the branch pointer from the bare Git repository.',
      confirmLabel: 'Delete Branch',
      destructive: true,
    });
    if (!ok) return;
    try {
      await gitApi.deleteBranch(repo.ownerUsername, repo.slug, branchName);
      pushToast({ type: 'success', title: 'Branch deleted' });
      onReload();
    } catch (err) {
      pushToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Error.' });
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setBusy(true);
    try {
      await gitApi.createTag(repo.ownerUsername, repo.slug, newTagName.trim(), activeRef, newTagMsg.trim());
      pushToast({ type: 'success', title: 'Tag created', message: newTagName.trim() });
      setNewTagName('');
      setNewTagMsg('');
      onReload();
    } catch (err) {
      pushToast({ type: 'error', title: 'Tag error', message: err instanceof Error ? err.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'branches' || mode === 'tags') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Branches */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-500" />
            <span>Branches ({branches.length})</span>
          </h2>

          {isOwner && (
            <form onSubmit={handleCreateBranch} className="flex flex-wrap gap-2">
              <input
                type="text"
                required
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feat/new-branch"
                className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
              />
              <select
                value={fromRef}
                onChange={(e) => setFromRef(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    from {b.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {branches.map((b) => (
              <div key={b.name} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <button
                    type="button"
                    onClick={() => onChangeRef(b.name)}
                    className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {b.name}
                  </button>
                  <p className="text-slate-500 mt-0.5">
                    {b.name === repo.defaultBranch ? 'default' : ''}
                    {protectedBranches.includes(b.name) ? ' · protected' : ''} · {b.message}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-slate-400">{b.sha.slice(0, 7)}</span>
                  {isOwner && b.name !== repo.defaultBranch && !protectedBranches.includes(b.name) && (
                    <button
                      type="button"
                      aria-label={`Delete branch ${b.name}`}
                      onClick={() => void handleDeleteBranch(b.name)}
                      className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tags */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4 text-violet-500" />
            <span>Tags ({tags.length})</span>
          </h2>

          {isOwner && (
            <form onSubmit={handleCreateTag} className="flex flex-wrap gap-2">
              <input
                type="text"
                required
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="v1.0.1"
                className="w-32 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
              />
              <input
                type="text"
                value={newTagMsg}
                onChange={(e) => setNewTagMsg(e.target.value)}
                placeholder="Tag annotation message"
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tag</span>
              </button>
            </form>
          )}

          {tags.length === 0 ? (
            <p className="text-xs text-slate-500">No Git tags created yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {tags.map((t) => (
                <div key={t.name} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{t.name}</span>
                    {t.message && <p className="text-slate-500 mt-0.5">{t.message}</p>}
                  </div>
                  <span className="font-mono text-slate-400">{t.sha.slice(0, 7)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          <span>Commit History on {activeRef}</span>
        </h2>
        <select
          aria-label="Commit history branch"
          value={activeRef}
          onChange={(e) => onChangeRef(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D111A] text-xs font-mono"
        >
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] divide-y divide-slate-100 dark:divide-slate-800">
        {commits.map((c) => (
          <div key={c.sha} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{c.message}</p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {c.authorName} · {new Date(c.date).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void inspectCommit(c.sha)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-xs text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 self-start sm:self-center"
            >
              {c.shortSha} · View Diff
            </button>
          </div>
        ))}
      </div>

      {selectedCommit && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#0A0E17]">
            <div>
              <p className="text-sm font-semibold">{selectedCommit.commit.message}</p>
              <p className="text-xs text-slate-500 font-mono">{selectedCommit.commit.sha}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCommit(null)}
              className="text-xs text-slate-500 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <pre className="p-4 text-xs font-mono overflow-x-auto bg-slate-50 dark:bg-[#07090F] text-slate-800 dark:text-slate-200 whitespace-pre">
            {selectedCommit.patch || selectedCommit.stats}
          </pre>
        </div>
      )}
    </div>
  );
}
