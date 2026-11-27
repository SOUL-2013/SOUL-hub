import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RouterContextValue {
  pathname: string;
  search: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue>({
  pathname: '/',
  search: '',
  navigate: () => {},
});

function getBasePrefix(): string {
  const raw = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return raw === '' || raw === '.' ? '' : raw;
}

function stripBase(fullPath: string): string {
  const base = getBasePrefix();
  if (!base) return fullPath || '/';
  if (fullPath === base || fullPath === `${base}/`) return '/';
  if (fullPath.startsWith(`${base}/`)) {
    return fullPath.slice(base.length) || '/';
  }
  return fullPath || '/';
}

function withBase(appPath: string): string {
  const base = getBasePrefix();
  const clean = appPath.startsWith('/') ? appPath : `/${appPath}`;
  return `${base}${clean}`;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState(() => ({
    pathname: typeof window !== 'undefined' ? stripBase(window.location.pathname) : '/',
    search: typeof window !== 'undefined' ? window.location.search : '',
  }));

  useEffect(() => {
    const onPop = () => {
      setLoc({ pathname: stripBase(window.location.pathname), search: window.location.search });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to.startsWith('http://') || to.startsWith('https://')) {
      window.location.assign(to);
      return;
    }
    const [pathPart, searchPart] = to.split('?');
    const nextPath = pathPart || '/';
    const nextSearch = searchPart ? `?${searchPart}` : '';
    window.history.pushState({}, '', `${withBase(nextPath)}${nextSearch}`);
    setLoc({ pathname: nextPath, search: nextSearch });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return <RouterContext.Provider value={{ pathname: loc.pathname, search: loc.search, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  return useContext(RouterContext);
}

export function Link({
  to,
  className = '',
  children,
  onClick,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  const href = to.startsWith('http://') || to.startsWith('https://') ? to : withBase(to);
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          navigate(to);
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
