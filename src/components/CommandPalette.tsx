import { useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  Building2,
  Code2,
  Compass,
  FolderGit2,
  HelpCircle,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  TrendingUp,
  X,
} from 'lucide-react';
import { useRouter } from '../lib/router';

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (!open) return null;

  const commands = [
    { label: 'Go to Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Explore Repositories', path: '/explore', icon: Compass },
    { label: 'Trending Projects', path: '/trending', icon: TrendingUp },
    { label: 'Create New Repository', path: '/new', icon: Plus },
    { label: 'Open Online Code Editor', path: '/editor', icon: Code2 },
    { label: 'Global Search', path: '/search', icon: Search },
    { label: 'Organizations & Teams', path: '/orgs', icon: Building2 },
    { label: 'Package Registry', path: '/packages', icon: Package },
    { label: 'Notifications Center', path: '/notifications', icon: Bell },
    { label: 'Saved Bookmarks', path: '/bookmarks', icon: Bookmark },
    { label: 'Developer Settings & Git PATs', path: '/settings/developer', icon: Settings },
    { label: 'Security Settings', path: '/settings/security', icon: Shield },
    { label: 'Help Center & API Docs', path: '/docs/api', icon: HelpCircle },
  ];

  const q = query.trim().toLowerCase();
  const filtered = commands.filter((c) => !q || c.label.toLowerCase().includes(q));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/60 backdrop-blur-xs px-4"
      onClick={onClose}
    >
      <div
        className="max-w-xl w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && query.trim()) {
                onClose();
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }
            }}
            placeholder="Jump to view or press Enter to search code and repositories..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close command palette"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.path}
                type="button"
                onClick={() => {
                  onClose();
                  navigate(cmd.path);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>{cmd.label}</span>
                </span>
                <span className="text-xs font-mono text-slate-400">{cmd.path}</span>
              </button>
            );
          })}
          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <FolderGit2 className="w-4 h-4 shrink-0" />
              <span>Search repositories & code for "{query.trim()}"</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const shortcuts = [
    { keys: 'Ctrl / Cmd + K', desc: 'Open command palette & global search' },
    { keys: '?', desc: 'Show keyboard shortcut guide' },
    { keys: 'Ctrl / Cmd + S', desc: 'Save active buffer in Online Code Editor' },
    { keys: 'Esc', desc: 'Close dialogs and overlays' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Keyboard Shortcuts</h2>
          <button type="button" aria-label="Close shortcuts" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {shortcuts.map((s) => (
            <div key={s.keys} className="py-2.5 flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{s.desc}</span>
              <kbd className="font-mono text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
