import { CargoPanel } from './ui/CargoPanel';
import { HelpDialog } from './ui/HelpDialog';
import { TopBar } from './ui/TopBar';
import { Viewport } from './ui/Viewport';
import { cx } from './ui/hooks';
import { useUi } from './store/useUi';

export function App() {
  const panelOpen = useUi((s) => s.panelOpen);
  const setPanelOpen = useUi((s) => s.setPanelOpen);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Viewport />
        <aside className={cx('sidebar', panelOpen && 'is-open')}>
          <CargoPanel />
        </aside>
        {panelOpen && <div className="scrim" onClick={() => setPanelOpen(false)} />}
      </div>
      <HelpDialog />
    </div>
  );
}
