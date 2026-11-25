import { describe, expect, it } from 'vitest';
import { VEHICLE_PRESETS } from './presets';
import type { FloorFit } from './tools/floorFit';
import { bestFit, fitOptions, gridFit, tiersUnder } from './tools/floorFit';
import { floorPlaces, loadedPallet, palletLoad, PALLET_REFS, PALLETS } from './tools/pallets';
import { ldmSummary, rowLdm } from './tools/ldm';
import {
  AXLE_EXAMPLE,
  TYPICAL_RIG,
  axleLoads,
  axleStart,
  axleStartCargo,
  cargoCentre,
  rigChassis,
  type LoadGroup,
  type Rig,
} from './tools/axleLoads';
import { bodyCheck, boxesInBody, boxesOnPallet, cargoTotals } from './tools/cargo';
import { START_MAX_ITEMS, buildStartPlan, decodeStart, encodeStart, fitPlan, type StartSpec } from './tools/startPlan';
import { computeLayout } from './layout';
import type { CargoItem, Plan } from './types';
import { vehicleAxleLoads } from './chassis';
import { itemBox } from './item';
import { computeStats } from './stats';
import { findCollisions, findFloating } from './physics';

const deck = (id: string) => {
  const body = VEHICLE_PRESETS.find((p) => p.id === id)!.bodies[0];
  return { l: body.dims.l, w: body.dims.w };
};

/** No two spots overlap and every spot lies on the floor. */
function expectSound(fit: FloorFit, floor: { l: number; w: number }, gap = 0) {
  for (const s of fit.spots) {
    expect(s.x).toBeGreaterThanOrEqual(-1e-9);
    expect(s.z).toBeGreaterThanOrEqual(-1e-9);
    expect(s.x + s.l).toBeLessThanOrEqual(floor.l + 1e-9);
    expect(s.z + s.w).toBeLessThanOrEqual(floor.w + 1e-9);
  }
  for (let i = 0; i < fit.spots.length; i++) {
    for (let j = i + 1; j < fit.spots.length; j++) {
      const a = fit.spots[i];
      const b = fit.spots[j];
      const apart =
        a.x + a.l + gap <= b.x + 1e-9 || b.x + b.l + gap <= a.x + 1e-9 || a.z + a.w + gap <= b.z + 1e-9 || b.z + b.w + gap <= a.z + 1e-9;
      expect(apart).toBe(true);
    }
  }
  expect(fit.count).toBe(fit.spots.length);
}

