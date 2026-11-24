import { useState } from 'react';
import { Link } from 'react-router';
import { Check, X } from 'lucide-react';
import { VEHICLE_PRESETS } from '@/core/presets';
import { USABLE_VOLUME, bodyCheck, boxesOnPallet, cargoTotals } from '@/core/tools/cargo';
import { PALLETS, palletLoad, type PalletKind } from '@/core/tools/pallets';
import type { StartSpec } from '@/core/tools/startPlan';
import { toolPage } from '@/lib/toolPages';
import {
  BigResult,
  CalcFrame,
  Chips,
  DataTable,
  FieldGroup,
  FloorPlan,
  GhostButton,
  Note,
  NumberField,
  Stats,
  TryIn3D,
  num,
  tonnes,
  useNumber,
  type ToolContent,
} from './kit';
import { word } from './PalletCalculator';
import { RowCard, useRows } from './rows';
import { ownBody, presetBody } from './start';

const path = (id: Parameters<typeof toolPage>[0]) => toolPage(id).path;
const BOX_FORMS: [string, string, string] = ['коробка', 'коробки', 'коробок'];

// ------------------------------------------------------------------ boxes on a pallet

const PALLET_DECKS: Array<{ value: PalletKind; label: string }> = [
  { value: 'eur', label: 'EUR 120 × 80' },
  { value: 'fin', label: 'FIN 120 × 100' },
  { value: 'half', label: '½ 80 × 60' },
];

