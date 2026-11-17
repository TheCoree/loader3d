import { cn } from '@/lib/utils';

/**
 * Shared look of the public pages (landing, sign-in, documents): always dark — black background, Geist,
 * hairline borders, white pills. Rendered on the server too (the landing page is prerendered): nothing
 * here touches window/document while rendering, and the animations are CSS only.
 */

/** The root of a public page: the dark tokens (class `dark`) whatever the app theme. */
export const publicRoot = 'dark min-h-dvh bg-black font-geist text-[#ededed] antialiased selection:bg-primary/40';

/** Classes for `Button` on the public pages. */
export const primaryPill =
  'h-10 rounded-full bg-white px-5 text-[15px] font-medium text-black shadow-none hover:bg-white/85 focus-visible:ring-white/40';
export const secondaryPill =
  'h-10 rounded-full border border-white/15 bg-black px-5 text-[15px] font-medium text-white shadow-none hover:bg-white/[0.08] hover:text-white focus-visible:ring-white/40';
/** Small rectangular buttons of the header. */
export const headerPrimary = 'h-8 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-white/85';
export const headerSecondary =
  'h-8 rounded-md border border-white/15 bg-black px-3 text-sm font-medium text-white hover:bg-white/[0.08] hover:text-white';

/** Headlines of the public pages. */
export const displayTitle = 'font-geist font-semibold tracking-[-0.045em] text-balance text-white';
/** Secondary text: Vercel-like neutral grey. */
export const mutedText = 'text-[#a1a1a1]';

export type VehicleKind = 'semi' | 'train' | 'container' | 'truck' | 'van';

/** Side silhouettes of the vehicle templates, white, for the strip under the hero. */
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
          <path d="M23 5v12m6-12v12m6-12v12m6-12v12m6-12v12m6-12v12m6-12v12" fill="none" stroke="#000" strokeWidth="1.4" />
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
