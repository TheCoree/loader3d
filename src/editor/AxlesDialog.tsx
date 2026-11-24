import { useMemo } from 'react';
import { CircleCheck, RotateCcw, TriangleAlert } from 'lucide-react';
import { create } from 'zustand';
import type { AxleGroup, CargoBody, ChassisPart } from '../core/types';
import {
  AXLE_WEIGHT_LIMIT,
  AXLE_X_LIMIT,
  MIN_STEER_SHARE,
  axlesEditable,
  chassisOf,
  groupLabel,
  isOverridden,
  positionEditable,
  withChassisValue,
  type AxleLoad,
  type VehicleAxles,
} from '../core/chassis';
import { AXLE_SPACING, TRUCK_CAB_GAP, WHEEL_RADIUS } from '../core/axles';
import { itemBox } from '../core/item';
import { CAB_GAP, CAB_LENGTH, DECK_HEIGHT, bodyAt, findVehicle, type PlacedVehicle } from '../core/layout';
import { formatPercent, formatWeight, type Units } from '../core/units';
import { useStore } from '../store/useStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { NumberField, WeightField } from './fields';
import { useLayout, useStats, useUnits } from './hooks';

/** Which vehicle the «Нагрузка на оси» dialog shows (null: closed). */
export const useAxlesDialog = create<{ vehicleId: string | null; open(id: string): void; close(): void }>()((set) => ({
  vehicleId: null,
  open: (vehicleId) => set({ vehicleId }),
  close: () => set({ vehicleId: null }),
}));

/** Axle loads of one vehicle: a side view, every support with its figures to change, and what is wrong. */
export function AxlesDialog() {
  const vehicleId = useAxlesDialog((s) => s.vehicleId);
  const close = useAxlesDialog((s) => s.close);
  const exists = useStore((s) => vehicleId !== null && s.vehicles.some((v) => v.id === vehicleId));
  const open = vehicleId !== null && exists;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* No field selected on open: the dialog is read first, edited sometimes. */}
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        {open && <AxlesView vehicleId={vehicleId} />}
      </DialogContent>
    </Dialog>
  );
}

/** Danger: over the limit or pulled up; warning: a steering axle too light. */
export function axleTone(g: Pick<AxleLoad, 'over' | 'lifted' | 'light'>): 'danger' | 'warning' | null {
  if (g.over || g.lifted) return 'danger';
  return g.light ? 'warning' : null;
}

/** «Перегружена на 0,8 т», «Отрывается», «Мало для рулевой оси»… */
export function axleProblem(g: AxleLoad): string | null {
  if (g.lifted) return g.axles === 0 ? 'Тянет вверх' : 'Отрывается от дороги';
  if (g.over && g.max !== undefined) return `Перегруз ${formatWeight(g.load - g.max)}`;
  if (g.light) return `Меньше ${formatPercent(MIN_STEER_SHARE)} массы — плохо рулится`;
  return null;
}

/**
 * Which way the cargo should go to fix the problems: back when a front support is overloaded or a rear one comes up,
 * forward when a rear support is overloaded or the steering axle is too light; null when they disagree.
 */
function advice(problems: readonly AxleLoad[]): 'back' | 'forward' | null {
  const front = (g: AxleLoad) => g.part !== 'rear';
  const back = problems.some((g) => (g.over && front(g)) || (g.lifted && !front(g)));
  const forward = problems.some((g) => (g.over && !front(g)) || (g.lifted && front(g)) || g.light);
  return back === forward ? null : back ? 'back' : 'forward';
}

