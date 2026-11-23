import type { Dims } from '../types';
import { type FloorFit, bestFit, fitOptions, tiersUnder } from './floorFit';

/**
 * «How many pallets fit in this vehicle»: the floor layout (floorFit.ts), tiers under the roof and the
 * payload. Lengths in cm, weights in kg.
 */

export interface PalletSpec {
  /** Footprint and height with the load. */
  dims: Dims;
  /** Gross weight of one pallet, kg; 0 or missing — not checked. */
  weight?: number;
  /** May another pallet stand on it. */
  stackable: boolean;
}

export interface PalletLoad {
  /** The best layout and the plain alternatives (see fitOptions). */
  options: FloorFit[];
  best: FloorFit;
  /** Pallets on the floor (one tier). */
  floorPlaces: number;
  tiers: number;
  /** Pallets by space: floor places × tiers. */
  bySpace: number;
  /** Pallets the payload carries (null: no weight or no payload given). */
  byWeight: number | null;
  /** What can really go: the smaller of the two. */
  total: number;
  /** Weight of `total` pallets, kg. */
  weight: number;
  /** Loading metres of the floor layout: the length taken from the front wall, m. */
  ldm: number;
  /** Share of the body volume the pallets take (0..1). */
  volumeFill: number;
}

/** The standard pallets as the calculators offer them (the same sizes as the editor's typical cargo). */
export const PALLETS = {
  eur: { name: 'Европаллета', short: 'EUR', l: 120, w: 80 },
  fin: { name: 'Финпаллета', short: 'FIN', l: 120, w: 100 },
  half: { name: 'Полупаллета', short: '½ EUR', l: 80, w: 60 },
} as const;

export type PalletKind = keyof typeof PALLETS;

export function palletLoad(body: Dims & { maxLoad?: number }, pallet: PalletSpec, gap = 0): PalletLoad {
  const floor = { l: body.l, w: body.w };
  const piece = { l: pallet.dims.l, w: pallet.dims.w };
  const options = fitOptions(floor, piece, gap);
  const best = options[0] ?? bestFit(floor, piece, gap);
  const tiers = best.count > 0 ? tiersUnder(body.h, pallet.dims.h, pallet.stackable) : 0;
  const bySpace = best.count * tiers;
  const weight = pallet.weight && pallet.weight > 0 ? pallet.weight : 0;
  const byWeight = weight > 0 && body.maxLoad && body.maxLoad > 0 ? Math.floor(body.maxLoad / weight + 1e-9) : null;
  const total = byWeight === null ? bySpace : Math.min(bySpace, byWeight);
  const capacity = body.l * body.w * body.h;
  return {
    options,
    best,
    floorPlaces: best.count,
    tiers,
    bySpace,
    byWeight,
    total,
    weight: total * weight,
    ldm: best.usedLength / 100,
    volumeFill: capacity > 0 ? (total * pallet.dims.l * pallet.dims.w * pallet.dims.h) / capacity : 0,
  };
}

/** Floor places for a standard pallet on a deck — for the reference tables of the calculators. */
export function floorPlaces(deck: { l: number; w: number }, kind: PalletKind, gap = 0): number {
  return bestFit(deck, PALLETS[kind], gap).count;
}
