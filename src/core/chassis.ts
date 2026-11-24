import { AXLE_SPACING, CAB_FRONT_AXLE, LANDING_GEAR, TRUCK_CAB_GAP, WHEEL_RADIUS, bodyAxles } from './axles';
import { boxCenter } from './geometry';
import { CAB_GAP, CAB_LENGTH, COUPLING_GAP, type PlacedVehicle } from './layout';
import type { AxleGroup, Box, BodyKind, CargoBody, ChassisPart, ChassisPatch } from './types';

/*
 * Axle loads of a vehicle from where its cargo stands. Every body is a beam on two supports — its front and its
 * rear: the front axle (a rigid truck, a drawbar trailer), the kingpin on the tractor's fifth wheel (a semi-trailer)
 * or the drawbar on the hitch of the body in front (a centre-axle trailer). What a coupling carries goes on to the
 * unit under it: a kingpin onto the tractor's steering and drive axles, a drawbar onto the rear of the body in front.
 *
 * A static estimate for planning, not a weighbridge: every item weighs at the centre of its box, a group shares its
 * load evenly between its axles, the empty vehicle's weight is what the user entered per support (or the figures of
 * the vehicle's template, or typical ones). Lengths in cm, weights in kg, `x` of a group from the front wall of its
 * body towards the doors. The scene draws the wheels where these groups are (bodyWheels, cabWheels).
 */

/**
 * A steering axle is part of its cab, which the scene draws at a fixed place: under a tractor CAB_GAP ahead of the
 * semi-trailer, under a rigid truck TRUCK_CAB_GAP ahead of its body. Its x (negative: ahead of the front wall).
 */
export const TRACTOR_STEER_X = -(CAB_GAP + CAB_LENGTH - CAB_FRONT_AXLE);
export const TRUCK_STEER_X = -(TRUCK_CAB_GAP + CAB_LENGTH - CAB_FRONT_AXLE);

/**
 * A 4×2 tractor with a 13,6 m tilt semi-trailer on three axles (the «Еврофура» template): what the editor starts from
 * and the calculator's TYPICAL_RIG (core/tools/axleLoads.ts), so both give the same loads. Positions from the front
 * wall: the kingpin 1,6 m in (12 m to the rear end, the EU limit), the tridem centre 7,75 m behind it; the fifth
 * wheel 0,6 m ahead of the drive axle; the wheelbase reaches the steering axle under the cab (TRACTOR_STEER_X).
 */
export const EURO_RIG = {
  deckLength: 1360,
  kingpin: 160,
  bogie: 935,
  trailerTareKingpin: 2000,
  trailerTareAxles: 4800,
  tractorFront: 5000,
  tractorDrive: 2600,
  wheelbase: 350,
  fifthWheelAhead: 60,
} as const;

/** What a plan may hold (mirrored in backend/app/schemas/plan_data.py); the figures in use are within axleRanges(). */
export const AXLE_X_LIMIT: readonly [number, number] = [-1000, 3000];
export const AXLE_WEIGHT_LIMIT = 60000;
export const MAX_GROUP_AXLES = 4;
/** A tractor has one or two drive axles (4×2, 6×2 / 6×4). */
export const MAX_DRIVE_AXLES = 2;

/** A steering axle should carry at least this share of its truck or tractor, or the vehicle steers badly (a rule of thumb). */
export const MIN_STEER_SHARE = 0.2;

/** Permissible load of a steering axle of a heavy truck or tractor, kg (what the manufacturers rate it for). */
const STEER_MAX = 8000;

/** Permissible load of a group with that many axles, kg: EU and EAEU figures for axles 1,3 m apart. */
export function groupMax(axles: number, drive = false): number {
  if (axles <= 1) return drive ? 11500 : 10000;
  return axles === 2 ? 18000 : 24000;
}

/** What one support may weigh empty and be permitted, kg: within reason for that many axles (0 — a coupling). */
export function axleWeightRange(axles: number): { tare: number; max: number } {
  return axles > 0 ? { tare: 9000 * axles, max: 13000 * axles } : { tare: 15000, max: 0 };
}

/** The supports of one body, every field filled in (the user's figures over the template's or typical ones). */
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

/**
 * Supports whose position is the vehicle's, not the user's: a steering axle (under the cab) and a centre-axle trailer's
 * drawbar (at the hitch of the body in front).
 */
