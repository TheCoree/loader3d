import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * The mark: an isometric box of three faces on a near-black tile, the faces split by thin gaps.
 * The same drawing is the favicon in index.html — change both.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-[9px] bg-ink text-white ring-1 ring-white/10 ring-inset',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[72%]" aria-hidden>
        <g stroke="#0a0b0d" strokeWidth={0.9} strokeLinejoin="round">
          <path d="M12 3.6 19.3 7.8 12 12 4.7 7.8Z" fill="currentColor" />
          <path d="M4.7 7.8 12 12v8.4l-7.3-4.2Z" fill="currentColor" fillOpacity={0.62} />
          <path d="M19.3 7.8 12 12v8.4l7.3-4.2Z" fill="#2f6fed" />
        </g>
      </svg>
    </span>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      aria-label="Loader3D — на главную"
      className={cn('flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
    >
      <LogoMark />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Loader3D</span>
    </Link>
  );
}
