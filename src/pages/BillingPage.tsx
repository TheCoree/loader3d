import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Lock, Minus, Receipt, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { billingApi, userApi } from '@/api/endpoints';
import type { BillingPeriod, Payment, Subscription, TierId, Usage } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { SettingsGroup, SettingsRow } from '@/components/settings';
import { LimitSegments, SubscriptionStateBadge, TIER_ICON_TONE, TIER_PANEL_TONE } from '@/components/TierBadge';
import { UpgradeDialog, useUpgrade, useUpgradeAction } from '@/components/UpgradeDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PERIOD_LABEL, priceOf, useBilling, usePay, useStartTrial, useUsage } from '@/lib/billing';
import { plural } from '@/lib/format';
import {
  TIERS,
  TIERS_ENABLED,
  TRIAL_DAYS,
  comparisonRows,
  daysLeft,
  daysLeftText,
  formatPrice,
  longDate,
  subscriptionState,
  tierInfo,
} from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

/**
 * «Тариф и оплата» (/billing, tiers on only): the current tier on a panel of its colour with the use of
 * its limits, the tiers compared row by row with payment of «Pro» (or a request), the history of
 * payments. The payment page of the provider returns here (/billing?payment=<id>).
 */
export function BillingPage() {
  const sub = useAuth((s) => s.user?.subscription);
  const returning = usePaymentReturn();
  // The API has tiers off while this build has them on: nothing to show.
  if (!TIERS_ENABLED || !sub) return <Navigate to="/account" replace />;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pt-12 pb-20 sm:px-6">
        <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">Тариф и оплата</h1>
        {returning && (
          <p className="mt-6 flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm" role="status">
            <Spinner /> Проверяем оплату — это займёт несколько секунд…
          </p>
        )}
        <PlanHero sub={sub} />
        <Comparison sub={sub} />
        <Payments />
        <Footnotes sub={sub} />
      </main>
      <UpgradeDialog />
    </div>
  );
}

// ------------------------------------------------------------------ back from the payment page

/** How many times the return page asks about a pending payment (every 2 s) before it stops waiting. */
const PAYMENT_POLLS = 30;

/**
 * Back from the payment page (/billing?payment=<id>): waits until the provider has answered, then
 * refreshes the account, says how it went and drops `?payment` from the address. True while it waits.
 */
function usePaymentReturn(): boolean {
  const { search } = useLocation();
  const navigate = useNavigate();
  const id = new URLSearchParams(search).get('payment');
  const setUser = useAuth((s) => s.setUser);
  const queryClient = useQueryClient();
  const queryKey = ['billing', 'payment', id];
  const payment = useQuery({
    queryKey,
    queryFn: () => billingApi.payment(id ?? ''),
    enabled: !!id,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' && query.state.dataUpdateCount < PAYMENT_POLLS ? 2000 : false,
  });
  const data = payment.data;
  // Read on every poll (dataUpdatedAt changes each time): after the last one the page stops waiting.
  const polledAt = payment.dataUpdatedAt;
  const gaveUp =
    data?.status === 'pending' && polledAt > 0 && (queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0) >= PAYMENT_POLLS;

  useEffect(() => {
    if (!id || (!payment.isError && (!data || (data.status === 'pending' && !gaveUp)))) return;
    if (payment.isError) toast.error(errorMessage(payment.error));
    else if (data?.status === 'paid') {
      toast.success(`Оплата прошла: «Pro» подключён${data.paidUntil ? ` до ${longDate(data.paidUntil)}` : ''}`);
      void userApi.me().then(setUser);
    } else if (data?.status === 'canceled') toast('Оплата отменена — тариф не изменился');
    else toast('Платёж ещё обрабатывается: тариф подключится, как только придёт подтверждение');
    void queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] });
    navigate({ search: '' }, { replace: true });
  }, [id, data, gaveUp, payment.isError, payment.error, navigate, setUser, queryClient]);

  return !!id;
}

// ------------------------------------------------------------------ the current tier

