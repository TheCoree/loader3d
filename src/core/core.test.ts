import { describe, expect, it } from 'vitest';
import type { Box, CargoBody, CargoItem, Dims } from './types';
import { boxAt, inRects, subtractBox, volume } from './geometry';
import { itemBox } from './item';
import { computeLayout, remapItems } from './layout';
import { collectStack, findCollisions, findFloating, settle } from './physics';
import { beginMove, evaluateMove, finishMove } from './move';
import { snapFootprint } from './snapping';
import { resizeBox } from './resize';
import { findFreeSpot } from './spawn';
import { classify, computeStats } from './stats';

let n = 0;
function item(dims: Partial<Dims>, pos: { x: number; y?: number; z: number }, id = `i${++n}`): CargoItem {
  return {
    id,
    seq: n,
    name: id,
    dims: { l: 100, w: 100, h: 100, ...dims },
    orientation: { yaw: 0 },
    pos: { x: pos.x, y: pos.y ?? 0, z: pos.z },
    color: '#000',
  };
}

const body = (l = 1360, w = 245, h = 270, id = 'b1'): CargoBody => ({ id, name: id, kind: 'semi', dims: { l, w, h } });
const layout = computeLayout([body()]);
const ctx = { floors: layout.floors, walls: layout.walls, snapThreshold: 0 };

describe('settle (gravity)', () => {
  it('drops floating items and stacks overlapping ones', () => {
    const items = [
      item({}, { x: 0, z: 0 }, 'a'),
      item({}, { x: 50, y: 0, z: 50 }, 'b'), // intersects a
      item({}, { x: 500, y: 300, z: 0 }, 'c'), // floating
    ];
    const out = settle(items);
    expect(findCollisions(out)).toEqual([]);
    expect(findFloating(out)).toEqual([]);
    expect(out.find((i) => i.id === 'b')!.pos.y).toBe(100);
    expect(out.find((i) => i.id === 'c')!.pos.y).toBe(0);
  });

  it('keeps stack order and identity of untouched items', () => {
    const a = item({}, { x: 0, z: 0 }, 'a');
    const b = item({}, { x: 0, y: 100, z: 0 }, 'b');
    const out = settle([b, a]);
    expect(out[0]).toBe(b);
    expect(out[1]).toBe(a);
  });

  it('lets a yielding item go on top of a neighbour at the same level', () => {
    const a = item({}, { x: 0, z: 0 }, 'a');
    const b = item({}, { x: 50, z: 0 }, 'b');
    const out = settle([b, a], { yieldIds: new Set(['b']) });
    expect(out[1].pos.y).toBe(0);
    expect(out[0].pos.y).toBe(100);
  });

  it('places "top" items above everything they overlap', () => {
    const a = item({}, { x: 0, z: 0 }, 'a');
    const t = item({}, { x: 0, y: 100, z: 0 }, 't');
    const m = item({ h: 50 }, { x: 0, z: 50 }, 'm');
    const out = settle([a, t, m], { topIds: new Set(['m']) });
    expect(out[2].pos.y).toBe(200);
    expect(findCollisions(out)).toEqual([]);
  });
});

describe('collectStack', () => {
  it('collects items resting only on the picked one', () => {
    const items = [
      item({}, { x: 0, z: 0 }, 'base'),
      item({ l: 50 }, { x: 0, y: 100, z: 0 }, 'top'),
      item({}, { x: 200, z: 0 }, 'other'),
      item({ l: 300 }, { x: 0, y: 100, z: 120 }, 'bridge'), // not over base
    ];
    expect([...collectStack('base', items)].sort()).toEqual(['base', 'top']);
  });

  it('does not take an item that also rests on something else', () => {
    const items = [
      item({}, { x: 0, z: 0 }, 'a'),
      item({}, { x: 100, z: 0 }, 'b'),
      item({ l: 200 }, { x: 0, y: 100, z: 0 }, 'bridge'),
    ];
    expect([...collectStack('a', items)]).toEqual(['a']);
  });
});

describe('move', () => {
  it('carries the stack and lands it on the floor', () => {
    const items = settle([item({}, { x: -400, z: 0 }, 'a'), item({ h: 50 }, { x: -400, y: 100, z: 0 }, 'b')]);
    const s = beginMove(items, 'a');
    const r = evaluateMove(s, { x: 100, z: 0 }, ctx);
    const out = finishMove(items, s, r.members);
    expect(out.find((i) => i.id === 'a')!.pos).toEqual({ x: 100, y: 0, z: 0 });
    expect(out.find((i) => i.id === 'b')!.pos).toEqual({ x: 100, y: 100, z: 0 });
  });

  it('climbs on top of an item it is dragged onto', () => {
    const items = [item({}, { x: 0, z: 0 }, 'a'), item({}, { x: 300, z: 0 }, 'b')];
    const s = beginMove(items, 'b');
    const r = evaluateMove(s, { x: 20, z: 10 }, ctx);
    expect(r.rootPos.y).toBe(100);
    expect(findCollisions(finishMove(items, s, r.members))).toEqual([]);
  });

  it('magnetises to a neighbour face instead of climbing when close', () => {
    const items = [item({}, { x: 0, z: 0 }, 'a'), item({}, { x: 300, z: 0 }, 'b')];
    const s = beginMove(items, 'b');
    const r = evaluateMove(s, { x: 96, z: 3 }, { ...ctx, snapThreshold: 8 });
    expect(r.rootPos).toEqual({ x: 100, y: 0, z: 0 });
    expect(r.guides.map((g) => g.axis).sort()).toEqual(['x', 'z']);
  });

  it('snaps to inner walls of the body', () => {
    const items = [item({}, { x: 300, z: 0 }, 'a')];
    const s = beginMove(items, 'a');
    const r = evaluateMove(s, { x: 600, z: 26 }, { ...ctx, snapThreshold: 8 });
    expect(r.rootPos.z).toBeCloseTo(122.5 - 100);
    expect(r.guides[0].kind).toBe('wall');
  });

  it('keeps the group centre over a floor', () => {
    const items = [item({}, { x: 0, z: 0 }, 'a')];
    const s = beginMove(items, 'a');
    for (const target of [{ x: 600, z: 2000 }, { x: 5000, z: 0 }, { x: -3000, z: -3000 }]) {
      const r = evaluateMove(s, target, ctx);
      expect(inRects(r.rootPos.x + 50, r.rootPos.z + 50, layout.floors)).toBe(true);
    }
  });
});

