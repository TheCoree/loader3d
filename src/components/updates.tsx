import { ChevronRight, Megaphone, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useMatch } from 'react-router';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RELEASES, shortReleaseDate, unseenReleases, visibleReleases, type Release } from '@/lib/changelog';
import { plural } from '@/lib/format';
import { TIERS_ENABLED } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';
import { useStore } from '@/store/useStore';

/** The releases of «Что нового» this site shows, newest first (without the tier changes when tiers are off). */
export const SHOWN_RELEASES: readonly Release[] = visibleReleases(RELEASES, TIERS_ENABLED);

/** The releases the signed-in user has not seen yet, newest first. */
export function useUnseenReleases(): Release[] {
  const createdAt = useAuth((s) => s.user?.createdAt);
  const seen = useStore((s) => s.settings.updatesSeen);
  return useMemo(() => (createdAt ? unseenReleases(SHOWN_RELEASES, seen, createdAt) : []), [createdAt, seen]);
}

/** Remembers in the account that the user has seen every release (the page opened or the strip hidden). */
export function markUpdatesSeen(): void {
  const latest = SHOWN_RELEASES[0];
  const { settings, setSetting } = useStore.getState();
  if (latest && settings.updatesSeen < latest.id) setSetting('updatesSeen', latest.id);
}

/** The «Что нового» button of the app header, with a dot while there are releases the user has not seen. */
export function UpdatesButton() {
  const unseen = useUnseenReleases().length;
  const active = !!useMatch('/updates');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-lg" className={cn('relative rounded-full', active && 'bg-muted')} asChild>
          <Link to="/updates" aria-label={unseen > 0 ? `Что нового: ${plural(unseen, ['обновление', 'обновления', 'обновлений'])}` : 'Что нового'}>
            <Megaphone className="size-[18px]" />
            {unseen > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden />}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Что нового</TooltipContent>
    </Tooltip>
  );
}

/** How many releases the user has not seen, as a small pill (the account menu). */
export function UnseenCount({ className }: { className?: string }) {
  const unseen = useUnseenReleases().length;
  if (unseen === 0) return null;
  return (
    <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary dark:bg-primary/20', className)}>
      {unseen}
    </span>
  );
}

/**
 * Above the plans while there is a release the user has not seen: its date and title lead to «Что нового»;
 * hiding the strip counts as seen.
 */
export function UpdatesStrip({ className }: { className?: string }) {
  const unseen = useUnseenReleases();
  if (unseen.length === 0) return null;
  const [latest] = unseen;
  const more = unseen.length - 1;
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl bg-foreground/[0.04] py-2 pr-2 pl-4 sm:pl-5 dark:bg-foreground/[0.06]', className)}>
      <Megaphone className="size-5 shrink-0 text-primary" strokeWidth={1.75} />
      <Link to="/updates" className="group/updates flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="min-w-0 flex-1 text-sm leading-snug text-pretty">
          <span className="text-muted-foreground">Обновление {shortReleaseDate(latest.id)}: </span>
          <span className="font-medium">{latest.title}</span>
          {more > 0 && <span className="text-muted-foreground"> и ещё {plural(more, ['обновление', 'обновления', 'обновлений'])}</span>}
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover/updates:text-foreground sm:flex">
          Что нового
          <ChevronRight className="size-4 transition-transform group-hover/updates:translate-x-0.5" />
        </span>
      </Link>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="shrink-0 rounded-full text-muted-foreground" aria-label="Скрыть" onClick={markUpdatesSeen}>
            <X />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Скрыть</TooltipContent>
      </Tooltip>
    </div>
  );
}
