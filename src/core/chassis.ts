import { CAB_FRONT_AXLE, TRUCK_CAB_GAP, bodyAxles } from './axles';
import { boxCenter } from './geometry';
import { CAB_LENGTH, COUPLING_GAP, type PlacedVehicle } from './layout';
import type { AxleGroup, Box, CargoBody, ChassisPart, ChassisPatch } from './types';

/*
 * Axle loads of a vehicle from where its cargo stands. Every body is a beam on two supports — its front and its
 * rear: the front axle (a rigid truck, a drawbar trailer), the kingpin on the tractor's fifth wheel (a semi-trailer)
 * or the drawbar on the hitch of the body in front (a centre-axle trailer). What a coupling carries goes on to the
 * unit under it: a kingpin onto the tractor's steering and drive axles, a drawbar onto the rear of the body in front.
 *
 * A static estimate for planning, not a weighbridge: every item weighs at the centre of its box, a group shares its
 * load evenly between its axles, the empty vehicle's weight is what the user entered per support (or typical figures).
 * Lengths in cm, weights in kg, `x` of a group from the front wall of its body towards the doors.
 */

/**
 * A 4×2 tractor with a 13,6 m tilt semi-trailer on three axles: the typical figures the editor starts from and the
 * calculator's TYPICAL_RIG (core/tools/axleLoads.ts), so both give the same loads. Positions from the front wall.
 */
export const EURO_RIG = {
  deckLength: 1360,
  kingpin: 120,
  bogie: 980,
  trailerTareKingpin: 2000,
  trailerTareAxles: 4800,
  tractorFront: 5000,
  tractorDrive: 2600,
  wheelbase: 370,
  fifthWheelAhead: 50,
} as const;

/** What can be entered (mirrored in backend/app/schemas/plan_data.py). */
export const AXLE_X_LIMIT: readonly [number, number] = [-1000, 3000];
export const AXLE_WEIGHT_LIMIT = 60000;
export const MAX_GROUP_AXLES = 4;

/** A steering axle should carry at least this share of its truck or tractor, or the vehicle steers badly (a rule of thumb). */
export const MIN_STEER_SHARE = 0.2;

/** Permissible load of a steering axle of a heavy truck or tractor, kg (what the manufacturers rate it for). */
const STEER_MAX = 8000;

/** Permissible load of a group with that many axles, kg: EU and EAEU figures for axles 1,3 m apart. */
export function groupMax(axles: number, drive = false): number {
  if (axles <= 1) return drive ? 11500 : 10000;
  return axles === 2 ? 18000 : 24000;
}

/** The supports of one body, every field filled in (the user's figures over the typical ones). */
export interface Chassis {
  front: AxleGroup;
  rear: AxleGroup;
  /** The tractor under a semi-trailer right behind the cab; null for every other body. */
  tractorFront: AxleGroup | null;
  tractorDrive: AxleGroup | null;
}

/** The supports a user may give another number of axles: the rear groups and the tractor's drive axles. */
export function axlesEditable(part: ChassisPart): boolean {
  return part === 'rear' || part === 'tractorDrive';
}

/** Supports whose position is the layout's, not the user's: a centre-axle trailer's drawbar is at the hitch. */
export function positionEditable(group: AxleGroup, part: ChassisPart, kind: CargoBody['kind']): boolean {
  return !(part === 'front' && group.axles === 0 && kind !== 'semi');
}

interface Typical {
  x: number;
  axles: number;
  tare: number;
  /** The permissible load for a number of axles (missing: not checked, as for a coupling). */
  max?: (axles: number) => number;
}

const round100 = (kg: number) => Math.round(kg / 100) * 100;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function validAxles(v: unknown): v is number {
  return finite(v) && Number.isInteger(v) && v >= 1 && v <= MAX_GROUP_AXLES;
}

/** The typical group with the user's figures over it (only valid ones: a plan may come from anywhere). */
function apply(t: Typical, p: Partial<AxleGroup> | undefined, part: ChassisPart, fixedX = false): AxleGroup {
  const axles = axlesEditable(part) && t.axles > 0 && validAxles(p?.axles) ? p.axles : t.axles;
  const x = !fixedX && finite(p?.x) ? clamp(p.x, AXLE_X_LIMIT[0], AXLE_X_LIMIT[1]) : t.x;
  const tare = finite(p?.tare) ? clamp(p.tare, 0, AXLE_WEIGHT_LIMIT) : t.tare;
  const max = axles > 0 ? (finite(p?.max) ? clamp(p.max, 0, AXLE_WEIGHT_LIMIT) : t.max?.(axles)) : undefined;
  return max ? { x, axles, tare, max } : { x, axles, tare };
}

