import type { Box } from './types';
import { EPS, overlap1D } from './geometry';
import { MAX_ITEM_SIZE, MIN_ITEM_SIZE } from './item';
import { snapValue } from './snapping';

/** A face of a box that can be pushed or pulled. The bottom face is fixed by gravity. */
export type Face = 'x+' | 'x-' | 'z+' | 'z-' | 'y+';
export type Axis = 'x' | 'y' | 'z';

export const FACES: readonly Face[] = ['x+', 'x-', 'z+', 'z-', 'y+'];

export function faceAxis(face: Face): Axis {
  return face[0] as Axis;
}

export function faceSign(face: Face): 1 | -1 {
  return face[1] === '+' ? 1 : -1;
}

export interface ResizeContext {
  /** Boxes the face cannot be pushed into. */
  obstacles: readonly Box[];
  /** Extra planes to snap to (e.g. body walls). */
  walls: readonly Box[];
  /** Snap distance in world units; 0 disables snapping. */
  snapThreshold: number;
  /** Rounding step for the resulting size, cm. */
  step: number;
}

const OTHER_AXES: Record<Axis, [Axis, Axis]> = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };

/**
 * Push/pull of one face ("SketchUp style"): moves the face by `delta` along its normal, snaps it to
 * nearby planes or rounds the size, keeps a minimum size and stops at the first obstacle in the way.
 * Growing upwards is not limited — items standing on top are lifted by the gravity pass.
 */
export function resizeBox(start: Box, face: Face, delta: number, ctx: ResizeContext): Box {
  const axis = faceAxis(face);
  const sign = faceSign(face);
  const [a1, a2] = OTHER_AXES[axis];

  const planes: number[] = [];
  for (const b of [...ctx.obstacles, ...ctx.walls]) planes.push(b.min[axis], b.max[axis]);

  const fixed = sign > 0 ? start.min[axis] : start.max[axis];
  let v = (sign > 0 ? start.max[axis] : start.min[axis]) + delta;

  const snapped = ctx.snapThreshold > 0 ? snapValue(v, planes, ctx.snapThreshold) : null;
  if (snapped !== null) v = snapped;
  else if (ctx.step > 0) v = fixed + sign * Math.round((sign * (v - fixed)) / ctx.step) * ctx.step;

  // Size limits.
  if (sign > 0) v = Math.min(Math.max(v, fixed + MIN_ITEM_SIZE), fixed + MAX_ITEM_SIZE);
  else v = Math.max(Math.min(v, fixed - MIN_ITEM_SIZE), fixed - MAX_ITEM_SIZE);

  // First obstacle in the way of a sideways push.
  if (axis !== 'y') {
    for (const o of ctx.obstacles) {
      const inLane =
        overlap1D(start.min[a1], start.max[a1], o.min[a1], o.max[a1]) > EPS &&
        overlap1D(start.min[a2], start.max[a2], o.min[a2], o.max[a2]) > EPS;
      if (!inLane) continue;
      if (sign > 0 && o.min[axis] >= start.max[axis] - EPS) v = Math.min(v, o.min[axis]);
      if (sign < 0 && o.max[axis] <= start.min[axis] + EPS) v = Math.max(v, o.max[axis]);
    }
  }

  const result: Box = { min: { ...start.min }, max: { ...start.max } };
  if (sign > 0) result.max[axis] = v;
  else result.min[axis] = v;
  return result;
}
