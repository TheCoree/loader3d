import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { create } from 'zustand';
import { ArrowRight, Check, Lock } from 'lucide-react';
import type { BillingInfo, Price, Subscription, TierId } from '@/api/types';
import { LeadForm } from '@/components/LeadForm';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useDemoMode } from '@/lib/demoMode';
import { PERIOD_LABEL, priceOf, useBilling, usePay, useStartTrial } from '@/lib/billing';
import { TRIAL_DAYS, formatPrice, longDate, subscriptionState, tierInfo } from '@/lib/tiers';
import { useAuth } from '@/store/useAuth';

interface UpgradeState {
  open: boolean;
  /** Why it opened: «Автозагрузка доступна на тарифе «Pro»». */
  reason: string | null;
  /** Straight to the request form for this tier. */
  requestTier: TierId | null;
  show(reason?: string, requestTier?: TierId): void;
  close(): void;
}

export const useUpgrade = create<UpgradeState>()((set) => ({
  open: false,
  reason: null,
  requestTier: null,
  show: (reason, requestTier) => set({ open: true, reason: reason ?? null, requestTier: requestTier ?? null }),
  close: () => set({ open: false }),
}));

/** Feature or limit of «Pro» behind a paywall: start the trial or ask the team to connect it. */
export function UpgradeDialog() {
  const { open, reason, requestTier, close } = useUpgrade();
  const user = useAuth((s) => s.user);
  const billing = useBilling();
  const trial = useStartTrial();
  const onBillingPage = useLocation().pathname === '/billing';
  const [requesting, setRequesting] = useState<TierId | null>(null);
  const sub = user?.subscription;
  const pro = tierInfo('pro');
  const chosen = requesting ?? requestTier;
  // «Pro» is paid right here when the server takes payments; otherwise it is a request, like «Индивидуальный».
  const paying = !!billing?.enabled && chosen === 'pro';
  const form = paying ? null : chosen;

  const startTrial = () => trial.mutate(undefined, { onSuccess: close });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          close();
          setRequesting(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogoMark tone="mono" className="size-6 text-primary" />
            {form === 'custom' ? 'Индивидуальные условия' : `Тариф «${pro.name}»`}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {form
              ? 'Оставьте контакты — подключим тариф и ответим на вопросы.'
              : paying
                ? renewalNote(sub)
                : (reason ?? 'Снимите ограничения тарифа «Старт».')}
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <LeadForm
            tier={form}
            defaults={{ name: user?.displayName, email: user?.email }}
            submitLabel="Отправить заявку"
            messagePlaceholder={form === 'custom' ? 'Объёмы, сколько пользователей, сроки' : 'Удобный способ оплаты, вопросы'}
          />
        ) : paying && billing ? (
          <PayOptions info={billing} />
        ) : (
          <>
            <ul className="grid gap-2 rounded-xl bg-muted/60 p-4 text-sm">
              {pro.features.slice(0, 5).map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            {billing?.enabled && <PayOptions info={billing} />}
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              {sub?.trialAvailable ? (
                <Button size="lg" className="sm:flex-1" onClick={startTrial} disabled={trial.isPending}>
                  {trial.isPending && <Spinner />}
                  Попробовать {TRIAL_DAYS} дней бесплатно
                </Button>
              ) : (
                !billing?.enabled && (
                  <Button size="lg" className="sm:flex-1" onClick={() => setRequesting('pro')}>
                    Подключить «{pro.name}»
                  </Button>
                )
              )}
              <Button size="lg" variant="outline" onClick={() => setRequesting('custom')}>
                Индивидуальные условия
              </Button>
            </div>
          </>
        )}
        {sub && !onBillingPage && (
          <Link
            to="/billing"
            onClick={close}
            className="group/link -mt-1 inline-flex items-center gap-1 justify-self-center text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground"
          >
            Все тарифы, лимиты и история оплат
            <ArrowRight className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The next step up from the account's subscription, for the buttons of the plans, account and tariff
 * pages: the trial of «Pro» at a click, the offer of «Pro» (payment or a request), renewal, the contract.
 */
export function useUpgradeAction(): { label: string; run(): void; pending: boolean } | null {
  const sub = useAuth((s) => s.user?.subscription);
  const online = !!useBilling()?.enabled;
  const show = useUpgrade((s) => s.show);
  const trial = useStartTrial();
  if (!sub) return null;
  const offer = { run: () => show(undefined, 'pro'), pending: false };
  switch (subscriptionState(sub)) {
    case 'free':
      if (sub.trialAvailable) return { label: `«Pro» на ${TRIAL_DAYS} дней бесплатно`, run: () => trial.mutate(), pending: trial.isPending };
      return { label: 'Перейти на «Pro»', run: () => show(), pending: false };
    case 'expired':
      // Renewal first; the offer itself still has the trial if the account never took it.
      return { label: sub.expiredTier === 'pro' ? 'Продлить «Pro»' : 'Перейти на «Pro»', run: () => show(), pending: false };
    case 'trial':
      return { label: online ? 'Оплатить «Pro»' : 'Оформить подписку', ...offer };
    case 'active':
    case 'ending':
      // «Pro» without an end date (given by an admin): nothing to renew.
      return sub.expiresAt ? { label: 'Продлить «Pro»', ...offer } : null;
    case 'custom':
      return { label: 'Связаться по договору', run: () => show(undefined, 'custom'), pending: false };
  }
}

/** What a payment does to the current subscription. */
function renewalNote(sub: Subscription | null | undefined): string {
  if (sub?.tier === 'pro' && sub.expiresAt) {
    return `${sub.trial ? 'Пробный период' : '«Pro»'} действует до ${longDate(sub.expiresAt)} — оплаченный период добавится к нему.`;
  }
  return 'Тариф подключится сразу после оплаты.';
}

/** «Pro» for a month or a year: leaves for the payment page (src/lib/billing.ts). */
function PayOptions({ info }: { info: BillingInfo }) {
  const pay = usePay();
  // After a success the browser is leaving for the payment page: keep the buttons disabled.
  const busy = pay.isPending || pay.isSuccess;
  const prices = [priceOf(info, 'month'), priceOf(info, 'year')].filter((p): p is Price => !!p);
  const month = priceOf(info, 'month')?.amount;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {prices.map((price) => {
        const perMonth = Math.round(price.amount / price.months);
        const saving = month && price.months > 1 ? Math.round((1 - perMonth / month) * 100) : 0;
        return (
          <Button
            key={price.period}
            size="lg"
            variant={price.months > 1 ? 'default' : 'outline'}
            className="h-auto flex-col items-start gap-0.5 py-3 text-left"
            disabled={busy}
            onClick={() => pay.mutate(price.period)}
          >
            <span className="flex items-center gap-2 text-base font-semibold tabular-nums">
              {busy && pay.variables === price.period && <Spinner />}
              {formatPrice(price.amount)} {PERIOD_LABEL[price.period]}
            </span>
            <span className="text-xs font-normal opacity-80">
              {price.months > 1
                ? `${formatPrice(perMonth)} в месяц${saving > 0 ? ` · выгоднее на ${saving}%` : ''}`
                : 'оплата за один месяц'}
            </span>
          </Button>
        );
      })}
      <p className="text-xs text-pretty text-muted-foreground sm:col-span-2">
        Без автоматических списаний: когда период закончится, аккаунт перейдёт на «Старт», схемы сохранятся.
      </p>
    </div>
  );
}

/** Marks a feature of «Pro» on tiers without it; in the demo of the landing page — what opens after the registration. */
export function ProBadge() {
  const demo = useDemoMode();
  if (demo) {
    return (
      <span
        title="После регистрации"
        className="ml-auto inline-flex h-4.5 items-center rounded-full bg-primary/10 px-1.5 text-primary"
      >
        <Lock className="size-2.5" aria-hidden />
        <span className="sr-only">После регистрации</span>
      </span>
    );
  }
  return (
    <span className="ml-auto inline-flex h-4.5 items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
      Pro
    </span>
  );
}
