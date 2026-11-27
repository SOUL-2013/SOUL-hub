import React, { useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  Building2,
  Code2,
  Compass,
  FolderGit2,
  HelpCircle,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  TrendingUp,
  User as UserIcon,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import { BrandLogo } from './BrandLogo';
import { CommandPalette, KeyboardShortcutsModal } from './CommandPalette';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname, navigate } = useRouter();
  const { firebaseUser, profile, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName || '')) {
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    firestoreRepo.getPlatformConfig().then((cfg) => {
      if (cfg?.announcementBanner) setAnnouncement(cfg.announcementBanner);
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      setUnreadCount(0);
      return;
    }
    firestoreRepo
      .listNotifications(firebaseUser.uid)
      .then((list) => setUnreadCount(list.filter((n) => !n.isRead).length))
      .catch(() => {});
  }, [firebaseUser, pathname]);

  const isLanding = pathname === '/';

  // Clean 3-zone Top Bar Contract on the Landing Page
  if (isLanding) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#07090F] text-slate-900 dark:text-slate-100">
        {isOffline && (
          <div className="bg-amber-600 text-white text-xs font-medium px-4 py-2 text-center flex items-center justify-center gap-2">
            <WifiOff className="w-3.5 h-3.5" />
            <span>You are currently offline. Public documentation remains available; live Git sync requires a connection.</span>
          </div>
        )}
        {announcement && (
          <div className="bg-blue-600/15 border-b border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs px-4 py-2 text-center">
            {announcement}
          </div>
        )}
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-[#07090F]/85 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
            <Link to="/" className="whitespace-nowrap shrink-0">
              <BrandLogo size={28} />
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link to="/explore" className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
                Explore
              </Link>
              <Link to="/trending" className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
                Trending
              </Link>
              <Link to="/packages" className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
                Packages
              </Link>
              <Link to="/docs/api" className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
                Docs
              </Link>
              <Link to="/help" className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
                Status
              </Link>
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              {firebaseUser ? (
                <Link
                  to="/dashboard"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
                >
                  Open Dashboard
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#07090F]">
          <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-slate-500 dark:text-slate-400">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-200">SOUL HUB — Soumadip Orbit Universal Labs</p>
              <p className="mt-1">Where Developers Build the Future. Free-tier quotas apply honestly (50 MB per developer).</p>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Link to="/docs/api" className="hover:text-slate-900 dark:hover:text-slate-200">API Docs</Link>
              <Link to="/help" className="hover:text-slate-900 dark:hover:text-slate-200">Help Center</Link>
              <Link to="/legal/terms" className="hover:text-slate-900 dark:hover:text-slate-200">Terms</Link>
              <Link to="/legal/privacy" className="hover:text-slate-900 dark:hover:text-slate-200">Privacy</Link>
              <Link to="/legal/guidelines" className="hover:text-slate-900 dark:hover:text-slate-200">Guidelines</Link>
            </div>
          </div>
        </footer>

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    );
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Explore', path: '/explore', icon: Compass },
    { label: 'Trending', path: '/trending', icon: TrendingUp },
    { label: 'Code Editor', path: '/editor', icon: Code2 },
    { label: 'Organizations', path: '/orgs', icon: Building2 },
    { label: 'Packages', path: '/packages', icon: Package },
    { label: 'Bookmarks', path: '/bookmarks', icon: Bookmark },
    { label: 'Settings', path: '/settings/account', icon: Settings },
    { label: 'API & Help', path: '/docs/api', icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#07090F] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0A0E17] sticky top-0 h-screen">
        <div className="h-16 px-5 flex items-center border-b border-slate-200 dark:border-slate-800/80">
          <Link to="/" className="whitespace-nowrap">
            <BrandLogo size={26} />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/12 text-blue-600 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/admin"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                pathname.startsWith('/admin')
                  ? 'bg-violet-600/15 text-violet-600 dark:text-violet-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Open keyboard shortcuts"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-[#0A0E17] border-r border-slate-200 dark:border-slate-800 h-full flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <BrandLogo size={26} />
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-violet-500 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Admin Panel</span>
                </Link>
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {isOffline && (
          <div className="bg-amber-600 text-white text-xs font-medium px-4 py-2 text-center flex items-center justify-center gap-2">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline mode detected. Network Git operations are paused until connectivity resumes.</span>
          </div>
        )}
        {announcement && (
          <div className="bg-blue-600/12 border-b border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs px-4 py-2 text-center">
            {announcement}
          </div>
        )}

        <header className="sticky top-0 z-20 h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#07090F]/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D111A] text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex-1 min-w-0 max-w-[138px] sm:max-w-none sm:flex-none sm:w-72 text-left"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">Search...</span>
              <kbd className="hidden sm:inline font-mono text-[11px] text-slate-400">Ctrl+K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              to="/new"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Repository</span>
              <span className="sm:hidden">New</span>
            </Link>

            <Link
              to="/notifications"
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </Link>

            {firebaseUser && profile ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label="Open account menu"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-md object-cover"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-md bg-blue-600/20 text-blue-500 flex items-center justify-center text-xs font-semibold">
                      {profile.username.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline text-xs font-medium max-w-[110px] truncate">{profile.username}</span>
                </button>

                {userMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] shadow-xl py-1.5 z-40"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{profile.displayName}</p>
                      <p className="text-xs text-slate-500 truncate">@{profile.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate(`/u/${profile.username}`);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>Your Profile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate('/dashboard');
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <FolderGit2 className="w-3.5 h-3.5" />
                      <span>Your Repositories</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate('/settings/developer');
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Developer Tokens & Git CLI</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await signOut();
                        navigate('/');
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 border-t border-slate-200 dark:border-slate-800 mt-1 pt-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
