import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  FileText,
  LayoutGrid,
  Lock,
  Package,
  Receipt,
  Sparkles,
  Truck,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { billingApi, userApi } from '@/api/endpoints';
import type { BillingPeriod, Payment, Subscription, TierId, Usage } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { SubscriptionStateBadge } from '@/components/TierBadge';
import { UpgradeDialog, useUpgrade, useUpgradeAction } from '@/components/UpgradeDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PERIOD_LABEL, priceOf, useBilling, usePay, useStartTrial, useUsage } from '@/lib/billing';
import { plural } from '@/lib/format';
import {
  TIERS,
  TIERS_ENABLED,
  TRIAL_DAYS,
  daysLeft,
  daysLeftText,
  formatPrice,
  limitSummary,
  longDate,
  subscriptionState,
  tierInfo,
  type TierInfo,
} from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

/**
 * «Тариф и оплата» (/billing, tiers on only): the current tier and its term, how much of the limits is
 * used, the tiers side by side with payment or a request, the history of payments. The payment page of
 * the provider returns here (/billing?payment=<id>).
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
        <p className="mt-1.5 text-[15px] text-muted-foreground">Ваш тариф, лимиты и история оплат.</p>
        {returning && (
          <p className="mt-6 flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm" role="status">
            <Spinner /> Проверяем оплату — это займёт несколько секунд…
          </p>
        )}
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <CurrentPlanCard sub={sub} />
          <UsageCard sub={sub} />
        </div>
        <TierPlans sub={sub} />
        <Payments />
        <BillingQuestions sub={sub} />
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

function CurrentPlanCard({ sub }: { sub: Subscription }) {
  const state = subscriptionState(sub);
  const action = useUpgradeAction();
  const show = useUpgrade((s) => s.show);
  const billing = useBilling();
  const left = daysLeft(sub);
  const info = tierInfo(sub.tier);
  const price = sub.tier === 'pro' && billing?.enabled ? priceOf(billing, 'month') : undefined;

  const term =
    state === 'free'
      ? 'Бесплатно и без срока'
      : state === 'expired'
        ? `Тариф «${tierInfo(sub.expiredTier ?? 'pro').name}» закончился — работают лимиты «Старт»`
        : sub.expiresAt
          ? `${sub.trial ? 'Пробный период до' : 'Действует до'} ${longDate(sub.expiresAt)} · ${daysLeftText(left ?? 0)}`
          : 'Без ограничения по сроку';

  return (
    <Card className="gap-5">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-2xl',
              sub.tier === 'free' ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground shadow-sm shadow-primary/30',
            )}
          >
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Текущий тариф</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <CardTitle className="font-display text-2xl leading-tight tracking-[-0.02em]">{sub.name}</CardTitle>
              <SubscriptionStateBadge sub={sub} />
            </div>
          </div>
        </div>
        <CardDescription className={cn('text-pretty', (state === 'expired' || state === 'ending') && 'text-warning')}>
          {term}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {state === 'trial' && left !== null && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Прошло</span>
              <span className="tabular-nums">
                {Math.min(TRIAL_DAYS, TRIAL_DAYS - left + 1)} из {TRIAL_DAYS} дней
              </span>
            </div>
            <Progress value={(100 * Math.min(TRIAL_DAYS, TRIAL_DAYS - left + 1)) / TRIAL_DAYS} />
          </div>
        )}
        {(state === 'free' || state === 'expired') && (
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="text-sm font-medium">
              {state === 'expired'
                ? 'Схемы сохранились и открываются. Продлите «Pro», чтобы снова работать без ограничений:'
                : sub.trialAvailable
                  ? `«Pro» на ${TRIAL_DAYS} дней бесплатно — без карты и без автоматических списаний:`
                  : 'Что даст «Pro»:'}
            </p>
            <ul className="mt-3 grid gap-2 text-sm">
              {tierInfo('pro')
                .features.slice(0, 5)
                .map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {state !== 'free' && state !== 'expired' && (
          <p className="text-sm text-pretty text-muted-foreground">
            {state === 'trial'
              ? 'Сейчас работают все возможности «Pro». Оплатите тариф, чтобы продолжить без перерыва, — оплаченный период добавится к пробному.'
              : state === 'custom'
                ? 'Лимиты, срок и стоимость — по договору. Продление и изменения — через вашего менеджера.'
                : `${info.tagline}. ${limitSummary(sub)}.`}
          </p>
        )}
        {price && (state === 'active' || state === 'ending') && (
          <p className="text-sm">
            <span className="font-medium tabular-nums">{formatPrice(price.amount)}</span>
            <span className="text-muted-foreground"> в месяц · без автопродления, продление — одной оплатой</span>
          </p>
        )}
      </CardContent>
      {action && (
        <CardFooter className="flex-wrap gap-2">
          <Button onClick={action.run} disabled={action.pending} variant={state === 'custom' ? 'outline' : 'default'}>
            {action.pending ? <Spinner /> : state !== 'custom' && <Sparkles />}
            {action.label}
          </Button>
          {state === 'free' && sub.trialAvailable && billing?.enabled && (
            <Button variant="ghost" onClick={() => show(undefined, 'pro')}>
              Оплатить сразу
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ usage of the limits

function UsageCard({ sub }: { sub: Subscription }) {
  const usage = useUsage();
  const { limits } = sub;
  const show = useUpgrade((s) => s.show);
  const free = sub.tier === 'free';

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Использование</CardTitle>
        <CardDescription>Лимиты тарифа «{sub.name}»</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <UsageRow
          icon={LayoutGrid}
          label="Сохранённые схемы"
          used={usage?.plans}
          limit={limits.plans}
          value={(n) => (limits.plans === null ? plural(n, ['схема', 'схемы', 'схем']) : `${n} из ${limits.plans}`)}
          note={limits.plans === null ? 'без ограничений' : undefined}
        />
        <UsageRow
          icon={Truck}
          label="Машин в схеме"
          used={usage?.maxVehicles}
          limit={limits.vehicles}
          value={() => `до ${limits.vehicles}`}
          note={usage && usage.plans > 0 ? `в самой большой схеме — ${usage.maxVehicles}` : undefined}
        />
        <UsageRow
          icon={Package}
          label="Грузов в схеме"
          used={usage?.maxItems}
          limit={limits.items}
          value={() => `до ${limits.items.toLocaleString('ru-RU')}`}
          note={usage && usage.plans > 0 ? `в самой большой схеме — ${usage.maxItems.toLocaleString('ru-RU')}` : undefined}
        />
        <div className="grid gap-2.5 border-t pt-4">
          <FeatureRow icon={WandSparkles} label="Автозагрузка" on={limits.autoload} />
          <FeatureRow icon={FileText} label="Пошаговая PDF-инструкция" on={limits.pdfSteps} />
        </div>
        {usage && usage.overLimit > 0 && <OverLimitNote usage={usage} tierName={sub.name} />}
        {free && (
          <button
            type="button"
            onClick={() => show('Снимите ограничения тарифа «Старт»: безлимит схем, до 10 машин и 5000 грузов в схеме.')}
            className="-mt-1 self-start text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            Снять ограничения
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function UsageRow({
  icon: Icon,
  label,
  used,
  limit,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  /** undefined while loading. */
  used: number | undefined;
  /** null — unlimited (no bar). */
  limit: number | null;
  value(used: number): string;
  note?: string;
}) {
  const share = used === undefined || limit === null ? null : Math.min(100, (100 * used) / limit);
  // One vehicle out of one is the normal case of «Старт», not a warning.
  const full = share !== null && share >= 100 && limit !== null && limit > 1;
  return (
    <div>
      <div className="flex items-center gap-2.5 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">{label}</span>
        {used === undefined ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          <span className={cn('font-medium tabular-nums', full && 'text-warning')}>{value(used)}</span>
        )}
      </div>
      {share !== null && limit !== null && limit > 1 && (
        <Progress value={share} className={cn('mt-2 ml-6.5 w-auto', full && '[&>[data-slot=progress-indicator]]:bg-warning')} />
      )}
      {note && <p className="mt-1 ml-6.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function FeatureRow({ icon: Icon, label, on }: { icon: LucideIcon; label: string; on: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 text-sm', !on && 'text-muted-foreground')}>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">{label}</span>
      {on ? (
        <Check className="size-4 text-success" aria-label="Входит в тариф" />
      ) : (
        <span className="inline-flex items-center gap-1 text-xs">
          <Lock className="size-3" /> на «Pro»
        </span>
      )}
    </div>
  );
}