function PlanHero({ sub }: { sub: Subscription }) {
  const state = subscriptionState(sub);
  const action = useUpgradeAction();
  const show = useUpgrade((s) => s.show);
  const billing = useBilling();
  const usage = useUsage();
  const left = daysLeft(sub);
  const { limits } = sub;

  const term =
    state === 'free'
      ? 'Бесплатно и без срока'
      : state === 'expired'
        ? `«${tierInfo(sub.expiredTier ?? 'pro').name}» закончился — действуют лимиты «Старт». Схемы сохранились.`
        : sub.expiresAt
          ? `${sub.trial ? 'Пробный период до' : 'Действует до'} ${longDate(sub.expiresAt)} · ${daysLeftText(left ?? 0)}`
          : 'Без ограничения по сроку';
  const trialDay = left === null ? 0 : Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - left + 1));

  return (
    <section className={cn('mt-8 rounded-3xl p-5 sm:p-8', TIER_PANEL_TONE[state])} aria-label="Ваш тариф">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', TIER_ICON_TONE[state])}>
            <Sparkles className="size-[22px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Ваш тариф</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">{sub.name}</h2>
              <SubscriptionStateBadge sub={sub} />
            </div>
          </div>
        </div>
        {action && (
          <div className="flex flex-wrap gap-2">
            {state === 'free' && sub.trialAvailable && billing?.enabled && (
              <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => show(undefined, 'pro')}>
                Оплатить сразу
              </Button>
            )}
            <Button
              className="h-10 rounded-full px-5"
              variant={state === 'custom' ? 'outline' : 'default'}
              onClick={action.run}
              disabled={action.pending}
            >
              {action.pending ? <Spinner /> : state !== 'custom' && <Sparkles />}
              {action.label}
            </Button>
          </div>
        )}
      </div>

      <p className={cn('mt-5 text-[15px] text-pretty', state === 'expired' || state === 'ending' ? 'text-warning' : 'text-foreground/80')}>
        {term}
      </p>
      {state === 'trial' && left !== null && (
        <div className="mt-3 flex items-center gap-3">
          <LimitSegments total={TRIAL_DAYS} filled={trialDay} className="max-w-sm flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            день {trialDay} из {TRIAL_DAYS}
          </span>
        </div>
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <Meter
          label="Схемы"
          value={usage ? (limits.plans === null ? String(usage.plans) : `${usage.plans} из ${limits.plans}`) : undefined}
          note={limits.plans === null ? 'без лимита' : undefined}
          bar={usage && limits.plans !== null ? { used: usage.plans, limit: limits.plans } : undefined}
        />
        <Meter
          label="Машин в схеме"
          value={usage ? (limits.vehicles === 1 ? '1' : `до ${limits.vehicles}`) : undefined}
          note={usage && usage.plans > 0 ? `в самой большой схеме — ${usage.maxVehicles}` : undefined}
        />
        <Meter
          label="Грузов в схеме"
          value={usage ? `до ${limits.items.toLocaleString('ru-RU')}` : undefined}
          note={usage && usage.plans > 0 ? `в самой большой схеме — ${usage.maxItems.toLocaleString('ru-RU')}` : undefined}
          bar={usage && usage.plans > 0 ? { used: usage.maxItems, limit: limits.items } : undefined}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <FeatureChip label="Автозагрузка" on={limits.autoload} />
        <FeatureChip label="Пошаговая PDF-инструкция" on={limits.pdfSteps} />
      </div>
      {usage && usage.overLimit > 0 && <OverLimitNote usage={usage} tierName={sub.name} />}
    </section>
  );
}

function Meter({ label, value, note, bar }: { label: string; value?: string; note?: string; bar?: { used: number; limit: number } }) {
  const full = !!bar && bar.used >= bar.limit && bar.limit > 1;
  return (
    <div className="rounded-2xl bg-background/70 p-4 dark:bg-background/40">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-1.5 h-7 w-20" />
      ) : (
        <p className={cn('mt-0.5 text-[1.375rem] leading-snug font-semibold tracking-[-0.02em] tabular-nums', full && 'text-warning')}>{value}</p>
      )}
      {bar &&
        (bar.limit <= 10 ? (
          <LimitSegments total={bar.limit} filled={Math.min(bar.used, bar.limit)} warn={full} className="mt-2.5" />
        ) : (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
            <div
              className={cn('h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
              style={{ width: `${Math.min(100, (100 * bar.used) / bar.limit)}%` }}
            />
          </div>
        ))}
      {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function FeatureChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px]',
        on ? 'bg-background/70 font-medium dark:bg-background/40' : 'bg-background/40 text-muted-foreground dark:bg-background/20',
      )}
    >
      {on ? <Check className="size-3.5 text-success" /> : <Lock className="size-3.5" />}
      {label}
      {!on && <span className="font-medium text-primary">· Pro</span>}
    </span>
  );
}

