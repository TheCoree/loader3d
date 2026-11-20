import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, KeyRound, LogOut, Monitor, ShieldAlert, Smartphone, Sparkles, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/api/client';
import { authApi, userApi } from '@/api/endpoints';
import type { SessionInfo } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { SubscriptionStateBadge } from '@/components/TierBadge';
import { UpgradeDialog, useUpgradeAction } from '@/components/UpgradeDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { describeUserAgent, fullDate, timeAgo } from '@/lib/format';
import { TIERS_ENABLED, limitSummary, subscriptionState, subscriptionSummary } from '@/lib/tiers';
import { useAuth } from '@/store/useAuth';

export function AccountPage() {
  const { search } = useLocation();
  // The payment page of the provider used to return here: «Тариф и оплата» checks the payment now.
  if (TIERS_ENABLED && new URLSearchParams(search).has('payment')) return <Navigate to={`/billing${search}`} replace />;
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
        <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">Аккаунт</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">Профиль, пароль и устройства, на которых выполнен вход.</p>
        <div className="mt-8 flex flex-col gap-5">
          <ProfileCard />
          {TIERS_ENABLED && <SubscriptionCard />}
          <PasswordCard />
          <SessionsCard />
          <DangerCard />
        </div>
      </main>
      {TIERS_ENABLED && <UpgradeDialog />}
    </div>
  );
}

function SectionIcon({ icon: Icon, tone = 'default' }: { icon: typeof UserRound; tone?: 'default' | 'danger' }) {
  return (
    <span
      className={
        tone === 'danger'
          ? 'grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive'
          : 'grid size-9 place-items-center rounded-xl bg-muted text-foreground'
      }
    >
      <Icon className="size-4" />
    </span>
  );
}

