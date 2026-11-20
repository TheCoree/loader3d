import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { KeyRound, LogOut, MailCheck, Monitor, MonitorSmartphone, Moon, Smartphone, Sun, SunMoon, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/api/client';
import { authApi, userApi } from '@/api/endpoints';
import type { SessionInfo } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { LogoMark } from '@/components/Logo';
import { SettingsGroup, SettingsPanel, SettingsRow, SubPageHeader, UserAvatar } from '@/components/settings';
import { TierBadge } from '@/components/TierBadge';
import { SignOutDialog } from '@/components/UserMenu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { describeUserAgent, fullDate, plural, timeAgo } from '@/lib/format';
import { TIERS_ENABLED, subscriptionSummary } from '@/lib/tiers';
import { useAuth } from '@/store/useAuth';
import { useStore, type Theme } from '@/store/useStore';

/** /account/<section>: the pages the rows of the overview open. */
const SECTIONS = ['profile', 'password', 'devices'] as const;
type Section = (typeof SECTIONS)[number];

const BACK = { back: '/account', backLabel: 'Аккаунт' };

/**
 * /account — the account as a list of settings (profile, password, devices, tariff, theme, sign-out);
 * each row opens its own page /account/<section> with the way back. Changing the password and deleting
 * the account (the danger zone of the profile) are confirmed only with a code from email: a password
 * that leaked must not be enough.
 */
export function AccountPage() {
  const { search } = useLocation();
  const { section } = useParams();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);
  // The payment page of the provider used to return here: «Тариф и оплата» checks the payment now.
  if (TIERS_ENABLED && new URLSearchParams(search).has('payment')) return <Navigate to={`/billing${search}`} replace />;
  if (section !== undefined && !SECTIONS.includes(section as Section)) return <Navigate to="/account" replace />;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 pt-12 pb-20 sm:px-6">
        {section === 'profile' ? (
          <ProfileSection />
        ) : section === 'password' ? (
          <PasswordSection />
        ) : section === 'devices' ? (
          <DevicesSection />
        ) : (
          <Overview />
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ the overview

function Overview() {
  const user = useAuth((s) => s.user)!;
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions });
  const [confirmOut, setConfirmOut] = useState(false);
  const sub = user.subscription;
  const devices = sessions.data?.length;

  return (
    <>
      <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">Аккаунт</h1>
      <div className="mt-8 flex items-center gap-4">
        <UserAvatar user={user} className="size-16 [&_[data-slot=avatar-fallback]]:text-xl" />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xl leading-tight font-medium">{user.displayName}</span>
            {sub && sub.tier !== 'free' && <TierBadge tier={sub.tier} />}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-5">
        <SettingsGroup>
          <SettingsRow icon={UserRound} title="Профиль" description="Имя, email и удаление аккаунта" to="/account/profile" />
          <SettingsRow icon={KeyRound} title="Пароль" description="Сменить по коду из письма" to="/account/password" />
          <SettingsRow
            icon={MonitorSmartphone}
            title="Устройства"
            description={
              devices === undefined ? 'Где выполнен вход в аккаунт' : `Вход выполнен на ${plural(devices, ['устройстве', 'устройствах', 'устройствах'])}`
            }
            to="/account/devices"
          />
        </SettingsGroup>

        {sub && (
          <SettingsGroup>
            <SettingsRow icon={BoxMark} title="Тариф и оплата" description={subscriptionSummary(sub)} trailing={<TierBadge tier={sub.tier} />} to="/billing" />
          </SettingsGroup>
        )}

        <SettingsGroup>
          <SettingsRow icon={SunMoon} title="Тема" description="Для всех ваших устройств" trailing={<ThemeSwitch />} />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow icon={LogOut} title="Выйти" tone="destructive" onClick={() => setConfirmOut(true)} />
        </SettingsGroup>

        <p className="px-1 text-[13px] text-muted-foreground">Аккаунт создан {fullDate(user.createdAt)}</p>
      </div>
      <SignOutDialog open={confirmOut} onOpenChange={setConfirmOut} />
    </>
  );
}

/** The tariff row's icon: our box in one colour, like the rest of the row icons. */
function BoxMark({ className }: { className?: string }) {
  return <LogoMark tone="mono" className={className} />;
}

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Как в системе', icon: Monitor },
];

/** Light / dark / system as one segmented control; saved in the account like the other display settings. */
function ThemeSwitch() {
  const theme = useStore((s) => s.settings.theme);
  const setSetting = useStore((s) => s.setSetting);
  return (
    <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setSetting('theme', v as Theme)} className="rounded-full bg-muted p-0.5" aria-label="Тема">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="size-8 rounded-full text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground"
        >
          <Icon className="size-4" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// ------------------------------------------------------------------ the emailed code

/** Seconds counting down to 0, once a second. */
function useCountdown(): [number, (seconds: number) => void] {
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);
  return [wait, setWait];
}

