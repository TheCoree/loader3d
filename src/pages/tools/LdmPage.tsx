import { Link } from 'react-router';
import { DEFAULT_KG_PER_LDM, LDM_DECK_WIDTH, TRAILER_LDM, ldmSummary, rowLdm } from '@/core/tools/ldm';
import { toolPage } from '@/lib/toolPages';
import {
  BigResult,
  CalcFrame,
  DataTable,
  FieldGroup,
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
import { RowCard, useRows } from './rows';
import { presetBody } from './start';

/** LDM knows no height: the places travel to the plan as pallets of this height. */
const PLACE_HEIGHT = 150;

type LdmKey = 'l' | 'w' | 'count' | 'stack' | 'weight';
const LIMITS: Record<LdmKey, [number, number]> = { l: [1, 3000], w: [1, 400], count: [0, 10000], stack: [1, 5], weight: [0, 30000] };

function LdmCalculator() {
  const rows = useRows<LdmKey>(
    [
      { l: 120, w: 80, count: 10, stack: 1, weight: 400 },
      { l: 120, w: 100, count: 4, stack: 2, weight: 250 },
    ],
    { l: 120, w: 80, count: 1, stack: 1, weight: 0 },
    1,
  );
  const factor = useNumber(DEFAULT_KG_PER_LDM, 0, 10000, 0);
  const values = rows.values(LIMITS);
  const result = values && factor.value !== null ? ldmSummary(values, factor.value) : null;

  const inputs = (
    <>
      <FieldGroup title="Груз" hint="Размеры места на полу; «ярусов» — сколько мест стоит друг на друге.">
        {rows.rows.map((row, i) => (
          <RowCard key={row.key} n={i + 1} canRemove={rows.rows.length > 1} onRemove={() => rows.remove(row.key)}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              <NumberField label="Длина" unit="см" state={rows.field(row, 'l', ...LIMITS.l)} />
              <NumberField label="Ширина" unit="см" state={rows.field(row, 'w', ...LIMITS.w)} />
              <NumberField label="Количество" unit="шт" state={rows.field(row, 'count', ...LIMITS.count)} />
              <NumberField label="Ярусов" state={rows.field(row, 'stack', ...LIMITS.stack)} />
              <NumberField label="Вес одного" unit="кг" state={rows.field(row, 'weight', ...LIMITS.weight)} />
            </div>
          </RowCard>
        ))}
        <GhostButton onClick={rows.add}>Добавить груз</GhostButton>
      </FieldGroup>
      <FieldGroup title="Перевозчик" hint="Сколько килограммов перевозчик считает за 1 LDM: часто 1 850, у некоторых — 2 000.">
        <NumberField label="1 LDM равен" unit="кг" state={factor} className="max-w-[calc(50%-0.375rem)]" />
      </FieldGroup>
    </>
  );

  let results;
  if (!result) {
    results = <Note warn>Проверьте значения: размеры — в сантиметрах, ярусов — от 1 до 5.</Note>;
  } else {
    const bars = Math.max(1, result.trailers);
    results = (
      <div className="space-y-6">
        <BigResult
          value={num(result.ldm, 2)}
          label="LDM"
          note={
            <>
              {result.pieces} мест, {result.floorPlaces} на полу. К оплате перевозчики округляют вверх до 0,1 м — {num(result.billed, 1)}{' '}
              LDM.
            </>
          }
        />
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: Math.min(bars, 4) }, (_, i) => {
            const fill = Math.min(1, Math.max(0, result.ldm / TRAILER_LDM - i));
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 flex-1 overflow-hidden rounded-sm border border-site-line">
                  <div className="h-full bg-site-fg" style={{ width: `${fill * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 font-geist-mono text-[11px] text-site-faint">фура {i + 1}: {num(fill * TRAILER_LDM, 1)} м</span>
              </div>
            );
          })}
        </div>
        <Stats
          items={[
            { label: 'Доля фуры 13,6 м', value: `${num(result.trailerShare * 100, 0)}%` },
            { label: 'Фур 13,6 м', value: num(result.trailers, 0), hint: 'по LDM, без учёта веса' },
            { label: 'Мест на полу', value: num(result.floorPlaces, 0) },
            result.weight > 0 && { label: 'Вес', value: tonnes(result.weight) },
            { label: 'Оплачиваемый вес', value: tonnes(result.chargeableWeight), hint: `больший из веса и ${num(result.billed, 1)} × ${num(factor.value!, 0)} кг` },
          ]}
        />
        {result.weight > 0 && result.chargeableWeight > result.weight && (
          <Note>
            Груз лёгкий для своего места: перевозчик возьмёт плату как за {tonnes(result.chargeableWeight)}, а не за{' '}
            {tonnes(result.weight)}. Поставить в два яруса — способ платить меньше.
          </Note>
        )}
        <TryIn3D
          title="Узнайте LDM по настоящей раскладке"
          start={{
            name: `Тент 13,6 м — ${num(result.ldm, 1)} LDM`,
            body: presetBody('tent'),
            cargo: values!
              .filter((v) => v.count > 0)
              .map((v) => ({
                name: `Место ${num(v.l, 0)} × ${num(v.w, 0)}`,
                dims: { l: v.l, w: v.w, h: PLACE_HEIGHT },
                weight: v.weight,
                count: v.count,
              })),
          }}
        >
          Формула не знает, как встанут места. В Loader3D LDM считается по раскладке в 3D — от передней стенки до последнего груза.
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}

const ldmOf = (l: number, w: number) => num(rowLdm({ l, w, count: 1, stack: 1 }), 3);
const examples: Array<[string, number, number]> = [
  ['Европаллета', 120, 80],
  ['Финпаллета', 120, 100],
  ['Полупаллета', 80, 60],
  ['Американская паллета', 120, 120],
  ['IBC-куб', 120, 100],
];

const pathOf = (id: Parameters<typeof toolPage>[0]) => toolPage(id).path;

export const LDM: ToolContent = {
  lead: (
    <>
      <p>
        <strong>LDM</strong> (loading meter, погрузочный метр) — метр длины кузова на всю его ширину. Считается так:{' '}
        <strong>длина × ширина места / 2,4</strong>, в метрах. Европаллета — 0,4 LDM, финпаллета — 0,5, полная фура 13,6 м — 13,6
        LDM.
      </p>
      <p>Добавьте свои места — калькулятор сложит погрузочные метры, учтёт ярусы и покажет оплачиваемый вес сборного груза.</p>
    </>
  ),
  calculator: <LdmCalculator />,
  article: (
    <>
      <h2>Формула LDM</h2>
      <p>
        Стандартный кузов внутри — около 2,45 м, но в формуле принято 2,4 м, поэтому один погрузочный метр — это 2,4 м² пола. LDM
        одного места — его площадь, делённая на 2,4: <strong>LDM = длина (м) × ширина (м) / 2,4</strong>. Для нескольких одинаковых
        мест — умножить на количество мест на полу. Если места ставят друг на друга, на полу их меньше: 10 паллет в 2 яруса — это 5
        мест на полу.
      </p>
      <DataTable
        head={['Место', 'Размер, см', 'LDM одного', 'В фуре 13,6 м по LDM']}
        rows={examples.map(([name, l, w]) => [
          name,
          `${l} × ${w}`,
          ldmOf(l, w),
          num(Math.floor(TRAILER_LDM / rowLdm({ l, w, count: 1, stack: 1 }) + 1e-9), 0),
        ])}
        note={`Ширина в формуле — ${LDM_DECK_WIDTH / 100} м. Число мест «по LDM» — сколько их уложилось бы по площади; сколько встанет на самом деле, зависит от раскладки.`}
      />
      <h2>Зачем LDM в сборных грузах</h2>
      <p>
        Перевозчик сборного груза продаёт место в кузове, а не только тоннаж. Поэтому счёт выставляют за больший из двух весов:
        реальный или «оплачиваемый» — LDM × коэффициент. У большинства перевозчиков на континенте 1 LDM равен{' '}
        {num(DEFAULT_KG_PER_LDM, 0)} кг, у некоторых — 2 000 кг или свой — уточните в тарифе.
      </p>
      <p>
        Пример: 6 европаллет по 200 кг весят 1,2 т, а занимают 2,4 LDM. По коэффициенту {num(DEFAULT_KG_PER_LDM, 0)} кг это{' '}
        {tonnes(2.4 * DEFAULT_KG_PER_LDM)} — платить придётся как за {tonnes(2.4 * DEFAULT_KG_PER_LDM)}, а не за 1,2 т. Штабелирование
        вдвое уменьшает LDM, если груз его выдерживает.
      </p>
      <h2>Формула и настоящая раскладка</h2>
      <p>
        Формула считает площадь, а не то, как встанут места. 33 европаллеты по формуле — 13,2 LDM, и в фуре они действительно
        занимают 13,2 м: 11 рядов по 3. Но одна паллета у стенки забирает ряд длиной 1,2 м, а не 0,4: рядом с ней ничего не встанет,
        если других мест нет. Поэтому для своей машины смотрите, {<Link to={pathOf('pallets-truck')}>сколько паллет встаёт в еврофуру</Link>},
        а в Loader3D LDM считается по раскладке — от передней стенки до последнего места.
      </p>
      <p>
        Если груз не паллетный, начните с {<Link to={pathOf('cargo-volume')}>объёма в кубометрах</Link>}: у перевозчиков есть и
        ставка за кубометр.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Что такое LDM?',
      a: 'Погрузочный метр (loading meter) — метр длины кузова на всю его ширину, 2,4 м² пола. Полная фура 13,6 м — 13,6 LDM. В LDM считают место в кузове для сборных грузов.',
    },
    {
      q: 'Как посчитать LDM?',
      a: 'Длина × ширина места в метрах, делённое на 2,4, и умножить на количество мест на полу. Европаллета 1,2 × 0,8 м — 0,4 LDM, финпаллета 1,2 × 1,0 м — 0,5 LDM.',
    },
    {
      q: 'Сколько килограммов в 1 LDM?',
      a: `Это коэффициент перевозчика для оплачиваемого веса, а не физическая величина. Чаще всего ${num(DEFAULT_KG_PER_LDM, 0)} кг на 1 LDM, у некоторых перевозчиков — 2 000 кг. Если груз легче, платят как за LDM × коэффициент.`,
    },
    {
      q: 'Как считать LDM, если паллеты стоят в два яруса?',
      a: 'Делите количество мест на число ярусов и округляйте вверх: 10 паллет в 2 яруса — 5 мест на полу, 2 LDM для европаллет. Штабелировать можно, только если груз это выдерживает.',
    },
    {
      q: 'Сколько LDM в еврофуре?',
      a: '13,6 LDM — по длине кузова. 33 европаллеты занимают 13,2 LDM, 26 финпаллет — 13 LDM.',
    },
  ],
  related: ['pallets-truck', 'cargo-volume', 'axle-loads', 'pallets-container', 'boxes-on-pallet', 'loading-plan'],
  cta: {
    title: 'LDM, вес и центр тяжести — по настоящей раскладке',
    text: 'Loader3D считает погрузочные метры, массу и центр тяжести при каждом движении груза и разложит сборный груз по машинам сам.',
  },
};
