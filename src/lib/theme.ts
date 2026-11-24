import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { useStore, type Theme } from '@/store/useStore';
import { TOOL_PATHS } from './toolPages';

/**
 * The colour theme. `Settings.theme` belongs to the account (store/accountSync.ts) and is "system",
 * "light" or "dark"; the app pages follow it, the public pages (landing, sign-in, documents) are always
 * dark, the calculators light or dark for the visit (useToolTheme). Applied as class="dark" on <html> (dark
 * tokens in index.css). Safe on the server: the landing page and the calculators are prerendered, and their
 * roots carry their theme themselves (components/site.tsx publicRoot, pages/tools ToolShell).
 */

/** Pages that are designed dark-only (the demo too: the editor as the landing page's pictures show it). */
const PUBLIC_PATHS = ['/', '/pricing', '/demo', '/terms', '/privacy', '/login', '/register', '/reset-password', '/verify-email'];

export type ToolTheme = 'light' | 'dark';

/**
 * The theme of the calculator pages for this visit, in memory only (nothing of the app is stored in the browser):
 * light for whoever lands on a calculator — from a search engine or a link; dark for a visitor who came through
 * the dark pages of the site first (the landing page), so the site does not change colour under them; or what
 * the visitor picked with the switch in the header. The server renders light.
 */
const toolTheme = { value: 'light' as ToolTheme, settled: false, listeners: new Set<() => void>() };

function setToolTheme(value: ToolTheme, settled: boolean): void {
  toolTheme.settled ||= settled;
  if (toolTheme.value === value) return;
  toolTheme.value = value;
  toolTheme.listeners.forEach((l) => l());
}

function subscribeToolTheme(onChange: () => void): () => void {
  toolTheme.listeners.add(onChange);
  return () => toolTheme.listeners.delete(onChange);
}

/** The calculators' theme and the switch of the header. */
export function useToolTheme(): [ToolTheme, (theme: ToolTheme) => void] {
  const value = useSyncExternalStore(
    subscribeToolTheme,
    () => toolTheme.value,
    () => 'light' as ToolTheme,
  );
  return [value, (theme) => setToolTheme(theme, true)];
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
  const [tool] = useToolTheme();
  const { pathname } = useLocation();
  if (TOOL_PATHS.includes(pathname)) return tool;
  if (PUBLIC_PATHS.includes(pathname)) return 'dark';
  return resolveTheme(theme, systemDark);
}

/** Puts the theme on <html>; called once by the app shell. */
export function useApplyTheme(): 'light' | 'dark' {
  const resolved = useResolvedTheme();
  const { pathname } = useLocation();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);
  useEffect(() => {
    // The first calculator seen settles their theme for the visit; dark pages seen before it make it dark.
    if (TOOL_PATHS.includes(pathname)) toolTheme.settled = true;
    else if (PUBLIC_PATHS.includes(pathname) && !toolTheme.settled) setToolTheme('dark', false);
  }, [pathname]);
  return resolved;
}
