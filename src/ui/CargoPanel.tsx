import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, PackagePlus, Plus, RotateCw, Trash2, X } from 'lucide-react';
import type { CargoItem, Dims } from '../core/types';
import { CARGO_COLORS, CARGO_PRESETS } from '../core/presets';
import type { Placement } from '../core/stats';
import { UNIT_LABEL, formatLength, formatVolume, type Units } from '../core/units';
import { getEngine } from '../scene/engineRegistry';
import { useStore } from '../store/useStore';
import { useUi } from '../store/useUi';
import { IconButton, NumberField, Stepper } from './controls';
import { cx, usePlacements, useUnits } from './hooks';

/** Side panel: add cargo, list of cargo, inspector of the selected item. */
export function CargoPanel() {
  const setPanelOpen = useUi((s) => s.setPanelOpen);
  return (
    <div className="cargo-panel">
      <div className="panel-drawer-head">
        <span>Грузы</span>
        <IconButton title="Закрыть" onClick={() => setPanelOpen(false)}>
          <X size={18} />
        </IconButton>
      </div>
      <AddCargoForm />
      <CargoList />
    </div>
  );
}

function dimsText(d: Dims, units: Units): string {
  return `${formatLength(d.w, units, false)} × ${formatLength(d.h, units, false)} × ${formatLength(d.l, units, false)} ${UNIT_LABEL[units]}`;
}

function AddCargoForm() {
  const addItems = useStore((s) => s.addItems);
  const units = useUnits();
  const [dims, setDims] = useState<Dims>({ l: 120, w: 80, h: 150 });
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addItems({ dims, name, count });
  };

  return (
    <form className="panel-section add-form" onSubmit={submit}>
      <div className="section-head">
        <h2>Новый груз</h2>
      </div>
      <div className="dims-grid">
        <NumberField live label="Ширина" value={dims.w} units={units} onCommit={(w) => setDims((d) => ({ ...d, w }))} />
        <NumberField live label="Высота" value={dims.h} units={units} onCommit={(h) => setDims((d) => ({ ...d, h }))} />
        <NumberField live label="Длина" value={dims.l} units={units} onCommit={(l) => setDims((d) => ({ ...d, l }))} />
      </div>
      <div className="add-row">
        <input
          className="input"
          placeholder="Название (необязательно)"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <Stepper value={count} onChange={setCount} label="Количество" />
        <button type="submit" className="btn btn-primary btn-add" title="Добавить груз на док">
          <Plus size={20} />
        </button>
      </div>
      <div className="preset-chips" aria-label="Типовые грузы">
        {CARGO_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="chip"
            onClick={() => {
              setDims(p.dims);
              setName(p.name);
            }}
          >
            {p.name}
            <small>{dimsText(p.dims, units)}</small>
          </button>
        ))}
      </div>
    </form>
  );
}

function CargoList() {
  const items = useStore((s) => s.items);
  const selectedId = useStore((s) => s.selectedId);
  const clearItems = useStore((s) => s.clearItems);
  const placements = usePlacements();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);

  return (
    <section className="panel-section list-section">
      <div className="section-head">
        <h2>
          Список <span className="count">{items.length}</span>
        </h2>
        <span className="section-hint">Ш × В × Д</span>
        {items.length > 0 && (
          <button
            type="button"
            className={cx('btn btn-ghost btn-sm', confirmClear && 'btn-danger-soft')}
            onClick={() => {
              if (confirmClear) {
                clearItems();
                setConfirmClear(false);
              } else setConfirmClear(true);
            }}
          >
            {confirmClear ? 'Точно удалить все?' : 'Очистить'}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <PackagePlus size={28} />
          <p>Грузов пока нет. Задайте размеры выше и нажмите «+» — груз появится на доке у дверей фуры.</p>
        </div>
      ) : (
        <ul className="cargo-list">
          {items.map((item) => (
            <CargoRow key={item.id} item={item} placement={placements.get(item.id)} selected={item.id === selectedId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ placement, multiBody }: { placement?: Placement; multiBody: boolean }) {
  if (!placement) return null;
  if (placement.status === 'overflow') return <span className="badge badge--danger">За габаритами</span>;
  if (placement.status === 'inside') {
    return <span className="badge badge--ok">{multiBody && placement.body ? placement.body.body.name : 'В кузове'}</span>;
  }
  return <span className="badge">Док</span>;
}

function CargoRow({ item, placement, selected }: { item: CargoItem; placement?: Placement; selected: boolean }) {
  const select = useStore((s) => s.select);
  const rotateItem = useStore((s) => s.rotateItem);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);
  const multiBody = useStore((s) => s.bodies.length > 1);
  const units = useUnits();
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  return (
    <li ref={ref} className={cx('cargo-row', selected && 'is-selected', placement && `is-${placement.status}`)}>
      <div className="row-line">
        <button
          type="button"
          className="row-main"
          onClick={() => select(selected ? null : item.id)}
          onDoubleClick={() => getEngine()?.focusItem(item.id)}
          title="Выбрать (двойной клик — показать на сцене)"
        >
          <span className="swatch" style={{ background: item.color }}>
            {item.seq}
          </span>
          <span className="row-text">
            <span className="row-title">{item.name}</span>
            <span className="row-dims">{dimsText(item.dims, units)}</span>
          </span>
          <StatusBadge placement={placement} multiBody={multiBody} />
        </button>
        <div className="row-actions">
          <IconButton title="Повернуть на 90° (R)" onClick={() => rotateItem(item.id)}>
            <RotateCw size={15} />
          </IconButton>
          <IconButton title="Дублировать (Ctrl+D)" onClick={() => duplicateItem(item.id)}>
            <Copy size={15} />
          </IconButton>
          <IconButton title="Удалить (Del)" tone="danger" onClick={() => removeItem(item.id)}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
      {selected && <ItemInspector item={item} units={units} />}
    </li>
  );
}

function ItemInspector({ item, units }: { item: CargoItem; units: Units }) {
  const updateItem = useStore((s) => s.updateItem);
  const [name, setName] = useState(item.name);
  useEffect(() => setName(item.name), [item.name]);

  const commitName = () => {
    if (name.trim() && name !== item.name) updateItem(item.id, { name });
    else setName(item.name);
  };
  const setDim = (key: keyof Dims) => (v: number) => updateItem(item.id, { dims: { ...item.dims, [key]: v } });

  return (
    <div className="inspector">
      <label className="field field--wide">
        <span className="field-label">Название</span>
        <span className="field-box">
          <input
            className="field-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </span>
      </label>
      <div className="dims-grid">
        <NumberField label="Ширина" value={item.dims.w} units={units} onCommit={setDim('w')} />
        <NumberField label="Высота" value={item.dims.h} units={units} onCommit={setDim('h')} />
        <NumberField label="Длина" value={item.dims.l} units={units} onCommit={setDim('l')} />
      </div>
      <div className="color-row" role="radiogroup" aria-label="Цвет">
        {CARGO_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === item.color}
            aria-label={c}
            className={cx('color-dot', c === item.color && 'is-active')}
            style={{ background: c }}
            onClick={() => updateItem(item.id, { color: c })}
          />
        ))}
      </div>
      <div className="inspector-meta">
        <span>{item.orientation.yaw === 90 ? 'Повёрнут на 90°' : 'Исходная ориентация'}</span>
        <span>{formatVolume(item.dims.l * item.dims.w * item.dims.h)}</span>
      </div>
    </div>
  );
}
