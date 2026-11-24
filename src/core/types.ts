/**
 * Domain model. All linear values are centimetres, weights are kilograms.
 *
 * World axes: X — along the vehicle (towards the cab), Y — up, Z — across the vehicle.
 * The deck of every cargo body and the dock platform are at Y = 0.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** l — along X (length), w — along Z (width), h — along Y (height). */
export interface Dims {
  l: number;
  w: number;
  h: number;
}

/** Axis-aligned box. */
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** Axis-aligned rectangle on the floor (XZ plane). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Rotation about the vertical axis in degrees. */
export type Yaw = 0 | 90;

/** Which own dimension points up: `h` — standing as entered, `l` — on its end, `w` — on its side. */
export type UpAxis = 'h' | 'l' | 'w';

/**
 * Orientation of a cargo item: one of the six axis-aligned ones (quarter turns about any axis).
 * `up` picks the dimension that points up, `yaw` turns the item about the vertical; see
 * `core/orientation.ts`. Free angles would need oriented boxes in `geometry.ts`/`physics.ts`.
 */
export interface Orientation {
  yaw: Yaw;
  /** Missing: `h` (upright). Plans made before tilting never have it. */
  up?: UpAxis;
}

export interface CargoItem {
  id: string;
  /** Human-friendly running number shown on the box and in the list. */
  seq: number;
  name: string;
  /** Own dimensions, as entered by the user (independent of orientation). */
  dims: Dims;
  orientation: Orientation;
  /** World position of the min corner of the item's bounding box. */
  pos: Vec3;
  color: string;
  /** Gross weight, kg. Missing in plans made before weights existed: treated as unknown (0). */
  weight?: number;
  /** Fixed in place: not moved, turned or resized (see pinnedIds). Missing — free. */
  locked?: boolean;
}

export type BodyKind = 'semi' | 'truck' | 'trailer';

/**
 * One axle or a group of axles side by side (a tandem, a tridem) under a body, or the coupling the body rests on
 * with its front (see core/chassis.ts).
 */
export interface AxleGroup {
  /** Centre along the body, cm from its front wall towards the doors (negative: ahead of the wall, under the cab). */
  x: number;
  /** Axles in the group; 0 — not wheels but a coupling: a semi-trailer's kingpin, a centre-axle trailer's drawbar. */
  axles: number;
  /** What the empty vehicle puts on it, kg. */
  tare: number;
  /** Permissible load, kg; missing or 0 — not checked. */
  max?: number;
}

/**
 * The supports of a body: its front and rear, and under a semi-trailer behind the cab also the tractor's
 * steering and drive axles (x from the semi-trailer's front wall too).
 */
export type ChassisPart = 'front' | 'rear' | 'tractorFront' | 'tractorDrive';

/**
 * The user's own figures for the running gear of a body. Every field left out is the typical one for the body's
 * kind and size (`chassisOf`), so it follows the body when it is resized.
 */
export type ChassisPatch = Partial<Record<ChassisPart, Partial<AxleGroup>>>;

/** A cargo space: a semi-trailer, a rigid truck body or a drawbar trailer. */
export interface CargoBody {
  id: string;
  name: string;
  kind: BodyKind;
  /** Internal dimensions. */
  dims: Dims;
  /** Payload capacity, kg. Missing: no limit is checked. */
  maxLoad?: number;
  /** Axle positions, empty weights and permissible loads the user entered. Missing: all typical. */
  chassis?: ChassisPatch;
}

/** A truck or a road train: up to MAX_BODIES cargo bodies, index 0 right behind the cab. */
export interface Vehicle {
  id: string;
  name: string;
  bodies: CargoBody[];
}

/** One staging platform along the rear doors of all vehicles, or a separate one behind each. */
export type DockMode = 'shared' | 'own';

export interface Plan {
  /** Parked side by side at the dock (along Z), the first one on Z = 0. */
  vehicles: Vehicle[];
  dockMode: DockMode;
  items: CargoItem[];
  nextSeq: number;
}
