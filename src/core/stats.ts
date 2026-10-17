import type { Box, CargoItem } from './types';
import { contains, intersection, subtractBox, volume } from './geometry';
import { itemBox } from './item';
import { bodyAt, type PlacedBody, type VehicleLayout } from './layout';

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
}

export interface PlanStats {
  bodies: BodyStats[];
  inside: number;
  overflow: number;
  dock: number;
  /** cm³ of all cargo. */
  cargoVolume: number;
}

export function computeStats(items: readonly CargoItem[], layout: VehicleLayout): PlanStats {
  const perBody = new Map<string, BodyStats>(
    layout.bodies.map((pb) => {
      const capacity = volume(pb.box);
      return [
        pb.body.id,
        { id: pb.body.id, name: pb.body.name, used: 0, capacity, fill: 0, ldm: 0, count: 0 },
      ];
    }),
  );
  let inside = 0;
  let overflow = 0;
  let dock = 0;
  let cargoVolume = 0;

  for (const item of items) {
    const box = itemBox(item);
    cargoVolume += volume(box);
    const placement = classify(box, layout);
    if (placement.status === 'dock' || !placement.body) {
      dock++;
      continue;
    }
    if (placement.status === 'inside') inside++;
    else overflow++;
    const pb = placement.body;
    const stats = perBody.get(pb.body.id)!;
    stats.count++;
    stats.used += volume(intersection(box, pb.box));
    const usedFromFront = pb.box.max.x - Math.max(pb.box.min.x, box.min.x);
    stats.ldm = Math.max(stats.ldm, usedFromFront / 100);
  }

  for (const s of perBody.values()) s.fill = s.capacity > 0 ? s.used / s.capacity : 0;
  return { bodies: [...perBody.values()], inside, overflow, dock, cargoVolume };
}