/** Sending a code to the account's email, with the cooldown the server tells. */
function useSendCode(send: () => Promise<{ retryAfter: number }>, onSent?: () => void) {
  const [wait, setWait] = useCountdown();
  const mutation = useMutation({
    mutationFn: send,
    onSuccess: ({ retryAfter }) => {
      setWait(retryAfter);
      onSent?.();
    },
    onError: (error) => {
      const retry = error instanceof ApiError ? Number(error.detail.retryAfter) : NaN;
      if (Number.isFinite(retry) && retry > 0) setWait(retry);
      toast.error(errorMessage(error));
    },
  });
  return { send: () => mutation.mutate(), sending: mutation.isPending, wait };
}

function CodeInput({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled?: boolean }) {
  return (
    <InputOTP
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      autoFocus
      autoComplete="one-time-code"
      inputMode="numeric"
      aria-label="Код из письма"
    >
      <InputOTPGroup className="gap-2 *:data-[slot=input-otp-slot]:rounded-xl *:data-[slot=input-otp-slot]:border-l">
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-12 text-xl font-medium tabular-nums" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

const isCodeError = (error: unknown) => error instanceof ApiError && error.code.startsWith('code_');

// ------------------------------------------------------------------ profile and the danger zone

function ProfileSection() {
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user.displayName);
  const save = useMutation({
    mutationFn: () => userApi.update(name.trim()),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Имя сохранено');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <>
      <SubPageHeader {...BACK} title="Профиль" description="Имя показывается в меню аккаунта." />
      <form onSubmit={submit} className="mt-8">
        <SettingsPanel>
          <FieldGroup className="gap-5">
            <Field data-invalid={save.isError}>
              <FieldLabel htmlFor="profile-name">Имя</FieldLabel>
              <Input id="profile-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              {save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input id="profile-email" value={user.email} readOnly disabled />
              <FieldDescription>Для входа и писем с кодами.</FieldDescription>
            </Field>
          </FieldGroup>
        </SettingsPanel>
        <div className="mt-4 flex justify-end">
          <Button type="submit" className="h-10 rounded-full px-5" disabled={!name.trim() || name.trim() === user.displayName || save.isPending}>
            {save.isPending && <Spinner />}
            Сохранить
          </Button>
        </div>
      </form>
      <DangerZone />
    </>
  );
}

/** Deleting the account: a code goes to the email, the dialog asks for it. */
function DangerZone() {
  const email = useAuth((s) => s.user!.email);
  const sessionEnded = useAuth((s) => s.sessionEnded);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const sender = useSendCode(userApi.sendDeleteCode, () => {
    setCode('');
    setOpen(true);
  });
  const remove = useMutation({
    mutationFn: () => userApi.deleteAccount(code),
    onSuccess: () => {
      sessionEnded();
      navigate('/login', { replace: true });
      toast.success('Аккаунт удалён');
    },
    onError: (error) => isCodeError(error) && setCode(''),
  });

  return (
    <section className="mt-14" aria-labelledby="danger-title">
      <h2 id="danger-title" className="mb-2 px-1 text-[13px] font-medium text-destructive">
        Опасная зона
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl bg-destructive/[0.04] p-5 ring-1 ring-destructive/25 sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Удалить аккаунт</p>
          <p className="mt-0.5 text-[13px] text-pretty text-muted-foreground">
            Аккаунт и все схемы удалятся без возможности восстановления. Подтверждение — кодом из письма.
          </p>
        </div>
        <Button variant="destructive" className="h-10 rounded-full px-5" onClick={sender.send} disabled={sender.sending}>
          {sender.sending ? <Spinner /> : <Trash2 />}
          Удалить аккаунт
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) remove.reset();
        }}
      >
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) remove.mutate();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить аккаунт навсегда?</AlertDialogTitle>
              <AlertDialogDescription>
                Все схемы удалятся вместе с аккаунтом. Чтобы подтвердить, введите код из письма — отправили на{' '}
                <span className="font-medium text-foreground">{email}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field data-invalid={remove.isError}>
              <CodeInput value={code} onChange={setCode} disabled={remove.isPending} />
              {remove.isError && <FieldError>{errorMessage(remove.error)}</FieldError>}
              <button
                type="button"
                onClick={sender.send}
                disabled={sender.sending || sender.wait > 0}
                className="w-fit text-[13px] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline disabled:pointer-events-none disabled:no-underline"
              >
                {sender.wait > 0 ? `Новый код — через ${sender.wait} с` : 'Отправить код ещё раз'}
              </button>
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={code.length !== 6 || remove.isPending}>
                {remove.isPending && <Spinner />}
                Удалить навсегда
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ------------------------------------------------------------------ password