describe('floor fit', () => {
  it('a 13,6 m trailer takes 33 europallets along and 34 turned, end to end', () => {
    const floor = deck('tent');
    const along = gridFit(floor, PALLETS.eur, false);
    expect(along.count).toBe(33);
    expect(along.lanes).toEqual({ along: 3, turned: 0 });
    expect(along.usedLength).toBe(1320);
    expect(along.slack).toBe(40);
    const turned = gridFit(floor, PALLETS.eur, true);
    expect(turned.count).toBe(34);
    expect(turned.slack).toBe(0);
    const best = bestFit(floor, PALLETS.eur);
    expect(best.count).toBe(34);
    expect(best.kind).toBe('turned');
    expectSound(best, floor);
    // Both are shown, the best first.
    expect(fitOptions(floor, PALLETS.eur).map((f) => [f.kind, f.count])).toEqual([
      ['turned', 34],
      ['along', 33],
    ]);
  });

  it('a centimetre between pallets leaves the 33 along', () => {
    const floor = deck('tent');
    const best = bestFit(floor, PALLETS.eur, 1);
    expect(best.count).toBe(33);
    expect(best.kind).toBe('along');
    expectSound(best, floor, 1);
  });

  it('26 finpallets go turned into a 13,6 m trailer', () => {
    const best = bestFit(deck('tent'), PALLETS.fin);
    expect(best.count).toBe(26);
    expectSound(best, deck('tent'));
  });

  it('a 20′ container takes 11 europallets only mixed: one lane turned beside one along', () => {
    const floor = deck('c20');
    expect(gridFit(floor, PALLETS.eur, false).count).toBe(8);
    expect(gridFit(floor, PALLETS.eur, true).count).toBe(7);
    const best = bestFit(floor, PALLETS.eur);
    expect(best.count).toBe(11);
    expect(best.kind).toBe('mixed');
    expectSound(best, floor);
    // Two plain lanes along the whole container: 4 along beside 7 turned.
    expect(new Set(best.spots.map((s) => s.z))).toEqual(new Set([0, 80]));
    expect(best.lanes).toEqual({ along: 1, turned: 1 });
    expect(bestFit(floor, PALLETS.fin).count).toBe(9);
  });

  it('a 40′ HC container takes 25 europallets mixed', () => {
    const best = bestFit(deck('c40'), PALLETS.eur);
    expect(best.count).toBe(25);
    expectSound(best, deck('c40'));
  });

  it('the width of a van decides on the turned pallet', () => {
    expect(bestFit({ l: 300, w: 195 }, PALLETS.eur).count).toBe(4);
    expect(bestFit({ l: 400, w: 195 }, PALLETS.eur).count).toBe(6);
    expect(bestFit({ l: 400, w: 200 }, PALLETS.eur).count).toBe(8);
    expectSound(bestFit({ l: 400, w: 200 }, PALLETS.eur), { l: 400, w: 200 });
  });

  it('nothing fits on a floor smaller than the piece or with bad input', () => {
    expect(bestFit({ l: 100, w: 100 }, PALLETS.eur).count).toBe(0);
    expect(bestFit({ l: 0, w: 245 }, PALLETS.eur).count).toBe(0);
    expect(bestFit({ l: 1360, w: 245 }, { l: Number.NaN, w: 80 }).count).toBe(0);
    expect(fitOptions({ l: 100, w: 100 }, PALLETS.eur)).toEqual([]);
  });

  it('never beats the floor area and every layout of the presets is sound', () => {
    for (const preset of VEHICLE_PRESETS) {
      for (const body of preset.bodies) {
        for (const kind of ['eur', 'fin', 'half'] as const) {
          const floor = { l: body.dims.l, w: body.dims.w };
          const fit = bestFit(floor, PALLETS[kind]);
          expect(fit.count).toBeLessThanOrEqual(Math.floor((floor.l * floor.w) / (PALLETS[kind].l * PALLETS[kind].w)));
          expect(fit.count).toBe(floorPlaces(floor, kind));
          expectSound(fit, floor);
        }
      }
    }
  });

  it('counts tiers under the roof', () => {
    expect(tiersUnder(270, 150, true)).toBe(1);
    expect(tiersUnder(270, 120, true)).toBe(2);
    expect(tiersUnder(270, 120, false)).toBe(1);
    expect(tiersUnder(100, 120, true)).toBe(0);
  });
});

describe('pallets in a vehicle', () => {
  const tent = { l: 1360, w: 245, h: 270, maxLoad: 20000 };

  it('takes the smaller of space and payload', () => {
    const light = palletLoad(tent, { dims: { l: 120, w: 80, h: 150 }, weight: 400, stackable: false });
    expect(light.total).toBe(34);
    expect(light.byWeight).toBe(50);
    expect(light.weight).toBe(13600);
    const heavy = palletLoad(tent, { dims: { l: 120, w: 80, h: 150 }, weight: 800, stackable: false });
    expect(heavy.bySpace).toBe(34);
    expect(heavy.byWeight).toBe(25);
    expect(heavy.total).toBe(25);
  });

  it('stacks low pallets in two tiers', () => {
    const load = palletLoad(tent, { dims: { l: 120, w: 80, h: 120 }, stackable: true });
    expect(load.tiers).toBe(2);
    expect(load.bySpace).toBe(68);
    expect(load.byWeight).toBeNull();
    expect(load.ldm).toBe(13.6);
  });

  it('reports nothing for a pallet taller than the body', () => {
    const load = palletLoad(tent, { dims: { l: 120, w: 80, h: 300 }, stackable: true });
    expect(load.total).toBe(0);
  });
});

