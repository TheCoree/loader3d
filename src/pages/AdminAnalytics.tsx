import { useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ExternalLink, Info, Monitor, Smartphone, Tablet, UserPlus } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { AnalyticsBreakdown, AnalyticsRecentVisit, AnalyticsReport, AnalyticsSummary } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SECTION_NAMES, TRACK_NAMES } from '@/lib/analytics';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * «Посещаемость» in /admin: visits of the public pages (backend/app/analytics.py). Every mark is one
 * measure in one hue (--primary), so there is no legend; numbers are written next to the marks and the
 * charts explain themselves on hover.
 */

const CHANNELS: Record<string, string> = {
  search: 'Поиск',
  ads: 'Реклама',
  social: 'Соцсети и мессенджеры',
  email: 'Почта',
  campaign: 'Кампании (utm)',
  referral: 'Другие сайты',
  direct: 'Прямые заходы',
};
const DEVICES: Record<string, string> = { desktop: 'Компьютер', mobile: 'Телефон', tablet: 'Планшет' };
const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;
const PAGES: Record<string, string> = {
  '/': 'Главная',
  '/pricing': 'Тарифы',
  '/register': 'Регистрация',
  '/login': 'Вход',
  '/terms': 'Соглашение',
  '/privacy': 'Политика',
  '/reset-password': 'Сброс пароля',
};
const FUNNEL: Record<AnalyticsReport['funnel'][number]['step'], string> = {
  landing: 'Открыли главную',
  pricing: 'Дошли до тарифов',
  signup_click: 'Нажали «Начать» или тариф',
  signup: 'Зарегистрировались',
};

const nf = new Intl.NumberFormat('ru-RU');
const pf = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} мин ${s % 60} с` : `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

function pageName(path: string): string {
  return PAGES[path] ?? path;
}

type Days = 7 | 30 | 90;