export function positionEditable(group: AxleGroup, part: ChassisPart, kind: BodyKind): boolean {
  if (part === 'tractorFront') return false;
  if (part !== 'front') return true;
  if (kind === 'semi') return true;
  return kind === 'trailer' && group.axles > 0;
}

/* ---------- The vehicles of the templates ---------- */

interface ModelGroup {
  x: number;
  axles: number;
  tare: number;
  max?: number;
}

interface TractorModel {
  /** The fifth wheel this far ahead of the drive axle(s), cm. */
  lead: number;
  front: Omit<ModelGroup, 'x'>;
  drive: Omit<ModelGroup, 'x'>;
}

export interface ChassisModel {
  /** What the figures are of, for «Значения по умолчанию — …». */
  label: string;
  kind: BodyKind;
  /** The inside length the figures are for: a body resized more than MODEL_TOLERANCE off it gets typical ones. */
  length: number;
  front: ModelGroup;
  rear: ModelGroup;
  tractor?: TractorModel;
}

const MODEL_TOLERANCE = 0.1;

/** A 4×2 tractor: 7,6 t empty, the steering axle rated for 8 t, the drive axle for 11,5 t. */
const TRACTOR_4X2: TractorModel = {
  lead: EURO_RIG.fifthWheelAhead,
  front: { axles: 1, tare: EURO_RIG.tractorFront, max: STEER_MAX },
  drive: { axles: 1, tare: EURO_RIG.tractorDrive, max: groupMax(1, true) },
};

/**
 * The running gear of the vehicles of the templates (core/presets.ts `chassisModel`): where the axles are, what the
 * empty vehicle puts on them and what they are permitted, from the papers of common vehicles of the kind.
 */
export const CHASSIS_MODELS = {
  'euro-tent': {
    label: 'тентованный полуприцеп 13,6 м на трёх осях и тягач 4×2',
    kind: 'semi',
    length: EURO_RIG.deckLength,
    front: { x: EURO_RIG.kingpin, axles: 0, tare: EURO_RIG.trailerTareKingpin },
    rear: { x: EURO_RIG.bogie, axles: 3, tare: EURO_RIG.trailerTareAxles, max: 24000 },
    tractor: TRACTOR_4X2,
  },
  'euro-mega': {
    label: 'мега-трейлер 13,6 м на трёх осях и низкорамный тягач 4×2',
    kind: 'semi',
    length: 1360,
    front: { x: 160, axles: 0, tare: 2200 },
    rear: { x: 935, axles: 3, tare: 5000, max: 24000 },
    tractor: TRACTOR_4X2,
  },
  'euro-reefer': {
    label: 'рефрижератор 13,4 м (холодильная установка у передней стенки) и тягач 4×2',
    kind: 'semi',
    length: 1340,
    front: { x: 160, axles: 0, tare: 3300 },
    rear: { x: 925, axles: 3, tare: 5700, max: 24000 },
    tractor: TRACTOR_4X2,
  },
  'container-40': {
    label: 'контейнер 40′ на трёхосном шасси и тягач 4×2',
    kind: 'semi',
    length: 1203,
    front: { x: 100, axles: 0, tare: 2600 },
    rear: { x: 860, axles: 3, tare: 6100, max: 24000 },
    tractor: { ...TRACTOR_4X2, lead: 70 },
  },
  'container-20': {
    label: 'контейнер 20′ на двухосном шасси и тягач 4×2',
    kind: 'semi',
    length: 590,
    front: { x: 100, axles: 0, tare: 2000 },
    rear: { x: 445, axles: 2, tare: 3900, max: 18000 },
    tractor: { ...TRACTOR_4X2, lead: 70 },
  },
  'jumbo-truck': {
    label: 'грузовик 6×2 сцепки, полная масса 26 т',
    kind: 'truck',
    length: 770,
    front: { x: TRUCK_STEER_X, axles: 1, tare: 6000, max: STEER_MAX },
    rear: { x: 450, axles: 2, tare: 5000, max: 18000 },
  },
  'jumbo-trailer': {
    label: 'прицеп 8,2 м с поворотной передней осью и тандемом',
    kind: 'trailer',
    length: 820,
    front: { x: 150, axles: 1, tare: 2700, max: 10000 },
    rear: { x: 615, axles: 2, tare: 3300, max: 18000 },
  },
  'truck-18t': {
    label: 'грузовик 4×2 полной массой 18 т',
    kind: 'truck',
    length: 800,
    front: { x: TRUCK_STEER_X, axles: 1, tare: 5000, max: 7500 },
    rear: { x: 490, axles: 1, tare: 3000, max: 11500 },
  },
  'van-7t': {
    label: 'среднетоннажный грузовик-фургон 4×2 полной массой 7 т',
    kind: 'truck',
    length: 420,
    front: { x: TRUCK_STEER_X, axles: 1, tare: 2200, max: 2800 },
    rear: { x: 240, axles: 1, tare: 1300, max: 5000 },
  },
} as const satisfies Record<string, ChassisModel>;

