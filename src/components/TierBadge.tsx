import { Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { Subscription, TierId } from '@/api/types';
import { Button } from '@/components/ui/button';
import { daysLeft, daysLeftText, subscriptionState, subscriptionSummary, tierInfo } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

/** Colours of the tiers in the app (theme tokens; «Индивидуальный» — amber, readable in both themes). */
export const TIER_TONE: Record<TierId, string> = {
  free: 'bg-muted text-muted-foreground',
  pro: 'bg-primary/10 text-primary dark:bg-primary/20',
  custom: 'bg-amber-500/12 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
};

/** «Старт», «Pro», «Индивидуальный» as a small pill. */
export function TierBadge({ tier, className }: { tier: TierId; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium', TIER_TONE[tier], className)}>
      {tierInfo(tier).name}
    </span>
  );
}

/** «Пробный период», «Закончился»… next to the tier name; null when there is nothing to add. */
export function SubscriptionStateBadge({ sub, className }: { sub: Subscription; className?: string }) {
  const state = subscriptionState(sub);
  const label =
    state === 'trial'
      ? 'Пробный период'
      : state === 'expired'
        ? `«${tierInfo(sub.expiredTier ?? 'pro').name}» закончился`
        : state === 'ending'
          ? 'Скоро закончится'
          : state === 'active' || state === 'custom'
            ? 'Активен'
            : null;
  if (!label) return null;
  const tone =
    state === 'expired' || state === 'ending'
      ? 'bg-warning/12 text-warning'
      : state === 'trial'
        ? 'bg-primary/10 text-primary dark:bg-primary/20'
        : 'bg-success/10 text-success';
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium', tone, className)}>
      {label}
    </span>
  );
}

/**
 * The tier in the header of the app pages, a link to «Тариф и оплата». Paid tiers show as a badge
 * (with the days left of a trial or of a «Pro» that is ending); «Старт» as a quiet offer of «Pro».
 */
export function SubscriptionChip() {
  const sub = useAuth((s) => s.user?.subscription);
  if (!sub) return null;
  const state = subscriptionState(sub);
  const left = daysLeft(sub);

  if (state === 'free' || state === 'expired') {
    const label =
      state === 'expired' && sub.expiredTier === 'pro' ? 'Продлить Pro' : sub.trialAvailable && state === 'free' ? 'Попробовать Pro' : 'Перейти на Pro';
    return (
      <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3">
        <Link to="/billing" title={subscriptionSummary(sub)}>
          <Sparkles className="text-primary" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">Pro</span>
        </Link>
      </Button>
    );
  }

  const extra = state === 'trial' ? `пробный · ${daysLeftText(left ?? 0)}` : state === 'ending' ? daysLeftText(left ?? 0) : null;
  return (
    <Link
      to="/billing"
      title={subscriptionSummary(sub)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        state === 'ending' ? 'bg-warning/12 text-warning hover:bg-warning/18' : cn(TIER_TONE[sub.tier], 'hover:brightness-95 dark:hover:brightness-125'),
      )}
    >
      <Sparkles className="size-3.5" />
      {sub.name}
      {extra && <span className="hidden font-normal opacity-80 md:inline">· {extra}</span>}
    </Link>
  );
}
