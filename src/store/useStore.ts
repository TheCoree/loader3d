import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CargoBody, CargoItem, Dims, Plan } from '../core/types';
import { computeLayout, remapItems, stagingRegion, type VehicleLayout } from '../core/layout';
import { itemBox, itemSize, sanitizeItemDims, uid } from '../core/item';
import { settle } from '../core/physics';
import { findFreeSpot } from '../core/spawn';
import { effectiveDims, rotateYaw90 } from '../core/orientation';
import { beginMove, evaluateMove, finishMove } from '../core/move';
import {
  BODY_LIMITS,
  BODY_MAX_LOAD_LIMIT,
  CARGO_COLORS,
  ITEM_WEIGHT_LIMIT,
  DEFAULT_TRAILER,
  MAX_BODIES,
  VEHICLE_PRESETS,
  type BodyTemplate,
} from '../core/presets';
import type { Units } from '../core/units';

export interface Settings {
  highlightOverflow: boolean;
  showDimensions: boolean;
  showLabels: boolean;
  snapping: boolean;
  resizeHandles: boolean;
  cameraLocked: boolean;
  units: Units;
}

/** The undoable part of the state. */
export interface PlanState extends Plan {
  paletteIndex: number;
}

interface History {
  past: PlanState[];
  future: PlanState[];
  /** Consecutive commits with the same key (e.g. arrow-key nudges) collapse into one undo step. */
  lastKey: string | null;
  lastAt: number;
}

export interface NewCargo {
  dims: Dims;
  name?: string;
  count?: number;
  /** kg per item */
  weight?: number;
}

export interface AppState extends PlanState {
  selectedId: string | null;
  settings: Settings;
  history: History;

  addItems(input: NewCargo): void;
  updateItem(id: string, patch: { name?: string; color?: string; dims?: Dims; weight?: number }): void;
  /** Replaces the item list after an interactive edit in the scene (move, resize). */
  applyItems(items: CargoItem[], key?: string): void;
  removeItem(id: string): void;
  duplicateItem(id: string): void;
  rotateItem(id: string): void;
  nudgeItem(id: string, dx: number, dz: number): void;
  clearItems(): void;
  select(id: string | null): void;

