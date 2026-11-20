import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { billingApi } from '@/api/endpoints';
import type { BillingInfo, BillingPeriod, Price } from '@/api/types';
import { TIERS_ENABLED } from '@/lib/tiers';

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

/** Starts a payment and leaves for the provider's page; the customer comes back to /account?payment=… */
export function usePay() {
  return useMutation({
    mutationFn: billingApi.checkout,
    onSuccess: ({ paymentUrl }) => window.location.assign(paymentUrl),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export const PERIOD_LABEL: Record<BillingPeriod, string> = { month: 'на месяц', year: 'на год' };
