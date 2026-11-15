import { lazy, Suspense, useEffect, useState } from 'react';
import type { DitherProps } from '@/components/Dither';
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

const Dither = lazy(() => import('@/components/Dither'));

/**
 * The animated dithered waves (React Bits «Dither», WebGL2) as a background. Loaded lazily and only after
 * mount: the prerendered HTML and the first client render show the plain dark backdrop, then the waves
 * fade in. Dither itself freezes with prefers-reduced-motion and pauses off screen.
 */
export function DitherBackground({ className, ...props }: Omit<DitherProps, 'className'> & { className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {mounted && (
        <Suspense fallback={null}>
          <div className="size-full animate-in duration-1000 fade-in">
            <Dither
              waveColor={[0.42, 0.46, 0.55]}
              backgroundColor="#0a0b0d"
              colorNum={4}
              pixelSize={2}
              waveSpeed={0.035}
              waveFrequency={3}
              waveAmplitude={0.3}
              mouseRadius={0.25}
              intro={false}
              clickRipple={false}
              {...props}
            />
          </div>
        </Suspense>
      )}
    </div>
  );
}
