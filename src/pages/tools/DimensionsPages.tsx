import { useState } from 'react';
import { Link } from 'react-router';
import { VEHICLE_PRESETS } from '@/core/presets';
import type { Dims } from '@/core/types';
import { bestFit } from '@/core/tools/floorFit';
import { PALLETS } from '@/core/tools/pallets';
import type { BodyKind } from '@/core/types';
import { toolPage } from '@/lib/toolPages';
import { ownBody, presetChassis } from './start';
import { BigResult, CalcFrame, Chips, DataTable, FieldGroup, FloorPlan, Note, NumberField, Stats, TryIn3D, num, tonnes, useNumber, type ToolContent } from './kit';

/** Reference pages of the bodies' sizes, with a calculator of the volume and floor places of any body. */

interface DimsChoice {
  id: string;
  label: string;
  dims: Dims;
  maxLoad?: number;
  kind?: BodyKind;
  /** Name of the body in the plan of «Попробовать в 3D» (missing — the label). */
  name?: string;
  /** The axles of the editor's template of this vehicle (core/chassis.ts CHASSIS_MODELS); missing — typical ones. */
  chassisModel?: string;
}

function BodyCalculator({ choices, initial }: { choices: readonly DimsChoice[]; initial: string }) {
  const first = choices.find((c) => c.id === initial) ?? choices[0];
  const [choice, setChoice] = useState<string | null>(first.id);
  const l = useNumber(first.dims.l / 100, 1, 25, 3);
  const w = useNumber(first.dims.w / 100, 1, 4, 3);
  const h = useNumber(first.dims.h / 100, 0.5, 4.5, 3);
  const pick = (id: string) => {
    const c = choices.find((x) => x.id === id)!;
    setChoice(id);
    l.put(c.dims.l / 100);
    w.put(c.dims.w / 100);
    h.put(c.dims.h / 100);
  };
  const edit = () => setChoice(null);
  const ok = l.value !== null && w.value !== null && h.value !== null;
  const floor = ok ? { l: l.value! * 100, w: w.value! * 100 } : null;
  const eur = floor ? bestFit(floor, PALLETS.eur) : null;
  const chosen = choices.find((c) => c.id === choice);
  const fin = floor ? bestFit(floor, PALLETS.fin) : null;

  const inputs = (
    <FieldGroup title="Кузов, внутренние размеры">
      <Chips label="Кузов" options={choices.map((c) => ({ value: c.id, label: c.label }))} value={choice} onChange={pick} />
      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Длина" unit="м" state={l} onEdit={edit} />
        <NumberField label="Ширина" unit="м" state={w} onEdit={edit} />
        <NumberField label="Высота" unit="м" state={h} onEdit={edit} />
      </div>
    </FieldGroup>
  );
  const results =
    !ok || !floor || !eur || !fin ? (
      <Note warn>Проверьте размеры: длина — от 1 до 25 м, ширина — до 4 м, высота — до 4,5 м.</Note>
    ) : (
      <div className="space-y-6">
        <BigResult
          value={num(l.value! * w.value! * h.value!, 1)}
          label="м³"
          note={`${num(l.value!, 2)} × ${num(w.value!, 2)} × ${num(h.value!, 2)} м внутри; площадь пола — ${num(l.value! * w.value!, 1)} м².`}
        />
        <FloorPlan floor={floor} spots={eur.spots} ends={['двери', 'передняя стенка']} label={`Вид сверху: ${eur.count} европаллет на полу`} />
        <Stats
          items={[
            { label: 'Европаллет на полу', value: num(eur.count, 0) },
            { label: 'Финпаллет на полу', value: num(fin.count, 0) },
            { label: 'Площадь пола', value: `${num(l.value! * w.value!, 1)} м²` },
          ]}
        />
        <TryIn3D
          title="Свой кузов — в 3D"
          start={{
            name: chosen?.name ?? chosen?.label ?? 'Свой кузов',
            body: ownBody(
              chosen?.name ?? chosen?.label ?? 'Кузов',
              { l: floor.l, w: floor.w, h: h.value! * 100 },
              chosen?.maxLoad,
              chosen?.kind,
              chosen?.chassisModel,
            ),
            cargo: [],
          }}
        >
          Задайте эти размеры в Loader3D и разложите груз: с физикой, весом, центром тяжести и PDF-схемой.
        </TryIn3D>
      </div>
    );
  return <CalcFrame inputs={inputs} results={results} />;
}

