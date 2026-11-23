import { COG_LONG_TOLERANCE } from '../stats';

/**
 * Axle loads of a tractor with a semi-trailer from where the cargo stands: a beam on two supports twice —
 * the semi-trailer rests on the kingpin (the fifth wheel) and on the centre of its axle group, the tractor
 * on its front and drive axles with the fifth wheel a little ahead of the drive axle. A static estimate for
 * planning, not a weighbridge: real loads depend on the suspension, the road and how the cargo is fixed.
 *
 * Positions are cm from the front wall of the semi-trailer's deck towards the doors, weights kg.
 */

export interface LoadGroup {
  /** kg */
  weight: number;
  /** The group lies evenly from `from` to `to`, cm from the front wall. */
  from: number;
  to: number;
}

export interface Rig {
  /** Inside length of the semi-trailer, cm. */
  deckLength: number;
  /** Kingpin, cm from the front wall. */
  kingpin: number;
  /** Centre of the semi-trailer's axle group, cm from the front wall. */
  bogie: number;
  /** The empty semi-trailer, kg: what rests on the kingpin and on its axles. */
  trailerTareKingpin: number;
  trailerTareAxles: number;
  /** The empty tractor, kg, on its front and drive axles. */
  tractorFront: number;
  tractorDrive: number;
  /** Tractor wheelbase, cm. */
  wheelbase: number;
  /** The fifth wheel ahead of the drive axle, cm. */
  fifthWheelAhead: number;
}

/**
 * Typical figures of a 4×2 tractor with a 13,6 m tilt semi-trailer on three axles: a starting point for the
 * calculator, to be replaced with the vehicle's own papers.
 */
export const TYPICAL_RIG: Rig = {
  deckLength: 1360,
  kingpin: 120,
  bogie: 980,
  trailerTareKingpin: 2000,
  trailerTareAxles: 4800,
  tractorFront: 5000,
  tractorDrive: 2600,
  wheelbase: 370,
  fifthWheelAhead: 50,
};

export interface AxleLoads {
  cargoWeight: number;
  /** Centre of gravity of the cargo, cm from the front wall (null: no cargo). */
  cargoCog: number | null;
  /** The same as a share of the deck length, 0 = front wall (as BodyStats.cogFromFront). */
  cogFromFront: number | null;
  /** Within COG_LONG_TOLERANCE of the middle of the deck — the editor's «balanced» (core/stats.ts). */
  balanced: boolean;
  /** Cargo only, kg: on the kingpin and on the semi-trailer's axles (negative: lifts that support). */
  cargoOnKingpin: number;
  cargoOnAxles: number;
  /** Totals with the empty vehicle, kg. */
  kingpin: number;
  front: number;
  drive: number;
  trailer: number;
  gross: number;
  /** The cargo's centre of gravity is ahead of the kingpin / behind the axle group: one support is lifted. */
  aheadOfKingpin: boolean;
  behindBogie: boolean;
}

export function cargoCentre(groups: readonly LoadGroup[]): { weight: number; cog: number | null } {
  let weight = 0;
  let moment = 0;
  for (const g of groups) {
    if (!(g.weight > 0) || !Number.isFinite(g.from) || !Number.isFinite(g.to)) continue;
    weight += g.weight;
    moment += g.weight * ((g.from + g.to) / 2);
  }
  return { weight, cog: weight > 0 ? moment / weight : null };
}

export function axleLoads(groups: readonly LoadGroup[], rig: Rig): AxleLoads {
  const { weight, cog } = cargoCentre(groups);
  const span = rig.bogie - rig.kingpin;
  // Lever rule on the semi-trailer: the farther back the cargo, the more of it on the trailer's axles.
  const cargoOnAxles = cog === null || span <= 0 ? 0 : (weight * (cog - rig.kingpin)) / span;
  const cargoOnKingpin = weight - cargoOnAxles;
  const kingpin = rig.trailerTareKingpin + cargoOnKingpin;
  // The kingpin load on the tractor: the front axle takes the part the fifth wheel's lead gives it.
  const lead = rig.wheelbase > 0 ? rig.fifthWheelAhead / rig.wheelbase : 0;
  const front = rig.tractorFront + kingpin * lead;
  const drive = rig.tractorDrive + kingpin * (1 - lead);
  const trailer = rig.trailerTareAxles + cargoOnAxles;
  const cogFromFront = cog === null || rig.deckLength <= 0 ? null : cog / rig.deckLength;
  return {
    cargoWeight: weight,
    cargoCog: cog,
    cogFromFront,
    balanced: cogFromFront === null || Math.abs(cogFromFront - 0.5) <= COG_LONG_TOLERANCE + 1e-9,
    cargoOnKingpin,
    cargoOnAxles,
    kingpin,
    front,
    drive,
    trailer,
    gross: front + drive + trailer,
    aheadOfKingpin: cog !== null && cog < rig.kingpin,
    behindBogie: cog !== null && cog > rig.bogie,
  };
}
