import type { Box, CargoItem, Dims } from './types';
import { boxAt } from './geometry';
import { effectiveDims } from './orientation';

export const MIN_ITEM_SIZE = 5;
export const MAX_ITEM_SIZE = 3000;

/** Weight in kg; items without a weight count as 0. */
export function itemWeight(item: CargoItem): number {
  return item.weight ?? 0;
}

export function itemSize(item: CargoItem): Dims {
  return effectiveDims(item.dims, item.orientation);
}

export function itemBox(item: CargoItem): Box {
  return boxAt(item.pos, itemSize(item));
}

export function clampItemDim(v: number): number {
  return Math.min(MAX_ITEM_SIZE, Math.max(MIN_ITEM_SIZE, Math.round(v * 10) / 10));
}

export function sanitizeItemDims(d: Dims): Dims {
  return { l: clampItemDim(d.l), w: clampItemDim(d.w), h: clampItemDim(d.h) };
}

let counter = 0;

export function uid(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  counter += 1;
  return `${prefix}-${counter.toString(36)}${random}`;
}
