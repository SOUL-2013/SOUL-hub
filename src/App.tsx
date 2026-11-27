import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { RouterProvider, useRouter } from './lib/router';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { DocsApiPage, HelpStatusPage, LegalPage, NotFoundPage } from './pages/DocsAndLegalPages';
import { EditorPage } from './pages/EditorPage';
import { ExplorePage } from './pages/ExplorePage';
import { LandingPage } from './pages/LandingPage';
import { NewRepoPage } from './pages/NewRepoPage';
import { BookmarksPage, NotificationsPage } from './pages/NotificationsBookmarksPages';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { PackagesPage } from './pages/PackagesPage';
import { ProfilePage } from './pages/ProfilePage';
import { RepoLayout, type RepoSubTab } from './pages/RepoLayout';
import { SettingsPages } from './pages/SettingsPages';

function RouteView() {
  const { pathname } = useRouter();
  const clean = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const segs = clean.split('/').filter(Boolean);

  if (clean === '/') return <LandingPage />;
  if (clean === '/login') return <AuthPage mode="login" />;
  if (clean === '/signup') return <AuthPage mode="signup" />;
  if (clean === '/forgot-password') return <AuthPage mode="forgot" />;
  if (clean === '/dashboard') return <DashboardPage />;
  if (clean === '/explore') return <ExplorePage mode="explore" />;
  if (clean === '/trending') return <ExplorePage mode="trending" />;
  if (clean === '/search') return <ExplorePage mode="search" />;
  if (clean === '/new') return <NewRepoPage />;
  if (clean === '/editor') return <EditorPage />;
  if (clean === '/orgs') return <OrganizationsPage />;
  if (segs[0] === 'orgs' && segs[1]) return <OrganizationsPage slug={segs[1]} />;
  if (clean === '/packages') return <PackagesPage />;
  if (clean === '/notifications') return <NotificationsPage />;
  if (clean === '/bookmarks') return <BookmarksPage />;
  if (clean === '/settings' || clean === '/settings/account') return <SettingsPages tab="account" />;
  if (clean === '/settings/appearance') return <SettingsPages tab="appearance" />;
  if (clean === '/settings/security') return <SettingsPages tab="security" />;
  if (clean === '/settings/developer') return <SettingsPages tab="developer" />;
  if (clean === '/docs/api') return <DocsApiPage />;
  if (clean === '/help') return <HelpStatusPage />;
  if (clean === '/legal/terms') return <LegalPage docType="terms" />;
  if (clean === '/legal/privacy') return <LegalPage docType="privacy" />;
  if (clean === '/legal/guidelines') return <LegalPage docType="guidelines" />;
  if (clean === '/admin') return <AdminPage />;

  if (segs[0] === 'u' && segs[1]) {
    const subtab = segs[2] === 'followers' ? 'followers' : segs[2] === 'following' ? 'following' : 'overview';
    return <ProfilePage username={decodeURIComponent(segs[1])} subtab={subtab} />;
  }

  if (segs[0] === 'repo' && segs[1] && segs[2]) {
    const owner = decodeURIComponent(segs[1]);
    const slug = decodeURIComponent(segs[2]);
    const sub = segs[3] || 'overview';
    if (sub === 'edit') return <EditorPage owner={owner} slug={slug} />;

    const tabMap: Record<string, RepoSubTab> = {
      overview: 'overview',
      code: 'code',
      commits: 'commits',
      branches: 'branches',
      tags: 'tags',
      issues: 'issues',
      pulls: 'pulls',
      projects: 'projects',
      discussions: 'discussions',
      automation: 'automation',
      deploy: 'automation',
      releases: 'releases',
      security: 'security',
      insights: 'security',
      settings: 'settings',
    };
    const resolvedTab = tabMap[sub];
    if (!resolvedTab) return <NotFoundPage />;
    return <RepoLayout owner={owner} slug={slug} subtab={resolvedTab} />;
  }

  return <NotFoundPage />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider>
              <AppShell>
                <RouteView />
              </AppShell>
            </RouterProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
