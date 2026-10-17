import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Minus, Plus } from 'lucide-react';
import { UNIT_LABEL, formatPlain, fromUnits, parseNumber, type Units } from '../core/units';
import { cx } from './hooks';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger';
  active?: boolean;
}

export function IconButton({ tone = 'default', active, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={rest.title}
      className={cx('icon-btn', tone === 'danger' && 'icon-btn--danger', active && 'is-active', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange(value: boolean): void;
  label: ReactNode;
  className?: string;
}

export function Switch({ checked, onChange, label, className }: SwitchProps) {
  return (
    <label className={cx('switch', checked && 'is-on', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  /** Value in centimetres. */
  value: number;
  units: Units;
  onCommit(cm: number): void;
  /** Report every valid keystroke instead of committing on blur / Enter. */
  live?: boolean;
  min?: number;
  max?: number;
}

/**
 * Length input that shows and accepts values in the current units (decimal comma or point).
 * Arrow keys step by 1 unit (Shift — 10).
 */
export function NumberField({ label, value, units, onCommit, live, min = 1, max = 5000 }: NumberFieldProps) {
  const display = useMemo(() => formatPlain(value, units), [value, units]);
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(display);
  }, [display, focused]);

  const parse = (text: string): number | null => {
    const n = parseNumber(text);
    if (n === null || n <= 0) return null;
    return Math.min(max, Math.max(min, fromUnits(n, units)));
  };

  const commit = () => {
    const cm = parse(draft);
    if (cm === null) {
      setDraft(display);
      return;
    }
    if (Math.abs(cm - value) > 1e-6) onCommit(cm);
    setDraft(formatPlain(cm, units));
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
      const step = fromUnits(e.shiftKey ? 10 : 1, units) * (e.key === 'ArrowUp' ? 1 : -1);
      const current = parse(draft) ?? value;
      const next = Math.min(max, Math.max(min, current + step));
      setDraft(formatPlain(next, units));
      onCommit(next);
    }
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box">
        <input
          className="field-input"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (live) {
              const cm = parse(e.target.value);
              if (cm !== null) onCommit(cm);
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
        <span className="field-unit">{UNIT_LABEL[units]}</span>
      </span>
    </label>
  );
}

interface StepperProps {
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  label?: string;
}

export function Stepper({ value, onChange, min = 1, max = 200, label }: StepperProps) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v) || min)));
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" className="stepper-btn" onClick={() => set(value - 1)} disabled={value <= min} aria-label="Меньше">
        <Minus size={14} />
      </button>
      <input
        className="stepper-input"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))}
        aria-label={label}
      />
      <button type="button" className="stepper-btn" onClick={() => set(value + 1)} disabled={value >= max} aria-label="Больше">
        <Plus size={14} />
      </button>
    </div>
  );
}

interface PopoverProps {
  trigger: (props: { open: boolean; toggle(): void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function Popover({ trigger, children, align = 'right', className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={cx('popover-anchor', className)} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={cx('popover', `popover--${align}`)}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('segmented-btn', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
