import { ChevronDown, Plus, Truck, X } from 'lucide-react';
import { BODY_LIMITS, BODY_MAX_LOAD_LIMIT, MAX_BODIES, VEHICLE_PRESETS } from '../core/presets';
import { UNIT_LABEL, formatLength, formatWeight } from '../core/units';
import { useStore } from '../store/useStore';
import { useUi } from '../store/useUi';
import { vehicleDims, vehicleIcon } from '@/components/plans/vehicles';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { NumberField, WeightField } from './fields';
import { useStats, useUnits } from './hooks';

/** Floating card over the scene: vehicle preset, one block per cargo body, "+ trailer". */
export function VehiclePanel({ className }: { className?: string }) {
  const bodies = useStore((s) => s.bodies);
  const updateBody = useStore((s) => s.updateBody);
  const setBodyMaxLoad = useStore((s) => s.setBodyMaxLoad);
  const addTrailer = useStore((s) => s.addTrailer);
  const removeBody = useStore((s) => s.removeBody);
  const applyPreset = useStore((s) => s.applyVehiclePreset);
  const collapsed = useUi((s) => s.vehicleCollapsed);
  const setCollapsed = useUi((s) => s.setVehicleCollapsed);
  const units = useUnits();
  const stats = useStats();
  const f = (cm: number) => formatLength(cm, units, false);
  const [lMin, lMax] = BODY_LIMITS.l;
  const [wMin, wMax] = BODY_LIMITS.w;
  const [hMin, hMax] = BODY_LIMITS.h;

  return (
    <section
      aria-label="Транспорт"
      className={cn(
        'pointer-events-auto flex max-h-full w-[320px] max-w-full flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-lg shadow-foreground/5 backdrop-blur-md',
        className,
      )}
    >
      <header className="flex items-center gap-2 py-2 pr-2 pl-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Truck className="size-[18px]" />
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          <span className="block text-sm font-semibold">Транспорт</span>
          {collapsed && (
            <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
              {bodies.map((b) => `${f(b.dims.l)} × ${f(b.dims.w)} × ${f(b.dims.h)}`).join(' + ')} {UNIT_LABEL[units]}
            </span>
          )}
        </button>
        {!collapsed && (
          <Select value="" onValueChange={applyPreset}>
            <SelectTrigger size="sm" className="w-[118px] text-xs" aria-label="Шаблон транспорта">
              <SelectValue placeholder="Шаблон…" />
            </SelectTrigger>
            <SelectContent align="end">
              {VEHICLE_PRESETS.map((p) => {
                const Icon = vehicleIcon(p.id);
                return (
                  <SelectItem key={p.id} value={p.id}>
                    <Icon className="text-muted-foreground" />
                    <span className="flex flex-1 items-baseline justify-between gap-3">
                      {p.name}
                      <span className="text-xs text-muted-foreground tabular-nums">{vehicleDims(p)}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          <ChevronDown className={cn('transition-transform', !collapsed && 'rotate-180')} />
        </Button>
      </header>

      {!collapsed && (
        <div className="min-h-0 space-y-2.5 overflow-y-auto overscroll-contain border-t px-3 pt-3 pb-3">
          {bodies.map((b, i) => {
            const s = stats.bodies.find((x) => x.id === b.id);
            return (
              <div key={b.id} className="space-y-2">
                {bodies.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-xs font-semibold">{b.name}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Убрать кузов"
                          onClick={() => removeBody(b.id)}
                        >
                          <X />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Убрать кузов — грузы переедут на док</TooltipContent>
                    </Tooltip>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label="Длина" value={b.dims.l} units={units} min={lMin} max={lMax} onCommit={(l) => updateBody(b.id, { ...b.dims, l })} />
                  <NumberField label="Ширина" value={b.dims.w} units={units} min={wMin} max={wMax} onCommit={(w) => updateBody(b.id, { ...b.dims, w })} />
                  <NumberField label="Высота" value={b.dims.h} units={units} min={hMin} max={hMax} onCommit={(h) => updateBody(b.id, { ...b.dims, h })} />
                </div>
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <WeightField
                    label="Грузоподъёмность"
                    kg={b.maxLoad}
                    unit="t"
                    max={BODY_MAX_LOAD_LIMIT}
                    onCommit={(kg) => setBodyMaxLoad(b.id, kg > 0 ? kg : undefined)}
                  />
                  {s && (
                    <span
                      className={cn(
                        'pb-2 text-right text-[11px] text-muted-foreground tabular-nums',
                        s.overweight && 'font-medium text-destructive',
                      )}
                    >
                      загружено {formatWeight(s.weight)}
                    </span>
                  )}
                </div>
                {i < bodies.length - 1 && <div className="border-t pt-0.5" />}
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed text-muted-foreground"
            onClick={addTrailer}
            disabled={bodies.length >= MAX_BODIES}
          >
            <Plus /> {bodies.length >= MAX_BODIES ? `Не больше ${MAX_BODIES} кузовов` : 'Прицеп'}
          </Button>
        </div>
      )}
    </section>
  );
}
