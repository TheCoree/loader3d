import { useMemo } from 'react';
import { itemBox } from '../core/item';
import type { VehicleLayout } from '../core/layout';
import { classify, computeStats, type Placement, type PlanStats } from '../core/stats';
import { getLayout, useStore } from '../store/useStore';

export function useLayout(): VehicleLayout {
  const bodies = useStore((s) => s.bodies);
  return getLayout(bodies);
}

export function usePlacements(): Map<string, Placement> {
  const items = useStore((s) => s.items);
  const layout = useLayout();
  return useMemo(() => new Map(items.map((i) => [i.id, classify(itemBox(i), layout)])), [items, layout]);
}

export function useStats(): PlanStats {
  const items = useStore((s) => s.items);
  const layout = useLayout();
  return useMemo(() => computeStats(items, layout), [items, layout]);
}

export function useUnits() {
  return useStore((s) => s.settings.units);
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
