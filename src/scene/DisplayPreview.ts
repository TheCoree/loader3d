import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { computeLayout, DECK_HEIGHT, vehicleBounds, type VehicleLayout } from '../core/layout';
import { CARGO_COLORS, VEHICLE_PRESETS } from '../core/presets';
import type { CargoItem, Vehicle } from '../core/types';
import type { Settings } from '../store/useStore';
import { CargoView } from './CargoView';
import { LoadLengthView } from './LoadLengthView';
import { VehicleView } from './VehicleView';
import { vehicleParts } from './displayParts';
import { COLORS } from './theme';

/** From the framed truck towards the camera: from behind and to the left, looking into the open doors. */
const DIRECTION = new THREE.Vector3(-0.95, 0.62, 1.15).normalize();

/** A 10-t truck with the front half loaded: pallets in three rows, a second tier on the last one. */
function sample(): { layout: VehicleLayout; items: CargoItem[] } {
  const preset = VEHICLE_PRESETS.find((p) => p.id === 'truck10') ?? VEHICLE_PRESETS[0];
  const vehicle: Vehicle = {
    id: 'preview',
    name: 'Пример',
    bodies: preset.bodies.map((b, i) => ({ ...b, id: `preview-body-${i}` })),
  };
  const layout = computeLayout([vehicle], 'own');
  const box = layout.bodies[0].box;
  const items: CargoItem[] = [];
  const heights = [150, 130, 105];
  let seq = 1;
  const add = (x: number, y: number, z: number, h: number, l = 120) => {
    items.push({
      id: `preview-${seq}`,
      seq,
      name: `Паллета ${seq}`,
      dims: { l, w: 80, h },
      orientation: { yaw: 0 },
      pos: { x, y, z },
      color: CARGO_COLORS[(seq - 1) % CARGO_COLORS.length],
    });
    seq++;
  };
  heights.forEach((h, row) => {
    for (let col = 0; col < 3; col++) add(box.max.x - 120 * (row + 1), box.min.y, box.min.z + 2 + col * 80, h);
  });
  for (let col = 0; col < 2; col++) add(box.max.x - 360, box.min.y + heights[2], box.min.z + 2 + col * 80, 70);
  return { layout, items };
}

/**
 * A small live scene for the display settings dialog: the same vehicle, cargo and ruler views as the
 * editor, on a sample truck, with its own WebGL context and an orbit camera. Renders on demand.
 *
 * One instance is kept for the editor ({@link acquireDisplayPreview}) and moved between dialog openings
 * (`attach`/`detach`): the WebGL context and the compiled shaders are made once, so reopening is instant.
 */
