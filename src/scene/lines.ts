import { Material, Mesh, Object3D, Texture } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface FatLineOptions {
  opacity?: number;
  depthTest?: boolean;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
}

/** Screen-space thick line material (width in CSS pixels). */
export function fatMaterial(color: string, width: number, opts: FatLineOptions = {}): LineMaterial {
  const opacity = opts.opacity ?? 1;
  return new LineMaterial({
    color,
    linewidth: width,
    transparent: opacity < 1 || opts.depthTest === false,
    opacity,
    depthTest: opts.depthTest ?? true,
    depthWrite: opts.depthTest !== false,
    dashed: opts.dashed ?? false,
    dashSize: opts.dashSize ?? 6,
    gapSize: opts.gapSize ?? 4,
  });
}

/** Thick line segments from a flat [x1,y1,z1, x2,y2,z2, ...] array. */
export function fatSegments(positions: number[], material: LineMaterial): LineSegments2 {
  const line = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), material);
  if (material.dashed) line.computeLineDistances();
  return line;
}

/** Replaces the segments of an existing line (old GPU buffers are released). */
export function setSegments(line: LineSegments2, positions: number[]): void {
  line.geometry.dispose();
  line.geometry = new LineSegmentsGeometry().setPositions(positions);
  if (line.material.dashed) line.computeLineDistances();
}

/** The 12 edges of a unit cube centred at the origin, as segment pairs. */
export const UNIT_CUBE_EDGES: number[] = (() => {
  const h = 0.5;
  const c = [
    [-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h],
    [-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h],
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return edges.flatMap(([a, b]) => [...c[a], ...c[b]]);
})();

/** Edges of an axis-aligned box given by min/max corners. */
export function boxEdges(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < UNIT_CUBE_EDGES.length; i += 3) {
    out.push(
      UNIT_CUBE_EDGES[i] < 0 ? min.x : max.x,
      UNIT_CUBE_EDGES[i + 1] < 0 ? min.y : max.y,
      UNIT_CUBE_EDGES[i + 2] < 0 ? min.z : max.z,
    );
  }
  return out;
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture && !value.userData.shared) value.dispose();
  }
  material.dispose();
}

/**
 * Releases GPU resources and label elements of a subtree. Objects can opt out with
 * `userData.sharedGeometry` / `userData.sharedMaterial`.
 */
export function disposeTree(root: Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof CSS2DObject) obj.element.remove();
    const mesh = obj as Mesh;
    if (mesh.geometry && !obj.userData.sharedGeometry) mesh.geometry.dispose();
    if (mesh.material && !obj.userData.sharedMaterial) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(disposeMaterial);
    }
  });
}
