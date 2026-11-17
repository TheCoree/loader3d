import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { useStore, type Theme } from '@/store/useStore';

/**
 * The colour theme. `Settings.theme` belongs to the account (store/accountSync.ts) and is "system",
 * "light" or "dark"; the app pages follow it, the public pages (landing, sign-in, documents) are always
 * dark. Applied as class="dark" on <html> (dark tokens in index.css). Safe on the server: the landing
 * page is prerendered, and its root carries the class `dark` itself (components/site.tsx publicRoot).
 */

/** Pages that are designed dark-only. */
const PUBLIC_PATHS = ['/', '/pricing', '/terms', '/privacy', '/login', '/register', '/reset-password', '/verify-email'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeSystem(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function useSystemDark(): boolean {
  return useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

/** The theme in effect on the current page. */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useStore((s) => s.settings.theme);
  const systemDark = useSystemDark();
  const { pathname } = useLocation();
  if (PUBLIC_PATHS.includes(pathname)) return 'dark';
  return resolveTheme(theme, systemDark);
}

/** Puts the theme on <html>; called once by the app shell. */
export function useApplyTheme(): 'light' | 'dark' {
  const resolved = useResolvedTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);
  return resolved;
}
