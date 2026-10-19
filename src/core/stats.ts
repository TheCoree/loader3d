import type { Box, CargoItem } from './types';
import { boxCenter, contains, intersection, subtractBox, volume } from './geometry';
import { itemBox, itemWeight } from './item';
import { bodyAt, type PlacedBody, type VehicleLayout } from './layout';

/**
 * Weight distribution limits (simplified safety model, also used by autoload):
 * the centre of gravity of the load should stay within COG_LONG_TOLERANCE × length of the middle of
 * the body (so neither the front nor the rear axles are overloaded) and within
 * COG_LAT_TOLERANCE × width of its centreline (even wheel loads, no tipping).
 */
export const COG_LONG_TOLERANCE = 0.15;
export const COG_LAT_TOLERANCE = 0.05;

export type PlacementStatus = 'inside' | 'overflow' | 'dock';

export interface Placement {
  status: PlacementStatus;
  body: PlacedBody | null;
  /** Parts of the item outside its body (only for 'overflow'). */
  outside: Box[];
}

/** Where an item is: fully inside a body, partially out of it, or outside every body (on the dock). */
export function classify(box: Box, layout: VehicleLayout): Placement {
  const pb = bodyAt(box, layout);
  if (!pb) return { status: 'dock', body: null, outside: [] };
  if (contains(pb.box, box)) return { status: 'inside', body: pb, outside: [] };
  return { status: 'overflow', body: pb, outside: subtractBox(box, pb.box) };
}

export interface BodyStats {
  id: string;
  name: string;
  /** cm³ of cargo inside the body. */
  used: number;
  /** cm³ */
  capacity: number;
  /** 0..1 */
  fill: number;
  /** Loading metres: floor length used from the front wall, m. */
  ldm: number;
  count: number;
  /** kg of cargo in the body. */
  weight: number;
  /** Payload capacity, kg (undefined: not set). */
  maxLoad?: number;
  overweight: boolean;
  /** Centre of gravity of the cargo along the body, 0 = front wall, 1 = rear doors (null: no weight). */
  cogFromFront: number | null;
  /** Sideways offset of the centre of gravity from the centreline, cm, + = right in the driving direction. */
  cogOffset: number | null;
  /** Centre of gravity within COG_LONG_TOLERANCE / COG_LAT_TOLERANCE. */
  balanced: boolean;
}

export interface PlanStats {
  bodies: BodyStats[];
  inside: number;
  overflow: number;
  dock: number;
  /** cm³ of all cargo. */
  cargoVolume: number;
  /** kg of all cargo / of the cargo on the dock. */
  cargoWeight: number;
  dockWeight: number;
}

/** Centre of gravity of weighted boxes relative to a body, or nulls when there is no weight. */
export function centreOfGravity(
  entries: ReadonlyArray<{ box: Box; weight: number }>,
  body: Box,
): { fromFront: number | null; offset: number | null } {
  let total = 0;
  let mx = 0;
  let mz = 0;
  for (const { box, weight } of entries) {
    const c = boxCenter(box);
    total += weight;
    mx += weight * c.x;
    mz += weight * c.z;
  }
  if (total <= 0) return { fromFront: null, offset: null };
  const length = body.max.x - body.min.x;
  return {
    fromFront: (body.max.x - mx / total) / length,
    offset: mz / total - (body.min.z + body.max.z) / 2,
  };
}

export function isBalanced(fromFront: number | null, offset: number | null, body: Box): boolean {
  if (fromFront === null || offset === null) return true;
  const width = body.max.z - body.min.z;
  return Math.abs(fromFront - 0.5) <= COG_LONG_TOLERANCE + 1e-9 && Math.abs(offset) <= COG_LAT_TOLERANCE * width + 1e-9;
}

export function computeStats(items: readonly CargoItem[], layout: VehicleLayout): PlanStats {
  const perBody = new Map<string, BodyStats>(
    layout.bodies.map((pb) => {
      const capacity = volume(pb.box);
      return [
        pb.body.id,
        {
          id: pb.body.id,
          name: pb.body.name,
          used: 0,
          capacity,
          fill: 0,
          ldm: 0,
          count: 0,
          weight: 0,
          maxLoad: pb.body.maxLoad,
          overweight: false,
          cogFromFront: null,
          cogOffset: null,
          balanced: true,
        },
      ];
    }),
  );
  const weighted = new Map<string, Array<{ box: Box; weight: number }>>();
  let inside = 0;
  let overflow = 0;
  let dock = 0;
  let cargoVolume = 0;
  let cargoWeight = 0;
  let dockWeight = 0;

  for (const item of items) {
    const box = itemBox(item);
    const weight = itemWeight(item);
    cargoVolume += volume(box);
    cargoWeight += weight;
    const placement = classify(box, layout);
    if (placement.status === 'dock' || !placement.body) {
      dock++;
      dockWeight += weight;
      continue;
    }
    if (placement.status === 'inside') inside++;
    else overflow++;
    const pb = placement.body;
    const stats = perBody.get(pb.body.id)!;
    stats.count++;
    stats.weight += weight;
    stats.used += volume(intersection(box, pb.box));
    const usedFromFront = pb.box.max.x - Math.max(pb.box.min.x, box.min.x);
    stats.ldm = Math.max(stats.ldm, usedFromFront / 100);
    const list = weighted.get(pb.body.id) ?? [];
    list.push({ box, weight });
    weighted.set(pb.body.id, list);
  }

  for (const pb of layout.bodies) {
    const s = perBody.get(pb.body.id)!;
    s.fill = s.capacity > 0 ? s.used / s.capacity : 0;
    s.overweight = s.maxLoad !== undefined && s.weight > s.maxLoad + 1e-9;
    const cog = centreOfGravity(weighted.get(pb.body.id) ?? [], pb.box);
    s.cogFromFront = cog.fromFront;
    s.cogOffset = cog.offset;
    s.balanced = isBalanced(cog.fromFront, cog.offset, pb.box);
  }
  return { bodies: [...perBody.values()], inside, overflow, dock, cargoVolume, cargoWeight, dockWeight };
}
