import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Info } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { AnalyticsBreakdown, AnalyticsReport, AnalyticsSummary } from '@/api/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SECTION_NAMES, TRACK_NAMES } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/**
 * «Посещаемость» in /admin: visits of the public pages (backend/app/analytics.py). Every bar here is
 * one measure in one hue (--primary), so there is no legend; values are written next to the bars.
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
const PAGES: Record<string, string> = {
  '/': 'Главная',
  '/pricing': 'Тарифы',
  '/register': 'Регистрация',
  '/login': 'Вход',
  '/terms': 'Соглашение',
  '/privacy': 'Политика',
  '/reset-password': 'Сброс пароля',
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

export function AnalyticsTab() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const report = useQuery({
    queryKey: ['admin', 'analytics', days],
    queryFn: ({ signal }) => adminApi.analytics(days, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30 | 90)}>
          <SelectTrigger className="h-9 w-44" aria-label="Период">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 дней</SelectItem>
            <SelectItem value="30">30 дней</SelectItem>
            <SelectItem value="90">90 дней</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Гости публичных страниц: главная, тарифы, документы, вход и регистрация. Вошедшие пользователи не считаются.
        </p>
      </div>

      {report.isPending ? (
        <div className="mt-4 grid gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : report.isError ? (
        <p className="mt-4 text-sm text-destructive">{errorMessage(report.error)}</p>
      ) : (
        <div className={cn('mt-4 grid gap-4', report.isPlaceholderData && 'opacity-60')}>
          <Report report={report.data} />
        </div>
      )}
    </>
  );
}

function Report({ report }: { report: AnalyticsReport }) {
  const { summary, previous } = report;
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
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Визиты" value={nf.format(summary.visits)} change={delta(summary, previous, 'visits')} />
        <Kpi label="Посетители" value={nf.format(summary.visitors)} change={delta(summary, previous, 'visitors')} />
        <Kpi
          label="Время на сайте"
          value={duration(summary.avgEngagedMs)}
          note={`медиана ${duration(summary.medianEngagedMs)}`}
          change={delta(summary, previous, 'avgEngagedMs')}
        />
        <Kpi
          label="Отказы"
          value={pf.format(summary.bounceRate)}
          note="меньше 10 с на одной странице"
          change={delta(summary, previous, 'bounceRate')}
          lowerIsBetter
        />
        <Kpi label="Регистрации" value={nf.format(summary.signups)} change={delta(summary, previous, 'signups')} />
        <Kpi
          label="Конверсия"
          value={pf.format(summary.conversion)}
          note="визитов с регистрацией"
          change={delta(summary, previous, 'conversion')}
        />
      </div>

      <DailyChart report={report} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Источники трафика"
          rows={report.channels}
          label={(k) => CHANNELS[k] ?? k}
          total={summary.visits}
          showSignups
        />
        <BarList
          title="Сайты и метки"
          description="Откуда пришли: сайт по ссылке или utm_source"
          rows={report.sources}
          total={summary.visits}
          showSignups
          empty="Все пришли напрямую"
        />
        <BarList
          title="Поисковые системы"
          rows={report.searchEngines}
          total={summary.visits}
          showSignups
          empty="Пока никто не пришёл из поиска"
          footer={<SearchQueriesNote />}
        />
        <BarList
          title="Ключевые слова рекламы"
          description="utm_term из ссылок объявлений (в Директе — {keyword})"
          rows={report.keywords}
          total={summary.visits}
          showSignups
          empty="Нет переходов с utm_term"
        />
        <BarList
          title="Рекламные кампании"
          description="utm_source / utm_campaign"
          rows={report.campaigns}
          total={summary.visits}
          showSignups
          empty="Нет переходов с utm_campaign"
        />
        <BarList
          title="Страницы входа"
          rows={report.entryPages}
          label={(k) => PAGES[k] ?? k}
          total={summary.visits}
          showSignups
        />
      </div>

      <Sections report={report} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleBars
          title="Клики по кнопкам"
          description="Сколько раз нажали и в скольких визитах"
          rows={report.clicks.map((c) => ({
            label: TRACK_NAMES[c.name] ?? c.name,
            value: c.clicks,
            text: `${nf.format(c.clicks)} · в ${nf.format(c.visits)} виз.`,
          }))}
          empty="Пока никто не нажимал"
        />
        <SimpleBars
          title="Длительность визитов"
          description="Сколько визитов длились столько активного времени"
          rows={report.durations.map((d) => ({ label: d.label, value: d.visits, text: nf.format(d.visits) }))}
        />
        <SimpleBars
          title="Популярные страницы"
          rows={report.pages.map((p) => ({
            label: PAGES[p.path] ?? p.path,
            value: p.views,
            text: `${nf.format(p.views)} просм.`,
          }))}
        />
        <div className="grid gap-4">
          <BarList title="Устройства" rows={report.devices} label={(k) => DEVICES[k] ?? k} total={summary.visits} />
          <BarList title="Браузеры" rows={report.browsers} total={summary.visits} />
          <BarList title="Системы" rows={report.systems} total={summary.visits} />
        </div>
      </div>
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
  lowerIsBetter,
}: {
  label: string;
  value: string;
  note?: string;
  change: number | null;
  lowerIsBetter?: boolean;
}) {
  const good = change !== null && (lowerIsBetter ? change < 0 : change > 0);
  const flat = change !== null && Math.abs(change) < 0.005;
  const Arrow = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;
  const text =
    change === null
      ? (note ?? 'в прошлом периоде данных нет')
      : flat
        ? (note ?? 'как в прошлом периоде')
        : (note ?? 'к прошлому периоду');
  return (
    <Card className="gap-1 px-4 py-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="flex min-h-4 items-center gap-1 text-xs text-muted-foreground">
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
    </Card>
  );
}