/** Payload the typical figures of a truck or trailer scale with: the body's own, or one for its length. */
function payloadOf(body: CargoBody): number {
  return body.maxLoad && body.maxLoad > 0 ? body.maxLoad : round100(12.5 * body.dims.l);
}

function semiChassis(body: CargoBody, first: boolean, p: ChassisPatch): Chassis {
  const L = body.dims.l;
  const scale = L / EURO_RIG.deckLength;
  const trailerTare = EURO_RIG.trailerTareKingpin + EURO_RIG.trailerTareAxles;
  const tare = round100(trailerTare * scale);
  const onKingpin = round100((tare * EURO_RIG.trailerTareKingpin) / trailerTare);
  const front = apply({ x: Math.min(EURO_RIG.kingpin, Math.round(0.1 * L)), axles: 0, tare: onKingpin }, p.front, 'front');
  const rear = apply(
    {
      x: Math.round(EURO_RIG.bogie * scale),
      axles: Math.max(1, bodyAxles('semi', L).rear.length),
      tare: tare - onKingpin,
      max: (n) => groupMax(n),
    },
    p.rear,
    'rear',
  );
  if (!first) return { front, rear, tractorFront: null, tractorDrive: null };
  // The tractor follows its kingpin: the fifth wheel a little ahead of the drive axle.
  const tractorDrive = apply(
    { x: front.x + EURO_RIG.fifthWheelAhead, axles: 1, tare: EURO_RIG.tractorDrive, max: (n) => groupMax(n, true) },
    p.tractorDrive,
    'tractorDrive',
  );
  const tractorFront = apply(
    { x: tractorDrive.x - EURO_RIG.wheelbase, axles: 1, tare: EURO_RIG.tractorFront, max: () => STEER_MAX },
    p.tractorFront,
    'tractorFront',
  );
  return { front, rear, tractorFront, tractorDrive };
}

function truckChassis(body: CargoBody, p: ChassisPatch): Chassis {
  const L = body.dims.l;
  const payload = payloadOf(body);
  const tare = round100(0.8 * payload);
  const gross = tare + payload;
  const frontTare = round100(0.6 * tare);
  const axles = Math.max(1, bodyAxles('truck', L).rear.length);
  const front = apply(
    {
      x: -(TRUCK_CAB_GAP + CAB_LENGTH - CAB_FRONT_AXLE),
      axles: 1,
      tare: frontTare,
      max: () => round100(Math.min(STEER_MAX, 0.42 * gross)),
    },
    p.front,
    'front',
  );
  const rear = apply(
    {
      x: Math.round(L * (axles > 1 ? 0.58 : 0.55)),
      axles,
      tare: tare - frontTare,
      max: (n) => round100(Math.min(groupMax(n, true), 0.75 * gross)),
    },
    p.rear,
    'rear',
  );
  return { front, rear, tractorFront: null, tractorDrive: null };
}

function trailerChassis(body: CargoBody, p: ChassisPatch): Chassis {
  const L = body.dims.l;
  const payload = payloadOf(body);
  const tare = round100(0.45 * payload);
  const gross = tare + payload;
  // The same axles as the picture (core/axles.ts): a drawbar trailer, or a centre-axle one when too short for both.
  const gear = bodyAxles('trailer', L);
  const axles = Math.max(1, gear.rear.length);
  const rearX = gear.rear.length > 0 ? Math.round(L - gear.rear.reduce((a, b) => a + b, 0) / gear.rear.length) : Math.round(L / 2);
  if (gear.front !== null) {
    const frontTare = round100(0.45 * tare);
    const front = apply(
      { x: L - gear.front, axles: 1, tare: frontTare, max: () => round100(Math.min(groupMax(1), 0.5 * gross)) },
      p.front,
      'front',
    );
    const rear = apply(
      { x: rearX, axles, tare: tare - frontTare, max: (n) => round100(Math.min(groupMax(n), 0.75 * gross)) },
      p.rear,
      'rear',
    );
    return { front, rear, tractorFront: null, tractorDrive: null };
  }
  const onDrawbar = round100(0.1 * tare);
  const front = apply({ x: -COUPLING_GAP, axles: 0, tare: onDrawbar }, p.front, 'front', true);
  const rear = apply({ x: rearX, axles, tare: tare - onDrawbar, max: (n) => round100(Math.min(groupMax(n), gross)) }, p.rear, 'rear');
  return { front, rear, tractorFront: null, tractorDrive: null };
}

/** The running gear of a body: what the user entered (`body.chassis`) over the typical figures for its kind and size. */
export function chassisOf(body: CargoBody, first: boolean): Chassis {
  const patch = body.chassis ?? {};
  if (body.kind === 'semi') return semiChassis(body, first, patch);
  if (body.kind === 'truck') return truckChassis(body, patch);
  return trailerChassis(body, patch);
}

