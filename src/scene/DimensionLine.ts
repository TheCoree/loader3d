import { Group, Vector3, type Camera } from 'three';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { fatSegments, setSegments } from './lines';

export interface DimensionSpec {
  /** Measured points. */
  a: Vector3;
  b: Vector3;
  /** Unit direction from the measured edge towards the dimension line. */
  dir: Vector3;
  /** Distance from the measured edge to the dimension line. */
  offset: number;
  text: string;
  /** Gap between the object and the start of the extension lines. */
  gap?: number;
  /** How far extension lines run past the dimension line. */
  overshoot?: number;
  /** Arrowhead length. */
  arrow?: number;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const along = new Vector3();

/**
 * Drawing-style dimension: two extension lines, a dimension line with arrowheads and a label.
 */
export class DimensionLine extends Group {
  private readonly line: LineSegments2;
  readonly label: CSS2DObject;
  /** Ends of the dimension line itself (world space). */
  private readonly start = new Vector3();
  private readonly end = new Vector3();

  constructor(material: LineMaterial, labelClass = 'dim-label') {
    super();
    this.line = fatSegments([0, 0, 0, 0, 0, 0], material);
    this.line.userData.sharedMaterial = true;
    this.add(this.line);
    const el = document.createElement('div');
    el.className = labelClass;
    this.label = new CSS2DObject(el);
    this.add(this.label);
  }

  update(spec: DimensionSpec): void {
    const { a, b, dir, offset } = spec;
    const gap = spec.gap ?? 6;
    const overshoot = spec.overshoot ?? 8;
    const length = a.distanceTo(b);
    const arrow = spec.arrow ?? Math.min(16, length * 0.2);
    const wing = arrow * 0.32;
    along.subVectors(b, a).normalize();

    const pts: number[] = [];
    const seg = (p: Vector3, q: Vector3) => pts.push(p.x, p.y, p.z, q.x, q.y, q.z);

    // Extension lines.
    seg(tmpA.copy(a).addScaledVector(dir, gap), tmpB.copy(a).addScaledVector(dir, offset + overshoot));
    seg(tmpA.copy(b).addScaledVector(dir, gap), tmpB.copy(b).addScaledVector(dir, offset + overshoot));

    // Dimension line.
    const a1 = a.clone().addScaledVector(dir, offset);
    const b1 = b.clone().addScaledVector(dir, offset);
    seg(a1, b1);

    // Arrowheads.
    for (const [tip, sign] of [[a1, 1], [b1, -1]] as const) {
      const base = tip.clone().addScaledVector(along, sign * arrow);
      seg(tip, tmpA.copy(base).addScaledVector(dir, wing));
      seg(tip, tmpA.copy(base).addScaledVector(dir, -wing));
    }

    setSegments(this.line, pts);
    this.start.copy(a1);
    this.end.copy(b1);
    this.label.position.copy(a1).add(b1).multiplyScalar(0.5);
    if (this.label.element.textContent !== spec.text) this.label.element.textContent = spec.text;
  }

  /**
   * Shows the label only when the dimension line is long enough on screen to carry it
   * (prevents piles of overlapping labels on small or foreshortened dimensions).
   */
  fitLabel(camera: Camera, viewportWidth: number, viewportHeight: number): boolean {
    tmpA.copy(this.start).project(camera);
    tmpB.copy(this.end).project(camera);
    const onScreen = tmpA.z < 1 && tmpB.z < 1;
    const length = Math.hypot(((tmpA.x - tmpB.x) * viewportWidth) / 2, ((tmpA.y - tmpB.y) * viewportHeight) / 2);
    const needed = (this.label.element.textContent?.length ?? 0) * 6.5 + 22;
    const fits = onScreen && length >= needed;
    this.label.visible = fits;
    return fits;
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.label.element.remove();
  }
}
