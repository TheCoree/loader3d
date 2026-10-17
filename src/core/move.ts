import type { Box, CargoItem, Rect, Vec3 } from './types';
import { EPS, boxCenter, clampToRects, inRects, translateBox, unionBoxes } from './geometry';
import { itemBox } from './item';
import { collectStack, groupBaseY, settle } from './physics';
import { snapFootprint, type SnapGuide } from './snapping';

/**
 * Moving cargo: the picked item and the stack resting on it move as one rigid group.
 * Everything else is settled once at the start, so the session can evaluate positions cheaply
 * on every pointer move.
 */
export interface MoveSession {
  rootId: string;
  /** Original members, root first. */
  members: CargoItem[];
  memberIds: ReadonlySet<string>;
  /** member.pos − root.pos */
  offsets: Map<string, Vec3>;
  /** Member boxes relative to root.pos (same order as members). */
  relBoxes: Box[];
  /** Union of relBoxes. */
  bounds: Box;
  /** Items not in the group, settled without it. */
  others: CargoItem[];
  obstacles: Box[];
}

export interface MoveContext {
  /** Areas the group's centre must stay over (dock and decks). */
  floors: readonly Rect[];
  /** Snap targets besides other items. */
  walls: readonly Box[];
  /** Snap distance in world units; 0 disables snapping. */
  snapThreshold: number;
}

export interface MoveResult {
  rootPos: Vec3;
  members: CargoItem[];
  guides: SnapGuide[];
}

export function beginMove(items: readonly CargoItem[], rootId: string, carryStack = true): MoveSession {
  const root = items.find((i) => i.id === rootId);
  if (!root) throw new Error(`Unknown cargo item ${rootId}`);
  const memberIds = carryStack ? collectStack(rootId, items) : new Set([rootId]);
  const members = [root, ...items.filter((i) => i.id !== rootId && memberIds.has(i.id))];
  const others = settle(items.filter((i) => !memberIds.has(i.id)));
  const offsets = new Map(
    members.map((m) => [
      m.id,
      { x: m.pos.x - root.pos.x, y: m.pos.y - root.pos.y, z: m.pos.z - root.pos.z },
    ]),
  );
  const relBoxes = members.map((m) => translateBox(itemBox(m), -root.pos.x, -root.pos.y, -root.pos.z));
  return {
    rootId,
    members,
    memberIds,
    offsets,
    relBoxes,
    bounds: unionBoxes(relBoxes)!,
    others,
    obstacles: others.map(itemBox),
  };
}

/** Where the group ends up if the root's min corner is dragged to `target` (XZ). */
export function evaluateMove(
  s: MoveSession,
  target: { x: number; z: number },
  ctx: MoveContext,
): MoveResult {
  const baseYAt = (x: number, z: number) =>
    groupBaseY(
      s.relBoxes.map((b) => translateBox(b, x, 0, z)),
      s.obstacles,
    );
  const centerAt = (x: number, z: number) => boxCenter(translateBox(s.bounds, x, 0, z));

  let { x, z } = target;

  // Keep the group over something it can stand on.
  const c = centerAt(x, z);
  const clamped = clampToRects(c.x, c.z, ctx.floors);
  x += clamped.x - c.x;
  z += clamped.z - c.z;

  let guides: SnapGuide[] = [];
  if (ctx.snapThreshold > 0) {
    const snap = snapFootprint(
      translateBox(s.bounds, x, 0, z),
      { items: s.obstacles, walls: ctx.walls },
      ctx.snapThreshold,
    );
    const variants: Array<{ dx: number; dz: number; guides: SnapGuide[] }> = [];
    if (snap.x && snap.z) {
      variants.push({ dx: snap.x.delta, dz: snap.z.delta, guides: [snap.x.guide, snap.z.guide] });
    }
    if (snap.x) variants.push({ dx: snap.x.delta, dz: 0, guides: [snap.x.guide] });
    if (snap.z) variants.push({ dx: 0, dz: snap.z.delta, guides: [snap.z.guide] });

    // A snap must never make the group hop onto something it was not already standing on.
    const base = baseYAt(x, z);
    for (const v of variants) {
      const nx = x + v.dx;
      const nz = z + v.dz;
      const nc = centerAt(nx, nz);
      if (!inRects(nc.x, nc.z, ctx.floors)) continue;
      if (baseYAt(nx, nz) > base + EPS) continue;
      x = nx;
      z = nz;
      guides = v.guides;
      break;
    }
  }

  const y = baseYAt(x, z);
  const members = s.members.map((m) => {
    const o = s.offsets.get(m.id)!;
    return { ...m, pos: { x: x + o.x, y: y + o.y, z: z + o.z } };
  });
  return { rootPos: { x, y, z }, members, guides };
}

/** Full item list (original order) with the session applied — for previews. */
export function composeMove(
  items: readonly CargoItem[],
  s: MoveSession,
  members: readonly CargoItem[],
): CargoItem[] {
  const byId = new Map<string, CargoItem>();
  for (const o of s.others) byId.set(o.id, o);
  for (const m of members) byId.set(m.id, m);
  return items.map((i) => byId.get(i.id) ?? i);
}

/** Final item list after dropping the group. */
export function finishMove(
  items: readonly CargoItem[],
  s: MoveSession,
  members: readonly CargoItem[],
): CargoItem[] {
  return settle(composeMove(items, s, members), { topIds: s.memberIds });
}
