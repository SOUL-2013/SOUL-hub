import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleDot,
  Kanban,
  List,
  MessageSquare,
  Plus,
  Send,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { MarkdownView } from '../../components/MarkdownView';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { firestoreRepo } from '../../lib/firestoreRepo';
import type {
  CommentDoc,
  DiscussionDoc,
  IssueDoc,
  ProjectTaskDoc,
  RepositoryDoc,
} from '../../types/domain';

const LABEL_OPTIONS = ['bug', 'enhancement', 'documentation', 'security', 'performance', 'ui'];

export function RepoIssuesTab({
  repo,
  mode,
  isOwner,
}: {
  repo: RepositoryDoc;
  mode: 'issues' | 'projects' | 'discussions';
  isOwner: boolean;
}) {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();

  // Issues state
  const [issues, setIssues] = useState<IssueDoc[]>([]);
  const [issueFilter, setIssueFilter] = useState<'all' | 'open' | 'closed'>('open');
  const [selectedIssue, setSelectedIssue] = useState<IssueDoc | null>(null);
  const [issueComments, setIssueComments] = useState<CommentDoc[]>([]);
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [issueLabels, setIssueLabels] = useState<string[]>(['enhancement']);
  const [commentBody, setCommentBody] = useState('');

  // Projects state
  const [tasks, setTasks] = useState<ProjectTaskDoc[]>([]);
  const [boardLayout, setBoardLayout] = useState<'kanban' | 'table'>('kanban');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCol, setTaskCol] = useState<ProjectTaskDoc['column']>('todo');
  const [taskPriority, setTaskPriority] = useState<ProjectTaskDoc['priority']>('medium');

  // Discussions state
  const [discussions, setDiscussions] = useState<DiscussionDoc[]>([]);
  const [selectedDiscussion, setSelectedDiscussion] = useState<DiscussionDoc | null>(null);
  const [discComments, setDiscComments] = useState<CommentDoc[]>([]);
  const [newDiscOpen, setNewDiscOpen] = useState(false);
  const [discTitle, setDiscTitle] = useState('');
  const [discBody, setDiscBody] = useState('');
  const [discCategory, setDiscCategory] = useState<DiscussionDoc['category']>('q_and_a');
  const [discReply, setDiscReply] = useState('');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    if (repo.isShowcase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const uid = firebaseUser?.uid;
      if (mode === 'issues') {
        const list = await firestoreRepo.listIssues(repo.id, repo.visibility, uid);
        list.sort((a, b) => b.number - a.number);
        setIssues(list);
      } else if (mode === 'projects') {
        const list = await firestoreRepo.listProjectTasks(repo.id, repo.visibility, uid);
        setTasks(list);
      } else {
        const list = await firestoreRepo.listDiscussions(repo.id, repo.visibility, uid);
        setDiscussions(list);
      }
    } catch (err) {
      pushToast({ type: 'error', title: 'Failed to load', message: err instanceof Error ? err.message : 'Unable to fetch data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIssue(null);
    setSelectedDiscussion(null);
    void loadData();
  }, [repo.id, mode, firebaseUser?.uid]);

  const openIssueDetail = async (iss: IssueDoc) => {
    setSelectedIssue(iss);
    try {
      const comments = await firestoreRepo.listIssueComments(repo.id, iss.id, repo.visibility, firebaseUser?.uid);
      setIssueComments(comments);
    } catch {
      setIssueComments([]);
    }
  };

  const openDiscussionDetail = async (disc: DiscussionDoc) => {
    setSelectedDiscussion(disc);
    try {
      const comments = await firestoreRepo.listDiscussionComments(repo.id, disc.id, repo.visibility, firebaseUser?.uid);
      setDiscComments(comments);
    } catch {
      setDiscComments([]);
    }
  };

  if (repo.isShowcase) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8 text-center space-y-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Showcase Repository Reference
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          {repo.fullName} is a read-only starter template backed by a real Git repository on disk. Use the{' '}
          <strong>Fork</strong> button above to clone it into your account with live Firestore issues, projects, and discussions.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800/40 animate-pulse" />;
  }

  // -------------------------------------------------------
  // ISSUES VIEW
  // -------------------------------------------------------
  if (mode === 'issues') {
    const handleCreateIssue = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!firebaseUser || !profile) {
        pushToast({ type: 'info', title: 'Sign in required', message: 'Sign in to open an issue.' });
        return;
      }
      if (!issueTitle.trim()) return;
      setBusy(true);
      try {
        const nextNum = issues.reduce((max, i) => Math.max(max, i.number), 0) + 1;
        const created = await firestoreRepo.createIssue(repo, {
          number: nextNum,
          title: issueTitle.trim(),
          body: issueBody.trim(),
          labels: issueLabels,
          authorId: firebaseUser.uid,
          authorUsername: profile.username,
        });
        await firestoreRepo.logActivity({
          actorId: firebaseUser.uid,
          actorUsername: profile.username,
          type: 'issue_opened',
          repoId: repo.id,
          repoFullName: repo.fullName,
          summary: `Opened issue #${nextNum}: ${issueTitle.trim()}`,
          visibility: repo.visibility,
        });
        setIssues((prev) => [created, ...prev]);
        setIssueTitle('');
        setIssueBody('');
        setNewIssueOpen(false);
        pushToast({ type: 'success', title: `Issue #${nextNum} opened` });
      } catch (err) {
        pushToast({ type: 'error', title: 'Create issue failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    const handleToggleStatus = async (iss: IssueDoc) => {
      const nextStatus = iss.status === 'open' ? 'closed' : 'open';
      try {
        await firestoreRepo.updateIssue(repo.id, iss.id, { status: nextStatus });
        setIssues((prev) => prev.map((x) => (x.id === iss.id ? { ...x, status: nextStatus } : x)));
        setSelectedIssue((prev) => (prev && prev.id === iss.id ? { ...prev, status: nextStatus } : prev));
        pushToast({ type: 'success', title: `Issue ${nextStatus}` });
      } catch (err) {
        pushToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Error' });
      }
    };

    const handleAddIssueComment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedIssue || !firebaseUser || !profile || !commentBody.trim()) return;
      setBusy(true);
      try {
        const added = await firestoreRepo.addIssueComment(repo, selectedIssue.id, {
          authorId: firebaseUser.uid,
          authorUsername: profile.username,
          body: commentBody.trim(),
        });
        setIssueComments((prev) => [...prev, added]);
        setCommentBody('');
        setSelectedIssue((prev) => (prev ? { ...prev, commentsCount: prev.commentsCount + 1 } : prev));
        pushToast({ type: 'success', title: 'Comment posted' });
      } catch (err) {
        pushToast({ type: 'error', title: 'Comment failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    const filteredIssues = issues.filter((i) => issueFilter === 'all' || i.status === issueFilter);

    if (selectedIssue) {
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => setSelectedIssue(null)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
              >
                ← Back to Issues
              </button>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                {selectedIssue.title} <span className="font-mono text-slate-400 font-normal">#{selectedIssue.number}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {selectedIssue.status.toUpperCase()} · Opened by @{selectedIssue.authorUsername}
                {selectedIssue.labels && selectedIssue.labels.length > 0 ? ` · ${selectedIssue.labels.join(', ')}` : ''}
              </p>
            </div>

            {(isOwner || firebaseUser?.uid === selectedIssue.authorId) && (
              <button
                type="button"
                onClick={() => void handleToggleStatus(selectedIssue)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {selectedIssue.status === 'open' ? 'Close Issue' : 'Reopen Issue'}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
            <MarkdownView content={selectedIssue.body || '*No description provided.*'} />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Discussion ({issueComments.length})
            </h3>
            {issueComments.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 space-y-2">
                <p className="text-xs font-medium text-slate-500">@{c.authorUsername}</p>
                <MarkdownView content={c.body} />
              </div>
            ))}
          </div>

          {firebaseUser && (
            <form onSubmit={handleAddIssueComment} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 space-y-3">
              <label htmlFor="issue-comment" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Add a comment (Markdown supported)
              </label>
              <textarea
                id="issue-comment"
                rows={4}
                required
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a reply..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{busy ? 'Posting...' : 'Comment'}</span>
              </button>
            </form>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {(['open', 'closed', 'all'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setIssueFilter(status)}
                className={`px-3 py-1.5 rounded-lg font-medium ${
                  issueFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {status[0].toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {firebaseUser && (
            <button
              type="button"
              onClick={() => setNewIssueOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Issue</span>
            </button>
          )}
        </div>

        {newIssueOpen && (
          <form onSubmit={handleCreateIssue} className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D111A] p-5 space-y-3">
            <h3 className="text-sm font-semibold">Open New Issue</h3>
            <input
              type="text"
              required
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="Issue title"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <textarea
              rows={5}
              value={issueBody}
              onChange={(e) => setIssueBody(e.target.value)}
              placeholder="Describe steps to reproduce or implementation details (Markdown supported)..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Labels:</span>
              {LABEL_OPTIONS.map((lbl) => {
                const active = issueLabels.includes(lbl);
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() =>
                      setIssueLabels((prev) => (active ? prev.filter((x) => x !== lbl) : [...prev, lbl]))
                    }
                    className={`px-2.5 py-1 rounded border text-xs ${
                      active
                        ? 'border-blue-500 bg-blue-600/15 text-blue-600 dark:text-blue-400'
                        : 'border-slate-300 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewIssueOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"
              >
                {busy ? 'Creating...' : 'Submit Issue'}
              </button>
            </div>
          </form>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] divide-y divide-slate-200 dark:divide-slate-800">
          {filteredIssues.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No {issueFilter === 'all' ? '' : issueFilter} issues found for {repo.fullName}.
            </div>
          ) : (
            filteredIssues.map((iss) => (
              <div key={iss.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <div className="flex items-start gap-3 min-w-0">
                  {iss.status === 'open' ? (
                    <CircleDot className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => void openIssueDetail(iss)}
                      className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-500 text-left"
                    >
                      {iss.title}
                    </button>
                    <p className="text-xs text-slate-500 mt-0.5">
                      #{iss.number} opened by @{iss.authorUsername}
                      {iss.labels && iss.labels.length > 0 ? ` · ${iss.labels.join(', ')}` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 shrink-0 tabular-nums">{iss.commentsCount} comments</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // PROJECTS BOARD VIEW (KANBAN + TABLE)
  // -------------------------------------------------------
  if (mode === 'projects') {
    const columns: Array<{ key: ProjectTaskDoc['column']; label: string }> = [
      { key: 'todo', label: 'To Do' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'review', label: 'In Review' },
      { key: 'done', label: 'Done' },
    ];

    const handleCreateTask = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!firebaseUser || !taskTitle.trim()) return;
      setBusy(true);
      try {
        const created = await firestoreRepo.createProjectTask(repo, {
          title: taskTitle.trim(),
          description: taskDesc.trim(),
          column: taskCol,
          priority: taskPriority,
          authorId: firebaseUser.uid,
          assigneeUsername: profile?.username || '',
        });
        setTasks((prev) => [...prev, created]);
        setTaskTitle('');
        setTaskDesc('');
        setNewTaskOpen(false);
        pushToast({ type: 'success', title: 'Task added to project board' });
      } catch (err) {
        pushToast({ type: 'error', title: 'Task creation failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    const handleMoveColumn = async (taskId: string, nextCol: ProjectTaskDoc['column']) => {
      try {
        await firestoreRepo.updateProjectTask(repo.id, taskId, { column: nextCol });
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, column: nextCol } : t)));
      } catch (err) {
        pushToast({ type: 'error', title: 'Move failed', message: err instanceof Error ? err.message : 'Error' });
      }
    };

    const handleDeleteTask = async (taskId: string) => {
      try {
        await firestoreRepo.deleteProjectTask(repo.id, taskId);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      } catch (err) {
        pushToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Error' });
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setBoardLayout('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium ${
                boardLayout === 'kanban' ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>
            <button
              type="button"
              onClick={() => setBoardLayout('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium ${
                boardLayout === 'table' ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
          </div>

          {isOwner && (
            <button
              type="button"
              onClick={() => setNewTaskOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          )}
        </div>

        {newTaskOpen && (
          <form onSubmit={handleCreateTask} className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D111A] p-5 space-y-3">
            <h3 className="text-sm font-semibold">New Project Task</h3>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <textarea
              rows={2}
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="Optional task details..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <select
                value={taskCol}
                onChange={(e) => setTaskCol(e.target.value as ProjectTaskDoc['column'])}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F]"
              >
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as ProjectTaskDoc['priority'])}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F]"
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
              <button type="submit" disabled={busy} className="ml-auto px-4 py-1.5 rounded-lg bg-blue-600 text-white font-medium">
                {busy ? 'Saving...' : 'Create Task'}
              </button>
            </div>
          </form>
        )}

        {boardLayout === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {columns.map((col) => {
              const colTasks = tasks.filter((t) => t.column === col.key);
              return (
                <div key={col.key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0A0E17] p-3.5 space-y-3 min-h-[260px]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">{col.label}</h3>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">{colTasks.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {colTasks.map((t) => (
                      <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{t.title}</p>
                          {isOwner && (
                            <button
                              type="button"
                              aria-label={`Delete task ${t.title}`}
                              onClick={() => void handleDeleteTask(t.id)}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {t.description && <p className="text-[11px] text-slate-500">{t.description}</p>}
                        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                          <span className="capitalize">{t.priority}</span>
                          {isOwner && (
                            <select
                              aria-label={`Move task ${t.title}`}
                              value={t.column}
                              onChange={(e) => void handleMoveColumn(t.id, e.target.value as ProjectTaskDoc['column'])}
                              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-[11px]"
                            >
                              {columns.map((c) => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0A0E17] text-slate-500">
                <tr>
                  <th className="p-3 font-medium">Task</th>
                  <th className="p-3 font-medium">Column</th>
                  <th className="p-3 font-medium">Priority</th>
                  <th className="p-3 font-medium">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">No tasks on this project board yet.</td>
                  </tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{t.title}</td>
                      <td className="p-3 text-slate-500">{columns.find((c) => c.key === t.column)?.label}</td>
                      <td className="p-3 capitalize text-slate-500">{t.priority}</td>
                      <td className="p-3 text-slate-500">{t.assigneeUsername ? `@${t.assigneeUsername}` : 'Unassigned'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------
  // DISCUSSIONS / Q&A VIEW
  // -------------------------------------------------------
  const handleCreateDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !discTitle.trim() || !discBody.trim()) return;
    setBusy(true);
    try {
      const created = await firestoreRepo.createDiscussion(repo, {
        title: discTitle.trim(),
        body: discBody.trim(),
        category: discCategory,
        authorId: firebaseUser.uid,
        authorUsername: profile.username,
      });
      setDiscussions((prev) => [created, ...prev]);
      setDiscTitle('');
      setDiscBody('');
      setNewDiscOpen(false);
      pushToast({ type: 'success', title: 'Discussion posted' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Post failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleUpvote = async (disc: DiscussionDoc) => {
    if (!firebaseUser) return;
    try {
      await firestoreRepo.upvoteDiscussion(repo.id, disc.id);
      setDiscussions((prev) => prev.map((d) => (d.id === disc.id ? { ...d, upvotesCount: d.upvotesCount + 1 } : d)));
      setSelectedDiscussion((prev) => (prev && prev.id === disc.id ? { ...prev, upvotesCount: prev.upvotesCount + 1 } : prev));
    } catch (err) {
      pushToast({ type: 'error', title: 'Upvote failed', message: err instanceof Error ? err.message : 'Error' });
    }
  };

  const handlePostDiscReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDiscussion || !firebaseUser || !profile || !discReply.trim()) return;
    setBusy(true);
    try {
      const c = await firestoreRepo.addDiscussionComment(repo, selectedDiscussion.id, {
        authorId: firebaseUser.uid,
        authorUsername: profile.username,
        body: discReply.trim(),
      });
      setDiscComments((prev) => [...prev, c]);
      setDiscReply('');
      setSelectedDiscussion((prev) => (prev ? { ...prev, commentsCount: prev.commentsCount + 1 } : prev));
    } catch (err) {
      pushToast({ type: 'error', title: 'Reply failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  if (selectedDiscussion) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setSelectedDiscussion(null)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
            >
              ← Back to Discussions
            </button>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">{selectedDiscussion.title}</h2>
            <p className="text-xs text-slate-500 mt-1">
              @{selectedDiscussion.authorUsername} · {selectedDiscussion.category.replace('_', ' ')} ·{' '}
              {selectedDiscussion.isAnswered ? 'Answered' : 'Open'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleUpvote(selectedDiscussion)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              <span>Upvote ({selectedDiscussion.upvotesCount})</span>
            </button>
            {(isOwner || firebaseUser?.uid === selectedDiscussion.authorId) && (
              <button
                type="button"
                onClick={async () => {
                  const next = !selectedDiscussion.isAnswered;
                  await firestoreRepo.toggleDiscussionAnswered(repo.id, selectedDiscussion.id, next);
                  setSelectedDiscussion({ ...selectedDiscussion, isAnswered: next });
                }}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
              >
                {selectedDiscussion.isAnswered ? 'Unmark Answered' : 'Mark as Answered'}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
          <MarkdownView content={selectedDiscussion.body} />
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Replies ({discComments.length})</h3>
          {discComments.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500">@{c.authorUsername}</p>
              <MarkdownView content={c.body} />
            </div>
          ))}
        </div>

        {firebaseUser && (
          <form onSubmit={handlePostDiscReply} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 space-y-3">
            <textarea
              rows={4}
              required
              value={discReply}
              onChange={(e) => setDiscReply(e.target.value)}
              placeholder="Share your answer or thoughts..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
              {busy ? 'Posting...' : 'Post Reply'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Community Q&A, architecture ideas, and announcements for {repo.fullName}.</p>
        {firebaseUser && (
          <button
            type="button"
            onClick={() => setNewDiscOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Start Discussion</span>
          </button>
        )}
      </div>

      {newDiscOpen && (
        <form onSubmit={handleCreateDiscussion} className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D111A] p-5 space-y-3">
          <h3 className="text-sm font-semibold">Start New Discussion</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={discTitle}
              onChange={(e) => setDiscTitle(e.target.value)}
              placeholder="Topic title"
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <select
              value={discCategory}
              onChange={(e) => setDiscCategory(e.target.value as DiscussionDoc['category'])}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
            >
              <option value="q_and_a">Q&A</option>
              <option value="ideas">Ideas</option>
              <option value="general">General</option>
              <option value="announcements">Announcements</option>
            </select>
          </div>
          <textarea
            rows={5}
            required
            value={discBody}
            onChange={(e) => setDiscBody(e.target.value)}
            placeholder="Write your question or proposal..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {busy ? 'Publishing...' : 'Publish Discussion'}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] divide-y divide-slate-200 dark:divide-slate-800">
        {discussions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No discussions started yet.</div>
        ) : (
          discussions.map((d) => (
            <div key={d.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <div className="flex items-start gap-3 min-w-0">
                <MessageSquare className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => void openDiscussionDetail(d)}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-500 text-left"
                  >
                    {d.title}
                  </button>
                  <p className="text-xs text-slate-500 mt-0.5">
                    @{d.authorUsername} · {d.category.replace('_', ' ')}
                    {d.isAnswered ? ' · Answered' : ''}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                {d.upvotesCount} upvotes · {d.commentsCount} replies
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