describe('snapping', () => {
  it('prefers face contact over alignment at similar distance', () => {
    const fp = boxAt({ x: 103, y: 0, z: 0 }, { l: 100, w: 100, h: 100 });
    const res = snapFootprint(fp, { items: [boxAt({ x: 0, y: 0, z: 0 }, { l: 100, w: 100, h: 100 })], walls: [] }, 10);
    expect(res.x?.delta).toBe(-3);
  });

  it('ignores far targets', () => {
    const fp = boxAt({ x: 103, y: 0, z: 500 }, { l: 100, w: 100, h: 100 });
    const res = snapFootprint(fp, { items: [boxAt({ x: 0, y: 0, z: 0 }, { l: 100, w: 100, h: 100 })], walls: [] }, 10);
    expect(res.x).toBeNull();
  });
});

describe('resize', () => {
  const start = boxAt({ x: 0, y: 0, z: 0 }, { l: 100, w: 100, h: 100 });
  const base = { obstacles: [], walls: [], snapThreshold: 0, step: 1 };

  it('pushes a face and rounds to the step', () => {
    expect(resizeBox(start, 'x+', 20.4, base).max.x).toBe(120);
    expect(resizeBox(start, 'z-', -10.6, base).min.z).toBe(-11);
  });

  it('stops at the first obstacle in the way', () => {
    const wall = boxAt({ x: 150, y: 0, z: 50 }, { l: 50, w: 50, h: 50 });
    expect(resizeBox(start, 'x+', 200, { ...base, obstacles: [wall] }).max.x).toBe(150);
  });

  it('keeps a minimum size', () => {
    expect(resizeBox(start, 'y+', -500, base).max.y).toBe(5);
  });
});

describe('geometry & placement', () => {
  it('splits the part outside a body', () => {
    const a = boxAt({ x: -50, y: 0, z: 0 }, { l: 100, w: 100, h: 300 });
    const b = boxAt({ x: 0, y: 0, z: 0 }, { l: 1000, w: 245, h: 270 });
    const parts = subtractBox(a, b);
    expect(parts.reduce((s, p) => s + volume(p), 0)).toBeCloseTo(volume(a) - 50 * 100 * 270);
  });

  it('classifies inside / overflow / dock', () => {
    const inside = itemBox(item({}, { x: 100, z: 0 }));
    const over = itemBox(item({}, { x: -30, z: 0 }));
    const dock = itemBox(item({}, { x: -300, z: 0 }));
    expect(classify(inside, layout).status).toBe('inside');
    expect(classify(over, layout).status).toBe('overflow');
    expect(classify(over, layout).outside).toHaveLength(1);
    expect(classify(dock, layout).status).toBe('dock');
  });

  it('computes fill and loading metres', () => {
    const stats = computeStats([item({ l: 120, w: 80, h: 150 }, { x: 1240, z: -122.5 })], layout);
    expect(stats.inside).toBe(1);
    expect(stats.bodies[0].ldm).toBeCloseTo(1.2);
  });

  it('finds free spots in rows without overlaps', () => {
    const region = { minX: -900, maxX: -70, minZ: -620, maxZ: 620 };
    const placed: Box[] = [];
    for (let i = 0; i < 12; i++) {
      const spot = findFreeSpot({ l: 120, w: 80, h: 150 }, region, placed)!;
      placed.push(boxAt({ x: spot.x, y: 0, z: spot.z }, { l: 120, w: 80, h: 150 }));
    }
    const asItems = placed.map((b, i) => item({ l: 120, w: 80, h: 150 }, { x: b.min.x, z: b.min.z }, `p${i}`));
    expect(findCollisions(asItems)).toEqual([]);
    expect(placed[0].max.x).toBe(-70);
  });

  it('keeps cargo attached to the front wall when the body changes', () => {
    const before = computeLayout([body(1360, 245, 270, 'semi'), body(800, 245, 270, 'tr')]);
    const after = computeLayout([body(1360, 245, 270, 'semi')]);
    const front = item({}, { x: before.bodies[0].box.max.x - 100, z: 0 }, 'f');
    const trailer = item({}, { x: 100, z: 0 }, 't');
    const dock = item({}, { x: -400, z: 0 }, 'd');
    const { items, orphans } = remapItems([front, trailer, dock], before, after);
    expect(items[0].pos.x).toBe(after.bodies[0].box.max.x - 100);
    expect(orphans).toEqual(['t']);
    expect(items[2]).toBe(dock);
  });
});