function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Visits per day: one series, columns from the baseline; the tooltip adds visitors and registrations. */
function DailyChart({ report }: { report: AnalyticsReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = report.daily;
  const max = Math.max(1, ...days.map((d) => d.visits));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const shown = hover === null ? null : days[hover];
  const labelEvery = days.length > 31 ? 14 : days.length > 7 ? 5 : 1;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Визиты по дням</CardTitle>
          <CardDescription>
            {shown
              ? `${shortDay(shown.date)}: ${nf.format(shown.visits)} визитов, ${nf.format(shown.visitors)} посетителей, ${nf.format(shown.signups)} регистраций`
              : 'Наведите на столбец, чтобы увидеть посетителей и регистрации за день'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative flex h-48 gap-2 text-[11px] text-muted-foreground">
          <div className="flex flex-col-reverse justify-between pb-5 text-right tabular-nums" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="-mb-1.5 leading-3">
                {nf.format(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col-reverse justify-between" aria-hidden>
              {ticks.map((t) => (
                <div key={t} className={cn('border-t', t === 0 ? 'border-border' : 'border-border/50 border-dashed')} />
              ))}
            </div>
            <div
              className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[2px]"
              role="img"
              aria-label="Визиты по дням"
              onMouseLeave={() => setHover(null)}
            >
              {days.map((d, i) => (
                <div
                  key={d.date}
                  className="group flex h-full min-w-0 flex-1 items-end"
                  onMouseEnter={() => setHover(i)}
                  title={`${shortDay(d.date)}: ${d.visits}`}
                >
                  <div
                    className={cn(
                      'w-full rounded-t-[4px] bg-primary transition-opacity',
                      hover !== null && hover !== i && 'opacity-40',
                    )}
                    style={{ height: d.visits ? `${(d.visits / top) * 100}%` : 0 }}
                  />
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-4 gap-[2px]" aria-hidden>
              {days.map((d, i) => (
                <span key={d.date} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
                  {i % labelEvery === 0 ? shortDay(d.date) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return Math.max(1, m * pow);
  return pow * 10;
}

function Bar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

function BarList({
  title,
  description,
  rows,
  total,
  label = (k) => k,
  showSignups,
  empty = 'Нет данных',
  footer,
}: {
  title: string;
  description?: string;
  rows: AnalyticsBreakdown[];
  total: number;
  label?: (key: string) => string;
  showSignups?: boolean;
  empty?: string;
  footer?: ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-2.5">
            {rows.slice(0, 10).map((r) => (
              <li key={r.key} className="grid gap-1" title={`Среднее время: ${duration(r.avgEngagedMs)}`}>
                <div className="flex items-baseline gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{label(r.key)}</span>
                  {showSignups && r.signups > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">рег. {nf.format(r.signups)}</span>
                  )}
                  <span className="font-medium tabular-nums">{nf.format(r.visits)}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                    {pf.format(total ? r.visits / total : 0)}
                  </span>
                </div>
                <Bar share={r.visits / max} />
              </li>
            ))}
          </ul>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}

function SimpleBars({
  title,
  description,
  rows,
  empty = 'Нет данных',
}: {
  title: string;
  description?: string;
  rows: Array<{ label: string; value: number; text: string }>;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((r) => (
              <li key={r.label} className="grid gap-1">
                <div className="flex items-baseline gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{r.text}</span>
                </div>
                <Bar share={r.value / max} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Which blocks of the landing page are read: share of its visits that saw each and the time in it. */
function Sections({ report }: { report: AnalyticsReport }) {
  const byId = new Map(report.sections.map((s) => [s.section, s]));
  const order = [
    ...Object.keys(SECTION_NAMES),
    ...report.sections.map((s) => s.section).filter((id) => !(id in SECTION_NAMES)),
  ];
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">Блоки главной страницы</CardTitle>
        <CardDescription>
          Сверху вниз, как на странице: какая доля из {nf.format(report.landingVisits)} визитов главной дошла до блока и
          сколько в среднем на нём провела
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-8">
          {order.map((id) => {
            const s = byId.get(id);
            return (
              <li key={id} className="grid gap-1">
                <div className="flex items-baseline gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{SECTION_NAMES[id] ?? id}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{s ? duration(s.avgMs) : '—'}</span>
                  <span className="w-14 text-right font-medium tabular-nums">{pf.format(s?.reach ?? 0)}</span>
                </div>
                <Bar share={s?.reach ?? 0} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function SearchQueriesNote() {
  return (
    <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Поисковики не передают сайтам сами запросы. По каким запросам показывается сайт и сколько по ним кликают —
        в{' '}
        <a
          href="https://webmaster.yandex.ru/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
        >
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
