import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SceneEngine } from '../scene/SceneEngine';
import { setEngine } from '../scene/engineRegistry';
import { StatsBar } from './StatsBar';
import { VehiclePanel } from './VehiclePanel';
import { ViewControls } from './ViewControls';

const HINT_KEY = 'loader3d:hint-dismissed';

function readHintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** The 3D scene with its floating overlays. */
export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let engine: SceneEngine;
    try {
      engine = new SceneEngine(hostRef.current!);
    } catch (e) {
      console.error(e);
      setError('Не удалось запустить 3D (WebGL недоступен в этом браузере).');
      return;
    }
    setEngine(engine);
    // Handy for debugging in the browser console during development.
    if (import.meta.env.DEV) Object.assign(window, { __loader3d: engine });
    return () => {
      setEngine(null);
      engine.dispose();
    };
  }, []);

  return (
    <div className="viewport">
      <div ref={hostRef} className="viewport-host" />
      {error && <div className="viewport-error">{error}</div>}
      <div className="overlay overlay-tl">
        <VehiclePanel />
      </div>
      <div className="overlay overlay-tr">
        <ViewControls />
      </div>
      <div className="overlay overlay-bottom">
        <Hint />
        <StatsBar />
      </div>
    </div>
  );
}

function Hint() {
  const [dismissed, setDismissed] = useState(readHintDismissed);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  if (dismissed) return null;
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="hint">
      {coarse ? (
        <span>
          <b>Палец по фону</b> — вращение · <b>палец на грузе</b> — перемещение · <b>два пальца</b> — масштаб
        </span>
      ) : (
        <span>
          <b>Тянуть фон</b> — вращение · <b>тянуть груз</b> — перемещение · <b>R</b> — поворот · <b>Del</b> — удалить
        </span>
      )}
      <button type="button" className="hint-close" onClick={close} aria-label="Скрыть подсказку">
        <X size={14} />
      </button>
    </div>
  );
}
