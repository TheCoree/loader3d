import type { Subscription, TierId } from '@/api/types';
import { plural } from '@/lib/format';

/**
 * TIERS_ENABLED in .env. Off (the default): the site and the app say nothing about tariffs and nothing is
 * limited; the API agrees (it reads the same variable and sends `subscription: null`).
 */
export const TIERS_ENABLED: boolean = __TIERS_ENABLED__;

/**
 * Tiers as the landing page, the registration and the account page show them. The limits the API
 * enforces live in backend/app/tiers.py — `limits` here repeats them for the pricing table, keep the
 * two in sync. Prices are in roubles per month; what is charged online is backend/app/billing.py PRICES
 * (a month = price.monthly, a year = price.yearly × 12): change both. Payment itself — src/lib/billing.ts.
 */
export interface TierInfo {
  id: TierId;
  name: string;
  /** Who it is for, one line. */
  tagline: string;
  /** ₽ per month, billed monthly / yearly; null — by contract. */
  price: { monthly: number; yearly: number } | null;
  limits: { plans: number | null; vehicles: number; items: number };
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const TRIAL_DAYS = 14;

export const TIERS: readonly TierInfo[] = [
  {
    id: 'free',
    name: 'Старт',
    tagline: 'Попробовать планировщик и считать редкие рейсы',
    price: { monthly: 0, yearly: 0 },
    limits: { plans: 3, vehicles: 1, items: 100 },
    features: [
      '3 сохранённые схемы',
      '1 машина в схеме, до 100 грузов',
      'Раскладка мышью и пальцем: гравитация, магниты, кантование',
      'LDM, заполнение, вес и центр тяжести',
      'PDF-план загрузки для водителя и склада',
    ],
    cta: 'Начать бесплатно',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Для логистов и складов, которые грузят каждый день',
    price: { monthly: 1990, yearly: 1590 },
    limits: { plans: null, vehicles: 10, items: 5000 },
    features: [
      'Безлимит схем',
      'До 10 машин и сцепок в одной схеме',
      'До 5000 грузов в схеме',
      'Автозагрузка с развесовкой и контролем грузоподъёмности',
      'Пошаговая PDF-инструкция погрузки',
      'Всё из тарифа «Старт»',
    ],
    cta: `${TRIAL_DAYS} дней бесплатно`,
    highlighted: true,
  },
  {
    id: 'custom',
    name: 'Индивидуальный',
    tagline: 'Для компаний и особых задач — условия по договору',
    price: null,
    limits: { plans: null, vehicles: 10, items: 5000 },
    features: [
      'Всё из тарифа «Pro»',
      'Интеграция с 1С: товары с габаритами и весом — сразу в схему',
      'Лимиты, срок и стоимость — под ваши объёмы',
      'Работа по договору, оплата по счёту',
      'Помощь с внедрением: транспорт, типовые грузы, обучение',
      'Персональный контакт для вопросов',
    ],
    cta: 'Обсудить условия',
  },
];

export function tierInfo(id: TierId): TierInfo {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}

export function formatPrice(rub: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(rub)} ₽`;
}

/** «12 декабря 2026». */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «Pro до 12 ноября», «Пробный период до…», «Без срока». */
export function subscriptionSummary(sub: Subscription): string {
  if (sub.tier === 'free') return sub.expiredTier ? `Тариф «${tierInfo(sub.expiredTier).name}» закончился` : 'Бесплатный тариф';
  if (!sub.expiresAt) return 'Без ограничения по сроку';
  const date = longDate(sub.expiresAt);
  return sub.trial ? `Пробный период до ${date}` : `Действует до ${date}`;
}

/**
 * Where the subscription stands, for the badges and notices of the app: «Старт» (`free`), a paid tier
 * that has ended (`expired`), the trial of «Pro», «Pro» (`active`, or `ending` within ENDING_DAYS),
 * «Индивидуальный» (`custom`).
 */
export type SubscriptionState = 'free' | 'expired' | 'trial' | 'active' | 'ending' | 'custom';

/** «Pro» ends within this many days: the header and the plans page remind about renewal. */
export const ENDING_DAYS = 7;

const DAY = 86_400_000;

/** Days until the subscription ends, counting the current one (1 — the last day); null — no end date. */
export function daysLeft(sub: Subscription, now = Date.now()): number | null {
  if (!sub.expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - now) / DAY));
}

export function subscriptionState(sub: Subscription, now = Date.now()): SubscriptionState {
  if (sub.tier === 'free') return sub.expiredTier ? 'expired' : 'free';
  if (sub.tier === 'custom') return 'custom';
  if (sub.trial) return 'trial';
  const left = daysLeft(sub, now);
  return left !== null && left <= ENDING_DAYS ? 'ending' : 'active';
}

/** «осталось 3 дня», «последний день». */
export function daysLeftText(days: number): string {
  if (days <= 1) return 'последний день';
  return `${days % 10 === 1 && days % 100 !== 11 ? 'остался' : 'осталось'} ${plural(days, ['день', 'дня', 'дней'])}`;
}

/** What the account's tier allows, line by line (the account and the tariff pages). */
export function limitSummary(sub: Subscription): string {
  const { plans, vehicles, items } = sub.limits;
  const plansText = plans === null ? 'Безлимит схем' : `До ${plural(plans, ['схемы', 'схем', 'схем'])}`;
  const vehiclesText = vehicles === 1 ? '1 машина' : `до ${plural(vehicles, ['машины', 'машин', 'машин'])}`;
  return `${plansText}, ${vehiclesText} и до ${plural(items, ['груза', 'грузов', 'грузов'])} в схеме`;
}

/** A row of the comparison of tiers on «Тариф и оплата»: text, or whether the tier has it. */
export interface ComparisonRow {
  label: string;
  values: Record<TierId, string | boolean>;
}

/** What each tier gives, row by row; the numbers come from TIERS[].limits. */
export function comparisonRows(): ComparisonRow[] {
  const each = (value: (limits: TierInfo['limits'], id: TierId) => string | boolean) =>
    Object.fromEntries(TIERS.map((t) => [t.id, value(t.limits, t.id)])) as Record<TierId, string | boolean>;
  const upTo = (n: number) => (n === 1 ? '1' : `до ${n.toLocaleString('ru-RU')}`);
  return [
    { label: 'Сохранённые схемы', values: each((l) => (l.plans === null ? 'Без лимита' : String(l.plans))) },
    { label: 'Машин в схеме', values: each((l) => upTo(l.vehicles)) },
    { label: 'Грузов в схеме', values: each((l) => upTo(l.items)) },
    { label: 'Раскладка в 3D, LDM, вес и центр тяжести', values: each(() => true) },
    { label: 'PDF-план загрузки', values: each(() => true) },
    { label: 'Автозагрузка с развесовкой', values: each((_, id) => id !== 'free') },
    { label: 'Пошаговая PDF-инструкция', values: each((_, id) => id !== 'free') },
    { label: 'Интеграция с 1С', values: each((_, id) => id === 'custom') },
    { label: 'Договор и оплата по счёту', values: each((_, id) => id === 'custom') },
    { label: 'Помощь с внедрением', values: each((_, id) => id === 'custom') },
  ];
}
