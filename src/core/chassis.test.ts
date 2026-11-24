import { describe, expect, it } from 'vitest';
import type { BodyKind, CargoBody, CargoItem, ChassisPatch } from './types';
import {
  CHASSIS_MODELS,
  EURO_RIG,
  TRACTOR_STEER_X,
  TRUCK_STEER_X,
  axleRanges,
  axleWeightRange,
  chassisModelOf,
  chassisOf,
  cleanChassis,
  groupLabel,
  typicalChassis,
  vehicleAxleLoads,
  withChassisValue,
  type AxleLoad,
  type VehicleAxles,
} from './chassis';
import { VEHICLE_PRESETS } from './presets';
import { computeLayout } from './layout';
import { computeStats } from './stats';
import { vehicle } from './testing';
import { AXLE_SPACING, WHEEL_RADIUS } from './axles';
import { TYPICAL_RIG, axleLoads } from './tools/axleLoads';

function body(kind: BodyKind, l: number, id: string, extra: Partial<CargoBody> = {}): CargoBody {
  return { id, name: id, kind, dims: { l, w: 245, h: 270 }, ...extra };
}

let n = 0;
/** An item `length` long whose front face is `fromFront` cm behind the front wall of the body at world X `wall`. */
function cargo(wall: number, fromFront: number, length: number, weight: number, z = 0): CargoItem {
  n++;
  return {
    id: `i${n}`,
    seq: n,
    name: `i${n}`,
    dims: { l: length, w: 100, h: 100 },
    orientation: { yaw: 0 },
    pos: { x: wall - fromFront - length, y: 0, z: z - 50 },
    color: '#000',
    weight,
  };
}

function axlesOf(bodies: CargoBody[], items: CargoItem[] = []): VehicleAxles {
  const layout = computeLayout([vehicle(bodies)]);
  return computeStats(items, layout).vehicles[0].axles;
}

function group(a: VehicleAxles, bodyId: string, part: AxleLoad['part']): AxleLoad {
  const g = a.groups.find((x) => x.bodyId === bodyId && x.part === part);
  if (!g) throw new Error(`no ${part} of ${bodyId}`);
  return g;
}

const tareOf = (a: VehicleAxles) => a.groups.filter((g) => g.axles > 0).reduce((s, g) => s + g.tare, 0);