/** The wheel loads in a row: «6,21 · 10,4 · 17,8 т». */
export function axleSummary(a: VehicleAxles): string {
  const tonnes = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${a.groups
    .filter((g) => g.axles > 0)
    .map((g) => tonnes.format(g.load / 1000))
    .join(' · ')} т`;
}

function AxlesView({ vehicleId }: { vehicleId: string }) {
  const stats = useStats();
  const layout = useLayout();
  const many = useStore((s) => s.vehicles.length > 1);
  const setBodyChassis = useStore((s) => s.setBodyChassis);
  const pv = findVehicle(layout, vehicleId)!;
  const axles = stats.vehicles.find((v) => v.id === vehicleId)!.axles;
  const edited = pv.bodies.some((pb) => pb.body.chassis);

  const problems = axles.groups.filter((g) => axleTone(g));
  return (
    <>
      <DialogHeader>
        <DialogTitle>Нагрузка на оси</DialogTitle>
        <DialogDescription>
          {many && `${pv.vehicle.name} · `}Полная масса {formatWeight(axles.gross)}
          {axles.cargo > 0 ? `, из них груз ${formatWeight(axles.cargo)}` : ' без груза'}
        </DialogDescription>
      </DialogHeader>

      {problems.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" />
          {axles.cargo > 0 ? 'Все оси в пределах допустимого' : 'Показана пустая машина — добавьте вес грузам'}
        </div>
      ) : (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
            problems.some((g) => axleTone(g) === 'danger') ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning',
          )}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {problems.map((g) => `${groupLabel(g)}: ${axleProblem(g)!.toLowerCase()}`).join('; ')}.{' '}
            {ADVICE[advice(problems) ?? 'none']}
          </span>
        </div>
      )}

      <SideView pv={pv} axles={axles} />
      <AxleTable pv={pv} axles={axles} />

      <p className="text-xs text-pretty text-muted-foreground">
        Расчёт статический: вес каждого груза — в центре его места, нагрузка группы делится между осями поровну.
        Порожняя масса и допустимые нагрузки сначала типичные — впишите свои из документов машины; допустимое зависит
        и от дорог маршрута.
      </p>

      <DialogFooter>
        {edited && (
          <Button variant="ghost" className="mr-auto" onClick={() => pv.bodies.forEach((pb) => setBodyChassis(pb.body.id, undefined))}>
            <RotateCcw /> Типичные значения
          </Button>
        )}
        <DialogClose asChild>
          <Button>Готово</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

const ADVICE = {
  back: 'Сдвиньте груз назад, к дверям, или уменьшите вес.',
  forward: 'Сдвиньте груз вперёд, к кабине, или уменьшите вес.',
  none: 'Переложите груз или уменьшите вес.',
} as const;

const toneText = { danger: 'text-destructive', warning: 'text-warning' } as const;

/** Side view of the vehicle with its cargo, cab on the right: wheels where the axles are, loads under them. */
function SideView({ pv, axles }: { pv: PlacedVehicle; axles: VehicleAxles }) {
  const items = useStore((s) => s.items);
  const layout = useLayout();
  const cargo = useMemo(
    () =>
      items
        .map((item) => ({ item, box: itemBox(item) }))
        .filter(({ box }) => bodyAt(box, layout)?.vehicleId === pv.vehicle.id),
    [items, layout, pv.vehicle.id],
  );
  const first = pv.bodies[0];
  const semi = first.body.kind === 'semi';
  const cabFrom = pv.front + (semi ? CAB_GAP : TRUCK_CAB_GAP);
  const cabTo = cabFrom + CAB_LENGTH;
  const wheels = axles.groups.filter((g) => g.axles > 0);
  const minX = Math.min(...pv.bodies.map((pb) => pb.box.min.x), ...wheels.map((g) => g.x - g.axles * AXLE_SPACING)) - 40;
  const maxX = Math.max(cabTo, ...wheels.map((g) => g.x + g.axles * AXLE_SPACING)) + 40;
  const top = Math.max(...pv.bodies.map((pb) => pb.box.max.y)) + DECK_HEIGHT + 30;
  const span = maxX - minX;
  const at = (x: number) => `${((x - minX) / span) * 100}%`;
  const stroke = { vectorEffect: 'non-scaling-stroke' as const };

  return (
    <figure className="rounded-xl bg-muted/50 px-3 pt-3 pb-2">
      <svg viewBox={`${minX} ${-top} ${span} ${top + 6}`} className="block h-auto max-h-48 w-full" role="img" aria-label="Вид сбоку: груз и оси машины">
        <line x1={minX} y1={0} x2={maxX} y2={0} className="stroke-border" {...stroke} />
        {/* Cargo first, the bodies' outlines over it. */}
        {cargo.map(({ item, box }) => (
          <rect
            key={item.id}
            x={box.min.x}
            y={-(DECK_HEIGHT + box.max.y)}
            width={box.max.x - box.min.x}
            height={box.max.y - box.min.y}
            fill={item.color}
            fillOpacity={0.55}
            className="stroke-background"
            {...stroke}
          />
        ))}
        {pv.bodies.map((pb, i) => (
          <g key={pb.body.id}>
            <rect
              x={pb.box.min.x}
              y={-(DECK_HEIGHT + pb.box.max.y)}
              width={pb.box.max.x - pb.box.min.x}
              height={pb.box.max.y}
              className="fill-none stroke-muted-foreground"
              {...stroke}
            />
            <line x1={pb.box.min.x} y1={-DECK_HEIGHT + 10} x2={pb.box.max.x} y2={-DECK_HEIGHT + 10} className="stroke-muted-foreground" {...stroke} />
            {/* A drawbar to the body in front. */}
            {i > 0 && (
              <line
                x1={pb.box.max.x}
                y1={-DECK_HEIGHT + 30}
                x2={pv.bodies[i - 1].box.min.x}
                y2={-DECK_HEIGHT + 30}
                className="stroke-muted-foreground"
                {...stroke}
              />
            )}
          </g>
        ))}
        {/* The cab, and a tractor's chassis under the front of the semi-trailer. */}
        <path
          d={`M${cabFrom} ${-DECK_HEIGHT + 40} V${-(DECK_HEIGHT + 200)} H${cabTo - 40} L${cabTo} ${-(DECK_HEIGHT + 120)} V${-DECK_HEIGHT + 40} Z`}
          className="fill-none stroke-muted-foreground"
          {...stroke}
        />
        {semi && (
          <line
            x1={Math.min(...wheels.filter((g) => g.part === 'tractorDrive').map((g) => g.x)) - 110}
            y1={-DECK_HEIGHT + 30}
            x2={cabFrom}
            y2={-DECK_HEIGHT + 30}
            className="stroke-muted-foreground"
            {...stroke}
          />
        )}
        {axles.groups
          .filter((g) => g.axles === 0 && g.kind === 'semi')
          .map((g) => (
            <path key={g.key} d={`M${g.x - 22} ${-DECK_HEIGHT + 10} h44 l-22 26 Z`} className="fill-muted-foreground" />
          ))}
        {wheels.flatMap((g) =>
          Array.from({ length: g.axles }, (_, k) => {
            const x = g.x + (k - (g.axles - 1) / 2) * AXLE_SPACING;
            const tone = axleTone(g);
            return (
              <g key={`${g.key}:${k}`}>
                <circle
                  cx={x}
                  cy={-WHEEL_RADIUS}
                  r={WHEEL_RADIUS}
                  className={cn(
                    'fill-background',
                    tone === 'danger' ? 'stroke-destructive' : tone === 'warning' ? 'stroke-warning' : 'stroke-muted-foreground',
                  )}
                  {...stroke}
                />
                <circle cx={x} cy={-WHEEL_RADIUS} r={18} className="fill-none stroke-muted-foreground" {...stroke} />
              </g>
            );
          }),
        )}
      </svg>
      <div className="relative mt-1 h-9" aria-hidden>
        {wheels.map((g) => {
          const tone = axleTone(g);
          return (
            <span key={g.key} className="absolute top-0 -translate-x-1/2 text-center whitespace-nowrap" style={{ left: at(g.x) }}>
              <span className={cn('block text-xs font-semibold tabular-nums', tone && toneText[tone])}>{formatWeight(g.load)}</span>
              {g.max !== undefined && <span className="block text-[11px] text-muted-foreground tabular-nums">из {formatWeight(g.max)}</span>}
            </span>
          );
        })}
      </div>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>← двери</span>
        <span>кабина →</span>
      </figcaption>
    </figure>
  );
}

/** Steering axles are ahead of the front wall; every other support behind it. */
function isAhead(part: ChassisPart, kind: CargoBody['kind']): boolean {
  return part === 'tractorFront' || (part === 'front' && kind === 'truck');
}

function AxleTable({ pv, axles }: { pv: PlacedVehicle; axles: VehicleAxles }) {
  const units = useUnits();
  const several = pv.bodies.length > 1;
  return (
    // The load comes right after the name: on a phone the inputs scroll sideways, the result stays in sight.
    <Table className="min-w-[640px] text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 pl-0">Опора</TableHead>
          <TableHead className="h-8 w-32">Нагрузка</TableHead>
          <TableHead className="h-8 w-16">Осей</TableHead>
          <TableHead className="h-8 w-36">От передней стенки</TableHead>
          <TableHead className="h-8 w-24">Порожняя</TableHead>
          <TableHead className="h-8 w-24 pr-0">Допустимо</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pv.bodies.flatMap((pb, i) => {
          const rows = axles.groups.filter((g) => g.bodyId === pb.body.id);
          const chassis = chassisOf(pb.body, i === 0);
          return [
            several && (
              <TableRow key={`${pb.body.id}:head`} className="hover:bg-transparent">
                <TableCell colSpan={6} className="pt-3 pb-1 pl-0 text-xs font-semibold">
                  {pb.body.name}
                </TableCell>
              </TableRow>
            ),
            ...rows.map((g) => <AxleRow key={g.key} body={pb.body} g={g} group={chassis[g.part]!} units={units} />),
          ];
        })}
      </TableBody>
    </Table>
  );
}

function AxleRow({ body, g, group, units }: { body: CargoBody; g: AxleLoad; group: AxleGroup; units: Units }) {
  const setBodyChassis = useStore((s) => s.setBodyChassis);
  const set = (field: 'x' | 'axles' | 'tare' | 'max', value: number | undefined) =>
    setBodyChassis(body.id, withChassisValue(body.chassis, g.part, field, value));
  const ahead = isAhead(g.part, body.kind);
  const label = groupLabel(g);
  const tone = axleTone(g);
  const problem = axleProblem(g);
  const changed = (['x', 'axles', 'tare', 'max'] as const).some((f) => isOverridden(body, g.part, f));
  const coupling = g.axles === 0;
  const [xMin, xMax] = AXLE_X_LIMIT;

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="py-1.5 pl-0 whitespace-normal">
        <div className="flex items-center gap-1">
          <span className="font-medium">{label}</span>
          {changed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={`Типичные значения: ${label}`}
                  onClick={() => {
                    const { [g.part]: _, ...rest } = body.chassis ?? {};
                    setBodyChassis(body.id, rest);
                  }}
                >
                  <RotateCcw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Вернуть типичные значения</TooltipContent>
            </Tooltip>
          )}
        </div>
        {coupling && <div className="text-[11px] text-muted-foreground">передаёт вес {g.kind === 'semi' ? 'на тягач' : 'на машину впереди'}</div>}
      </TableCell>
      <TableCell className="py-1.5 whitespace-normal">
        <div className={cn('flex items-center gap-1 text-sm font-semibold tabular-nums', tone && toneText[tone])}>
          {tone && <TriangleAlert className="size-3.5 shrink-0" />}
          {formatWeight(g.load)}
        </div>
        <div className={cn('text-[11px] tabular-nums', problem && tone ? toneText[tone] : 'text-muted-foreground')}>
          {problem ?? (g.axles > 1 ? `по ${formatWeight(g.perAxle)} на ось` : `груз ${formatWeight(g.cargo)}`)}
        </div>
      </TableCell>
      <TableCell className="py-1.5">
        {axlesEditable(g.part) ? (
          <Select value={String(group.axles)} onValueChange={(v) => set('axles', Number(v))}>
            <SelectTrigger size="sm" className="h-8 w-14 text-xs" aria-label={`Осей: ${label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(g.part === 'tractorDrive' ? [1, 2] : [1, 2, 3, 4]).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="pl-1 text-muted-foreground tabular-nums">{coupling ? '—' : group.axles}</span>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        {positionEditable(group, g.part, body.kind) ? (
          <NumberField
            label={`${label}: ${ahead ? 'перед кузовом' : 'от передней стенки'}`}
            hideLabel
            value={Math.abs(group.x)}
            units={units}
            min={1}
            max={ahead ? -xMin : xMax}
            suffix={ahead ? 'впереди' : undefined}
            onCommit={(cm) => set('x', ahead ? -cm : cm)}
          />
        ) : (
          <span className="pl-1 text-muted-foreground">на сцепке</span>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        <WeightField label={`${label}: порожняя`} hideLabel kg={group.tare} unit="t" max={AXLE_WEIGHT_LIMIT} placeholder="0" onCommit={(kg) => set('tare', kg)} />
      </TableCell>
      <TableCell className="py-1.5 pr-0">
        {coupling ? (
          <span className="pl-1 text-muted-foreground">—</span>
        ) : (
          <WeightField label={`${label}: допустимо`} hideLabel kg={group.max} unit="t" max={AXLE_WEIGHT_LIMIT} placeholder="нет" onCommit={(kg) => set('max', kg)} />
        )}
      </TableCell>
    </TableRow>
  );
}
