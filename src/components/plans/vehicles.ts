import { Container, Snowflake, Truck, Van, type LucideIcon } from 'lucide-react';
import type { VehiclePreset } from '../../core/presets';
import { formatLength } from '../../core/units';

const ICONS: Record<string, LucideIcon> = { reefer: Snowflake, c40: Container, c20: Container, van: Van };

export function vehicleIcon(presetId: string): LucideIcon {
  return ICONS[presetId] ?? Truck;
}

/** «13,6 × 2,45 × 2,7 м», or «7,7 + 8,2 м» for a road train. */
export function vehicleDims(preset: Pick<VehiclePreset, 'bodies'>): string {
  const m = (cm: number) => formatLength(cm, 'm', false);
  if (preset.bodies.length > 1) return `${preset.bodies.map((b) => m(b.dims.l)).join(' + ')} м`;
  const { l, w, h } = preset.bodies[0].dims;
  return `${m(l)} × ${m(w)} × ${m(h)} м`;
}