export class DisplayPreview {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 10, 60000);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight('#ffffff', 2.3);
  private readonly vehicle = new VehicleView();
  private readonly cargo = new CargoView();
  private readonly loadLength = new LoadLengthView();
  private readonly resizeObserver = new ResizeObserver(() => this.resize());
  private readonly sample = sample();
  private host: HTMLElement | null = null;
  private settings: Settings | null = null;
  private frame = 0;
  private width = 1;
  private height = 1;
  /** Shaders compiled in the background ({@link ready}); nothing is drawn before that. */
  private compiled = false;
  private compiling: Promise<void> | null = null;
  /** Half the diagonal of the truck: the sphere the camera keeps in view. */
  private readonly fitRadius: number;

  constructor() {
    // A small picture: 1.5× is sharp enough and keeps every frame cheap.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.className = 'scene-canvas';
    this.labels.domElement.className = 'label-layer';

    this.scene.background = new THREE.Color(COLORS.background);
    const hemi = new THREE.HemisphereLight('#ffffff', '#aab3bf', 1.55);
    const fill = new THREE.DirectionalLight('#e3ebff', 0.55);
    fill.position.set(2000, 1200, -2400);
    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(20000, 20000),
      new THREE.MeshStandardMaterial({ color: COLORS.yard, roughness: 1 }),
    );
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = -DECK_HEIGHT;
    yard.receiveShadow = true;
    this.scene.add(hemi, fill, this.sun, this.sun.target, yard, this.vehicle.root, this.cargo.root, this.loadLength.root);

    // Framing: the truck with a little of the dock behind it.
    const bounds = vehicleBounds(this.sample.layout.vehicles[0]);
    const center = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2 - 40,
      (bounds.min.z + bounds.max.z) / 2,
    );
    const radius = new THREE.Vector3(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ).length();
    this.fitRadius = radius / 2;
    this.camera.position.copy(center).addScaledVector(DIRECTION, radius * 2.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(center);
    this.controls.minDistance = radius * 0.5;
    this.controls.maxDistance = radius * 3;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.update();

    const dir = new THREE.Vector3(-0.35, 1, 0.5).normalize();
    this.sun.target.position.set(center.x, 0, center.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 4000);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.5;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 100;
    cam.far = 9000;
    cam.updateProjectionMatrix();
  }

  /** Puts the canvas into `host` (the dialog's preview box). */
  attach(host: HTMLElement): void {
    this.detach();
    this.host = host;
    host.append(this.renderer.domElement, this.labels.domElement);
    this.resizeObserver.observe(host);
    this.resize();
  }

  detach(): void {
    if (!this.host) return;
    this.resizeObserver.disconnect();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    this.host = null;
  }

  /**
   * Resolves once the shaders are compiled (in parallel where the browser can) and the first frame is
   * drawn; call after `apply`, so every material of the sample is compiled at once.
   */
  ready(): Promise<void> {
    this.compiling ??= this.renderer.compileAsync(this.scene, this.camera).then(() => {
      this.compiled = true;
      this.requestRender();
    });
    return this.compiling;
  }

  /** Shows the sample with these display settings. */
  apply(settings: Settings): void {
    const prev = this.settings;
    this.settings = settings;
    const { layout, items } = this.sample;
    if (!prev || prev.units !== settings.units || prev.showDimensions !== settings.showDimensions) {
      this.vehicle.build(layout, {
        units: settings.units,
        showDimensions: settings.showDimensions,
        parts: vehicleParts(settings),
        wallOpacity: settings.wallOpacity,
      });
    } else {
      this.vehicle.setParts(vehicleParts(settings));
      this.vehicle.setWallOpacity(settings.wallOpacity);
    }
    this.cargo.sync(items, layout, { highlightOverflow: settings.highlightOverflow, showLabels: settings.showLabels });
    // «Все грузы» shows every box see-through, as in the editor; the other modes depend on a selection.
    this.cargo.setFade(settings.xray === 'all' ? new Map(items.map((i) => [i.id, settings.xrayOpacity])) : null);
    this.cargo.animate(10_000);
    this.loadLength.update(items, layout, { units: settings.units, show: settings.showLoadLength });
    this.sun.castShadow = settings.showShadows;
    this.requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.detach();
    this.controls.dispose();
    this.vehicle.dispose();
    this.cargo.dispose();
    this.loadLength.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private resize(): void {
    if (!this.host) return;
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height);
    this.labels.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    // Fit the truck to the box, whatever its shape: the narrower of the two fields of view decides.
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const distance = (this.fitRadius * 1.08) / Math.sin(Math.min(vertical, horizontal) / 2);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(distance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestRender();
  }

  private readonly requestRender = () => {
    if (this.frame || !this.compiled || !this.host) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.camera.updateMatrixWorld();
      this.vehicle.fitLabels(this.camera, this.width, this.height);
      this.loadLength.fitLabels(this.camera, this.width, this.height);
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    });
  };
}

let shared: DisplayPreview | null = null;

/** The editor's preview, made on first use. */
export function acquireDisplayPreview(): DisplayPreview {
  return (shared ??= new DisplayPreview());
}

/** Frees the preview's WebGL context (the editor closes). */
export function releaseDisplayPreview(): void {
  shared?.dispose();
  shared = null;
}