function OverLimitNote({ usage, tierName }: { usage: Usage; tierName: string }) {
  const n = usage.overLimit;
  const one = n % 10 === 1 && n % 100 !== 11;
  return (
    <p className="mt-4 flex gap-2 text-sm text-pretty">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        {plural(n, ['схема больше', 'схемы больше', 'схем больше'])} лимитов «{tierName}»:{' '}
        {one ? 'её можно открывать и править, но машины и грузы в неё не добавить.' : 'их можно открывать и править, но машины и грузы в них не добавить.'}
      </span>
    </p>
  );
}

// ------------------------------------------------------------------ the tiers compared

function Comparison({ sub }: { sub: Subscription }) {
  const [period, setPeriod] = useState<BillingPeriod>('year');
  const rows = comparisonRows();
  const proColumn = 'bg-primary/[0.045] dark:bg-primary/[0.08]';

  return (
    <section className="mt-14" aria-labelledby="tiers-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="tiers-title" className="font-display text-xl font-medium tracking-[-0.015em]">
          Сравнение тарифов
        </h2>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => v && setPeriod(v as BillingPeriod)}
          className="rounded-full bg-muted p-1"
          aria-label="Период оплаты"
        >
          <ToggleGroupItem value="month" className="h-8 rounded-full px-4 data-[state=on]:bg-background">
            Помесячно
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className="h-8 rounded-full px-4 data-[state=on]:bg-background">
            За год −20%
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/[0.07]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-[28%] p-5 text-left align-bottom text-[13px] font-normal text-muted-foreground">
                <span className="sr-only">Возможность</span>
              </th>
              {TIERS.map((tier) => {
                const price = tier.price && (period === 'year' ? tier.price.yearly : tier.price.monthly);
                return (
                  <th key={tier.id} scope="col" className={cn('p-5 text-left align-top font-normal', tier.id === 'pro' && proColumn)}>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{tier.name}</span>
                      {sub.tier === tier.id && (
                        <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Ваш тариф</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">
                        {price === null ? 'По договору' : price === 0 ? '0 ₽' : formatPrice(price)}
                      </span>
                      {!!price && <span className="text-xs text-muted-foreground">в месяц</span>}
                    </div>
                    <p className="mt-0.5 min-h-4 text-xs text-muted-foreground">
                      {tier.price === null
                        ? 'под ваши объёмы'
                        : tier.price.monthly === 0
                          ? 'навсегда, без карты'
                          : period === 'year'
                            ? `${formatPrice(tier.price.yearly * 12)} за год`
                            : 'при оплате помесячно'}
                    </p>
                    <div className="mt-4">
                      <TierAction tier={tier.id} sub={sub} period={period} />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t">
                <th scope="row" className="px-5 py-3 text-left font-normal text-muted-foreground">
                  {row.label}
                </th>
                {TIERS.map((tier) => {
                  const value = row.values[tier.id];
                  return (
                    <td key={tier.id} className={cn('px-5 py-3', tier.id === 'pro' && proColumn)}>
                      {value === true ? (
                        <Check className={cn('size-4', tier.id === 'pro' ? 'text-primary' : 'text-foreground')} aria-label="Есть" />
                      ) : value === false ? (
                        <Minus className="size-4 text-muted-foreground/40" aria-label="Нет" />
                      ) : (
                        <span className="font-medium tabular-nums">{value}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The button of a tier: what moving to it means from the current subscription. */
function TierAction({ tier, sub, period }: { tier: TierId; sub: Subscription; period: BillingPeriod }) {
  const show = useUpgrade((s) => s.show);
  const billing = useBilling();
  const pay = usePay();
  const trial = useStartTrial();
  const state = subscriptionState(sub);
  const size = 'h-9 w-full rounded-full';

  if (tier === 'free') {
    return sub.tier === 'free' ? (
      <Button variant="outline" className={size} disabled>
        Текущий
      </Button>
    ) : (
      <p className="flex h-9 items-center text-xs text-pretty text-muted-foreground">После окончания платного</p>
    );
  }
  if (tier === 'custom') {
    return (
      <Button variant="outline" className={size} onClick={() => show(undefined, 'custom')}>
        {sub.tier === 'custom' ? 'Связаться' : 'Обсудить условия'}
      </Button>
    );
  }
  // «Pro».
  if (state === 'custom') {
    return (
      <Button variant="outline" className={size} disabled>
        Входит в ваш тариф
      </Button>
    );
  }
  if (state === 'free' && sub.trialAvailable) {
    return (
      <Button className={size} onClick={() => trial.mutate()} disabled={trial.isPending}>
        {trial.isPending && <Spinner />}
        {TRIAL_DAYS} дней бесплатно
      </Button>
    );
  }
  const renew = state === 'active' || state === 'ending' || state === 'expired';
  const charged = billing?.enabled ? priceOf(billing, period) : undefined;
  if (!charged) {
    // No online payment here: a request to connect or renew.
    return (
      <Button className={size} onClick={() => (state === 'free' || state === 'expired' ? show() : show(undefined, 'pro'))}>
        {renew ? 'Продлить' : 'Подключить'}
      </Button>
    );
  }
  const busy = pay.isPending || pay.isSuccess;
  return (
    <div className="grid gap-1.5">
      <Button className={size} onClick={() => pay.mutate(period)} disabled={busy} title={`«Pro» ${PERIOD_LABEL[period]}`}>
        {busy && <Spinner />}
        {renew ? 'Продлить' : 'Оплатить'} {formatPrice(charged.amount)}
      </Button>
      {sub.tier === 'pro' && sub.expiresAt && (
        <p className="text-[11px] leading-snug text-muted-foreground">Добавится к периоду до {longDate(sub.expiresAt)}</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ payments

const PAYMENT_STATUS: Record<Payment['status'], { label: string; tone: string }> = {
  pending: { label: 'Ожидает оплаты', tone: 'bg-warning/12 text-warning' },
  paid: { label: 'Оплачен', tone: 'bg-success/10 text-success' },
  canceled: { label: 'Отменён', tone: 'bg-muted text-muted-foreground' },
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function Payments() {
  const billing = useBilling();
  const payments = useQuery({ queryKey: ['billing', 'payments'], queryFn: billingApi.payments });
  // Canceled checkouts are noise: the customer left the payment page.
  const shown = (payments.data ?? []).filter((p) => p.status !== 'canceled');
  if (payments.isSuccess && shown.length === 0 && !billing?.enabled) return null;

  return (
    <SettingsGroup title="История оплат" className="mt-14">
      {payments.isPending ? (
        <div className="p-5">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : payments.isError ? (
        <p className="p-5 text-sm text-destructive">{errorMessage(payments.error)}</p>
      ) : shown.length === 0 ? (
        <SettingsRow icon={Receipt} title="Оплат пока не было" description="Здесь появятся оплаты «Pro» — с суммой и сроком" />
      ) : (
        shown.map((p) => (
          <SettingsRow
            key={p.id}
            icon={Receipt}
            title={`«${tierInfo(p.tier as TierId).name}» ${PERIOD_LABEL[p.period]}`}
            description={`${shortDate(p.paidAt ?? p.createdAt)}${p.paidUntil ? ` · оплачено до ${shortDate(p.paidUntil)}` : ''}`}
            trailing={
              <>
                <span className="font-medium tabular-nums">{formatPrice(p.amount)}</span>
                <span className={cn('hidden h-5 items-center rounded-full px-2 text-xs font-medium sm:inline-flex', PAYMENT_STATUS[p.status].tone)}>
                  {PAYMENT_STATUS[p.status].label}
                </span>
              </>
            }
          />
        ))
      )}
    </SettingsGroup>
  );
}

// ------------------------------------------------------------------ footnotes

function Footnotes({ sub }: { sub: Subscription }) {
  const online = !!useBilling()?.enabled;
  const show = useUpgrade((s) => s.show);
  return (
    <div className="mt-8 space-y-1.5 px-1 text-[13px] text-pretty text-muted-foreground">
      <p>
        {online
          ? 'Без автоматических списаний: продление — новой оплатой, период добавится к текущему. За 3 дня до конца пришлём письмо.'
          : '«Pro» подключаем по заявке: свяжемся и подключим тариф. За 3 дня до конца срока пришлём письмо.'}
      </p>
      <p>Когда «Pro» закончится, аккаунт перейдёт на «Старт»: схемы сохранятся и будут открываться.</p>
      {sub.tier !== 'custom' && (
        <p>
          Нужны договор, счёт или интеграция с 1С?{' '}
          <button
            type="button"
            onClick={() => show(undefined, 'custom')}
            className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 outline-none hover:decoration-foreground focus-visible:decoration-foreground"
          >
            Обсудить условия
          </button>
        </p>
      )}
    </div>
  );
}
