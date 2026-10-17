import type { Box, Dims, Rect, Vec3 } from './types';

/** Tolerance (cm) below which faces are considered touching rather than overlapping. */
export const EPS = 0.01;

export function boxAt(pos: Vec3, size: Dims): Box {
  return {
    min: { x: pos.x, y: pos.y, z: pos.z },
    max: { x: pos.x + size.l, y: pos.y + size.h, z: pos.z + size.w },
  };
}

export function boxSize(b: Box): Dims {
  return { l: b.max.x - b.min.x, w: b.max.z - b.min.z, h: b.max.y - b.min.y };
}

export function boxCenter(b: Box): Vec3 {
  return {
    x: (b.min.x + b.max.x) / 2,
    y: (b.min.y + b.max.y) / 2,
    z: (b.min.z + b.max.z) / 2,
  };
}

export function translateBox(b: Box, dx: number, dy: number, dz: number): Box {
  return {
    min: { x: b.min.x + dx, y: b.min.y + dy, z: b.min.z + dz },
    max: { x: b.max.x + dx, y: b.max.y + dy, z: b.max.z + dz },
  };
}

export function inflateBox(b: Box, d: number): Box {
  return {
    min: { x: b.min.x - d, y: b.min.y - d, z: b.min.z - d },
    max: { x: b.max.x + d, y: b.max.y + d, z: b.max.z + d },
  };
}

/** Signed overlap of two intervals (negative when they are apart). */
export function overlap1D(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.min(aMax, bMax) - Math.max(aMin, bMin);
}

/** True when the footprints overlap (touching edges do not count). */
export function overlapsXZ(a: Box, b: Box, eps = EPS): boolean {
  return (
    overlap1D(a.min.x, a.max.x, b.min.x, b.max.x) > eps &&
    overlap1D(a.min.z, a.max.z, b.min.z, b.max.z) > eps
  );
}

/** True when the volumes overlap (touching faces do not count). */
export function overlaps(a: Box, b: Box, eps = EPS): boolean {
  return overlapsXZ(a, b, eps) && overlap1D(a.min.y, a.max.y, b.min.y, b.max.y) > eps;
}

export function intersection(a: Box, b: Box): Box | null {
  const min = {
    x: Math.max(a.min.x, b.min.x),
    y: Math.max(a.min.y, b.min.y),
    z: Math.max(a.min.z, b.min.z),
  };
  const max = {
    x: Math.min(a.max.x, b.max.x),
    y: Math.min(a.max.y, b.max.y),
    z: Math.min(a.max.z, b.max.z),
  };
  if (max.x - min.x <= EPS || max.y - min.y <= EPS || max.z - min.z <= EPS) return null;
  return { min, max };
}

export function volume(b: Box | null): number {
  if (!b) return 0;
  return (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
}

export function contains(outer: Box, inner: Box, eps = EPS): boolean {
  return (
    inner.min.x >= outer.min.x - eps &&
    inner.max.x <= outer.max.x + eps &&
    inner.min.y >= outer.min.y - eps &&
    inner.max.y <= outer.max.y + eps &&
    inner.min.z >= outer.min.z - eps &&
    inner.max.z <= outer.max.z + eps
  );
}

/**
 * `a \ b` as at most six disjoint boxes (slabs cut along X, then Y, then Z).
 * Used to find the parts of a cargo item that stick out of its cargo body.
 */
export function subtractBox(a: Box, b: Box): Box[] {
  const c = intersection(a, b);
  if (!c) return [a];
  const parts: Box[] = [
    { min: a.min, max: { x: c.min.x, y: a.max.y, z: a.max.z } },
    { min: { x: c.max.x, y: a.min.y, z: a.min.z }, max: a.max },
    { min: { x: c.min.x, y: a.min.y, z: a.min.z }, max: { x: c.max.x, y: c.min.y, z: a.max.z } },
    { min: { x: c.min.x, y: c.max.y, z: a.min.z }, max: { x: c.max.x, y: a.max.y, z: a.max.z } },
    { min: { x: c.min.x, y: c.min.y, z: a.min.z }, max: { x: c.max.x, y: c.max.y, z: c.min.z } },
    { min: { x: c.min.x, y: c.min.y, z: c.max.z }, max: { x: c.max.x, y: c.max.y, z: a.max.z } },
  ];
  return parts.filter(
    (p) => p.max.x - p.min.x > EPS && p.max.y - p.min.y > EPS && p.max.z - p.min.z > EPS,
  );
}

export function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const min = { ...boxes[0].min };
  const max = { ...boxes[0].max };
  for (const b of boxes) {
    min.x = Math.min(min.x, b.min.x);
    min.y = Math.min(min.y, b.min.y);
    min.z = Math.min(min.z, b.min.z);
    max.x = Math.max(max.x, b.max.x);
    max.y = Math.max(max.y, b.max.y);
    max.z = Math.max(max.z, b.max.z);
  }
  return { min, max };
}

export function rectOf(b: Box): Rect {
  return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
}

export function inRects(x: number, z: number, rects: readonly Rect[], eps = EPS): boolean {
  return rects.some(
    (r) => x >= r.minX - eps && x <= r.maxX + eps && z >= r.minZ - eps && z <= r.maxZ + eps,
  );
}

/** Nearest point to (x, z) that lies inside the union of `rects`. */
export function clampToRects(x: number, z: number, rects: readonly Rect[]): { x: number; z: number } {
  let best = { x, z };
  let bestDist = Infinity;
  for (const r of rects) {
    const cx = Math.min(Math.max(x, r.minX), r.maxX);
    const cz = Math.min(Math.max(z, r.minZ), r.maxZ);
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: cx, z: cz };
      if (d === 0) break;
    }
  }
  return best;
}
