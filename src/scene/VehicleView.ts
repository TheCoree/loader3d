import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Box, Rect } from '../core/types';
import {
  CAB_GAP,
  CAB_LENGTH,
  CAB_WIDTH,
  DECK_HEIGHT,
  type PlacedBody,
  type PlacedVehicle,
  type VehicleLayout,
} from '../core/layout';
import { formatLength, type Units } from '../core/units';
import { DimensionLine } from './DimensionLine';
import { boxEdges, disposeTree, fatMaterial, fatSegments } from './lines';
import { COLORS } from './theme';

export interface VehicleViewOptions {
  units: Units;
  showDimensions: boolean;
  /** Translucent walls, roof and side posts of the bodies (default true); the frame and floor marks always show. */
  showWalls?: boolean;
  /** Highlighted name tag when there are several vehicles. */
  activeVehicleId?: string | null;
}

const WHEEL_RADIUS = 52;
const TIRE_WIDTH = 30;
/** Front axle of the cab, from the cab's front face. */
const FRONT_AXLE = 75;
/** Wheel arch cut into the cab side, a little larger than the tyre. */
const ARCH_RADIUS = 60;
const UP = new THREE.Vector3(0, 1, 0);
const PLUS_Z = new THREE.Vector3(0, 0, 1);

/** A tyre with rounded shoulders (lathe about Y; wheels are turned so the axis runs along Z). */
function tireGeometry(): THREE.LatheGeometry {
  const r = WHEEL_RADIUS;
  const w = TIRE_WIDTH / 2;
  const profile = [
    [r - 22, -w],
    [r - 6, -w],
    [r - 2, -w + 2.5],
    [r, -w + 6],
    [r, w - 6],
    [r - 2, w - 2.5],
    [r - 6, w],
    [r - 22, w],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 36);
}

/**
 * Side profile of a European cab-over cab (x from the back wall to the front, y up from the cab floor):
 * a raked windscreen, rounded roof edges and the arch over the front wheel.
 */
function cabProfile(L: number, h: number): THREE.Shape {
  const axle = L - FRONT_AXLE;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(axle - ARCH_RADIUS, 0);
  s.absarc(axle, 0, ARCH_RADIUS, Math.PI, 0, true);
  s.lineTo(L - 10, 0);
  s.quadraticCurveTo(L, 0, L, 14);
  s.lineTo(L, h * 0.5);
  s.lineTo(L - 16, h * 0.92);
  s.quadraticCurveTo(L - 20, h, L - 36, h);
  s.lineTo(14, h);
  s.quadraticCurveTo(0, h, 0, h - 14);
  s.closePath();
  return s;
}

/** Extrudes a side profile across the vehicle (Z), centred, with rounded edges. */
function extrudeAcross(shape: THREE.Shape, width: number, bevel: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    // The rounded edge stays inside the outline, so parts placed on the faces sit on the surface.
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -(width - 2 * bevel) / 2);
  return geometry;
}

/** Marks DOM elements over the scene that handle their own clicks (InteractionManager skips them). */
export const SCENE_UI_ATTRIBUTE = 'data-scene-ui';

function shiftZ(b: Box, dz: number): Box {
  return { min: { ...b.min, z: b.min.z + dz }, max: { ...b.max, z: b.max.z + dz } };
}

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
 * Static part of the scene: dock platforms, the vehicles side by side (cargo bodies as translucent
 * boxes with a frame, a stylised cab/chassis for orientation) and drawing-style overall dimensions.
 * Each vehicle is built around its own centreline in a group moved to its lane.
 */
export class VehicleView {
  readonly root = new THREE.Group();
  /** Clicks on a vehicle name tag (only shown when there are several vehicles). */
  onVehicleClick: ((id: string) => void) | null = null;
  private readonly dimensions = new THREE.Group();
  private readonly tags = new Map<string, HTMLElement>();
  /** Translucent walls, roof and side posts of every body (the «Стенки кузова» setting). */
  private readonly walls: THREE.Object3D[] = [];
  /** Where `add()` puts objects: the root, or the group of the vehicle being built. */
  private parent: THREE.Object3D = this.root;