function ProfileCard() {
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user.displayName);
  const save = useMutation({
    mutationFn: () => userApi.update(name.trim()),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Профиль сохранён');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Card>
      <form onSubmit={submit} className="contents">
        <CardHeader className="flex items-center gap-3">
          <SectionIcon icon={UserRound} />
          <div>
            <CardTitle>Профиль</CardTitle>
            <CardDescription>Аккаунт создан {fullDate(user.createdAt)}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
            <Field data-invalid={save.isError}>
              <FieldLabel htmlFor="profile-name">Имя</FieldLabel>
              <Input id="profile-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              {save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input id="profile-email" value={user.email} readOnly disabled />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4 pb-4">
          <Button type="submit" disabled={!name.trim() || name.trim() === user.displayName || save.isPending}>
            {save.isPending && <Spinner />}
            Сохранить
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/** The tier in short; everything about it is on «Тариф и оплата» (/billing). */
function SubscriptionCard() {
  const sub = useAuth((s) => s.user?.subscription);
  const action = useUpgradeAction();
  if (!sub) return null;
  const state = subscriptionState(sub);

  return (
    <Card id="subscription" className="scroll-mt-16">
      <CardHeader className="flex items-center gap-3">
        <SectionIcon icon={Sparkles} />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            Тариф «{sub.name}»
            <SubscriptionStateBadge sub={sub} />
          </CardTitle>
          <CardDescription className={state === 'expired' || state === 'ending' ? 'text-warning' : undefined}>
            {subscriptionSummary(sub)}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{limitSummary(sub)}.</p>
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2 border-t pt-4 pb-4">
        <Button variant="ghost" asChild>
          <Link to="/billing">
            <CreditCard /> Тариф и оплата
          </Link>
        </Button>
        {action && state !== 'custom' && (
          <Button onClick={action.run} disabled={action.pending}>
            {action.pending && <Spinner />}
            {action.label}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function PasswordCard() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => userApi.changePassword(current, next),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Пароль изменён. На остальных устройствах выполнен выход.');
    },
  });
  const fieldErrors = change.error instanceof ApiError ? change.error.fieldErrors : {};
  const wrongPassword = change.error instanceof ApiError && change.error.code === 'wrong_password';

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
        className="contents"
      >
        <CardHeader className="flex items-center gap-3">
          <SectionIcon icon={KeyRound} />
          <div>
            <CardTitle>Пароль</CardTitle>
            <CardDescription>После смены на других устройствах нужно будет войти заново</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
            <Field data-invalid={wrongPassword}>
              <FieldLabel htmlFor="current-password">Текущий пароль</FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              {wrongPassword && <FieldError>Неверный пароль</FieldError>}
            </Field>
            <Field data-invalid={!!fieldErrors.newPassword}>
              <FieldLabel htmlFor="new-password">Новый пароль</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              {fieldErrors.newPassword ? (
                <FieldError>{fieldErrors.newPassword}</FieldError>
              ) : (
                <FieldDescription>Не короче 8 символов</FieldDescription>
              )}
            </Field>
          </FieldGroup>
          {change.isError && !wrongPassword && !fieldErrors.newPassword && (
            <p className="mt-3 text-sm text-destructive">{errorMessage(change.error)}</p>
          )}
        </CardContent>
        <CardFooter className="justify-end border-t pt-4 pb-4">
          <Button type="submit" disabled={!current || !next || change.isPending}>
            {change.isPending && <Spinner />}
            Сменить пароль
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const revoke = useMutation({ mutationFn: authApi.revokeSession, onSuccess: refresh });
  const revokeOthers = useMutation({
    mutationFn: authApi.revokeOtherSessions,
    onSuccess: () => {
      refresh();
      toast.success('Выполнен выход на всех остальных устройствах');
    },
  });
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <SectionIcon icon={Monitor} />
        <div className="flex-1">
          <CardTitle>Устройства</CardTitle>
          <CardDescription>Где сейчас выполнен вход в аккаунт</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {sessions.isPending ? (
          <div className="space-y-3 px-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sessions.isError ? (
          <p className="px-4 text-sm text-destructive">{errorMessage(sessions.error)}</p>
        ) : (
          <ul className="divide-y">
            {sessions.data.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                pending={revoke.isPending && revoke.variables === s.id}
                onRevoke={() => revoke.mutate(s.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {others > 0 && (
        <CardFooter className="justify-end border-t pt-4 pb-4">
          <Button variant="outline" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
            {revokeOthers.isPending ? <Spinner /> : <LogOut />}
            Выйти на остальных устройствах
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function SessionRow({ session, pending, onRevoke }: { session: SessionInfo; pending: boolean; onRevoke(): void }) {
  const { label, mobile } = describeUserAgent(session.userAgent);
  const Icon = mobile ? Smartphone : Monitor;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {session.current && <Badge variant="secondary">Это устройство</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={`Вход ${fullDate(session.createdAt)}`}>
          {session.ipAddress ?? 'IP неизвестен'} · {session.current ? 'активно сейчас' : `активность ${timeAgo(session.lastUsedAt)}`}
        </div>
      </div>
      {!session.current && (
        <Button variant="ghost" size="sm" onClick={onRevoke} disabled={pending}>
          {pending && <Spinner />}
          Завершить
        </Button>
      )}
    </li>
  );
}

function DangerCard() {
  const navigate = useNavigate();
  const sessionEnded = useAuth((s) => s.sessionEnded);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: () => userApi.deleteAccount(password),
    onSuccess: () => {
      sessionEnded();
      navigate('/login', { replace: true });
      toast.success('Аккаунт удалён');
    },
  });

  return (
    <Card className="ring-destructive/25">
      <CardHeader className="flex items-center gap-3">
        <SectionIcon icon={ShieldAlert} tone="danger" />
        <div className="flex-1">
          <CardTitle>Удаление аккаунта</CardTitle>
          <CardDescription>Аккаунт и все схемы будут удалены без возможности восстановления</CardDescription>
        </div>
        <AlertDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setPassword('');
              remove.reset();
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Удалить аккаунт</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить аккаунт навсегда?</AlertDialogTitle>
              <AlertDialogDescription>
                Все схемы удалятся вместе с аккаунтом. Чтобы подтвердить, введите пароль.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field data-invalid={remove.isError}>
              <FieldLabel htmlFor="delete-password">Пароль</FieldLabel>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {remove.isError && <FieldError>{errorMessage(remove.error)}</FieldError>}
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={!password || remove.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  remove.mutate();
                }}
              >
                {remove.isPending && <Spinner />}
                Удалить навсегда
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
    </Card>
  );
}
