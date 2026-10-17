import { Boxes } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30',
        className,
      )}
    >
      <Boxes className="size-[18px]" />
    </span>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Loader3D</span>
    </Link>
  );
}
