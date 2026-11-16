import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, OctagonAlert } from 'lucide-react';
import { ApiError, errorMessage } from '@/api/client';
import { Logo } from '@/components/Logo';
import { DitherBackground, displayTitle } from '@/components/site';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { SUPPORT } from '@/lib/legal';
import { TIERS_ENABLED, TRIAL_DAYS, tierInfo } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

type ChosenTier = 'free' | 'pro';

type Mode = 'login' | 'register';

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  login: {
    title: 'С возвращением',
    subtitle: 'Войдите, чтобы открыть свои схемы загрузки.',
    submit: 'Войти',
  },
  register: {
    title: 'Создайте аккаунт',
    subtitle: 'Схемы сохраняются в аккаунте и открываются с любого устройства.',
    submit: 'Создать аккаунт',
  },
};

/** Filled fields of the public pages: grey at rest, white with a soft ring in focus. */
export const fieldClass =
  'h-12 rounded-xl border-transparent bg-[#f4f4f6] px-4 text-[15px] md:text-[15px] placeholder:text-ink/35 focus-visible:border-ink/20 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-ink/[0.05]';
const docLink = 'text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink';
export const groupClass =
  'h-12 rounded-xl border-transparent bg-[#f4f4f6] has-[[data-slot=input-group-control]:focus-visible]:border-ink/20 has-[[data-slot=input-group-control]:focus-visible]:bg-white has-[[data-slot=input-group-control]:focus-visible]:ring-4 has-[[data-slot=input-group-control]:focus-visible]:ring-ink/[0.05]';

