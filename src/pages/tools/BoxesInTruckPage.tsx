import { useState } from 'react';
import { Link } from 'react-router';
import { boxesInBody } from '@/core/tools/cargo';
import { START_MAX_ITEMS, type StartSpec } from '@/core/tools/startPlan';
import { toolPage } from '@/lib/toolPages';
import {
  BigResult,
  CalcFrame,
  CheckField,
  Chips,
  DataTable,
  FieldGroup,
  FloorPlan,
  Note,
  NumberField,
  Stats,
  TryIn3D,
  num,
  tonnes,
  useNumber,
  type ToolContent,
} from './kit';
import { word, type BodyChoice } from './PalletCalculator';
import { GAZELLES, LORRIES } from './PalletPages';
import { ownBody } from './start';

/** «How many boxes fit in a vehicle»: equal boxes loose in a body, without pallets (core/tools/cargo.ts boxesInBody). */

const path = (id: Parameters<typeof toolPage>[0]) => toolPage(id).path;
const BOX_FORMS: [string, string, string] = ['коробка', 'коробки', 'коробок'];
const LAYER_FORMS: [string, string, string] = ['слой', 'слоя', 'слоёв'];

/** Bodies of the calculator: two Gazelles, the 5- and 10-tonne trucks and a tilt semi-trailer. */
const BOX_BODIES: BodyChoice[] = [
  { ...GAZELLES[0], label: 'Газель 3 м' },
  { ...GAZELLES[2], label: 'Газель 4,2 м' },
  { ...LORRIES[1], label: '5 т' },
  { ...LORRIES[2], label: '10 т' },
  { ...LORRIES[3], label: 'Фура 13,6 м' },
];