export type ChassisModelId = keyof typeof CHASSIS_MODELS;

/** The template's running gear of a body, while the body is still about its size; null — typical figures. */
export function chassisModelOf(body: CargoBody): ChassisModel | null {
  const model: ChassisModel | undefined = (CHASSIS_MODELS as Record<string, ChassisModel>)[body.chassisModel ?? ''];
  if (!model || model.kind !== body.kind) return null;
  return Math.abs(body.dims.l - model.length) <= MODEL_TOLERANCE * model.length ? model : null;
}

/* ---------- Typical figures, the user's ones over them, and the limits of reason ---------- */

interface Typical {
  x: number;
  axles: number;
  tare: number;
  /** The permissible load for a number of axles (missing: not checked, as for a coupling). */
  max?: (axles: number) => number;
}

interface Gear {
  front: Typical;
  rear: Typical;
  /** Under a semi-trailer right behind the cab: the fifth wheel's lead and the tractor's axles (x follows the kingpin). */
  tractor: { lead: number; front: Typical; drive: Typical } | null;
}

const round100 = (kg: number) => Math.round(kg / 100) * 100;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function validAxles(v: unknown, part: ChassisPart): v is number {
  const most = part === 'tractorDrive' ? MAX_DRIVE_AXLES : MAX_GROUP_AXLES;
  return finite(v) && Number.isInteger(v) && v >= 1 && v <= most;
}

/** Half the length of a group of axles AXLE_SPACING apart, centre to the outer axle. */
const halfSpread = (axles: number) => (Math.max(1, axles) - 1) * AXLE_SPACING * 0.5;

/** A template's group as typical: its own limit for its own axle count, the usual one for another count. */
function fromModel(g: ModelGroup | Omit<ModelGroup, 'x'>, drive = false): Typical {
  const max = g.max;
  return {
    x: 'x' in g ? g.x : 0,
    axles: g.axles,
    tare: g.tare,
    max: max === undefined ? undefined : (n) => (n === g.axles ? max : groupMax(n, drive)),
  };
}

/** Payload the typical figures of a truck or trailer scale with: the body's own, or one for its length. */
function payloadOf(body: CargoBody): number {
  return body.maxLoad && body.maxLoad > 0 ? body.maxLoad : round100(12.5 * body.dims.l);
}

function typicalGear(body: CargoBody, first: boolean): Gear {
  const L = body.dims.l;
  if (body.kind === 'semi') {
    const scale = L / EURO_RIG.deckLength;
    const trailerTare = EURO_RIG.trailerTareKingpin + EURO_RIG.trailerTareAxles;
    const tare = round100(trailerTare * scale);
    const onKingpin = round100((tare * EURO_RIG.trailerTareKingpin) / trailerTare);
    return {
      front: { x: Math.min(EURO_RIG.kingpin, Math.round(0.12 * L)), axles: 0, tare: onKingpin },
      rear: {
        x: Math.round(EURO_RIG.bogie * scale),
        axles: Math.max(1, bodyAxles('semi', L).rear.length),
        tare: tare - onKingpin,
        max: (n) => groupMax(n),
      },
      tractor: first ? { lead: TRACTOR_4X2.lead, front: fromModel(TRACTOR_4X2.front), drive: fromModel(TRACTOR_4X2.drive, true) } : null,
    };
  }
  const payload = payloadOf(body);
  if (body.kind === 'truck') {
    const tare = round100(0.8 * payload);
    const gross = tare + payload;
    const frontTare = round100(0.6 * tare);
    const axles = Math.max(1, bodyAxles('truck', L).rear.length);
    return {
      front: { x: TRUCK_STEER_X, axles: 1, tare: frontTare, max: () => round100(Math.min(STEER_MAX, 0.42 * gross)) },
      rear: {
        x: Math.round(L * (axles > 1 ? 0.58 : 0.55)),
        axles,
        tare: tare - frontTare,
        max: (n) => round100(Math.min(groupMax(n, true), 0.75 * gross)),
      },
      tractor: null,
    };
  }
  const tare = round100(0.45 * payload);
  const gross = tare + payload;
  // Where the axles of a trailer go by its length (core/axles.ts): a drawbar trailer, or a centre-axle one when too short for both.
  const gear = bodyAxles('trailer', L);
  const axles = Math.max(1, gear.rear.length);
  const rearX = gear.rear.length > 0 ? Math.round(L - gear.rear.reduce((a, b) => a + b, 0) / gear.rear.length) : Math.round(L / 2);
  if (gear.front !== null) {
    const frontTare = round100(0.45 * tare);
    return {
      front: { x: L - gear.front, axles: 1, tare: frontTare, max: () => round100(Math.min(groupMax(1), 0.5 * gross)) },
      rear: { x: rearX, axles, tare: tare - frontTare, max: (n) => round100(Math.min(groupMax(n), 0.75 * gross)) },
      tractor: null,
    };
  }
  const onDrawbar = round100(0.1 * tare);
  return {
    front: { x: -COUPLING_GAP, axles: 0, tare: onDrawbar },
    rear: { x: rearX, axles, tare: tare - onDrawbar, max: (n) => round100(Math.min(groupMax(n), gross)) },
    tractor: null,
  };
}

