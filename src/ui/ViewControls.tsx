import { Lock, LockOpen, Maximize2 } from 'lucide-react';
import type { ViewPreset } from '../scene/CameraRig';
import { getEngine } from '../scene/engineRegistry';
import { useStore } from '../store/useStore';
import { cx } from './hooks';

const VIEWS: Array<{ id: ViewPreset; label: string; title: string }> = [
  { id: 'iso', label: '3D', title: 'Общий вид' },
  { id: 'top', label: 'Сверху', title: 'Вид сверху' },
  { id: 'side', label: 'Сбоку', title: 'Вид сбоку' },
  { id: 'rear', label: 'Сзади', title: 'Вид со стороны дверей' },
];

/** Camera presets, "show all" and the optional camera lock. */
export function ViewControls() {
  const locked = useStore((s) => s.settings.cameraLocked);
  const setSetting = useStore((s) => s.setSetting);

  return (
    <div className="card view-controls" role="toolbar" aria-label="Камера">
      {VIEWS.map((v) => (
        <button key={v.id} type="button" className="view-btn" title={v.title} onClick={() => getEngine()?.setView(v.id)}>
          {v.label}
        </button>
      ))}
      <span className="view-sep" />
      <button type="button" className="view-btn view-btn--icon" title="Показать всё" onClick={() => getEngine()?.fitAll()}>
        <Maximize2 size={16} />
      </button>
      <button
        type="button"
        className={cx('view-btn view-btn--icon', locked && 'is-active')}
        title={locked ? 'Камера зафиксирована — нажмите, чтобы освободить' : 'Зафиксировать камеру (вращение и панорама)'}
        aria-pressed={locked}
        onClick={() => setSetting('cameraLocked', !locked)}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>
    </div>
  );
}