describe('LDM', () => {
  it('a europallet is 0,4 LDM and a finpallet 0,5', () => {
    expect(rowLdm({ l: 120, w: 80, count: 1, stack: 1 })).toBeCloseTo(0.4);
    expect(rowLdm({ l: 120, w: 100, count: 1, stack: 1 })).toBeCloseTo(0.5);
  });

  it('33 europallets fill a 13,6 m trailer to 13,2 LDM', () => {
    const r = ldmSummary([{ l: 120, w: 80, count: 33, stack: 1, weight: 400 }]);
    expect(r.ldm).toBeCloseTo(13.2);
    expect(r.trailers).toBe(1);
    expect(r.weight).toBe(13200);
    // Light cargo is billed by its loading metres.
    expect(r.chargeableWeight).toBeCloseTo(13.2 * 1850);
  });

  it('stacked pieces share a floor place, and the bill rounds LDM up to 0,1', () => {
    const r = ldmSummary([{ l: 120, w: 80, count: 3, stack: 2 }]);
    expect(r.floorPlaces).toBe(2);
    expect(r.ldm).toBeCloseTo(0.8);
    const odd = ldmSummary([{ l: 100, w: 100, count: 1, stack: 1 }]);
    expect(odd.ldm).toBeCloseTo(0.4167, 3);
    expect(odd.billed).toBeCloseTo(0.5);
  });

  it('heavy cargo is billed by weight and long loads need more trailers', () => {
    const heavy = ldmSummary([{ l: 120, w: 80, count: 10, stack: 1, weight: 1000 }]);
    expect(heavy.chargeableWeight).toBe(10000);
    const long = ldmSummary([{ l: 120, w: 80, count: 40, stack: 1 }]);
    expect(long.trailers).toBe(2);
  });

  it('skips empty rows', () => {
    expect(ldmSummary([{ l: 0, w: 80, count: 5, stack: 1 }]).ldm).toBe(0);
    expect(ldmSummary([]).trailers).toBe(0);
  });
});

describe('axle loads', () => {
  const rig = TYPICAL_RIG;

  it('finds the centre of gravity of the groups', () => {
    expect(cargoCentre([{ weight: 1000, from: 0, to: 200 }])).toEqual({ weight: 1000, cog: 100 });
    expect(cargoCentre([{ weight: 1000, from: 0, to: 200 }, { weight: 3000, from: 400, to: 600 }]).cog).toBe(400);
    expect(cargoCentre([]).cog).toBeNull();
  });

  it('cargo over the kingpin rests on the tractor, over the axles on the semi-trailer', () => {
    const onKingpin = axleLoads([{ weight: 10000, from: rig.kingpin - 50, to: rig.kingpin + 50 }], rig);
    expect(onKingpin.cargoOnKingpin).toBeCloseTo(10000);
    expect(onKingpin.cargoOnAxles).toBeCloseTo(0);
    const onAxles = axleLoads([{ weight: 10000, from: rig.bogie - 50, to: rig.bogie + 50 }], rig);
    expect(onAxles.cargoOnAxles).toBeCloseTo(10000);
    expect(onAxles.trailer).toBeCloseTo(rig.trailerTareAxles + 10000);
  });

  it('keeps the weight: the axles carry the vehicle and the cargo', () => {
    const r = axleLoads([{ weight: 20000, from: 0, to: 1320 }], rig);
    const tare = rig.trailerTareKingpin + rig.trailerTareAxles + rig.tractorFront + rig.tractorDrive;
    expect(r.gross).toBeCloseTo(tare + 20000);
    expect(r.front + r.drive).toBeCloseTo(rig.tractorFront + rig.tractorDrive + r.kingpin);
    // The front axle takes the fifth wheel's lead of the kingpin load.
    expect(r.front - rig.tractorFront).toBeCloseTo((r.kingpin * rig.fifthWheelAhead) / rig.wheelbase);
    expect(r.cogFromFront).toBeCloseTo(660 / 1360);
    expect(r.balanced).toBe(true);
  });

  it('warns about cargo at one end', () => {
    const rear = axleLoads([{ weight: 8000, from: 1100, to: 1360 }], rig);
    expect(rear.behindBogie).toBe(true);
    expect(rear.balanced).toBe(false);
    expect(rear.cargoOnKingpin).toBeLessThan(0);
    const front = axleLoads([{ weight: 8000, from: 0, to: 100 }], rig);
    expect(front.aheadOfKingpin).toBe(true);
    const none = axleLoads([], rig);
    expect(none.cargoCog).toBeNull();
    expect(none.balanced).toBe(true);
    expect(none.gross).toBeCloseTo(rig.trailerTareKingpin + rig.trailerTareAxles + rig.tractorFront + rig.tractorDrive);
  });
});

