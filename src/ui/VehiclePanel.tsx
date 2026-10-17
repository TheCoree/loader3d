import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Truck, X } from 'lucide-react';
import { MAX_BODIES, VEHICLE_PRESETS } from '../core/presets';
import { formatLength } from '../core/units';
import { useStore } from '../store/useStore';
import { IconButton, NumberField } from './controls';
import { useUnits } from './hooks';

const startCollapsed = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;

/** Vehicle parameters: one row per cargo body, preset picker and "+ trailer". */
export function VehiclePanel() {
  const bodies = useStore((s) => s.bodies);
  const updateBody = useStore((s) => s.updateBody);
  const addTrailer = useStore((s) => s.addTrailer);
  const removeBody = useStore((s) => s.removeBody);
  const applyPreset = useStore((s) => s.applyVehiclePreset);
  const units = useUnits();
  const [collapsed, setCollapsed] = useState(startCollapsed);

  return (
    <section className="card vehicle-card" aria-label="Транспорт">
      <header className="card-header">
        <span className="card-icon">
          <Truck size={16} />
        </span>
        <span className="card-title">Транспорт</span>
        <select
          className="select"
          value=""
          onChange={(e) => applyPreset(e.target.value)}
          aria-label="Шаблон транспорта"
        >
          <option value="" disabled>
            Шаблон…
          </option>
          {VEHICLE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <IconButton title={collapsed ? 'Развернуть' : 'Свернуть'} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </IconButton>
      </header>

      {collapsed ? (
        <div className="vehicle-summary">
          {bodies.map((b) => (
            <span key={b.id} className="vehicle-summary-item">
              <b>{b.name}</b> {formatLength(b.dims.l, units, false)} × {formatLength(b.dims.w, units, false)} ×{' '}
              {formatLength(b.dims.h, units)}
            </span>
          ))}
        </div>
      ) : (
        <div className="card-body">
          {bodies.map((b, i) => (
            <div key={b.id} className="body-row">
              <div className="body-row-head">
                <span className="body-index">{i + 1}</span>
                <span className="body-name">{b.name}</span>
                {bodies.length > 1 && (
                  <IconButton title="Убрать" tone="danger" onClick={() => removeBody(b.id)}>
                    <X size={15} />
                  </IconButton>
                )}
              </div>
              <div className="dims-grid">
                <NumberField label="Длина" value={b.dims.l} units={units} min={100} max={2500} onCommit={(l) => updateBody(b.id, { ...b.dims, l })} />
                <NumberField label="Ширина" value={b.dims.w} units={units} min={100} max={400} onCommit={(w) => updateBody(b.id, { ...b.dims, w })} />
                <NumberField label="Высота" value={b.dims.h} units={units} min={100} max={450} onCommit={(h) => updateBody(b.id, { ...b.dims, h })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-dashed"
            onClick={addTrailer}
            disabled={bodies.length >= MAX_BODIES}
            title={bodies.length >= MAX_BODIES ? `Не больше ${MAX_BODIES} кузовов` : 'Добавить прицеп'}
          >
            <Plus size={16} /> Прицеп
          </button>
        </div>
      )}
    </section>
  );
}
