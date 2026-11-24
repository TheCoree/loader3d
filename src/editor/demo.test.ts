import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autoload } from '@/core/autoload';
import { computeLayout } from '@/core/layout';
import { findCollisions, findFloating } from '@/core/physics';
import { computeStats } from '@/core/stats';
import { PUBLIC_PATHS, SECTION_NAMES, TRACK_NAMES } from '@/lib/analytics';
import { useStore } from '@/store/useStore';
import { DEMO_LIMITS, createLandingDemoPlan, type DemoGateReason } from './demo';

describe('the plan of the landing demo', () => {
  const plan = createLandingDemoPlan();
  const layout = computeLayout(plan.vehicles, plan.dockMode);

  it('is a real plan within the demo limits', () => {
    expect(plan.items.length).toBeLessThanOrEqual(DEMO_LIMITS.items * 0.6);
    expect(plan.vehicles.length).toBeLessThanOrEqual(DEMO_LIMITS.vehicles);
    expect(findCollisions(plan.items)).toEqual([]);
    expect(findFloating(plan.items)).toEqual([]);
    const stats = computeStats(plan.items, layout);
    expect(stats.overflow).toBe(0);
    expect(stats.inside).toBeGreaterThan(20);
    expect(stats.dock).toBeGreaterThan(5);
    expect(new Set(plan.items.map((i) => i.seq)).size).toBe(plan.items.length);
    expect(plan.nextSeq).toBe(plan.items.length + 1);
  });

  it('gives «Загрузить в кузов» the whole dock to load', () => {
    const result = autoload(plan.items, layout);
    const stats = computeStats(result.items, layout);
    expect(stats.dock).toBe(0);
    expect(stats.inside).toBe(plan.items.length);
    expect(stats.bodies[0].overweight).toBe(false);
    expect(findCollisions(result.items)).toEqual([]);
  });
});

describe('the demo is a showcase of the example, not a free tool', () => {
  const s = () => useStore.getState();
  /** Runs an edit and tells whether the store refused it as the demo's `setup`. */
  const refused = (edit: () => unknown): boolean => {
    useStore.setState({ limitHit: null });
    edit();
    return s().limitHit?.kind === 'setup';
  };

  beforeEach(() => {
    s().openPlan(createLandingDemoPlan());
    s().setLimits({ ...DEMO_LIMITS });
  });
  afterEach(() => {
    s().setLimits(null);
    useStore.setState({ limitHit: null });
  });

  it('refuses cargo and vehicles of the visitor’s own', () => {
    const plan = { vehicles: s().vehicles, items: s().items };
    const item = s().items[0];
    const body = s().vehicles[0].bodies[0];
    expect(refused(() => s().addItems({ dims: { l: 100, w: 100, h: 100 }, count: 3 }))).toBe(true);
    expect(refused(() => s().duplicateItem(item.id))).toBe(true);
    expect(refused(() => s().updateItem(item.id, { dims: { l: 200, w: 100, h: 100 } }))).toBe(true);
    expect(refused(() => s().updateItem(item.id, { weight: 5000 }))).toBe(true);
    expect(refused(() => s().updateItem(item.id, { name: 'Мой груз' }))).toBe(true);
    expect(refused(() => s().applyItems(s().items.map((i) => (i.id === item.id ? { ...i, dims: { ...i.dims, h: 200 } } : i))))).toBe(true);
    expect(refused(() => s().updateBody(body.id, { l: 800, w: 245, h: 260 }))).toBe(true);
    expect(refused(() => s().setBodyMaxLoad(body.id, 10000))).toBe(true);
    expect(refused(() => s().setBodyChassis(body.id, { rear: { tare: 7000 } }))).toBe(true);
    expect(refused(() => s().applyVehiclePreset('truck10'))).toBe(true);
    expect(refused(() => s().addTrailer())).toBe(true);
    expect(refused(() => s().addVehicle('tent'))).toBe(true);
    expect(s().vehicles).toBe(plan.vehicles);
    expect(s().items).toBe(plan.items);
  });

  it('lets the example be moved, turned, recoloured, removed and loaded by autoload', () => {
    const [first, second] = s().items;
    expect(refused(() => s().rotateItem(first.id))).toBe(false);
    expect(refused(() => s().updateItem(first.id, { color: '#000000' }))).toBe(false);
    expect(s().items.find((i) => i.id === first.id)?.color).toBe('#000000');
    expect(refused(() => s().removeItem(second.id))).toBe(false);
    expect(s().items.some((i) => i.id === second.id)).toBe(false);
    const result = autoload(s().items, computeLayout(s().vehicles, s().dockMode));
    expect(refused(() => s().applyItems(result.items, 'autoload'))).toBe(false);
    expect(computeStats(s().items, computeLayout(s().vehicles, s().dockMode)).dock).toBe(0);
  });
});

describe('the demo in the visit statistics', () => {
  it('is a public page with every button and window named for the admin panel', () => {
    expect(PUBLIC_PATHS).toContain('/demo');
    expect(SECTION_NAMES.demo).toBeTruthy();
    const reasons: DemoGateReason[] = ['time', 'limits', 'own', 'pdf', 'save', 'file'];
    for (const r of reasons) expect(TRACK_NAMES[`demo_gate_${r}`]).toBeTruthy();
    for (const name of ['hero_demo', 'showcase_demo', 'demo_back', 'demo_save', 'demo_toast_save', 'demo_gate_register', 'demo_gate_login', 'demo_gate_continue']) {
      expect(TRACK_NAMES[name]).toBeTruthy();
    }
  });
});
