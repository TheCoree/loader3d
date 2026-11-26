import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { AdminMessage, AdminMessageInput, MessageKind } from '@/api/types';
import { MESSAGE_ICONS, MessageWindow } from '@/components/MessageDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { fullDate, plural, timeAgo } from '@/lib/format';
import { TIERS_ENABLED } from '@/lib/tiers';
import { cn } from '@/lib/utils';

/**
 * Messages of the team to one user (backend/app/messages.py): written from a preset, previewed as the user will
 * see it (components/MessageDialog.tsx), and followed — seen, the button pressed or closed, the reply.
 */

type Draft = Required<AdminMessageInput>;

interface Preset {
  kind: MessageKind;
  label: string;
  draft: Omit<Draft, 'kind'>;
  /** Only with tiers on. */
  tiers?: boolean;
}

export const MESSAGE_PRESETS: Preset[] = [
  {
    kind: 'welcome',
    label: 'Приветствие',
    draft: {
      title: 'Добро пожаловать в Loader3D!',
      body:
        'Рады, что вы с нами. Первая схема собирается за пару минут: выберите машину, добавьте грузы — списком или из Excel — и нажмите «Автозагрузка», программа сама разложит груз.\n\nХотите посмотреть, как это выглядит? Откройте пример — он сохранится у вас в «Схемах».',
      button: 'Открыть пример',
      giftDays: null,
      askReply: false,
      action: 'example',
    },
  },
  {
    kind: 'gift',
    label: 'Подарок',
    tiers: true,
    draft: {
      title: 'Подарок от команды Loader3D',
      body: 'Спасибо, что выбрали Loader3D! Дарим вам месяц Pro: все машины, автозагрузка и пошаговый PDF для водителя.',
      button: 'Забрать подарок',
      giftDays: 30,
      askReply: false,
      action: null,
    },
  },
  {
    kind: 'feedback',
    label: 'Как вам?',
    draft: {
      title: 'Как вам Loader3D?',
      body:
        'Мы делаем Loader3D для тех, кто каждый день грузит машины, и хотим, чтобы им было удобно. Напишите пару слов: что получилось, чего не хватает, что мешает. Читаем каждый ответ.',
      button: 'Отправить',
      giftDays: null,
      askReply: true,
      action: null,
    },
  },
  {
    kind: 'help',
    label: 'Соберём схему',
    draft: {
      title: 'Соберём первую схему за вас',
      body:
        'Если не хочется разбираться самому — напишите сюда список грузов (размеры, вес, количество) и какая машина. Мы соберём схему, и она появится у вас в «Схемах».',
      button: 'Отправить',
      giftDays: null,
      askReply: true,
      action: null,
    },
  },
  {
    kind: 'custom',
    label: 'Своё',
    draft: { title: '', body: '', button: 'Понятно', giftDays: null, askReply: false, action: null },
  },
];

const GIFT_DAYS = [7, 14, 30, 60, 90];

