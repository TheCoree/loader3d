import { Vector3 } from 'three';
import { planApi } from '../api/endpoints';
import type { PlanRecord } from '../api/types';
import { unionBoxes } from '../core/geometry';
import { itemBox } from '../core/item';
import { DECK_HEIGHT, computeLayout, vehicleBounds } from '../core/layout';
import { classify } from '../core/stats';
import type { Box, Plan } from '../core/types';
import { SnapshotRenderer } from '../pdf/snapshot';
import { exportPlan, useStore } from '../store/useStore';

/**
 * The preview picture of the open plan for its card on the home page: a 3D view of every vehicle with
 * the cargo in it, rendered off screen by the PDF's SnapshotRenderer and uploaded as a JPEG. Made a few
 * seconds after the last change, when the editor closes with changes not pictured yet, and once for a
 * plan that has no picture. Failing is harmless: the card keeps the previous picture.
 */

const IDLE_DELAY = 4000;
const FIRST_DELAY = 1500;
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
let unsubscribe: (() => void) | null = null;
let uploaded: (planId: string, thumbnailAt: string) => void = () => {};

/** Renders the plan as the card picture. */
export async function renderThumbnail(plan: Plan): Promise<Blob> {
  const layout = computeLayout(plan.vehicles, plan.dockMode);
  const loaded = plan.items.filter((item) => classify(itemBox(item), layout).status !== 'dock');
  const vehicles: Box[] = layout.vehicles.map((pv) => {
    const vb = vehicleBounds(pv);
    // The cab is a little wider than the bodies, the wheels hang below the deck.
    return { min: { x: vb.min.x, y: -DECK_HEIGHT, z: vb.min.z - 10 }, max: { ...vb.max, z: vb.max.z + 10 } };
  });
  const renderer = new SnapshotRenderer(layout, false, false);
  try {
    const shot = renderer.render({
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
    return await (await fetch(shot.dataUrl)).blob();
  } finally {
    renderer.dispose();
  }
}

async function capture(): Promise<void> {
  window.clearTimeout(timer);
  const id = planId;
  if (!id || !dirty) return;
  dirty = false;
  // The store may hold another plan by the time the upload ends: take the data now.
  const plan = exportPlan(useStore.getState());
  try {
    const { thumbnailAt } = await planApi.putThumbnail(id, await renderThumbnail(plan));
    uploaded(id, thumbnailAt);
  } catch {
    // No WebGL, offline, plan deleted: the card keeps its previous picture.
  }
}

function schedule(delay: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void capture(), delay);
}

/** Starts watching the plan just opened in the editor. */
export function startThumbnails(record: PlanRecord, onUploaded: (planId: string, thumbnailAt: string) => void): void {
  stopThumbnails();
  planId = record.id;
  uploaded = onUploaded;
  dirty = record.thumbnailAt === null;
  if (dirty) schedule(FIRST_DELAY);
  unsubscribe = useStore.subscribe((s, prev) => {
    if (s.vehicles !== prev.vehicles || s.dockMode !== prev.dockMode || s.items !== prev.items) {
      dirty = true;
      schedule(IDLE_DELAY);
    }
  });
}

/** The editor closes: pictures what is not pictured yet, then stops watching. */
export function stopThumbnails(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (dirty) void capture();
  window.clearTimeout(timer);
}