function OverLimitNote({ usage, tierName }: { usage: Usage; tierName: string }) {
  const n = usage.overLimit;
  const one = n % 10 === 1 && n % 100 !== 11;
  return (
    <p className="flex gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-pretty">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        {plural(n, ['схема больше', 'схемы больше', 'схем больше'])} лимитов «{tierName}»:{' '}
        {one ? 'её можно открывать и править, но машины и грузы в неё не добавить.' : 'их можно открывать и править, но машины и грузы в них не добавить.'}
      </span>
    </p>
  );
}

// ------------------------------------------------------------------ the tiers side by side

function TierPlans({ sub }: { sub: Subscription }) {
  const [period, setPeriod] = useState<BillingPeriod>('year');
  return (
    <section className="mt-14" aria-labelledby="tiers-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="tiers-title" className="font-display text-xl font-medium tracking-[-0.015em]">
            Тарифы
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Переходите на «Pro», когда схем станет больше, — схемы и настройки сохранятся.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => v && setPeriod(v as BillingPeriod)}
          className="rounded-full bg-muted p-1"
          aria-label="Период оплаты"
        >
          <ToggleGroupItem value="month" className="h-8 rounded-full px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm">
            Помесячно
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className="h-8 rounded-full px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm">
            За год −20%
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mt-6 grid items-stretch gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} sub={sub} period={period} />
        ))}
      </div>
    </section>
  );
}

