import { create } from 'zustand';
import { itemBox, itemSize, uid } from '../core/item';
import { computeLayout } from '../core/layout';
import { settle } from '../core/physics';
import { defaultVehicleName } from '../core/plan';
import { CARGO_COLORS, VEHICLE_PRESETS } from '../core/presets';
import { dockSpot } from '../core/spawn';
import type { CargoItem, Dims, Plan } from '../core/types';
import { TIERS_ENABLED } from '../lib/tiers';
import { trackAction } from '../lib/analytics';
import { encodePlanParam } from '../lib/demoPlan';
import { exportPlan, makeBody, useStore } from '../store/useStore';

/**
 * The demo of the editor on the landing page (pages/DemoPage, `/demo`, opened from pages/LandingDemo): the real
 * editor with the plan only in memory — no account, nothing goes to the server (no planSync, no accountSync: there is no user), nothing is
 * kept in the browser. It lets a visitor try everything, «Pro» features too, and asks for a free registration
 * (DemoGate) after DEMO_NUDGE_AFTER of use, over DEMO_LIMITS, for a second PDF and for what needs an account
 * (saving, files). The window can always be closed and the demo goes on. «Сохранить схему» carries the plan
 * through the registration into the new account (`/start?plan=…`, lib/demoPlan.ts).
 */

/** What the demo holds; more asks for the registration (the store refuses it, as a tier limit). */
export const DEMO_LIMITS = { vehicles: 2, items: 60, tierName: 'Демо' } as const;
/** PDF files the demo makes before asking for the registration. */
export const DEMO_FREE_PDFS = 1;
/** Active use of the demo (the tab visible, input within IDLE_AFTER) before it suggests saving the plan. */
export const DEMO_NUDGE_AFTER = 5 * 60_000;
export const DEMO_IDLE_AFTER = 60_000;

export type DemoGateReason = 'time' | 'limits' | 'pdf' | 'save' | 'file';
export type DemoStep = 'move' | 'autoload' | 'pdf';

interface DemoState {
  /** The plan as the visitor left the demo: back on `/demo` (the browser's «Back» from the registration) it is there again. */
  plan: Plan | null;
  activeMs: number;
  /** The window after DEMO_NUDGE_AFTER was shown (once a visit). */
  nudged: boolean;
  /** PDF files made in the demo. */
  pdfs: number;
  steps: Record<DemoStep, boolean>;
  /** Why the registration window is open; null — closed. */
  gate: DemoGateReason | null;
}

export const useDemo = create<DemoState>()(() => ({
  plan: null,
  activeMs: 0,
  nudged: false,
  pdfs: 0,
  steps: { move: false, autoload: false, pdf: false },
  gate: null,
}));

export function openDemoGate(reason: DemoGateReason): void {
  if (useDemo.getState().gate) return;
  useDemo.setState({ gate: reason });
  trackAction(`demo_gate_${reason}`);
}

export function closeDemoGate(): void {
  useDemo.setState({ gate: null });
}

export function markDemoStep(step: DemoStep): void {
  const { steps } = useDemo.getState();
  if (!steps[step]) useDemo.setState({ steps: { ...steps, [step]: true } });
}

/**
 * The plan the demo opens with — the trip of the landing page's pictures: a euro trailer two thirds full
 * from the front wall, and on the dock what is left to load, so «Загрузить в кузов» has work to do.
 */
export function createLandingDemoPlan(): Plan {
  const preset = VEHICLE_PRESETS[0];
  const vehicle = {
    id: uid('veh'),
    name: defaultVehicleName(0),
    bodies: preset.bodies.map((b) => makeBody(b)),
  };
  const layout = computeLayout([vehicle], 'shared');
  const deck = layout.bodies[0].box;
  const items: CargoItem[] = [];
  let seq = 1;
  const make = (name: string, dims: Dims, weight: number, color: string): CargoItem => ({
    id: uid('cargo'),
    seq: seq++,
    name,
    dims,
    orientation: { yaw: 0 },
    pos: { x: 0, y: 0, z: 0 },
    color,
    weight,
  });
  const inBody = (item: CargoItem, x: number, z: number, y = deck.min.y) => items.push({ ...item, pos: { x, y, z } });
  const onDock = (item: CargoItem) => {
    const spot = dockSpot(itemSize(item), layout, vehicle.id, items.map(itemBox));
    items.push({ ...item, pos: { x: spot.x, y: 0, z: spot.z } });
  };

  // Seven rows of three euro pallets from the front wall: household goods, drinks, paper.
  const rows: Array<{ name: string; h: number; kg: number; color: string }> = [
    { name: 'Бытовая химия', h: 150, kg: 520, color: CARGO_COLORS[1] },
    { name: 'Бытовая химия', h: 150, kg: 520, color: CARGO_COLORS[1] },
    { name: 'Напитки', h: 120, kg: 680, color: CARGO_COLORS[2] },
    { name: 'Напитки', h: 120, kg: 680, color: CARGO_COLORS[2] },
    { name: 'Бумага', h: 100, kg: 610, color: CARGO_COLORS[5] },
    { name: 'Посуда', h: 140, kg: 330, color: CARGO_COLORS[0] },
    { name: 'Посуда', h: 140, kg: 330, color: CARGO_COLORS[0] },
  ];
  rows.forEach((row, r) => {
    for (let c = 0; c < 3; c++) {
      inBody(make(row.name, { l: 120, w: 80, h: row.h }, row.kg, row.color), deck.max.x - 120 * (r + 1), deck.min.z + 80 * c);
    }
  });
  // Light cartons on top of the low paper pallets.
  for (let c = 0; c < 3; c++) {
    inBody(make('Короб', { l: 120, w: 80, h: 60 }, 45, CARGO_COLORS[4]), deck.max.x - 120 * 5, deck.min.z + 80 * c, deck.min.y + 100);
  }
  // What is left to load.
  for (let i = 0; i < 4; i++) onDock(make('IBC-куб', { l: 120, w: 100, h: 116 }, 950, CARGO_COLORS[6]));
  for (let i = 0; i < 3; i++) onDock(make('Финпаллета', { l: 120, w: 100, h: 140 }, 420, CARGO_COLORS[3]));
  for (let i = 0; i < 2; i++) onDock(make('Европаллета', { l: 120, w: 80, h: 150 }, 480, CARGO_COLORS[9]));
  for (let i = 0; i < 2; i++) onDock(make('Короб', { l: 120, w: 80, h: 60 }, 45, CARGO_COLORS[4]));

  return { vehicles: [vehicle], dockMode: 'shared', items: settle(items), nextSeq: seq };
}

/** Registration with the «Pro» trial when there are tiers: the demo let the visitor try its features. */
const REGISTER = TIERS_ENABLED ? '/register?tier=pro' : '/register';

/**
 * Where the registration (or the sign-in) of the demo leads, with the plan on screen riding along in
 * `state.from` (AuthPage goes there after the account is made, through the email code).
 */
export async function demoAccountLink(mode: 'register' | 'login'): Promise<{ to: string; state: { from: string } }> {
  const plan = exportPlan(useStore.getState());
  useDemo.setState({ plan });
  const from = `/start?${new URLSearchParams({ plan: await encodePlanParam(plan) })}`;
  return { to: mode === 'register' ? REGISTER : '/login', state: { from } };
}
