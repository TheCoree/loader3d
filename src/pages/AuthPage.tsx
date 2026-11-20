import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, OctagonAlert } from 'lucide-react';
import { ApiError, errorMessage } from '@/api/client';
import { Logo } from '@/components/Logo';
import { displayTitle, publicRoot } from '@/components/site';
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
  'h-12 rounded-lg border-white/10 bg-white/[0.04] px-4 text-[15px] text-white md:text-[15px] placeholder:text-white/30 focus-visible:border-white/35 focus-visible:bg-white/[0.06] focus-visible:ring-4 focus-visible:ring-white/[0.06]';
const docLink = 'text-white underline decoration-white/30 underline-offset-4 hover:decoration-white';
export const groupClass =
  'h-12 rounded-lg border-white/10 bg-white/[0.04] text-white has-[[data-slot=input-group-control]:focus-visible]:border-white/35 has-[[data-slot=input-group-control]:focus-visible]:bg-white/[0.06] has-[[data-slot=input-group-control]:focus-visible]:ring-4 has-[[data-slot=input-group-control]:focus-visible]:ring-white/[0.06]';

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
        <h1 className={cn(displayTitle, 'text-[1.8rem] leading-[1.08] sm:text-[2.2rem]')}>{copy.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/55">{copy.subtitle}</p>

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
                  className="text-[13px] text-white/50 transition-colors hover:text-white"
                >
                  Забыли пароль?
                </Link>
              )}
            </div>
            <InputGroup className={groupClass}>
              <InputGroupInput
                id="password"
                className="px-4 text-[15px] placeholder:text-white/35 md:text-[15px]"
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
                  className="rounded-lg text-white/45 hover:text-white"
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
                  className="mt-0.5 size-[18px] rounded-[5px] border-white/25 data-checked:border-white data-checked:bg-white data-checked:text-black"
                  checked={accepted}
                  aria-invalid={!!fieldErrors.terms}
                  onCheckedChange={(v) => {
                    setAccepted(v === true);
                    setFieldErrors(({ terms: _, ...rest }) => rest);
                  }}
                />
                <label htmlFor="terms" className="text-[13px] leading-relaxed text-white/60">
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
            className="group mt-3 h-12 w-full rounded-full bg-white text-[15px] font-medium text-black hover:bg-white/85"
            disabled={pending}
          >
            {pending && <Spinner />}
            {copy.submit}
            {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
          </Button>
        </FieldGroup>

        {mode === 'register' && (
          <p className="mt-5 text-center text-xs leading-relaxed text-white/45">
            {TIERS_ENABLED ? (
              <>
                Компаниям с особыми задачами — тариф «Индивидуальный» по договору.{' '}
                <Link to="/#contact" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  Оставить заявку
                </Link>
              </>
            ) : (
              'Регистрация бесплатна и займёт меньше минуты.'
            )}
          </p>
        )}

        <div className="mt-9 flex items-center gap-4 text-sm text-white/50">
          <span className="h-px flex-1 bg-white/10" />
          {mode === 'login' ? 'Впервые в Loader3D?' : 'Уже есть аккаунт?'}
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <Button
          asChild
          variant="outline"
          size="lg"
          className="mt-5 h-12 w-full rounded-full border-white/15 bg-black text-[15px] font-medium text-white hover:bg-white/[0.06] hover:text-white"
        >
          <Link to={mode === 'login' ? '/register' : '/login'} state={location.state}>
            {mode === 'login' ? 'Создать аккаунт' : 'Войти'}
          </Link>
        </Button>
      </form>
    </AuthShell>
  );
}

/** The layout of the sign-in pages (dark, like the landing page): the brand panel and a column for the form. */
/**
 * The frame of the sign-in pages: the logo and the way back home on top, the form in the middle, the
 * documents at the bottom — one column, nothing beside the form.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={cn(publicRoot, 'flex min-h-dvh flex-col')}>
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-6">
        <Logo className="text-white" />
        <BackHome />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-8 sm:py-12">{children}</main>

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 pt-4 pb-6 text-xs text-white/40 sm:pb-8">
        <span>© {new Date().getFullYear()} Loader3D</span>
        <Link to="/terms" className="transition-colors hover:text-white">
          Соглашение
        </Link>
        <Link to="/privacy" className="transition-colors hover:text-white">
          Конфиденциальность
        </Link>
        <a href={`mailto:${SUPPORT.email}`} className="transition-colors hover:text-white">
          Поддержка
        </a>
      </footer>
    </div>
  );
}

function BackHome() {
  return (
    <Link
      to="/"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        'text-white/55 hover:bg-white/[0.06] hover:text-white',
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
              active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
            )}
          >
            <span className="block font-geist text-[17px] font-medium tracking-[-0.01em]">{o.title}</span>
            <span className={cn('mt-0.5 block text-[13px]', active ? 'text-black/55' : 'text-white/50')}>{o.note}</span>
            <span
              className={cn(
                'absolute top-4 right-4 grid size-[18px] place-items-center rounded-full transition-colors',
                active ? 'bg-black text-white' : 'ring-1 ring-white/25',
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
