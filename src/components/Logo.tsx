import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { LOGO_BLUE, LOGO_FACES, faceTransform } from '@/lib/brand';

/** The mark (its drawing: lib/brand.ts): the top face in the text colour, the left at half strength, the right blue. */
const FACES = [
  { ...LOGO_FACES[0], fill: 'currentColor', opacity: 1 },
  { ...LOGO_FACES[1], fill: 'currentColor', opacity: 0.5 },
  { ...LOGO_FACES[2], fill: LOGO_BLUE, opacity: 1 },
] as const;

/** `mono`: every face in the text colour (set it with a text-* class), shaded top → right → left. */
const MONO_OPACITY = [1, 0.5, 0.78] as const;

function Faces({ animated, mono }: { animated?: boolean; mono?: boolean }) {
  return (
    <g className={animated ? 'logo-turn' : undefined}>
      {FACES.map(({ d, c, fill, opacity, out }, i) => (
        <g
          key={i}
          className={animated ? 'logo-face' : undefined}
          style={animated ? ({ '--dx': `${out[0] * 2.6}px`, '--dy': `${out[1] * 2.6}px` } as React.CSSProperties) : undefined}
        >
          <path
            d={d}
            fill={mono ? 'currentColor' : fill}
            fillOpacity={mono ? MONO_OPACITY[i] : opacity}
            transform={faceTransform(c)}
          />
        </g>
      ))}
    </g>
  );
}

/** `tone="mono"`: the box in one colour — the tier marks paint it blue for «Pro» (components/TierBadge.tsx). */
export function LogoMark({ className, tone = 'brand' }: { className?: string; tone?: 'brand' | 'mono' }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-7 shrink-0', className)} aria-hidden>
      <Faces mono={tone === 'mono'} />
    </svg>
  );
}

/**
 * The brand loader: the box comes apart, turns a third and goes back together, so its faces (and the
 * blue one) change places. Freezes as the plain mark with prefers-reduced-motion.
 */
export function LogoLoader({ className, label = 'Загрузка' }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="status" aria-label={label} className={cn('size-10 shrink-0 overflow-visible', className)}>
      <Faces animated />
    </svg>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      aria-label="Loader3D — на главную"
      className={cn('flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
    >
      <LogoMark />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Loader3D</span>
    </Link>
  );
}
