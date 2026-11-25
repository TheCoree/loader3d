import { useState } from 'react';
import { Link } from 'react-router';
import { VEHICLE_PRESETS } from '@/core/presets';
import { bestFit, gridFit, tiersUnder } from '@/core/tools/floorFit';
import { INDUSTRIAL_PALLET, PALLETS, PALLET_REFS, loadedPallet, palletLoad, type PalletKind, type PalletRef } from '@/core/tools/pallets';
import { toolPage } from '@/lib/toolPages';
import { palletsInTent } from './CargoPages';
import { BigResult, CalcFrame, Chips, DataTable, FieldGroup, Note, NumberField, Stats, TryIn3D, num, useNumber, type ToolContent } from './kit';
import { word } from './PalletCalculator';

/** «Pallet sizes and weight»: the EPAL figures (core/tools/pallets.ts PALLET_REFS) and a pallet with its load. */

const path = (id: Parameters<typeof toolPage>[0]) => toolPage(id).path;
const PALLET_FORMS: [string, string, string] = ['паллета', 'паллеты', 'паллет'];

const KINDS: Array<{ value: PalletKind; label: string }> = [
  { value: 'eur', label: 'EUR 120 × 80' },
  { value: 'fin', label: 'FIN 120 × 100' },
  { value: 'half', label: '½ 80 × 60' },
];

const TENT = VEHICLE_PRESETS.find((p) => p.id === 'tent')!.bodies[0];
/** Height a pallet may have to stand two high in a tilt trailer, cm. */
const TWO_TIERS = TENT.dims.h / 2;

/** Millimetres without a thousands space: pallet sizes are written «1200 × 800 × 144». */
const mm = (cm: number) => String(Math.round(cm * 10));
const kg = (n: number) => `${num(n, n % 1 ? 1 : 0)} кг`;
const sizeMm = (l: number, w: number, ref: PalletRef) => `${mm(l)} × ${mm(w)} × ${mm(ref.height)}`;