function gearOf(body: CargoBody, first: boolean): Gear {
  const model = chassisModelOf(body);
  if (!model) return typicalGear(body, first);
  const tractor = body.kind === 'semi' && first ? (model.tractor ?? TRACTOR_4X2) : null;
  return {
    front: fromModel(model.front),
    rear: fromModel(model.rear, body.kind === 'truck'),
    tractor: tractor && { lead: tractor.lead, front: fromModel(tractor.front), drive: fromModel(tractor.drive, true) },
  };
}

/** The typical (or template's) group with the user's figures over it — only valid ones: a plan may come from anywhere. */
function apply(t: Typical, p: Partial<AxleGroup> | undefined, part: ChassisPart): AxleGroup {
  const axles = axlesEditable(part) && t.axles > 0 && validAxles(p?.axles, part) ? p.axles : t.axles;
  const weights = axleWeightRange(axles);
  const x = finite(p?.x) ? p.x : t.x;
  const tare = clamp(finite(p?.tare) ? p.tare : t.tare, 0, weights.tare);
  const max = axles > 0 ? clamp(finite(p?.max) ? p.max : (t.max?.(axles) ?? 0), 0, weights.max) : 0;
  return max > 0 ? { x, axles, tare, max } : { x, axles, tare };
}

/** Where each support may be: [min, max] of x — wheels under the body or the cab, clear of each other and the landing gear. */
export type AxleRanges = Record<ChassisPart, readonly [number, number]>;

/** Narrows `x` into [lo, hi]; an empty range (a body too short for the rule) gives its upper end. */
function within(x: number, lo: number, hi: number): { x: number; range: readonly [number, number] } {
  if (lo > hi) return { x: hi, range: [hi, hi] };
  return { x: clamp(x, lo, hi), range: [lo, hi] };
}

/** The gap between the tyres of two neighbouring groups, cm. */
const TYRE_GAP = 40;
/** Wheels stay this far inside the rear wall. */
const REAR_MARGIN = 10;
/** A tractor's wheelbase, steering axle to the centre of the drive axles, cm. */
const WHEELBASE: readonly [number, number] = [300, 550];
/** A rigid truck's wheelbase at the least, cm. */
const TRUCK_WHEELBASE_MIN = 250;

interface Resolved {
  chassis: Chassis;
  ranges: AxleRanges;
  /** A semi-trailer's landing gear, x from its front wall; null for the other bodies. */
  landingGear: number | null;
}

