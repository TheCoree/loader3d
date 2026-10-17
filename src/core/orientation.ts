import type { Dims, Orientation } from './types';

/**
 * Extension point for rotation. Everything else in the app works with the world-axis size returned
 * here, so adding tilt orientations means extending `Orientation` and these two functions.
 * Free (non 90°) rotation would additionally need oriented boxes in `geometry.ts`/`physics.ts`.
 */
export function effectiveDims(dims: Dims, o: Orientation): Dims {
  return o.yaw === 90 ? { l: dims.w, w: dims.l, h: dims.h } : dims;
}

/** Inverse of {@link effectiveDims}: converts a world-axis size back to the item's own dimensions. */
export function intrinsicDims(world: Dims, o: Orientation): Dims {
  return o.yaw === 90 ? { l: world.w, w: world.l, h: world.h } : world;
}

export function rotateYaw90(o: Orientation): Orientation {
  return { ...o, yaw: o.yaw === 90 ? 0 : 90 };
}
