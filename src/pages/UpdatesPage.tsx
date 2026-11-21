import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { SEGMENT_ITEM, SettingsPanel } from '@/components/settings';
import { SHOWN_RELEASES, markUpdatesSeen, useUnseenReleases } from '@/components/updates';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CHANGE_KINDS, releaseDate, type ChangeKind, type Release } from '@/lib/changelog';
import { SUPPORT, telegramUrl } from '@/lib/legal';
import { cn } from '@/lib/utils';

type Filter = 'all' | ChangeKind;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Все' },
  ...(Object.keys(CHANGE_KINDS) as ChangeKind[]).map((kind) => ({ value: kind, label: CHANGE_KINDS[kind].filter })),
];

/** The pill of a change: new things in the accent colour, improvements neutral, fixes green. */
const KIND_TONE: Record<ChangeKind, string> = {
  new: 'bg-primary/10 text-primary dark:bg-primary/20',
  improved: 'bg-foreground/[0.06] text-foreground/75 dark:bg-foreground/10',
  fixed: 'bg-success/10 text-success dark:bg-success/15',
};

/**
 * /updates — «Что нового»: the releases of Loader3D (lib/changelog.ts), newest first, with a filter by the
 * kind of change. Opening the page counts every release as seen; the ones that were new stay marked until
 * the page is left.
 */
export function UpdatesPage() {
  const unseen = useUnseenReleases();
  const [fresh] = useState(() => new Set(unseen.map((r) => r.id)));
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    markUpdatesSeen();
    const previous = document.title;
    document.title = 'Что нового — Loader3D';
    return () => {
      document.title = previous;
    };
  }, []);

  const releases = useMemo(
    () =>
      filter === 'all'
        ? SHOWN_RELEASES
        : SHOWN_RELEASES.map((r) => ({ ...r, changes: r.changes.filter((c) => c.kind === filter) })).filter((r) => r.changes.length > 0),
    [filter],
  );

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
        <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">Что нового</h1>
        <p className="mt-1.5 text-[15px] text-pretty text-muted-foreground">
          Loader3D развивается: здесь новые возможности, улучшения и исправления — свежие сверху.
        </p>

        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          className="mt-6 w-full rounded-full bg-muted p-0.5 sm:w-fit"
          aria-label="Какие изменения показать"
        >
          {FILTERS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className={cn(SEGMENT_ITEM, 'h-8 grow px-2 text-[13px] sm:grow-0 sm:px-3.5 sm:text-sm')}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <ol className="mt-4 divide-y">
          {releases.map((release) => (
            <ReleaseEntry key={release.id} release={release} fresh={fresh.has(release.id)} />
          ))}
        </ol>

        <SettingsPanel className="mt-6 text-[15px] leading-relaxed text-pretty">
          Чего-то не хватает или что-то работает не так? Напишите на{' '}
          <a href={`mailto:${SUPPORT.email}`} className="font-medium underline-offset-4 hover:underline">
            {SUPPORT.email}
          </a>{' '}
          или в{' '}
          <a href={telegramUrl} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline">
            Telegram
          </a>{' '}
          — отвечаем {SUPPORT.hours}.
        </SettingsPanel>
      </main>
    </div>
  );
}

function ReleaseEntry({ release, fresh }: { release: Release; fresh: boolean }) {
  return (
    <li className="grid gap-x-8 gap-y-2 py-8 sm:grid-cols-[9.5rem_1fr]">
      <div className={cn('flex items-center gap-2 text-[13px] sm:items-start sm:pt-1', fresh ? 'font-medium text-primary' : 'text-muted-foreground')}>
        {fresh && <span className="size-1.5 shrink-0 rounded-full bg-primary sm:mt-[0.45rem]" aria-hidden />}
        <time dateTime={release.id.slice(0, 10)}>{releaseDate(release.id)}</time>
        {fresh && <span className="sr-only">— вы ещё не видели</span>}
      </div>
      <div className="min-w-0">
        <h2 className="text-lg leading-snug font-medium tracking-[-0.01em]">{release.title}</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {release.changes.map((change) => (
            <li key={change.text} className="flex flex-col items-start gap-1 text-[15px] leading-relaxed sm:flex-row sm:gap-3">
              <span
                className={cn(
                  'inline-flex h-5 shrink-0 items-center justify-center rounded-full px-2 text-xs font-medium sm:mt-0.5 sm:min-w-[6.5rem]',
                  KIND_TONE[change.kind],
                )}
              >
                {CHANGE_KINDS[change.kind].label}
              </span>
              <span className="min-w-0 text-pretty">{change.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
