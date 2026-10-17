import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Box, CargoItem } from '../core/types';
import { DECK_HEIGHT, vehicleBounds, type VehicleLayout } from '../core/layout';
import { itemBox } from '../core/item';
import { unionBoxes } from '../core/geometry';
import type { Face } from '../core/resize';
import { getLayout, useStore, type AppState } from '../store/useStore';
import { CameraRig, type ViewPreset } from './CameraRig';
import { CargoView } from './CargoView';
import { GuidesView } from './GuidesView';
import { InteractionManager } from './InteractionManager';
import { SelectionView } from './SelectionView';
import { VehicleView } from './VehicleView';
import { COLORS } from './theme';

export type PickResult =
  | { kind: 'item'; id: string; point: THREE.Vector3 }
  | { kind: 'handle'; id: string; face: Face; point: THREE.Vector3 };

/**
 * Imperative three.js side of the app. Reads the zustand store, renders on demand and owns the
 * interaction layer. React only mounts it and calls a few camera commands.
 */
export class SceneEngine {
  readonly store = useStore;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 10, 80000);
  readonly renderer: THREE.WebGLRenderer;
  readonly guides = new GuidesView();

  private readonly labelRenderer = new CSS2DRenderer();
  private readonly rig: CameraRig;
  private readonly vehicle = new VehicleView();
  private readonly cargo = new CargoView();
  private readonly selection = new SelectionView();
  private readonly interaction: InteractionManager;
  private readonly sun = new THREE.DirectionalLight('#ffffff', 2.3);
  private readonly yard: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribe: () => void;

  private preview: CargoItem[] | null = null;
  private hoverId: string | null = null;
  private frameHandle = 0;
  private framePending = false;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private disposed = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.className = 'scene-canvas';
    host.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.className = 'label-layer';
    host.appendChild(this.labelRenderer.domElement);

    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 9000, 30000);

    const hemi = new THREE.HemisphereLight('#ffffff', '#aab3bf', 1.55);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.5;
    const fill = new THREE.DirectionalLight('#e3ebff', 0.55);
    fill.position.set(2000, 1200, -2400);
    this.scene.add(hemi, this.sun, this.sun.target, fill);

    this.yard = new THREE.Mesh(
      new THREE.PlaneGeometry(120000, 120000),
      new THREE.MeshStandardMaterial({ color: COLORS.yard, roughness: 1 }),
    );
    this.yard.rotation.x = -Math.PI / 2;
    this.yard.position.y = -DECK_HEIGHT;
    this.yard.receiveShadow = true;

    this.scene.add(this.yard, this.vehicle.root, this.cargo.root, this.selection.root, this.guides.root);

    this.rig = new CameraRig(this.camera, this.renderer.domElement, this.requestRender);
    this.interaction = new InteractionManager(this, host);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    const state = useStore.getState();
    this.rebuildVehicle();
    this.syncCargo();
    this.syncSelection();
    this.rig.setLocked(state.settings.cameraLocked);
    this.rig.setView('iso', this.focusBounds(), false);

    this.unsubscribe = useStore.subscribe((s, prev) => this.onStoreChange(s, prev));
  }

  // ---------------------------------------------------------------- public API

  get layout(): VehicleLayout {
    return getLayout(useStore.getState().bodies);
  }

  /** Items as currently shown: the store state, or a live preview while a tool is active. */
  get displayItems(): readonly CargoItem[] {
    return this.preview ?? useStore.getState().items;
  }

  setView(preset: ViewPreset): void {
    this.rig.setView(preset, this.focusBounds());
  }

  fitAll(): void {
    this.rig.setView('iso', this.focusBounds());
  }

  focusItem(id: string): void {
    const item = useStore.getState().items.find((i) => i.id === id);
    if (item) this.rig.focus(itemBox(item), 2.2);
  }

  setPreview(items: CargoItem[] | null): void {
    this.preview = items;
    this.syncCargo();
    this.syncSelection();
    this.requestRender();
  }

  setHover(itemId: string | null, face: Face | null): void {
    if (itemId !== this.hoverId) {
      this.hoverId = itemId;
      this.cargo.setHighlight(itemId, useStore.getState().selectedId);
    }
    this.selection.setHoveredFace(face);
    this.requestRender();
  }

  setActiveHandle(face: Face | null): void {
    this.selection.setActiveFace(face);
    this.requestRender();
  }

  setCursor(cursor: string): void {
    this.host.style.cursor = cursor;
  }

  onToolChanged(): void {
    this.syncSelection();
    this.requestRender();
  }

  pick(clientX: number, clientY: number): PickResult | null {
    this.setRay(clientX, clientY);
    const handles = this.selection.handleTargets();
    if (handles.length && this.selection.itemId) {
      const hit = this.raycaster.intersectObjects(handles, false)[0];
      if (hit) {
        return { kind: 'handle', id: this.selection.itemId, face: hit.object.userData.face, point: hit.point.clone() };
      }
    }
    const hit = this.raycaster.intersectObjects(this.cargo.pickables(), false)[0];
    if (hit) return { kind: 'item', id: hit.object.userData.itemId, point: hit.point.clone() };
    return null;
  }

  rayAt(clientX: number, clientY: number): THREE.Ray {
    this.setRay(clientX, clientY);
    return this.raycaster.ray.clone();
  }

  intersectPlane(clientX: number, clientY: number, plane: THREE.Plane, target: THREE.Vector3): THREE.Vector3 | null {
    this.setRay(clientX, clientY);
    return this.raycaster.ray.intersectPlane(plane, target);
  }

  /** World units covered by one screen pixel at `point`. */
  worldPerPixel(point: THREE.Vector3): number {
    const d = this.camera.position.distanceTo(point);
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.viewportHeight;
  }

  /** Arrow key → world step along the axis that best matches "up/down/left/right" on screen. */
  cameraAlignedStep(key: string, step: number): { x: number; z: number } | null {
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    let f = new THREE.Vector3(forward.x, 0, forward.z);
    if (f.lengthSq() < 0.01) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      f = new THREE.Vector3(up.x, 0, up.z);
    }
    f.normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    const dir =
      key === 'ArrowUp' ? f : key === 'ArrowDown' ? f.negate() : key === 'ArrowRight' ? right : key === 'ArrowLeft' ? right.negate() : null;
    if (!dir) return null;
    return Math.abs(dir.x) >= Math.abs(dir.z)
      ? { x: Math.sign(dir.x) * step, z: 0 }
      : { x: 0, z: Math.sign(dir.z) * step };
  }

  readonly requestRender = (): void => {
    if (this.disposed || this.framePending) return;
    this.framePending = true;
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.interaction.dispose();
    this.rig.dispose();
    this.vehicle.dispose();
    this.cargo.dispose();
    this.selection.dispose();
    this.guides.dispose();
    this.yard.geometry.dispose();
    this.yard.material.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  // ---------------------------------------------------------------- internals

  private readonly frame = (now: number) => {
    this.framePending = false;
    const animating = this.rig.update(now);
    this.camera.updateMatrixWorld();
    this.vehicle.fitLabels(this.camera, this.viewportWidth, this.viewportHeight);
    this.selection.beforeRender(this.camera, this.viewportWidth, this.viewportHeight);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    if (animating) this.requestRender();
  };

  private onStoreChange(s: AppState, prev: AppState): void {
    const st = s.settings;
    const pt = prev.settings;
    const bodiesChanged = s.bodies !== prev.bodies;
    const viewChanged = st.units !== pt.units || st.showDimensions !== pt.showDimensions;

    if (bodiesChanged || viewChanged) this.rebuildVehicle();
    if (
      bodiesChanged ||
      s.items !== prev.items ||
      st.highlightOverflow !== pt.highlightOverflow ||
      st.showLabels !== pt.showLabels
    ) {
      this.syncCargo();
    }
    if (
      bodiesChanged ||
      viewChanged ||
      s.items !== prev.items ||
      s.selectedId !== prev.selectedId ||
      st.resizeHandles !== pt.resizeHandles
    ) {
      this.syncSelection();
    }
    if (st.cameraLocked !== pt.cameraLocked) this.rig.setLocked(st.cameraLocked);
    if (s.bodies.length !== prev.bodies.length) this.fitAll();
    this.requestRender();
  }

  private rebuildVehicle(): void {
    const s = useStore.getState();
    const layout = getLayout(s.bodies);
    this.vehicle.build(layout, { units: s.settings.units, showDimensions: s.settings.showDimensions });
    this.updateShadowCamera(layout);
  }

  private syncCargo(): void {
    const s = useStore.getState();
    this.cargo.sync(this.displayItems, getLayout(s.bodies), {
      highlightOverflow: s.settings.highlightOverflow,
      showLabels: s.settings.showLabels,
    });
    this.cargo.setHighlight(this.hoverId, s.selectedId);
  }

  private syncSelection(): void {
    const s = useStore.getState();
    const item = s.selectedId ? (this.displayItems.find((i) => i.id === s.selectedId) ?? null) : null;
    this.selection.update(item, {
      units: s.settings.units,
      showDimensions: s.settings.showDimensions,
      handles: s.settings.resizeHandles && this.interaction.activeTool !== 'move',
    });
    this.cargo.setHighlight(this.hoverId, s.selectedId);
  }

  private updateShadowCamera(layout: VehicleLayout): void {
    const vb = vehicleBounds(layout);
    const minX = Math.min(layout.dock.minX, vb.min.x);
    const maxX = vb.max.x;
    const minZ = Math.min(layout.dock.minZ, vb.min.z);
    const maxZ = Math.max(layout.dock.maxZ, vb.max.z);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const half = Math.max(maxX - minX, maxZ - minZ) / 2 + 400;
    const dir = new THREE.Vector3(-0.35, 1, 0.5).normalize();
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx, 0, cz).addScaledVector(dir, 5000);
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 100;
    cam.far = 10000;
    cam.updateProjectionMatrix();
  }

  /** What the camera frames: the vehicle and all cargo. */
  private focusBounds(): Box {
    const boxes = [vehicleBounds(this.layout), ...useStore.getState().items.map(itemBox)];
    const union = unionBoxes(boxes)!;
    return { min: { ...union.min, y: Math.min(union.min.y, -DECK_HEIGHT * 0.4) }, max: union.max };
  }

  private setRay(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    // The camera may have moved since the last rendered frame (damping, tweens).
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}
