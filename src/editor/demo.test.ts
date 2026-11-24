import { describe, expect, it } from 'vitest';
import { autoload } from '@/core/autoload';
import { computeLayout } from '@/core/layout';
import { findCollisions, findFloating } from '@/core/physics';
import { computeStats } from '@/core/stats';
import { PUBLIC_PATHS, SECTION_NAMES, TRACK_NAMES } from '@/lib/analytics';
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

describe('the demo in the visit statistics', () => {
  it('is a public page with every button and window named for the admin panel', () => {
    expect(PUBLIC_PATHS).toContain('/demo');
    expect(SECTION_NAMES.demo).toBeTruthy();
    const reasons: DemoGateReason[] = ['time', 'limits', 'pdf', 'save', 'file'];
    for (const r of reasons) expect(TRACK_NAMES[`demo_gate_${r}`]).toBeTruthy();
    for (const name of ['hero_demo', 'showcase_demo', 'demo_back', 'demo_save', 'demo_toast_save', 'demo_gate_register', 'demo_gate_login', 'demo_gate_continue']) {
      expect(TRACK_NAMES[name]).toBeTruthy();
    }
  });
});
