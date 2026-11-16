import { lazy, Suspense, useEffect, useState } from 'react';
import type { GradientASCIIProps } from '@/components/GradientASCII';
import { cn } from '@/lib/utils';

/**
 * Shared look of the public pages (landing, login, registration). Rendered on the server too (the
 * landing page is prerendered): nothing here touches window/document while rendering.
 */

/** Classes for `Button` on the public pages. */
export const inkButton = 'h-11 rounded-full bg-ink px-6 text-[15px] font-medium text-white hover:bg-ink/85';
export const lineButton = 'h-11 rounded-full border-ink/15 bg-transparent px-6 text-[15px] font-medium hover:bg-ink/[0.04]';
export const whiteButton = 'h-11 rounded-full bg-white px-6 text-[15px] font-medium text-ink hover:bg-white/90';
export const glassButton =
  'h-11 rounded-full border-white/15 bg-white/[0.06] px-6 text-[15px] font-medium text-white backdrop-blur hover:bg-white/[0.12] hover:text-white';

/** Big headline of the public pages. */
export const displayTitle = 'font-display font-medium tracking-[-0.015em] text-balance';

const GradientASCII = lazy(() => import('@/components/GradientASCII'));

/** Loader3D's blues: the accent (`--primary`, COLORS.accent) and lighter tints of it. */
const LIGHT_COLORS = ['#2f6fed', '#f4f6fa', '#b8cdf8', '#6b98f2'];
const DARK_COLORS = ['#1f4fc4', '#0a0b0d', '#5b8def', '#2f6fed'];

/**
 * The animated ASCII gradient (React Bits «Gradient ASCII», WebGL2) in Loader3D's blues, as a background:
 * `light` over the light sections (like the editor), `dark` over the ink ones. Loaded lazily and only after
 * mount: the prerendered HTML and the first client render show the plain backdrop, then the glyphs fade
 * in. It freezes with prefers-reduced-motion and pauses off screen.
 */
export function AsciiBackground({
  className,
  tone = 'light',
  ...props
}: Omit<GradientASCIIProps, 'className' | 'lightMode'> & { className?: string; tone?: 'light' | 'dark' }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {mounted && (
        <Suspense fallback={null}>
          <div className="size-full animate-in duration-1000 fade-in">
            <GradientASCII
              colors={tone === 'light' ? LIGHT_COLORS : DARK_COLORS}
              lightMode={tone === 'light'}
              shape="horizon"
              cellSize={14}
              glyphOpacity={tone === 'light' ? 0.7 : 0.8}
              gradientOpacity={tone === 'light' ? 0.75 : 0.9}
              speed={0.6}
              flicker={0.15}
              grain={0.04}
              intro={false}
              clickEffect="none"
              {...props}
            />
          </div>
        </Suspense>
      )}
    </div>
  );
}
