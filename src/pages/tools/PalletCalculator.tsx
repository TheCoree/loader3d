import { useState } from 'react';
import type { BodyKind, Dims } from '@/core/types';
import type { FloorFit } from '@/core/tools/floorFit';
import { PALLETS, palletLoad, type PalletKind } from '@/core/tools/pallets';
import type { StartSpec } from '@/core/tools/startPlan';
import { ownBody } from './start';
import {
  BigResult,
  CalcFrame,
  CheckField,
  Chips,
  FieldGroup,
  FloorPlan,
  Note,
  NumberField,
  Stats,
  TryIn3D,
  num,
  tonnes,
  useNumber,
} from './kit';

/** A body the calculator offers as a pill. Lengths in cm, payload in kg. */
export interface BodyChoice {
  id: string;
  label: string;
  dims: Dims;
  maxLoad: number;
  /** For the plan of «Попробовать в 3D»: the body's kind (missing — by the length) and name (missing — the label). */
  kind?: BodyKind;
  name?: string;
  /** The axles of the editor's template of this vehicle (core/chassis.ts CHASSIS_MODELS); missing — typical ones. */
  chassisModel?: string;
}

/** The pallets of the calculator: the standard ones with a typical height and weight (as the editor's presets). */
export const PALLET_CHOICES: Record<PalletKind, { label: string; h: number; weight: number; forms: [string, string, string] }> = {
  eur: { label: 'EUR 120 × 80', h: 150, weight: 400, forms: ['европаллета', 'европаллеты', 'европаллет'] },
  fin: { label: 'FIN 120 × 100', h: 150, weight: 500, forms: ['финпаллета', 'финпаллеты', 'финпаллет'] },
  half: { label: '½ 80 × 60', h: 100, weight: 200, forms: ['полупаллета', 'полупаллеты', 'полупаллет'] },
};

const PALLET_FORMS: [string, string, string] = ['паллета', 'паллеты', 'паллет'];

const pluralRules = new Intl.PluralRules('ru-RU');
/** The word for a count: «34» → «европаллеты». */
export function word(n: number, [one, few, many]: readonly [string, string, string]): string {
  const rule = pluralRules.select(n);
  return rule === 'one' ? one : rule === 'few' ? few : many;
}

/** «вдоль, по 3 в ряд», «поперёк, по 2 в ряд», «ёлочкой: 7 поперёк и 4 вдоль». */
export function layoutText(fit: FloorFit): string {
  const turned = fit.spots.filter((s) => s.turned).length;
  const along = fit.count - turned;
  if (fit.kind === 'along') return `вдоль кузова: ${num(fit.count / Math.max(1, fit.lanes.along), 0)} рядов по ${fit.lanes.along}`;
  if (fit.kind === 'turned') return `поперёк кузова: ${num(fit.count / Math.max(1, fit.lanes.turned), 0)} рядов по ${fit.lanes.turned}`;
  return `ёлочкой: ${turned} поперёк и ${along} вдоль`;
}