  updateBody(id: string, dims: Dims): void;
  /** Payload capacity in kg; undefined removes the limit. */
  setBodyMaxLoad(id: string, maxLoad: number | undefined): void;
  addTrailer(): void;
  removeBody(id: string): void;
  applyVehiclePreset(presetId: string): void;

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  undo(): void;
  redo(): void;
  /** Replaces the plan as an undoable edit (import from a file, the example). */
  loadPlan(plan: Plan): void;
  /** Opens a saved plan: replaces everything and starts a fresh undo history. */
  openPlan(plan: Plan): void;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

const DEFAULT_SETTINGS: Settings = {
  highlightOverflow: true,
  showDimensions: true,
  showLabels: true,
  snapping: true,
  resizeHandles: true,
  cameraLocked: false,
  units: 'cm',
};

const layoutCache = new WeakMap<readonly CargoBody[], VehicleLayout>();

/** Memoized layout of the current bodies array. */
export function getLayout(bodies: readonly CargoBody[]): VehicleLayout {
  let layout = layoutCache.get(bodies);
  if (!layout) {
    layout = computeLayout(bodies);
    layoutCache.set(bodies, layout);
  }
  return layout;
}

function pickPlan(s: PlanState): PlanState {
  return { bodies: s.bodies, items: s.items, nextSeq: s.nextSeq, paletteIndex: s.paletteIndex };
}

function makeBody(t: BodyTemplate, id = uid('body')): CargoBody {
  const body: CargoBody = { id, kind: t.kind, name: t.name, dims: { ...t.dims } };
  if (t.maxLoad !== undefined) body.maxLoad = t.maxLoad;
  return body;
}

export function sanitizeWeight(kg: number): number {
  return Math.min(ITEM_WEIGHT_LIMIT, Math.max(0, Math.round(kg * 10) / 10));
}

function clampBodyDims(d: Dims): Dims {
  const clamp = (v: number, [lo, hi]: [number, number]) =>
    Math.min(hi, Math.max(lo, Math.round(v * 10) / 10));
  return { l: clamp(d.l, BODY_LIMITS.l), w: clamp(d.w, BODY_LIMITS.w), h: clamp(d.h, BODY_LIMITS.h) };
}

/** Puts `item` on a free spot of the dock (or on top of something there if the dock is full). */
function placeOnDock(item: CargoItem, existing: readonly CargoItem[], layout: VehicleLayout): CargoItem {
  const region = stagingRegion(layout);
  const size = itemSize(item);
  const spot = findFreeSpot(size, region, existing.map(itemBox)) ?? {
    x: region.maxX - size.l,
    z: region.minZ,
  };
  return { ...item, pos: { x: spot.x, y: 0, z: spot.z } };
}

/** Moves cargo along with its body after the vehicle changed; cargo of removed bodies goes to the dock. */
function rebody(items: readonly CargoItem[], from: CargoBody[], to: CargoBody[]): CargoItem[] {
  const toLayout = getLayout(to);
  const { items: remapped, orphans } = remapItems(items, getLayout(from), toLayout);
  if (orphans.length === 0) return settle(remapped);
  const orphanIds = new Set(orphans);
  const placed = remapped.filter((i) => !orphanIds.has(i.id));
  const moved = new Map<string, CargoItem>();
  for (const item of remapped) {
    if (!orphanIds.has(item.id)) continue;
    const next = placeOnDock(item, placed, toLayout);
    placed.push(next);
    moved.set(item.id, next);
  }
  return settle(
    remapped.map((i) => moved.get(i.id) ?? i),
    { yieldIds: orphanIds },
  );
}

export function createDemoPlan(): PlanState {
  const preset = VEHICLE_PRESETS[0];
  const bodies = preset.bodies.map((b) => makeBody(b));
  const layout = getLayout(bodies);
  const body = layout.bodies[0].box;
  const items: CargoItem[] = [];
  let seq = 1;
  const add = (
    name: string,
    dims: Dims,
    weight: number,
    color: string,
    pos?: { x: number; z: number; y?: number },
  ) => {
    const item: CargoItem = {
      id: uid('cargo'),
      seq: seq++,
      name,
      dims,
      orientation: { yaw: 0 },
      pos: { x: 0, y: 0, z: 0 },
      color,
      weight,
    };
    items.push(pos ? { ...item, pos: { x: pos.x, y: pos.y ?? 0, z: pos.z } } : placeOnDock(item, items, layout));
  };

  // Two rows of euro pallets against the front wall, three across.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      add('Европаллета', { l: 120, w: 80, h: 150 }, 450, CARGO_COLORS[0], {
        x: body.max.x - 120 * (row + 1),
        z: body.min.z + 80 * col,
      });
    }
  }
  add('Коробка', { l: 60, w: 40, h: 40 }, 25, CARGO_COLORS[4], { x: body.max.x - 120, z: body.min.z, y: 150 });
  add('Коробка', { l: 60, w: 40, h: 40 }, 25, CARGO_COLORS[4], { x: body.max.x - 60, z: body.min.z, y: 150 });
  for (let i = 0; i < 3; i++) add('IBC-куб', { l: 120, w: 100, h: 116 }, 1000, CARGO_COLORS[1]);
  for (let i = 0; i < 2; i++) add('Финпаллета', { l: 120, w: 100, h: 150 }, 600, CARGO_COLORS[2]);
  add('Длинномер', { l: 320, w: 60, h: 60 }, 180, CARGO_COLORS[3]);

  return { bodies, items: settle(items), nextSeq: seq, paletteIndex: 5 };
}

