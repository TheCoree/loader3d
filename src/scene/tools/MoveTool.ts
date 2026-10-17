import { Plane, Vector3 } from 'three';
import type { CargoItem } from '../../core/types';
import { itemBox } from '../../core/item';
import { unionBoxes } from '../../core/geometry';
import {
  beginMove,
  composeMove,
  evaluateMove,
  finishMove,
  type MoveResult,
  type MoveSession,
} from '../../core/move';
import type { SceneEngine } from '../SceneEngine';
import type { PointerInfo, Tool } from './Tool';

/** Magnet distance in screen pixels. */
const SNAP_PX = 12;
/** Ignore plane hits near the horizon. */
const MAX_DRAG_DISTANCE = 20000;

/**
 * Drags an item (and the stack resting on it) over the floor. Height is never controlled by the
 * user: the group always lands on the floor or on top of whatever is under it.
 */
export class MoveTool implements Tool {
  readonly kind = 'move' as const;
  readonly cursor = 'grabbing';
  private items: CargoItem[] = [];
  private session: MoveSession | null = null;
  private result: MoveResult | null = null;
  private readonly plane = new Plane();
  private readonly hit = new Vector3();
  private grabOffset = { x: 0, z: 0 };

  constructor(
    private readonly engine: SceneEngine,
    private readonly itemId: string,
    private readonly grabPoint: Vector3,
    private readonly carryStack: boolean,
  ) {}

  begin(): void {
    this.items = this.engine.store.getState().items;
    if (!this.items.some((i) => i.id === this.itemId)) return;
    this.session = beginMove(this.items, this.itemId, this.carryStack);
    const root = this.session.members[0];
    this.grabOffset = { x: this.grabPoint.x - root.pos.x, z: this.grabPoint.z - root.pos.z };

    // Drag along a horizontal plane through the grab point. When the camera looks almost
    // horizontally (side/rear views) that plane degenerates, so use a vertical one facing the camera.
    const forward = this.engine.camera.getWorldDirection(new Vector3());
    if (Math.abs(forward.y) > 0.25) {
      this.plane.setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), this.grabPoint);
    } else {
      forward.y = 0;
      this.plane.setFromNormalAndCoplanarPoint(forward.normalize().negate(), this.grabPoint);
    }
    this.engine.setPreview(composeMove(this.items, this.session, this.session.members));
  }

  move(p: PointerInfo): void {
    const s = this.session;
    if (!s) return;
    if (!this.engine.intersectPlane(p.clientX, p.clientY, this.plane, this.hit)) return;
    if (this.hit.distanceTo(this.engine.camera.position) > MAX_DRAG_DISTANCE) return;

    const { settings } = this.engine.store.getState();
    const layout = this.engine.layout;
    const snapping = settings.snapping && !p.shiftKey;
    this.result = evaluateMove(
      s,
      { x: this.hit.x - this.grabOffset.x, z: this.hit.z - this.grabOffset.z },
      {
        floors: layout.floors,
        walls: layout.walls,
        snapThreshold: snapping ? this.engine.worldPerPixel(this.hit) * SNAP_PX : 0,
      },
    );
    this.engine.setPreview(composeMove(this.items, s, this.result.members));
    this.engine.guides.show(this.result.guides, unionBoxes(this.result.members.map(itemBox)));
  }

  end(commit: boolean): void {
    this.engine.guides.clear();
    const { session, result } = this;
    this.engine.setPreview(null);
    if (commit && session && result) {
      this.engine.store.getState().applyItems(finishMove(this.items, session, result.members));
    }
  }
}
