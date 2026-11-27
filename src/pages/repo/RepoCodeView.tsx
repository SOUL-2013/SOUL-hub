import { useEffect, useState } from 'react';
import { Check, Copy, Download, Edit3, FileCode2, History, Search, Trash2, Users } from 'lucide-react';
import { CodeHighlighter } from '../../components/CodeHighlighter';
import { MarkdownView } from '../../components/MarkdownView';
import { useToast } from '../../context/ToastContext';
import { gitApi, type GitBranchInfo, type GitCommitInfo } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { detectLanguageFromFilename, formatBytes } from '../../lib/validation';
import type { RepositoryDoc } from '../../types/domain';

export function RepoCodeView({
  repo,
  branches,
  activeRef,
  isOwner,
  onChangeRef,
  onReload,
}: {
  repo: RepositoryDoc;
  branches: GitBranchInfo[];
  activeRef: string;
  isOwner: boolean;
  onChangeRef: (ref: string) => void;
  onReload: () => void;
}) {
  const { search, navigate } = useRouter();
  const { pushToast, confirm } = useToast();
  const params = new URLSearchParams(search);
  const initialPath = params.get('path') || '';
  const initialLine = params.get('line') ? Number(params.get('line')) : null;

  const [files, setFiles] = useState<Array<{ path: string; size: number }>>([]);
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [viewMode, setViewMode] = useState<'code' | 'blame' | 'history' | 'edit'>('code');
  const [blob, setBlob] = useState<{ size: number; isBinary: boolean; text: string | null; base64: string | null } | null>(null);
  const [blame, setBlame] = useState<Array<{ lineNumber: number; sha: string; author: string; date: string; content: string }>>([]);
  const [fileCommits, setFileCommits] = useState<GitCommitInfo[]>([]);
  const [editText, setEditText] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [treeFilter, setTreeFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    gitApi.getAllFiles(repo.ownerUsername, repo.slug, activeRef).then((res) => {
      setFiles(res.files);
      if (!selectedPath && res.files.length > 0) {
        const readme = res.files.find((f) => f.path.toLowerCase() === 'readme.md');
        setSelectedPath(readme ? readme.path : res.files[0].path);
      }
    });
  }, [repo.ownerUsername, repo.slug, activeRef]);

  useEffect(() => {
    if (!selectedPath) return;
    gitApi
      .getBlob(repo.ownerUsername, repo.slug, activeRef, selectedPath)
      .then((res) => {
        setBlob(res);
        setEditText(res.text || '');
      })
      .catch(() => setBlob(null));

    if (viewMode === 'blame') {
      gitApi
        .getBlame(repo.ownerUsername, repo.slug, activeRef, selectedPath)
        .then((res) => setBlame(res.blame))
        .catch(() => setBlame([]));
    } else if (viewMode === 'history') {
      gitApi
        .getCommits(repo.ownerUsername, repo.slug, activeRef, selectedPath)
        .then((res) => setFileCommits(res.commits))
        .catch(() => setFileCommits([]));
    }
  }, [repo.ownerUsername, repo.slug, activeRef, selectedPath, viewMode]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPath) return;
    setBusy(true);
    try {
      const base64 = btoa(unescape(encodeURIComponent(editText)));
      await gitApi.commitFiles(repo.ownerUsername, repo.slug, {
        branch: activeRef,
        message: commitMessage.trim() || `Update ${selectedPath}`,
        files: [{ action: 'upsert', path: selectedPath, contentBase64: base64 }],
      });
      pushToast({ type: 'success', title: 'Changes committed', message: `${selectedPath} updated on ${activeRef}` });
      setCommitMessage('');
      setViewMode('code');
      onReload();
    } catch (err) {
      pushToast({ type: 'error', title: 'Commit failed', message: err instanceof Error ? err.message : 'Unable to save.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedPath) return;
    const ok = await confirm({
      title: `Delete ${selectedPath}?`,
      message: `This will commit the removal of ${selectedPath} from branch ${activeRef}.`,
      confirmLabel: 'Delete File',
      destructive: true,
    });
    if (!ok) return;
    await gitApi.commitFiles(repo.ownerUsername, repo.slug, {
      branch: activeRef,
      message: `Delete ${selectedPath}`,
      files: [{ action: 'delete', path: selectedPath }],
    });
    pushToast({ type: 'success', title: 'File deleted' });
    setSelectedPath('');
    onReload();
  };

  const filteredFiles = files.filter((f) => !treeFilter.trim() || f.path.toLowerCase().includes(treeFilter.toLowerCase()));
  const lang = detectLanguageFromFilename(selectedPath);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar Tree */}
      <aside className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-hidden flex flex-col max-h-[75vh]">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <select
            aria-label="Active branch"
            value={activeRef}
            onChange={(e) => onChangeRef(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
          >
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              placeholder="Filter files..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#07090F] text-xs"
            />
          </div>
        </div>
        <div className="overflow-y-auto p-1.5 space-y-0.5 flex-1">
          {filteredFiles.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => {
                setSelectedPath(f.path);
                setViewMode('code');
                navigate(`/repo/${repo.ownerUsername}/${repo.slug}/code?ref=${encodeURIComponent(activeRef)}&path=${encodeURIComponent(f.path)}`);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs font-mono truncate transition-colors ${
                selectedPath === f.path
                  ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Code / Blame / History Viewer */}
      <div className="lg:col-span-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0A0E17] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedPath || 'Select a file'}</p>
            {blob && (
              <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                {lang} · {formatBytes(blob.size)}
              </p>
            )}
          </div>

          {selectedPath && (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800/70">
                <button
                  type="button"
                  onClick={() => setViewMode('code')}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${viewMode === 'code' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('blame')}
                  className={`px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${viewMode === 'blame' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  <Users className="w-3 h-3" />
                  <span>Blame</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('history')}
                  className={`px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${viewMode === 'history' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  <History className="w-3 h-3" />
                  <span>History</span>
                </button>
              </div>

              {blob?.text !== null && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(blob?.text || '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  aria-label="Copy file contents"
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}

              <a
                href={`/api/git/${encodeURIComponent(repo.ownerUsername)}/${encodeURIComponent(repo.slug)}/raw?ref=${encodeURIComponent(activeRef)}&path=${encodeURIComponent(selectedPath)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Raw</span>
              </a>

              {isOwner && !repo.isArchived && !blob?.isBinary && (
                <>
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'edit' ? 'code' : 'edit')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{viewMode === 'edit' ? 'Cancel Edit' : 'Edit'}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete file"
                    onClick={handleDeleteFile}
                    className="p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {!blob ? (
          <div className="p-10 text-center text-sm text-slate-500">Select a file from the tree to inspect it.</div>
        ) : viewMode === 'edit' ? (
          <form onSubmit={handleSaveEdit} className="p-4 space-y-3">
            <textarea
              rows={20}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full p-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono text-xs leading-5"
            />
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={`Update ${selectedPath}`}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? 'Committing...' : 'Commit Changes'}
              </button>
            </div>
          </form>
        ) : viewMode === 'blame' ? (
          <div className="overflow-x-auto text-xs font-mono">
            <table className="w-full border-collapse">
              <tbody>
                {blame.map((row) => (
                  <tr key={row.lineNumber} className="border-b border-slate-100 dark:border-slate-800/60">
                    <td className="px-3 py-1 text-slate-400 whitespace-nowrap w-24">{row.sha}</td>
                    <td className="px-3 py-1 text-blue-500 whitespace-nowrap w-36 truncate">{row.author}</td>
                    <td className="px-3 py-1 text-slate-400 whitespace-nowrap w-28 tabular-nums">{row.date}</td>
                    <td className="px-3 py-1 text-slate-500 text-right w-10 tabular-nums">{row.lineNumber}</td>
                    <td className="px-3 py-1 whitespace-pre text-slate-800 dark:text-slate-200">{row.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'history' ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {fileCommits.map((c) => (
              <div key={c.sha} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{c.message}</p>
                  <p className="text-slate-500 mt-0.5">
                    {c.authorName} · {new Date(c.date).toLocaleString()}
                  </p>
                </div>
                <span className="font-mono text-blue-500">{c.shortSha}</span>
              </div>
            ))}
          </div>
        ) : blob.isBinary ? (
          <div className="p-8 text-center">
            {/\.(png|jpe?g|gif|webp)$/i.test(selectedPath) && blob.base64 ? (
              <img
                src={`data:image/*;base64,${blob.base64}`}
                alt={selectedPath}
                className="max-w-full max-h-96 mx-auto rounded-lg border border-slate-200 dark:border-slate-800"
              />
            ) : (
              <p className="text-sm text-slate-500">Binary file ({formatBytes(blob.size)}). Use Raw download to view.</p>
            )}
          </div>
        ) : lang === 'Markdown' ? (
          <div className="p-6">
            <MarkdownView content={blob.text || ''} />
          </div>
        ) : (
          <CodeHighlighter
            code={blob.text || ''}
            filename={selectedPath}
            highlightedLine={initialLine}
            onSelectLine={(line) => {
              navigate(`/repo/${repo.ownerUsername}/${repo.slug}/code?ref=${encodeURIComponent(activeRef)}&path=${encodeURIComponent(selectedPath)}&line=${line}`);
            }}
          />
        )}
      </div>
    </div>
  );
}
