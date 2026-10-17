import { Vector3 } from 'three';
import type { Box, CargoItem } from '../../core/types';
import { boxSize } from '../../core/geometry';
import { clampItemDim, itemBox } from '../../core/item';
import { intrinsicDims } from '../../core/orientation';
import { settle } from '../../core/physics';
import { faceSign, resizeBox, type Face } from '../../core/resize';
import type { SceneEngine } from '../SceneEngine';
import { FACE_DIRECTION, faceCenter } from '../SelectionView';
import type { PointerInfo, Tool } from './Tool';

const SNAP_PX = 10;

/**
 * Push/pull of one face of the selected item (SketchUp style). The pointer is projected onto the
 * face normal; the size is rounded to whole centimetres and snaps to nearby faces and walls.
 */
export class ResizeTool implements Tool {
  readonly kind = 'resize' as const;
  readonly cursor: string;
  private items: CargoItem[] = [];
  private item: CargoItem | null = null;
  private startBox: Box | null = null;
  private obstacles: Box[] = [];
  private readonly origin = new Vector3();
  private readonly axis = new Vector3();
  private t0 = 0;
  private preview: CargoItem[] | null = null;

  constructor(
    private readonly engine: SceneEngine,
    private readonly itemId: string,
    private readonly face: Face,
  ) {
    this.cursor = face === 'y+' ? 'ns-resize' : 'ew-resize';
  }

  begin(p: PointerInfo): void {
    this.items = this.engine.store.getState().items;
    this.item = this.items.find((i) => i.id === this.itemId) ?? null;
    if (!this.item) return;
    this.startBox = itemBox(this.item);
    this.obstacles = this.items.filter((i) => i.id !== this.itemId).map(itemBox);
    faceCenter(this.startBox, this.face, this.origin);
    this.axis.copy(FACE_DIRECTION[this.face]);
    this.t0 = this.axisParam(p) ?? 0;
    this.engine.setActiveHandle(this.face);
  }

  move(p: PointerInfo): void {
    const t = this.axisParam(p);
    if (t === null || !this.item || !this.startBox) return;
    const { settings } = this.engine.store.getState();
    const snapping = settings.snapping && !p.shiftKey;
    const box = resizeBox(this.startBox, this.face, (t - this.t0) * faceSign(this.face), {
      obstacles: this.obstacles,
      walls: this.engine.layout.walls,
      snapThreshold: snapping ? this.engine.worldPerPixel(this.origin) * SNAP_PX : 0,
      step: 1,
    });
    const dims = intrinsicDims(boxSize(box), this.item.orientation);
    const resized: CargoItem = {
      ...this.item,
      pos: { ...box.min },
      dims: { l: clampItemDim(dims.l), w: clampItemDim(dims.w), h: clampItemDim(dims.h) },
    };
    // Items standing on top are lifted (or dropped) by the gravity pass.
    this.preview = settle(this.items.map((i) => (i.id === resized.id ? resized : i)));
    this.engine.setPreview(this.preview);
  }

  end(commit: boolean): void {
    this.engine.setActiveHandle(null);
    const preview = this.preview;
    this.engine.setPreview(null);
    if (commit && preview) this.engine.store.getState().applyItems(preview);
  }

  /** Parameter along the face normal of the point closest to the pointer ray. */
  private axisParam(p: PointerInfo): number | null {
    const ray = this.engine.rayAt(p.clientX, p.clientY);
    const w0 = this.origin.clone().sub(ray.origin);
    const b = this.axis.dot(ray.direction);
    const denom = 1 - b * b;
    if (denom < 1e-4) return null;
    return (b * ray.direction.dot(w0) - this.axis.dot(w0)) / denom;
  }
}