function BoxesCalculator() {
  const [kind, setKind] = useState<PalletKind | null>('eur');
  const pl = useNumber(PALLETS.eur.l, 20, 300, 1);
  const pw = useNumber(PALLETS.eur.w, 20, 300, 1);
  const bl = useNumber(40, 1, 300, 1);
  const bw = useNumber(30, 1, 300, 1);
  const bh = useNumber(25, 1, 300, 1);
  const boxWeight = useNumber(8, 0, 2000, 2);
  const maxHeight = useNumber(180, 20, 400, 1);
  const maxWeight = useNumber(1000, 0, 5000, 0);
  const palletHeight = useNumber(14.4, 0, 50, 1);
  const palletWeight = useNumber(25, 0, 200, 1);
  const pick = (k: PalletKind) => {
    setKind(k);
    pl.put(PALLETS[k].l);
    pw.put(PALLETS[k].w);
  };
  const fields = [pl, pw, bl, bw, bh, boxWeight, maxHeight, maxWeight, palletHeight, palletWeight];
  const r = fields.every((f) => f.value !== null)
    ? boxesOnPallet({
        pallet: { l: pl.value!, w: pw.value! },
        palletHeight: palletHeight.value!,
        maxHeight: maxHeight.value!,
        maxWeight: maxWeight.value!,
        palletWeight: palletWeight.value!,
        box: { l: bl.value!, w: bw.value!, h: bh.value! },
        boxWeight: boxWeight.value!,
      })
    : null;

  const inputs = (
    <>
      <FieldGroup title="Паллета">
        <Chips label="Паллета" options={PALLET_DECKS} value={kind} onChange={pick} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Длина" unit="см" state={pl} onEdit={() => setKind(null)} />
          <NumberField label="Ширина" unit="см" state={pw} onEdit={() => setKind(null)} />
          <NumberField label="Высота поддона" unit="см" state={palletHeight} />
          <NumberField label="Вес поддона" unit="кг" state={palletWeight} />
        </div>
      </FieldGroup>
      <FieldGroup title="Коробка" hint="Коробки стоят верхом вверх и не выступают за края поддона.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          <NumberField label="Длина" unit="см" state={bl} />
          <NumberField label="Ширина" unit="см" state={bw} />
          <NumberField label="Высота" unit="см" state={bh} />
          <NumberField label="Вес" unit="кг" state={boxWeight} />
        </div>
      </FieldGroup>
      <FieldGroup title="Ограничения" hint="Высота — вместе с поддоном. Вес — всей паллеты с грузом; 0 — не проверять.">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Высота не больше" unit="см" state={maxHeight} />
          <NumberField label="Вес не больше" unit="кг" state={maxWeight} />
        </div>
      </FieldGroup>
    </>
  );

  let results;
  if (!r) results = <Note warn>Проверьте значения: размеры — в сантиметрах, вес — в килограммах.</Note>;
  else if (r.perLayer === 0) results = <Note warn>Коробка больше поддона: она не встаёт на паллету без свеса.</Note>;
  else if (r.layers === 0) results = <Note warn>Коробка выше допустимой высоты паллеты.</Note>;
  else {
    const byWeight = r.byWeight !== null && r.byWeight < r.bySpace;
    results = (
      <div className="space-y-6">
        <BigResult
          value={num(r.total, 0)}
          label={word(r.total, BOX_FORMS)}
          note={`${r.perLayer} в слое × ${r.layers} ${word(r.layers, ['слой', 'слоя', 'слоёв'])}${byWeight ? ', но вес ограничивает' : ''}.`}
        />
        <FloorPlan floor={{ l: pl.value!, w: pw.value! }} spots={r.layer.spots} label={`Слой: ${r.perLayer} коробок на поддоне`} className="mx-auto max-w-md" />
        <Stats
          items={[
            { label: 'В слое', value: num(r.perLayer, 0) },
            { label: 'Слоёв', value: num(r.layers, 0) },
            { label: 'Высота паллеты', value: `${num(r.height, 1)} см` },
            { label: 'Вес паллеты', value: tonnes(r.weight) },
            r.byWeight !== null && { label: 'По весу — не больше', value: num(r.byWeight, 0) },
          ]}
        />
        {byWeight && (
          <Note warn>
            По высоте встаёт {r.bySpace} {word(r.bySpace, BOX_FORMS)}, но с ними паллета тяжелее {tonnes(maxWeight.value!)}: берём {r.total}.
          </Note>
        )}
        <TryIn3D title="Паллеты — в машину" start={palletsInTent(pl.value!, pw.value!, r.height, r.weight)}>
          Соберите паллеты с этим весом и высотой в Loader3D и разложите их в фуре или контейнере автозагрузкой.
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}

/** A tilt trailer full of the pallets just made (as many as stand and as the payload carries). */
function palletsInTent(l: number, w: number, h: number, weight: number): StartSpec {
  const body = presetBody('tent');
  const load = palletLoad({ ...body.dims, maxLoad: body.maxLoad }, { dims: { l, w, h }, weight, stackable: false });
  return {
    name: `Тент 13,6 м — ${load.total} ${word(load.total, ['паллета', 'паллеты', 'паллет'])} с коробками`,
    body,
    cargo: [{ name: 'Паллета с коробками', dims: { l, w, h }, weight, count: load.total, lay: { gap: 0, stackable: false } }],
  };
}

const boxExamples: Array<[number, number, number]> = [
  [60, 40, 40],
  [40, 30, 30],
  [40, 30, 20],
  [30, 20, 20],
  [60, 40, 25],
];

export const BOXES_ON_PALLET: ToolContent = {
  lead: (
    <>
      <p>
        На европаллету 120 × 80 см встаёт <strong>4 коробки 60 × 40</strong> или <strong>8 коробок 40 × 30</strong> в слое. Сколько
        слоёв — решает допустимая высота паллеты: обычно 1,8 м вместе с поддоном, — и вес.
      </p>
      <p>Введите размеры своей коробки: калькулятор подберёт раскладку слоя и посчитает высоту и вес готовой паллеты.</p>
    </>
  ),
  calculator: <BoxesCalculator />,
  article: (
    <>
      <h2>Как считается</h2>
      <p>
        Слой — сколько коробок встаёт на поддон без свеса: калькулятор пробует коробки вдоль и поперёк и их сочетания. Слоёв — сколько
        раз высота коробки укладывается в допустимую высоту минус поддон (европаллета — 14,4 см). Потом проверяется вес: коробки,
        поддон, и всё вместе — не тяжелее предела.
      </p>
      <DataTable
        caption="Коробки на европаллете при высоте паллеты до 1,8 м"
        head={['Коробка, см', 'В слое', 'Слоёв', 'Всего']}
        rows={boxExamples.map(([l, w, h]) => {
          const r = boxesOnPallet({ pallet: PALLETS.eur, palletHeight: 14.4, maxHeight: 180, box: { l, w, h } });
          return [`${l} × ${w} × ${h}`, String(r.perLayer), String(r.layers), String(r.total)];
        })}
        note="Без свеса и без ограничения по весу. В реальной укладке слои часто чередуют (перевязка) — число коробок в слое при этом не меняется."
      />
      <h2>Высота и вес паллеты</h2>
      <p>
        Предел высоты задаёт склад (стеллаж), машина и сам груз: в тент высотой 2,7 м паллеты 1,8 м встают в один ярус, а паллеты
        до 1,35 м — в два, если груз выдерживает. Вес паллеты ограничивают поддон, погрузчик и стеллаж — узнайте их у склада.
      </p>
      <p>
        Готовые паллеты дальше — в машину: {<Link to={path('pallets-truck')}>сколько паллет в еврофуре</Link>},{' '}
        {<Link to={path('pallets-container')}>в контейнере</Link> } или {<Link to={path('pallets-gazelle')}>в газели</Link>}.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Сколько коробок 60 × 40 помещается на европаллету?',
      a: '4 в слое: 2 × 2 на поддоне 120 × 80 см. При высоте коробки 40 см и паллеты до 1,8 м — 4 слоя, 16 коробок.',
    },
    {
      q: 'Как посчитать количество коробок на паллете?',
      a: 'Найдите, сколько коробок встаёт в слой без свеса (пробуя их вдоль и поперёк), затем сколько слоёв помещается в допустимую высоту минус высота поддона, и перемножьте. Проверьте вес.',
    },
    {
      q: 'Какая высота паллеты допустима?',
      a: 'Её задают склад и перевозчик; часто — до 1,8 м вместе с поддоном. Для двух ярусов в тенте высотой 2,7 м — до 1,35 м.',
    },
  ],
  related: ['pallets-truck', 'pallets-container', 'pallets-gazelle', 'cargo-volume', 'ldm', 'loading-plan'],
  cta: {
    title: 'От коробки — до загруженной машины',
    text: 'В Loader3D паллеты и коробки с весом раскладываются в кузове в 3D, а склад и водитель получают PDF-схему погрузки.',
  },
};

// ------------------------------------------------------------------ cargo volume

type PlaceKey = 'l' | 'w' | 'h' | 'count' | 'weight';
const PLACE_LIMITS: Record<PlaceKey, [number, number]> = { l: [1, 3000], w: [1, 400], h: [1, 450], count: [0, 100000], weight: [0, 30000] };
const VOLUME_PRESETS = ['van', 'truck10', 'tent', 'mega', 'c20', 'c40'];

function VolumeCalculator() {
  const rows = useRows<PlaceKey>(
    [
      { l: 120, w: 80, h: 150, count: 12, weight: 350 },
      { l: 60, w: 40, h: 40, count: 40, weight: 15 },
    ],
    { l: 60, w: 40, h: 40, count: 1, weight: 0 },
    1,
  );
  const values = rows.values(PLACE_LIMITS);
  const totals = values ? cargoTotals(values.map((v) => ({ dims: { l: v.l, w: v.w, h: v.h }, count: v.count, weight: v.weight }))) : null;

  const inputs = (
    <FieldGroup title="Места груза" hint="Размеры одного места в сантиметрах, вес одного — в килограммах.">
      {rows.rows.map((row, i) => (
        <RowCard key={row.key} n={i + 1} canRemove={rows.rows.length > 1} onRemove={() => rows.remove(row.key)}>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Длина" unit="см" state={rows.field(row, 'l', ...PLACE_LIMITS.l)} />
            <NumberField label="Ширина" unit="см" state={rows.field(row, 'w', ...PLACE_LIMITS.w)} />
            <NumberField label="Высота" unit="см" state={rows.field(row, 'h', ...PLACE_LIMITS.h)} />
            <NumberField label="Количество" unit="шт" state={rows.field(row, 'count', ...PLACE_LIMITS.count)} />
            <NumberField label="Вес одного" unit="кг" state={rows.field(row, 'weight', ...PLACE_LIMITS.weight)} className="col-span-2" />
          </div>
        </RowCard>
      ))}
      <GhostButton onClick={rows.add}>Добавить места</GhostButton>
    </FieldGroup>
  );

  let results;
  if (!totals) results = <Note warn>Проверьте значения: размеры — в сантиметрах, количество — целое число.</Note>;
  else if (totals.places === 0) results = <Note>Добавьте места с размерами и количеством.</Note>;
  else {
    const checks = VOLUME_PRESETS.map((id) => {
      const p = VEHICLE_PRESETS.find((x) => x.id === id)!;
      const b = p.bodies[0];
      return { name: p.name, body: b, check: bodyCheck(totals, { ...b.dims, maxLoad: b.maxLoad }) };
    });
    // The plan of «Попробовать в 3D»: the smallest vehicle that takes it, else a tilt trailer.
    const bodyFor = checks.find((c) => c.check.fits) ?? checks.find((c) => c.name.startsWith('Еврофура'))!;
    results = (
      <div className="space-y-6">
        <BigResult
          value={num(totals.volume / 1e6, 2)}
          label="м³"
          note={`${totals.places} ${word(totals.places, ['место', 'места', 'мест'])}${totals.weight > 0 ? `, ${tonnes(totals.weight)}` : ''}.`}
        />
        <Stats
          items={[
            { label: 'Объём', value: `${num(totals.volume / 1e6, 2)} м³` },
            { label: 'Вес', value: totals.weight > 0 ? tonnes(totals.weight) : '—' },
            { label: 'Плотность', value: totals.weight > 0 ? `${num(totals.weight / (totals.volume / 1e6), 0)} кг/м³` : '—' },
          ]}
        />
        <div>
          <p className="text-[13px] text-site-faint">Какая машина возьмёт — по объёму и весу</p>
          <ul className="mt-2 divide-y divide-site-line rounded-lg border border-site-line text-[14px]">
            {checks.map(({ name, check }) => (
              <li key={name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                {check.fits ? <Check className="size-4 text-site-fg" aria-label="подходит" /> : <X className="size-4 text-site-faint" aria-label="не подходит" />}
                <span className={check.fits ? 'text-site-fg' : 'text-site-faint'}>{name}</span>
                <span className="ml-auto font-geist-mono text-[12px] text-site-muted tabular-nums">
                  объём {num(check.volumeShare * 100, 0)}%{check.weightShare !== null && ` · вес ${num(check.weightShare * 100, 0)}%`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-site-faint">
            «Подходит» — груз занимает не больше {num(USABLE_VOLUME * 100, 0)}% объёма, не тяжелее грузоподъёмности и самое длинное место
            короче кузова. Встанет ли он на самом деле, покажет раскладка.
          </p>
        </div>
        <TryIn3D
          title="Проверьте раскладкой, а не кубометрами"
          start={{
            name: `${bodyFor.name} — ${totals.places} ${word(totals.places, ['место', 'места', 'мест'])}`,
            body: ownBody(bodyFor.name, bodyFor.body.dims, bodyFor.body.maxLoad, bodyFor.body.kind, bodyFor.body.chassisModel),
            cargo: values!
              .filter((v) => v.count > 0)
              .map((v, i) => ({
                name: `Место ${i + 1}`,
                dims: { l: v.l, w: v.w, h: v.h },
                weight: v.weight,
                count: v.count,
              })),
          }}
        >
          В Loader3D места с размерами и весом встают в кузов в 3D: сразу видно, влезает ли груз, где центр тяжести и нет ли перегруза.
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}

const tent = VEHICLE_PRESETS.find((p) => p.id === 'tent')!.bodies[0];
const tentVolume = (tent.dims.l * tent.dims.w * tent.dims.h) / 1e6;

export const CARGO_VOLUME: ToolContent = {
  lead: (
    <>
      <p>
        Объём груза — сумма объёмов мест: <strong>длина × ширина × высота × количество</strong>, в метрах. Коробка 60 × 40 × 40 см —
        0,096 м³, европаллета высотой 1,5 м — 1,44 м³.
      </p>
      <p>
        Добавьте свои места — калькулятор посчитает кубометры, вес и плотность и покажет, какой машине груз по силам по объёму и
        грузоподъёмности.
      </p>
    </>
  ),
  calculator: <VolumeCalculator />,
  article: (
    <>
      <h2>Почему кубометров мало</h2>
      <p>
        Еврофура — около {num(tentVolume, 0)} м³, но {num(tentVolume, 0)} м³ коробок в неё не влезет: места разной высоты оставляют
        пустоты, паллеты не ставят под самую крышу, а между рядами нужен зазор. Для смешанного груза считайте на{' '}
        {num(USABLE_VOLUME * 100, 0)}% объёма кузова, а паллеты — по паллетоместам: {<Link to={path('pallets-truck')}>в еврофуре</Link>},{' '}
        {<Link to={path('pallets-container')}>в контейнере</Link>}, {<Link to={path('pallets-gazelle')}>в газели</Link>}.
      </p>
      <h2>Вес и плотность</h2>
      <p>
        Плотный груз (металл, плитка, вода) упирается в грузоподъёмность задолго до того, как кончится место: еврофура в 20 т
        заполнена по весу грузом плотнее примерно {num(20000 / tentVolume, 0)} кг/м³. Лёгкий — наоборот, по объёму. Для сборных
        грузов перевозчики считают оплачиваемый вес по кубометрам или {<Link to={path('ldm')}>погрузочным метрам (LDM)</Link>}.
      </p>
      <DataTable
        head={['Место', 'Размер, см', 'Объём одного']}
        rows={[
          ['Коробка', '60 × 40 × 40', '0,096 м³'],
          ['Коробка', '40 × 30 × 30', '0,036 м³'],
          ['Европаллета с грузом', '120 × 80 × 150', '1,44 м³'],
          ['Финпаллета с грузом', '120 × 100 × 150', '1,8 м³'],
          ['IBC-куб', '120 × 100 × 116', '1,39 м³'],
        ]}
      />
    </>
  ),
  faq: [
    {
      q: 'Как посчитать объём груза в кубометрах?',
      a: 'Перемножьте длину, ширину и высоту одного места в метрах и умножьте на количество мест; для разных мест — сложите. Коробка 0,6 × 0,4 × 0,4 м — 0,096 м³.',
    },
    {
      q: 'Сколько кубов груза влезет в еврофуру?',
      a: `Объём еврофуры — около ${num(tentVolume, 0)} м³, но груз разных размеров не заполняет его целиком: для смешанного груза считайте около ${num(USABLE_VOLUME * 100, 0)}%, а паллеты — по паллетоместам (33 европаллеты).`,
    },
    {
      q: 'Как перевести сантиметры в кубометры?',
      a: 'Перемножьте размеры в сантиметрах и разделите на 1 000 000: 60 × 40 × 40 = 96 000 см³ = 0,096 м³.',
    },
  ],
  related: ['truck-dimensions', 'container-dimensions', 'pallets-truck', 'pallets-gazelle', 'ldm', 'loading-plan'],
  cta: {
    title: 'Кубометры — это оценка. Раскладка — ответ',
    text: 'В Loader3D груз с размерами и весом встаёт в кузов в 3D: видно, что влезает, где центр тяжести и сколько осталось места.',
  },
};
