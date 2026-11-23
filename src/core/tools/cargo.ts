import type { Dims } from '../types';
import { bestFit, type FloorFit } from './floorFit';

/**
 * Volume and weight of a list of cargo places, which vehicles take it by the numbers, and boxes on a
 * pallet. Lengths in cm, volumes in cm³ (the pages show m³), weights in kg.
 */

export interface CargoPlace {
  dims: Dims;
  count: number;
  /** Weight of one place, kg (optional). */
  weight?: number;
}

export interface CargoTotals {
  places: number;
  /** cm³ */
  volume: number;
  /** kg */
  weight: number;
  /** The longest side of any place, cm: it must fit somewhere in the body. */
  longest: number;
}

export function cargoTotals(places: readonly CargoPlace[]): CargoTotals {
  let count = 0;
  let volume = 0;
  let weight = 0;
  let longest = 0;
  for (const p of places) {
    const n = Math.floor(p.count);
    if (!(n > 0) || !(p.dims.l > 0 && p.dims.w > 0 && p.dims.h > 0)) continue;
    count += n;
    volume += p.dims.l * p.dims.w * p.dims.h * n;
    weight += p.weight && p.weight > 0 ? p.weight * n : 0;
    longest = Math.max(longest, p.dims.l, p.dims.w, p.dims.h);
  }
  return { places: count, volume, weight, longest };
}

/**
 * How much the volume of a body can really take: boxes never fill every corner. The share of the volume a
 * calculator treats as usable for mixed cargo — a rule of thumb, the 3D layout gives the real answer.
 */
export const USABLE_VOLUME = 0.85;

export interface BodyCheck {
  /** cm³ */
  capacity: number;
  /** Cargo volume / body volume. */
  volumeShare: number;
  /** Cargo weight / payload (null: no weight or payload). */
  weightShare: number | null;
  /** Within the usable volume and the payload, and the longest place fits the body's longest side. */
  fits: boolean;
}

export function bodyCheck(totals: CargoTotals, body: Dims & { maxLoad?: number }): BodyCheck {
  const capacity = body.l * body.w * body.h;
  const volumeShare = capacity > 0 ? totals.volume / capacity : Infinity;
  const weightShare = totals.weight > 0 && body.maxLoad && body.maxLoad > 0 ? totals.weight / body.maxLoad : null;
  const fits =
    totals.places > 0 &&
    volumeShare <= USABLE_VOLUME + 1e-9 &&
    (weightShare === null || weightShare <= 1 + 1e-9) &&
    totals.longest <= Math.max(body.l, body.w, body.h);
  return { capacity, volumeShare, weightShare, fits };
}

export interface BoxPalletSpec {
  /** Deck of the pallet, cm. */
  pallet: { l: number; w: number };
  /** Height of the pallet itself, cm (a europallet is 14,4). */
  palletHeight: number;
  /** Highest the loaded pallet may be, cm, pallet included. */
  maxHeight: number;
  /** Highest gross weight of the loaded pallet, kg (0: not checked). */
  maxWeight?: number;
  palletWeight?: number;
  box: Dims;
  boxWeight?: number;
}

export interface BoxPallet {
  layer: FloorFit;
  perLayer: number;
  layers: number;
  /** Boxes by space: per layer × layers. */
  bySpace: number;
  /** Boxes the weight limit allows (null: not checked). */
  byWeight: number | null;
  total: number;
  /** Height of the loaded pallet, cm. */
  height: number;
  /** Gross weight of the loaded pallet, kg. */
  weight: number;
}

/** Boxes upright on a pallet, without overhang: the best layer, as many layers as the height allows. */
export function boxesOnPallet(spec: BoxPalletSpec): BoxPallet {
  const layer = bestFit(spec.pallet, { l: spec.box.l, w: spec.box.w });
  const room = spec.maxHeight - spec.palletHeight;
  const layers = layer.count > 0 && spec.box.h > 0 && room >= spec.box.h ? Math.floor((room + 1e-9) / spec.box.h) : 0;
  const bySpace = layer.count * layers;
  const boxWeight = spec.boxWeight && spec.boxWeight > 0 ? spec.boxWeight : 0;
  const palletWeight = spec.palletWeight && spec.palletWeight > 0 ? spec.palletWeight : 0;
  const byWeight =
    boxWeight > 0 && spec.maxWeight && spec.maxWeight > 0 ? Math.max(0, Math.floor((spec.maxWeight - palletWeight) / boxWeight + 1e-9)) : null;
  const total = byWeight === null ? bySpace : Math.min(bySpace, byWeight);
  const fullLayers = layer.count > 0 ? Math.ceil(total / layer.count) : 0;
  return {
    layer,
    perLayer: layer.count,
    layers,
    bySpace,
    byWeight,
    total,
    height: total > 0 ? spec.palletHeight + fullLayers * spec.box.h : spec.palletHeight,
    weight: palletWeight + total * boxWeight,
  };
}