/** What became of a message, for the admin. */
export function messageStatus(m: AdminMessage): { label: string; tone: string } {
  if (m.outcome === 'accepted') {
    return { label: `Нажата «${m.button}»`, tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' };
  }
  if (m.outcome === 'dismissed') return { label: 'Закрыто', tone: 'bg-muted text-muted-foreground' };
  if (m.shownAt) return { label: 'Открыто сейчас', tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-400' };
  return { label: 'Ждёт показа', tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-400' };
}

export function MessageStatus({ message }: { message: AdminMessage }) {
  const status = messageStatus(message);
  return <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', status.tone)}>{status.label}</span>;
}

export interface MessageTarget {
  id: string;
  email: string;
  displayName: string;
  /** A gift can be added (tiers on, not «Индивидуальный» or unlimited). */
  canGift: boolean;
}

export function MessageComposer({
  user,
  open,
  onOpenChange,
}: {
  user: MessageTarget;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const queryClient = useQueryClient();
  const presets = MESSAGE_PRESETS.filter((p) => !p.tiers || (TIERS_ENABLED && user.canGift));
  const [kind, setKind] = useState<MessageKind>('welcome');
  const [draft, setDraft] = useState<Draft>({ kind: 'welcome', ...MESSAGE_PRESETS[0].draft });
  useEffect(() => {
    if (open) {
      setKind('welcome');
      setDraft({ kind: 'welcome', ...MESSAGE_PRESETS[0].draft });
    }
  }, [open]);
  const choose = (preset: Preset) => {
    setKind(preset.kind);
    setDraft({ kind: preset.kind, ...preset.draft });
  };
  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  // «Предпросмотр»: the user's very window over this one; its buttons do nothing, the cross closes it.
  const [previewing, setPreviewing] = useState(false);
  const [previewReply, setPreviewReply] = useState('');

  const history = useQuery({
    queryKey: ['admin', 'messages', user.id],
    queryFn: ({ signal }) => adminApi.userMessages(user.id, signal),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const send = useMutation({
    mutationFn: () => adminApi.sendMessage(user.id, draft),
    onSuccess: () => {
      toast.success(`Сообщение для ${user.displayName} отправлено — появится, как только пользователь будет на сайте`);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => adminApi.withdrawMessage(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const ready = draft.title.trim() && draft.body.trim() && draft.button.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Сообщение для {user.displayName}</DialogTitle>
          <DialogDescription>
            {user.email} · появится окном, как только пользователь будет на сайте (если уже на сайте — через несколько секунд).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Шаблон">
          {presets.map((p) => {
            const Icon = MESSAGE_ICONS[p.kind];
            return (
              <Button key={p.kind} size="sm" variant={kind === p.kind ? 'secondary' : 'ghost'} aria-pressed={kind === p.kind} onClick={() => choose(p)}>
                <Icon /> {p.label}
              </Button>
            );
          })}
        </div>

        <div className="grid gap-4">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="message-title">Заголовок</FieldLabel>
              <Input id="message-title" maxLength={120} value={draft.title} onChange={(e) => change({ title: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="message-body">Текст</FieldLabel>
              <Textarea id="message-body" rows={6} maxLength={2000} value={draft.body} onChange={(e) => change({ body: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="message-button">Кнопка</FieldLabel>
                <Input id="message-button" maxLength={40} value={draft.button} onChange={(e) => change({ button: e.target.value })} />
              </Field>
              {TIERS_ENABLED && user.canGift && (
                <Field>
                  <FieldLabel htmlFor="message-gift">Подарок по кнопке</FieldLabel>
                  <Select
                    value={draft.giftDays ? String(draft.giftDays) : 'none'}
                    onValueChange={(v) => change({ giftDays: v === 'none' ? null : Number(v) })}
                  >
                    <SelectTrigger id="message-gift" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без подарка</SelectItem>
                      {GIFT_DAYS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {plural(d, ['день', 'дня', 'дней'])} Pro
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
            <Field orientation="horizontal">
              <Switch id="message-reply" checked={draft.askReply} onCheckedChange={(askReply) => change({ askReply })} />
              <FieldLabel htmlFor="message-reply" className="font-normal">
                Поле для ответа
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="message-example"
                checked={draft.action === 'example'}
                onCheckedChange={(on) => change({ action: on ? 'example' : null })}
              />
              <FieldLabel htmlFor="message-example" className="font-normal">
                После кнопки — открыть пример схемы
              </FieldLabel>
            </Field>
            {draft.giftDays && (
              <FieldDescription>
                Дни добавятся к текущему сроку Pro (и к пробному), когда пользователь нажмёт кнопку. Закрыть окно с подарком
                нельзя — только забрать.
              </FieldDescription>
            )}
          </FieldGroup>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPreviewing(true)}>
              <Eye /> Предпросмотр
            </Button>
            <Button disabled={!ready || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Spinner /> : <Send />} Отправить
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-sm font-medium">Сообщения этому пользователю</div>
          {history.isPending ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : !history.data?.length ? (
            <p className="text-sm text-muted-foreground">Пока ни одного.</p>
          ) : (
            <ul className="divide-y rounded-lg bg-muted/30">
              {history.data.map((m) => (
                <MessageRow key={m.id} message={m} onWithdraw={m.outcome ? undefined : () => withdraw.mutate(m.id)} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
      {previewing && (
        <MessageWindow
          preview
          message={draft}
          reply={previewReply}
          onReply={setPreviewReply}
          onAccept={() => {}}
          onDismiss={() => {
            setPreviewing(false);
            setPreviewReply('');
          }}
        />
      )}
    </Dialog>
  );
}

/** One message in a list: what, when, what became of it, the reply. */
export function MessageRow({ message: m, showUser, onWithdraw }: { message: AdminMessage; showUser?: boolean; onWithdraw?: () => void }) {
  const Icon = MESSAGE_ICONS[m.kind];
  return (
    <li className="grid gap-1 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {showUser && <span className="font-medium">{m.userName}</span>}
        <span className={cn(showUser ? 'text-muted-foreground' : 'font-medium')}>{m.title}</span>
        {m.giftDays && <span className="text-xs text-amber-700 dark:text-amber-400">+{plural(m.giftDays, ['день', 'дня', 'дней'])} Pro</span>}
        <MessageStatus message={m} />
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" title={fullDate(m.createdAt)}>
          {timeAgo(m.createdAt)}
          {onWithdraw && (
            <Button size="icon-xs" variant="ghost" aria-label="Отозвать сообщение" title="Отозвать" onClick={onWithdraw}>
              <Trash2 />
            </Button>
          )}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {m.shownAt && <span title={fullDate(m.shownAt)}>показано {timeAgo(m.shownAt)}</span>}
        {m.answeredAt && <span title={fullDate(m.answeredAt)}> · ответ {timeAgo(m.answeredAt)}</span>}
        {m.giftUntil && <span> · Pro до {new Date(m.giftUntil).toLocaleDateString('ru-RU')}</span>}
      </div>
      {m.reply && <p className="rounded-md bg-background px-3 py-2 whitespace-pre-line">{m.reply}</p>}
    </li>
  );
}
