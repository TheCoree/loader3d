import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { billingApi, userApi } from '@/api/endpoints';
import type { BillingInfo, BillingPeriod, Price, Usage } from '@/api/types';
import { TIERS_ENABLED, TRIAL_DAYS } from '@/lib/tiers';
import { useAuth } from '@/store/useAuth';

/**
 * Online payment of «Pro» (backend/app/billing.py). `enabled` is false without TIERS_ENABLED or a
 * PAYMENT_PROVIDER on the server: then paid tiers are connected by a request (LeadForm) and an admin.
 */
export function useBilling(): BillingInfo | undefined {
  const query = useQuery({
    queryKey: ['billing'],
    queryFn: billingApi.info,
    enabled: TIERS_ENABLED,
    staleTime: 5 * 60_000,
  });
  return query.data;
}

export function priceOf(info: BillingInfo | undefined, period: BillingPeriod): Price | undefined {
  return info?.prices.find((p) => p.period === period);
}

/**
 * Starts a payment and leaves for the provider's page; the customer comes back to /billing?payment=…
 * «Back» from that page may restore this one as it was left (the back/forward cache), with the buttons
 * still waiting for the departure: the mutation is reset then.
 */
export function usePay() {
  const mutation = useMutation({
    mutationFn: billingApi.checkout,
    onSuccess: ({ paymentUrl }) => window.location.assign(paymentUrl),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const { reset } = mutation;
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [reset]);
  return mutation;
}

export const PERIOD_LABEL: Record<BillingPeriod, string> = { month: 'на месяц', year: 'на год' };

/**
 * How much of the tier's limits the account uses (GET /api/users/me/usage); undefined while it loads and
 * with tiers off. Under ['plans'], so creating or deleting a plan refreshes it; the tier is part of the key.
 */
export function useUsage(): Usage | undefined {
  const sub = useAuth((s) => s.user?.subscription);
  const query = useQuery({
    queryKey: ['plans', 'usage', sub?.tier, sub?.expiresAt],
    queryFn: userApi.usage,
    enabled: !!sub,
  });
  return query.data;
}

/** The free trial of «Pro» (once per account): the account updates at once. */
export function useStartTrial() {
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: userApi.startTrial,
    onSuccess: (user) => {
      setUser(user);
      toast.success(`«Pro» подключён на ${TRIAL_DAYS} дней`, { description: 'Без оплаты и без карты — все возможности «Pro» уже работают' });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
