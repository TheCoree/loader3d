import * as THREE from 'three';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { Box } from '../core/types';
import type { SnapGuide } from '../core/snapping';
import { fatMaterial, fatSegments, setSegments } from './lines';
import { COLORS } from './theme';

interface GuideVisual {
  line: LineSegments2;
  material: LineMaterial;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

/** Shows the faces a dragged item is magnetised to: blue for cargo, green for walls. */
export class GuidesView {
  readonly root = new THREE.Group();
  private readonly visuals: GuideVisual[] = [];

  constructor() {
    this.root.name = 'guides';
    for (let i = 0; i < 2; i++) {
      const material = fatMaterial(COLORS.accent, 2, { depthTest: false, opacity: 0.95 });
      const line = fatSegments([0, 0, 0, 0, 0, 0], material);
      line.renderOrder = 15;
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: COLORS.accent,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      fill.renderOrder = 14;
      this.root.add(line, fill);
      this.visuals.push({ line, material, fill });
    }
    this.root.visible = false;
  }

  show(guides: readonly SnapGuide[], bounds: Box | null): void {
    if (!bounds || guides.length === 0) {
      this.clear();
      return;
    }
    this.root.visible = true;
    const pad = 8;
    const y0 = bounds.min.y;
    const y1 = bounds.max.y + pad;
    this.visuals.forEach((v, i) => {
      const g = guides[i];
      v.line.visible = v.fill.visible = !!g;
      if (!g) return;
      const color = g.kind === 'wall' ? COLORS.wallSnap : COLORS.accent;
      v.material.color.set(color);
      v.fill.material.color.set(color);
      const p = g.plane;
      if (g.axis === 'x') {
        const z0 = bounds.min.z - pad;
        const z1 = bounds.max.z + pad;
        setSegments(v.line, [p, y0, z0, p, y1, z0, p, y1, z0, p, y1, z1, p, y1, z1, p, y0, z1, p, y0, z1, p, y0, z0]);
        v.fill.position.set(p, (y0 + y1) / 2, (z0 + z1) / 2);
        v.fill.rotation.set(0, Math.PI / 2, 0);
        v.fill.scale.set(z1 - z0, y1 - y0, 1);
      } else {
        const x0 = bounds.min.x - pad;
        const x1 = bounds.max.x + pad;
        setSegments(v.line, [x0, y0, p, x0, y1, p, x0, y1, p, x1, y1, p, x1, y1, p, x1, y0, p, x1, y0, p, x0, y0, p]);
        v.fill.position.set((x0 + x1) / 2, (y0 + y1) / 2, p);
        v.fill.rotation.set(0, 0, 0);
        v.fill.scale.set(x1 - x0, y1 - y0, 1);
      }
    });
  }

  clear(): void {
    this.root.visible = false;
  }

  dispose(): void {
    for (const v of this.visuals) {
      v.line.geometry.dispose();
      v.material.dispose();
      v.fill.geometry.dispose();
      v.fill.material.dispose();
    }
  }
}