function TierCard({ tier, sub, period }: { tier: TierInfo; sub: Subscription; period: BillingPeriod }) {
  const current = sub.tier === tier.id;
  const price = tier.price && (period === 'year' ? tier.price.yearly : tier.price.monthly);
  const pro = !!tier.highlighted;
  return (
    <Card
      className={cn(
        'gap-0 p-6',
        pro && 'ring-2 ring-primary/60 dark:ring-primary/70',
        current && !pro && 'ring-2 ring-foreground/20',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{tier.name}</h3>
        {current ? (
          <Badge variant="secondary">Ваш тариф</Badge>
        ) : (
          pro && <Badge className="bg-primary/10 text-primary dark:bg-primary/20">Выбор логистов</Badge>
        )}
      </div>
      <p className="mt-1.5 min-h-10 text-sm text-pretty text-muted-foreground">{tier.tagline}</p>
      <div className="mt-5 flex items-baseline gap-1.5">
        {price === null ? (
          <span className="text-2xl font-semibold tracking-[-0.03em]">По договору</span>
        ) : price === 0 ? (
          <span className="text-2xl font-semibold tracking-[-0.03em]">Бесплатно</span>
        ) : (
          <>
            <span className="text-[2rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">{formatPrice(price)}</span>
            <span className="text-sm text-muted-foreground">в месяц</span>
          </>
        )}
      </div>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground">
        {tier.price && tier.price.monthly > 0 && (period === 'year' ? `${formatPrice(tier.price.yearly * 12)} при оплате за год` : 'при оплате помесячно')}
        {tier.price?.monthly === 0 && 'навсегда, без карты'}
        {tier.price === null && 'лимиты, срок и цена — под ваши объёмы'}
      </p>
      <div className="mt-5">
        <TierAction tier={tier.id} sub={sub} period={period} />
      </div>
      <ul className="mt-6 space-y-2.5 border-t pt-5 text-sm">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className={cn('mt-0.5 size-4 shrink-0', pro ? 'text-primary' : 'text-muted-foreground')} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The button of a tier card: what moving to that tier means from the current subscription. */
function TierAction({ tier, sub, period }: { tier: TierId; sub: Subscription; period: BillingPeriod }) {
  const show = useUpgrade((s) => s.show);
  const billing = useBilling();
  const pay = usePay();
  const trial = useStartTrial();
  const state = subscriptionState(sub);
  const wide = 'h-10 w-full rounded-full';

  if (tier === 'free') {
    return sub.tier === 'free' ? (
      <Button variant="outline" className={wide} disabled>
        Ваш тариф
      </Button>
    ) : (
      <p className="grid h-10 place-items-center text-center text-xs text-balance text-muted-foreground">
        На него аккаунт переходит, когда платный период закончится
      </p>
    );
  }
  if (tier === 'custom') {
    return (
      <Button variant="outline" className={wide} onClick={() => show(undefined, 'custom')}>
        {sub.tier === 'custom' ? 'Связаться по договору' : 'Обсудить условия'}
      </Button>
    );
  }
  // «Pro».
  if (state === 'custom') {
    return (
      <Button variant="outline" className={wide} disabled>
        Входит в ваш тариф
      </Button>
    );
  }
  if (state === 'free' && sub.trialAvailable) {
    return (
      <Button className={wide} onClick={() => trial.mutate()} disabled={trial.isPending}>
        {trial.isPending && <Spinner />}
        {TRIAL_DAYS} дней бесплатно
      </Button>
    );
  }
  const charged = billing?.enabled ? priceOf(billing, period) : undefined;
  if (!charged) {
    // No online payment here: a request to connect or renew.
    return (
      <Button className={wide} onClick={() => (state === 'free' || state === 'expired' ? show() : show(undefined, 'pro'))}>
        {state === 'active' || state === 'ending' || state === 'expired' ? 'Продлить' : 'Подключить «Pro»'}
      </Button>
    );
  }
  const busy = pay.isPending || pay.isSuccess;
  return (
    <div className="grid gap-1.5">
      <Button className={wide} onClick={() => pay.mutate(period)} disabled={busy}>
        {busy && <Spinner />}
        {state === 'active' || state === 'ending' || state === 'expired' ? 'Продлить' : 'Оплатить'} {formatPrice(charged.amount)} {PERIOD_LABEL[period]}
      </Button>
      {sub.tier === 'pro' && sub.expiresAt && (
        <p className="text-center text-xs text-muted-foreground">Добавится к периоду до {longDate(sub.expiresAt)}</p>
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
    <section className="mt-14" aria-labelledby="payments-title">
      <h2 id="payments-title" className="font-display text-xl font-medium tracking-[-0.015em]">
        История оплат
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Онлайн-оплаты «Pro»: после каждой на почту приходит письмо с суммой и сроком.</p>
      <Card className="mt-5 py-0">
        {payments.isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : payments.isError ? (
          <p className="p-4 text-sm text-destructive">{errorMessage(payments.error)}</p>
        ) : shown.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <Receipt className="size-4" /> Оплат пока не было.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Дата</th>
                  <th className="px-4 py-2.5 font-medium">Тариф</th>
                  <th className="px-4 py-2.5 text-right font-medium">Сумма</th>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                  <th className="px-4 py-2.5 font-medium">Оплачено до</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">{shortDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="px-4 py-3">
                      «{tierInfo(p.tier as TierId).name}» {PERIOD_LABEL[p.period]}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">{formatPrice(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', PAYMENT_STATUS[p.status].tone)}>
                        {PAYMENT_STATUS[p.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {p.paidUntil ? shortDate(p.paidUntil) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ questions

function BillingQuestions({ sub }: { sub: Subscription }) {
  const online = !!useBilling()?.enabled;
  const show = useUpgrade((s) => s.show);
  const items: Array<{ q: string; a: ReactNode }> = [
    online
      ? {
          q: 'Есть автоматические списания?',
          a: 'Нет. Оплата разовая — на месяц или на год, продление — новой оплатой, когда удобно: период добавится к текущему. За 3 дня до конца пришлём письмо.',
        }
      : {
          q: 'Как подключить «Pro»?',
          a: 'Оставьте заявку — свяжемся, подключим тариф и ответим на вопросы. За 3 дня до конца срока пришлём письмо.',
        },
    {
      q: 'Что будет, когда «Pro» закончится?',
      a: 'Аккаунт перейдёт на «Старт». Все схемы сохранятся и будут открываться, но в большие схемы нельзя будет добавить машины и грузы, а новые схемы — сверх лимита «Старт».',
    },
    {
      q: 'Нужен договор и оплата по счёту?',
      a: (
        <>
          Для компаний — тариф «Индивидуальный»: договор, счёт, лимиты и интеграция с 1С.{' '}
          {sub.tier !== 'custom' && (
            <button
              type="button"
              onClick={() => show(undefined, 'custom')}
              className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 outline-none hover:decoration-foreground focus-visible:decoration-foreground"
            >
              Обсудить условия
            </button>
          )}
        </>
      ),
    },
  ];
  return (
    <section className="mt-14 grid gap-6 border-t pt-10 md:grid-cols-3" aria-label="Вопросы об оплате">
      {items.map(({ q, a }) => (
        <div key={q}>
          <h3 className="text-sm font-medium">{q}</h3>
          <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{a}</p>
        </div>
      ))}
    </section>
  );
}