describe('axle loads (core/chassis.ts)', () => {
  it('gives a euro semi-trailer the same loads as the axle calculator', () => {
    const semi = body('semi', 1360, 's');
    const items = [cargo(1360, 0, 880, 13000), cargo(1360, 880, 440, 6000)];
    const a = axlesOf([semi], items);
    const calc = axleLoads(
      [
        { weight: 13000, from: 0, to: 880 },
        { weight: 6000, from: 880, to: 1320 },
      ],
      TYPICAL_RIG,
    );
    expect(group(a, 's', 'tractorFront').load).toBeCloseTo(calc.front, 6);
    expect(group(a, 's', 'tractorDrive').load).toBeCloseTo(calc.drive, 6);
    expect(group(a, 's', 'front').load).toBeCloseTo(calc.kingpin, 6);
    expect(group(a, 's', 'rear').load).toBeCloseTo(calc.trailer, 6);
    expect(a.gross).toBeCloseTo(calc.gross, 6);
    expect(a.cargo).toBeCloseTo(19000, 6);
    // Three axles share the semi-trailer's load.
    const rear = group(a, 's', 'rear');
    expect(rear.axles).toBe(3);
    expect(rear.perAxle).toBeCloseTo(rear.load / 3, 9);
    expect(groupLabel(rear)).toBe('Оси полуприцепа');
    expect(a.groups.map((g) => g.part)).toEqual(['tractorFront', 'tractorDrive', 'front', 'rear']);
  });

  it('puts cargo over the rear axle of a truck on that axle only, and shares the rest by the lever rule', () => {
    const truck = body('truck', 800, 't', { maxLoad: 10000 });
    const ch = chassisOf(truck, true);
    const empty = axlesOf([truck]);
    const over = axlesOf([truck], [cargo(800, ch.rear.x - 50, 100, 1000)]);
    expect(group(over, 't', 'front').load).toBeCloseTo(group(empty, 't', 'front').load, 6);
    expect(group(over, 't', 'rear').cargo).toBeCloseTo(1000, 6);

    // At the front wall: the share of the front axle is the item's distance from the rear axle over the wheelbase.
    const ahead = axlesOf([truck], [cargo(800, 0, 100, 1000)]);
    const share = (ch.rear.x - 50) / (ch.rear.x - ch.front.x);
    expect(group(ahead, 't', 'front').cargo).toBeCloseTo(1000 * share, 6);
    expect(group(ahead, 't', 'rear').cargo).toBeCloseTo(1000 * (1 - share), 6);
    expect(ahead.gross).toBeCloseTo(tareOf(empty) + 1000, 6);
  });

  it('keeps the truck of a road train free of what its drawbar trailer carries', () => {
    const truck = body('truck', 770, 't', { maxLoad: 10000 });
    const trailer = body('trailer', 820, 'p', { maxLoad: 10000 });
    const layout = computeLayout([vehicle([truck, trailer])]);
    const trailerWall = layout.bodies[1].box.max.x;
    const empty = axlesOf([truck, trailer]);
    const loaded = axlesOf([truck, trailer], [cargo(trailerWall, 100, 600, 8000)]);
    expect(group(loaded, 't', 'front').load).toBeCloseTo(group(empty, 't', 'front').load, 6);
    expect(group(loaded, 't', 'rear').load).toBeCloseTo(group(empty, 't', 'rear').load, 6);
    expect(group(loaded, 'p', 'front').cargo + group(loaded, 'p', 'rear').cargo).toBeCloseTo(8000, 6);
    expect(groupLabel(group(loaded, 'p', 'front'))).toBe('Передняя ось прицепа');
  });

  it('hangs a centre-axle trailer on the hitch of the truck in front of it', () => {
    const truck = body('truck', 600, 't', { maxLoad: 8000 });
    const trailer = body('trailer', 350, 'p', { maxLoad: 3000 });
    const ch = chassisOf(trailer, false);
    expect(ch.front.axles).toBe(0);
    const layout = computeLayout([vehicle([truck, trailer])]);
    const wall = layout.bodies[1].box.max.x;
    const empty = axlesOf([truck, trailer]);

    // Cargo ahead of the trailer's axle presses on the hitch: the truck's rear takes more, its front less.
    const ahead = axlesOf([truck, trailer], [cargo(wall, 0, 60, 1000)]);
    const drawbar = group(ahead, 'p', 'front');
    expect(drawbar.axles).toBe(0);
    expect(drawbar.cargo).toBeGreaterThan(0);
    expect(group(ahead, 't', 'rear').load).toBeGreaterThan(group(empty, 't', 'rear').load);
    expect(group(ahead, 't', 'front').load).toBeLessThan(group(empty, 't', 'front').load);
    expect(ahead.gross).toBeCloseTo(tareOf(empty) + 1000, 6);
    expect(groupLabel(group(ahead, 'p', 'rear'))).toBe('Оси прицепа');

    // Behind it, the drawbar pulls the hitch up.
    const behind = axlesOf([truck, trailer], [cargo(wall, 290, 60, 1000)]);
    expect(group(behind, 'p', 'front').cargo).toBeLessThan(0);
    expect(group(behind, 't', 'rear').load).toBeLessThan(group(empty, 't', 'rear').load);
    expect(behind.gross).toBeCloseTo(tareOf(empty) + 1000, 6);
  });

  it('flags groups over their limit, lifted ones and a steering axle with too little load', () => {
    const semi = body('semi', 1360, 's');
    const fine = axlesOf([semi], [cargo(1360, 0, 1320, 20000)]);
    expect(fine.over || fine.lifted || fine.light).toBe(false);

    // 24 t at the doors: the tridem is overloaded.
    const back = axlesOf([semi], [cargo(1360, 760, 600, 24000)]);
    expect(group(back, 's', 'rear').over).toBe(true);
    expect(back.over).toBe(true);
    // At the front wall: the drive axle.
    const front = axlesOf([semi], [cargo(1360, 0, 400, 16000)]);
    expect(group(front, 's', 'tractorDrive').over).toBe(true);

    // A truck without the weight of its own and cargo behind the rear axle: the front axle comes up.
    const truck = body('truck', 800, 't', {
      maxLoad: 10000,
      chassis: { front: { tare: 0 }, rear: { tare: 0 } },
    });
    const lifted = axlesOf([truck], [cargo(800, 700, 100, 1000)]);
    expect(group(lifted, 't', 'front').lifted).toBe(true);
    expect(lifted.lifted).toBe(true);
    // A heavy load right over the rear axle leaves the steering axle too little of the truck.
    const ch = chassisOf(body('truck', 800, 'x', { maxLoad: 10000 }), true);
    const light = axlesOf([body('truck', 800, 't', { maxLoad: 10000 })], [cargo(800, ch.rear.x - 150, 300, 30000)]);
    expect(group(light, 't', 'front').light).toBe(true);
    expect(group(light, 't', 'front').lifted).toBe(false);
  });

  it('starts from typical figures and keeps what the user entered', () => {
    const semi = body('semi', 1360, 's');
    const typical = typicalChassis(semi, true);
    expect(typical.front).toEqual({ x: TYPICAL_RIG.kingpin, axles: 0, tare: TYPICAL_RIG.trailerTareKingpin });
    expect(typical.rear).toMatchObject({ x: TYPICAL_RIG.bogie, axles: 3, tare: TYPICAL_RIG.trailerTareAxles, max: 24000 });
    expect(typical.tractorDrive).toMatchObject({ x: TYPICAL_RIG.kingpin + TYPICAL_RIG.fifthWheelAhead, axles: 1, max: 11500 });
    // The calculator's tractor reaches the steering axle under the cab.
    expect(EURO_RIG.kingpin + EURO_RIG.fifthWheelAhead - EURO_RIG.wheelbase).toBe(TRACTOR_STEER_X);
    expect(typical.tractorFront!.x).toBe(TRACTOR_STEER_X);

    // The tractor follows the kingpin; two drive axles get the limit of a tandem.
    const patch: ChassisPatch = { front: { x: 200 }, tractorDrive: { axles: 2 }, rear: { tare: 6000 } };
    const own = chassisOf({ ...semi, chassis: patch }, true);
    expect(own.tractorDrive).toMatchObject({ x: 200 + EURO_RIG.fifthWheelAhead, axles: 2, max: 18000 });
    expect(own.tractorFront!.x).toBe(TRACTOR_STEER_X);

    // Resized: the typical positions follow the length, the user's empty weight stays.
    const short = chassisOf({ ...semi, dims: { ...semi.dims, l: 1000 }, chassis: patch }, true);
    expect(short.rear.tare).toBe(6000);
    expect(short.rear.x).toBeLessThan(typical.rear.x);
    // A limit of 0 is «not checked».
    const unchecked = chassisOf({ ...semi, chassis: { rear: { max: 0 } } }, true);
    expect(unchecked.rear.max).toBeUndefined();
    expect(axlesOf([{ ...semi, chassis: { rear: { max: 0 } } }], [cargo(1360, 760, 600, 30000)]).over).toBe(false);
    // Only a semi-trailer right behind the cab has a tractor.
    expect(chassisOf(semi, false).tractorFront).toBeNull();
  });

  it('gives the templates the axles of their vehicles', () => {
    for (const preset of VEHICLE_PRESETS) {
      preset.bodies.forEach((t, i) => {
        const b: CargoBody = { ...t, id: `b${i}` };
        const model = chassisModelOf(b);
        expect(model, preset.id).not.toBeNull();
        const ch = chassisOf(b, i === 0);
        // Exactly the template's figures: none had to be moved into the limits.
        expect(ch.front.x, preset.id).toBe(model!.front.x);
        expect(ch.rear, preset.id).toMatchObject({ x: model!.rear.x, axles: model!.rear.axles, tare: model!.rear.tare, max: model!.rear.max });
        if (i === 0 && b.kind === 'semi') {
          expect(ch.tractorDrive!.x, preset.id).toBe(model!.front.x + (model!.tractor?.lead ?? EURO_RIG.fifthWheelAhead));
        }
      });
    }
    // The euro template is the calculator's rig, the same as a typical semi-trailer of its size.
    expect(chassisOf({ ...body('semi', 1360, 's'), chassisModel: 'euro-tent' }, true)).toEqual(typicalChassis(body('semi', 1360, 's'), true));
    // A body resized far from its template, or of another kind, gets typical figures.
    expect(chassisModelOf({ ...body('truck', 440, 't'), chassisModel: 'van-7t' })).not.toBeNull();
    expect(chassisModelOf({ ...body('truck', 1200, 't'), chassisModel: 'van-7t' })).toBeNull();
    expect(chassisModelOf({ ...body('semi', 420, 't'), chassisModel: 'van-7t' })).toBeNull();
    expect(chassisModelOf({ ...body('truck', 420, 't'), chassisModel: 'unknown' })).toBeNull();
  });

  it('loads every template within its limits with its payload spread evenly, but a full 40-foot container', () => {
    for (const preset of VEHICLE_PRESETS) {
      const bodies = preset.bodies.map((t, i) => ({ ...t, id: `b${i}` }));
      const layout = computeLayout([vehicle(bodies)]);
      const items = layout.bodies.map((pb) => cargo(pb.box.max.x, 0, pb.body.dims.l, pb.body.maxLoad ?? 0));
      const a = computeStats(items, layout).vehicles[0].axles;
      const text = `${preset.id}: ${a.groups.map((g) => `${g.part} ${Math.round(g.load)}/${g.max ?? '-'}`).join(', ')}`;
      // 26,5 t in a 40-foot box is over the road limits: the drive axle shows it.
      if (preset.id === 'c40') expect(a.over, text).toBe(true);
      else expect(a.over || a.lifted || a.light, text).toBe(false);
    }
  });

  it('keeps the axles where a vehicle can have them', () => {
    const semi: CargoBody = { ...body('semi', 1360, 's'), chassisModel: 'euro-tent' };
    // A steering axle stays under the cab, whatever a plan says.
    expect(chassisOf({ ...semi, chassis: { tractorFront: { x: -2000 } } }, true).tractorFront!.x).toBe(TRACTOR_STEER_X);
    const truck: CargoBody = { ...body('truck', 800, 't'), chassisModel: 'truck-18t' };
    expect(chassisOf({ ...truck, chassis: { front: { x: -2000 } } }, true).front.x).toBe(TRUCK_STEER_X);

    // A kingpin, a rear group and a drive axle within reason.
    const wildBody: CargoBody = { ...semi, chassis: { front: { x: 2000 }, rear: { x: 3000 }, tractorDrive: { x: -500 } } };
    const wild = chassisOf(wildBody, true);
    const ranges = axleRanges(wildBody, true);
    expect(wild.front.x).toBe(300);
    expect(wild.rear.x).toBe(ranges.rear[1]);
    expect(wild.rear.x + AXLE_SPACING + WHEEL_RADIUS).toBeLessThan(1360);
    expect(wild.tractorDrive!.x).toBe(ranges.tractorDrive[0]);
    expect(ranges.tractorFront).toEqual([TRACTOR_STEER_X, TRACTOR_STEER_X]);

    // Weights within reason for the number of axles.
    const heavy = chassisOf({ ...truck, chassis: { rear: { tare: 60000, max: 60000 } } }, true);
    expect(heavy.rear.tare).toBe(axleWeightRange(1).tare);
    expect(heavy.rear.max).toBe(axleWeightRange(1).max);
    // A tractor has at most two drive axles.
    expect(chassisOf({ ...semi, chassis: { tractorDrive: { axles: 4 } } }, true).tractorDrive!.axles).toBe(1);
    expect(Object.keys(CHASSIS_MODELS).length).toBeGreaterThan(0);
  });

  it('cleans what a plan brings and edits one figure at a time', () => {
    expect(
      cleanChassis({ front: { x: Number.NaN, tare: 1234.6, axles: 2, junk: 1 }, rear: 'junk', tractorDrive: { axles: 7 }, other: {} }),
    ).toEqual({ front: { tare: 1235 } });
    expect(cleanChassis({ rear: { x: 99999, max: -5 } })).toEqual({ rear: { x: 3000, max: 0 } });
    expect(cleanChassis({})).toBeUndefined();
    expect(cleanChassis(null)).toBeUndefined();

    let patch = withChassisValue(undefined, 'rear', 'tare', 5000);
    expect(patch).toEqual({ rear: { tare: 5000 } });
    patch = withChassisValue(patch, 'rear', 'axles', 2);
    expect(patch).toEqual({ rear: { tare: 5000, axles: 2 } });
    patch = withChassisValue(patch, 'rear', 'tare', undefined);
    patch = withChassisValue(patch, 'rear', 'axles', undefined);
    expect(patch).toBeUndefined();

    // Junk inside a plan never reaches the numbers.
    const junk = body('truck', 800, 't', { chassis: { rear: { x: Number.NaN, tare: Infinity } } as unknown as ChassisPatch });
    const ch = chassisOf(junk, true);
    expect(Number.isFinite(ch.rear.x) && Number.isFinite(ch.rear.tare)).toBe(true);
  });

  it('works for every vehicle of a plan', () => {
    const layout = computeLayout([vehicle([body('semi', 1360, 'a')], 'v1'), vehicle([body('truck', 420, 'b', { maxLoad: 3000 })], 'v2')]);
    const truckWall = layout.bodies[1].box.max.x;
    const items = [cargo(truckWall, 0, 400, 2500, layout.vehicles[1].lane)];
    const stats = computeStats(items, layout);
    expect(stats.vehicles.map((v) => v.axles.vehicleId)).toEqual(['v1', 'v2']);
    expect(stats.vehicles[0].axles.cargo).toBe(0);
    expect(stats.vehicles[1].axles.cargo).toBeCloseTo(2500, 6);
    // A light truck gets limits of its own size, and a full one stays within them.
    expect(stats.vehicles[1].axles.over).toBe(false);
    const direct = vehicleAxleLoads(layout.vehicles[1], new Map());
    expect(direct.cargo).toBe(0);
  });
});
