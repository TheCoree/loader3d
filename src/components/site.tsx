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

/** The cube's outline and its three faces (the logo's), in a 200 × 230 box centred on (100, 115). */
const CUBE_OUTLINE = 'M100 8 187 58v114l-87 50-87-50V58Z';
const CUBE_FACES = ['M100 8 187 58 100 108 13 58Z', 'M13 58 100 108v114L13 172Z', 'M187 58 100 108v114l87-50Z'];
/** Each face shrunk a little about its own centre: the seams between them, as in the logo. */
const FACE_CENTRES = [
  [100, 58],
  [56.5, 140],
  [143.5, 140],
];

/**
 * The Loader3D cube as a flat black silhouette lit from behind — the light hugs its outline, brightest along
 * the top edges, and leaks through the seams between the faces. Pure SVG; the glow breathes slowly (CSS).
 */
export function GlowCube({ className, size = 220 }: { className?: string; size?: number }) {
  return (
    <div aria-hidden className={cn('pointer-events-none relative', className)} style={{ width: size, height: size * 1.15 }}>
      {/* Larger than the cube's box, so the light spills over the neighbours without moving them. */}
      <svg
        viewBox="-130 -140 460 500"
        width={size * 2.3}
        height={size * 2.5}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="gc-haze" cx="50%" cy="44%" r="50%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.085" />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id="gc-corona" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="46" />
          </filter>
          <filter id="gc-rim" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        {/* A faint haze around, then the corona (shifted up: the light is behind and above) and a bright rim. */}
        <ellipse cx="100" cy="90" rx="300" ry="300" fill="url(#gc-haze)" />
        <g className="lp-glow">
          <ellipse cx="100" cy="45" rx="140" ry="110" fill="#fff" opacity="0.22" filter="url(#gc-corona)" />
          <path d={CUBE_OUTLINE} fill="#fff" opacity="0.5" filter="url(#gc-corona)" transform="translate(100 92) scale(1.1) translate(-100 -115)" />
          <path d={CUBE_OUTLINE} fill="#fff" opacity="0.95" filter="url(#gc-rim)" transform="translate(100 108) scale(1.014) translate(-100 -115)" />
        </g>
        {/* Under the faces: only a little of the light gets through the seams. */}
        <path d={CUBE_OUTLINE} fill="#000" opacity="0.82" />
        {CUBE_FACES.map((d, i) => {
          const [cx, cy] = FACE_CENTRES[i];
          return <path key={d} d={d} fill="#000" transform={`translate(${cx} ${cy}) scale(0.985) translate(${-cx} ${-cy})`} />;
        })}
      </svg>
    </div>
  );
}

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
