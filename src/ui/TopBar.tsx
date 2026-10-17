import { useRef, useState } from 'react';
import {
  Boxes,
  CircleHelp,
  Download,
  FolderOpen,
  Package,
  Redo2,
  RotateCcw,
  Settings2,
  Undo2,
  Upload,
} from 'lucide-react';
import type { Units } from '../core/units';
import { createDemoPlan, exportPlan, useStore } from '../store/useStore';
import { useUi } from '../store/useUi';
import { IconButton, Popover, Segmented, Switch } from './controls';
import { usePlacements } from './hooks';

const UNIT_OPTIONS: ReadonlyArray<{ value: Units; label: string }> = [
  { value: 'mm', label: 'мм' },
  { value: 'cm', label: 'см' },
  { value: 'm', label: 'м' },
];

export function TopBar() {
  const highlight = useStore((s) => s.settings.highlightOverflow);
  const setSetting = useStore((s) => s.setSetting);
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const itemCount = useStore((s) => s.items.length);
  const setHelpOpen = useUi((s) => s.setHelpOpen);
  const panelOpen = useUi((s) => s.panelOpen);
  const setPanelOpen = useUi((s) => s.setPanelOpen);
  const placements = usePlacements();
  const overflow = [...placements.values()].filter((p) => p.status === 'overflow').length;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Boxes size={18} />
        </span>
        <span className="brand-text">
          <span className="brand-name">Loader3D</span>
          <span className="brand-sub">План загрузки</span>
        </span>
      </div>

      <div className="topbar-center">
        <Switch
          className="overflow-switch"
          checked={highlight}
          onChange={(v) => setSetting('highlightOverflow', v)}
          label={
            <>
              <span className="label-long">Подсвечивать выходы за грани</span>
              <span className="label-short">Выходы за грани</span>
              <span className="label-tiny">Грани</span>
              {overflow > 0 && <span className="switch-badge">{overflow}</span>}
            </>
          }
        />
      </div>

      <div className="topbar-actions">
        <IconButton title="Отменить (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton title="Повторить (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={18} />
        </IconButton>
        <span className="topbar-sep" />
        <FileMenu />
        <SettingsMenu />
        <IconButton title="Справка по управлению" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={18} />
        </IconButton>
        <button type="button" className="btn btn-soft panel-toggle" onClick={() => setPanelOpen(!panelOpen)}>
          <Package size={16} /> <span className="panel-toggle-text">Грузы</span> <span className="count">{itemCount}</span>
        </button>
      </div>
    </header>
  );
}

function SettingsMenu() {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <IconButton title="Настройки" active={open} onClick={toggle}>
          <Settings2 size={18} />
        </IconButton>
      )}
    >
      {() => (
        <div className="menu">
          <div className="menu-title">Отображение</div>
          <Switch checked={settings.showDimensions} onChange={(v) => setSetting('showDimensions', v)} label="Размерные линии" />
          <Switch checked={settings.showLabels} onChange={(v) => setSetting('showLabels', v)} label="Номера на грузах" />
          <div className="menu-title">Перемещение</div>
          <Switch checked={settings.snapping} onChange={(v) => setSetting('snapping', v)} label="Магнитная привязка" />
          <Switch
            checked={settings.resizeHandles}
            onChange={(v) => setSetting('resizeHandles', v)}
            label="Ручки изменения размера"
          />
          <div className="menu-title">Единицы</div>
          <Segmented value={settings.units} options={UNIT_OPTIONS} onChange={(u) => setSetting('units', u)} />
        </div>
      )}
    </Popover>
  );
}

function FileMenu() {
  const loadPlan = useStore((s) => s.loadPlan);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const download = () => {
    const plan = exportPlan(useStore.getState());
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `loader3d-plan-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const open = async (file: File) => {
    try {
      loadPlan(JSON.parse(await file.text()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать файл');
    }
  };

  return (
    <Popover
      className="file-menu"
      trigger={({ open: isOpen, toggle }) => (
        <IconButton title="План: сохранить / открыть" active={isOpen} onClick={toggle}>
          <FolderOpen size={18} />
        </IconButton>
      )}
    >
      {(close) => (
        <div className="menu">
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              download();
              close();
            }}
          >
            <Download size={16} /> Сохранить план (JSON)
          </button>
          <button type="button" className="menu-item" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Открыть план…
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              loadPlan(createDemoPlan());
              close();
            }}
          >
            <RotateCcw size={16} /> Загрузить пример
          </button>
          {error && <div className="menu-error">{error}</div>}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void open(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </Popover>
  );
}
