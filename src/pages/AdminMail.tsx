import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Eye, Inbox, Link2, Mail, Plus, RefreshCw, Send, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { MailKind, MailMessage, OutreachContact } from '@/api/types';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { fullDate, plural, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Admin «Почта»: letters to companies, each with its referral link (backend/app/outreach.py), and the mailbox
 * they are answered in (backend/app/inbox.py): replies, bounces and auto-replies, matched to the companies.
 */

const KIND: Record<MailKind, { label: string; tone: string }> = {
  reply: { label: 'Ответ', tone: 'bg-primary/10 text-primary' },
  bounce: { label: 'Не доставлено', tone: 'bg-destructive/10 text-destructive' },
  auto: { label: 'Автоответ', tone: 'bg-muted text-muted-foreground' },
  letter: { label: 'Письмо', tone: 'bg-muted text-muted-foreground' },
};

/** What came of a letter, the strongest first: a sign-up, a reply, a bounce, then the sending itself. */
function outcome(contact: OutreachContact, messages: readonly MailMessage[]): { label: string; tone: string } {
  const own = messages.filter((m) => m.contactId === contact.id);
  if (contact.signups.length) return { label: 'Зарегистрировались', tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' };
  if (own.some((m) => m.kind === 'reply' || m.kind === 'letter')) return { label: 'Ответили', tone: KIND.reply.tone };
  if (own.some((m) => m.kind === 'bounce')) return { label: 'Не доставлено', tone: KIND.bounce.tone };
  if (own.some((m) => m.kind === 'auto')) return { label: 'Автоответ', tone: KIND.auto.tone };
  switch (contact.status) {
    case 'queued':
      return { label: 'В очереди', tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-400' };
    case 'sent':
      return { label: 'Отправлено', tone: 'bg-muted text-foreground' };
    case 'failed':
      return { label: 'Ошибка отправки', tone: KIND.bounce.tone };
    default:
      return { label: 'Не отправлено', tone: 'bg-muted text-muted-foreground' };
  }
}

export function MailTab() {
  const queryClient = useQueryClient();
  const contacts = useQuery({
    queryKey: ['admin', 'outreach'],
    queryFn: ({ signal }) => adminApi.outreach(signal),
    // The job sends one letter a minute: show it leave.
    refetchInterval: (query) => (query.state.data?.items.some((c) => c.status === 'queued') ? 15_000 : false),
  });
  const mailbox = useQuery({ queryKey: ['admin', 'mail'], queryFn: ({ signal }) => adminApi.mailbox(signal) });
  const [adding, setAdding] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const fresh = contacts.data?.items.filter((c) => c.status === 'new') ?? [];
  const messages = mailbox.data?.messages ?? [];

  const sendAll = useMutation({
    mutationFn: adminApi.sendAllOutreach,
    onSuccess: ({ queued }) => {
      toast.success(`${plural(queued, ['письмо', 'письма', 'писем'])} в очереди: уходят по одному в минуту`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Рассылка</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {contacts.data
                ? contacts.data.sending
                  ? `Письма уходят от ${contacts.data.sender}, по одному в минуту. У каждой компании своя ссылка — по ней видны визиты и регистрации.`
                  : 'Почта не настроена (MAIL_BACKEND не smtp): письма пишутся только в лог API.'
                : 'Компании, которым пишем, и что из этого вышло.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Компания
            </Button>
            <Button size="sm" disabled={!fresh.length || sendAll.isPending} onClick={() => setConfirmAll(true)}>
              {sendAll.isPending ? <Spinner /> : <Send />} Отправить новым{fresh.length ? ` (${fresh.length})` : ''}
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {contacts.isPending ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : contacts.isError ? (
            <p className="text-sm text-destructive">{errorMessage(contacts.error)}</p>
          ) : contacts.data.items.length === 0 ? (
            <Card>
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Building2 />
                  </EmptyMedia>
                  <EmptyTitle>Компаний пока нет</EmptyTitle>
                  <EmptyDescription>Добавьте компанию — для неё появится письмо и своя ссылка.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Card>
          ) : (
            <Card className="gap-0 divide-y py-0">
              {contacts.data.items.map((c) => (
                <ContactRow key={c.id} contact={c} status={outcome(c, messages)} />
              ))}
            </Card>
          )}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Входящие</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ответы, отказы и автоответы из ящика рассылки — последние 60 писем.
            </p>
          </div>
          <Button variant="ghost" size="sm" disabled={mailbox.isFetching} onClick={() => void mailbox.refetch()}>
            {mailbox.isFetching ? <Spinner /> : <RefreshCw />} Обновить
          </Button>
        </div>
        <div className="mt-4">
          {mailbox.isPending ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : mailbox.isError ? (
            <p className="text-sm text-destructive">{errorMessage(mailbox.error)}</p>
          ) : mailbox.data.error ? (
            <p className="text-sm text-destructive">{mailbox.data.error}</p>
          ) : messages.length === 0 ? (
            <Card>
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox />
                  </EmptyMedia>
                  <EmptyTitle>Писем нет</EmptyTitle>
                  <EmptyDescription>Здесь появятся ответы компаний и сообщения о недоставленных письмах.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Card>
          ) : (
            <Card className="gap-0 divide-y py-0">
              {messages.map((m) => (
                <MessageRow key={m.uid} message={m} company={contacts.data?.items.find((c) => c.id === m.contactId)?.company} />
              ))}
            </Card>
          )}
        </div>
      </section>

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
    </div>
  );
}

function ContactRow({ contact, status }: { contact: OutreachContact; status: { label: string; tone: string } }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
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

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{contact.company}</span>
          {contact.city && <span className="text-sm text-muted-foreground">{contact.city}</span>}
          <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', status.tone)}>{status.label}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
            <Mail className="size-3.5" /> {contact.email}
          </a>
          <span className="flex items-center gap-1.5" title={contact.link}>
            <Link2 className="size-3.5" /> /r/{contact.ref} · {plural(contact.visits, ['визит', 'визита', 'визитов'])}
          </span>
          {contact.sentAt && <span title={fullDate(contact.sentAt)}>отправлено {timeAgo(contact.sentAt)}</span>}
        </div>
        {contact.note && <p className="mt-1 text-sm text-muted-foreground">«…вы {contact.note}»</p>}
        {contact.signups.map((s) => (
          <p key={s.email} className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <UserCheck className="size-3.5" /> {s.email} · {timeAgo(s.createdAt)}
          </p>
        ))}
        {contact.error && <p className="mt-1 text-sm text-destructive">{contact.error}</p>}
      </div>
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
      <LetterDialog contactId={contact.id} open={preview} onOpenChange={setPreview} />
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить письмо «{contact.company}»?</AlertDialogTitle>
            <AlertDialogDescription>
              На {contact.email}, в течение минуты. Отменить отправленное нельзя.
            </AlertDialogDescription>
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

function MessageRow({ message, company }: { message: MailMessage; company?: string }) {
  const [open, setOpen] = useState(false);
  const kind = KIND[message.kind];
  return (
    <div className="px-4 py-3.5">
      <button type="button" className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', kind.tone)}>{kind.label}</span>
            <span className="font-medium">{message.senderName || message.sender}</span>
            {company && <Badge variant="outline">{company}</Badge>}
          </span>
          <span className="mt-1 block truncate text-sm text-muted-foreground">
            {message.kind === 'bounce' && message.about ? `Не дошло до ${message.about} · ` : ''}
            {message.subject || 'Без темы'}
          </span>
        </span>
        {message.receivedAt && (
          <span className="text-xs text-muted-foreground" title={fullDate(message.receivedAt)}>
            {timeAgo(message.receivedAt)}
          </span>
        )}
      </button>
      {open && (
        <pre className="mt-3 max-h-96 overflow-y-auto rounded-lg bg-muted/50 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
          {message.text || 'Письмо без текста.'}
        </pre>
      )}
    </div>
  );
}
