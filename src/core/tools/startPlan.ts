import { BODY_LIMITS, BODY_MAX_LOAD_LIMIT, CARGO_COLORS, ITEM_WEIGHT_LIMIT } from '../presets';
import type { BodyKind, CargoItem, ChassisPatch, Dims, Plan, Vehicle } from '../types';
import { cleanChassis } from '../chassis';
import { itemBox, itemSize, sanitizeItemDims, uid } from '../item';
import { computeLayout } from '../layout';
import { settle } from '../physics';
import { defaultVehicleName, relayout } from '../plan';
import { classify } from '../stats';
import { dockSpot } from '../spawn';
import { bestFit, tiersUnder } from './floorFit';

/**
 * «Попробовать в 3D» on a calculator page: what was calculated travels through the registration as a short
 * text (`/start?d=…`) and becomes the first plan — the same body, and the same pallets standing as the
 * calculator drew them (or on the dock), the axles of the calculator's vehicle. Pure: the page encodes, the /start
 * route decodes and saves. Lengths in cm, weights in kg.
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
  /**
   * Stand on the floor in rows across the body, the rows evenly along this stretch (cm from the front wall), as the
   * axle calculator's group lies (core/tools/axleLoads.ts). Any group; not with `lay`.
   */
  span?: { from: number; to: number };
}

export interface StartSpec {
  /** Name of the new plan. */
  name: string;
  body: {
    name: string;
    kind: BodyKind;
    dims: Dims;
    maxLoad?: number;
    chassisModel?: string;
    /** The calculator's own figures for the axles (as CargoBody.chassis). */
    chassis?: ChassisPatch;
  };
  cargo: StartCargo[];
}

/** At most this many groups and pieces travel: a start is a first plan, not the whole warehouse. */
export const START_MAX_GROUPS = 20;
export const START_MAX_ITEMS = 500;
const NAME_LENGTH = 100;

const round = (n: number) => Math.round(n * 10) / 10;
/** A piece's weight to 0,01 kg: a group's weight spread over its pieces adds up to what the calculator counted. */
const roundKg = (n: number) => Math.round(n * 100) / 100;

