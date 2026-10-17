import type { Box } from './types';

export type SnapKind = 'item' | 'wall';
export type SnapAxis = 'x' | 'z';

/** A plane the moved footprint got attached to (rendered as a guide). */
export interface SnapGuide {
  axis: SnapAxis;
  plane: number;
  kind: SnapKind;
}

export interface SnapTargets {
  items: readonly Box[];
  walls: readonly Box[];
}

export interface AxisSnap {
  delta: number;
  guide: SnapGuide;
}

export interface SnapResult {
  x: AxisSnap | null;
  z: AxisSnap | null;
}

/** Face-to-face contact beats edge alignment found at a similar distance. */
const CONTACT_BONUS = 0.35;

function range(b: Box, axis: SnapAxis): [number, number] {
  return axis === 'x' ? [b.min.x, b.max.x] : [b.min.z, b.max.z];
}

function snapAxis(fp: Box, axis: SnapAxis, targets: SnapTargets, threshold: number): AxisSnap | null {
  const perp: SnapAxis = axis === 'x' ? 'z' : 'x';
  const [aMin, aMax] = range(fp, axis);
  const [pMin, pMax] = range(fp, perp);
  const size = aMax - aMin;
  const state: { best: AxisSnap | null; score: number } = { best: null, score: Infinity };

  const consider = (newMin: number, plane: number, kind: SnapKind, contact: boolean) => {
    const delta = newMin - aMin;
    const dist = Math.abs(delta);
    if (dist > threshold) return;
    const score = dist - (contact ? threshold * CONTACT_BONUS : 0);
    if (score < state.score) {
      state.score = score;
      state.best = { delta, guide: { axis, plane, kind } };
    }
  };
  const isNear = (b: Box) => {
    const [bMin, bMax] = range(b, perp);
    return bMax > pMin - threshold && bMin < pMax + threshold;
  };

  for (const b of targets.items) {
    if (!isNear(b)) continue;
    const [tMin, tMax] = range(b, axis);
    consider(tMax, tMax, 'item', true);
    consider(tMin - size, tMin, 'item', true);
    consider(tMin, tMin, 'item', false);
    consider(tMax - size, tMax, 'item', false);
  }
  for (const w of targets.walls) {
    if (!isNear(w)) continue;
    const [wMin, wMax] = range(w, axis);
    consider(wMin, wMin, 'wall', true);
    consider(wMax - size, wMax, 'wall', true);
    consider(wMax, wMax, 'wall', true);
    consider(wMin - size, wMin, 'wall', true);
  }
  return state.best;
}

/**
 * Magnetic snapping of a footprint to nearby item faces and body walls, per horizontal axis.
 * `threshold` is in world units (callers convert from screen pixels).
 */
export function snapFootprint(fp: Box, targets: SnapTargets, threshold: number): SnapResult {
  return {
    x: snapAxis(fp, 'x', targets, threshold),
    z: snapAxis(fp, 'z', targets, threshold),
  };
}

/** Nearest plane within `threshold` of `value` (1-D snapping used by resizing). */
export function snapValue(value: number, planes: Iterable<number>, threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold;
  for (const p of planes) {
    const d = Math.abs(p - value);
    if (d <= bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