function PasswordSection() {
  const email = useAuth((s) => s.user!.email);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const sender = useSendCode(userApi.sendPasswordCode, () => {
    setSent(true);
    setCode('');
  });
  const change = useMutation({
    mutationFn: () => userApi.changePassword(code, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Пароль изменён', { description: 'На остальных устройствах выполнен выход.' });
      navigate('/account');
    },
    onError: (error) => isCodeError(error) && setCode(''),
  });
  const fieldErrors = change.error instanceof ApiError ? change.error.fieldErrors : {};
  const codeError = isCodeError(change.error);

  return (
    <>
      <SubPageHeader
        {...BACK}
        title="Пароль"
        description="Пароль меняется только по коду из письма: если кто-то узнал старый пароль, этого не хватит, чтобы закрыть вам доступ. После смены на остальных устройствах нужно будет войти заново."
      />
      {!sent ? (
        <SettingsPanel className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20">
            <MailCheck className="size-5" />
          </span>
          <p className="flex-1 text-sm text-pretty text-muted-foreground">
            Пришлём 6-значный код на <span className="font-medium text-foreground">{email}</span>. Старый пароль не нужен.
          </p>
          <Button className="h-10 rounded-full px-5" onClick={sender.send} disabled={sender.sending || sender.wait > 0}>
            {sender.sending && <Spinner />}
            {sender.wait > 0 ? `Отправить через ${sender.wait} с` : 'Отправить код'}
          </Button>
        </SettingsPanel>
      ) : (
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          <SettingsPanel>
            <FieldGroup className="gap-6">
              <Field data-invalid={codeError}>
                <FieldLabel>Код из письма</FieldLabel>
                <FieldDescription className="-mt-1">
                  Отправили на <span className="font-medium text-foreground">{email}</span>. Код действует 15 минут.
                </FieldDescription>
                <CodeInput value={code} onChange={setCode} disabled={change.isPending} />
                {codeError && <FieldError>{errorMessage(change.error)}</FieldError>}
              </Field>
              <Field data-invalid={!!fieldErrors.newPassword}>
                <FieldLabel htmlFor="new-password">Новый пароль</FieldLabel>
                <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                {fieldErrors.newPassword ? <FieldError>{fieldErrors.newPassword}</FieldError> : <FieldDescription>Не короче 8 символов</FieldDescription>}
              </Field>
            </FieldGroup>
            {change.isError && !codeError && !fieldErrors.newPassword && <p className="mt-4 text-sm text-destructive">{errorMessage(change.error)}</p>}
          </SettingsPanel>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={sender.send} disabled={sender.sending || sender.wait > 0}>
              {sender.sending && <Spinner />}
              {sender.wait > 0 ? `Новый код — через ${sender.wait} с` : 'Отправить код ещё раз'}
            </Button>
            <Button type="submit" className="h-10 rounded-full px-5" disabled={code.length !== 6 || !next || change.isPending}>
              {change.isPending && <Spinner />}
              Сменить пароль
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

// ------------------------------------------------------------------ devices

function DevicesSection() {
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
    <>
      <SubPageHeader {...BACK} title="Устройства" description="Где сейчас выполнен вход в аккаунт. Незнакомое устройство — завершите сеанс и смените пароль." />
      <div className="mt-8">
        {sessions.isPending ? (
          <SettingsGroup>
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3.5 px-5 py-4">
                <Skeleton className="size-5 rounded-md" />
                <Skeleton className="h-9 flex-1" />
              </div>
            ))}
          </SettingsGroup>
        ) : sessions.isError ? (
          <p className="text-sm text-destructive">{errorMessage(sessions.error)}</p>
        ) : (
          <SettingsGroup>
            {[...sessions.data]
              .sort((a, b) => Number(b.current) - Number(a.current))
              .map((s) => (
                <SessionRow key={s.id} session={s} pending={revoke.isPending && revoke.variables === s.id} onRevoke={() => revoke.mutate(s.id)} />
              ))}
          </SettingsGroup>
        )}
      </div>
      {others > 0 && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" className="h-10 rounded-full px-5" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
            {revokeOthers.isPending ? <Spinner /> : <LogOut />}
            Выйти на остальных устройствах
          </Button>
        </div>
      )}
    </>
  );
}

function SessionRow({ session, pending, onRevoke }: { session: SessionInfo; pending: boolean; onRevoke(): void }) {
  const { label, mobile } = describeUserAgent(session.userAgent);
  return (
    <SettingsRow
      icon={mobile ? Smartphone : Monitor}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{label}</span>
          {session.current && <Badge variant="secondary">Это устройство</Badge>}
        </span>
      }
      description={
        <span title={`Вход ${fullDate(session.createdAt)}`}>
          {session.ipAddress ?? 'IP неизвестен'} · {session.current ? 'активно сейчас' : `активность ${timeAgo(session.lastUsedAt)}`}
        </span>
      }
      trailing={
        !session.current && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onRevoke} disabled={pending}>
            {pending && <Spinner />}
            Завершить
          </Button>
        )
      }
    />
  );
}
