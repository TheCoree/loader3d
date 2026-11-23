import { Link } from 'react-router';
import { COG_LONG_TOLERANCE } from '@/core/stats';
import { TYPICAL_RIG, axleLoads, type AxleLoads, type Rig } from '@/core/tools/axleLoads';
import { toolPage } from '@/lib/toolPages';
import { cn } from '@/lib/utils';
import {
  BigResult,
  CalcFrame,
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

type GroupKey = 'weight' | 'from' | 'to';
const GROUP_LIMITS: Record<GroupKey, [number, number]> = { weight: [0, 60], from: [0, 25], to: [0, 25] };

const AXLE_SPREAD = 131;

/** Side view: the semi-trailer with its cargo, the kingpin and the axles, loads under the wheels (HTML labels). */
function RigDrawing({ rig, groups, loads }: { rig: Rig; groups: Array<{ weight: number; from: number; to: number }>; loads: AxleLoads }) {
  const L = rig.deckLength;
  const u = (x: number) => L - x; // doors on the left, the cab on the right
  const drive = u(rig.kingpin + rig.fifthWheelAhead);
  const front = drive + rig.wheelbase;
  const bogie = u(rig.bogie);
  const minU = -60;
  const maxU = Math.max(L + 300, front + 90);
  const deckY = -130;
  const topY = -400;
  const span = maxU - minU;
  const at = (x: number) => `${((x - minU) / span) * 100}%`;
  const wheel = (cx: number, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={-50} r={50} className="fill-site-bg stroke-site-piece-line" vectorEffect="non-scaling-stroke" />
      <circle cx={cx} cy={-50} r={20} className="fill-none stroke-site-strong" vectorEffect="non-scaling-stroke" />
    </g>
  );
  const maxDensity = Math.max(1e-9, ...groups.map((g) => g.weight / Math.max(10, Math.abs(g.to - g.from))));
  const label = (x: number, text: string, sub: string) => (
    <span className="absolute top-0 -translate-x-1/2 text-center whitespace-nowrap" style={{ left: at(x) }}>
      <span className="block font-geist-mono text-[12px] text-site-fg tabular-nums">{text}</span>
      <span className="block text-[11px] text-site-faint">{sub}</span>
    </span>
  );
  return (
    <figure>
      <svg viewBox={`${minU} ${topY - 40} ${span} ${-topY + 60}`} className="block h-auto w-full" role="img" aria-label="Вид сбоку: груз в полуприцепе и нагрузки на оси">
        <line x1={minU} y1={0} x2={maxU} y2={0} className="stroke-site-line" vectorEffect="non-scaling-stroke" />
        {/* The cargo: the darker, the denser. */}
        {groups.map((g, i) => {
          const a = Math.max(0, Math.min(L, Math.min(g.from, g.to)));
          const b = Math.max(0, Math.min(L, Math.max(g.from, g.to)));
          const density = g.weight / Math.max(10, b - a);
          const h = 60 + 170 * (density / maxDensity);
          return (
            <rect
              key={i}
              x={u(b)}
              y={deckY - h}
              width={Math.max(0, b - a)}
              height={h}
              className="fill-site-piece stroke-site-piece-line"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {/* The semi-trailer: the body and its frame. */}
        <rect x={0} y={topY} width={L} height={deckY - topY} className="fill-none stroke-site-piece-line" vectorEffect="non-scaling-stroke" />
        <line x1={0} y1={deckY + 12} x2={L} y2={deckY + 12} className="stroke-site-strong" vectorEffect="non-scaling-stroke" />
        {/* The tractor. */}
        <path
          d={`M${drive - 80} -105 H${L + 20} V-330 H${L + 230} L${L + 280} -250 V-105 Z`}
          className="fill-none stroke-site-piece-line"
          vectorEffect="non-scaling-stroke"
        />
        <path d={`M${u(rig.kingpin) - 24} ${deckY + 12} l24 -0 l-12 22 Z`} className="fill-site-fg" />
        {[-1, 0, 1].map((k) => wheel(bogie + k * AXLE_SPREAD, `t${k}`))}
        {wheel(drive, 'drive')}
        {wheel(front, 'front')}
        {loads.cargoCog !== null && (
          <line
            x1={u(loads.cargoCog)}
            y1={topY - 30}
            x2={u(loads.cargoCog)}
            y2={0}
            className="stroke-site-fg"
            strokeDasharray="6 6"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="relative mt-2 h-10" aria-hidden>
        {label(bogie, tonnes(loads.trailer), 'оси полуприцепа')}
        {label(drive, tonnes(loads.drive), 'ведущая')}
        {label(front, tonnes(loads.front), 'передняя')}
      </div>
      <figcaption className="mt-1 flex justify-between font-geist-mono text-[11px] text-site-faint">
        <span>← двери</span>
        <span>- - - центр тяжести груза</span>
        <span>кабина →</span>
      </figcaption>
    </figure>
  );
}

function AxleCalculator() {
  const groups = useRows<GroupKey>(
    [
      { weight: 13, from: 0, to: 8.8 },
      { weight: 6, from: 8.8, to: 13.2 },
    ],
    { weight: 1, from: 0, to: 1.2 },
  );
  const t = (kg: number) => kg / 1000;
  const deckLength = useNumber(TYPICAL_RIG.deckLength / 100, 3, 25, 2);
  const kingpin = useNumber(TYPICAL_RIG.kingpin / 100, 0, 5, 2);
  const bogie = useNumber(TYPICAL_RIG.bogie / 100, 1, 25, 2);
  const tareKingpin = useNumber(t(TYPICAL_RIG.trailerTareKingpin), 0, 30, 2);
  const tareAxles = useNumber(t(TYPICAL_RIG.trailerTareAxles), 0, 30, 2);
  const tractorFront = useNumber(t(TYPICAL_RIG.tractorFront), 0, 30, 2);
  const tractorDrive = useNumber(t(TYPICAL_RIG.tractorDrive), 0, 30, 2);
  const wheelbase = useNumber(TYPICAL_RIG.wheelbase / 100, 2, 8, 2);
  const lead = useNumber(TYPICAL_RIG.fifthWheelAhead / 100, -1, 2, 2);

  const rigFields = [deckLength, kingpin, bogie, tareKingpin, tareAxles, tractorFront, tractorDrive, wheelbase, lead];
  const values = groups.values(GROUP_LIMITS);
  const rig: Rig | null = rigFields.every((f) => f.value !== null)
    ? {
        deckLength: deckLength.value! * 100,
        kingpin: kingpin.value! * 100,
        bogie: bogie.value! * 100,
        trailerTareKingpin: tareKingpin.value! * 1000,
        trailerTareAxles: tareAxles.value! * 1000,
        tractorFront: tractorFront.value! * 1000,
        tractorDrive: tractorDrive.value! * 1000,
        wheelbase: wheelbase.value! * 100,
        fifthWheelAhead: lead.value! * 100,
      }
    : null;
  const rigValid = rig !== null && rig.bogie > rig.kingpin + 100 && rig.bogie <= rig.deckLength;
  const list = values?.map((g) => ({ weight: g.weight * 1000, from: g.from * 100, to: g.to * 100 })) ?? null;
  const loads = rig && rigValid && list ? axleLoads(list, rig) : null;

  const inputs = (
    <>
      <FieldGroup title="Груз" hint="Каждая группа лежит равномерно от и до — в метрах от передней стенки полуприцепа.">
        {groups.rows.map((row, i) => (
          <RowCard key={row.key} n={i + 1} canRemove={groups.rows.length > 1} onRemove={() => groups.remove(row.key)}>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Вес" unit="т" state={groups.field(row, 'weight', ...GROUP_LIMITS.weight)} />
              <NumberField label="От" unit="м" state={groups.field(row, 'from', ...GROUP_LIMITS.from)} />
              <NumberField label="До" unit="м" state={groups.field(row, 'to', ...GROUP_LIMITS.to)} />
            </div>
          </RowCard>
        ))}
        <GhostButton onClick={groups.add}>Добавить группу</GhostButton>
      </FieldGroup>
      <details className="group rounded-lg border border-site-line">
        <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-site-fg outline-none focus-visible:ring-3 focus-visible:ring-site-ring [&::-webkit-details-marker]:hidden">
          Тягач и полуприцеп <span className="font-normal text-site-faint">— типичные, замените на свои</span>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-site-line p-4">
          <NumberField label="Длина кузова" unit="м" state={deckLength} />
          <NumberField label="Шкворень от стенки" unit="м" state={kingpin} />
          <NumberField label="Центр тележки от стенки" unit="м" state={bogie} />
          <NumberField label="Порожний п/п: на седло" unit="т" state={tareKingpin} />
          <NumberField label="Порожний п/п: на оси" unit="т" state={tareAxles} />
          <NumberField label="Тягач: передняя ось" unit="т" state={tractorFront} />
          <NumberField label="Тягач: ведущая ось" unit="т" state={tractorDrive} />
          <NumberField label="Колёсная база тягача" unit="м" state={wheelbase} />
          <NumberField label="Седло впереди ведущей оси" unit="м" state={lead} />
        </div>
      </details>
    </>
  );

  let results;
  if (!values || !rig) {
    results = <Note warn>Проверьте значения: вес — в тоннах, положения — в метрах от передней стенки.</Note>;
  } else if (!rigValid || !loads) {
    results = <Note warn>Центр тележки должен быть дальше шкворня хотя бы на метр и не дальше конца кузова.</Note>;
  } else if (loads.cargoCog === null) {
    results = <Note>Добавьте вес груза — и калькулятор покажет, как он ляжет на оси.</Note>;
  } else {
    const share = loads.cogFromFront ?? 0.5;
    results = (
      <div className="space-y-6">
        <BigResult
          value={num(loads.cargoCog / 100, 2)}
          label="м — центр тяжести груза"
          note={
            <>
              От передней стенки, {num(share * 100, 0)}% длины кузова.{' '}
              <span className={cn('font-medium', loads.balanced ? 'text-site-fg' : 'text-site-warn')}>
                {loads.balanced
                  ? 'В пределах нормы: груз распределён равномерно.'
                  : share < 0.5
                    ? 'Груз смещён к кабине.'
                    : 'Груз смещён к дверям.'}
              </span>
            </>
          }
        />
        <RigDrawing rig={rig} groups={list!} loads={loads} />
        <Stats
          items={[
            { label: 'Передняя ось тягача', value: tonnes(loads.front) },
            { label: 'Ведущая ось тягача', value: tonnes(loads.drive) },
            { label: 'Оси полуприцепа', value: tonnes(loads.trailer), hint: 'на всю тележку' },
            { label: 'На седло (шкворень)', value: tonnes(loads.kingpin) },
            { label: 'Груз', value: tonnes(loads.cargoWeight) },
            { label: 'Полная масса', value: tonnes(loads.gross) },
          ]}
        />
        {loads.behindBogie && (
          <Note warn>
            Центр тяжести груза дальше осей полуприцепа: груз приподнимает седло, тягач теряет сцепление ведущей оси. Сдвиньте
            тяжёлое к кабине.
          </Note>
        )}
        {loads.aheadOfKingpin && (
          <Note warn>Центр тяжести груза впереди шкворня: весь груз и даже больше ложится на тягач. Сдвиньте тяжёлое к середине.</Note>
        )}
        <TryIn3D
          title="Посмотрите центр тяжести на своей раскладке"
          start={{
            name: `Полуприцеп ${num(rig.deckLength / 100, 1)} м — ${tonnes(loads.cargoWeight)}`,
            body: { ...presetBody('tent'), dims: { ...presetBody('tent').dims, l: rig.deckLength } },
            cargo: [],
          }}
        >
          В Loader3D центр тяжести каждого кузова пересчитывается при каждом движении груза, а автозагрузка ставит тяжёлое к
          середине сама.
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}

const path = (id: Parameters<typeof toolPage>[0]) => toolPage(id).path;
const tolerance = num(COG_LONG_TOLERANCE * 100, 0);

export const AXLE_LOADS: ToolContent = {
  lead: (
    <>
      <p>
        Вес груза делится между <strong>тягачом</strong> (через седло) и <strong>осями полуприцепа</strong> по правилу рычага: чем
        ближе центр тяжести груза к кабине, тем больше достаётся тягачу. Калькулятор находит центр тяжести груза и считает
        нагрузку на переднюю и ведущую ось тягача и на тележку полуприцепа — с весом пустой машины.
      </p>
      <p>Укажите группы груза — вес и где лежит, — а размеры тягача и полуприцепа замените на свои.</p>
    </>
  ),
  calculator: <AxleCalculator />,
  article: (
    <>
      <h2>Как считается</h2>
      <p>
        Полуприцеп — балка на двух опорах: спереди он лежит на седле тягача (шкворень), сзади — на тележке осей. Груз весом P с
        центром тяжести на расстоянии x от передней стенки давит на тележку с силой{' '}
        <strong>P × (x − шкворень) / (тележка − шкворень)</strong>, а остальное приходится на седло. Нагрузку на седло так же
        делят оси тягача: передней достаётся доля, равная выносу седла впереди ведущей оси, делённому на колёсную базу. К этому
        добавляется вес пустого тягача и полуприцепа.
      </p>
      <p>
        Центр тяжести груза — среднее положение мест, взвешенное по их весу. Группа, которая лежит равномерно от 0 до 8,8 м, имеет
        центр тяжести на 4,4 м.
      </p>
      <h2>Где должен быть центр тяжести</h2>
      <p>
        Хорошо, когда центр тяжести груза — близко к середине кузова: Loader3D считает нормой отклонение не больше {tolerance}% длины
        в любую сторону. Сместили к кабине — перегружена ведущая ось тягача. Сместили к дверям — перегружена тележка, а тягач
        теряет сцепление: зимой на подъёме это пробуксовка. Центр тяжести за тележкой полуприцепа приподнимает седло — так грузить
        нельзя.
      </p>
      <p>
        Частая ошибка — полностью загрузить переднюю часть кузова и оставить пустые 3–4 м у дверей: формально перегруза нет, но
        ведущая ось уже на пределе. Поэтому сборный груз раскладывают так, чтобы тяжёлое стояло ближе к середине и вниз.
      </p>
      <h2>Допустимые нагрузки</h2>
      <p>
        Предельные нагрузки на оси — в документах тягача и полуприцепа, а на дорогах — в правилах перевозки грузов и на знаках
        ограничения. Они зависят от числа осей, расстояния между ними и типа колёс, поэтому калькулятор не подставляет нормы сам:
        сравните результат с документами своей машины. Расчёт статический — для планирования погрузки, а точную нагрузку покажут
        весы.
      </p>
      <p>
        Сначала узнайте, {<Link to={path('pallets-truck')}>сколько паллет встанет в фуру</Link>}, потом — как их вес ляжет на оси. А
        для сборного груза пригодится {<Link to={path('ldm')}>калькулятор LDM</Link>}.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Как рассчитать нагрузку на оси полуприцепа?',
      a: 'По правилу рычага: найдите центр тяжести груза, затем нагрузка на тележку = вес × (центр тяжести − шкворень) / (тележка − шкворень), остальное — на седло тягача. Плюс вес пустого полуприцепа.',
    },
    {
      q: 'Как распределяется нагрузка на оси тягача?',
      a: 'Нагрузка на седло делится между осями тягача: передней достаётся доля, равная выносу седла впереди ведущей оси, делённому на колёсную базу, — например, при выносе 0,5 м и базе 3,7 м около 14 %, остальное — ведущей. Плюс вес самого тягача.',
    },
    {
      q: 'Как найти центр тяжести груза в фуре?',
      a: 'Умножьте вес каждого места на расстояние до его середины от передней стенки, сложите и разделите на общий вес. Хорошо, когда центр тяжести близко к середине кузова.',
    },
    {
      q: 'Почему нельзя грузить тяжёлое у дверей?',
      a: 'Груз у дверей перегружает тележку полуприцепа и разгружает ведущую ось тягача: машина хуже тянет и тормозит. Если центр тяжести груза дальше тележки, седло приподнимается — так везти нельзя.',
    },
    {
      q: 'Насколько точен такой расчёт?',
      a: 'Это статическая оценка для планирования погрузки. Подставьте вес пустой машины и размеры из её документов — и результат будет близок к весам; точную нагрузку на оси покажут только весы.',
    },
  ],
  related: ['pallets-truck', 'ldm', 'loading-plan', 'truck-dimensions', 'pallets-container', 'cargo-volume'],
  cta: {
    title: 'Центр тяжести — при каждом движении груза',
    text: 'В Loader3D масса, LDM и центр тяжести каждого кузова видны сразу, а автозагрузка ставит тяжёлое вниз и к середине и не превышает грузоподъёмность.',
  },
};