function BoxesInTruckCalculator() {
  const first = BOX_BODIES[1];
  const [bodyId, setBodyId] = useState<string | null>(first.id);
  const length = useNumber(first.dims.l / 100, 1, 25, 2);
  const width = useNumber(first.dims.w / 100, 1, 4, 2);
  const height = useNumber(first.dims.h / 100, 0.5, 4.5, 2);
  const payload = useNumber(first.maxLoad / 1000, 0, 60, 2);
  const bl = useNumber(60, 1, 300, 1);
  const bw = useNumber(40, 1, 300, 1);
  const bh = useNumber(40, 1, 300, 1);
  const boxWeight = useNumber(15, 0, 2000, 2);
  const [canTip, setCanTip] = useState(false);

  const choose = (id: string) => {
    const b = BOX_BODIES.find((x) => x.id === id)!;
    setBodyId(id);
    length.put(b.dims.l / 100);
    width.put(b.dims.w / 100);
    height.put(b.dims.h / 100);
    payload.put(b.maxLoad / 1000);
  };

  const fields = [length, width, height, payload, bl, bw, bh, boxWeight];
  const body = fields.every((f) => f.value !== null)
    ? { l: length.value! * 100, w: width.value! * 100, h: height.value! * 100, maxLoad: payload.value! * 1000 }
    : null;
  // A few thousand additions at most: no need to memoise.
  const r = body ? boxesInBody(body, { l: bl.value!, w: bw.value!, h: bh.value! }, boxWeight.value!, canTip) : null;

  const inputs = (
    <>
      <FieldGroup title="Кузов" hint="Внутренние размеры: по ним встают коробки.">
        <Chips label="Кузов" options={BOX_BODIES.map((b) => ({ value: b.id, label: b.label }))} value={bodyId} onChange={choose} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Длина" unit="м" state={length} onEdit={() => setBodyId(null)} />
          <NumberField label="Ширина" unit="м" state={width} onEdit={() => setBodyId(null)} />
          <NumberField label="Высота" unit="м" state={height} onEdit={() => setBodyId(null)} />
          <NumberField label="Грузоподъёмность" unit="т" state={payload} onEdit={() => setBodyId(null)} />
        </div>
      </FieldGroup>
      <FieldGroup title="Коробка" hint="Все коробки одного размера и веса.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          <NumberField label="Длина" unit="см" state={bl} />
          <NumberField label="Ширина" unit="см" state={bw} />
          <NumberField label="Высота" unit="см" state={bh} />
          <NumberField label="Вес" unit="кг" state={boxWeight} />
        </div>
        <CheckField label="Можно класть на бок" checked={canTip} onChange={setCanTip} />
      </FieldGroup>
    </>
  );

  let results;
  if (!r || !body) {
    results = <Note warn>Проверьте размеры: кузов — в метрах (длина до 25 м, ширина до 4 м), коробка — в сантиметрах.</Note>;
  } else if (r.bySpace === 0) {
    results = <Note warn>Такая коробка в этот кузов не встаёт: она больше кузова по длине, ширине или высоте.</Note>;
  } else {
    const chosen = BOX_BODIES.find((b) => b.id === bodyId);
    const bodyName = chosen?.name ?? 'Свой кузов';
    const count = Math.min(r.total, START_MAX_ITEMS);
    const start: StartSpec = {
      name: `${bodyName} — ${count} ${word(count, BOX_FORMS)}`,
      body: ownBody(bodyName, { l: body.l, w: body.w, h: body.h }, body.maxLoad, chosen?.kind, chosen?.chassisModel),
      cargo: [{ name: 'Коробка', dims: r.dims, weight: boxWeight.value!, count, lay: { gap: 0, stackable: true } }],
    };
    const weightLimited = r.byWeight !== null && r.byWeight < r.bySpace;
    results = (
      <div className="space-y-6">
        <BigResult
          value={num(r.total, 0)}
          label={word(r.total, BOX_FORMS)}
          note={`${r.perLayer} в слое × ${r.layers} ${word(r.layers, LAYER_FORMS)}${r.upright ? '' : ', коробки лежат на боку'}${weightLimited ? ', но вес ограничивает' : ''}.`}
        />
        <FloorPlan
          floor={{ l: body.l, w: body.w }}
          spots={r.layer.spots}
          ends={['двери', 'кабина']}
          label={`Вид сверху: слой из ${r.perLayer} ${word(r.perLayer, BOX_FORMS)} на полу кузова`}
        />
        <Stats
          items={[
            { label: 'В слое', value: num(r.perLayer, 0) },
            { label: 'Слоёв', value: num(r.layers, 0) },
            r.byWeight !== null && { label: 'По весу — не больше', value: num(r.byWeight, 0) },
            r.weight > 0 && { label: 'Вес груза', value: tonnes(r.weight), hint: `из ${tonnes(body.maxLoad)}` },
            { label: 'Заполнение объёма', value: `${num(r.volumeFill * 100, 0)}%` },
          ]}
        />
        {weightLimited && (
          <Note warn>
            Место есть на {r.bySpace} {word(r.bySpace, BOX_FORMS)}, но грузоподъёмность {tonnes(body.maxLoad)} пускает только {r.byWeight}:
            каждая весит {num(boxWeight.value!, 1)} кг.
          </Note>
        )}
        <Note>
          Это одинаковые коробки ровными слоями до крыши, без зазоров. В жизни коробки разные, хрупкое ставят наверх, а колёсные арки и
          стойки тента съедают сантиметры — раскладка в 3D покажет точнее.
        </Note>
        <TryIn3D title="Разложите эти коробки в 3D" start={start}>
          {r.total > START_MAX_ITEMS
            ? `В 3D откроются первые ${START_MAX_ITEMS} коробок — добавьте к ним другие, с размерами и весом, и разложите автозагрузкой.`
            : 'Добавьте коробки других размеров с весом — автозагрузка поставит тяжёлое вниз, а PDF покажет, что куда грузить.'}
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}

const SAMPLE_BOX = { l: 60, w: 40, h: 40 };
const boxesIn = (b: BodyChoice, box = SAMPLE_BOX, weight = 0) => boxesInBody({ ...b.dims, maxLoad: b.maxLoad }, box, weight);
const inG3 = boxesIn(BOX_BODIES[0]);
const inG42 = boxesIn(BOX_BODIES[1], SAMPLE_BOX, 15);
const inTent = boxesIn(BOX_BODIES[4]);
const TABLE_BOXES: Array<[number, number, number]> = [
  [60, 40, 40],
  [40, 30, 30],
  [30, 20, 20],
];

export const BOXES_IN_TRUCK: ToolContent = {
  lead: (
    <>
      <p>
        В кузов газели 4,2 × 2 м помещается <strong>{inG42.bySpace} коробок 60 × 40 × 40 см</strong>: {inG42.perLayer} в слое и{' '}
        {inG42.layers} {word(inG42.layers, LAYER_FORMS)} до крыши. Но если каждая весит 15 кг, газель (около 1,5 т) возьмёт только{' '}
        <strong>{inG42.byWeight}</strong>.
      </p>
      <p>Введите свой кузов и свою коробку: калькулятор подберёт раскладку слоя, посчитает слои по высоте и проверит вес.</p>
    </>
  ),
  calculator: <BoxesInTruckCalculator />,
  article: (
    <>
      <h2>Как считается</h2>
      <p>
        Сначала слой на полу: калькулятор пробует ставить коробки вдоль кузова, поперёк и вперемешку и берёт раскладку, где их больше.
        Потом слои: сколько раз высота коробки укладывается в высоту кузова. Если коробку можно класть на бок, он пробует и это —
        иногда так встаёт больше. В конце — вес: сколько коробок пропускает грузоподъёмность.
      </p>
      <DataTable
        caption="Сколько коробок встаёт в кузов"
        head={['Коробка, см', ...BOX_BODIES.map((b) => b.label)]}
        rows={TABLE_BOXES.map(([l, w, h]) => [`${l} × ${w} × ${h}`, ...BOX_BODIES.map((b) => String(boxesIn(b, { l, w, h }).bySpace))])}
        note="Одинаковые коробки верхом вверх, ровными слоями до крыши, без зазоров и без проверки по весу, по типичным внутренним размерам кузовов."
      />
      <h2>Коробками или на паллетах</h2>
      <p>
        Россыпью коробок входит больше: нет поддонов (14,4 см высоты каждый) и зазоров для погрузчика. Зато грузят и выгружают их
        вручную — это дольше. На паллетах быстрее, но мест меньше: сколько коробок встанет на одну паллету — в{' '}
        <Link to={path('boxes-on-pallet')}>калькуляторе укладки</Link>, а сколько паллет в машину —{' '}
        <Link to={path('pallets-lorry')}>в грузовике</Link>, <Link to={path('pallets-gazelle')}>в газели</Link> и{' '}
        <Link to={path('pallets-truck')}>в еврофуре</Link>.
      </p>
      <h2>Почему в жизни встаёт меньше</h2>
      <p>
        Коробки обычно разных размеров, тяжёлое ставят вниз, хрупкое — наверх, а колёсные арки и стойки тента съедают сантиметры. Для
        смешанного груза сначала посчитайте <Link to={path('cargo-volume')}>объём в кубометрах</Link>, а точный ответ даст раскладка в
        3D.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Сколько коробок поместится в газель?',
      a: `Коробок 60 × 40 × 40 см — ${inG3.bySpace} в кузов 3 м и ${inG42.bySpace} в кузов 4,2 × 2 м, если ставить ровными слоями до крыши. Но газель везёт около 1,5 т: при весе коробки 15 кг — не больше ${inG42.byWeight}.`,
    },
    {
      q: 'Сколько коробок поместится в фуру?',
      a: `В еврофуру 13,6 × 2,45 × 2,7 м — ${inTent.bySpace} коробок 60 × 40 × 40 см: ${inTent.perLayer} в слое и ${inTent.layers} слоёв. По весу 20 т это проходит, если коробка весит не больше ${num(Math.floor((20000 / inTent.bySpace) * 10) / 10, 1)} кг.`,
    },
    {
      q: 'Как посчитать, сколько коробок войдёт в машину?',
      a: 'Найдите, сколько коробок встаёт в слой на полу (вдоль и поперёк кузова), и умножьте на число слоёв — высоту кузова, делённую на высоту коробки, с округлением вниз. Затем проверьте вес: грузоподъёмность, делённая на вес коробки.',
    },
    {
      q: 'Можно ли класть коробки на бок?',
      a: 'Если упаковка позволяет: на ней нет знака «Верх», и груз не боится. Отметьте «Можно класть на бок» — калькулятор попробует коробку на каждой стороне и выберет, как встаёт больше.',
    },
    {
      q: 'Почему на деле входит меньше, чем в калькуляторе?',
      a: 'Калькулятор считает одинаковые коробки ровными слоями без зазоров. Разные размеры, хрупкий груз наверху, колёсные арки и место для крепления уменьшают число — точнее покажет раскладка в 3D.',
    },
  ],
  related: ['boxes-on-pallet', 'cargo-volume', 'pallets-lorry', 'pallets-gazelle', 'pallets-truck', 'loading-plan'],
  cta: {
    title: 'Посчитали коробки — разложите их в 3D',
    text: 'В Loader3D коробки и паллеты разных размеров встают в кузов с физикой, вес и центр тяжести видны сразу, а склад получает PDF-схему.',
  },
};