function resolve(body: CargoBody, first: boolean): Resolved {
  const p = body.chassis ?? {};
  const L = body.dims.l;
  const g = gearOf(body, first);
  const R = WHEEL_RADIUS;
  const fixed = (x: number): readonly [number, number] => [x, x];

  // The front: a kingpin or a trailer's front axle the user may move; a steering axle or a drawbar stays where it is.
  const front = apply(g.front, p.front, 'front');
  let frontRange: readonly [number, number];
  if (!positionEditable(front, 'front', body.kind)) {
    front.x = g.front.x;
    frontRange = fixed(g.front.x);
  } else if (body.kind === 'semi') {
    ({ x: front.x, range: frontRange } = within(front.x, 40, Math.min(300, L / 2)));
  } else {
    ({ x: front.x, range: frontRange } = within(front.x, R + 20, L / 2 - 50));
  }

  // The tractor follows the kingpin: the fifth wheel a little ahead of the drive axle, the steering axle under the cab.
  let tractorDrive: AxleGroup | null = null;
  let tractorFront: AxleGroup | null = null;
  let driveRange: readonly [number, number] = fixed(0);
  if (g.tractor) {
    tractorDrive = apply({ ...g.tractor.drive, x: front.x + g.tractor.lead }, p.tractorDrive, 'tractorDrive');
    const lo = Math.max(front.x - 40, TRACTOR_STEER_X + WHEELBASE[0]);
    const hi = Math.min(front.x + 150, TRACTOR_STEER_X + WHEELBASE[1]);
    ({ x: tractorDrive.x, range: driveRange } = within(tractorDrive.x, lo, hi));
    tractorFront = { ...apply(g.tractor.front, p.tractorFront, 'tractorFront'), x: TRACTOR_STEER_X };
  }

  // A semi-trailer stands on its landing gear, behind the tractor's wheels.
  let landingGear: number | null = null;
  if (body.kind === 'semi') {
    landingGear = tractorDrive
      ? Math.max(LANDING_GEAR, Math.round(tractorDrive.x + halfSpread(tractorDrive.axles) + R + 30))
      : LANDING_GEAR;
  }

  const rear = apply(g.rear, p.rear, 'rear');
  const half = halfSpread(rear.axles);
  const hi = L - half - R - REAR_MARGIN;
  let lo: number;
  if (body.kind === 'semi') lo = Math.max(front.x + 300, landingGear! + 15 + R + half + 10);
  else if (body.kind === 'truck') lo = Math.max(0.3 * L, front.x + TRUCK_WHEELBASE_MIN);
  else if (front.axles > 0) lo = front.x + R + TYRE_GAP + R + half;
  else lo = 0.3 * L;
  let rearRange: readonly [number, number];
  ({ x: rear.x, range: rearRange } = within(rear.x, Math.ceil(lo), Math.floor(hi)));

  return {
    chassis: { front, rear, tractorFront, tractorDrive },
    ranges: { front: frontRange, rear: rearRange, tractorDrive: driveRange, tractorFront: fixed(TRACTOR_STEER_X) },
    landingGear,
  };
}

/** The running gear of a body: what the user entered (`body.chassis`) over its template's or typical figures, within reason. */
export function chassisOf(body: CargoBody, first: boolean): Chassis {
  return resolve(body, first).chassis;
}

/** Where each support of the body may be (x, as in AxleGroup), with its other supports as they are now. */
export function axleRanges(body: CargoBody, first: boolean): AxleRanges {
  return resolve(body, first).ranges;
}

/** The template's or typical running gear, as if the user had entered nothing. */
export function typicalChassis(body: CargoBody, first: boolean): Chassis {
  return chassisOf({ ...body, chassis: undefined }, first);
}

/** What the scene draws under a body: its wheels and landing gear, x from its front wall. */
export interface BodyWheels {
  /** Every axle of the rear group. */
  rear: number[];
  /** Every axle of the front group (none under a semi-trailer or a centre-axle trailer). */
  front: number[];
  landingGear: number | null;
}

function axlesOfGroup(g: AxleGroup): number[] {
  return Array.from({ length: g.axles }, (_, i) => g.x + (i - (g.axles - 1) / 2) * AXLE_SPACING);
}

export function bodyWheels(body: CargoBody, first: boolean): BodyWheels {
  const { chassis, landingGear } = resolve(body, first);
  // A rigid truck's steering axle is the cab's (cabWheels).
  const front = body.kind === 'truck' ? [] : axlesOfGroup(chassis.front);
  return { rear: axlesOfGroup(chassis.rear), front, landingGear };
}

/**
 * The wheels of the cab of a vehicle whose first body is `first`: the steering axle ahead of its front wall (cm, +),
 * a tractor's drive axles behind it (x, +) and the kingpin its fifth wheel holds (null under a rigid truck).
 */
export function cabWheels(first: CargoBody): { steer: number; drive: number[]; kingpin: number | null } {
  const { tractorFront, tractorDrive, front } = chassisOf(first, true);
  if (tractorFront && tractorDrive) return { steer: -tractorFront.x, drive: axlesOfGroup(tractorDrive), kingpin: front.x };
  return { steer: -TRUCK_STEER_X, drive: [], kingpin: null };
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
        if (validAxles(v, part) && axlesEditable(part)) group.axles = v;
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