function LoadedPalletCalculator() {
  const [kind, setKind] = useState<PalletKind>('eur');
  const cargoWeight = useNumber(600, 0, 5000, 1);
  const cargoHeight = useNumber(120, 1, 400, 1);
  const ref = PALLET_REFS[kind];

  const inputs = (
    <>
      <FieldGroup title="Поддон" hint={`${PALLETS[kind].name}, ${ref.epal}: ${sizeMm(PALLETS[kind].l, PALLETS[kind].w, ref)} мм, около ${kg(ref.weight)}.`}>
        <Chips label="Поддон" options={KINDS} value={kind} onChange={(k) => setKind(k)} />
      </FieldGroup>
      <FieldGroup title="Груз на поддоне" hint="Без самого поддона: его вес и высоту калькулятор добавит сам.">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Вес груза" unit="кг" state={cargoWeight} />
          <NumberField label="Высота груза" unit="см" state={cargoHeight} />
        </div>
      </FieldGroup>
    </>
  );

  let results;
  if (cargoWeight.value === null || cargoHeight.value === null) {
    results = <Note warn>Проверьте значения: вес — в килограммах, высота — в сантиметрах.</Note>;
  } else {
    const p = loadedPallet(kind, cargoWeight.value, cargoHeight.value);
    const deck = PALLETS[kind];
    const inTent = palletLoad({ ...TENT.dims, maxLoad: TENT.maxLoad }, { dims: { l: deck.l, w: deck.w, h: p.height }, weight: p.grossWeight, stackable: false });
    const tiers = tiersUnder(TENT.dims.h, p.height, true);
    results = (
      <div className="space-y-6">
        <BigResult value={num(p.grossWeight, p.grossWeight % 1 ? 1 : 0)} label="кг вместе с поддоном" note={`Высота паллеты — ${num(p.height, 1)} см вместе с поддоном.`} />
        <Stats
          items={[
            { label: 'Нагрузка на поддон', value: `${num(p.loadShare * 100, 0)}%`, hint: `из ${kg(ref.safeLoad)}` },
            { label: 'Площадь', value: `${num(p.area, 2)} м²` },
            { label: 'Ярусов в тенте 2,7 м', value: num(tiers, 0), hint: tiers > 1 ? 'если груз можно штабелировать' : undefined },
            { label: 'В еврофуру', value: `${inTent.total} ${word(inTent.total, PALLET_FORMS)}`, hint: inTent.byWeight !== null && inTent.byWeight < inTent.bySpace ? 'ограничивает вес' : 'в один ярус' },
          ]}
        />
        {p.overloaded && (
          <Note warn>
            Груз тяжелее рабочей нагрузки поддона: {ref.epal} рассчитан на {kg(ref.safeLoad)}. Возьмите поддон прочнее или разделите груз.
          </Note>
        )}
        {p.height > TENT.dims.h && <Note warn>Паллета выше тента (2,7 м) — в обычную фуру она не встанет.</Note>}
        <TryIn3D title="Паллеты с этим грузом — в фуру" start={palletsInTent(deck.l, deck.w, p.height, p.grossWeight, 'с грузом')}>
          Откройте еврофуру с этими паллетами в Loader3D: автозагрузка разложит их с развесовкой по осям, а PDF покажет водителю, что куда
          ставить.
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}

const eur = PALLET_REFS.eur;
const fin = PALLET_REFS.fin;
const half = PALLET_REFS.half;
const ind = INDUSTRIAL_PALLET.ref;
const tentDeck = { l: TENT.dims.l, w: TENT.dims.w };
const eurInTent = gridFit(tentDeck, PALLETS.eur, false).count;
const finInTent = bestFit(tentDeck, PALLETS.fin).count;

const sizeRows = [
  ['Европаллета (EUR)', eur.epal, sizeMm(PALLETS.eur.l, PALLETS.eur.w, eur), kg(eur.weight), kg(eur.safeLoad), kg(eur.stackLoad)],
  ['Финпаллета (FIN)', fin.epal, sizeMm(PALLETS.fin.l, PALLETS.fin.w, fin), kg(fin.weight), kg(fin.safeLoad), kg(fin.stackLoad)],
  [INDUSTRIAL_PALLET.name, ind.epal, sizeMm(INDUSTRIAL_PALLET.l, INDUSTRIAL_PALLET.w, ind), kg(ind.weight), kg(ind.safeLoad), kg(ind.stackLoad)],
  ['Полупаллета', half.epal, sizeMm(PALLETS.half.l, PALLETS.half.w, half), kg(half.weight), kg(half.safeLoad), kg(half.stackLoad)],
];

export const PALLET_SIZES: ToolContent = {
  lead: (
    <>
      <p>
        Европаллета — <strong>1200 × 800 мм</strong>, высота {mm(eur.height)} мм, вес около {kg(eur.weight)}, рабочая нагрузка{' '}
        {kg(eur.safeLoad)}. Финпаллета — <strong>1200 × 1000 × {mm(fin.height)} мм</strong>, около {kg(fin.weight)}; полупаллета —{' '}
        <strong>800 × 600 мм</strong>, около {kg(half.weight)} и {kg(half.safeLoad)} нагрузки.
      </p>
      <p>Посчитайте, сколько будет весить и какой высоты получится паллета с вашим грузом — и сколько таких встанет в фуру.</p>
    </>
  ),
  calculator: <LoadedPalletCalculator />,
  article: (
    <>
      <h2>Размеры и нагрузка поддонов</h2>
      <DataTable
        head={['Поддон', 'EPAL', 'Размер, мм', 'Вес', 'Рабочая нагрузка', 'Нижний в штабеле']}
        rows={sizeRows}
        note="По данным EPAL. Вес примерный: он зависит от влажности дерева. Рабочая нагрузка — сколько груза ставят на один поддон; последняя колонка — сколько выдерживает нижний поддон в штабеле из гружёных паллет на твёрдом ровном полу."
      />
      <h2>Европаллета или финпаллета</h2>
      <p>
        Финпаллета шире европаллеты на 20 см: 1200 × 1000 мм против 1200 × 800, и тяжелее — около {kg(fin.weight)} против{' '}
        {kg(eur.weight)}. Рабочая нагрузка у них одна — {kg(eur.safeLoad)}. В еврофуру встаёт {eurInTent} европаллеты и {finInTent}{' '}
        финпаллет: <Link to={path('pallets-truck')}>почему так</Link>. Поддон того же размера 1200 × 1000 бывает и промышленный ({ind.epal}
        ): он выше — {mm(ind.height)} мм, тяжелее — около {kg(ind.weight)}, и держит меньше — {kg(ind.safeLoad)}.
      </p>
      <h2>Вес и высота паллеты с грузом</h2>
      <p>
        Для машины паллета весит вместе с поддоном: 600 кг груза на европаллете — это {kg(600 + eur.weight)}. Высоту тоже считают с
        поддоном: 120 см груза — {num(120 + eur.height, 1)} см. Чтобы паллеты встали в два яруса в тент высотой 2,7 м, каждая должна быть
        не выше {num(TWO_TIERS, 0)} см, а груз — допускать штабелирование.
      </p>
      <p>
        Сколько коробок встанет на поддон — в <Link to={path('boxes-on-pallet')}>калькуляторе укладки</Link>. Сколько паллет в машину —{' '}
        <Link to={path('pallets-truck')}>в еврофуре</Link>, <Link to={path('pallets-lorry')}>в грузовике</Link>,{' '}
        <Link to={path('pallets-container')}>в контейнере</Link>. Европаллета занимает 0,4 погрузочного метра —{' '}
        <Link to={path('ldm')}>калькулятор LDM</Link>.
      </p>
    </>
  ),
  faq: [
    {
      q: 'Какой размер у европаллеты?',
      a: `1200 × 800 мм, высота ${mm(eur.height)} мм (${eur.epal}). Площадь — 0,96 м², в погрузочных метрах — 0,4 LDM.`,
    },
    {
      q: 'Сколько весит европаллета?',
      a: `Около ${kg(eur.weight)} по данным EPAL; точный вес зависит от влажности дерева. Финпаллета — около ${kg(fin.weight)}, полупаллета — около ${kg(half.weight)}.`,
    },
    {
      q: 'Какую нагрузку выдерживает европаллета?',
      a: `Рабочая нагрузка — ${kg(eur.safeLoad)} груза. В штабеле на твёрдом ровном полу нижняя паллета выдерживает до ${kg(eur.stackLoad)} (по данным EPAL).`,
    },
    {
      q: 'Чем финпаллета отличается от европаллеты?',
      a: `Размером: 1200 × 1000 мм против 1200 × 800, и весом — около ${kg(fin.weight)} против ${kg(eur.weight)}. Рабочая нагрузка та же — ${kg(fin.safeLoad)}. В еврофуру встаёт ${finInTent} финпаллет и ${eurInTent} европаллеты.`,
    },
    {
      q: 'Какой размер у полупаллеты?',
      a: `800 × 600 мм, высота ${mm(half.height)} мм, около ${kg(half.weight)} (${half.epal}). Рабочая нагрузка — ${kg(half.safeLoad)}.`,
    },
  ],
  related: ['boxes-on-pallet', 'pallets-truck', 'pallets-lorry', 'pallets-container', 'pallets-gazelle', 'ldm'],
  cta: {
    title: 'Паллеты с грузом — в машину',
    text: 'В Loader3D паллеты с весом и высотой встают в кузов в 3D: автозагрузка с развесовкой, центр тяжести и PDF-схема для водителя.',
  },
};
