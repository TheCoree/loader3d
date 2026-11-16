import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Check, Move3d, Ruler, RotateCcw, ScanEye } from 'lucide-react';
import type { Units } from '@/core/units';
import { acquireDisplayPreview } from '@/scene/DisplayPreview';
import { DEFAULT_SETTINGS, WALL_OPACITY_RANGE, XRAY_OPACITY_RANGE, useStore, type Settings, type XrayMode } from '@/store/useStore';
import { useUi } from '@/store/useUi';
import { LogoLoader } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { DISPLAY_KEYS, DISPLAY_PRESETS, activePreset } from './displayPresets';
import { XRAY_MODES } from './XrayControl';

type BoolKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

const UNITS: Array<{ value: Units; label: string }> = [
  { value: 'mm', label: 'мм' },
  { value: 'cm', label: 'см' },
  { value: 'm', label: 'м' },
];

/** The sample truck in the dialog, drawn with the settings being edited. */
function Preview({ settings }: { settings: Settings }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(settings);
  latest.current = settings;
  const [ready, setReady] = useState(false);
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // After the dialog has opened: making the WebGL context in the same frame would stall its animation.
    const timer = window.setTimeout(() => {
      const preview = acquireDisplayPreview();
      preview.attach(host.current!);
      preview.apply(latest.current);
      setAttached(true);
      void preview.ready().then(() => !cancelled && setReady(true));
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      acquireDisplayPreview().detach();
    };
  }, []);

  useEffect(() => {
    if (attached) acquireDisplayPreview().apply(settings);
  }, [settings, attached]);

  return (
    <div className="relative min-h-56 flex-1 overflow-hidden rounded-xl bg-scene ring-1 ring-foreground/[0.07] sm:min-h-72">
      <div
        ref={host}
        className={cn('absolute inset-0 touch-none transition-opacity duration-300 select-none', ready ? 'opacity-100' : 'opacity-0')}
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <LogoLoader className="size-8 opacity-60" />
        </div>
      )}
      <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">
        <Move3d className="size-3.5" /> Покрутите пример мышью или пальцем
      </span>
    </div>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="flex items-center gap-2 px-1 pb-1 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {title}
      </h3>
      <div className="divide-y rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function OpacitySlider({
  value,
  range,
  label,
  onChange,
}: {
  value: number;
  range: [number, number];
  label: string;
  onChange(v: number): void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 pt-1 pb-3">
      <Slider
        min={range[0]}
        max={range[1]}
        step={0.01}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
        className="flex-1"
      />
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

/**
 * «Настройки отображения»: presets for a quick choice and every display option one by one, with a live
 * sample truck. Changes go straight into the settings (the editor behind follows), as in the «Вид» menu.
 */
export function DisplaySettingsDialog() {
  const open = useUi((s) => s.displayOpen);
  const setOpen = useUi((s) => s.setDisplayOpen);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const updateSettings = useStore((s) => s.updateSettings);
  const preset = activePreset(settings);

  const toggle = (key: BoolKey, label: string, hint?: string) => (
    <Row label={label} hint={hint}>
      <Switch checked={settings[key]} onCheckedChange={(v) => setSetting(key, v)} aria-label={label} />
    </Row>
  );

  const reset = () =>
    updateSettings({
      ...Object.fromEntries(DISPLAY_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]])),
      wallOpacity: DEFAULT_SETTINGS.wallOpacity,
      highlightOverflow: DEFAULT_SETTINGS.highlightOverflow,
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        overlayClassName="bg-black/30 supports-backdrop-filter:backdrop-blur-none"
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(80rem,calc(100%-2rem))] lg:h-[min(880px,calc(100dvh-2rem))]"
      >
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle>Настройки отображения</DialogTitle>
          <DialogDescription>Что показывать в сцене. Изменения применяются сразу и сохраняются в аккаунте.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
          <div className="flex flex-col gap-4 p-5 lg:min-h-0 lg:p-6">
            <Preview settings={settings} />
            <section className="space-y-2">
              <h3 className="flex items-baseline justify-between px-1 text-xs font-medium text-muted-foreground">
                Готовые режимы
                {!preset && <span className="font-normal">сейчас — свой набор</span>}
              </h3>
              <div role="radiogroup" aria-label="Готовые режимы" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                {DISPLAY_PRESETS.map((p) => {
                  const active = preset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => updateSettings(p.values)}
                      className={cn(
                        'relative rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        active ? 'border-foreground bg-foreground text-background' : 'bg-card hover:bg-muted',
                      )}
                    >
                      <span className="block pr-5 text-sm font-medium">{p.name}</span>
                      <span className={cn('mt-0.5 block text-xs leading-snug', active ? 'text-background/65' : 'text-muted-foreground')}>
                        {p.hint}
                      </span>
                      {active && <Check className="absolute top-3 right-3 size-4" />}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Scrolls on its own; the scrollbar runs along the dialog's right edge, the padding keeps rings unclipped. */}
          <div className="space-y-5 border-t px-5 py-5 [scrollbar-width:thin] lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:px-6 lg:py-6">
            <Group icon={<Box />} title="Кузов и машина">
              {toggle('showBodyWalls', 'Стенки и крыша', 'Полупрозрачные стенки кузова')}
              {settings.showBodyWalls && (
                <OpacitySlider
                  value={settings.wallOpacity}
                  range={WALL_OPACITY_RANGE}
                  label="Прозрачность стенок"
                  onChange={(v) => setSetting('wallOpacity', v)}
                />
              )}
              {toggle('showBodyPosts', 'Стойки и дуги', 'Линии между рёбрами кузова')}
              {toggle('showFloorMarks', 'Разметка пола', 'Поперечные линии через каждый метр')}
              {toggle('showChassis', 'Кабина, рама и колёса')}
              {toggle('showShadows', 'Тени')}
            </Group>

            <Group icon={<Ruler />} title="Размеры и подписи">
              {toggle('showDimensions', 'Размерные линии', 'Габариты кузовов и выбранного груза')}
              {toggle('showLoadLength', 'Длина загрузки', 'Линейки на земле: занято и свободно до дверей')}
              {toggle('showLabels', 'Номера на грузах')}
              {toggle('highlightOverflow', 'Подсвечивать выходы за грани')}
              <Row label="Единицы">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={settings.units}
                  onValueChange={(v) => v && setSetting('units', v as Units)}
                  aria-label="Единицы"
                >
                  {UNITS.map((u) => (
                    <ToggleGroupItem key={u.value} value={u.value} className="px-3">
                      {u.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Row>
            </Group>

            <Group icon={<ScanEye />} title="Прозрачность грузов">
              <div className="grid grid-cols-2 gap-1.5 p-2">
                {XRAY_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    title={m.hint}
                    aria-pressed={settings.xray === m.value}
                    onClick={() => setSetting('xray', m.value as XrayMode)}
                    className={cn(
                      'rounded-lg px-2.5 py-2 text-left text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      settings.xray === m.value ? 'bg-foreground text-background' : 'hover:bg-muted',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {settings.xray !== 'off' && (
                <OpacitySlider
                  value={settings.xrayOpacity}
                  range={XRAY_OPACITY_RANGE}
                  label="Насколько прозрачны"
                  onChange={(v) => setSetting('xrayOpacity', v)}
                />
              )}
            </Group>
          </div>
        </div>

        <DialogFooter className="m-0 flex-row items-center justify-between rounded-b-xl border-t bg-muted/40 px-5 py-3 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> Сбросить
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
