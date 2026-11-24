import type { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useSiteTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Shared look of the public pages (landing, sign-in, documents) and the calculators, in the manner of vercel.com:
 * Geist, hairline borders, solid pills — light by default, dark for the visit by the switch in the header
 * (lib/theme.ts useSiteTheme). Colours are the site-* tokens of `.site-page` (index.css), never fixed ones.
 * Rendered on the server too (the landing page is prerendered, light): nothing here touches window/document while
 * rendering.
 */

/** The root of a public page: the site colours, light or dark for this visit (and the app's tokens inside it). */
export function SitePage({ className, children }: { className?: string; children: ReactNode }) {
  const [theme] = useSiteTheme();
  return (
    <div
      className={cn(
        'site-page min-h-dvh bg-site-bg font-geist text-site-fg antialiased selection:bg-primary/25',
        theme === 'dark' && 'dark',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Light or dark, for this visit: the switch in the headers of the public pages and the calculators. */
export function SiteThemeSwitch({ className }: { className?: string }) {
  const [theme, setTheme] = useSiteTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      data-track="tool_theme"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md text-site-muted transition-colors outline-none hover:bg-site-soft hover:text-site-fg focus-visible:ring-3 focus-visible:ring-site-ring',
        className,
      )}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/** Classes for `Button` on the public pages. */
export const primaryPill =
  'h-10 rounded-full bg-site-solid px-4 text-[15px] font-medium text-site-solid-fg shadow-none transition-colors hover:bg-site-solid/85 focus-visible:ring-site-ring';
export const secondaryPill =
  'h-10 rounded-full border border-site-strong bg-site-bg px-4 text-[15px] font-medium text-site-fg shadow-none transition-colors hover:border-site-faint hover:bg-site-soft hover:text-site-fg focus-visible:ring-site-ring';
/** Small rectangular buttons of the header. */
export const headerPrimary = 'h-8 rounded-md bg-site-solid px-3 text-sm font-medium text-site-solid-fg hover:bg-site-solid/85';
export const headerSecondary =
  'h-8 rounded-md border border-site-strong bg-site-bg px-3 text-sm font-medium text-site-fg hover:bg-site-soft hover:text-site-fg';

/** Headlines of the public pages. */
export const displayTitle = 'font-geist font-[480] tracking-[-0.055em] text-balance text-site-fg';
/** Secondary text: Vercel-like neutral grey. */
export const mutedText = 'text-site-muted';

export type VehicleKind = 'semi' | 'train' | 'container' | 'truck' | 'van';

/** Side silhouettes of the vehicle templates, in the text colour, for the strip under the hero. */
export function VehicleGlyph({ kind, className }: { kind: VehicleKind; className?: string }) {
  const wheels = (xs: number[]) => xs.map((x) => <circle key={x} cx={x} cy="21" r="3" />);
  return (
    <svg viewBox="0 0 72 26" className={cn('h-5 w-auto fill-current', className)} aria-hidden>
      {kind === 'semi' && (
        <>
          <path d="M2 21V12l3-6h9v15Z" />
          <rect x="16" y="2" width="54" height="17" rx="1" />
          {wheels([8, 50, 57, 64])}
        </>
      )}
      {kind === 'train' && (
        <>
          <path d="M2 21V12l3-6h7v15Z" />
          <rect x="14" y="3" width="26" height="16" rx="1" />
          <rect x="43" y="3" width="27" height="16" rx="1" />
          {wheels([7, 32, 50, 63])}
        </>
      )}
      {kind === 'container' && (
        <>
          <path d="M2 21V12l3-6h9v15Z" />
          <rect x="16" y="3" width="54" height="16" rx="1" />
          <path d="M23 5v12m6-12v12m6-12v12m6-12v12m6-12v12m6-12v12m6-12v12" fill="none" stroke="var(--site-bg)" strokeWidth="1.4" />
          {wheels([8, 54, 62])}
        </>
      )}
      {kind === 'truck' && (
        <>
          <path d="M2 21V11l4-6h10v16Z" />
          <rect x="18" y="2" width="44" height="17" rx="1" />
          {wheels([9, 46, 54])}
        </>
      )}
      {kind === 'van' && (
        <>
          <path d="M6 21c-3 0-4-1-4-3v-5l5-8h34c2 0 3 1 3 3v13Z" />
          {wheels([11, 36])}
        </>
      )}
    </svg>
  );
}
