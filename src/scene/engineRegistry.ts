import type { SceneEngine } from './SceneEngine';

/** The mounted engine, for UI commands (camera presets, focus). Null until the viewport mounts. */
let current: SceneEngine | null = null;

export function setEngine(engine: SceneEngine | null): void {
  current = engine;
}

export function getEngine(): SceneEngine | null {
  return current;
}
