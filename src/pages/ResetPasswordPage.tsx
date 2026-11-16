import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowRight, Eye, EyeOff, KeyRound, OctagonAlert } from 'lucide-react';
import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { displayTitle } from '@/components/site';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';
import { AuthShell, fieldClass, groupClass } from './AuthPage';
import { CODE_LENGTH, CodeInput } from './VerifyEmailPage';

/** Errors about the code: the cells are cleared for the next try (the password stays). */
const CODE_ERRORS = new Set(['code_invalid', 'code_attempts', 'code_expired', 'code_missing']);

type NavState = { from?: string; email?: string } | null;

/**
 * /reset-password — a forgotten password: the email first, then the 6-digit code from the letter and the
 * new password. Success ends the other sessions of the account and logs in here.
 */
export function ResetPasswordPage() {
  const resetPassword = useAuth((s) => s.resetPassword);
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as NavState;
  const from = navState?.from ?? '/plans';

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(navState?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [wait, setWait] = useState(0);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const fail = (err: unknown) => {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setFieldErrors(err.fieldErrors);
    else setError(errorMessage(err));
  };

  /** Asks for a code; on the first step also moves on to the second. */
  const requestCode = async () => {
    setError(null);
    setFieldErrors({});
    if (!email.trim()) {
      setFieldErrors({ email: 'Введите email' });
      return;
    }
    try {
      const { retryAfter } = await authApi.forgotPassword(email.trim());
      setWait(retryAfter);
      setCode('');
      setStep('code');
    } catch (err) {
      const retry = err instanceof ApiError ? Number(err.detail.retryAfter) : NaN;
      if (step === 'code' && Number.isFinite(retry) && retry > 0) setWait(retry);
      fail(err);
    }
  };

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    await requestCode();
    setPending(false);
  };

  const resend = async () => {
    setResending(true);
    await requestCode();
    setResending(false);
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (code.length !== CODE_LENGTH) {
      setError('Введите 6-значный код из письма');
      return;
    }
    setPending(true);
    try {
      await resetPassword(email.trim(), code, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && CODE_ERRORS.has(err.code)) setCode('');
      fail(err);
    } finally {
      setPending(false);
    }
  };

  const errorAlert = error && (
    <Alert variant="destructive" className="mt-7 rounded-xl">
      <OctagonAlert />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  const submitClass = 'group mt-3 h-12 w-full rounded-xl bg-ink text-[15px] font-medium text-white hover:bg-ink/85';

  return (
    <AuthShell>
      <div className="w-full max-w-[400px]">
        <span className="grid size-12 place-items-center rounded-2xl bg-ink text-white">
          <KeyRound className="size-6" />
        </span>

        {step === 'email' ? (
          <form onSubmit={submitEmail} noValidate>
            <h1 className={cn(displayTitle, 'mt-7 text-[1.8rem] leading-[1.08] sm:text-[2.2rem]')}>
              Восстановление пароля
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink/55">
              Укажите email аккаунта — пришлём код, чтобы задать новый пароль.
            </p>
            {errorAlert}
            <FieldGroup className="mt-9 gap-5">
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
              <Button type="submit" size="lg" className={submitClass} disabled={pending}>
                {pending && <Spinner />}
                Получить код
                {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
              </Button>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={submitReset} noValidate>
            <h1 className={cn(displayTitle, 'mt-7 text-[1.8rem] leading-[1.08] sm:text-[2.2rem]')}>Новый пароль</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink/55">
              Если аккаунт с адресом <span className="font-medium text-ink">{email.trim()}</span> есть, мы отправили
              на него 6-значный код.
            </p>
            {errorAlert}
            <FieldGroup className="mt-9 gap-5">
              <Field>
                <FieldLabel>Код из письма</FieldLabel>
                <CodeInput
                  value={code}
                  onChange={setCode}
                  onComplete={() => passwordRef.current?.focus()}
                  disabled={pending}
                />
              </Field>
              <Field data-invalid={!!fieldErrors.password}>
                <FieldLabel htmlFor="password">Новый пароль</FieldLabel>
                <InputGroup className={groupClass}>
                  <InputGroupInput
                    ref={passwordRef}
                    id="password"
                    className="px-4 text-[15px] placeholder:text-ink/35 md:text-[15px]"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Не короче 8 символов"
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
                {fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}
              </Field>
              <Button type="submit" size="lg" className={submitClass} disabled={pending}>
                {pending && <Spinner />}
                Сохранить и войти
                {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
              </Button>
            </FieldGroup>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
              {wait > 0 ? (
                <span className="text-ink/45 tabular-nums">Новый код — через {wait} с</span>
              ) : (
                <button
                  type="button"
                  className="font-medium text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink disabled:opacity-50"
                  onClick={() => void resend()}
                  disabled={resending}
                >
                  {resending ? 'Отправляем…' : 'Отправить код ещё раз'}
                </button>
              )}
              <button
                type="button"
                className="text-ink/45 transition-colors hover:text-ink"
                onClick={() => {
                  setStep('email');
                  setError(null);
                  setFieldErrors({});
                }}
              >
                Другой email
              </button>
            </div>

            <p className="mt-9 border-t border-ink/[0.08] pt-6 text-xs leading-relaxed text-ink/45">
              Письмо не пришло? Проверьте папку «Спам». Код действует 15 минут. После смены пароля вход на других
              устройствах завершится.
            </p>
          </form>
        )}

        {step === 'email' && (
          <p className="mt-9 text-center text-sm text-ink/50">
            Вспомнили пароль?{' '}
            <Link
              to="/login"
              state={navState?.from ? { from: navState.from } : undefined}
              className="font-medium text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
            >
              Войти
            </Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
