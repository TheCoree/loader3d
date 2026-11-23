/**
 * How many equal rectangles (pallets on a deck, boxes on a pallet) fit on a rectangular floor, and where they
 * stand. Pure arithmetic for the public calculators (pages/tools); the editor itself places cargo in 3D.
 *
 * Lengths in cm. The floor runs along X from its front wall (x = 0, the cab) to the doors (x = length) and
 * across Z. A piece stands either "along" (its length along the floor) or "turned" (its length across).
 *
 * The layouts tried are the ones used in practice: the floor is cut once across into a front and a rear part,
 * and each part is filled with lanes running its whole length, some of them along and some turned (the
 * «ёлочка» of a 20′ container: one lane of turned europallets beside one lane of pallets along). That covers
 * every vehicle and pallet of the calculators; exotic pinwheel patterns are not searched.
 */

export interface Footprint {
  /** Along X. */
  l: number;
  /** Across Z. */
  w: number;
}

/** One piece on the floor: its corner nearest the front wall and the left side, and its size there. */
export interface FloorSpot {
  x: number;
  z: number;
  l: number;
  w: number;
  turned: boolean;
}

export type FitKind = 'along' | 'turned' | 'mixed';

export interface FloorFit {
  count: number;
  kind: FitKind;
  spots: FloorSpot[];
  /** Floor length taken from the front wall, cm (0 when nothing fits). */
  usedLength: number;
  /** Free length left at the doors, cm. */
  slack: number;
  /** Lanes across the floor in the front part (along, turned), for the description of a layout. */
  lanes: { along: number; turned: number };
}

/** Pieces in one lane of `length` with this pitch (piece + gap); the gap is only between pieces. */
function perLane(length: number, pitch: number, gap: number): number {
  return pitch > 0 ? Math.max(0, Math.floor((length + gap + 1e-9) / pitch)) : 0;
}

interface Part {
  count: number;
  along: number;
  turned: number;
}

/** The best mix of lanes for a part of the floor `length` long. */
function bestPart(length: number, width: number, piece: Footprint, gap: number): Part {
  const alongPitch = piece.l + gap;
  const turnedPitch = piece.w + gap;
  // Lanes are as wide as the piece across: w for pieces along, l for turned ones.
  const maxAlongLanes = perLane(width, piece.w + gap, gap);
  const inAlongLane = perLane(length, alongPitch, gap);
  const inTurnedLane = perLane(length, turnedPitch, gap);
  let best: Part = { count: 0, along: 0, turned: 0 };
  // From the most lanes along down: a tie keeps fewer turned lanes, the plainer layout.
  for (let along = maxAlongLanes; along >= 0; along--) {
    const rest = width - along * (piece.w + gap);
    const turned = perLane(rest, piece.l + gap, gap);
    const count = along * inAlongLane + turned * inTurnedLane;
    if (count > best.count) best = { count, along: inAlongLane > 0 ? along : 0, turned: inTurnedLane > 0 ? turned : 0 };
  }
  return best;
}

function spotsOf(part: Part, x0: number, length: number, piece: Footprint, gap: number, out: FloorSpot[]): void {
  let z = 0;
  const lane = (turned: boolean) => {
    const l = turned ? piece.w : piece.l;
    const w = turned ? piece.l : piece.w;
    const n = perLane(length, l + gap, gap);
    for (let i = 0; i < n; i++) out.push({ x: x0 + i * (l + gap), z, l, w, turned });
    z += w + gap;
  };
  for (let i = 0; i < part.along; i++) lane(false);
  for (let i = 0; i < part.turned; i++) lane(true);
}

function build(floor: Footprint, piece: Footprint, gap: number, cut: number, front: Part, rear: Part): FloorFit {
  const spots: FloorSpot[] = [];
  spotsOf(front, 0, cut, piece, gap, spots);
  const rearStart = cut > 0 ? cut + gap : 0;
  spotsOf(rear, rearStart, floor.l - rearStart, piece, gap, spots);
  const usedLength = spots.reduce((m, s) => Math.max(m, s.x + s.l), 0);
  const turned = spots.filter((s) => s.turned).length;
  const kind: FitKind = turned === 0 ? 'along' : turned === spots.length ? 'turned' : 'mixed';
  return {
    count: spots.length,
    kind,
    spots,
    usedLength,
    slack: floor.l - usedLength,
    lanes: { along: front.count > 0 ? front.along : rear.along, turned: front.count > 0 ? front.turned : rear.turned },
  };
}