  private readonly frameMaterial = fatMaterial(COLORS.frame, 2);
  private readonly dimMaterial = fatMaterial(COLORS.dims, 1.25);
  private readonly wheelGeometry = tireGeometry();
  /** The rim: a disc set into the tyre, a raised hub and the hub cap. */
  private readonly rimGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS - 21, WHEEL_RADIUS - 21, TIRE_WIDTH - 6, 32);
  private readonly hubGeometry = new THREE.CylinderGeometry(13, 15, TIRE_WIDTH + 1, 20);

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
    cab: standard(COLORS.cab, { roughness: 0.35 }),
    trim: standard(COLORS.cabTrim, { roughness: 0.6 }),
    glass: standard(COLORS.glass, { roughness: 0.12, metalness: 0.3, side: THREE.DoubleSide }),
    rim: standard(COLORS.rim, { roughness: 0.35, metalness: 0.45 }),
    light: new THREE.MeshBasicMaterial({ color: COLORS.light }),
    tailLight: new THREE.MeshBasicMaterial({ color: COLORS.tailLight }),
    indicator: new THREE.MeshBasicMaterial({ color: COLORS.indicator }),
    seam: new THREE.LineBasicMaterial({ color: COLORS.cabTrim, transparent: true, opacity: 0.35 }),
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
    for (const dock of layout.docks) this.buildDock(dock);
    for (const pv of layout.vehicles) {
      const group = new THREE.Group();
      group.name = `vehicle:${pv.vehicle.id}`;
      group.position.z = pv.lane;
      this.root.add(group);
      this.parent = group;
      const bodies = pv.bodies.map((pb) => ({ ...pb, box: shiftZ(pb.box, -pv.lane) }));
      for (const pb of bodies) this.buildBody(pb);
      this.buildCouplings(bodies);
      this.buildCab(pv, bodies);
      if (layout.vehicles.length > 1) this.buildTag(pv, bodies);
      this.parent = this.root;
    }
    this.buildDimensions(layout, options.units);
    this.dimensions.visible = options.showDimensions;
    this.root.add(this.dimensions);
    this.setActive(options.activeVehicleId ?? null);
    this.setWallsVisible(options.showWalls ?? true);
  }

  /** Shows or hides the translucent walls, roof and side posts; the frame stays. */
  setWallsVisible(visible: boolean): void {
    for (const obj of this.walls) obj.visible = visible;
  }

  /** Highlights the name tag of the active vehicle. */
  setActive(vehicleId: string | null): void {
    for (const [id, tag] of this.tags) tag.classList.toggle('vehicle-tag--active', id === vehicleId);
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
    this.rimGeometry.dispose();
    this.hubGeometry.dispose();
    this.frameMaterial.dispose();
    this.dimMaterial.dispose();
    this.stripeTexture.dispose();
    this.dockTextTexture.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
  }

  private clear(): void {
    this.tags.clear();
    this.walls.length = 0;
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
    this.parent.add(obj);
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

  /** Two wheels on an axle beam (the beam ties them to the chassis above). */
  private wheelPair(x: number, halfTrack: number): void {
    const y = -DECK_HEIGHT + WHEEL_RADIUS;
    this.add(this.box([12, 12, 2 * halfTrack - TIRE_WIDTH], this.mats.chassis, [x, y, 0]), { cast: true });
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(this.wheelGeometry, this.mats.tire);
      const rim = new THREE.Mesh(this.rimGeometry, this.mats.rim);
      const hub = new THREE.Mesh(this.hubGeometry, this.mats.hub);
      tire.userData.sharedGeometry = rim.userData.sharedGeometry = hub.userData.sharedGeometry = true;
      wheel.add(tire, rim, hub);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, y, side * halfTrack);
      this.add(wheel, { cast: true });
    }
  }

  /**
   * Mud flaps behind a wheel pair, each hanging from an arm that runs out from the chassis
   * (`chassisZ` its outer side, `chassisY` its underside).
   */
  private mudFlaps(x: number, halfTrack: number, chassisZ: number, chassisY: number): void {
    const bottom = -DECK_HEIGHT + 24;
    const outer = halfTrack + TIRE_WIDTH / 2 + 4;
    for (const side of [-1, 1]) {
      this.add(this.box([3, chassisY - bottom, TIRE_WIDTH + 14], this.mats.trim, [x, (chassisY + bottom) / 2, side * halfTrack]), {
        cast: true,
      });
      this.add(this.box([6, 6, outer - chassisZ], this.mats.chassis, [x + 4, chassisY - 3, side * (chassisZ + outer) / 2]), {
        cast: true,
      });
    }
  }

  private buildDock(d: Rect): void {
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
    this.walls.push(this.add(new THREE.Group().add(left, right, roof, front)));

    // Frame (always) and side posts (with the walls).
    this.add(fatSegments(boxEdges(min, max), this.frameMaterial));
    const posts: number[] = [];
    const count = Math.max(1, Math.round(L / 120));
    for (let i = 1; i < count; i++) {
      const x = min.x + (L * i) / count;
      posts.push(x, 0, min.z, x, H, min.z, x, 0, max.z, x, H, max.z, x, H, min.z, x, H, max.z);
    }
    this.walls.push(this.add(this.lines(posts, this.mats.posts)));

    // Chassis, axles and wheels.
    this.add(this.box([L - 60, 26, W - 90], this.mats.chassis, [cx, -23, 0]), { cast: true });
    const halfTrack = W / 2 - 28;
    const rear =
      body.kind === 'semi' ? [140, 270, 400] : body.kind === 'truck' ? [150, 285] : [140, 270];
    for (const offset of rear) this.wheelPair(min.x + offset, halfTrack);
    if (body.kind === 'trailer') this.wheelPair(max.x - 150, halfTrack);
    const chassisZ = (W - 90) / 2;
    const chassisBottom = -36;
    this.mudFlaps(min.x + rear[0] - WHEEL_RADIUS - 12, halfTrack, chassisZ, chassisBottom);
    if (body.kind === 'semi') {
      // Landing gear legs with their feet.
      for (const side of [-1, 1]) {
        const z = side * (W / 2 - 50);
        this.add(this.box([14, DECK_HEIGHT - 36, 14], this.mats.chassis, [max.x - 280, -DECK_HEIGHT / 2 - 18, z]), {
          cast: true,
        });
        this.add(this.box([30, 6, 24], this.mats.chassis, [max.x - 280, -DECK_HEIGHT + 3, z]), { cast: true });
      }
    }
    // Side underrun guards between the axles.
    const guardFrom = min.x + rear[rear.length - 1] + WHEEL_RADIUS + 20;
    const guardTo = body.kind === 'semi' ? max.x - 300 : body.kind === 'trailer' ? max.x - 150 - WHEEL_RADIUS - 20 : max.x - 40;
    if (guardTo - guardFrom > 80) {
      const guardZ = W / 2 - 6;
      for (const side of [-1, 1]) {
        for (const y of [-58, -86]) {
          this.add(this.box([guardTo - guardFrom, 6, 3], this.mats.trim, [(guardFrom + guardTo) / 2, y, side * guardZ]), {
            cast: true,
          });
        }
        // Brackets from the chassis down to the rails, at both ends and every 2 m between.
        const brackets = Math.max(2, Math.round((guardTo - guardFrom) / 200) + 1);
        for (let i = 0; i < brackets; i++) {
          const x = guardFrom + 4 + ((guardTo - guardFrom - 8) * i) / (brackets - 1);
          this.add(this.box([5, chassisBottom + 89, 5], this.mats.chassis, [x, (chassisBottom - 89) / 2, side * (guardZ - 3)]), {
            cast: true,
          });
          this.add(this.box([5, 5, guardZ - chassisZ], this.mats.chassis, [x, chassisBottom - 2.5, side * (guardZ + chassisZ) / 2]), {
            cast: true,
          });
        }
      }
    }
    // Rear crossmember under the floor with the tail lights; the underrun bar hangs from it.
    this.add(this.box([30, 26, W - 6], this.mats.chassis, [min.x + 15, -23, 0]), { cast: true });
    const barY = -DECK_HEIGHT + 52;
    this.add(this.box([8, 14, W - 30], this.mats.trim, [min.x + 10, barY, 0]), { cast: true });
    for (const side of [-1, 1]) {
      this.add(this.box([6, chassisBottom - barY, 8], this.mats.chassis, [min.x + 12, (chassisBottom + barY) / 2, side * (W / 2 - 40)]), {
        cast: true,
      });
      this.add(this.box([3, 12, 34], this.mats.tailLight, [min.x - 1, -23, side * (W / 2 - 26)]));
    }

    const tag = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'body-tag', textContent: body.name }));
    tag.position.set(max.x - 40, H + 6, min.z);
    tag.center.set(1, 1);
    this.parent.add(tag);
  }

  /** Vehicle name over the cab; a click makes it the active vehicle. */
  private buildTag(pv: PlacedVehicle, bodies: PlacedBody[]): void {
    const element = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'vehicle-tag',
      textContent: pv.vehicle.name,
      title: 'Перейти к этой машине',
    });
    element.setAttribute(SCENE_UI_ATTRIBUTE, '');
    element.addEventListener('click', () => this.onVehicleClick?.(pv.vehicle.id));
    const tag = new CSS2DObject(element);
    const top = Math.max(250, bodies[0]?.box.max.y ?? 0);
    tag.position.set(pv.front + CAB_GAP + CAB_LENGTH / 2, top + 24, 0);
    tag.center.set(0.5, 1);
    this.parent.add(tag);
    this.tags.set(pv.vehicle.id, element);
  }

  private buildCouplings(bodies: PlacedBody[]): void {
    for (let i = 0; i < bodies.length - 1; i++) {
      const front = bodies[i].box;
      const back = bodies[i + 1].box;
      const length = front.min.x - back.max.x + 120;
      this.add(this.box([length, 12, 14], this.mats.chassis, [(front.min.x + back.max.x) / 2, -62, 0]), {
        cast: true,
      });
    }
  }

  /**
   * A European cab-over cab in one colour: rounded body with the front wheel arch, raked windscreen,
   * sun visor, grille, headlights, bumper, door seams and handles, side windows, big mirrors, steps;
   * a roof deflector on tractors; the chassis rails, fuel tank and battery box behind it.
   */
  private buildCab(pv: PlacedVehicle, bodies: PlacedBody[]): void {
    const first = bodies[0];
    if (!first) return;
    const W = CAB_WIDTH;
    const L = CAB_LENGTH;
    const semi = first.body.kind === 'semi';
    const gap = semi ? CAB_GAP : 14;
    const x0 = pv.front + gap;
    const x1 = x0 + L;
    const yBottom = -DECK_HEIGHT + 48;
    const yTop = Math.max(170, Math.min(first.box.max.y - 15, 250));
    const h = yTop - yBottom;
    const halfW = W / 2;
    const cab = new THREE.Group();
    cab.position.set(x0, yBottom, 0);
    // Local coordinates from here: x from the back wall, y from the cab floor.
    const part = (mesh: THREE.Object3D) => cab.add(mesh);
    const box = (size: [number, number, number], mat: THREE.Material, pos: [number, number, number]) =>
      part(this.box(size, mat, pos));

    const shell = new THREE.Mesh(extrudeAcross(cabProfile(L, h), W, 8), this.mats.cab);
    part(shell);

    // Windscreen on the raked face, a sun visor above it.
    const w0 = new THREE.Vector2(L, h * 0.52);
    const w1 = new THREE.Vector2(L - 15, h * 0.9);
    const slope = w1.clone().sub(w0);
    const screen = new THREE.Group();
    screen.position.set((w0.x + w1.x) / 2 + 0.8, (w0.y + w1.y) / 2, 0);
    screen.rotation.z = Math.atan2(slope.y, slope.x) - Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 34, slope.length() - 6), this.mats.glass);
    glass.rotation.y = Math.PI / 2;
    screen.add(glass);
    part(screen);
    box([24, 5, W - 16], this.mats.trim, [L - 16, h * 0.93 + 2, 0]);

    // Grille: a dark panel with slats in the cab colour; headlights and indicators; the bumper.
    const grilleH = h * 0.28;
    const grilleY = h * 0.5 - grilleH / 2 - 8;
    box([2, grilleH, W - 86], this.mats.trim, [L + 0.6, grilleY, 0]);
    for (let i = 0; i < 5; i++) {
      box([4, 4, W - 92], this.mats.cab, [L + 1.6, grilleY - grilleH / 2 + (grilleH * (i + 0.5)) / 5, 0]);
    }
    for (const side of [-1, 1]) {
      box([4, 16, 44], this.mats.light, [L + 1.5, 42, side * (halfW - 36)]);
      box([4, 8, 14], this.mats.indicator, [L + 1.5, 42, side * (halfW - 8)]);
    }
    box([18, 30, W + 6], this.mats.trim, [L + 4, 10, 0]);

    for (const side of [-1, 1]) {
      const z = side * (halfW + 0.6);
      // Side window following the windscreen, the door seam and handle.
      const window = new THREE.Shape([
        new THREE.Vector2(L - 98, h * 0.56),
        new THREE.Vector2(L - 22, h * 0.56),
        new THREE.Vector2(L - 33, h * 0.88),
        new THREE.Vector2(L - 98, h * 0.88),
      ]);
      const pane = new THREE.Mesh(new THREE.ShapeGeometry(window), this.mats.glass);
      pane.position.z = z;
      part(pane);
      // The door ends above the wheel arch.
      const sill = ARCH_RADIUS + 8;
      const seam = [
        [L - 104, sill, L - 104, h * 0.92],
        [L - 104, h * 0.92, L - 26, h * 0.92],
        [L - 104, sill, L - 8, sill],
      ].flatMap(([ax, ay, bx, by]) => [ax, ay, z, bx, by, z]);
      part(this.lines(seam, this.mats.seam));
      box([16, 4, 3], this.mats.trim, [L - 90, h * 0.5, side * (halfW + 1.5)]);

      // Mirror on an arm in front of the door, and the steps behind the wheel.
      const mirrorY = h * 0.66;
      for (const dy of [14, -14]) box([4, 4, 30], this.mats.trim, [L - 18, mirrorY + dy, side * (halfW + 15)]);
      box([10, 40, 16], this.mats.trim, [L - 18, mirrorY, side * (halfW + 32)]);
      const stepX = L - 2 * FRONT_AXLE - 22;
      box([40, 46, 4], this.mats.trim, [stepX, -21, side * (halfW - 22)]);
      for (const y of [-38, -12]) box([34, 4, 22], this.mats.trim, [stepX, y, side * (halfW - 10)]);
    }

    // Roof deflector on tractors, sloping up to the trailer height.
    if (semi && first.box.max.y > yTop + 20) {
      const dh = first.box.max.y - yTop - 6;
      const deflector = new THREE.Shape([
        new THREE.Vector2(6, 0),
        new THREE.Vector2(L * 0.78, 0),
        new THREE.Vector2(L * 0.32, dh),
        new THREE.Vector2(10, dh),
      ]);
      const mesh = new THREE.Mesh(extrudeAcross(deflector, W - 26, 6), this.mats.cab);
      mesh.position.y = h - 2;
      part(mesh);
    }
    this.add(cab, { cast: true, receive: true });

    // Two chassis rails; under a semi-trailer they run back to the rear axles of the tractor.
    const chassisStart = semi ? pv.front - 330 : x0 - 10;
    for (const side of [-1, 1]) {
      this.add(this.box([x1 - chassisStart, 26, 14], this.mats.chassis, [(x1 + chassisStart) / 2, -62, side * 45]), {
        cast: true,
      });
    }
    const halfTrack = halfW - 30;
    this.wheelPair(x1 - FRONT_AXLE, halfTrack);
    if (semi) {
      // Fuel tank and battery box between the axles, mud flaps behind the rear wheels.
      const between = x0 - 70;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(27, 27, 120, 24), this.mats.rim);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(between, -70, halfW - 48);
      this.add(tank, { cast: true });
      this.add(this.box([60, 44, 40], this.mats.chassis, [between, -70, -(halfW - 50)]), { cast: true });
      this.wheelPair(pv.front - 90, halfTrack);
      this.wheelPair(pv.front - 225, halfTrack);
      this.mudFlaps(pv.front - 225 - WHEEL_RADIUS - 12, halfTrack, 52, -75);
      // Fifth wheel: the plate on the rails the semi-trailer rests on.
      this.add(this.box([80, 13, 100], this.mats.chassis, [pv.front - 160, -42.5, 0]), { cast: true });
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
