import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Building2,
  ChevronDown,
  Eye,
  Inbox,
  Link2,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { Mailbox, MailKind, MailMessage, OutreachContact, OutreachList } from '@/api/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fullDate, plural, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Admin «Почта»: the mailbox the letters to companies are answered in (backend/app/inbox.py) — replies, bounces and
 * auto-replies with the mailbox's own read flag — and the letters themselves, each with its referral link
 * (backend/app/outreach.py). Two views, each with a search, filters and an order.
 */

const KIND: Record<MailKind, { label: string; plural: string; tone: string }> = {
  reply: { label: 'Ответ', plural: 'Ответы', tone: 'bg-primary/10 text-primary' },
  bounce: { label: 'Не доставлено', plural: 'Отказы', tone: 'bg-destructive/10 text-destructive' },
  auto: { label: 'Автоответ', plural: 'Автоответы', tone: 'bg-muted text-muted-foreground' },
  letter: { label: 'Письмо', plural: 'Письма', tone: 'bg-muted text-muted-foreground' },
};

type OutcomeKey = 'signup' | 'reply' | 'clicked' | 'bounce' | 'auto' | 'queued' | 'sent' | 'failed' | 'new';

const OUTCOME: Record<OutcomeKey, { label: string; tone: string }> = {
  signup: { label: 'Зарегистрировались', tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' },
  reply: { label: 'Ответили', tone: KIND.reply.tone },
  clicked: { label: 'Перешли по ссылке', tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-400' },
  bounce: { label: 'Не доставлено', tone: KIND.bounce.tone },
  auto: { label: 'Автоответ', tone: KIND.auto.tone },
  queued: { label: 'В очереди', tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-400' },
  sent: { label: 'Отправлено', tone: 'bg-muted text-foreground' },
  failed: { label: 'Ошибка отправки', tone: KIND.bounce.tone },
  new: { label: 'Не отправлено', tone: 'bg-muted text-muted-foreground' },
};

/** What came of a letter, the strongest first: a sign-up, a reply, a click on the link, a bounce, then the sending. */
function outcome(contact: OutreachContact, own: readonly MailMessage[]): OutcomeKey {
  if (contact.signups.length) return 'signup';
  if (own.some((m) => m.kind === 'reply' || m.kind === 'letter')) return 'reply';
  if (contact.visits > 0) return 'clicked';
  if (own.some((m) => m.kind === 'bounce')) return 'bounce';
  if (own.some((m) => m.kind === 'auto')) return 'auto';
  return contact.status;
}

const has = (query: string, ...fields: Array<string | null | undefined>) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
};

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function MailTab() {
  const contacts = useQuery({
    queryKey: ['admin', 'outreach'],
    queryFn: ({ signal }) => adminApi.outreach(signal),
    // The job sends one letter a minute: show it leave.
    refetchInterval: (query) => (query.state.data?.items.some((c) => c.status === 'queued') ? 15_000 : false),
  });
  const mailbox = useQuery({ queryKey: ['admin', 'mail'], queryFn: ({ signal }) => adminApi.mailbox(signal) });
  const [view, setView] = useState<'inbox' | 'outreach'>('inbox');
  const messages = useMemo(() => mailbox.data?.messages ?? [], [mailbox.data]);
  const unread = messages.filter((m) => !m.seen).length;
  const companies = contacts.data?.items ?? [];
  const companyOf = (id: string | null) => (id ? companies.find((c) => c.id === id)?.company : undefined);

  return (
    <div>
      <Tabs value={view} onValueChange={(v) => setView(v as 'inbox' | 'outreach')}>
        <TabsList>
          <TabsTrigger value="inbox">
            <Inbox /> Входящие
            {unread > 0 && <Badge className="ml-1 h-4.5 min-w-4.5 px-1 tabular-nums">{unread}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="outreach">
            <Send /> Рассылка
            {companies.length > 0 && <span className="ml-1 text-xs text-muted-foreground tabular-nums">{companies.length}</span>}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-4">
        {view === 'inbox' ? (
          <InboxView query={mailbox} messages={messages} companyOf={companyOf} />
        ) : (
          <OutreachView query={contacts} messages={messages} />
        )}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder: string }) {
  return (
    <InputGroup className="h-9 sm:max-w-xs">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder={placeholder} value={value} aria-label="Поиск" onChange={(e) => onChange(e.target.value)} />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Очистить поиск" onClick={() => onChange('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

// ------------------------------------------------------------------ inbox

type InboxFilter = 'all' | 'unread' | MailKind;

function InboxView({
  query,
  messages,
  companyOf,
}: {
  query: UseQueryResult<Mailbox>;
  messages: readonly MailMessage[];
  companyOf(id: string | null): string | undefined;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const count = (f: InboxFilter) =>
    f === 'all' ? messages.length : f === 'unread' ? messages.filter((m) => !m.seen).length : messages.filter((m) => m.kind === f).length;
  const shown = messages
    .filter((m) => (filter === 'all' ? true : filter === 'unread' ? !m.seen : m.kind === filter))
    .filter((m) => has(search, m.senderName, m.sender, m.subject, m.text, m.about, companyOf(m.contactId)))
    .sort((a, b) => (order === 'new' ? time(b.receivedAt) - time(a.receivedAt) : time(a.receivedAt) - time(b.receivedAt)));
  const filters: InboxFilter[] = ['all', 'unread', 'reply', 'bounce', 'auto', 'letter'];

  return (
    <>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchBox value={search} onChange={setSearch} placeholder="Отправитель, тема, текст, компания" />
        <Select value={order} onValueChange={(v) => setOrder(v as 'new' | 'old')}>
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Порядок">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Сначала новые</SelectItem>
            <SelectItem value="old">Сначала старые</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="lg:ml-auto" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? <Spinner /> : <RefreshCw />} Обновить
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Какие письма">
        {filters
          .filter((f) => f === 'all' || f === 'unread' || count(f) > 0)
          .map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'secondary' : 'ghost'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Все' : f === 'unread' ? 'Непрочитанные' : KIND[f].plural}
              <span className="text-muted-foreground tabular-nums">{count(f)}</span>
            </Button>
          ))}
      </div>

      <div className="mt-3">
        {query.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">{errorMessage(query.error)}</p>
        ) : query.data.error ? (
          <p className="text-sm text-destructive">{query.data.error}</p>
        ) : shown.length === 0 ? (
          <Card>
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>{messages.length ? 'Ничего не нашлось' : 'Писем нет'}</EmptyTitle>
                <EmptyDescription>
                  {messages.length ? 'Измените поиск или фильтр.' : 'Здесь появятся ответы компаний и сообщения о недоставленных письмах.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        ) : (
          <Card className="gap-0 divide-y py-0">
            {shown.map((m) => (
              <MessageRow key={m.uid} message={m} company={companyOf(m.contactId)} />
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function useMarkSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, seen }: { uid: string; seen: boolean }) => adminApi.markMailSeen(uid, seen),
    // Right away in the list; the mailbox itself follows.
    onMutate: ({ uid, seen }) =>
      queryClient.setQueryData<Mailbox>(['admin', 'mail'], (data) =>
        data && { ...data, messages: data.messages.map((m) => (m.uid === uid ? { ...m, seen } : m)) },
      ),
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'mail'] });
    },
  });
}

function MessageRow({ message, company, compact }: { message: MailMessage; company?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const markSeen = useMarkSeen();
  const kind = KIND[message.kind];
  const toggle = () => {
    if (!open && !message.seen) markSeen.mutate({ uid: message.uid, seen: true });
    setOpen(!open);
  };
  const reply = `mailto:${message.sender}?subject=${encodeURIComponent(
    /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
  )}`;

  return (
    <div className={cn(compact ? 'py-2.5' : 'px-4 py-3.5', !message.seen && !compact && 'bg-primary/[0.03]')}>
      <button type="button" className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 text-left" onClick={toggle} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {!message.seen && <span className="size-2 rounded-full bg-primary" aria-label="не прочитано" />}
            <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', kind.tone)}>{kind.label}</span>
            <span className={cn(message.seen ? 'font-medium' : 'font-semibold')}>{message.senderName || message.sender}</span>
            {company && !compact && <Badge variant="outline">{company}</Badge>}
          </span>
          <span className={cn('mt-1 block truncate text-sm', message.seen ? 'text-muted-foreground' : 'text-foreground')}>
            {message.kind === 'bounce' && message.about ? `Не дошло до ${message.about} · ` : ''}
            {message.subject || 'Без темы'}
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {message.receivedAt && <span title={fullDate(message.receivedAt)}>{timeAgo(message.receivedAt)}</span>}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <pre className="max-h-96 overflow-y-auto rounded-lg bg-muted/50 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {message.text || 'Письмо без текста.'}
          </pre>
          <div className="flex flex-wrap gap-1">
            {message.kind !== 'bounce' && (
              <Button asChild size="sm" variant="ghost">
                <a href={reply}>
                  <Reply /> Ответить
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => markSeen.mutate({ uid: message.uid, seen: false })}>
              <Mail /> Отметить непрочитанным
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the letters

type OutreachFilter = 'all' | OutcomeKey;
type OutreachOrder = 'new' | 'old' | 'name' | 'sent';

function OutreachView({
  query,
  messages,
}: {
  query: UseQueryResult<OutreachList>;
  messages: readonly MailMessage[];
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<OutreachFilter>('all');
  const [order, setOrder] = useState<OutreachOrder>('new');
  const [adding, setAdding] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const items = query.data?.items ?? [];
  const fresh = items.filter((c) => c.status === 'new');
  const rows = items.map((c) => {
    const own = messages.filter((m) => m.contactId === c.id);
    return { contact: c, own, outcome: outcome(c, own) };
  });
  const counts = rows.reduce<Partial<Record<OutcomeKey, number>>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
  const shown = rows
    .filter((r) => filter === 'all' || r.outcome === filter)
    .filter((r) => has(search, r.contact.company, r.contact.email, r.contact.city, r.contact.note, r.contact.ref))
    .sort((a, b) => {
      if (order === 'name') return a.contact.company.localeCompare(b.contact.company, 'ru');
      if (order === 'sent') return time(b.contact.sentAt) - time(a.contact.sentAt);
      const d = time(a.contact.createdAt) - time(b.contact.createdAt);
      return order === 'old' ? d : -d;
    });

  const sendAll = useMutation({
    mutationFn: adminApi.sendAllOutreach,
    onSuccess: ({ queued }) => {
      toast.success(`${plural(queued, ['письмо', 'письма', 'писем'])} в очереди: уходят по одному в минуту`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchBox value={search} onChange={setSearch} placeholder="Компания, email, город" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={filter} onValueChange={(v) => setFilter(v as OutreachFilter)}>
            <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Статус">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все компании · {items.length}</SelectItem>
              {(Object.keys(OUTCOME) as OutcomeKey[])
                .filter((k) => counts[k])
                .map((k) => (
                  <SelectItem key={k} value={k}>
                    {OUTCOME[k].label} · {counts[k]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={order} onValueChange={(v) => setOrder(v as OutreachOrder)}>
            <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Порядок">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Сначала новые</SelectItem>
              <SelectItem value="old">Сначала старые</SelectItem>
              <SelectItem value="sent">По дате отправки</SelectItem>
              <SelectItem value="name">По названию</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Компания
          </Button>
          <Button size="sm" disabled={!fresh.length || sendAll.isPending} onClick={() => setConfirmAll(true)}>
            {sendAll.isPending ? <Spinner /> : <Send />} Отправить новым{fresh.length ? ` (${fresh.length})` : ''}
          </Button>
        </div>
      </div>
      {query.data && (
        <p className="mt-3 text-sm text-muted-foreground">
          {query.data.sending
            ? `Письма уходят от ${query.data.sender}, по одному в минуту. У каждой компании своя ссылка — по ней видны переходы и регистрации.`
            : 'Почта не настроена (MAIL_BACKEND не smtp): письма пишутся только в лог API.'}
        </p>
      )}

      <div className="mt-3">
        {query.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">{errorMessage(query.error)}</p>
        ) : shown.length === 0 ? (
          <Card>
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 />
                </EmptyMedia>
                <EmptyTitle>{items.length ? 'Ничего не нашлось' : 'Компаний пока нет'}</EmptyTitle>
                <EmptyDescription>
                  {items.length ? 'Измените поиск или фильтр.' : 'Добавьте компанию — для неё появится письмо и своя ссылка.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        ) : (
          <Card className="gap-0 divide-y py-0">
            {shown.map((r) => (
              <ContactRow key={r.contact.id} contact={r.contact} own={r.own} outcome={r.outcome} />
            ))}
          </Card>
        )}
      </div>

      <AddContactDialog open={adding} onOpenChange={setAdding} />
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить {plural(fresh.length, ['письмо', 'письма', 'писем'])}?</AlertDialogTitle>
            <AlertDialogDescription>
              Каждой компании, которой ещё не писали, уйдёт её письмо — по одному в минуту, около{' '}
              {plural(fresh.length, ['минуты', 'минут', 'минут'])}. Отменить отправленное нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendAll.mutate()}>Отправить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ContactRow({ contact, own, outcome: key }: { contact: OutreachContact; own: readonly MailMessage[]; outcome: OutcomeKey }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const send = useMutation({
    mutationFn: () => adminApi.sendOutreach(contact.id),
    onSuccess: () => {
      toast.success(`Письмо для «${contact.company}» в очереди`);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteOutreach(contact.id),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const canSend = contact.status === 'new' || contact.status === 'failed';
  const status = OUTCOME[key];
  const unread = own.filter((m) => !m.seen).length;

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{contact.company}</span>
            {contact.city && <span className="text-sm text-muted-foreground">{contact.city}</span>}
            <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', status.tone)}>{status.label}</span>
            {own.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MailOpen className="size-3.5" /> {own.length}
                {unread > 0 && <span className="size-2 rounded-full bg-primary" aria-label="есть непрочитанные" />}
              </span>
            )}
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </span>
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{contact.email}</span>
            <span className="flex items-center gap-1.5">
              <Link2 className="size-3.5" /> {plural(contact.visits, ['переход', 'перехода', 'переходов'])}
            </span>
            {contact.sentAt && <span title={fullDate(contact.sentAt)}>отправлено {timeAgo(contact.sentAt)}</span>}
          </span>
        </button>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setPreview(true)}>
            <Eye /> Письмо
          </Button>
          {canSend && (
            <Button size="sm" variant="outline" disabled={send.isPending} onClick={() => setConfirmSend(true)}>
              {send.isPending ? <Spinner /> : <Send />} Отправить
            </Button>
          )}
          {contact.status === 'new' && (
            <Button size="icon-sm" variant="ghost" aria-label="Удалить" className="text-muted-foreground" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-l-2 border-muted pl-3 text-sm">
          {contact.note && <p className="text-muted-foreground">«…вы {contact.note}»</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Mail className="size-3.5" /> Написать
            </a>
            <span className="font-mono text-xs">{contact.link}</span>
            <span>добавлена {timeAgo(contact.createdAt)}</span>
          </p>
          {contact.signups.map((s) => (
            <p key={s.email} className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <UserCheck className="size-3.5" /> {s.email} · регистрация {timeAgo(s.createdAt)}
            </p>
          ))}
          {contact.error && <p className="text-destructive">{contact.error}</p>}
          {own.length > 0 ? (
            <div className="divide-y">
              {own.map((m) => (
                <MessageRow key={m.uid} message={m} compact />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Писем от компании пока нет.</p>
          )}
        </div>
      )}

      <LetterDialog contactId={contact.id} open={preview} onOpenChange={setPreview} />
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить письмо «{contact.company}»?</AlertDialogTitle>
            <AlertDialogDescription>На {contact.email}, в течение минуты. Отменить отправленное нельзя.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate()}>Отправить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LetterDialog({ contactId, open, onOpenChange }: { contactId: string; open: boolean; onOpenChange(open: boolean): void }) {
  const letter = useQuery({
    queryKey: ['admin', 'outreach', contactId, 'letter'],
    queryFn: () => adminApi.outreachLetter(contactId),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{letter.data?.subject ?? 'Письмо'}</DialogTitle>
          <DialogDescription>
            {letter.data ? `От ${letter.data.sender || '— (MAIL_FROM не задан)'} · кому ${letter.data.to}` : 'Загрузка…'}
          </DialogDescription>
        </DialogHeader>
        {letter.isError ? (
          <p className="text-sm text-destructive">{errorMessage(letter.error)}</p>
        ) : (
          <pre className="max-h-[60vh] overflow-y-auto rounded-lg bg-muted/50 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {letter.data?.text ?? ''}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddContactDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const queryClient = useQueryClient();
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: () => adminApi.addOutreach({ company, email, city: city || undefined, note: note || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
      setCompany('');
      setEmail('');
      setCity('');
      setNote('');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Компания для рассылки</DialogTitle>
            <DialogDescription>Письмо и своя ссылка появятся сразу, отправка — отдельной кнопкой.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-5">
            <Field>
              <FieldLabel htmlFor="outreach-company">Компания</FieldLabel>
              <Input id="outreach-company" required maxLength={200} value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="outreach-email">Email</FieldLabel>
              <Input id="outreach-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="outreach-city">Город</FieldLabel>
              <Input id="outreach-city" maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="outreach-note">Чем занимаются</FieldLabel>
              <Input
                id="outreach-note"
                maxLength={300}
                placeholder="возите продукты по Крыму своим автопарком"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <FieldDescription>Встанет в письмо после «Видели, что вы …». Можно оставить пустым.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Spinner />} Добавить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