/** Lengths where the floor may be cut: sums of whole pieces along and turned (with their gaps). */
function cuts(length: number, piece: Footprint, gap: number): number[] {
  const a = piece.l + gap;
  const b = piece.w + gap;
  const result = new Set<number>([0]);
  for (let i = 0; i * a <= length + gap; i++) {
    for (let j = 0; i * a + j * b <= length + gap; j++) {
      if (i + j > 0) result.add(i * a + j * b - gap);
      if (result.size > 4000) return [...result];
    }
  }
  return [...result].filter((c) => c <= length);
}

const KIND_ORDER: Record<FitKind, number> = { along: 0, turned: 1, mixed: 2 };

/** More pieces first; then the plainer kind; then the one that leaves more room at the doors. */
function better(a: FloorFit, b: FloorFit): boolean {
  if (a.count !== b.count) return a.count > b.count;
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] < KIND_ORDER[b.kind];
  return a.usedLength < b.usedLength;
}

function valid(floor: Footprint, piece: Footprint, gap: number): boolean {
  return [floor.l, floor.w, piece.l, piece.w].every((v) => Number.isFinite(v) && v > 0) && Number.isFinite(gap) && gap >= 0;
}

const EMPTY: FloorFit = { count: 0, kind: 'along', spots: [], usedLength: 0, slack: 0, lanes: { along: 0, turned: 0 } };

/** Every piece along (`turned` false) or every piece turned: plain rows. */
export function gridFit(floor: Footprint, piece: Footprint, turned: boolean, gap = 0): FloorFit {
  if (!valid(floor, piece, gap)) return { ...EMPTY, slack: Math.max(0, floor.l || 0) };
  const l = turned ? piece.w : piece.l;
  const w = turned ? piece.l : piece.w;
  const lanes = perLane(floor.w, w + gap, gap);
  const inLane = perLane(floor.l, l + gap, gap);
  const part: Part = turned ? { count: lanes * inLane, along: 0, turned: lanes } : { count: lanes * inLane, along: lanes, turned: 0 };
  if (part.count === 0) return { ...EMPTY, slack: floor.l };
  return build(floor, piece, gap, floor.l, part, { count: 0, along: 0, turned: 0 });
}

/** The layout with the most pieces (see the module comment for what is tried). */
export function bestFit(floor: Footprint, piece: Footprint, gap = 0): FloorFit {
  if (!valid(floor, piece, gap)) return { ...EMPTY, slack: Math.max(0, floor.l || 0) };
  let best = gridFit(floor, piece, false, gap);
  const turned = gridFit(floor, piece, true, gap);
  if (better(turned, best)) best = turned;
  // Lanes of both kinds along the whole floor, then the floor cut in two: a tie keeps the simpler layout found first.
  const whole = bestPart(floor.l, floor.w, piece, gap);
  if (whole.count > 0) {
    const fit = build(floor, piece, gap, floor.l, whole, { count: 0, along: 0, turned: 0 });
    if (better(fit, best)) best = fit;
  }
  for (const cut of cuts(floor.l, piece, gap)) {
    if (cut <= 0 || cut >= floor.l) continue;
    const front = bestPart(cut, floor.w, piece, gap);
    const rear = bestPart(floor.l - cut - gap, floor.w, piece, gap);
    if (front.count + rear.count < best.count) continue;
    const fit = build(floor, piece, gap, cut, front, rear);
    if (better(fit, best)) best = fit;
  }
  return best.count > 0 ? best : { ...EMPTY, slack: floor.l };
}

/**
 * The layouts worth showing, best first: the best one, and the plain «all along» and «all turned» rows when
 * they differ from it (a calculator explains why 33 europallets go along a 13,6 m trailer and 34 only turned).
 */
export function fitOptions(floor: Footprint, piece: Footprint, gap = 0): FloorFit[] {
  const options = [bestFit(floor, piece, gap), gridFit(floor, piece, false, gap), gridFit(floor, piece, true, gap)].filter(
    (f) => f.count > 0,
  );
  const seen = new Set<string>();
  return options
    .filter((f) => {
      const key = `${f.kind}:${f.count}:${f.usedLength}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
}

/** How many tiers of `height` stand under a ceiling `room` high (1 when stacking is off; 0 if one does not fit). */
export function tiersUnder(room: number, height: number, stackable: boolean): number {
  if (!(height > 0) || !(room > 0) || height > room + 1e-9) return 0;
  return stackable ? Math.floor((room + 1e-9) / height) : 1;
}
