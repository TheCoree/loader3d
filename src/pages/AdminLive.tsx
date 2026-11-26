import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Clock,
  Globe,
  MapPin,
  Monitor,
  MousePointerClick,
  PencilRuler,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Tablet,
  UserPlus,
  Users,
} from 'lucide-react';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { LiveTab } from '@/api/types';
import { TierBadge } from '@/components/TierBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SECTION_NAMES } from '@/lib/analytics';
import { initials, plural } from '@/lib/format';
import { TIERS_ENABLED } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { CHANNELS, DEVICES, pageName } from '@/pages/AdminAnalytics';
import { MessageComposer, MessageRow, MessageStatus, type MessageTarget } from '@/pages/AdminMessages';

/**
 * Admin «Онлайн»: who is on the site right now (backend/app/presence.py, every open tab reports every 15 s) —
 * guests and signed-in users, what they have open, where they came from, their town and provider (by the IP,
 * masked), and the messages of the team to users with what became of them. Robots and administrators (also
 * guests from an administrator's address) are not counted and hidden unless asked.
 */

const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;
const NEW_USER_DAYS = 7;

export function useLive() {
  return useQuery({
    queryKey: ['admin', 'live'],
    queryFn: ({ signal }) => adminApi.live(signal),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

function minutes(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} с`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

function since(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 1000;
}

/** What the tab has open, in words: the page and the section, the plan in the editor, the demo. */
function what(tab: LiveTab): { title: string; note?: string } {
  const d = tab.detail;
  const size =
    d && d.vehicles != null && d.items != null
      ? `${plural(d.vehicles, ['машина', 'машины', 'машин'])} · ${plural(d.items, ['груз', 'груза', 'грузов'])}`
      : undefined;
  if (d?.demo) return { title: 'Демо редактора', note: size };
  if (tab.path === '/plans/:id') return { title: d?.plan ? `Редактор: «${d.plan}»` : 'Редактор', note: size };
  const section = tab.section ? SECTION_NAMES[tab.section] ?? tab.section : undefined;
  return { title: pageName(tab.path), note: section && `смотрит: ${section}` };
}

function sourceOf(tab: LiveTab): string | null {
  const s = tab.source;
  if (!s) return null;
  if (s.company) return `Письмо: ${s.company}`;
  if (!s.channel) return null;
  const channel = CHANNELS[s.channel] ?? s.channel;
  const detail = s.searchEngine ?? s.referrerHost ?? s.utmSource;
  return detail ? `${channel} · ${detail}` : channel;
}

function placeOf(tab: LiveTab): string | null {
  const p = tab.place;
  if (!p) return null;
  const where = [p.city, p.city && p.country === 'Россия' ? null : p.country].filter(Boolean).join(', ');
  return where || null;
}

function StatusDot({ tab }: { tab: LiveTab }) {
  const active = tab.online && tab.visible && tab.idleSeconds < 60;
  const label = !tab.online ? 'Вкладка закрыта' : active ? 'Активен' : tab.visible ? 'Неактивен' : 'Вкладка в фоне';
  return (
    <span className="relative flex size-2.5 shrink-0" title={label} aria-label={label}>
      {active && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-50" />}
      <span
        className={cn(
          'relative inline-flex size-2.5 rounded-full',
          active ? 'bg-emerald-500' : tab.online ? 'bg-amber-400' : 'bg-muted-foreground/30',
        )}
      />
    </span>
  );
}

function Who({ tab, now }: { tab: LiveTab; now: number }) {
  const u = tab.user;
  const DeviceIcon = DEVICE_ICONS[tab.device as keyof typeof DEVICE_ICONS] ?? Monitor;
  const isNew = u && since(u.createdAt, now) < NEW_USER_DAYS * 86_400;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <StatusDot tab={tab} />
      {u ? (
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(u.displayName)}</AvatarFallback>
        </Avatar>
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          {tab.kind === 'bot' ? <Bot className="size-4" /> : tab.kind === 'admin' ? <ShieldCheck className="size-4" /> : <DeviceIcon className="size-4" />}
        </span>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">
            {u ? u.displayName : tab.kind === 'bot' ? 'Робот' : tab.kind === 'admin' ? 'Вы или администратор' : 'Гость'}
          </span>
          {u?.tier && <TierBadge tier={u.tier} />}
          {u?.trial && <span className="text-xs text-muted-foreground">пробный</span>}
          {isNew && <Badge className="bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">новый</Badge>}
          {u && (
            <span className={cn('text-xs', u.planCount === 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              {u.planCount === 0 ? 'нет схем' : plural(u.planCount, ['схема', 'схемы', 'схем'])}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {u ? u.email : `${DEVICES[tab.device] ?? tab.device} · ${tab.browser} · ${tab.os}`}
        </div>
      </div>
    </div>
  );
}

function LiveRow({ tab, now, onMessage }: { tab: LiveTab; now: number; onMessage?: () => void }) {
  const doing = what(tab);
  const source = sourceOf(tab);
  const place = placeOf(tab);
  const onSite = since(tab.firstSeen, now);
  return (
    <li
      className={cn(
        'grid gap-x-6 gap-y-2 px-4 py-3.5 text-sm lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,15rem)_auto]',
        !tab.online && 'opacity-60',
      )}
    >
      <Who tab={tab} now={now} />

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          {tab.path === '/plans/:id' && <PencilRuler className="size-3.5 shrink-0 text-primary" aria-hidden />}
          <span className="truncate">{doing.title}</span>
        </div>
        {doing.note && <div className="truncate text-xs text-muted-foreground">{doing.note}</div>}
        {tab.trail.length > 1 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {tab.trail.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <ArrowRight className="size-3" aria-hidden />}
                {pageName(p)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid min-w-0 content-start gap-0.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5" title={tab.place?.region ?? undefined}>
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {place ?? 'Место неизвестно'}
            {tab.place?.org && <span> · {tab.place.org}</span>}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Globe className="size-3 shrink-0" aria-hidden />
          <span className="font-mono">{tab.ip}</span>
          {tab.user && <span className="truncate">· {tab.browser}, {tab.os}</span>}
        </span>
        {source && (
          <span className="flex min-w-0 items-center gap-1.5">
            <MousePointerClick className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{source}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Clock className="size-3 shrink-0" aria-hidden />
          {tab.online ? (
            <span>
              на сайте {minutes(onSite)}
              {!tab.visible ? ' · вкладка в фоне' : tab.idleSeconds >= 60 ? ` · без действий ${minutes(tab.idleSeconds)}` : ''}
            </span>
          ) : (
            <span>закрыта {minutes(since(tab.lastSeen, now))} назад · на сайте {minutes((new Date(tab.lastSeen).getTime() - new Date(tab.firstSeen).getTime()) / 1000)}</span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
        {tab.signedUp && (
          <Badge variant="secondary" className="gap-1">
            <UserPlus className="size-3" aria-hidden /> Регистрация
          </Badge>
        )}
        {onMessage && (
          <Button size="sm" variant="outline" onClick={onMessage}>
            <Send /> Написать
          </Button>
        )}
        {tab.user?.lastMessage && <MessageStatus message={tab.user.lastMessage} />}
      </div>
    </li>
  );
}

export function LiveTabPanel() {
  const live = useLive();
  const messages = useQuery({
    queryKey: ['admin', 'messages'],
    queryFn: ({ signal }) => adminApi.messages(signal),
    refetchInterval: 15_000,
  });
  const [everyone, setEveryone] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const [target, setTarget] = useState<MessageTarget | null>(null);
  const now = useMemo(() => Date.now(), [live.data]);

  if (live.isPending) return <Skeleton className="h-64 rounded-xl" />;
  if (live.isError) return <p className="text-sm text-destructive">{errorMessage(live.error)}</p>;

  const { counts, tabs, geo } = live.data;
  const shown = tabs.filter((t) => everyone || t.kind === 'guest' || t.kind === 'user');
  const online = shown.filter((t) => t.online);
  const gone = shown.filter((t) => !t.online);
  const people = counts.guests + counts.users;
  // Anyone signed in, administrators too (to try a message on oneself).
  const write = (tab: LiveTab) =>
    tab.user
      ? () =>
          setTarget({
            id: tab.user!.id,
            email: tab.user!.email,
            displayName: tab.user!.displayName,
            canGift: TIERS_ENABLED && tab.user!.tier !== 'custom',
          })
      : undefined;

  return (
    <div className="grid gap-4">
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex size-2.5">
                {people > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-50" />}
                <span className={cn('relative inline-flex size-2.5 rounded-full', people > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              </span>
              Сейчас на сайте
            </div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">{people}</div>
          </div>
          <Count icon={Globe} label="гостей" value={counts.guests} />
          <Count icon={Users} label="пользователей" value={counts.users} />
          <Count icon={PencilRuler} label="редактируют схемы" value={counts.editing} accent />
          <Count icon={Monitor} label="в демо" value={counts.demo} />
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={everyone} onCheckedChange={setEveryone} aria-label="Показывать роботов и администраторов" />
            Роботы и админы ({counts.bots + counts.admins})
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Каждая открытая вкладка отмечается раз в 15 секунд; роботы, вы и другие администраторы (и гости с вашего адреса) не
          считаются. IP показан без последней части, хранится только в памяти сервера, пока человек на сайте.
        </p>
      </Card>

      <Card className="gap-0 py-0">
        {online.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Radio />
              </EmptyMedia>
              <EmptyTitle>Сейчас на сайте никого</EmptyTitle>
              <EmptyDescription>Как только кто-то откроет сайт, это будет видно здесь — без перезагрузки страницы.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {online.map((t) => (
              <LiveRow key={t.id} tab={t} now={now} onMessage={write(t)} />
            ))}
          </ul>
        )}
      </Card>

      {gone.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowGone(!showGone)} aria-expanded={showGone}>
            <ChevronDown className={cn('transition-transform', showGone && 'rotate-180')} />
            Ушли за 15 минут · {gone.length}
          </Button>
          {showGone && (
            <Card className="mt-2 gap-0 py-0">
              <ul className="divide-y">
                {gone.map((t) => (
                  <LiveRow key={t.id} tab={t} now={now} onMessage={write(t)} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Card className="gap-3 p-5">
        <div>
          <div className="font-medium">Сообщения пользователям</div>
          <p className="text-sm text-muted-foreground">
            Написать можно кнопкой у пользователя здесь или в меню «Пользователей». Видно, показано ли сообщение, какая кнопка
            нажата и что в ответе.
          </p>
        </div>
        {messages.data?.length ? (
          <ul className="divide-y rounded-lg bg-muted/30">
            {messages.data.slice(0, 15).map((m) => (
              <MessageRow key={m.id} message={m} showUser />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Сообщений пока не было.</p>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {geo ? (
          <>
            Город и провайдер по IP —{' '}
            <a href="https://db-ip.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              IP Geolocation by DB-IP
            </a>
            .
          </>
        ) : (
          'Город и провайдер появятся, когда сервер скачает бесплатную базу DB-IP (раз в месяц, сам, в течение часа после запуска).'
        )}
      </p>

      {target && <MessageComposer user={target} open onOpenChange={(open) => !open && setTarget(null)} />}
    </div>
  );
}

function Count({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className={cn('size-3.5', accent && value > 0 && 'text-primary')} aria-hidden />
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', accent && value > 0 && 'text-primary')}>{value}</div>
    </div>
  );
}
