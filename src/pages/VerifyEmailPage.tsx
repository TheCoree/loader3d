import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ArrowRight, MailCheck, OctagonAlert } from 'lucide-react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { displayTitle } from '@/components/site';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';
import { AuthShell } from './AuthPage';

export const CODE_LENGTH = 6;
/** The server lets a new code be requested once a minute; registration has just sent the first one. */
const RESEND_SECONDS = 60;

/**
 * After registration: the 6-digit code sent to the email. Plans stay closed until it is confirmed
 * (RequireAuth sends unconfirmed accounts here). Until there is mail on the domain the API prints the
 * code to its log (MAIL_BACKEND=console).
 */
export function VerifyEmailPage() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/plans';

  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  if (!user) return null;
  if (user.emailVerified) return <Navigate to={from} replace />;

  const verify = async (value: string) => {
    setPending(true);
    setError(null);
    try {
      setUser(await authApi.verifyEmail(value));
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const { retryAfter } = await authApi.resendVerification();
      setWait(retryAfter);
      setSent(true);
      setCode('');
    } catch (err) {
      const retry = err instanceof ApiError ? Number(err.detail.retryAfter) : NaN;
      if (Number.isFinite(retry) && retry > 0) setWait(retry);
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  };

  const signOut = async () => {
    await logout().catch(() => {});
    navigate('/register', { replace: true });
  };

  return (
    <AuthShell>
      <div className="w-full max-w-[400px]">
        <span className="grid size-12 place-items-center rounded-2xl bg-ink text-white">
          <MailCheck className="size-6" />
        </span>
        <h1 className={cn(displayTitle, 'mt-7 text-[2.1rem] leading-[1.05] sm:text-[2.6rem]')}>Подтвердите email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/55">
          {sent ? 'Отправили новый код на ' : 'Мы отправили 6-значный код на '}
          <span className="font-medium text-ink">{user.email}</span>. Введите его, чтобы открыть схемы.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-7 rounded-xl">
            <OctagonAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form
          className="mt-9"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === CODE_LENGTH) void verify(code);
          }}
        >
          <CodeInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} disabled={pending} />

          <Button
            type="submit"
            size="lg"
            className="group mt-8 h-12 w-full rounded-xl text-[15px]"
            disabled={pending || code.length !== CODE_LENGTH}
          >
            {pending && <Spinner />}
            Подтвердить
            {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
          </Button>
        </form>

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
          <button type="button" className="text-ink/45 transition-colors hover:text-ink" onClick={() => void signOut()}>
            Другой email
          </button>
        </div>

        <p className="mt-9 border-t border-ink/[0.08] pt-6 text-xs leading-relaxed text-ink/45">
          Письмо не пришло? Проверьте папку «Спам». Код действует 15 минут.
        </p>
      </div>
    </AuthShell>
  );
}

/** Six big cells for a code from an email (also on the password reset page). */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
}: {
  value: string;
  onChange(value: string): void;
  onComplete?(value: string): void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <InputOTP
      maxLength={CODE_LENGTH}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      autoComplete="one-time-code"
      inputMode="numeric"
      aria-label="Код из письма"
      containerClassName="justify-between"
    >
      <InputOTPGroup className="w-full justify-between gap-2 *:data-[slot=input-otp-slot]:rounded-xl *:data-[slot=input-otp-slot]:border-l">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className="size-13 border-transparent bg-[#f4f4f6] font-display text-2xl font-medium data-[active=true]:border-ink/20 data-[active=true]:bg-white data-[active=true]:ring-4 data-[active=true]:ring-ink/[0.05]"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
