import { Vector3 } from 'three';
import { planApi } from '../api/endpoints';
import type { PlanRecord } from '../api/types';
import { unionBoxes } from '../core/geometry';
import { itemBox } from '../core/item';
import { DECK_HEIGHT, vehicleBounds } from '../core/layout';
import { classify } from '../core/stats';
import type { Box, Plan } from '../core/types';
import { SnapshotRenderer } from '../pdf/snapshot';
import { exportPlan, layoutOf, useStore } from '../store/useStore';

/**
 * The preview picture of the open plan for its card on the home page: a 3D view of every vehicle with
 * the cargo in it, rendered off screen by the PDF's SnapshotRenderer and uploaded as a JPEG. Made a few
 * seconds after the last change once nobody has touched the mouse or the keyboard for a moment (so it never
 * lands in the middle of turning the camera), when the editor closes with changes not pictured yet, and once
 * for a plan that has no picture. Failing is harmless: the card keeps the previous picture.
 */

const IDLE_DELAY = 4000;
const FIRST_DELAY = 1500;
/** No pointer, wheel or key input for this long before a picture is taken, ms. */
const QUIET = 2000;
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;
/** CSS px of the picture (the bitmap is twice as large); the card shows it at about 360 px. */
const WIDTH = 480;
const ASPECT = 16 / 10;
/** Light grey of the card's preview area, close to the scene's own background. */
const BACKGROUND = '#eceff3';
/** From behind and to the side of the vehicles, a little above: the editor's usual 3D view. */
const DIRECTION = new Vector3(-0.62, 0.46, 0.64);
const UP = new Vector3(0, 1, 0);

let planId: string | null = null;
let dirty = false;
let timer = 0;
let idle = 0;
let lastInput = 0;
let unsubscribe: (() => void) | null = null;
let uploaded: (planId: string, thumbnailAt: string) => void = () => {};
/**
 * One renderer while the editor is open: a new WebGL context compiles every shader again, the next
 * pictures from the same one take about 15 ms.
 */
let renderer: SnapshotRenderer | null = null;
/** The last capture: captures go one at a time, the renderer is released after them. */
let capturing: Promise<void> = Promise.resolve();

/** Renders the plan as the card picture, with `using` or a renderer of its own. */
export async function renderThumbnail(plan: Plan, using?: SnapshotRenderer): Promise<Blob> {
  const layout = layoutOf(plan);
  const loaded = plan.items.filter((item) => classify(itemBox(item), layout).status !== 'dock');
  const vehicles: Box[] = layout.vehicles.map((pv) => {
    const vb = vehicleBounds(pv);
    // The cab is a little wider than the bodies, the wheels hang below the deck.
    return { min: { x: vb.min.x, y: -DECK_HEIGHT, z: vb.min.z - 10 }, max: { ...vb.max, z: vb.max.z + 10 } };
  });
  const snapshot = using ?? new SnapshotRenderer(layout, false, false);
  try {
    snapshot.setLayout(layout);
    return await snapshot.renderBlob({
      items: loaded,
      bounds: unionBoxes([...vehicles, ...loaded.map(itemBox)])!,
      direction: DIRECTION,
      up: UP,
      projection: 'perspective',
      fov: 28,
      width: WIDTH,
      printWidth: WIDTH,
      aspect: ASPECT,
      labels: new Set(),
      format: 'jpeg',
      background: BACKGROUND,
    });
  } finally {
    if (!using) snapshot.dispose();
  }
}

/** Pictures the plan as it is now, if it changed since the last picture. */
function capture(): Promise<void> {
  window.clearTimeout(timer);
  cancelIdle();
  const id = planId;
  if (!id || !dirty) return capturing;
  dirty = false;
  // The store may hold another plan by the time the picture is made: take the data now.
  const plan = exportPlan(useStore.getState());
  const done = uploaded;
  capturing = capturing.then(async () => {
    try {
      renderer ??= new SnapshotRenderer(layoutOf(plan), false, false);
      const { thumbnailAt } = await planApi.putThumbnail(id, await renderThumbnail(plan, renderer));
      done(id, thumbnailAt);
    } catch {
      // No WebGL, offline, plan deleted: the card keeps its previous picture.
    }
  });
  return capturing;
}

function schedule(delay: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(whenQuiet, delay);
}

/** Captures once there has been no input for a moment, when the page has nothing else to do. */
function whenQuiet(): void {
  const wait = lastInput + QUIET - performance.now();
  if (wait > 0) {
    timer = window.setTimeout(whenQuiet, wait);
    return;
  }
  cancelIdle();
  if (typeof window.requestIdleCallback === 'function') {
    idle = window.requestIdleCallback(() => void capture(), { timeout: 1000 });
  } else {
    void capture();
  }
}

function cancelIdle(): void {
  if (idle) window.cancelIdleCallback(idle);
  idle = 0;
}

function onInput(): void {
  lastInput = performance.now();
}

/** Starts watching the plan just opened in the editor. */
export function startThumbnails(record: PlanRecord, onUploaded: (planId: string, thumbnailAt: string) => void): void {
  stopThumbnails();
  planId = record.id;
  uploaded = onUploaded;
  lastInput = 0;
  for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { capture: true, passive: true });
  dirty = record.thumbnailAt === null;
  if (dirty) schedule(FIRST_DELAY);
  unsubscribe = useStore.subscribe((s, prev) => {
    if (s.vehicles !== prev.vehicles || s.dockMode !== prev.dockMode || s.items !== prev.items) {
      dirty = true;
      schedule(IDLE_DELAY);
    }
  });
}

/** The editor closes: pictures what is not pictured yet, then stops watching and frees the renderer. */
export function stopThumbnails(): void {
  unsubscribe?.();
  unsubscribe = null;
  for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
  void capture().then(() => {
    // Unless the editor has opened again meanwhile.
    if (unsubscribe) return;
    renderer?.dispose();
    renderer = null;
  });
  planId = null;
}
