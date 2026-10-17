import type { Box, CargoBody, CargoItem, Rect } from './types';
import { intersection, rectOf, unionBoxes, volume } from './geometry';
import { itemBox } from './item';

/** Distance between consecutive cargo bodies of a road train. */
export const COUPLING_GAP = 110;
/** Gap between the first cargo body and the cab. */
export const CAB_GAP = 40;
export const CAB_LENGTH = 230;
/** Deck height above the yard; the dock platform is level with the deck. */
export const DECK_HEIGHT = 120;
export const DOCK_DEPTH = 900;
export const DOCK_WIDTH = 1300;
/** Free aisle between the rear doors and the staging rows on the dock. */
export const DOCK_AISLE = 70;

export interface PlacedBody {
  body: CargoBody;
  index: number;
  box: Box;
}

export interface VehicleLayout {
  /** Same order as the input: index 0 is right behind the cab. */
  bodies: PlacedBody[];
  /** X of the front wall of the first body. */
  front: number;
  /** Dock (staging area) behind the rear doors of the last body. */
  dock: Rect;
  /** Everything an item may stand on: the dock and every body's deck. */
  floors: Rect[];
  /** Body boxes — snap targets for cargo. */
  walls: Box[];
}

/**
 * Bodies are laid out along X from the dock: the rear doors of the last body are at X = 0, the first
 * body (behind the cab) is the furthest one. The dock occupies X < 0 and never moves.
 */
export function computeLayout(bodies: readonly CargoBody[]): VehicleLayout {
  const placed: PlacedBody[] = new Array(bodies.length);
  let x = 0;
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const { l, w, h } = body.dims;
    placed[i] = {
      body,
      index: i,
      box: { min: { x, y: 0, z: -w / 2 }, max: { x: x + l, y: h, z: w / 2 } },
    };
    x += l + COUPLING_GAP;
  }
  const front = placed.length ? placed[0].box.max.x : 0;
  const dock: Rect = {
    minX: -DOCK_DEPTH,
    maxX: 0,
    minZ: -DOCK_WIDTH / 2,
    maxZ: DOCK_WIDTH / 2,
  };
  return {
    bodies: placed,
    front,
    dock,
    floors: [dock, ...placed.map((p) => rectOf(p.box))],
    walls: placed.map((p) => p.box),
  };
}

/** Bounding box of the vehicle including the cab (used for camera framing). */
export function vehicleBounds(layout: VehicleLayout): Box {
  const boxes = layout.bodies.map((p) => p.box);
  const union = unionBoxes(boxes) ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  return { min: union.min, max: { ...union.max, x: layout.front + CAB_GAP + CAB_LENGTH } };
}

/** The body that contains the largest part of `box`, if any. */
export function bodyAt(box: Box, layout: VehicleLayout): PlacedBody | null {
  let best: PlacedBody | null = null;
  let bestVolume = 1; // cm³ — ignore numerical slivers
  for (const pb of layout.bodies) {
    const v = volume(intersection(box, pb.box));
    if (v > bestVolume) {
      bestVolume = v;
      best = pb;
    }
  }
  return best;
}

/**
 * Keeps cargo attached to its body when the vehicle changes (resize, trailer added/removed).
 * Positions are kept relative to the front wall, as trucks are loaded from the front.
 * Items whose body disappeared are returned as orphans.
 */
export function remapItems(
  items: readonly CargoItem[],
  from: VehicleLayout,
  to: VehicleLayout,
): { items: CargoItem[]; orphans: string[] } {
  const orphans: string[] = [];
  const next = items.map((item) => {
    const old = bodyAt(itemBox(item), from);
    if (!old) return item;
    const target = to.bodies.find((pb) => pb.body.id === old.body.id);
    if (!target) {
      orphans.push(item.id);
      return item;
    }
    const dx = target.box.max.x - old.box.max.x;
    return dx === 0 ? item : { ...item, pos: { ...item.pos, x: item.pos.x + dx } };
  });
  return { items: next, orphans };
}