export function AnalyticsTab() {
  const [days, setDays] = useState<Days>(30);
  const report = useQuery({
    queryKey: ['admin', 'analytics', days],
    queryFn: ({ signal }) => adminApi.analytics(days, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as Days)}>
          <TabsList aria-label="Период">
            <TabsTrigger value="7">7 дней</TabsTrigger>
            <TabsTrigger value="30">30 дней</TabsTrigger>
            <TabsTrigger value="90">90 дней</TabsTrigger>
          </TabsList>
        </Tabs>
        {report.data && <LiveBadge count={report.data.live} />}
        <p className="text-sm text-muted-foreground">Гости публичных страниц; вошедшие в аккаунт не считаются.</p>
      </div>

      {report.isPending ? (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : report.isError ? (
        <p className="mt-4 text-sm text-destructive">{errorMessage(report.error)}</p>
      ) : (
        <div className={cn('mt-4 grid gap-4 transition-opacity', report.isPlaceholderData && 'opacity-60')}>
          <Report report={report.data} />
        </div>
      )}
    </>
  );
}

function LiveBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
      <span className="relative flex size-2">
        {count > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
        <span className={cn('relative inline-flex size-2 rounded-full', count > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
      </span>
      <span className="tabular-nums">
        {count > 0 ? `${nf.format(count)} сейчас на сайте` : 'Сейчас никого'}
      </span>
    </span>
  );
}

function Report({ report }: { report: AnalyticsReport }) {
  const { summary, previous, daily } = report;
  if (summary.visits === 0 && previous.visits === 0) {
    return (
      <Card>
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyTitle>Пока нет визитов</EmptyTitle>
            <EmptyDescription>
              Статистика появится, когда на сайт зайдут гости. Ваши собственные визиты с входом в аккаунт не считаются.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  }
  const series = {
    visits: daily.map((d) => d.visits),
    visitors: daily.map((d) => d.visitors),
    engaged: daily.map((d) => d.avgEngagedMs),
    bounce: daily.map((d) => (d.visits ? d.bounces / d.visits : 0)),
    signups: daily.map((d) => d.signups),
    conversion: daily.map((d) => (d.visits ? d.signups / d.visits : 0)),
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Визиты" value={nf.format(summary.visits)} change={delta(summary, previous, 'visits')} trend={series.visits} />
        <Kpi label="Посетители" value={nf.format(summary.visitors)} change={delta(summary, previous, 'visitors')} trend={series.visitors} />
        <Kpi
          label="Время на сайте"
          value={duration(summary.avgEngagedMs)}
          note={`медиана ${duration(summary.medianEngagedMs)}`}
          change={delta(summary, previous, 'avgEngagedMs')}
          trend={series.engaged}
        />
        <Kpi
          label="Отказы"
          value={pf.format(summary.bounceRate)}
          note="< 10 с, одна страница"
          change={delta(summary, previous, 'bounceRate')}
          trend={series.bounce}
          lowerIsBetter
        />
        <Kpi label="Регистрации" value={nf.format(summary.signups)} change={delta(summary, previous, 'signups')} trend={series.signups} />
        <Kpi
          label="Конверсия"
          value={pf.format(summary.conversion)}
          note="визитов с регистр."
          change={delta(summary, previous, 'conversion')}
          trend={series.conversion}
        />
      </div>

      <TrendCard report={report} />

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelCard report={report} />
        <TabbedCard
          title="Откуда приходят"
          tabs={[
            { id: 'channels', label: 'Каналы', node: <BarList rows={report.channels} label={(k) => CHANNELS[k] ?? k} total={summary.visits} signups /> },
            {
              id: 'sources',
              label: 'Сайты',
              node: <BarList rows={report.sources} total={summary.visits} signups empty="Все пришли напрямую" />,
            },
            {
              id: 'search',
              label: 'Поиск',
              node: (
                <>
                  <BarList rows={report.searchEngines} total={summary.visits} signups empty="Пока никто не пришёл из поиска" />
                  <SearchQueriesNote />
                </>
              ),
            },
            {
              id: 'campaigns',
              label: 'Кампании',
              node: <BarList rows={report.campaigns} total={summary.visits} signups empty="Нет переходов с utm_campaign" />,
            },
            {
              id: 'keywords',
              label: 'Ключевые слова',
              node: (
                <BarList
                  rows={report.keywords}
                  total={summary.visits}
                  signups
                  empty="Нет переходов с utm_term — в объявлениях Директа добавьте utm_term={keyword}"
                />
              ),
            },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionsCard report={report} />
        <ClicksCard report={report} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TabbedCard
          title="Страницы"
          tabs={[
            { id: 'entry', label: 'Входа', node: <BarList rows={report.entryPages} label={pageName} total={summary.visits} signups /> },
            {
              id: 'popular',
              label: 'Популярные',
              node: (
                <SimpleBars
                  rows={report.pages.map((p) => ({ label: pageName(p.path), value: p.views, text: `${nf.format(p.views)} просм.` }))}
                />
              ),
            },
          ]}
        />
        <DurationsCard report={report} />
        <TabbedCard
          title="Устройства"
          tabs={[
            { id: 'devices', label: 'Тип', node: <BarList rows={report.devices} label={(k) => DEVICES[k] ?? k} total={summary.visits} /> },
            { id: 'browsers', label: 'Браузеры', node: <BarList rows={report.browsers} total={summary.visits} /> },
            { id: 'systems', label: 'Системы', node: <BarList rows={report.systems} total={summary.visits} /> },
          ]}
        />
      </div>

      <RecentVisits visits={report.recent} />
    </>
  );
}

function delta(now: AnalyticsSummary, before: AnalyticsSummary, key: keyof AnalyticsSummary): number | null {
  const a = now[key];
  const b = before[key];
  if (!b) return null;
  return (a - b) / b;
}

function Kpi({
  label,
  value,
  note,
  change,
  trend,
  lowerIsBetter,
}: {
  label: string;
  value: string;
  note?: string;
  change: number | null;
  trend: number[];
  lowerIsBetter?: boolean;
}) {
  const good = change !== null && (lowerIsBetter ? change < 0 : change > 0);
  const flat = change !== null && Math.abs(change) < 0.005;
  const Arrow = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;
  const text =
    change === null ? (note ?? 'нет прошлых данных') : flat ? (note ?? 'без изменений') : (note ?? 'к прошлому периоду');
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="px-4 pt-3.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-0.5 flex min-h-4 items-center gap-1 text-xs text-muted-foreground">
          {change !== null && !flat && (
            <span
              className={cn(
                'inline-flex items-center font-medium tabular-nums',
                good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
              )}
            >
              <Arrow className="size-3.5" aria-hidden />
              {pf.format(Math.abs(change))}
            </span>
          )}
          <span className="truncate" title={text}>
            {text}
          </span>
        </p>
      </div>
      <Sparkline values={trend} />
    </Card>
  );
}

/** A tiny line of the metric over the period, under a tile: shape only, the number is above it. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) return <div className="h-9" />;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - (v / max) * 26] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 h-9 w-full text-primary" aria-hidden>
      <polygon points={`0,32 ${line} 100,32`} className="fill-primary/10" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function longDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
}

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return Math.max(1, m * pow);
  return pow * 10;
}

const TREND_METRICS = [
  { id: 'visits', label: 'Визиты' },
  { id: 'visitors', label: 'Посетители' },
  { id: 'signups', label: 'Регистрации' },
] as const;
type TrendMetric = (typeof TREND_METRICS)[number]['id'];

/** The chosen measure per day as a line with its area; hover shows the whole day. */
function TrendCard({ report }: { report: AnalyticsReport }) {
  const [metric, setMetric] = useState<TrendMetric>('visits');
  const [hover, setHover] = useState<number | null>(null);
  const days = report.daily;
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const n = days.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const labelEvery = n > 31 ? 14 : n > 7 ? 5 : 1;
  const shown = hover === null ? null : days[hover];
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{TREND_METRICS.find((m) => m.id === metric)?.label} по дням</CardTitle>
          <CardDescription className="tabular-nums">
            {nf.format(total)} за {report.days} дней
          </CardDescription>
        </div>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as TrendMetric)}>
          <TabsList>
            {TREND_METRICS.map((m) => (
              <TabsTrigger key={m.id} value={m.id}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="flex h-60 gap-3 text-[11px] text-muted-foreground">
          <div className="flex flex-col-reverse justify-between pb-6 text-right tabular-nums" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="-mb-1.5 leading-3">
                {nf.format(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="absolute inset-x-0 top-0 bottom-6">
              <div className="absolute inset-0 flex flex-col-reverse justify-between" aria-hidden>
                {ticks.map((t) => (
                  <div key={t} className={cn('border-t', t === 0 ? 'border-border' : 'border-dashed border-border/60')} />
                ))}
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible text-primary" aria-hidden>
                <polygon points={`${x(0)},100 ${line} ${x(n - 1)},100`} className="fill-primary/10" />
                <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {shown && hover !== null && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${x(hover)}%` }} />
                  <span
                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
                    style={{ left: `${x(hover)}%`, top: `${y(values[hover])}%` }}
                  />
                  <div
                    className={cn(
                      'pointer-events-none absolute top-1 z-10 w-48 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-md',
                      x(hover) > 60 ? '-translate-x-[calc(100%+10px)]' : 'translate-x-2.5',
                    )}
                    style={{ left: `${x(hover)}%` }}
                  >
                    <p className="font-medium">{longDay(shown.date)}</p>
                    <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
                      <dt className="text-muted-foreground">Визиты</dt>
                      <dd className="text-right">{nf.format(shown.visits)}</dd>
                      <dt className="text-muted-foreground">Посетители</dt>
                      <dd className="text-right">{nf.format(shown.visitors)}</dd>
                      <dt className="text-muted-foreground">Регистрации</dt>
                      <dd className="text-right">{nf.format(shown.signups)}</dd>
                      <dt className="text-muted-foreground">Время</dt>
                      <dd className="text-right">{shown.visits ? duration(shown.avgEngagedMs) : '—'}</dd>
                    </dl>
                  </div>
                </>
              )}
              {/* Hit areas: one column per day, wider than the line. */}
              <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
                {days.map((d, i) => (
                  <div key={d.date} className="h-full flex-1" onMouseEnter={() => setHover(i)} />
                ))}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-4" aria-hidden>
              {days.map((d, i) =>
                i % labelEvery === 0 || i === n - 1 ? (
                  <span key={d.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(i)}%` }}>
                    {shortDay(d.date)}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** From the landing page to the registration: how many visits reach each step. */
function FunnelCard({ report }: { report: AnalyticsReport }) {
  const first = report.funnel[0]?.visits ?? 0;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Воронка</CardTitle>
        <CardDescription>От главной до регистрации: сколько визитов дошли до каждого шага</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {report.funnel.map((s, i) => {
            const share = first ? s.visits / first : 0;
            const prev = i > 0 ? report.funnel[i - 1].visits : null;
            return (
              <li key={s.step} className="grid gap-1.5">
                <div className="flex items-baseline gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{FUNNEL[s.step]}</span>
                  {prev !== null && (
                    <span className="text-xs text-muted-foreground tabular-nums" title="От предыдущего шага">
                      <ArrowRight className="mr-0.5 inline size-3" aria-hidden />
                      {prev ? pf.format(s.visits / prev) : '—'}
                    </span>
                  )}
                  <span className="w-12 text-right font-medium tabular-nums">{nf.format(s.visits)}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pf.format(share)}</span>
                </div>
                <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
                  <div className="h-full rounded-md bg-primary transition-[width] duration-500" style={{ width: `${Math.max(share * 100, s.visits ? 1.5 : 0)}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function TabbedCard({ title, tabs }: { title: string; tabs: Array<{ id: string; label: string; node: ReactNode }> }) {
  return (
    <Card className="gap-3">
      <Tabs defaultValue={tabs[0].id} className="gap-3">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <TabsList variant="line" className="-mr-1 h-7 flex-wrap">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="h-7 px-2 text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </CardHeader>
        <CardContent>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="grid gap-3">
              {t.node}
            </TabsContent>
          ))}
        </CardContent>
      </Tabs>
    </Card>
  );
}

function Bar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

function BarList({
  rows,
  total,
  label = (k) => k,
  signups,
  empty = 'Нет данных',
}: {
  rows: AnalyticsBreakdown[];
  total: number;
  label?: (key: string) => string;
  signups?: boolean;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.slice(0, 8).map((r) => (
        <li key={r.key} className="grid gap-1" title={`Среднее время: ${duration(r.avgEngagedMs)}`}>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{label(r.key)}</span>
            {signups && r.signups > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums" title="Регистрации">
                <UserPlus className="size-3" aria-hidden />
                {nf.format(r.signups)}
              </span>
            )}
            <span className="font-medium tabular-nums">{nf.format(r.visits)}</span>
            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pf.format(total ? r.visits / total : 0)}</span>
          </div>
          <Bar share={r.visits / max} />
        </li>
      ))}
    </ul>
  );
}

function SimpleBars({ rows, empty = 'Нет данных' }: { rows: Array<{ label: string; value: number; text: string }>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.slice(0, 8).map((r) => (
        <li key={r.label} className="grid gap-1">
          <div className="flex items-baseline gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{r.text}</span>
          </div>
          <Bar share={r.value / max} />
        </li>
      ))}
    </ul>
  );
}

/** Which blocks of the landing page are read, top to bottom like on the page. */
function SectionsCard({ report }: { report: AnalyticsReport }) {
  const byId = new Map(report.sections.map((s) => [s.section, s]));
  const order = [...Object.keys(SECTION_NAMES), ...report.sections.map((s) => s.section).filter((id) => !(id in SECTION_NAMES))];
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Что читают на главной</CardTitle>
        <CardDescription>
          Доля из {nf.format(report.landingVisits)} визитов главной, дошедших до блока, и среднее время на нём
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {order.map((id) => {
            const s = byId.get(id);
            const reach = s?.reach ?? 0;
            return (
              <li key={id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{SECTION_NAMES[id] ?? id}</span>
                <div className="h-5 overflow-hidden rounded bg-muted">
                  <div className="h-full rounded bg-primary/80 transition-[width] duration-500" style={{ width: `${reach * 100}%` }} />
                </div>
                <span className="w-24 text-right text-xs tabular-nums">
                  <span className="font-medium text-foreground">{pf.format(reach)}</span>
                  <span className="text-muted-foreground"> · {s ? duration(s.avgMs) : '—'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function ClicksCard({ report }: { report: AnalyticsReport }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Клики по кнопкам</CardTitle>
        <CardDescription>Сколько раз нажали и в скольких визитах</CardDescription>
      </CardHeader>
      <CardContent>
        <SimpleBars
          rows={report.clicks.map((c) => ({
            label: TRACK_NAMES[c.name] ?? c.name,
            value: c.clicks,
            text: `${nf.format(c.clicks)} · в ${nf.format(c.visits)} виз.`,
          }))}
          empty="Пока никто не нажимал"
        />
      </CardContent>
    </Card>
  );
}

/** How long visits last: columns of the duration buckets. */
function DurationsCard({ report }: { report: AnalyticsReport }) {
  const max = Math.max(1, ...report.durations.map((d) => d.visits));
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Длительность визитов</CardTitle>
        <CardDescription>Активное время: вкладка на экране и посетитель что-то делает</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-2">
          {report.durations.map((d) => (
            <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${d.label}: ${d.visits}`}>
              <span className="text-xs font-medium tabular-nums">{d.visits ? nf.format(d.visits) : ''}</span>
              <div className="w-full rounded-t-[4px] bg-primary transition-[height] duration-500" style={{ height: `${(d.visits / max) * 100}%`, minHeight: d.visits ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 border-t pt-2">
          {report.durations.map((d) => (
            <span key={d.label} className="min-w-0 flex-1 text-center text-[10px] leading-tight text-muted-foreground">
              {d.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function sourceOf(v: AnalyticsRecentVisit): string {
  if (v.searchEngine) return `${CHANNELS[v.channel] ?? v.channel} · ${v.searchEngine}`;
  if (v.source) return `${CHANNELS[v.channel] ?? v.channel} · ${v.source}`;
  return CHANNELS[v.channel] ?? v.channel;
}

/** The latest visits one by one: where from, which pages, how long, on what. */
function RecentVisits({ visits }: { visits: AnalyticsRecentVisit[] }) {
  const now = useMemo(() => Date.now(), [visits]);
  return (
    <Card className="gap-3 pb-2">
      <CardHeader>
        <CardTitle className="text-base">Последние визиты</CardTitle>
        <CardDescription>Новые сверху; зелёная точка — посетитель сейчас на сайте</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {visits.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">За этот период визитов нет</p>
        ) : (
          <ul className="divide-y">
            {visits.map((v, i) => {
              const DeviceIcon = DEVICE_ICONS[v.device as keyof typeof DEVICE_ICONS] ?? Monitor;
              return (
                <li key={`${v.startedAt}-${i}`} className="grid gap-x-4 gap-y-1 px-6 py-3 text-sm sm:grid-cols-[9rem_minmax(0,13rem)_minmax(0,1fr)_auto]">
                  <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground tabular-nums">
                    <span
                      className={cn('size-1.5 shrink-0 rounded-full', v.live ? 'bg-emerald-500' : 'bg-transparent')}
                      aria-label={v.live ? 'Сейчас на сайте' : undefined}
                    />
                    {timeAgo(v.startedAt, now)}
                  </span>
                  <span className="truncate" title={sourceOf(v)}>
                    {sourceOf(v)}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground">
                    {v.pages.map((p, j) => (
                      <span key={j} className="inline-flex items-center gap-1.5">
                        {j > 0 && <ArrowRight className="size-3 shrink-0" aria-hidden />}
                        <span className={cn(j === 0 && 'text-foreground')}>{pageName(p)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground sm:justify-end">
                    <span className="tabular-nums">{duration(v.engagedMs)}</span>
                    <span className="inline-flex items-center gap-1" title={`${DEVICES[v.device] ?? v.device} · ${v.browser} · ${v.os}`}>
                      <DeviceIcon className="size-3.5" aria-hidden />
                      <span className="hidden md:inline">{v.browser}</span>
                    </span>
                    {v.signedUp && (
                      <Badge variant="secondary" className="gap-1">
                        <UserPlus className="size-3" aria-hidden /> Регистрация
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SearchQueriesNote() {
  return (
    <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Поисковики не передают сайтам сами запросы. По каким запросам показывается сайт и сколько по ним кликают — в{' '}
        <a href="https://webmaster.yandex.ru/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline">
          Яндекс.Вебмастере <ExternalLink className="size-3" />
        </a>{' '}
        и{' '}
        <a
          href="https://search.google.com/search-console"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
        >
          Google Search Console <ExternalLink className="size-3" />
        </a>
        .
      </span>
    </p>
  );
}