/** The typical running gear, as if the user had entered nothing. */
export function typicalChassis(body: CargoBody, first: boolean): Chassis {
  return chassisOf({ ...body, chassis: undefined }, first);
}

const GROUP_FIELDS = ['x', 'axles', 'tare', 'max'] as const;
type GroupField = (typeof GROUP_FIELDS)[number];
const PARTS: readonly ChassisPart[] = ['tractorFront', 'tractorDrive', 'front', 'rear'];

/** Only the valid figures of a patch, rounded (cm, kg); undefined when nothing is left. */
export function cleanChassis(patch: unknown): ChassisPatch | undefined {
  if (!patch || typeof patch !== 'object') return undefined;
  const out: ChassisPatch = {};
  for (const part of PARTS) {
    const src = (patch as Record<string, unknown>)[part];
    if (!src || typeof src !== 'object') continue;
    const group: Partial<AxleGroup> = {};
    for (const field of GROUP_FIELDS) {
      const v = (src as Record<string, unknown>)[field];
      if (!finite(v)) continue;
      if (field === 'axles') {
        if (validAxles(v) && axlesEditable(part)) group.axles = v;
      } else if (field === 'x') group.x = Math.round(clamp(v, AXLE_X_LIMIT[0], AXLE_X_LIMIT[1]));
      else group[field] = Math.round(clamp(v, 0, AXLE_WEIGHT_LIMIT));
    }
    if (Object.keys(group).length > 0) out[part] = group;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The body's patch with one figure set (or, with undefined, back to the typical one). */
export function withChassisValue(
  chassis: ChassisPatch | undefined,
  part: ChassisPart,
  field: GroupField,
  value: number | undefined,
): ChassisPatch | undefined {
  const group = { ...chassis?.[part] };
  if (value === undefined) delete group[field];
  else group[field] = value;
  return cleanChassis({ ...chassis, [part]: group });
}

/** Whether the user changed this figure of the body. */
export function isOverridden(body: CargoBody, part: ChassisPart, field: GroupField): boolean {
  return body.chassis?.[part]?.[field] !== undefined;
}

export interface AxleLoad {
  /** `${bodyId}:${part}` */
  key: string;
  bodyId: string;
  /** Index of the body in its vehicle. */
  bodyIndex: number;
  kind: CargoBody['kind'];
  part: ChassisPart;
  /** Axles in the group; 0 for a coupling (a kingpin, a drawbar), which is shown but has no wheels of its own. */
  axles: number;
  /** World X of the centre of the group. */
  x: number;
  /** kg on the support: the empty vehicle and the cargo (negative: it is pulled up). */
  load: number;
  /** The cargo's part of it. */
  cargo: number;
  /** The empty vehicle's part (its own and what couplings bring). */
  tare: number;
  max?: number;
  /** `load` per axle. */
  perAxle: number;
  /** Over the permissible load. */
  over: boolean;
  /** Pulled up instead of pressed down: the vehicle tips about its other support. */
  lifted: boolean;
  /** A steering axle with less than MIN_STEER_SHARE of its truck or tractor. */
  light: boolean;
  /** The only wheels of a centre-axle trailer (its front is a drawbar). */
  centreAxle: boolean;
}

export interface VehicleAxles {
  vehicleId: string;
  /** From the cab back: the tractor, then every body's front and rear (couplings included, axles 0). */
  groups: AxleLoad[];
  /** The whole vehicle on its wheels, kg: the empty vehicle and the cargo in its bodies. */
  gross: number;
  cargo: number;
  over: boolean;
  lifted: boolean;
  light: boolean;
}

export interface WeightedBox {
  box: Box;
  weight: number;
}

interface Force {
  load: number;
  cargo: number;
}

/** Share of a load at world X `x` that the front support (at `front`) takes from a beam on `front` and `rear`. */
function frontShare(x: number, front: number, rear: number): number {
  const span = front - rear;
  return Math.abs(span) < 1 ? 0.5 : (x - rear) / span;
}

/** Spreads forces over two supports by the lever rule. */
function spread(forces: ReadonlyArray<Force & { x: number }>, front: number, rear: number, a: Force, b: Force): void {
  for (const f of forces) {
    const share = frontShare(f.x, front, rear);
    a.load += f.load * share;
    a.cargo += f.cargo * share;
    b.load += f.load * (1 - share);
    b.cargo += f.cargo * (1 - share);
  }
}

/** Axle loads of one vehicle; `cargo` — the weighted items in each of its bodies, by body id. */
export function vehicleAxleLoads(pv: PlacedVehicle, cargo: ReadonlyMap<string, readonly WeightedBox[]>): VehicleAxles {
  const perBody: AxleLoad[][] = [];
  // What a centre-axle trailer behind puts on the rear of the body in front of it.
  let hitch: Force | null = null;
  for (let i = pv.bodies.length - 1; i >= 0; i--) {
    const pb = pv.bodies[i];
    const ch = chassisOf(pb.body, i === 0);
    const wall = pb.box.max.x;
    const xf = wall - ch.front.x;
    const xr = wall - ch.rear.x;
    const forces: Array<Force & { x: number }> = [];
    for (const { box, weight } of cargo.get(pb.body.id) ?? []) {
      if (weight > 0) forces.push({ x: boxCenter(box).x, load: weight, cargo: weight });
    }
    if (hitch) forces.push({ x: pb.box.min.x, ...hitch });
    hitch = null;
    const front: Force = { load: ch.front.tare, cargo: 0 };
    const rear: Force = { load: ch.rear.tare, cargo: 0 };
    spread(forces, xf, xr, front, rear);

    const row = (part: ChassisPart, g: AxleGroup, x: number, f: Force): AxleLoad => ({
      key: `${pb.body.id}:${part}`,
      bodyId: pb.body.id,
      bodyIndex: i,
      kind: pb.body.kind,
      part,
      axles: g.axles,
      x,
      load: f.load,
      cargo: f.cargo,
      tare: f.load - f.cargo,
      max: g.max,
      perAxle: g.axles > 0 ? f.load / g.axles : f.load,
      over: g.max !== undefined && f.load > g.max + 1e-6,
      lifted: f.load < -1e-6,
      light: false,
      centreAxle: part === 'rear' && pb.body.kind === 'trailer' && ch.front.axles === 0,
    });
    const rows: AxleLoad[] = [];
    if (ch.tractorFront && ch.tractorDrive) {
      const xtf = wall - ch.tractorFront.x;
      const xtd = wall - ch.tractorDrive.x;
      const steer: Force = { load: ch.tractorFront.tare, cargo: 0 };
      const drive: Force = { load: ch.tractorDrive.tare, cargo: 0 };
      spread([{ x: xf, ...front }], xtf, xtd, steer, drive);
      const steerRow = row('tractorFront', ch.tractorFront, xtf, steer);
      steerRow.light = isLight(steer.load, steer.load + drive.load);
      rows.push(steerRow, row('tractorDrive', ch.tractorDrive, xtd, drive));
    } else if (ch.front.axles === 0 && i > 0) {
      hitch = front;
    }
    const frontRow = row('front', ch.front, xf, front);
    if (i === 0 && pb.body.kind === 'truck' && ch.front.axles > 0) frontRow.light = isLight(front.load, front.load + rear.load);
    rows.push(frontRow, row('rear', ch.rear, xr, rear));
    perBody[i] = rows;
  }
  const groups = perBody.flat();
  const wheels = groups.filter((g) => g.axles > 0);
  return {
    vehicleId: pv.vehicle.id,
    groups,
    gross: wheels.reduce((sum, g) => sum + g.load, 0),
    cargo: wheels.reduce((sum, g) => sum + g.cargo, 0),
    over: groups.some((g) => g.over),
    lifted: groups.some((g) => g.lifted),
    light: groups.some((g) => g.light),
  };
}

function isLight(steer: number, unit: number): boolean {
  return unit > 0 && steer >= 0 && steer < MIN_STEER_SHARE * unit;
}

/** «Передняя ось тягача», «Оси полуприцепа», «Сцепка (дышло)»… */
export function groupLabel(g: Pick<AxleLoad, 'part' | 'kind' | 'axles' | 'centreAxle'>): string {
  const many = g.axles > 1;
  switch (g.part) {
    case 'tractorFront':
      return 'Передняя ось тягача';
    case 'tractorDrive':
      return many ? 'Ведущие оси тягача' : 'Ведущая ось тягача';
    case 'front':
      if (g.kind === 'semi') return 'Седло (шкворень)';
      if (g.axles === 0) return 'Сцепка (дышло)';
      return g.kind === 'trailer' ? 'Передняя ось прицепа' : 'Передняя ось';
    case 'rear':
      if (g.kind === 'semi') return many ? 'Оси полуприцепа' : 'Ось полуприцепа';
      if (g.kind === 'trailer' && g.centreAxle) return many ? 'Оси прицепа' : 'Ось прицепа';
      if (g.kind === 'trailer') return many ? 'Задние оси прицепа' : 'Задняя ось прицепа';
      return many ? 'Задние оси' : 'Задняя ось';
  }
}