const m = (cm: number) => num(cm / 100, 2);
const volume = (d: Dims) => (d.l * d.w * d.h) / 1e6;
const places = (d: Dims) => [bestFit(d, PALLETS.eur).count, bestFit(d, PALLETS.fin).count];
const path = (id: Parameters<typeof toolPage>[0]) => toolPage(id).path;

// ------------------------------------------------------------------ trucks

const TRUCK_IDS = ['tent', 'mega', 'reefer', 'truck10', 'van'];
const truckPresets = TRUCK_IDS.map((id) => VEHICLE_PRESETS.find((p) => p.id === id)!);
const truckChoice = (index: number, label: string, name: string): DimsChoice => {
  const b = truckPresets[index].bodies[0];
  return { id: TRUCK_IDS[index], label, name, dims: b.dims, maxLoad: b.maxLoad, kind: 'semi', chassisModel: b.chassisModel };
};
const TRUCK_CHOICES: DimsChoice[] = [
  truckChoice(0, 'Тент', 'Тент 13,6 м'),
  truckChoice(1, 'Мега', 'Мега-трейлер 13,6 м'),
  truckChoice(2, 'Реф', 'Рефрижератор 13,4 м'),
];
const tent = truckPresets[0].bodies[0];
const mega = truckPresets[1].bodies[0];
const reefer = truckPresets[2].bodies[0];
const jumbo = VEHICLE_PRESETS.find((p) => p.id === 'jumbo')!;

const truckRows = [
  ...truckPresets.map((p) => {
    const b = p.bodies[0];
    const [eur, fin] = places(b.dims);
    return [p.name, `${m(b.dims.l)} × ${m(b.dims.w)} × ${m(b.dims.h)}`, `${num(volume(b.dims), 1)} м³`, `${num((b.dims.l * b.dims.w) / 1e4, 1)} м²`, tonnes(b.maxLoad ?? 0), String(eur), String(fin)];
  }),
  (() => {
    const v = jumbo.bodies.reduce((s, b) => s + volume(b.dims), 0);
    const area = jumbo.bodies.reduce((s, b) => s + (b.dims.l * b.dims.w) / 1e4, 0);
    const [eur, fin] = jumbo.bodies.map((b) => places(b.dims)).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
    return [jumbo.name, '7,7 + 8,2 × 2,45 × 3', `${num(v, 1)} м³`, `${num(area, 1)} м²`, tonnes(jumbo.bodies.reduce((s, b) => s + (b.maxLoad ?? 0), 0)), String(eur), String(fin)];
  })(),
];

