/**
 * Domain model. All linear values are centimetres.
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

/**
 * Orientation of a cargo item. Only quarter turns about the vertical axis are supported now;
 * tilting (six axis-aligned orientations) or free yaw extend this type and `core/orientation.ts`.
 */
export interface Orientation {
  yaw: Yaw;
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
}

export type BodyKind = 'semi' | 'truck' | 'trailer';

/** A cargo space: a semi-trailer, a rigid truck body or a drawbar trailer. */
export interface CargoBody {
  id: string;
  name: string;
  kind: BodyKind;
  /** Internal dimensions. */
  dims: Dims;
}

export interface Plan {
  bodies: CargoBody[];
  items: CargoItem[];
  nextSeq: number;
}
