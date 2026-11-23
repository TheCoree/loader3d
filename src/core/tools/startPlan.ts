import { BODY_LIMITS, BODY_MAX_LOAD_LIMIT, CARGO_COLORS, ITEM_WEIGHT_LIMIT } from '../presets';
import type { BodyKind, CargoItem, Dims, Plan, Vehicle } from '../types';
import { itemBox, itemSize, sanitizeItemDims, uid } from '../item';
import { computeLayout } from '../layout';
import { settle } from '../physics';
import { defaultVehicleName } from '../plan';
import { dockSpot } from '../spawn';
import { bestFit, tiersUnder } from './floorFit';

/**
 * «Попробовать в 3D» on a calculator page: what was calculated travels through the registration as a short
 * text (`/start?d=…`) and becomes the first plan — the same body, and the same pallets standing as the
 * calculator drew them (or on the dock). Pure: the page encodes, the /start route decodes and saves.
 * Lengths in cm, weights in kg.
 */

export interface StartCargo {
  name: string;
  dims: Dims;
  weight?: number;
  count: number;
  /**
   * Stand in the body as the pallet calculator lays them out (core/tools/floorFit bestFit with this gap, in
   * tiers when stackable); what does not fit goes to the dock. Missing: on the dock. Only the first group.
   */
  lay?: { gap: number; stackable: boolean };
}

export interface StartSpec {
  /** Name of the new plan. */
  name: string;
  body: { name: string; kind: BodyKind; dims: Dims; maxLoad?: number };
  cargo: StartCargo[];
}

/** At most this many groups and pieces travel: a start is a first plan, not the whole warehouse. */
export const START_MAX_GROUPS = 20;
export const START_MAX_ITEMS = 500;
const NAME_LENGTH = 100;

const round = (n: number) => Math.round(n * 10) / 10;

/** The compact text of a start: short keys, numbers only where possible. */
export function encodeStart(spec: StartSpec): string {
  return JSON.stringify({
    v: 1,
    n: spec.name,
    b: [spec.body.name, spec.body.kind, round(spec.body.dims.l), round(spec.body.dims.w), round(spec.body.dims.h), spec.body.maxLoad ?? 0],
    c: spec.cargo.map((c) => [
      c.name,
      round(c.dims.l),
      round(c.dims.w),
      round(c.dims.h),
      round(c.weight ?? 0),
      Math.round(c.count),
      ...(c.lay ? [round(c.lay.gap), c.lay.stackable ? 1 : 0] : []),
    ]),
  });
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, NAME_LENGTH) : fallback;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Reads a start from the address; null when it is not one. Values are brought within the editor's limits. */
export function decodeStart(raw: string | null | undefined): StartSpec | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const d = data as { v?: unknown; n?: unknown; b?: unknown; c?: unknown };
  if (!d || d.v !== 1 || !Array.isArray(d.b) || !Array.isArray(d.c)) return null;
  const [bName, bKind, l, w, h, maxLoad] = d.b as unknown[];
  const dims = [l, w, h].map(finite);
  if (dims.some((x) => x === null || x <= 0)) return null;
  const load = finite(maxLoad) ?? 0;
  const body: StartSpec['body'] = {
    name: text(bName, 'Кузов'),
    kind: bKind === 'truck' || bKind === 'trailer' ? bKind : 'semi',
    dims: {
      l: round(clamp(dims[0]!, ...BODY_LIMITS.l)),
      w: round(clamp(dims[1]!, ...BODY_LIMITS.w)),
      h: round(clamp(dims[2]!, ...BODY_LIMITS.h)),
    },
    ...(load > 0 ? { maxLoad: round(Math.min(load, BODY_MAX_LOAD_LIMIT)) } : {}),
  };
  const cargo: StartCargo[] = [];
  let total = 0;
  for (const entry of (d.c as unknown[]).slice(0, START_MAX_GROUPS)) {
    if (!Array.isArray(entry)) return null;
    const [name, cl, cw, ch, weight, count, gap, stackable] = entry as unknown[];
    const size = [cl, cw, ch].map(finite);
    const n = finite(count);
    if (size.some((x) => x === null || x <= 0) || n === null) return null;
    const pieces = Math.min(Math.floor(n), START_MAX_ITEMS - total);
    if (pieces <= 0) continue;
    total += pieces;
    const kg = finite(weight) ?? 0;
    const g = finite(gap);
    cargo.push({
      name: text(name, 'Груз'),
      dims: sanitizeItemDims({ l: size[0]!, w: size[1]!, h: size[2]! }),
      ...(kg > 0 ? { weight: round(Math.min(kg, ITEM_WEIGHT_LIMIT)) } : {}),
      count: pieces,
      ...(g !== null && cargo.length === 0 ? { lay: { gap: clamp(g, 0, 50), stackable: stackable === 1 } } : {}),
    });
  }
  return { name: text(d.n, 'Схема из калькулятора'), body, cargo };
}

export interface StartPlan {
  plan: Plan;
  /** Pieces left out by the tier's limit of cargo in one plan. */
  dropped: number;
}

/** The plan of a start: one vehicle, the first group laid out in the body, the rest on the dock; ends with settle(). */
export function buildStartPlan(spec: StartSpec, maxItems = START_MAX_ITEMS): StartPlan {
  const vehicle: Vehicle = {
    id: uid('veh'),
    name: defaultVehicleName(0),
    bodies: [
      {
        id: uid('body'),
        kind: spec.body.kind,
        name: spec.body.name,
        dims: { ...spec.body.dims },
        ...(spec.body.maxLoad ? { maxLoad: spec.body.maxLoad } : {}),
      },
    ],
  };
  const layout = computeLayout([vehicle], 'shared');
  const deck = layout.bodies[0].box;
  const items: CargoItem[] = [];
  const wanted = spec.cargo.reduce((s, c) => s + c.count, 0);
  let room = Math.max(0, Math.min(maxItems, START_MAX_ITEMS));
  let seq = 1;

  spec.cargo.forEach((group, index) => {
    const count = Math.min(group.count, room);
    room -= count;
    const base = {
      name: group.name,
      dims: { ...group.dims },
      color: CARGO_COLORS[index % CARGO_COLORS.length],
      ...(group.weight ? { weight: group.weight } : {}),
    };
    // The calculator's layout: tier after tier over the same floor spots.
    const fit = index === 0 && group.lay ? bestFit(spec.body.dims, group.dims, group.lay.gap) : null;
    const tiers = fit ? tiersUnder(spec.body.dims.h, group.dims.h, group.lay!.stackable) : 0;
    for (let n = 0; n < count; n++) {
      const item: CargoItem = { ...base, id: uid('cargo'), seq: seq++, orientation: { yaw: 0 }, pos: { x: 0, y: 0, z: 0 } };
      const tier = fit && fit.count > 0 ? Math.floor(n / fit.count) : Infinity;
      if (fit && tier < tiers) {
        const spot = fit.spots[n % fit.count];
        const placed: CargoItem = {
          ...item,
          orientation: { yaw: spot.turned ? 90 : 0 },
          pos: { x: deck.max.x - spot.x - spot.l, y: deck.min.y + tier * group.dims.h, z: deck.min.z + spot.z },
        };
        items.push(placed);
      } else {
        const spot = dockSpot(itemSize(item), layout, vehicle.id, items.map(itemBox));
        items.push({ ...item, pos: { x: spot.x, y: 0, z: spot.z } });
      }
    }
  });

  return {
    plan: { vehicles: [vehicle], dockMode: 'shared', items: settle(items), nextSeq: seq },
    dropped: wanted - items.length,
  };
}
