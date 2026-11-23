import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { parseNumber } from '@/core/units';
import { plainNumber, type NumberState } from './kit';

/**
 * Lists of rows with number fields (cargo groups of the LDM, axle and volume calculators): the texts live in
 * one state, each field gets a NumberState over its text.
 */

export type RowValues<K extends string> = Record<K, string> & { key: number };

export interface RowsApi<K extends string> {
  rows: RowValues<K>[];
  field(row: RowValues<K>, name: K, min: number, max: number): NumberState;
  add(): void;
  remove(key: number): void;
  /** The parsed rows; null when a field is wrong. */
  values(limits: Record<K, [number, number]>): Array<Record<K, number>> | null;
}

export function useRows<K extends string>(initial: ReadonlyArray<Record<K, number>>, blank: Record<K, number>, digits = 2): RowsApi<K> {
  const toText = (r: Record<K, number>, key: number) => {
    const out = { key } as RowValues<K>;
    for (const k of Object.keys(r) as K[]) (out as Record<K, string>)[k] = plainNumber(r[k], digits);
    return out;
  };
  const [rows, setRows] = useState(() => initial.map((r, i) => toText(r, i)));
  const parse = (text: string, min: number, max: number) => {
    const n = parseNumber(text);
    return n !== null && n >= min && n <= max ? n : null;
  };
  return {
    rows,
    field(row, name, min, max) {
      const text = row[name];
      const set = (t: string) => setRows((list) => list.map((r) => (r.key === row.key ? { ...r, [name]: t } : r)));
      return { text, value: parse(text, min, max), set, put: (v: number) => set(plainNumber(v, digits)) };
    },
    add() {
      setRows((list) => [...list, toText(blank, Math.max(-1, ...list.map((r) => r.key)) + 1)]);
    },
    remove(key) {
      setRows((list) => (list.length > 1 ? list.filter((r) => r.key !== key) : list));
    },
    values(limits) {
      const out: Array<Record<K, number>> = [];
      for (const row of rows) {
        const parsed = {} as Record<K, number>;
        for (const k of Object.keys(limits) as K[]) {
          const n = parse(row[k], limits[k][0], limits[k][1]);
          if (n === null) return null;
          parsed[k] = n;
        }
        out.push(parsed);
      }
      return out;
    },
  };
}

/** A row of fields with its number and a remove button. */
export function RowCard({ n, onRemove, canRemove, children }: { n: number; onRemove(): void; canRemove: boolean; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-site-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-geist-mono text-[11px] text-site-faint">#{n}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Убрать строку ${n}`}
            className="grid size-6 place-items-center rounded-full text-site-faint transition-colors outline-none hover:bg-site-soft hover:text-site-fg focus-visible:ring-3 focus-visible:ring-site-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
