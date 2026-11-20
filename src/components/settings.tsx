import type { ComponentType, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The settings list of the account and tariff pages, in the manner of a phone's settings: a group is one
 * rounded card, its rows are separated by hairlines; a row is an icon, a title, a line of detail and a
 * chevron when it leads somewhere.
 */
export function SettingsGroup({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="mb-2 px-1 text-[13px] font-medium text-muted-foreground">{title}</h2>}
      <div className="divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.07]">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  /** A lucide icon or any component that takes a className. */
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: ReactNode;
  description?: ReactNode;
  /** A page to open (shows a chevron). */
  to?: string;
  onClick?(): void;
  /** On the right, before the chevron: a value, a badge, a switch. */
  trailing?: ReactNode;
  tone?: 'default' | 'destructive';
  disabled?: boolean;
}

export function SettingsRow({ icon: Icon, title, description, to, onClick, trailing, tone = 'default', disabled }: SettingsRowProps) {
  const interactive = !!to || !!onClick;
  const body = (
    <>
      <Icon className={cn('size-5 shrink-0', tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground')} strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[15px] leading-snug font-medium', tone === 'destructive' && 'text-destructive')}>{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-pretty text-muted-foreground">{description}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
      {to && <ChevronRight className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover/row:translate-x-0.5" />}
    </>
  );
  const className = cn(
    'group/row flex w-full items-center gap-3.5 px-4 py-3.5 text-left sm:px-5',
    interactive && 'transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60',
    disabled && 'pointer-events-none opacity-50',
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} disabled={disabled}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

/**
 * An item of a segmented switch (a ToggleGroup on `bg-muted`): the chosen one is a solid pill of the text
 * colour — readable in both themes without a shadow; the others are plain text.
 */
export const SEGMENT_ITEM =
  'rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:hover:bg-foreground data-[state=on]:hover:text-background';

/** A card with padding for a form or a block of text inside a section. */
export function SettingsPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl bg-card p-5 ring-1 ring-foreground/[0.07] sm:p-6', className)}>{children}</div>;
}

/** The title of a page inside a section (/account/password…) with the way back. */
export function SubPageHeader({ back, backLabel, title, description }: { back: string; backLabel: string; title: string; description?: ReactNode }) {
  return (
    <div>
      <Link
        to={back}
        className="-ml-1 inline-flex items-center gap-0.5 rounded-md text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft className="size-4" />
        {backLabel}
      </Link>
      <h1 className="mt-3 font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">{title}</h1>
      {description && <p className="mt-1.5 text-[15px] text-pretty text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Avatar colours: the chart tokens, picked by the account id so a person keeps theirs. */
const AVATAR_TONES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

function avatarTone(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/** The account's initials on its colour (the header menu and the account page). */
export function UserAvatar({ user, className }: { user: { id: string; displayName: string }; className?: string }) {
  return (
    <Avatar className={cn('size-7 after:hidden', className)}>
      <AvatarFallback className={cn('text-xs font-semibold text-white', avatarTone(user.id))}>{initials(user.displayName)}</AvatarFallback>
    </Avatar>
  );
}
