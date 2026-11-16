import * as THREE from 'three';
import { DECK_HEIGHT, type VehicleLayout } from '../core/layout';
import { loadLengths } from '../core/stats';
import type { CargoItem } from '../core/types';
import { formatLength, type Units } from '../core/units';
import { DimensionLine } from './DimensionLine';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { fatMaterial } from './lines';
import { COLORS } from './theme';

export interface LoadLengthOptions {
  units: Units;
  show: boolean;
}

const ACROSS = new THREE.Vector3(0, 0, 1);
/** On the ground beside the vehicle, clear of its wheels and cab, so it does not merge with the body. */
const GROUND_Y = -DECK_HEIGHT + 0.5;
const SIDE_CLEARANCE = 45;

/**
 * Load length of every body: a dimension on the ground along its side, from the front wall to the
 * rearmost cargo (the LDM of the stats bar), and right after it, in blue, the free length from there to
 * the rear doors. Follows the cargo, drag previews included.
 */
export class LoadLengthView {
  readonly root = new THREE.Group();
  private readonly material = fatMaterial(COLORS.dims, 1.25);
  private readonly freeMaterial = fatMaterial(COLORS.accent, 1.25);
  private readonly dims: DimensionLine[] = [];
  private readonly free: DimensionLine[] = [];
  /** What each dimension was last drawn for: redrawn only when it changes. */
  private readonly keys: string[] = [];
  private readonly freeKeys: string[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor() {
    this.root.name = 'load-length';
  }

  update(items: readonly CargoItem[], layout: VehicleLayout, options: LoadLengthOptions): void {
    this.root.visible = options.show;
    const lengths = options.show ? loadLengths(items, layout) : new Map<string, number>();
    let count = 0;
    let freeCount = 0;
    for (const { body, box } of layout.bodies) {
      const length = lengths.get(body.id) ?? 0;
      if (length < 0.5) continue;
      const z = box.max.z + SIDE_CLEARANCE;
      const end = box.max.x - length;
      const i = count++;
      const dim = this.dims[i] ?? this.create(this.dims, this.material, 'dim-label');
      const text = formatLength(length, options.units);
      const key = `${box.max.x}|${box.max.z}|${length}|${text}`;
      if (this.keys[i] !== key) {
        this.keys[i] = key;
        this.a.set(end, GROUND_Y, z);
        this.b.set(box.max.x, GROUND_Y, z);
        dim.update({ a: this.a, b: this.b, dir: ACROSS, offset: 32, gap: 0, arrow: 18, text });
      }

      // Free length up to the rear doors (none when the cargo reaches them or sticks out).
      const freeLength = end - box.min.x;
      if (freeLength < 0.5) continue;
      const j = freeCount++;
      const freeDim = this.free[j] ?? this.create(this.free, this.freeMaterial, 'dim-label dim-label--free');
      const freeText = `свободно ${formatLength(freeLength, options.units)}`;
      const freeKey = `${box.min.x}|${end}|${box.max.z}|${freeText}`;
      if (this.freeKeys[j] !== freeKey) {
        this.freeKeys[j] = freeKey;
        this.a.set(box.min.x, GROUND_Y, z);
        this.b.set(end, GROUND_Y, z);
        freeDim.update({ a: this.a, b: this.b, dir: ACROSS, offset: 32, gap: 0, arrow: 18, text: freeText });
      }
    }
    this.dims.forEach((dim, i) => (dim.visible = i < count));
    this.free.forEach((dim, j) => (dim.visible = j < freeCount));
  }

  /** Hides labels that do not fit their (foreshortened) dimension line. */
  fitLabels(camera: THREE.Camera, viewportWidth: number, viewportHeight: number): void {
    if (!this.root.visible) return;
    for (const dim of [...this.dims, ...this.free]) if (dim.visible) dim.fitLabel(camera, viewportWidth, viewportHeight);
  }

  dispose(): void {
    for (const dim of [...this.dims, ...this.free]) dim.dispose();
    this.material.dispose();
    this.freeMaterial.dispose();
  }

  private create(list: DimensionLine[], material: LineMaterial, labelClass: string): DimensionLine {
    const dim = new DimensionLine(material, labelClass);
    list.push(dim);
    this.root.add(dim);
    return dim;
  }
}