export const TRUCK_DIMENSIONS: ToolContent = {
  lead: (
    <>
      <p>
        Внутри тентованной еврофуры — <strong>13,6 × 2,45 × 2,7 м</strong>: около <strong>{num(volume(tent.dims), 0)} м³</strong>,
        33 европаллеты на полу и {tonnes(tent.maxLoad ?? 0)} грузоподъёмности. Мега-трейлер выше — 3 м, около {num(volume(mega.dims), 0)} м³;
        рефрижератор — {m(reefer.dims.l)} × {m(reefer.dims.w)} × {m(reefer.dims.h)} м, около {num(volume(reefer.dims), 0)} м³.
      </p>
      <p>Ниже — таблица кузовов и калькулятор объёма для своих размеров.</p>
    </>
  ),
  calculator: <BodyCalculator choices={TRUCK_CHOICES} initial="tent" />,
  article: (
    <>
      <h2>Размеры кузовов</h2>
      <DataTable
        head={['Кузов', 'Внутри, Д × Ш × В, м', 'Объём', 'Пол', 'Грузоподъёмность', 'EUR', 'FIN']}
        rows={truckRows}
        note="Типичные внутренние размеры — те же, что в шаблонах редактора Loader3D. Паллетоместа — на полу в один ярус, вплотную. Размеры конкретной машины отличаются на несколько сантиметров: тент, стойки и колёсные ниши съедают ширину."
      />
      <h2>Тент, мега, реф</h2>
      <p>
        <strong>Тентованный полуприцеп</strong> — самый частый: 13,6 м в длину, 2,45–2,48 м в ширину, 2,6–2,7 м в высоту. Грузят
        его сзади, сбоку и сверху — тент сдвигается.
      </p>
      <p>
        <strong>Мега-трейлер</strong> (мега, jumbo-полуприцеп) — тот же пол, но высота внутри до 3 м за счёт низкой седельной
        сцепки и колёс меньшего диаметра. Подходит для лёгкого объёмного груза и паллет в два яруса.
      </p>
      <p>
        <strong>Рефрижератор</strong> — изотермический кузов с холодильной установкой: стенки толще, поэтому внутри он уже и ниже
        тента — около 13,4 × 2,46 × 2,6 м.
      </p>
      <h2>Объём и что в него влезет</h2>
      <p>
        Объём кузова — это потолок, а не обещание: коробки разных размеров никогда не заполняют его целиком. Для смешанного груза
        считайте на 80–85% объёма, а паллеты — по паллетоместам. Посчитайте{' '}
        {<Link to={path('cargo-volume')}>объём своего груза</Link>} или{' '}
        {<Link to={path('pallets-truck')}>сколько паллет встанет в фуру</Link>}.
      </p>
      <p>
        Снаружи автопоезд по общим правилам — не шире 2,55 м (рефрижератор — 2,6 м), не выше 4 м и не длиннее 20 м; больше — только
        с разрешением на перевозку крупногабаритного груза.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Какие размеры у еврофуры внутри?',
      a: `Обычно 13,6 × 2,45 × 2,7 м. Объём — около ${num(volume(tent.dims), 0)} м³, площадь пола — ${num((tent.dims.l * tent.dims.w) / 1e4, 1)} м², 33 европаллеты в один ярус.`,
    },
    {
      q: 'Сколько кубов в еврофуре?',
      a: `Тентованная еврофура 13,6 × 2,45 × 2,7 м — около ${num(volume(tent.dims), 0)} м³, мега-трейлер высотой 3 м — около ${num(volume(mega.dims), 0)} м³, рефрижератор — около ${num(volume(reefer.dims), 0)} м³.`,
    },
    {
      q: 'Чем мега-трейлер отличается от обычной фуры?',
      a: 'Высотой: внутри до 3 м против 2,7 м у обычного тента при той же длине 13,6 м. Объём больше, и паллеты до 1,5 м встают в два яруса.',
    },
    {
      q: 'Какая грузоподъёмность у еврофуры?',
      a: `Обычно около ${tonnes(tent.maxLoad ?? 0)}; точная — в документах полуприцепа. Тяжёлые паллеты упираются в вес раньше, чем заканчивается место.`,
    },
  ],
  related: ['pallets-truck', 'container-dimensions', 'cargo-volume', 'axle-loads', 'ldm', 'loading-plan'],
  cta: {
    title: 'Размеры есть — загрузите машину',
    text: 'В Loader3D готовые шаблоны тента, меги, рефа и сцепки — или свой кузов. Груз встаёт с физикой, а вес и центр тяжести считаются сами.',
  },
};

// ------------------------------------------------------------------ containers

interface ContainerSpec extends DimsChoice {
  outside: string;
  door: string;
  tare: string;
  payload: string;
}

const CONTAINERS: ContainerSpec[] = [
  {
    id: 'c20',
    label: '20′',
    name: 'Контейнер 20′',
    kind: 'semi',
    maxLoad: 28200,
    dims: VEHICLE_PRESETS.find((p) => p.id === 'c20')!.bodies[0].dims,
    chassisModel: presetChassis('c20'),
    outside: '6,06 × 2,44 × 2,59',
    door: '2,34 × 2,28',
    tare: '≈ 2,2 т',
    payload: '21,7–28,2 т',
  },
  {
    id: 'c40',
    label: '40′',
    name: 'Контейнер 40′',
    kind: 'semi',
    maxLoad: 26700,
    dims: { l: 1203, w: 235, h: 239 },
    chassisModel: presetChassis('c40'),
    outside: '12,19 × 2,44 × 2,59',
    door: '2,34 × 2,28',
    tare: '≈ 3,7 т',
    payload: '≈ 26,7 т',
  },
  {
    id: 'c40hc',
    label: '40′ HC',
    name: 'Контейнер 40′ HC',
    kind: 'semi',
    maxLoad: 26500,
    dims: VEHICLE_PRESETS.find((p) => p.id === 'c40')!.bodies[0].dims,
    chassisModel: presetChassis('c40'),
    outside: '12,19 × 2,44 × 2,90',
    door: '2,34 × 2,58',
    tare: '≈ 3,9 т',
    payload: '≈ 26,5 т',
  },
];

const containerRows = CONTAINERS.map((c) => {
  const [eur, fin] = places(c.dims);
  return [`Контейнер ${c.label}`, `${m(c.dims.l)} × ${m(c.dims.w)} × ${m(c.dims.h)}`, `${num(volume(c.dims), 1)} м³`, c.outside, c.door, String(eur), String(fin)];
});
const weightRows = CONTAINERS.map((c) => [`Контейнер ${c.label}`, c.tare, c.payload, `${num(volume(c.dims), 1)} м³`]);
const [c20, c40, c40hc] = CONTAINERS;

