import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { planApi } from '../api/endpoints';
import type { PlanSort, PlanSummary } from '../api/types';
import type { Plan } from '../core/types';

export const PAGE_SIZE = 24;

export const planKeys = {
  all: ['plans'] as const,
  list: (q: string, sort: PlanSort) => ['plans', 'list', q, sort] as const,
};

/** The home page list: pages of PAGE_SIZE, "Показать ещё" loads the next one. */
export function usePlanList(q: string, sort: PlanSort) {
  return useInfiniteQuery({
    queryKey: planKeys.list(q, sort),
    queryFn: ({ pageParam, signal }) => planApi.list({ q, sort, limit: PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.limit : undefined),
    placeholderData: (previous) => previous,
  });
}

function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: planKeys.all });
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data?: Plan }) => planApi.create(name, data),
    onSuccess: invalidate,
  });
}

/** Rename from the list. A concurrent save only bumped the version: retry once with the current one. */
export function useRenamePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async ({ plan, name }: { plan: PlanSummary; name: string }) => {
      try {
        return await planApi.update(plan.id, { version: plan.version, name });
      } catch (error) {
        const current = error instanceof ApiError ? error.detail.currentVersion : undefined;
        if (typeof current !== 'number') throw error;
        return planApi.update(plan.id, { version: current, name });
      }
    },
    onSuccess: invalidate,
  });
}

export function useDuplicatePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({ mutationFn: (plan: PlanSummary) => planApi.duplicate(plan.id), onSuccess: invalidate });
}

export function useDeletePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({ mutationFn: (plan: PlanSummary) => planApi.remove(plan.id), onSuccess: invalidate });
}