describe('cargo volume and boxes', () => {
  it('sums the places', () => {
    const t = cargoTotals([
      { dims: { l: 120, w: 80, h: 150 }, count: 10, weight: 400 },
      { dims: { l: 60, w: 40, h: 40 }, count: 0 },
    ]);
    expect(t.places).toBe(10);
    expect(t.volume).toBe(120 * 80 * 150 * 10);
    expect(t.weight).toBe(4000);
    expect(t.longest).toBe(150);
  });

  it('checks a body by volume, payload and the longest place', () => {
    const tent = { l: 1360, w: 245, h: 270, maxLoad: 20000 };
    expect(bodyCheck(cargoTotals([{ dims: { l: 120, w: 80, h: 150 }, count: 33, weight: 400 }]), tent).fits).toBe(true);
    const heavy = bodyCheck(cargoTotals([{ dims: { l: 120, w: 80, h: 150 }, count: 33, weight: 700 }]), tent);
    expect(heavy.fits).toBe(false);
    expect(heavy.weightShare).toBeGreaterThan(1);
    const long = bodyCheck(cargoTotals([{ dims: { l: 1500, w: 50, h: 50 }, count: 1 }]), tent);
    expect(long.fits).toBe(false);
  });

  it('puts boxes on a pallet layer by layer', () => {
    const r = boxesOnPallet({
      pallet: { l: 120, w: 80 },
      palletHeight: 14.4,
      maxHeight: 180,
      box: { l: 40, w: 30, h: 30 },
      boxWeight: 10,
      palletWeight: 25,
    });
    expect(r.perLayer).toBe(8);
    expect(r.layers).toBe(5);
    expect(r.total).toBe(40);
    expect(r.height).toBeCloseTo(164.4);
    expect(r.weight).toBe(425);
    expectSound(r.layer, { l: 120, w: 80 });
  });

  it('stops at the weight limit of the pallet', () => {
    const r = boxesOnPallet({
      pallet: { l: 120, w: 80 },
      palletHeight: 14.4,
      maxHeight: 180,
      box: { l: 40, w: 30, h: 30 },
      boxWeight: 30,
      palletWeight: 25,
      maxWeight: 1000,
    });
    expect(r.byWeight).toBe(32);
    expect(r.total).toBe(32);
    expect(r.height).toBeCloseTo(14.4 + 4 * 30);
  });
});