export function AuthPage({ mode }: { mode: Mode }) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/plans';
  const [params] = useSearchParams();
  const [tier, setTier] = useState<ChosenTier>(TIERS_ENABLED && params.get('tier') === 'pro' ? 'pro' : 'free');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const copy = COPY[mode];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (mode === 'register' && !accepted) {
      setFieldErrors({ terms: 'Чтобы создать аккаунт, примите условия' });
      return;
    }
    setPending(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName.trim(), tier);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setFieldErrors(err.fieldErrors);
      else setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="w-full max-w-[400px]" noValidate>
        <h1 className={cn(displayTitle, 'text-[2.1rem] leading-[1.05] sm:text-[2.6rem]')}>{copy.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/55">{copy.subtitle}</p>

        {error && (
          <Alert variant="destructive" className="mt-7 rounded-xl">
            <OctagonAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FieldGroup className="mt-9 gap-5">
          {mode === 'register' && TIERS_ENABLED && <TierChoice value={tier} onChange={setTier} />}
          {mode === 'register' && (
            <Field data-invalid={!!fieldErrors.displayName}>
              <FieldLabel htmlFor="displayName">Имя</FieldLabel>
              <Input
                id="displayName"
                className={fieldClass}
                autoComplete="name"
                placeholder="Как к вам обращаться"
                value={displayName}
                maxLength={100}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {fieldErrors.displayName && <FieldError>{fieldErrors.displayName}</FieldError>}
            </Field>
          )}

          <Field data-invalid={!!fieldErrors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              className={fieldClass}
              autoComplete="email"
              placeholder="name@company.ru"
              required
              autoFocus
              value={email}
              aria-invalid={!!fieldErrors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
          </Field>

          <Field data-invalid={!!fieldErrors.password}>
            <div className="flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor="password">Пароль</FieldLabel>
              {mode === 'login' && (
                <Link
                  to="/reset-password"
                  state={{ ...(location.state as object | null), email: email.trim() }}
                  className="text-[13px] text-ink/50 transition-colors hover:text-ink"
                >
                  Забыли пароль?
                </Link>
              )}
            </div>
            <InputGroup className={groupClass}>
              <InputGroupInput
                id="password"
                className="px-4 text-[15px] placeholder:text-ink/35 md:text-[15px]"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'Не короче 8 символов' : undefined}
                required
                value={password}
                aria-invalid={!!fieldErrors.password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <InputGroupAddon align="inline-end" className="pr-3">
                <InputGroupButton
                  size="icon-sm"
                  className="rounded-lg text-ink/45 hover:text-ink"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {fieldErrors.password ? (
              <FieldError>{fieldErrors.password}</FieldError>
            ) : (
              mode === 'register' && <FieldDescription className="sr-only">Не короче 8 символов</FieldDescription>
            )}
          </Field>

          {mode === 'register' && (
            <Field data-invalid={!!fieldErrors.terms}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  className="mt-0.5 size-[18px] rounded-[5px] border-ink/25 data-checked:border-ink data-checked:bg-ink"
                  checked={accepted}
                  aria-invalid={!!fieldErrors.terms}
                  onCheckedChange={(v) => {
                    setAccepted(v === true);
                    setFieldErrors(({ terms: _, ...rest }) => rest);
                  }}
                />
                <label htmlFor="terms" className="text-[13px] leading-relaxed text-ink/60">
                  Принимаю{' '}
                  <Link to="/terms" target="_blank" className={docLink}>
                    пользовательское соглашение
                  </Link>{' '}
                  и даю согласие на обработку персональных данных по{' '}
                  <Link to="/privacy" target="_blank" className={docLink}>
                    политике конфиденциальности
                  </Link>
                </label>
              </div>
              {fieldErrors.terms && <FieldError>{fieldErrors.terms}</FieldError>}
            </Field>
          )}

          <Button
            type="submit"
            size="lg"
            className="group mt-3 h-12 w-full rounded-xl bg-ink text-[15px] font-medium text-white hover:bg-ink/85"
            disabled={pending}
          >
            {pending && <Spinner />}
            {copy.submit}
            {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
          </Button>
        </FieldGroup>

        {mode === 'register' && (
          <p className="mt-5 text-center text-xs leading-relaxed text-ink/45">
            {TIERS_ENABLED ? (
              <>
                Компаниям с особыми задачами — тариф «Индивидуальный» по договору.{' '}
                <Link to="/#contact" className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                  Оставить заявку
                </Link>
              </>
            ) : (
              'Регистрация бесплатна и займёт меньше минуты.'
            )}
          </p>
        )}

        <div className="mt-9 flex items-center gap-4 text-sm text-ink/50">
          <span className="h-px flex-1 bg-ink/[0.08]" />
          {mode === 'login' ? 'Впервые в Loader3D?' : 'Уже есть аккаунт?'}
          <span className="h-px flex-1 bg-ink/[0.08]" />
        </div>
        <Button
          asChild
          variant="outline"
          size="lg"
          className="mt-5 h-12 w-full rounded-xl border-ink/10 bg-white text-[15px] font-medium hover:bg-ink/[0.03]"
        >
          <Link to={mode === 'login' ? '/register' : '/login'} state={location.state}>
            {mode === 'login' ? 'Создать аккаунт' : 'Войти'}
          </Link>
        </Button>
      </form>
    </AuthShell>
  );
}

/** The layout of the sign-in pages: the dark brand panel and a white column for the form. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ink text-ink antialiased lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:bg-white">
      <BrandPanel />

      <main className="relative -mt-8 flex min-h-[calc(100dvh-12rem)] flex-col rounded-t-[28px] bg-white px-5 pt-8 pb-6 sm:px-10 lg:mt-0 lg:min-h-dvh lg:rounded-none lg:py-8">
        <div className="hidden justify-end lg:flex">
          <BackHome />
        </div>

        <div className="flex flex-1 items-center justify-center py-4 lg:py-12">{children}</div>

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-ink/40">
          <span>© {new Date().getFullYear()} Loader3D</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/terms" className="transition-colors hover:text-ink">
              Соглашение
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-ink">
              Конфиденциальность
            </Link>
            <a href={`mailto:${SUPPORT.email}`} className="transition-colors hover:text-ink">
              Поддержка
            </a>
          </span>
        </footer>
      </main>
    </div>
  );
}

function BackHome({ dark }: { dark?: boolean }) {
  return (
    <Link
      to="/"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        dark ? 'text-white/65 hover:bg-white/10 hover:text-white' : 'text-ink/55 hover:bg-ink/[0.04] hover:text-ink',
      )}
    >
      <ArrowLeft className="size-3.5" /> На главную
    </Link>
  );
}

/** Free or the trial of «Pro»: the paid tier itself is activated by the team later. */
function TierChoice({ value, onChange }: { value: ChosenTier; onChange(tier: ChosenTier): void }) {
  const options: Array<{ id: ChosenTier; title: string; note: string }> = [
    { id: 'free', title: tierInfo('free').name, note: 'Бесплатно, 3 схемы' },
    { id: 'pro', title: tierInfo('pro').name, note: `${TRIAL_DAYS} дней бесплатно` },
  ];
  return (
    <div role="radiogroup" aria-label="Тариф" className="grid grid-cols-2 gap-2.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative rounded-2xl p-4 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active ? 'bg-ink text-white shadow-[0_16px_30px_-16px_rgba(10,11,13,0.6)]' : 'bg-[#f4f4f6] hover:bg-[#ececef]',
            )}
          >
            <span className="block font-display text-[17px] font-medium tracking-[-0.01em]">{o.title}</span>
            <span className={cn('mt-0.5 block text-[13px]', active ? 'text-white/60' : 'text-ink/50')}>{o.note}</span>
            <span
              className={cn(
                'absolute top-4 right-4 grid size-[18px] place-items-center rounded-full transition-colors',
                active ? 'bg-white text-ink' : 'ring-1 ring-ink/15',
              )}
            >
              {active && <Check className="size-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const HIGHLIGHTS = ['Физика и магниты', 'LDM, вес и центр тяжести', 'PDF для водителя'];

/** The dark side: the dithered waves and the promise, text only. On phones — a band on top. */
function BrandPanel() {
  return (
    <aside className="relative isolate overflow-hidden bg-ink text-white lg:sticky lg:top-0 lg:h-dvh">
      <DitherBackground className="-z-10" waveColor={[0.3, 0.33, 0.4]} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(10,11,13,0.85)_0%,rgba(10,11,13,0.55)_40%,rgba(10,11,13,0.92)_100%)]"
      />
      <div className="flex h-full flex-col px-5 pt-5 pb-16 sm:px-10 sm:pt-7 lg:px-12 lg:pt-8 lg:pb-12 xl:px-14">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="lg:hidden">
            <BackHome dark />
          </div>
        </div>

        <div className="mt-10 max-w-lg lg:mt-auto">
          <h2 className={cn(displayTitle, 'text-[1.9rem] leading-[1.06] sm:text-4xl xl:text-[3.25rem] xl:leading-[1.02]')}>
            Соберите фуру в 3D до того, как приедет машина
          </h2>
          <p className="mt-5 hidden max-w-md text-[17px] leading-relaxed text-white/55 lg:block">
            Раскладка паллет с физикой, контроль веса и центра тяжести, PDF-схема для водителя — в браузере, без установки.
          </p>
        </div>

        <ul className="mt-10 hidden flex-wrap gap-x-6 gap-y-2 text-sm text-white/50 lg:flex">
          {HIGHLIGHTS.map((h) => (
            <li key={h} className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-primary" />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
