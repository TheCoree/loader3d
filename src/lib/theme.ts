import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { useStore, type Theme } from '@/store/useStore';
import { TOOL_PATHS } from './toolPages';

/**
 * The colour theme. `Settings.theme` belongs to the account (store/accountSync.ts) and is "light" (the default),
 * "dark" or "system"; the app pages follow it. The public pages (landing, sign-in, documents, the demo) and the
 * calculators share the site theme: light, or dark for this visit by the switch in their header (useSiteTheme).
 * Applied as class="dark" on <html> (dark tokens in index.css). Safe on the server: the landing page and the
 * calculators are prerendered light, and their roots carry their theme themselves (components/site.tsx SitePage).
 */

/** The public pages: they follow the site theme, not the account's. */
const PUBLIC_PATHS = ['/', '/pricing', '/demo', '/terms', '/privacy', '/login', '/register', '/reset-password', '/verify-email'];

export type SiteTheme = 'light' | 'dark';

/**
 * The theme of the public pages and the calculators for this visit, in memory only (nothing of the app is stored
 * in the browser): light, or what the visitor picked with the switch in the header. The server renders light.
 */
const siteTheme = { value: 'light' as SiteTheme, listeners: new Set<() => void>() };

function setSiteTheme(value: SiteTheme): void {
  if (siteTheme.value === value) return;
  siteTheme.value = value;
  siteTheme.listeners.forEach((l) => l());
}

function subscribeSiteTheme(onChange: () => void): () => void {
  siteTheme.listeners.add(onChange);
  return () => siteTheme.listeners.delete(onChange);
}

/** The site theme and its switch (components/site.tsx SiteThemeSwitch). */
export function useSiteTheme(): [SiteTheme, (theme: SiteTheme) => void] {
  const value = useSyncExternalStore(
    subscribeSiteTheme,
    () => siteTheme.value,
    () => 'light' as SiteTheme,
  );
  return [value, setSiteTheme];
}

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
  const [site] = useSiteTheme();
  const { pathname } = useLocation();
  if (TOOL_PATHS.includes(pathname) || PUBLIC_PATHS.includes(pathname)) return site;
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
