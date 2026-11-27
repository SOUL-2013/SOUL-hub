import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  GitPullRequest,
  Plus,
  XCircle,
} from 'lucide-react';
import { MarkdownView } from '../../components/MarkdownView';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { gitApi, type GitBranchInfo, type GitCommitInfo } from '../../lib/api';
import { firestoreRepo } from '../../lib/firestoreRepo';
import type { PullRequestDoc, RepositoryDoc, ReviewDoc } from '../../types/domain';

interface DiffData {
  commits: GitCommitInfo[];
  diff: string;
  filesChanged: Array<{ path: string; additions: number; deletions: number }>;
  hasConflicts: boolean;
}

function DiffViewer({ diffText, viewMode }: { diffText: string; viewMode: 'unified' | 'split' }) {
  const lines = diffText ? diffText.split('\n') : [];
  if (lines.length === 0) {
    return <p className="p-4 text-xs text-slate-500">No file changes detected between these branches.</p>;
  }

  if (viewMode === 'unified') {
    return (
      <div className="overflow-x-auto bg-slate-50 dark:bg-[#090D16] font-mono text-xs leading-5 p-3">
        {lines.map((line, i) => {
          const cls = line.startsWith('+') && !line.startsWith('+++')
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : line.startsWith('-') && !line.startsWith('---')
            ? 'bg-red-500/15 text-red-700 dark:text-red-300'
            : line.startsWith('@@')
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : 'text-slate-700 dark:text-slate-300';
          return (
            <div key={i} className={`px-2 whitespace-pre ${cls}`}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    );
  }

  const leftLines: Array<{ text: string; type: 'del' | 'ctx' }> = [];
  const rightLines: Array<{ text: string; type: 'add' | 'ctx' }> = [];
  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      leftLines.push({ text: line, type: 'ctx' });
      rightLines.push({ text: line, type: 'ctx' });
    } else if (line.startsWith('-')) {
      leftLines.push({ text: line, type: 'del' });
    } else if (line.startsWith('+')) {
      rightLines.push({ text: line, type: 'add' });
    } else {
      leftLines.push({ text: line, type: 'ctx' });
      rightLines.push({ text: line, type: 'ctx' });
    }
  }
  const maxRows = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="overflow-x-auto bg-slate-50 dark:bg-[#090D16] font-mono text-xs leading-5">
      <div className="grid grid-cols-2 min-w-[720px] divide-x divide-slate-200 dark:divide-slate-800">
        <div>
          {Array.from({ length: maxRows }).map((_, idx) => {
            const row = leftLines[idx];
            return (
              <div
                key={`l-${idx}`}
                className={`px-3 whitespace-pre truncate ${
                  row?.type === 'del' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {row ? row.text : ' '}
              </div>
            );
          })}
        </div>
        <div>
          {Array.from({ length: maxRows }).map((_, idx) => {
            const row = rightLines[idx];
            return (
              <div
                key={`r-${idx}`}
                className={`px-3 whitespace-pre truncate ${
                  row?.type === 'add' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {row ? row.text : ' '}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RepoPullRequestsTab({
  repo,
  branches,
  isOwner,
  onMerged,
}: {
  repo: RepositoryDoc;
  branches: GitBranchInfo[];
  isOwner: boolean;
  onMerged: () => void;
}) {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();

  const [prs, setPrs] = useState<PullRequestDoc[]>([]);
  const [selectedPr, setSelectedPr] = useState<PullRequestDoc | null>(null);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [compareData, setCompareData] = useState<DiffData | null>(null);
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Branch comparator / New PR state
  const [compareOpen, setCompareOpen] = useState(repo.isShowcase ? true : false);
  const [baseBranch, setBaseBranch] = useState(repo.defaultBranch || branches[0]?.name || 'main');
  const [headBranch, setHeadBranch] = useState(branches.find((b) => b.name !== (repo.defaultBranch || 'main'))?.name || branches[0]?.name || 'main');
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(false);

  // Review & merge controls
  const [reviewState, setReviewState] = useState<ReviewDoc['state']>('approved');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewFile, setReviewFile] = useState('');
  const [reviewLine, setReviewLine] = useState('');
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge');

  const loadPrs = async () => {
    setLoading(true);
    try {
      if (!repo.isShowcase) {
        const list = await firestoreRepo.listPullRequests(repo.id, repo.visibility, firebaseUser?.uid);
        list.sort((a, b) => b.number - a.number);
        setPrs(list);
      } else {
        setPrs([]);
      }
      if (branches.length >= 2) {
        const b1 = repo.defaultBranch || branches[0].name;
        const b2 = branches.find((b) => b.name !== b1)?.name || branches[0].name;
        setBaseBranch(b1);
        setHeadBranch(b2);
        const cmp = await gitApi.compare(repo.ownerUsername, repo.slug, b1, b2);
        setCompareData(cmp);
      }
    } catch {
      // Ignore initial compare errors on single-branch repos
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedPr(null);
    void loadPrs();
  }, [repo.id, branches.length, firebaseUser?.uid]);

  const runCompare = async (base: string, head: string) => {
    if (!base || !head || base === head) {
      setCompareData(null);
      return;
    }
    try {
      const cmp = await gitApi.compare(repo.ownerUsername, repo.slug, base, head);
      setCompareData(cmp);
    } catch (err) {
      pushToast({ type: 'error', title: 'Compare failed', message: err instanceof Error ? err.message : 'Unable to compare.' });
    }
  };

  const openPrDetail = async (pr: PullRequestDoc) => {
    setSelectedPr(pr);
    try {
      const [revs, cmp] = await Promise.all([
        firestoreRepo.listPrReviews(repo.id, pr.id, repo.visibility, firebaseUser?.uid),
        gitApi.compare(repo.ownerUsername, repo.slug, pr.targetBranch, pr.sourceBranch).catch(() => null),
      ]);
      setReviews(revs);
      setCompareData(cmp);
    } catch {
      setReviews([]);
    }
  };

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || repo.isShowcase) return;
    if (!prTitle.trim() || baseBranch === headBranch) return;
    setBusy(true);
    try {
      const nextNum = prs.reduce((max, p) => Math.max(max, p.number), 0) + 1;
      const created = await firestoreRepo.createPullRequest(repo, {
        number: nextNum,
        title: prTitle.trim(),
        body: prBody.trim(),
        sourceBranch: headBranch,
        targetBranch: baseBranch,
        status: prDraft ? 'draft' : 'open',
        authorId: firebaseUser.uid,
        authorUsername: profile.username,
      });
      setPrs((prev) => [created, ...prev]);
      setCompareOpen(false);
      setPrTitle('');
      setPrBody('');
      pushToast({ type: 'success', title: `Pull Request #${nextNum} opened` });
      void openPrDetail(created);
    } catch (err) {
      pushToast({ type: 'error', title: 'Failed to create PR', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPr || !firebaseUser || !profile) return;
    setBusy(true);
    try {
      const parsedLine = reviewLine ? Number(reviewLine) : undefined;
      const rev = await firestoreRepo.addPrReview(repo, selectedPr.id, {
        reviewerId: firebaseUser.uid,
        reviewerUsername: profile.username,
        state: reviewState,
        body: reviewBody.trim(),
        filePath: reviewFile.trim() || undefined,
        lineNumber: parsedLine && parsedLine >= 1 ? parsedLine : undefined,
      });
      setReviews((prev) => [...prev, rev]);
      if (reviewState === 'approved') {
        setSelectedPr((prev) => (prev ? { ...prev, approvalsCount: prev.approvalsCount + 1 } : prev));
      }
      setReviewBody('');
      setReviewFile('');
      setReviewLine('');
      pushToast({ type: 'success', title: 'Review submitted' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Review failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleMergePr = async () => {
    if (!selectedPr || !firebaseUser || !profile) return;
    setBusy(true);
    try {
      const result = await gitApi.merge(repo.ownerUsername, repo.slug, {
        baseBranch: selectedPr.targetBranch,
        headBranch: selectedPr.sourceBranch,
        method: mergeMethod,
        message: `Merge PR #${selectedPr.number}: ${selectedPr.title}`,
      });
      if (!result.merged) {
        pushToast({ type: 'error', title: 'Merge conflict detected', message: result.error || 'Resolve conflicts before merging.' });
        return;
      }
      await firestoreRepo.updatePullRequest(repo.id, selectedPr.id, {
        status: 'merged',
        mergeMethod,
        mergedCommitSha: result.commitSha || '',
      });
      await firestoreRepo.logActivity({
        actorId: firebaseUser.uid,
        actorUsername: profile.username,
        type: 'pr_merged',
        repoId: repo.id,
        repoFullName: repo.fullName,
        summary: `Merged PR #${selectedPr.number} (${selectedPr.sourceBranch} -> ${selectedPr.targetBranch}) via ${mergeMethod}`,
        visibility: repo.visibility,
      });
      setSelectedPr((prev) => (prev ? { ...prev, status: 'merged', mergeMethod, mergedCommitSha: result.commitSha } : prev));
      setPrs((prev) => prev.map((p) => (p.id === selectedPr.id ? { ...p, status: 'merged' } : p)));
      pushToast({ type: 'success', title: 'Pull Request Merged', message: `Commit ${(result.commitSha || '').slice(0, 7)} on ${selectedPr.targetBranch}` });
      onMerged();
    } catch (err) {
      pushToast({ type: 'error', title: 'Merge failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800/40 animate-pulse" />;
  }

  if (selectedPr) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setSelectedPr(null)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
            >
              ← Back to Pull Requests
            </button>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">
              {selectedPr.title} <span className="font-mono text-slate-400 font-normal">#{selectedPr.number}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {selectedPr.status.toUpperCase()} · @{selectedPr.authorUsername} wants to merge{' '}
              <code className="font-mono text-blue-500">{selectedPr.sourceBranch}</code> into{' '}
              <code className="font-mono text-blue-500">{selectedPr.targetBranch}</code> · {selectedPr.approvalsCount} approvals
            </p>
          </div>

          {isOwner && selectedPr.status !== 'merged' && (
            <div className="flex items-center gap-2">
              <select
                aria-label="Merge method"
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value as 'merge' | 'squash' | 'rebase')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D111A] text-xs"
              >
                <option value="merge">Create merge commit</option>
                <option value="squash">Squash and merge</option>
                <option value="rebase">Rebase and merge</option>
              </select>
              <button
                type="button"
                disabled={busy || Boolean(compareData?.hasConflicts)}
                onClick={() => void handleMergePr()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{busy ? 'Merging...' : 'Merge Pull Request'}</span>
              </button>
            </div>
          )}
        </div>

        {compareData?.hasConflicts && selectedPr.status !== 'merged' && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Git 3-way merge check detected overlapping file conflicts between {selectedPr.sourceBranch} and {selectedPr.targetBranch}.</span>
          </div>
        )}

        {selectedPr.body && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5">
            <MarkdownView content={selectedPr.body} />
          </div>
        )}

        {compareData && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-medium">
                {compareData.filesChanged.length} files changed · {compareData.commits.length} commits
              </div>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setDiffMode('unified')}
                  className={`px-2.5 py-1 rounded ${diffMode === 'unified' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                >
                  Unified
                </button>
                <button
                  type="button"
                  onClick={() => setDiffMode('split')}
                  className={`px-2.5 py-1 rounded ${diffMode === 'split' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                >
                  Split
                </button>
              </div>
            </div>
            <DiffViewer diffText={compareData.diff} viewMode={diffMode} />
          </div>
        )}

        {/* Code Reviews */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Reviews ({reviews.length})</h3>
          {reviews.map((rev) => (
            <div key={rev.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  @{rev.reviewerUsername} · <span className="uppercase">{rev.state.replace('_', ' ')}</span>
                  {rev.filePath ? ` · ${rev.filePath}${rev.lineNumber ? `:${rev.lineNumber}` : ''}` : ''}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    onClick={async () => {
                      await firestoreRepo.resolvePrReview(repo.id, selectedPr.id, rev.id, !rev.resolved);
                      setReviews((prev) => prev.map((r) => (r.id === rev.id ? { ...r, resolved: !r.resolved } : r)));
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {rev.resolved ? 'Resolved' : 'Resolve thread'}
                  </button>
                )}
              </div>
              {rev.body && <MarkdownView content={rev.body} />}
            </div>
          ))}

          {firebaseUser && (
            <form onSubmit={handleSubmitReview} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 space-y-3">
              <h4 className="text-xs font-semibold">Submit Code Review</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <select
                  value={reviewState}
                  onChange={(e) => setReviewState(e.target.value as ReviewDoc['state'])}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F]"
                >
                  <option value="approved">Approve</option>
                  <option value="commented">Comment</option>
                  <option value="changes_requested">Request Changes</option>
                </select>
                <input
                  type="text"
                  value={reviewFile}
                  onChange={(e) => setReviewFile(e.target.value)}
                  placeholder="Optional file path (e.g. src/tokens.ts)"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono"
                />
                <input
                  type="number"
                  min={1}
                  value={reviewLine}
                  onChange={(e) => setReviewLine(e.target.value)}
                  placeholder="Line #"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono"
                />
              </div>
              <textarea
                rows={3}
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder="Leave your review feedback..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
              />
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
                Submit Review
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Compare live Git branches, inspect unified or split diffs, detect conflicts, and merge pull requests.
        </p>
        <button
          type="button"
          onClick={() => setCompareOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{compareOpen ? 'Hide Branch Comparison' : 'Compare & New Pull Request'}</span>
        </button>
      </div>

      {/* Live Git Branch Comparator */}
      {compareOpen && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="font-medium text-slate-500">Base:</label>
            <select
              aria-label="Base branch"
              value={baseBranch}
              onChange={(e) => {
                setBaseBranch(e.target.value);
                void runCompare(e.target.value, headBranch);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono"
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            <span className="text-slate-400">←</span>
            <label className="font-medium text-slate-500">Compare:</label>
            <select
              aria-label="Compare branch"
              value={headBranch}
              onChange={(e) => {
                setHeadBranch(e.target.value);
                void runCompare(baseBranch, e.target.value);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono"
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>

            {compareData && (
              <span className={`ml-auto text-xs font-medium flex items-center gap-1.5 ${compareData.hasConflicts ? 'text-amber-500' : 'text-emerald-500'}`}>
                {compareData.hasConflicts ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{compareData.hasConflicts ? 'Conflicts detected' : 'Able to merge'}</span>
              </span>
            )}
          </div>

          {compareData && (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {compareData.commits.length} commits · {compareData.filesChanged.length} files changed
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDiffMode('unified')}
                    className={`px-2.5 py-1 rounded ${diffMode === 'unified' ? 'bg-blue-600 text-white' : ''}`}
                  >
                    Unified Diff
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiffMode('split')}
                    className={`px-2.5 py-1 rounded ${diffMode === 'split' ? 'bg-blue-600 text-white' : ''}`}
                  >
                    Split Diff
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <DiffViewer diffText={compareData.diff} viewMode={diffMode} />
              </div>
            </>
          )}

          {!repo.isShowcase && isOwner && baseBranch !== headBranch && (
            <form onSubmit={handleCreatePr} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <input
                type="text"
                required
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder="Pull request title"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
              />
              <textarea
                rows={3}
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                placeholder="Describe what changed in this branch..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
              />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
                  <span>Open as draft</span>
                </label>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
                  {busy ? 'Opening...' : 'Create Pull Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* PR List */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] divide-y divide-slate-200 dark:divide-slate-800">
        {prs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {repo.isShowcase
              ? 'Use the live branch comparison above (main vs feat/contrast-tokens) to inspect real Git diffs on this showcase repository.'
              : 'No pull requests opened yet.'}
          </div>
        ) : (
          prs.map((pr) => (
            <div key={pr.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <div className="flex items-start gap-3 min-w-0">
                <GitPullRequest className={`w-4 h-4 mt-0.5 shrink-0 ${pr.status === 'merged' ? 'text-violet-500' : 'text-emerald-500'}`} />
                <div>
                  <button
                    type="button"
                    onClick={() => void openPrDetail(pr)}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-500 text-left"
                  >
                    {pr.title}
                  </button>
                  <p className="text-xs text-slate-500 mt-0.5">
                    #{pr.number} · {pr.sourceBranch} → {pr.targetBranch} · {pr.status.toUpperCase()} · @{pr.authorUsername}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500 tabular-nums shrink-0">{pr.approvalsCount} approvals</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
