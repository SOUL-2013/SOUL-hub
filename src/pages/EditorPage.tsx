import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  FileCode2,
  FolderGit2,
  GitBranch,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { MarkdownView } from '../components/MarkdownView';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { gitApi, type GitBranchInfo, type ShowcaseRepoResponse } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import { getMonacoLanguage } from '../lib/validation';
import type { RepositoryDoc } from '../types/domain';

interface OpenTab {
  path: string;
  originalContent: string;
  content: string;
  isNew?: boolean;
}

export function EditorPage({ owner, slug }: { owner?: string; slug?: string }) {
  const { firebaseUser, profile } = useAuth();
  const { theme } = useTheme();
  const { pushToast } = useToast();
  const { navigate } = useRouter();

  const [availableRepos, setAvailableRepos] = useState<Array<{ ownerUsername: string; slug: string; fullName: string; isShowcase?: boolean; defaultBranch: string }>>([]);
  const [selectedOwner, setSelectedOwner] = useState(owner || '');
  const [selectedSlug, setSelectedSlug] = useState(slug || '');
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [activeBranch, setActiveBranch] = useState('main');
  const [filePaths, setFilePaths] = useState<Array<{ path: string; size: number }>>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [deletedPaths, setDeletedPaths] = useState<string[]>([]);

  const [fontSize, setFontSize] = useState(14);
  const [splitPreview, setSplitPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);

  // Load repository choices
  useEffect(() => {
    const loadChoices = async () => {
      const choices: Array<{ ownerUsername: string; slug: string; fullName: string; isShowcase?: boolean; defaultBranch: string }> = [];
      try {
        const show = await gitApi.getShowcase();
        show.repositories.forEach((r: ShowcaseRepoResponse) =>
          choices.push({ ownerUsername: r.ownerUsername, slug: r.slug, fullName: r.fullName, isShowcase: true, defaultBranch: r.defaultBranch })
        );
      } catch {
        // ignore
      }
      if (firebaseUser) {
        try {
          const owned: RepositoryDoc[] = await firestoreRepo.listUserRepositories(firebaseUser.uid);
          owned.forEach((r) =>
            choices.push({ ownerUsername: r.ownerUsername, slug: r.slug, fullName: r.fullName, isShowcase: false, defaultBranch: r.defaultBranch })
          );
        } catch {
          // ignore
        }
      }
      setAvailableRepos(choices);
      if (!owner && !slug && choices.length > 0) {
        const preferred = choices.find((c) => !c.isShowcase) || choices[0];
        setSelectedOwner(preferred.ownerUsername);
        setSelectedSlug(preferred.slug);
      }
    };
    void loadChoices();
  }, [firebaseUser?.uid, owner, slug]);

  useEffect(() => {
    if (owner && slug) {
      setSelectedOwner(owner);
      setSelectedSlug(slug);
    }
  }, [owner, slug]);

  // Load files & branches for active repository
  useEffect(() => {
    if (!selectedOwner || !selectedSlug) {
      setLoading(false);
      return;
    }
    const loadRepoWorkspace = async () => {
      setLoading(true);
      try {
        const summary = await gitApi.getSummary(selectedOwner, selectedSlug, 'main').catch(() =>
          gitApi.getSummary(selectedOwner, selectedSlug, 'HEAD')
        );
        setBranches(summary.branches);
        const branchName = summary.manifest.defaultBranch || summary.branches[0]?.name || 'main';
        setActiveBranch(branchName);
        const all = await gitApi.getAllFiles(selectedOwner, selectedSlug, branchName);
        setFilePaths(all.files);
        setOpenTabs([]);
        setDeletedPaths([]);

        const starterFile =
          all.files.find((f) => f.path.toLowerCase() === 'readme.md') ||
          all.files.find((f) => f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.html')) ||
          all.files[0];

        if (starterFile) {
          const blob = await gitApi.getBlob(selectedOwner, selectedSlug, branchName, starterFile.path);
          if (!blob.isBinary && blob.text !== null) {
            setOpenTabs([{ path: starterFile.path, originalContent: blob.text, content: blob.text }]);
            setActiveFilePath(starterFile.path);
          }
        }
      } catch (err) {
        pushToast({ type: 'error', title: 'Workspace load failed', message: err instanceof Error ? err.message : 'Unable to load files.' });
      } finally {
        setLoading(false);
      }
    };
    void loadRepoWorkspace();
  }, [selectedOwner, selectedSlug]);

  const openFile = async (filePath: string) => {
    const existing = openTabs.find((t) => t.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }
    try {
      const blob = await gitApi.getBlob(selectedOwner, selectedSlug, activeBranch, filePath);
      if (blob.isBinary || blob.text === null) {
        pushToast({ type: 'info', title: 'Binary file', message: `${filePath} is binary and cannot be edited in Monaco.` });
        return;
      }
      setOpenTabs((prev) => [...prev, { path: filePath, originalContent: blob.text || '', content: blob.text || '' }]);
      setActiveFilePath(filePath);
    } catch (err) {
      pushToast({ type: 'error', title: 'Read error', message: err instanceof Error ? err.message : 'Failed to read file.' });
    }
  };

  const switchBranch = async (branchName: string) => {
    setActiveBranch(branchName);
    try {
      const all = await gitApi.getAllFiles(selectedOwner, selectedSlug, branchName);
      setFilePaths(all.files);
      setOpenTabs([]);
      setDeletedPaths([]);
      setActiveFilePath('');
    } catch {
      setFilePaths([]);
    }
  };

  const activeTab = openTabs.find((t) => t.path === activeFilePath) || null;
  const dirtyTabs = useMemo(() => openTabs.filter((t) => t.isNew || t.content !== t.originalContent), [openTabs]);
  const isSelectedShowcase = availableRepos.find((r) => r.ownerUsername === selectedOwner && r.slug === selectedSlug)?.isShowcase;
  const canCommit = Boolean(firebaseUser && profile && selectedOwner === profile.username && !isSelectedShowcase);

  const handleCreateTab = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFilePath.trim().replace(/^\/+/, '');
    if (!cleaned) return;
    if (!openTabs.some((t) => t.path === cleaned)) {
      setOpenTabs((prev) => [...prev, { path: cleaned, originalContent: '', content: '', isNew: true }]);
    }
    setActiveFilePath(cleaned);
    setNewFilePath('');
    setNewFileOpen(false);
  };

  const handleStageDelete = (filePath: string) => {
    setDeletedPaths((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
    setOpenTabs((prev) => prev.filter((t) => t.path !== filePath));
    setFilePaths((prev) => prev.filter((f) => f.path !== filePath));
    if (activeFilePath === filePath) {
      setActiveFilePath('');
    }
  };

  const handleCommitAll = async () => {
    if (!canCommit) {
      pushToast({
        type: 'info',
        title: isSelectedShowcase ? 'Showcase repository is read-only' : 'Read-only workspace',
        message: 'Fork the repository into your account or select one of your own repositories to commit changes.',
      });
      return;
    }
    if (dirtyTabs.length === 0 && deletedPaths.length === 0) {
      pushToast({ type: 'info', title: 'No changes to commit' });
      return;
    }
    setCommitting(true);
    try {
      const filesPayload: Array<{ action: 'upsert' | 'delete'; path: string; contentBase64?: string }> = [
        ...dirtyTabs.map((t) => ({
          action: 'upsert' as const,
          path: t.path,
          contentBase64: btoa(unescape(encodeURIComponent(t.content))),
        })),
        ...deletedPaths.map((p) => ({ action: 'delete' as const, path: p })),
      ];
      const msg = commitMessage.trim() || `Update ${dirtyTabs.length + deletedPaths.length} file(s) from SOUL HUB Editor`;
      const res = await gitApi.commitFiles(selectedOwner, selectedSlug, {
        branch: activeBranch,
        message: msg,
        files: filesPayload,
      });
      setOpenTabs((prev) => prev.map((t) => ({ ...t, originalContent: t.content, isNew: false })));
      setDeletedPaths([]);
      setCommitMessage('');
      const refreshed = await gitApi.getAllFiles(selectedOwner, selectedSlug, activeBranch);
      setFilePaths(refreshed.files);
      pushToast({ type: 'success', title: 'Committed to Git', message: `${res.commitSha.slice(0, 7)} on ${activeBranch}` });
    } catch (err) {
      pushToast({ type: 'error', title: 'Commit failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setCommitting(false);
    }
  };

  useEffect(() => {
    const onSaveKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canCommit && (dirtyTabs.length > 0 || deletedPaths.length > 0)) {
          void handleCommitAll();
        } else {
          pushToast({ type: 'info', title: 'Draft buffered in editor tab' });
        }
      }
    };
    window.addEventListener('keydown', onSaveKey);
    return () => window.removeEventListener('keydown', onSaveKey);
  });

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-[#07090F]' : 'min-h-[calc(100vh-4rem)]'} flex flex-col`}>
      {/* Editor Top Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0E17] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <FolderGit2 className="w-4 h-4 text-blue-500" />
          <select
            aria-label="Select repository"
            value={selectedOwner && selectedSlug ? `${selectedOwner}/${selectedSlug}` : ''}
            onChange={(e) => {
              const [o, s] = e.target.value.split('/');
              if (o && s) navigate(`/repo/${o}/${s}/edit`);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
          >
            {availableRepos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}{r.isShowcase ? ' (showcase)' : ''}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="Select branch"
              value={activeBranch}
              onChange={(e) => void switchBranch(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          <select
            aria-label="Editor font size"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
          >
            <option value={12}>12px</option>
            <option value={14}>14px</option>
            <option value={16}>16px</option>
          </select>

          <button
            type="button"
            onClick={() => setSplitPreview((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
              splitPreview ? 'border-blue-500 text-blue-500' : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            {splitPreview ? 'Hide Preview' : 'Markdown Preview'}
          </button>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label="Toggle fullscreen editor"
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message..."
            className="w-40 sm:w-52 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
          />
          <button
            type="button"
            disabled={committing}
            onClick={() => void handleCommitAll()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {committing ? 'Committing...' : `Commit (${dirtyTabs.length + deletedPaths.length})`}
            </span>
          </button>
          {selectedOwner && selectedSlug && (
            <Link
              to={`/repo/${selectedOwner}/${selectedSlug}`}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
            >
              Exit
            </Link>
          )}
        </div>
      </div>

      {/* Main IDE Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
        {/* File Tree Sidebar */}
        <aside className="lg:col-span-3 xl:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0A0E17] flex flex-col">
          <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Files</span>
            {canCommit && (
              <button
                type="button"
                aria-label="New file"
                onClick={() => setNewFileOpen((v) => !v)}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {newFileOpen && (
            <form onSubmit={handleCreateTab} className="p-2 border-b border-slate-200 dark:border-slate-800 flex gap-1">
              <input
                type="text"
                required
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="src/new.ts"
                className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-xs font-mono"
              />
              <button type="submit" className="px-2 py-1 rounded bg-blue-600 text-white text-xs">
                Add
              </button>
            </form>
          )}

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-60 lg:max-h-none">
            {loading ? (
              <p className="p-3 text-xs text-slate-500">Loading repository tree...</p>
            ) : (
              filePaths.map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs font-mono ${
                    activeFilePath === f.path
                      ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void openFile(f.path)}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left truncate"
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{f.path}</span>
                  </button>
                  {canCommit && (
                    <button
                      type="button"
                      aria-label={`Delete ${f.path}`}
                      onClick={() => handleStageDelete(f.path)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Tabs + Monaco Surface */}
        <div className="lg:col-span-9 xl:col-span-10 flex flex-col bg-white dark:bg-[#07090F]">
          <div className="flex items-center overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#0A0E17]">
            {openTabs.map((tab) => {
              const isDirty = tab.isNew || tab.content !== tab.originalContent;
              const active = tab.path === activeFilePath;
              return (
                <div
                  key={tab.path}
                  className={`flex items-center gap-2 px-3 py-2 border-r border-slate-200 dark:border-slate-800 text-xs font-mono shrink-0 ${
                    active ? 'bg-white dark:bg-[#07090F] text-blue-600 dark:text-blue-400' : 'text-slate-500'
                  }`}
                >
                  <button type="button" onClick={() => setActiveFilePath(tab.path)} className="truncate max-w-[180px]">
                    {tab.path}{isDirty ? ' *' : ''}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.path}`}
                    onClick={() => {
                      const next = openTabs.filter((t) => t.path !== tab.path);
                      setOpenTabs(next);
                      if (activeFilePath === tab.path) {
                        setActiveFilePath(next[0]?.path || '');
                      }
                    }}
                    className="hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {activeTab ? (
            <div className={`flex-1 grid ${splitPreview ? 'grid-cols-1 md:grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800' : 'grid-cols-1'} min-h-[calc(100vh-11rem)]`}>
              <div className="h-[calc(100vh-11rem)] min-h-[540px]">
                <Editor
                  height="100%"
                  language={getMonacoLanguage(activeTab.path)}
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  value={activeTab.content}
                  onChange={(val) => {
                    const nextVal = val ?? '';
                    setOpenTabs((prev) =>
                      prev.map((t) => (t.path === activeTab.path ? { ...t, content: nextVal } : t))
                    );
                  }}
                  options={{
                    fontSize,
                    fontFamily: 'JetBrains Mono, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                  }}
                />
              </div>
              {splitPreview && (
                <div className="p-6 overflow-y-auto max-h-[640px] bg-white dark:bg-[#0D111A]">
                  <MarkdownView content={activeTab.content} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center text-sm text-slate-500">
              Select a file from the left tree or create a new file to start editing in Monaco.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
