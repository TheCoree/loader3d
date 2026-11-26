import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Gift, LifeBuoy, Mail, MessageCircleHeart, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { messageApi } from '@/api/endpoints';
import type { MessageKind, MessageOutcome, UserMessage } from '@/api/types';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { plural } from '@/lib/format';
import { dropMessage, usePresence } from '@/lib/presence';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

/**
 * Messages of the team (backend/app/messages.py), one at a time, as they arrive with the presence reports
 * (lib/presence.ts). Showing one is reported; the button (with the reply, if asked) or closing it is the
 * answer the admin sees. A gift has only its button: closing would lose it.
 */

export const MESSAGE_ICONS: Record<MessageKind, typeof Gift> = {
  welcome: PartyPopper,
  gift: Gift,
  feedback: MessageCircleHeart,
  help: LifeBuoy,
  custom: Mail,
};

type Shown = Pick<UserMessage, 'kind' | 'title' | 'body' | 'giftDays'>;

/** The message itself: the same in the dialog and in the admin panel's preview. */
export function MessageView({ message, children }: { message: Shown; children?: ReactNode }) {
  const Icon = MESSAGE_ICONS[message.kind];
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full',
            message.giftDays ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LogoMark className="size-3.5" /> Сообщение от команды Loader3D
          </div>
          <div className="text-base leading-snug font-semibold text-balance">{message.title || 'Заголовок'}</div>
        </div>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{message.body || 'Текст сообщения'}</p>
      {!!message.giftDays && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 px-4 py-3">
          <Gift className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div>
            <div className="font-semibold">+{plural(message.giftDays, ['день', 'дня', 'дней'])} Pro</div>
            <div className="text-xs text-muted-foreground">Добавятся к вашему текущему сроку</div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

async function openExample(navigate: ReturnType<typeof useNavigate>): Promise<void> {
  const [{ createLandingDemoPlan }, { encodePlanParam }] = await Promise.all([
    import('@/editor/demo'),
    import('@/lib/demoPlan'),
  ]);
  navigate(`/start?plan=${await encodePlanParam(createLandingDemoPlan())}&example=1`);
}

export function MessageDialog() {
  const signedIn = useAuth((s) => s.status === 'authenticated');
  const message = usePresence((s) => s.messages[0]);
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const [reply, setReply] = useState('');

  const id = message?.id;
  useEffect(() => {
    setReply('');
    if (id) void messageApi.shown(id).catch(() => {});
  }, [id]);

  const answer = useMutation({
    mutationFn: ({ outcome }: { outcome: MessageOutcome }) => messageApi.answer(message!.id, outcome, reply.trim()),
    onSuccess: (result, { outcome }) => {
      const answered = message!;
      dropMessage(answered.id);
      setUser(result.user);
      if (outcome !== 'accepted') return;
      if (result.giftUntil) {
        const until = new Date(result.giftUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        toast.success(`Готово! Pro действует до ${until}`);
      } else if (answered.askReply && reply.trim()) {
        toast.success('Спасибо! Мы прочитаем и ответим');
      }
      if (answered.action === 'example') {
        void openExample(navigate).catch(() => toast.error('Не удалось открыть пример — попробуйте ещё раз'));
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      if (message) dropMessage(message.id);
    },
  });

  if (!signedIn || !message) return null;
  return (
    <MessageWindow
      message={message}
      reply={reply}
      onReply={setReply}
      pending={answer.isPending}
      onAccept={() => answer.mutate({ outcome: 'accepted' })}
      onDismiss={() => !answer.isPending && answer.mutate({ outcome: 'dismissed' })}
    />
  );
}

type WindowMessage = Pick<UserMessage, 'kind' | 'title' | 'body' | 'button' | 'giftDays' | 'askReply'>;

/**
 * The window of a message, as the user gets it. `preview` (the admin panel's «Предпросмотр»): exactly the same,
 * but its buttons do nothing and the cross always closes it — a gift included.
 */
export function MessageWindow({
  message,
  reply,
  onReply,
  pending = false,
  onAccept,
  onDismiss,
  preview = false,
}: {
  message: WindowMessage;
  reply: string;
  onReply(reply: string): void;
  pending?: boolean;
  onAccept(): void;
  /** Closed: the «Закрыть» button, the cross or Esc (a gift cannot be closed, except in a preview). */
  onDismiss(): void;
  preview?: boolean;
}) {
  const gift = !!message.giftDays;
  const closable = preview || !gift;
  const inert = () => {};
  return (
    <Dialog open onOpenChange={(open) => !open && closable && onDismiss()}>
      <DialogContent
        className="gap-5 p-6 sm:max-w-md"
        showCloseButton={closable}
        onEscapeKeyDown={(e) => !closable && e.preventDefault()}
        onPointerDownOutside={(e) => !preview && e.preventDefault()}
      >
        <DialogTitle className="sr-only">{message.title || 'Сообщение'}</DialogTitle>
        <DialogDescription className="sr-only">Сообщение от команды Loader3D</DialogDescription>
        <MessageView message={message}>
          {message.askReply && (
            <Textarea
              autoFocus
              rows={4}
              maxLength={2000}
              placeholder="Ваш ответ…"
              value={reply}
              onChange={(e) => onReply(e.target.value)}
              className="resize-none"
            />
          )}
        </MessageView>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!gift && (
            <Button variant="ghost" disabled={pending} onClick={preview ? inert : onDismiss}>
              Закрыть
            </Button>
          )}
          <Button
            disabled={pending || (message.askReply && !reply.trim())}
            onClick={preview ? inert : onAccept}
            className={cn(gift && 'w-full')}
          >
            {pending && <Spinner />}
            {message.button || 'Кнопка'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
