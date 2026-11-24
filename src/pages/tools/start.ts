import { VEHICLE_PRESETS } from '@/core/presets';
import type { BodyKind, Dims } from '@/core/types';
import type { StartSpec } from '@/core/tools/startPlan';

/** Bodies for «Попробовать в 3D» (core/tools/startPlan.ts) of the calculators. */

/** A body without a template: a semi-trailer from 10 m, a rigid truck below. */
export function kindFor(length: number): BodyKind {
  return length >= 1000 ? 'semi' : 'truck';
}

/** The body of a vehicle template of the editor (core/presets.ts). */
export function presetBody(id: string): StartSpec['body'] {
  const b = VEHICLE_PRESETS.find((p) => p.id === id)!.bodies[0];
  return {
    name: b.name,
    kind: b.kind,
    dims: { ...b.dims },
    ...(b.maxLoad ? { maxLoad: b.maxLoad } : {}),
    ...(b.chassisModel ? { chassisModel: b.chassisModel } : {}),
  };
}

/**
 * A body the visitor typed in or chose by a label; `chassisModel` — the axles of the template it is (core/chassis.ts),
 * so the plan's axle loads are the editor's for that vehicle; missing — typical ones.
 */
export function ownBody(name: string, dims: Dims, maxLoad?: number, kind?: BodyKind, chassisModel?: string): StartSpec['body'] {
  return {
    name,
    kind: kind ?? kindFor(dims.l),
    dims,
    ...(maxLoad && maxLoad > 0 ? { maxLoad } : {}),
    ...(chassisModel ? { chassisModel } : {}),
  };
}

/** The template's axles of a vehicle preset's first body (for a calculator's choice of that vehicle). */
export function presetChassis(id: string): string | undefined {
  return VEHICLE_PRESETS.find((p) => p.id === id)?.bodies[0].chassisModel;
}
