import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { UNIT_LABEL, formatPlain, fromUnits, parseNumber, type Units } from '../core/units';
import { cn } from '@/lib/utils';

interface ScalarFieldProps {
  label: string;
  /** Value in base units (cm, kg); undefined shows an empty field. */
  value: number | undefined;
  unit: string;
  format(value: number): string;
  /** Text typed by the user → base units, or null when it is not a valid value. */
  parse(text: string): number | null;
  /** Arrow keys: step in base units (Shift — ×10). */
  step: number;
  min: number;
  max: number;
  onCommit(value: number): void;
  /** Report every valid keystroke instead of committing on blur / Enter. */
  live?: boolean;
  placeholder?: string;
  className?: string;
}

/** Numeric input with a unit suffix: accepts a decimal comma or point, arrows step the value. */
function ScalarField({
  label,
  value,
  unit,
  format,
  parse,
  step,
  min,
  max,
  onCommit,
  live,
  placeholder,
  className,
}: ScalarFieldProps) {
  const id = useId();
  const display = useMemo(() => (value === undefined ? '' : format(value)), [value, format]);
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(display);
  }, [display, focused]);

  const read = (text: string): number | null => {
    const v = parse(text);
    return v === null ? null : Math.min(max, Math.max(min, v));
  };

  const commit = () => {
    const v = read(draft);
    if (v === null) {
      setDraft(display);
      return;
    }
    if (value === undefined || Math.abs(v - value) > 1e-6) onCommit(v);
    setDraft(format(v));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      if (!live) e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(display);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      const next = Math.min(max, Math.max(min, (read(draft) ?? value ?? 0) + delta));
      setDraft(format(next));
      onCommit(next);
    }
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex h-8 items-center gap-1 rounded-lg border border-input bg-background px-2.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <input
          id={id}
          className="w-full min-w-0 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground/60"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (live) {
              const v = read(e.target.value);
              if (v !== null) onCommit(v);
            }
          }}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={onKeyDown}
        />
        <span className="text-xs text-muted-foreground select-none">{unit}</span>
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  /** Value in centimetres. */
  value: number;
  units: Units;
  onCommit(cm: number): void;
  live?: boolean;
  min?: number;
  max?: number;
  className?: string;
}

/** Length in the current display units (мм / см / м); stored in centimetres. */
export function NumberField({ label, value, units, onCommit, live, min = 1, max = 5000, className }: NumberFieldProps) {
  return (
    <ScalarField
      label={label}
      value={value}
      unit={UNIT_LABEL[units]}
      format={(cm) => formatPlain(cm, units)}
      parse={(text) => {
        const n = parseNumber(text);
        return n === null || n <= 0 ? null : fromUnits(n, units);
      }}
      step={fromUnits(1, units)}
      min={min}
      max={max}
      onCommit={onCommit}
      live={live}
      className={className}
    />
  );
}

const kgFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, useGrouping: false });
const tFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, useGrouping: false });

interface WeightFieldProps {
  label: string;
  /** Weight in kg; undefined or 0 shows an empty field («не указан»). */
  kg: number | undefined;
  /** Shown and typed in kilograms or tonnes; stored in kg. */
  unit?: 'kg' | 't';
  onCommit(kg: number): void;
  live?: boolean;
  max: number;
  className?: string;
}

export function WeightField({ label, kg, unit = 'kg', onCommit, live, max, className }: WeightFieldProps) {
  const factor = unit === 't' ? 1000 : 1;
  return (
    <ScalarField
      label={label}
      value={kg ? kg : undefined}
      unit={unit === 't' ? 'т' : 'кг'}
      format={(v) => (unit === 't' ? tFormat : kgFormat).format(v / factor)}
      parse={(text) => {
        if (text.trim() === '') return 0;
        const n = parseNumber(text);
        return n === null || n < 0 ? null : n * factor;
      }}
      step={unit === 't' ? 500 : 10}
      min={0}
      max={max}
      onCommit={onCommit}
      live={live}
      placeholder="не указан"
      className={className}
    />
  );
}

interface StepperProps {
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  label: string;
  className?: string;
}

export function Stepper({ value, onChange, min = 1, max = 200, label, className }: StepperProps) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v) || min)));
  const button =
    'grid h-full w-8 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
  return (
    <div
      className={cn(
        'flex h-8 items-center overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        className,
      )}
      role="group"
      aria-label={label}
    >
      <button type="button" className={button} onClick={() => set(value - 1)} disabled={value <= min} aria-label="Меньше">
        <Minus className="size-3.5" />
      </button>
      <input
        className="h-full w-full min-w-8 bg-transparent text-center text-sm tabular-nums outline-none"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))}
        aria-label={label}
      />
      <button type="button" className={button} onClick={() => set(value + 1)} disabled={value >= max} aria-label="Больше">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
