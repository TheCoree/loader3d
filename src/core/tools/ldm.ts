/**
 * Loading metres (LDM) by the carriers' formula: the floor length a load takes on a deck 2,4 m wide —
 * length × width / 2,4 per floor place; stacked pieces share a place. The editor measures LDM on the real
 * layout instead (`BodyStats.ldm`, core/stats.ts); this is the quick estimate before there is a layout.
 * Lengths in cm, weights in kg, LDM in metres.
 */

/** Deck width of the formula, cm. */
export const LDM_DECK_WIDTH = 240;
/** Length of the deck of a standard semi-trailer, m. */
export const TRAILER_LDM = 13.6;
/**
 * Chargeable weight of one loading metre in groupage, kg: what most carriers on the continent bill as a
 * minimum. Carriers differ (2 000 kg is common too) — the calculators let it be changed.
 */
export const DEFAULT_KG_PER_LDM = 1850;

export interface LdmRow {
  /** Footprint of one piece, cm. */
  l: number;
  w: number;
  count: number;
  /** Pieces in one stack (1: not stacked). */
  stack: number;
  /** Weight of one piece, kg (optional). */
  weight?: number;
}

export interface LdmResult {
  /** Exact LDM, m. */
  ldm: number;
  /** As carriers bill it: rounded up to 0,1 m. */
  billed: number;
  floorPlaces: number;
  pieces: number;
  weight: number;
  /** Share of a 13,6 m trailer (may be over 1). */
  trailerShare: number;
  /** Semi-trailers this takes by LDM alone. */
  trailers: number;
  /** Weight a carrier bills: the larger of the real weight and billed LDM × kgPerLdm, kg. */
  chargeableWeight: number;
}

function positive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** LDM of one row of equal pieces. */
export function rowLdm(row: LdmRow): number {
  if (!positive(row.l) || !positive(row.w) || !positive(row.count)) return 0;
  const places = Math.ceil(row.count / Math.max(1, Math.floor(row.stack) || 1));
  return ((row.l * row.w) / (LDM_DECK_WIDTH * 100)) * places;
}

export function ldmSummary(rows: readonly LdmRow[], kgPerLdm = DEFAULT_KG_PER_LDM): LdmResult {
  let ldm = 0;
  let floorPlaces = 0;
  let pieces = 0;
  let weight = 0;
  for (const row of rows) {
    if (!positive(row.l) || !positive(row.w) || !positive(row.count)) continue;
    const count = Math.floor(row.count);
    ldm += rowLdm({ ...row, count });
    floorPlaces += Math.ceil(count / Math.max(1, Math.floor(row.stack) || 1));
    pieces += count;
    weight += row.weight && row.weight > 0 ? row.weight * count : 0;
  }
  const billed = Math.ceil(ldm * 10 - 1e-9) / 10;
  return {
    ldm,
    billed,
    floorPlaces,
    pieces,
    weight,
    trailerShare: ldm / TRAILER_LDM,
    trailers: ldm > 0 ? Math.ceil(ldm / TRAILER_LDM - 1e-9) : 0,
    chargeableWeight: Math.max(weight, billed * (positive(kgPerLdm) ? kgPerLdm : 0)),
  };
}
