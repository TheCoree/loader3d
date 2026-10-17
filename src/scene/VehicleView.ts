import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  CAB_GAP,
  CAB_LENGTH,
  DECK_HEIGHT,
  type PlacedBody,
  type VehicleLayout,
} from '../core/layout';
import { formatLength, type Units } from '../core/units';
import { DimensionLine } from './DimensionLine';
import { boxEdges, disposeTree, fatMaterial, fatSegments } from './lines';
import { COLORS } from './theme';

export interface VehicleViewOptions {
  units: Units;
  showDimensions: boolean;
}

const WHEEL_RADIUS = 52;
const UP = new THREE.Vector3(0, 1, 0);
const PLUS_Z = new THREE.Vector3(0, 0, 1);

function standard(color: string, params: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...params });
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.shared = true;
  return texture;
}

/**
 * Static part of the scene: dock platform, cargo bodies (translucent boxes with a frame),
 * a stylised cab/chassis for orientation and drawing-style overall dimensions.
 */
export class VehicleView {
  readonly root = new THREE.Group();
  private readonly dimensions = new THREE.Group();

  private readonly frameMaterial = fatMaterial(COLORS.frame, 2);
  private readonly dimMaterial = fatMaterial(COLORS.dims, 1.25);
  private readonly wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 30, 28);
  private readonly hubGeometry = new THREE.CylinderGeometry(22, 22, 31, 20);

  private readonly stripeTexture = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = COLORS.stripeDark;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = COLORS.stripeYellow;
    for (let i = -128; i < 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 160, 128);
      ctx.lineTo(i + 128, 128);
      ctx.closePath();
      ctx.fill();
    }
  });

  private readonly dockTextTexture = canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = 'rgba(47, 58, 75, 0.32)';
    ctx.font = '700 76px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = '10px';
    ctx.fillText('ЗОНА НАКОПЛЕНИЯ', 512, 68);
  });

  private readonly mats = {
    dockTop: standard(COLORS.dockTop),
    dockSide: standard(COLORS.dockSide),
    floor: standard(COLORS.floor, { roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({
      color: COLORS.wall,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.4,
    }),
    bulkhead: new THREE.MeshStandardMaterial({
      color: COLORS.bulkhead,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.4,
    }),
    chassis: standard(COLORS.chassis, { roughness: 0.6 }),
    tire: standard(COLORS.tire, { roughness: 0.95 }),
    hub: standard(COLORS.hub, { roughness: 0.45, metalness: 0.3 }),
    cab: standard(COLORS.cab, { roughness: 0.4 }),
    trim: standard(COLORS.cabTrim, { roughness: 0.6 }),
    glass: standard(COLORS.glass, { roughness: 0.15, metalness: 0.25 }),
    light: new THREE.MeshBasicMaterial({ color: COLORS.light }),
    stripe: new THREE.MeshStandardMaterial({ map: this.stripeTexture, roughness: 0.8 }),
    dockText: new THREE.MeshBasicMaterial({ map: this.dockTextTexture, transparent: true, depthWrite: false }),
    dockGrid: new THREE.LineBasicMaterial({ color: COLORS.dockGrid }),
    floorLines: new THREE.LineBasicMaterial({ color: COLORS.floorLines }),
    posts: new THREE.LineBasicMaterial({ color: COLORS.frame, transparent: true, opacity: 0.16 }),
  };

  constructor() {
    this.root.name = 'vehicle';
    this.stripeTexture.wrapS = this.stripeTexture.wrapT = THREE.RepeatWrapping;
  }

  build(layout: VehicleLayout, options: VehicleViewOptions): void {
    this.clear();
    this.buildDock(layout);
    for (const pb of layout.bodies) this.buildBody(pb);
    this.buildCouplings(layout);
    this.buildCab(layout);
    this.buildDimensions(layout, options.units);
    this.dimensions.visible = options.showDimensions;
    this.root.add(this.dimensions);
  }

  /** Hides dimension labels that do not fit their (foreshortened) dimension line. */
  fitLabels(camera: THREE.Camera, viewportWidth: number, viewportHeight: number): void {
    if (!this.dimensions.visible) return;
    for (const child of this.dimensions.children) {
      if (child instanceof DimensionLine) child.fitLabel(camera, viewportWidth, viewportHeight);
    }
  }

  dispose(): void {
    this.clear();
    this.wheelGeometry.dispose();
    this.hubGeometry.dispose();
    this.frameMaterial.dispose();
    this.dimMaterial.dispose();
    this.stripeTexture.dispose();
    this.dockTextTexture.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
  }

  private clear(): void {
    for (const child of [...this.root.children]) {
      disposeTree(child);
      this.root.remove(child);
    }
    for (const child of [...this.dimensions.children]) this.dimensions.remove(child);
  }

  private add<T extends THREE.Object3D>(obj: T, shadows: { cast?: boolean; receive?: boolean } = {}): T {
    obj.traverse((o) => {
      o.userData.sharedMaterial = true;
      if (o instanceof THREE.Mesh) {
        o.castShadow = shadows.cast ?? false;
        o.receiveShadow = shadows.receive ?? false;
      }
    });
    this.root.add(obj);
    return obj;
  }

  private box(
    size: [number, number, number],
    material: THREE.Material | THREE.Material[],
    pos: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...pos);
    return mesh;
  }

  private lines(points: number[], material: THREE.LineBasicMaterial): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geometry, material);
  }

  private wheelPair(x: number, halfTrack: number): void {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(this.wheelGeometry, this.mats.tire);
      const hub = new THREE.Mesh(this.hubGeometry, this.mats.hub);
      tire.userData.sharedGeometry = hub.userData.sharedGeometry = true;
      wheel.add(tire, hub);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, -DECK_HEIGHT + WHEEL_RADIUS, side * halfTrack);
      this.add(wheel, { cast: true });
    }
  }

  private buildDock(layout: VehicleLayout): void {
    const d = layout.dock;
    const depth = d.maxX - d.minX;
    const width = d.maxZ - d.minZ;
    const cz = (d.minZ + d.maxZ) / 2;
    const side = this.mats.dockSide;
    this.add(
      this.box([depth, DECK_HEIGHT, width], [side, side, this.mats.dockTop, side, side, side], [
        d.minX + depth / 2,
        -DECK_HEIGHT / 2,
        cz,
      ]),
      { receive: true },
    );

    const grid: number[] = [];
    for (let x = d.maxX - 100; x > d.minX; x -= 100) grid.push(x, 0.15, d.minZ, x, 0.15, d.maxZ);
    for (let z = Math.ceil(d.minZ / 100) * 100; z < d.maxZ; z += 100) {
      if (z > d.minZ) grid.push(d.minX, 0.15, z, d.maxX, 0.15, z);
    }
    this.add(this.lines(grid, this.mats.dockGrid));

    // Yellow/black safety edge along the loading side.
    const stripeWidth = 30;
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeWidth, width), this.mats.stripe);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(d.maxX - stripeWidth / 2, 0.3, cz);
    const stripeMap = this.stripeTexture;
    stripeMap.repeat.set(stripeWidth / 40, width / 40);
    this.add(stripe, { receive: true });

    const text = new THREE.Mesh(new THREE.PlaneGeometry(640, 80), this.mats.dockText);
    text.rotation.x = -Math.PI / 2;
    text.position.set(d.minX + depth / 2, 0.4, d.maxZ - 70);
    this.add(text);
  }

  private buildBody(pb: PlacedBody): void {
    const { box, body } = pb;
    const { min, max } = box;
    const L = max.x - min.x;
    const W = max.z - min.z;
    const H = max.y - min.y;
    const cx = (min.x + max.x) / 2;

    // Deck and loading-metre marks from the front wall.
    this.add(this.box([L, 10, W + 6], this.mats.floor, [cx, -5, 0]), { receive: true });
    const marks: number[] = [];
    for (let x = max.x - 100; x > min.x + 1; x -= 100) marks.push(x, 0.2, min.z, x, 0.2, max.z);
    this.add(this.lines(marks, this.mats.floorLines));

    // Translucent walls, pushed out a little to avoid z-fighting with cargo touching them.
    const o = 0.6;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(L, H), this.mats.wall);
    left.position.set(cx, H / 2, min.z - o);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(L, H), this.mats.wall);
    right.position.set(cx, H / 2, max.z + o);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(L, W), this.mats.wall);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(cx, H + o, 0);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.mats.bulkhead);
    front.rotation.y = Math.PI / 2;
    front.position.set(max.x + o, H / 2, 0);
    this.add(new THREE.Group().add(left, right, roof, front));

    // Frame and side posts.
    this.add(fatSegments(boxEdges(min, max), this.frameMaterial));
    const posts: number[] = [];
    const count = Math.max(1, Math.round(L / 120));
    for (let i = 1; i < count; i++) {
      const x = min.x + (L * i) / count;
      posts.push(x, 0, min.z, x, H, min.z, x, 0, max.z, x, H, max.z, x, H, min.z, x, H, max.z);
    }
    this.add(this.lines(posts, this.mats.posts));

    // Chassis, axles and wheels.
    this.add(this.box([L - 60, 26, W - 90], this.mats.chassis, [cx, -23, 0]), { cast: true });
    const halfTrack = W / 2 - 28;
    const rear =
      body.kind === 'semi' ? [140, 270, 400] : body.kind === 'truck' ? [150, 285] : [140, 270];
    for (const offset of rear) this.wheelPair(min.x + offset, halfTrack);
    if (body.kind === 'trailer') this.wheelPair(max.x - 150, halfTrack);
    if (body.kind === 'semi') {
      for (const side of [-1, 1]) {
        this.add(this.box([14, DECK_HEIGHT - 36, 14], this.mats.chassis, [max.x - 280, -DECK_HEIGHT / 2 - 18, side * (W / 2 - 50)]), {
          cast: true,
        });
      }
    }

    const tag = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'body-tag', textContent: body.name }));
    tag.position.set(max.x - 40, H + 6, min.z);
    tag.center.set(1, 1);
    this.root.add(tag);
  }

  private buildCouplings(layout: VehicleLayout): void {
    for (let i = 0; i < layout.bodies.length - 1; i++) {
      const front = layout.bodies[i].box;
      const back = layout.bodies[i + 1].box;
      const length = front.min.x - back.max.x + 120;
      this.add(this.box([length, 12, 14], this.mats.chassis, [(front.min.x + back.max.x) / 2, -62, 0]), {
        cast: true,
      });
    }
  }

  private buildCab(layout: VehicleLayout): void {
    const first = layout.bodies[0];
    if (!first) return;
    const W = 250;
    const gap = first.body.kind === 'semi' ? CAB_GAP : 14;
    const x0 = layout.front + gap;
    const x1 = x0 + CAB_LENGTH;
    const yBottom = -DECK_HEIGHT + 48;
    const yTop = Math.max(170, Math.min(first.box.max.y - 15, 250));
    const h = yTop - yBottom;
    const cx = (x0 + x1) / 2;

    this.add(this.box([CAB_LENGTH, h, W], this.mats.cab, [cx, yBottom + h / 2, 0]), { cast: true, receive: true });
    // Roof deflector up to the body height on tractors.
    if (first.body.kind === 'semi' && first.box.max.y > yTop + 20) {
      const dh = first.box.max.y - yTop - 10;
      this.add(this.box([CAB_LENGTH * 0.55, dh, W - 30], this.mats.cab, [x0 + CAB_LENGTH * 0.3, yTop + dh / 2, 0]), {
        cast: true,
      });
    }

    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(W - 30, h * 0.36), this.mats.glass);
    windshield.rotation.y = Math.PI / 2;
    windshield.position.set(x1 + 0.6, yTop - h * 0.24, 0);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(W - 80, h * 0.26), this.mats.trim);
    grille.rotation.y = Math.PI / 2;
    grille.position.set(x1 + 0.6, yBottom + h * 0.3, 0);
    this.add(new THREE.Group().add(windshield, grille));

    for (const side of [-1, 1]) {
      const window = new THREE.Mesh(new THREE.PlaneGeometry(80, h * 0.3), this.mats.glass);
      window.position.set(x1 - 55, yTop - h * 0.24, side * (W / 2 + 0.6));
      if (side < 0) window.rotation.y = Math.PI;
      const light = new THREE.Mesh(new THREE.PlaneGeometry(34, 14), this.mats.light);
      light.rotation.y = Math.PI / 2;
      light.position.set(x1 + 0.8, yBottom + 32, side * (W / 2 - 34));
      this.add(new THREE.Group().add(window, light));
    }
    this.add(this.box([14, 34, W + 4], this.mats.trim, [x1 + 6, yBottom + 4, 0]), { cast: true });

    // Tractor chassis runs under the semi-trailer (fifth wheel).
    const chassisStart = first.body.kind === 'semi' ? layout.front - 330 : x0 - 10;
    this.add(this.box([x1 - chassisStart, 26, 110], this.mats.chassis, [(x1 + chassisStart) / 2, -62, 0]), {
      cast: true,
    });
    const halfTrack = W / 2 - 30;
    this.wheelPair(x1 - 65, halfTrack);
    if (first.body.kind === 'semi') {
      this.wheelPair(layout.front - 90, halfTrack);
      this.wheelPair(layout.front - 225, halfTrack);
    }
  }

  private buildDimensions(layout: VehicleLayout, units: Units): void {
    const offset = 42;
    for (const { box } of layout.bodies) {
      const { min, max } = box;
      const specs = [
        {
          a: new THREE.Vector3(min.x, max.y, max.z),
          b: new THREE.Vector3(max.x, max.y, max.z),
          dir: UP,
          text: formatLength(max.x - min.x, units),
        },
        {
          a: new THREE.Vector3(min.x, max.y, min.z),
          b: new THREE.Vector3(min.x, max.y, max.z),
          dir: UP,
          text: formatLength(max.z - min.z, units),
        },
        {
          a: new THREE.Vector3(min.x, min.y, max.z),
          b: new THREE.Vector3(min.x, max.y, max.z),
          dir: PLUS_Z,
          text: formatLength(max.y - min.y, units),
        },
      ];
      for (const spec of specs) {
        const dim = new DimensionLine(this.dimMaterial);
        dim.update({ ...spec, offset, arrow: 18 });
        this.dimensions.add(dim);
      }
    }
  }
}