describe('a plan from a calculator', () => {
  const tent: StartSpec['body'] = { name: 'Тент', kind: 'semi', dims: { l: 1360, w: 245, h: 270 }, maxLoad: 20000 };
  const eur = (count: number, h = 150, stackable = false): StartSpec => ({
    name: 'Тент — европаллеты',
    body: tent,
    cargo: [{ name: 'Европаллета', dims: { l: 120, w: 80, h }, weight: 400, count, lay: { gap: 0, stackable } }],
  });

  it('travels through the address and back', () => {
    const spec = eur(34);
    expect(decodeStart(encodeStart(spec))).toEqual(spec);
    const docked: StartSpec = { ...spec, cargo: [{ name: 'Коробка', dims: { l: 60, w: 40, h: 40 }, count: 3 }] };
    expect(decodeStart(encodeStart(docked))).toEqual(docked);
  });

  it('carries the axles and the stretches of groups, and reads older links', () => {
    const own: StartSpec = {
      name: 'Полуприцеп 13,6 м — 19 т',
      body: { ...tent, chassisModel: 'euro-tent', chassis: { front: { x: 120, tare: 2500 }, tractorDrive: { x: 200 } } },
      cargo: [{ name: 'Груз 1', dims: { l: 120, w: 80, h: 120 }, weight: 619, count: 21, span: { from: 0, to: 880 } }],
    };
    expect(decodeStart(encodeStart(own))).toEqual(own);
    // Own figures without a template.
    const plain: StartSpec = { ...own, body: { ...tent, chassis: { rear: { tare: 5000 } } } };
    expect(decodeStart(encodeStart(plain))).toEqual(plain);
    const withTemplate: StartSpec = { ...own, body: { ...tent, chassisModel: 'euro-tent' } };
    expect(decodeStart(encodeStart(withTemplate))).toEqual(withTemplate);

    // Links made before the axles: without the template, and with it but without own figures.
    const old = decodeStart(
      JSON.stringify({ v: 1, n: 'Тент', b: ['Тент', 'semi', 1360, 245, 270, 20000], c: [['Европаллета', 120, 80, 150, 400, 34, 0, 0]] }),
    )!;
    expect(old.body).toEqual(tent);
    expect(old.cargo[0].lay).toEqual({ gap: 0, stackable: false });
    expect(old.cargo[0].span).toBeUndefined();
    const older = decodeStart(JSON.stringify({ v: 1, n: 'Тент', b: ['Тент', 'semi', 1360, 245, 270, 20000, 'euro-tent'], c: [] }))!;
    expect(older.body).toEqual({ ...tent, chassisModel: 'euro-tent' });

    // From the address anything may come: only valid figures and stretches within the body are kept.
    const junk = decodeStart(
      JSON.stringify({
        v: 1,
        n: 'x',
        b: ['Тент', 'semi', 1360, 245, 270, 0, 42, { front: { x: 'a', tare: 1e9 }, rear: [1], tractorFront: { axles: 3 }, boat: { x: 1 } }],
        c: [
          ['a', 120, 80, 120, 100, 3, [5000, -20]],
          ['b', 120, 80, 120, 100, 3, ['x', 100]],
          ['c', 120, 80, 120, 100, 3, [100]],
        ],
      }),
    )!;
    expect(junk.body.chassisModel).toBeUndefined();
    expect(junk.body.chassis).toEqual({ front: { tare: 60000 } });
    expect(junk.cargo[0].span).toEqual({ from: 0, to: 1360 });
    expect(junk.cargo[0].lay).toBeUndefined();
    expect(junk.cargo[1].span).toBeUndefined();
    expect(junk.cargo[2].span).toBeUndefined();
    expect(decodeStart(JSON.stringify({ v: 1, n: 'x', b: ['Тент', 'semi', 1360, 245, 270, 0, '', 'none'], c: [] }))!.body.chassis).toBeUndefined();
  });

  it('refuses what is not a start and brings values within the limits', () => {
    expect(decodeStart(null)).toBeNull();
    expect(decodeStart('not json')).toBeNull();
    expect(decodeStart('{"v":2}')).toBeNull();
    expect(decodeStart(JSON.stringify({ v: 1, n: 'x', b: ['b', 'semi', 0, 245, 270, 0], c: [] }))).toBeNull();
    const wild = decodeStart(
      JSON.stringify({ v: 1, n: '', b: ['', 'boat', 99999, 1, 270, 1e9], c: [['', 1e6, 80, 150, 1e7, 1e6, 999, 1], ['x', 10, 10, 10, 0, 5]] }),
    )!;
    expect(wild.name).toBe('Схема из калькулятора');
    expect(wild.body.kind).toBe('semi');
    expect(wild.body.dims.l).toBe(2500);
    expect(wild.body.dims.w).toBe(100);
    expect(wild.body.maxLoad).toBe(60000);
    expect(wild.cargo).toHaveLength(1);
    expect(wild.cargo[0].count).toBe(START_MAX_ITEMS);
    expect(wild.cargo[0].dims.l).toBe(3000);
    expect(wild.cargo[0].weight).toBe(30000);
    expect(wild.cargo[0].lay).toEqual({ gap: 50, stackable: true });
  });

  it('stands the pallets in the body as the calculator drew them', () => {
    const { plan, dropped } = buildStartPlan(eur(34));
    expect(dropped).toBe(0);
    expect(plan.items).toHaveLength(34);
    const stats = computeStats(plan.items, computeLayout(plan.vehicles, plan.dockMode));
    expect(stats.inside).toBe(34);
    expect(stats.bodies[0].weight).toBe(13600);
    expect(findCollisions(plan.items)).toEqual([]);
    expect(findFloating(plan.items)).toEqual([]);
    // Turned, as 34 europallets stand in a 13,6 m trailer.
    expect(plan.items.every((i) => i.orientation.yaw === 90)).toBe(true);
    expect(plan.nextSeq).toBe(35);
  });

  it('stacks the second tier and puts what does not fit on the dock', () => {
    const stacked = buildStartPlan(eur(50, 120, true)).plan;
    const layout = computeLayout(stacked.vehicles, stacked.dockMode);
    expect(computeStats(stacked.items, layout).inside).toBe(50);
    expect(stacked.items.filter((i) => i.pos.y > 0)).toHaveLength(16);
    expect(findCollisions(stacked.items)).toEqual([]);
    expect(findFloating(stacked.items)).toEqual([]);
    const over = buildStartPlan(eur(40)).plan;
    const stats = computeStats(over.items, computeLayout(over.vehicles, over.dockMode));
    expect(stats.inside).toBe(34);
    expect(stats.dock).toBe(6);
    expect(findCollisions(over.items)).toEqual([]);
  });

  it('keeps to the tier limit and puts other groups on the dock', () => {
    const { plan, dropped } = buildStartPlan(
      {
        name: 'Сборный',
        body: tent,
        cargo: [
          { name: 'Коробка', dims: { l: 60, w: 40, h: 40 }, weight: 20, count: 8 },
          { name: 'Паллета', dims: { l: 120, w: 80, h: 150 }, count: 5 },
        ],
      },
      10,
    );
    expect(plan.items).toHaveLength(10);
    expect(dropped).toBe(3);
    const stats = computeStats(plan.items, computeLayout(plan.vehicles, plan.dockMode));
    expect(stats.dock).toBe(10);
    expect(new Set(plan.items.map((i) => i.color)).size).toBe(2);
    expect(findCollisions(plan.items)).toEqual([]);
  });

  it('makes an empty body when there is no cargo', () => {
    const { plan } = buildStartPlan({ name: 'Кузов', body: tent, cargo: [] });
    expect(plan.vehicles[0].bodies[0].dims).toEqual(tent.dims);
    expect(plan.vehicles[0].bodies[0].maxLoad).toBe(20000);
    expect(plan.items).toEqual([]);
  });

  it('brings a carried plan within the limits of the account', () => {
    const one = buildStartPlan(eur(40)).plan;
    // Untouched without limits or within them.
    expect(fitPlan(one, null).plan).toBe(one);
    expect(fitPlan(one, { vehicles: 1, items: 100 })).toEqual({ plan: one, dropped: 0 });

    // Over the cargo limit: what is on the dock goes first.
    const fewer = fitPlan(one, { vehicles: 1, items: 36 });
    expect(fewer.dropped).toBe(4);
    const fewerStats = computeStats(fewer.plan.items, computeLayout(fewer.plan.vehicles, fewer.plan.dockMode));
    expect(fewerStats.inside).toBe(34);
    expect(fewerStats.dock).toBe(2);

    // A second vehicle over the limit: taken away, its cargo goes to the dock.
    const second = { ...one.vehicles[0], id: 'veh-2', name: 'Машина 2', bodies: [{ ...one.vehicles[0].bodies[0], id: 'body-2' }] };
    const two = { ...one, vehicles: [one.vehicles[0], second] };
    const deck = computeLayout(two.vehicles, two.dockMode).bodies[1].box;
    const pallet: CargoItem = { ...one.items[0], id: 'cargo-extra', seq: 99, orientation: { yaw: 0 }, pos: { x: deck.max.x - 120, y: deck.min.y, z: deck.min.z } };
    const fitted = fitPlan({ ...two, items: [...two.items, pallet] }, { vehicles: 1, items: 100 });
    expect(fitted.dropped).toBe(0);
    expect(fitted.plan.vehicles.map((v) => v.id)).toEqual([one.vehicles[0].id]);
    expect(fitted.plan.items).toHaveLength(41);
    const stats = computeStats(fitted.plan.items, computeLayout(fitted.plan.vehicles, fitted.plan.dockMode));
    expect(stats.inside).toBe(34);
    expect(stats.dock).toBe(7);
    expect(findCollisions(fitted.plan.items)).toEqual([]);
    expect(findFloating(fitted.plan.items)).toEqual([]);
    expect(fitted.plan.nextSeq).toBe(100);
  });
});