export const CONTAINER_DIMENSIONS: ToolContent = {
  lead: (
    <>
      <p>
        Внутри 20-футового контейнера — <strong>{m(c20.dims.l)} × {m(c20.dims.w)} × {m(c20.dims.h)} м</strong>, около{' '}
        <strong>{num(volume(c20.dims), 0)} м³</strong>. 40-футовый — {m(c40.dims.l)} × {m(c40.dims.w)} × {m(c40.dims.h)} м, около{' '}
        {num(volume(c40.dims), 0)} м³; 40′ HC выше на 30 см — около {num(volume(c40hc.dims), 0)} м³.
      </p>
      <p>Ниже — размеры внутри и снаружи, двери, вес и паллетоместа, и калькулятор объёма для своих размеров.</p>
    </>
  ),
  calculator: <BodyCalculator choices={CONTAINERS} initial="c20" />,
  article: (
    <>
      <h2>Размеры контейнеров</h2>
      <DataTable
        head={['Контейнер', 'Внутри, Д × Ш × В, м', 'Объём', 'Снаружи, м', 'Двери, Ш × В, м', 'EUR', 'FIN']}
        rows={containerRows}
        note="Типичные размеры стальных контейнеров общего назначения; у разных производителей внутренние размеры отличаются на сантиметры. Паллетоместа — на полу в один ярус, вплотную, с раскладкой ёлочкой."
      />
      <h2>Вес</h2>
      <DataTable
        head={['Контейнер', 'Собственный вес', 'Грузоподъёмность', 'Объём']}
        rows={weightRows}
        note="Точные значения — на табличке CSC на двери контейнера: масса брутто, тара и полезная нагрузка."
      />
      <p>
        На дороге ограничивает ещё и машина: разрешённая масса автопоезда и нагрузка на оси. Тяжёлый груз в 20-футовом контейнере
        часто упирается в них раньше, чем в грузоподъёмность контейнера, — проверьте в{' '}
        {<Link to={path('axle-loads')}>калькуляторе нагрузки на оси</Link>}.
      </p>
      <h2>20′, 40′ или 40′ HC</h2>
      <p>
        <strong>20-футовый</strong> берут под тяжёлый плотный груз: металл, плитку, жидкости — он заполняется по весу раньше, чем по
        объёму. <strong>40-футовый</strong> — под объёмный и лёгкий. <strong>40′ HC</strong> (high cube) на 30 см выше: мест на полу
        столько же, зато встаёт второй ярус паллет высотой до 1,34 м.
      </p>
      <p>
        Сколько паллет встанет в каждый — с ярусами и весом — посчитайте в {<Link to={path('pallets-container')}>калькуляторе паллет в контейнере</Link>}.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Какие внутренние размеры у 20-футового контейнера?',
      a: `Около ${m(c20.dims.l)} × ${m(c20.dims.w)} × ${m(c20.dims.h)} м, объём — около ${num(volume(c20.dims), 0)} м³. Снаружи — 6,06 × 2,44 × 2,59 м.`,
    },
    {
      q: 'Какой объём у 40-футового контейнера?',
      a: `Обычный 40′ — около ${num(volume(c40.dims), 0)} м³ (${m(c40.dims.l)} × ${m(c40.dims.w)} × ${m(c40.dims.h)} м внутри), 40′ HC — около ${num(volume(c40hc.dims), 0)} м³ за счёт высоты ${m(c40hc.dims.h)} м.`,
    },
    {
      q: 'Что значит HC у контейнера?',
      a: 'High cube — «высокий куб»: контейнер на 30 см выше обычного, 2,90 м снаружи и около 2,69 м внутри. Длина и ширина те же.',
    },
    {
      q: 'Сколько паллет помещается в 20- и 40-футовый контейнер?',
      a: `${places(c20.dims)[0]} европаллет в 20′ и ${places(c40.dims)[0]} в 40′ в один ярус — раскладкой ёлочкой: ряд поперёк рядом с рядом вдоль.`,
    },
  ],
  related: ['pallets-container', 'truck-dimensions', 'cargo-volume', 'boxes-on-pallet', 'axle-loads', 'ldm'],
  cta: {
    title: 'Загрузите контейнер до отправки',
    text: 'Шаблоны 20′ и 40′ HC в Loader3D: раскладка паллет и коробок в 3D, вес и центр тяжести, схема погрузки в PDF.',
  },
};
