/**
 * Scene palettes. UI colours live in src/index.css (--primary = accent); keep the accent in sync.
 *
 * The scene follows the app theme: `COLORS` holds the palette in effect and is read when the views
 * create their materials, so the editor re-creates the engine when the theme changes
 * (editor/Viewport.tsx). The PDF report and the plan previews are always drawn light
 * ({@link withScenePalette}).
 */
export const LIGHT_COLORS = {
  background: '#e7ebf0',
  yard: '#c9d0d8',
  dockTop: '#eceff3',
  dockSide: '#b9c0c9',
  dockGrid: '#d3d9e1',
  dockText: 'rgba(47, 58, 75, 0.32)',
  stripeYellow: '#f2c230',
  stripeDark: '#2b2f36',
  floor: '#dde3ea',
  floorLines: '#bcc6d3',
  frame: '#2f3a4b',
  wall: '#86aee3',
  bulkhead: '#5f86bf',
  chassis: '#2a313c',
  tire: '#1e232b',
  hub: '#a3acb7',
  rim: '#c9d0d8',
  tailLight: '#d9434b',
  indicator: '#f2a23a',
  cab: '#f5f7fa',
  cabTrim: '#3a4659',
  glass: '#26364b',
  light: '#fff4c2',
  accent: '#2f6fed',
  accentDark: '#1d4fc4',
  danger: '#e5484d',
  wallSnap: '#13a35a',
  dims: '#475569',
};

export type ScenePalette = typeof LIGHT_COLORS;

/** Neutral graphite, like the dark app UI: light edges and dimensions on a near-black yard. */
export const DARK_COLORS: ScenePalette = {
  background: '#0c0c0e',
  yard: '#111114',
  dockTop: '#202127',
  dockSide: '#0d0d10',
  dockGrid: '#2c2d34',
  dockText: 'rgba(205, 210, 220, 0.16)',
  stripeYellow: '#d8ac2a',
  stripeDark: '#141417',
  floor: '#1c1d22',
  floorLines: '#30323a',
  frame: '#c3c9d3',
  wall: '#6b98f2',
  bulkhead: '#4f7fe6',
  chassis: '#23262c',
  tire: '#0b0b0d',
  hub: '#5c626b',
  rim: '#80878f',
  tailLight: '#d9434b',
  indicator: '#f2a23a',
  cab: '#3b3e46',
  cabTrim: '#18191d',
  glass: '#0e1621',
  light: '#fff4c2',
  accent: '#2f6fed',
  accentDark: '#7aa5f7',
  danger: '#e5484d',
  wallSnap: '#22c55e',
  dims: '#a3abb8',
};

/** The palette in effect (mutated in place by {@link setScenePalette}). */
export const COLORS: ScenePalette = { ...LIGHT_COLORS };

let dark = false;

export function setScenePalette(isDark: boolean): void {
  dark = isDark;
  Object.assign(COLORS, isDark ? DARK_COLORS : LIGHT_COLORS);
}

export function isScenePaletteDark(): boolean {
  return dark;
}

/** Runs `fn` with the light palette (print, previews) and restores the one in effect. */
export function withScenePalette<T>(isDark: boolean, fn: () => T): T {
  const before = dark;
  setScenePalette(isDark);
  try {
    return fn();
  } finally {
    setScenePalette(before);
  }
}
