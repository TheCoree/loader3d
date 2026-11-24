import type { BodyKind } from './types';

/*
 * Wheel geometry, and where the axles of a body of a given kind and length typically go: the starting point of
 * core/chassis.ts for bodies without a template (the scene draws what chassis.ts resolves). The axles follow the
 * length of the body, so that the wheels of a short van, trailer or semi-trailer never run into each other.
 * Lengths in cm; positions along X.
 */

export const WHEEL_RADIUS = 52;
/** Between the axles of one group (a tandem, a tridem): the tyres 26 cm apart. */
export const AXLE_SPACING = 130;
/** Least distance between a drawbar trailer's front axle and its rear group. */
export const AXLE_GAP = 2 * WHEEL_RADIUS + 40;
/** Front axle of the cab, from the cab's front face: a European cab-over's front overhang, the wheel under the door. */
export const CAB_FRONT_AXLE = 140;
/** Gap between a rigid truck's first body and its cab (a tractor stands CAB_GAP ahead of its semi-trailer). */
export const TRUCK_CAB_GAP = 14;
/** The semi-trailer's landing gear, from its front wall backwards; its feet are 30 long. */
export const LANDING_GEAR = 280;
/** The narrowest half-track of a body: the wheels of a narrow body do not crowd under its middle. */
export const MIN_HALF_TRACK = 75;
/** Rear axles longer bodies of rigid trucks get a tandem from. */
const TRUCK_TANDEM_FROM = 600;
/** The first tyre stays clear of the rear crossmember (30 long) under the doors. */
const REAR_CLEARANCE = WHEEL_RADIUS + 40;

export interface BodyAxles {
  /** The rear group, from the rear wall forwards (empty: a semi-trailer too short for axles rests on the tractor). */
  rear: number[];
  /** A drawbar trailer's front (steering) axle, from the rear wall; null for the other bodies and a centre-axle trailer. */
  front: number | null;
  /** A semi-trailer's landing gear, in front of its axles. */
  landingGear: boolean;
}

/** Up to `max` axles AXLE_SPACING apart with their centres between `lo` and `hi`, the first one as close to `prefer` as fits. */
function fitAxles(lo: number, hi: number, max: number, prefer: number): number[] {
  if (hi < lo) return [];
  const count = Math.min(max, Math.floor((hi - lo) / AXLE_SPACING) + 1);
  const first = Math.min(Math.max(prefer, lo), hi - (count - 1) * AXLE_SPACING);
  return Array.from({ length: count }, (_, i) => first + i * AXLE_SPACING);
}

/** The axles under a cargo body of the given kind and length, as offsets from its rear wall. */
export function bodyAxles(kind: BodyKind, length: number): BodyAxles {
  const L = length;
  if (kind === 'truck') {
    // Under the body (the cab's front axle is well ahead); a tandem only under a long body.
    const rear = fitAxles(REAR_CLEARANCE, L - WHEEL_RADIUS - 10, L >= TRUCK_TANDEM_FROM ? 2 : 1, Math.min(150, 0.36 * L));
    return { rear: rear.length > 0 ? rear : [L / 2], front: null, landingGear: false };
  }
  if (kind === 'semi') {
    // Behind the landing gear, which stands behind the tractor's drive axles.
    const rear = fitAxles(REAR_CLEARANCE, L - LANDING_GEAR - 25 - WHEEL_RADIUS, 3, 140);
    return { rear, front: null, landingGear: rear.length > 0 };
  }
  // A drawbar trailer: the steering axle under the front, the rear group well behind it…
  const front = L - 150;
  const rear = fitAxles(REAR_CLEARANCE, front - AXLE_GAP, 2, 140);
  if (rear.length > 0) return { rear, front, landingGear: false };
  // …or, too short for both, a centre-axle trailer.
  const count = L - 2 * REAR_CLEARANCE >= AXLE_SPACING ? 2 : 1;
  return {
    rear: Array.from({ length: count }, (_, i) => L / 2 + (i - (count - 1) / 2) * AXLE_SPACING),
    front: null,
    landingGear: false,
  };
}

/** Half of a body's track (wheel centres from its centreline): under its sides, never narrower than MIN_HALF_TRACK. */
export function bodyHalfTrack(width: number): number {
  return Math.max(width / 2 - 28, MIN_HALF_TRACK);
}