describe('a plan from the axle calculator', () => {
  const template = (() => {
    const b = VEHICLE_PRESETS.find((p) => p.id === 'tent')!.bodies[0];
    return { name: b.name, kind: b.kind, dims: { ...b.dims }, maxLoad: b.maxLoad, chassisModel: b.chassisModel } as StartSpec['body'];
  })();
  /** The editor's axle loads of the plan's vehicle, every piece in its one body. */
  const vehicleAxles = (plan: Plan) => {
    const pv = computeLayout(plan.vehicles, plan.dockMode).vehicles[0];
    return vehicleAxleLoads(pv, new Map([[pv.bodies[0].body.id, plan.items.map((i) => ({ box: itemBox(i), weight: i.weight ?? 0 }))]]));
  };
  /** What the editor counts for the plan's vehicle, by support. */
  const editorLoads = (plan: Plan) => {
    const axles = vehicleAxles(plan);
    const load = (part: string) => axles.groups.find((g) => g.part === part)!.load;
    return { front: load('tractorFront'), drive: load('tractorDrive'), kingpin: load('front'), trailer: load('rear'), gross: axles.gross };
  };
  /** The calculator's groups and rig through the address into a plan, as «Попробовать в 3D» does. */
  const through = (groups: readonly LoadGroup[], rig: Rig) => {
    const spec = decodeStart(encodeStart({ name: 'Оси', ...axleStart(groups, rig, template) }))!;
    return { spec, plan: buildStartPlan(spec).plan };
  };
  const expectSame = (plan: Plan, groups: readonly LoadGroup[], rig: Rig) => {
    const calc = axleLoads(groups, rig);
    const editor = editorLoads(plan);
    // Within the rounding of the pieces' weights (0,01 kg each).
    for (const key of ['front', 'drive', 'kingpin', 'trailer', 'gross'] as const) expect(Math.abs(editor[key] - calc[key])).toBeLessThan(0.5);
  };

  it("the example gives the editor the calculator's axle loads, without overrides", () => {
    const { spec, plan } = through(AXLE_EXAMPLE, TYPICAL_RIG);
    expect(spec.body.chassis).toBeUndefined();
    expect(spec.body.chassisModel).toBe('euro-tent');
    expect(spec.cargo.map((c) => [c.name, c.count])).toEqual([
      ['Груз 1', 21],
      ['Груз 2', 9],
    ]);
    expectSame(plan, AXLE_EXAMPLE, TYPICAL_RIG);
    const stats = computeStats(plan.items, computeLayout(plan.vehicles, plan.dockMode));
    expect(stats.inside).toBe(30);
    expect(Math.abs(stats.bodies[0].weight - 19000)).toBeLessThan(0.5);
    // The editor's own axle loads (the stats bar, «Нагрузка на оси») are the same.
    expect(stats.vehicles[0].axles).toEqual(vehicleAxles(plan));
    expect(findCollisions(plan.items)).toEqual([]);
    expect(findFloating(plan.items)).toEqual([]);
  });

  it("carries the visitor's own rig as the body's axles", () => {
    const rig: Rig = {
      ...TYPICAL_RIG,
      kingpin: 120,
      bogie: 900,
      trailerTareKingpin: 2500,
      trailerTareAxles: 5200,
      tractorFront: 5400,
      tractorDrive: 2900,
      fifthWheelAhead: 80,
      // The editor's steering axle is under its cab: kingpin + lead + 130 cm.
      wheelbase: 330,
    };
    expect(rigChassis(rig, template)).toEqual({
      front: { x: 120, tare: 2500 },
      rear: { x: 900, tare: 5200 },
      tractorFront: { tare: 5400 },
      tractorDrive: { tare: 2900, x: 200 },
    });
    // 8 t over 9 pallets: 888,89 kg each.
    const groups = [AXLE_EXAMPLE[0], { ...AXLE_EXAMPLE[1], weight: 8000 }];
    const { spec, plan } = through(groups, rig);
    expect(plan.vehicles[0].bodies[0].chassis).toEqual(spec.body.chassis);
    expectSame(plan, groups, rig);
    // Another kingpin with the usual lead: the drive axle follows it by itself.
    expect(rigChassis({ ...TYPICAL_RIG, kingpin: 140 }, template)).toEqual({ front: { x: 140 } });
  });

  it('stacks overlapping groups and keeps to the limits', () => {
    const groups: LoadGroup[] = [
      { weight: 8000, from: 200, to: 800 },
      { weight: 4000, from: 500, to: 300 },
      { weight: 0, from: 0, to: 1000 },
      { weight: 3000, from: 1200, to: 3000 },
    ];
    const cargo = axleStartCargo(groups, template.dims);
    expect(cargo.map((c) => c.name)).toEqual(['Груз 1', 'Груз 2', 'Груз 4']);
    // Within the deck, from the front wall.
    expect(cargo[1].span).toEqual({ from: 300, to: 500 });
    expect(cargo[2].span).toEqual({ from: 1200, to: 1360 });
    const { plan } = buildStartPlan({ name: 'Оси', body: template, cargo });
    expect(findCollisions(plan.items)).toEqual([]);
    expect(findFloating(plan.items)).toEqual([]);
    expect(plan.items.some((i) => i.pos.y > 0)).toBe(true);
    const stats = computeStats(plan.items, computeLayout(plan.vehicles, plan.dockMode));
    expect(stats.inside).toBe(plan.items.length);
    expect(stats.bodies[0].weight).toBeCloseTo(15000, 6);

    const many = axleStartCargo(
      Array.from({ length: 30 }, (_, i) => ({ weight: 1000, from: 0, to: 2500 + i })),
      { l: 2500, w: 245, h: 270 },
    );
    expect(many).toHaveLength(20);
    expect(many.reduce((n, c) => n + c.count, 0)).toBeLessThanOrEqual(START_MAX_ITEMS);
  });
});