export function PalletCalculator({
  bodies,
  initialBody,
  initialPallet = 'eur',
  initialWeight,
  doors = 'двери',
  front = 'кабина',
  tryText = 'Добавьте паллеты с весом — автозагрузка разложит их с развесовкой по осям, а PDF покажет водителю, что куда ставить.',
}: {
  bodies: readonly BodyChoice[];
  initialBody: string;
  initialPallet?: PalletKind;
  /** Weight of one pallet, kg (the pallet's typical weight when not given). */
  initialWeight?: number;
  /** Captions of the ends of the top view. */
  doors?: string;
  front?: string;
  tryText?: string;
}) {
  const first = bodies.find((b) => b.id === initialBody) ?? bodies[0];
  const [bodyId, setBodyId] = useState<string | null>(first.id);
  const length = useNumber(first.dims.l / 100, 1, 25, 2);
  const width = useNumber(first.dims.w / 100, 1, 4, 2);
  const height = useNumber(first.dims.h / 100, 1, 4.5, 2);
  const payload = useNumber(first.maxLoad / 1000, 0, 60, 2);

  const [palletKind, setPalletKind] = useState<PalletKind | null>(initialPallet);
  const pl = useNumber(PALLETS[initialPallet].l, 20, 400, 1);
  const pw = useNumber(PALLETS[initialPallet].w, 20, 400, 1);
  const ph = useNumber(PALLET_CHOICES[initialPallet].h, 5, 450, 1);
  const weight = useNumber(initialWeight ?? PALLET_CHOICES[initialPallet].weight, 0, 30000, 1);
  const gap = useNumber(0, 0, 50, 1);
  const [stackable, setStackable] = useState(false);

  const chooseBody = (id: string) => {
    const b = bodies.find((x) => x.id === id)!;
    setBodyId(id);
    length.put(b.dims.l / 100);
    width.put(b.dims.w / 100);
    height.put(b.dims.h / 100);
    payload.put(b.maxLoad / 1000);
  };
  const choosePallet = (kind: PalletKind) => {
    setPalletKind(kind);
    pl.put(PALLETS[kind].l);
    pw.put(PALLETS[kind].w);
    ph.put(PALLET_CHOICES[kind].h);
    weight.put(PALLET_CHOICES[kind].weight);
  };

  const ready =
    length.value !== null && width.value !== null && height.value !== null && payload.value !== null &&
    pl.value !== null && pw.value !== null && ph.value !== null && weight.value !== null && gap.value !== null;
  const body = ready ? { l: length.value! * 100, w: width.value! * 100, h: height.value! * 100, maxLoad: payload.value! * 1000 } : null;
  // A few thousand additions at most: no need to memoise.
  const result = body
    ? palletLoad(body, { dims: { l: pl.value!, w: pw.value!, h: ph.value! }, weight: weight.value!, stackable }, gap.value!)
    : null;
  const forms = palletKind ? PALLET_CHOICES[palletKind].forms : PALLET_FORMS;

  const inputs = (
    <>
      <FieldGroup title="Кузов" hint="Внутренние размеры: по ним встают паллеты.">
        <Chips label="Кузов" options={bodies.map((b) => ({ value: b.id, label: b.label }))} value={bodyId} onChange={chooseBody} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Длина" unit="м" state={length} onEdit={() => setBodyId(null)} />
          <NumberField label="Ширина" unit="м" state={width} onEdit={() => setBodyId(null)} />
          <NumberField label="Высота" unit="м" state={height} onEdit={() => setBodyId(null)} />
          <NumberField label="Грузоподъёмность" unit="т" state={payload} onEdit={() => setBodyId(null)} />
        </div>
      </FieldGroup>
      <FieldGroup title="Паллета">
        <Chips
          label="Паллета"
          options={(Object.keys(PALLET_CHOICES) as PalletKind[]).map((k) => ({ value: k, label: PALLET_CHOICES[k].label }))}
          value={palletKind}
          onChange={choosePallet}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Длина" unit="см" state={pl} onEdit={() => setPalletKind(null)} />
          <NumberField label="Ширина" unit="см" state={pw} onEdit={() => setPalletKind(null)} />
          <NumberField label="Высота с грузом" unit="см" state={ph} />
          <NumberField label="Вес одной" unit="кг" state={weight} />
        </div>
        <CheckField label="Можно ставить в два яруса" checked={stackable} onChange={setStackable} />
        <NumberField label="Зазор между паллетами" unit="см" state={gap} className="max-w-[calc(50%-0.375rem)]" />
      </FieldGroup>
    </>
  );

  let results;
  if (!result || !body) {
    results = <Note warn>Проверьте размеры: длина кузова — от 1 до 25 м, ширина — до 4 м, высота — до 4,5 м, паллета — от 20 см.</Note>;
  } else if (result.floorPlaces === 0 || result.tiers === 0) {
    results = <Note warn>Такая паллета в этот кузов не встаёт: она больше кузова по длине, ширине или высоте.</Note>;
  } else {
    const best = result.best;
    const alternatives = result.options.slice(1);
    const chosen = bodies.find((b) => b.id === bodyId);
    const palletName = palletKind ? PALLETS[palletKind].name : 'Паллета';
    const start: StartSpec = {
      name: `${chosen?.name ?? chosen?.label ?? 'Свой кузов'} — ${result.total} ${word(result.total, forms)}`,
      body: ownBody(chosen?.name ?? chosen?.label ?? 'Кузов', { l: body.l, w: body.w, h: body.h }, body.maxLoad, chosen?.kind, chosen?.chassisModel),
      cargo: [
        {
          name: palletName,
          dims: { l: pl.value!, w: pw.value!, h: ph.value! },
          weight: weight.value!,
          count: result.total,
          lay: { gap: gap.value!, stackable },
        },
      ],
    };
    const weightLimited = result.byWeight !== null && result.byWeight < result.bySpace;
    results = (
      <div className="space-y-6">
        <BigResult
          value={num(result.total, 0)}
          label={word(result.total, forms)}
          note={
            <>
              {result.tiers > 1 ? `${result.floorPlaces} на полу × ${result.tiers} ${word(result.tiers, ['ярус', 'яруса', 'ярусов'])}, ` : 'В один ярус, '}
              {layoutText(best)}
              {best.slack < 1 && result.floorPlaces > 0 ? ' — вплотную, без запаса по длине.' : `, у дверей остаётся ${num(best.slack, 0)} см.`}
            </>
          }
        />
        <FloorPlan
          floor={{ l: body.l, w: body.w }}
          spots={best.spots}
          ends={[doors, front]}
          label={`Вид сверху: ${result.floorPlaces} ${word(result.floorPlaces, forms)} на полу кузова, ${layoutText(best)}`}
        />
        <Stats
          items={[
            { label: 'Мест на полу', value: num(result.floorPlaces, 0) },
            { label: 'Ярусов', value: num(result.tiers, 0), hint: stackable ? undefined : 'штабелирование выключено' },
            result.byWeight !== null && { label: 'По весу — не больше', value: num(result.byWeight, 0) },
            result.weight > 0 && { label: 'Вес груза', value: tonnes(result.weight), hint: `из ${tonnes(body.maxLoad)}` },
            { label: 'LDM по полу', value: `${num(result.ldm, 2)} м` },
            { label: 'Заполнение объёма', value: `${num(result.volumeFill * 100, 0)}%` },
          ]}
        />
        {weightLimited && (
          <Note warn>
            Место есть на {result.bySpace} {word(result.bySpace, forms)}, но грузоподъёмность {tonnes(body.maxLoad)} пускает только{' '}
            {result.byWeight}: каждая весит {tonnes(weight.value!)}.
          </Note>
        )}
        {alternatives.length > 0 && (
          <div>
            <p className="text-[13px] text-site-faint">Другие раскладки</p>
            <ul className="mt-2 divide-y divide-site-line rounded-lg border border-site-line text-[14px]">
              {alternatives.map((fit) => (
                <li key={`${fit.kind}-${fit.count}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <span className="text-site-fg first-letter:uppercase">{layoutText(fit)}</span>
                  <span className="font-geist-mono text-site-muted tabular-nums">
                    {fit.count * result.tiers} · запас {num(fit.slack, 0)} см
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {best.slack < 1 && gap.value === 0 && (
          <Note>
            Паллеты стоят вплотную, по чертежу. Груз часто выступает за края поддона — поставьте зазор 1–2 см и посмотрите,
            сколько встанет на самом деле.
          </Note>
        )}
        <TryIn3D title="Разложите этот кузов в 3D" start={start}>
          {tryText}
        </TryIn3D>
      </div>
    );
  }
  return <CalcFrame inputs={inputs} results={results} />;
}