export function isValidPlan(p: unknown): p is Plan {
  if (!p || typeof p !== 'object') return false;
  const plan = p as Partial<Plan>;
  return (
    Array.isArray(plan.bodies) &&
    plan.bodies.length > 0 &&
    plan.bodies.every((b) => b && typeof b.id === 'string' && b.dims && b.dims.l > 0) &&
    Array.isArray(plan.items) &&
    plan.items.every((i) => i && typeof i.id === 'string' && i.dims && i.pos && i.orientation)
  );
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const commit = (patch: Partial<PlanState>, extra: Partial<AppState> = {}, key?: string) => {
        const s = get();
        const now = Date.now();
        const coalesce = key !== undefined && s.history.lastKey === key && now - s.history.lastAt < COALESCE_MS;
        const past = coalesce ? s.history.past : [...s.history.past, pickPlan(s)].slice(-HISTORY_LIMIT);
        set({ ...patch, ...extra, history: { past, future: [], lastKey: key ?? null, lastAt: now } });
      };

      const keepSelection = (items: CargoItem[], selectedId: string | null) =>
        selectedId && items.some((i) => i.id === selectedId) ? selectedId : null;

      return {
        ...createDemoPlan(),
        selectedId: null,
        settings: DEFAULT_SETTINGS,
        history: { past: [], future: [], lastKey: null, lastAt: 0 },

        addItems({ dims, name, count = 1, weight }) {
          const s = get();
          const layout = getLayout(s.bodies);
          const color = CARGO_COLORS[s.paletteIndex % CARGO_COLORS.length];
          const clean = sanitizeItemDims(dims);
          let items = [...s.items];
          let seq = s.nextSeq;
          const ids = new Set<string>();
          for (let n = 0; n < Math.max(1, Math.min(200, Math.round(count))); n++) {
            const item = placeOnDock(
              {
                id: uid('cargo'),
                seq,
                name: name?.trim() || 'Груз',
                dims: clean,
                orientation: { yaw: 0 },
                pos: { x: 0, y: 0, z: 0 },
                color,
                ...(weight !== undefined && weight > 0 ? { weight: sanitizeWeight(weight) } : {}),
              },
              items,
              layout,
            );
            seq++;
            ids.add(item.id);
            items.push(item);
          }
          items = settle(items, { yieldIds: ids });
          const last = items[items.length - 1];
          commit({ items, nextSeq: seq, paletteIndex: s.paletteIndex + 1 }, { selectedId: last.id });
        },

        updateItem(id, patch) {
          const s = get();
          const items = s.items.map((i) => {
            if (i.id !== id) return i;
            const next = { ...i };
            if (patch.name !== undefined) next.name = patch.name.trim() || i.name;
            if (patch.color !== undefined) next.color = patch.color;
            if (patch.dims) next.dims = sanitizeItemDims(patch.dims);
            if (patch.weight !== undefined) next.weight = sanitizeWeight(patch.weight);
            return next;
          });
          const geometryChanged = patch.dims !== undefined;
          commit(
            { items: geometryChanged ? settle(items, { yieldIds: new Set([id]) }) : items },
            {},
            `item:${id}:${Object.keys(patch).join(',')}`,
          );
        },

        applyItems(items, key) {
          commit({ items: settle(items) }, { selectedId: keepSelection(items, get().selectedId) }, key);
        },

        removeItem(id) {
          const s = get();
          const items = settle(s.items.filter((i) => i.id !== id));
          commit({ items }, { selectedId: s.selectedId === id ? null : s.selectedId });
        },

        duplicateItem(id) {
          const s = get();
          const source = s.items.find((i) => i.id === id);
          if (!source) return;
          const copy = placeOnDock(
            { ...source, id: uid('cargo'), seq: s.nextSeq, pos: { ...source.pos } },
            s.items,
            getLayout(s.bodies),
          );
          const items = settle([...s.items, copy], { yieldIds: new Set([copy.id]) });
          commit({ items, nextSeq: s.nextSeq + 1 }, { selectedId: copy.id });
        },

        rotateItem(id) {
          const s = get();
          const items = s.items.map((i) => {
            if (i.id !== id) return i;
            const box = itemBox(i);
            const orientation = rotateYaw90(i.orientation);
            const size = effectiveDims(i.dims, orientation);
            const cx = (box.min.x + box.max.x) / 2;
            const cz = (box.min.z + box.max.z) / 2;
            return { ...i, orientation, pos: { x: cx - size.l / 2, y: i.pos.y, z: cz - size.w / 2 } };
          });
          commit({ items: settle(items, { yieldIds: new Set([id]) }) });
        },

        nudgeItem(id, dx, dz) {
          const s = get();
          if (!s.items.some((i) => i.id === id)) return;
          const layout = getLayout(s.bodies);
          const session = beginMove(s.items, id, true);
          const root = session.members[0];
          const result = evaluateMove(
            session,
            { x: root.pos.x + dx, z: root.pos.z + dz },
            { floors: layout.floors, walls: layout.walls, snapThreshold: 0 },
          );
          commit({ items: finishMove(s.items, session, result.members) }, {}, `nudge:${id}`);
        },

        clearItems() {
          if (get().items.length === 0) return;
          commit({ items: [] }, { selectedId: null });
        },

        select(id) {
          if (get().selectedId !== id) set({ selectedId: id });
        },

        updateBody(id, dims) {
          const s = get();
          const bodies = s.bodies.map((b) => (b.id === id ? { ...b, dims: clampBodyDims(dims) } : b));
          commit({ bodies, items: rebody(s.items, s.bodies, bodies) }, {}, `body:${id}`);
        },

        setBodyMaxLoad(id, maxLoad) {
          const s = get();
          const bodies = s.bodies.map((b) => {
            if (b.id !== id) return b;
            const { maxLoad: _, ...rest } = b;
            return maxLoad === undefined
              ? rest
              : { ...rest, maxLoad: Math.min(BODY_MAX_LOAD_LIMIT, Math.max(0, Math.round(maxLoad))) };
          });
          commit({ bodies }, {}, `body-load:${id}`);
        },

        addTrailer() {
          const s = get();
          if (s.bodies.length >= MAX_BODIES) return;
          const last = s.bodies[s.bodies.length - 1];
          const trailer = makeBody({
            ...DEFAULT_TRAILER,
            dims: { ...DEFAULT_TRAILER.dims, w: last.dims.w, h: last.dims.h },
          });
          const bodies = [...s.bodies, trailer];
          commit({ bodies, items: rebody(s.items, s.bodies, bodies) });
        },

        removeBody(id) {
          const s = get();
          if (s.bodies.length <= 1) return;
          const bodies = s.bodies.filter((b) => b.id !== id);
          commit({ bodies, items: rebody(s.items, s.bodies, bodies) });
        },

        applyVehiclePreset(presetId) {
          const s = get();
          const preset = VEHICLE_PRESETS.find((p) => p.id === presetId);
          if (!preset) return;
          // Reuse body ids by position so cargo stays in "the first body", "the second body"...
          const bodies = preset.bodies.map((t, i) => makeBody(t, s.bodies[i]?.id));
          commit({ bodies, items: rebody(s.items, s.bodies, bodies) });
        },

        setSetting(key, value) {
          set({ settings: { ...get().settings, [key]: value } });
        },

        undo() {
          const s = get();
          const prev = s.history.past[s.history.past.length - 1];
          if (!prev) return;
          set({
            ...prev,
            selectedId: keepSelection(prev.items, s.selectedId),
            history: {
              past: s.history.past.slice(0, -1),
              future: [pickPlan(s), ...s.history.future],
              lastKey: null,
              lastAt: 0,
            },
          });
        },

        redo() {
          const s = get();
          const next = s.history.future[0];
          if (!next) return;
          set({
            ...next,
            selectedId: keepSelection(next.items, s.selectedId),
            history: {
              past: [...s.history.past, pickPlan(s)],
              future: s.history.future.slice(1),
              lastKey: null,
              lastAt: 0,
            },
          });
        },

        loadPlan(plan) {
          if (!isValidPlan(plan)) throw new Error('Файл не похож на план загрузки');
          const items = settle(plan.items);
          const nextSeq = Math.max(plan.nextSeq || 1, ...items.map((i) => i.seq + 1));
          commit({ bodies: plan.bodies, items, nextSeq }, { selectedId: null });
        },

        openPlan(plan) {
          if (!isValidPlan(plan)) throw new Error('Схема повреждена');
          const items = settle(plan.items);
          set({
            bodies: plan.bodies,
            items,
            nextSeq: Math.max(plan.nextSeq || 1, ...items.map((i) => i.seq + 1)),
            paletteIndex: items.length,
            selectedId: null,
            history: { past: [], future: [], lastKey: null, lastAt: 0 },
          });
        },
      };
    },
    {
      // Plans live on the server; only display preferences stay in the browser.
      // (The pre-accounts plan is still under LEGACY_PLAN_KEY until the user imports it.)
      name: 'loader3d:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => {
        const settings = (persisted as Partial<AppState> | undefined)?.settings;
        return { ...current, settings: { ...DEFAULT_SETTINGS, ...settings } };
      },
    },
  ),
);

/** localStorage key of the plan saved by the app before accounts existed. */
export const LEGACY_PLAN_KEY = 'loader3d:plan';

export function exportPlan(s: AppState): Plan {
  return { bodies: s.bodies, items: s.items, nextSeq: s.nextSeq };
}
