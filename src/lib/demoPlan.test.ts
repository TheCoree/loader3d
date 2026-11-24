import { describe, expect, it } from 'vitest';
import { parsePlan } from '@/core/plan';
import { createDemoPlan } from '@/store/useStore';
import { decodePlanParam, encodePlanParam } from './demoPlan';

describe('the demo plan in the address', () => {
  const { paletteIndex: _, ...plan } = createDemoPlan();

  it('travels compressed and comes back whole', async () => {
    const code = await encodePlanParam(plan);
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^z[A-Za-z0-9_-]+$/);
    // Much shorter than the JSON itself: an address, not a file.
    expect(code.length).toBeLessThan(JSON.stringify(plan).length / 2);
    const back = await decodePlanParam(code);
    expect(back).toEqual(JSON.parse(JSON.stringify(plan)));
    expect(parsePlan(back)?.items).toHaveLength(plan.items.length);
  });

  it('reads the uncompressed text of browsers without CompressionStream', async () => {
    const json = new TextEncoder().encode(JSON.stringify(plan));
    const code = `j${btoa(String.fromCharCode(...json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    expect(await decodePlanParam(code)).toEqual(JSON.parse(JSON.stringify(plan)));
  });

  it('refuses what is not a plan text', async () => {
    expect(await decodePlanParam(null)).toBeNull();
    expect(await decodePlanParam('')).toBeNull();
    expect(await decodePlanParam('x123')).toBeNull();
    expect(await decodePlanParam('z!!!')).toBeNull();
    expect(await decodePlanParam('zAAAA')).toBeNull();
    expect(await decodePlanParam(`j${btoa('not json')}`)).toBeNull();
    expect(await decodePlanParam(`z${'A'.repeat(300_000)}`)).toBeNull();
  });
});