/** The compact text of a start: short keys, numbers only where possible. */
export function encodeStart(spec: StartSpec): string {
  return JSON.stringify({
    v: 1,
    n: spec.name,
    b: [
      spec.body.name,
      spec.body.kind,
      round(spec.body.dims.l),
      round(spec.body.dims.w),
      round(spec.body.dims.h),
      spec.body.maxLoad ?? 0,
      // The template's axles and the calculator's own figures (core/chassis.ts); older links end before them.
      ...(spec.body.chassisModel || spec.body.chassis ? [spec.body.chassisModel ?? ''] : []),
      ...(spec.body.chassis ? [spec.body.chassis] : []),
    ],
    c: spec.cargo.map((c) => [
      c.name,
      round(c.dims.l),
      round(c.dims.w),
      round(c.dims.h),
      roundKg(c.weight ?? 0),
      Math.round(c.count),
      // A layout: the gap and the stacking of `lay`, or the stretch of `span` as a pair (older links have neither).
      ...(c.lay ? [round(c.lay.gap), c.lay.stackable ? 1 : 0] : c.span ? [[round(c.span.from), round(c.span.to)]] : []),
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
  const [bName, bKind, l, w, h, maxLoad, chassisModel, chassis] = d.b as unknown[];
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
    // Only the name of a template's running gear (an unknown one is ignored by core/chassis.ts).
    ...(typeof chassisModel === 'string' && /^[a-z0-9-]{1,40}$/.test(chassisModel) ? { chassisModel } : {}),
  };
  // Only valid figures within the plan's limits; the editor keeps them within reason for the body (core/chassis.ts).
  const patch = cleanChassis(chassis);
  if (patch) body.chassis = patch;
  const cargo: StartCargo[] = [];
  let total = 0;
  for (const entry of (d.c as unknown[]).slice(0, START_MAX_GROUPS)) {
    if (!Array.isArray(entry)) return null;
    const [name, cl, cw, ch, weight, count, gap, stackable] = entry as unknown[];
    const span = Array.isArray(gap) ? gap.map(finite) : null;
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
      ...(kg > 0 ? { weight: roundKg(Math.min(kg, ITEM_WEIGHT_LIMIT)) } : {}),
      count: pieces,
      ...(g !== null && cargo.length === 0 ? { lay: { gap: clamp(g, 0, 50), stackable: stackable === 1 } } : {}),
      ...(span && span.length === 2 && span[0] !== null && span[1] !== null
        ? {
            span: {
              from: round(clamp(Math.min(span[0], span[1]), 0, body.dims.l)),
              to: round(clamp(Math.max(span[0], span[1]), 0, body.dims.l)),
            },
          }
        : {}),
    });
  }
  return { name: text(d.n, 'Схема из калькулятора'), body, cargo };
}

export interface StartPlan {
  plan: Plan;
  /** Pieces left out by the tier's limit of cargo in one plan. */
  dropped: number;
}

/**
 * Where the pieces of a `span` group stand: rows across the deck, centred, the rows evenly along the stretch, so the
 * group weighs where the calculator counted it. Min corners in the body's terms: x from the front wall, z from the
 * left wall.
 */
function spanSpots(count: number, size: Dims, deck: Dims, span: { from: number; to: number }): Array<{ x: number; z: number }> {
  const perRow = Math.max(1, Math.floor(deck.w / size.w));
  const rows = Math.ceil(count / perRow);
  const from = clamp(Math.min(span.from, span.to), 0, deck.l);
  const to = clamp(Math.max(span.from, span.to), 0, deck.l);
  const pitch = (to - from) / rows;
  const spots: Array<{ x: number; z: number }> = [];
  for (let r = 0; r < rows; r++) {
    // The middle of the row, the piece kept within the deck.
    const centre = deck.l > size.l ? clamp(from + (r + 0.5) * pitch, size.l / 2, deck.l - size.l / 2) : deck.l / 2;
    const inRow = Math.min(perRow, count - r * perRow);
    const z0 = (deck.w - inRow * size.w) / 2;
    for (let j = 0; j < inRow; j++) spots.push({ x: centre - size.l / 2, z: z0 + j * size.w });
  }
  return spots;
}

/**
 * The plan of a start: one vehicle, the first group laid out in the body (`lay`), `span` groups along their stretch,
 * the rest on the dock; ends with settle(), which also stacks pieces of groups whose stretches overlap.
 */
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
        ...(spec.body.chassisModel ? { chassisModel: spec.body.chassisModel } : {}),
        ...(spec.body.chassis ? { chassis: spec.body.chassis } : {}),
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
    const along = !fit && group.span ? spanSpots(count, group.dims, spec.body.dims, group.span) : null;
    for (let n = 0; n < count; n++) {
      const item: CargoItem = { ...base, id: uid('cargo'), seq: seq++, orientation: { yaw: 0 }, pos: { x: 0, y: 0, z: 0 } };
      const tier = fit && fit.count > 0 ? Math.floor(n / fit.count) : Infinity;
      if (along) {
        // On the floor; settle() below puts it on top of another group's pieces where the stretches overlap.
        const spot = along[n];
        items.push({ ...item, pos: { x: deck.max.x - spot.x - group.dims.l, y: deck.min.y, z: deck.min.z + spot.z } });
      } else if (fit && tier < tiers) {
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

/**
 * A whole plan carried into a new account (the demo of the landing page, pages/DemoPage), brought within the
 * limits of its tier: vehicles over the limit are taken away (their cargo goes to the dock of the first one),
 * then pieces over the limit are left out — what is on the docks first, what stands in a body last. Ends with
 * settle(). `limits` null — no limits, the plan as it is.
 */
export function fitPlan(plan: Plan, limits: { vehicles: number; items: number } | null | undefined): StartPlan {
  if (!limits) return { plan, dropped: 0 };
  let { vehicles, items } = plan;
  const vehicleLimit = Math.max(1, limits.vehicles);
  if (vehicles.length > vehicleLimit) {
    const kept = vehicles.slice(0, vehicleLimit);
    items = relayout(items, computeLayout(vehicles, plan.dockMode), computeLayout(kept, plan.dockMode), kept[0].id);
    vehicles = kept;
  }
  let dropped = 0;
  const room = Math.max(0, limits.items);
  if (items.length > room) {
    const layout = computeLayout(vehicles, plan.dockMode);
    const inside = new Set(items.filter((i) => classify(itemBox(i), layout).status === 'inside').map((i) => i.id));
    // Stable: the cargo in the bodies keeps its order, then the rest as it was listed.
    const order = [...items].sort((a, b) => Number(inside.has(b.id)) - Number(inside.has(a.id)));
    const keep = new Set(order.slice(0, room).map((i) => i.id));
    dropped = items.length - keep.size;
    items = items.filter((i) => keep.has(i.id));
  }
  if (vehicles === plan.vehicles && dropped === 0) return { plan, dropped: 0 };
  const nextSeq = Math.max(plan.nextSeq, ...items.map((i) => i.seq + 1));
  return { plan: { ...plan, vehicles, items: settle(items), nextSeq }, dropped };
}