describe('boxes loose in a body', () => {
  const cube = { l: 100, w: 100, h: 100 };

  it('fills the floor and the height with upright boxes', () => {
    const r = boxesInBody(cube, { l: 50, w: 50, h: 50 });
    expect(r).toMatchObject({ perLayer: 4, layers: 2, bySpace: 8, total: 8, upright: true, byWeight: null });
    expect(r.volumeFill).toBeCloseTo(1);
  });

  it('lays a box on its side only when that is allowed and takes more', () => {
    const low = { l: 100, w: 100, h: 50 };
    const tall = { l: 50, w: 50, h: 60 };
    expect(boxesInBody(low, tall).total).toBe(0);
    const tipped = boxesInBody(low, tall, 0, true);
    expect(tipped).toMatchObject({ total: 2, layers: 1, upright: false });
    expect(tipped.dims.h).toBe(50);
    // A cube gains nothing on its side: it stays upright.
    expect(boxesInBody(cube, { l: 50, w: 50, h: 50 }, 0, true).upright).toBe(true);
  });

  it('stops at the payload', () => {
    const body = { ...VEHICLE_PRESETS.find((p) => p.id === 'tent')!.bodies[0].dims, maxLoad: 20000 };
    const r = boxesInBody(body, { l: 60, w: 40, h: 40 }, 30);
    expect(r.perLayer).toBe(bestFit(deck('tent'), { l: 60, w: 40 }).count);
    expect(r.layers).toBe(6);
    expect(r.bySpace).toBe(r.perLayer * 6);
    expect(r.byWeight).toBe(666);
    expect(r.total).toBe(Math.min(r.bySpace, 666));
    expect(r.weight).toBe(r.total * 30);
  });
});

describe('a pallet with its load', () => {
  it('adds the pallet to the cargo and checks the safe working load', () => {
    expect(loadedPallet('eur', 600, 120)).toEqual({ grossWeight: 625, height: 134.4, loadShare: 0.4, overloaded: false, area: 0.96 });
    expect(loadedPallet('eur', 1600, 100).overloaded).toBe(true);
    expect(loadedPallet('half', 800, 50).overloaded).toBe(true);
    expect(loadedPallet('fin', 1500, 100).overloaded).toBe(false);
    expect(PALLET_REFS.half.safeLoad).toBeLessThan(PALLET_REFS.eur.safeLoad);
  });
});
