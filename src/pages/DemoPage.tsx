import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DemoFallback } from '@/components/RouteGuards';
import { DemoGate } from '@/editor/DemoGate';
import { DemoGuide } from '@/editor/DemoGuide';
import { DemoHeader } from '@/editor/DemoHeader';
import { EditorLayout, useNoPageZoom } from '@/editor/EditorLayout';
import { useAxlesDialog } from '@/editor/AxlesDialog';
import {
  DEMO_IDLE_AFTER,
  DEMO_LIMITS,
  DEMO_NUDGE_AFTER,
  closeDemoGate,
  createLandingDemoPlan,
  demoAccountLink,
  markDemoStep,
  openDemoGate,
  useDemo,
} from '@/editor/demo';
import { useMediaQuery } from '@/editor/hooks';
import { usePlanSync } from '@/editor/planSync';
import { trackAction } from '@/lib/analytics';
import { setPresenceDetail } from '@/lib/presence';
import { DemoMode } from '@/lib/demoMode';
import { exportPlan, useStore } from '@/store/useStore';
import { useUi } from '@/store/useUi';

const DEMO_TITLE = 'Демо-схема';

/**
 * `/demo` — the editor of the landing page's «Открыть демо» (pages/LandingDemo, editor/demo.ts): the example plan
 * in memory, no account and no server. Only for visitors who are not signed in (PublicOnly in App.tsx).
 */
export function DemoPage() {
  useNoPageZoom();
  const [ready, setReady] = useState(false);
  useDemoSession(setReady);
  const coarse = useMediaQuery('(pointer: coarse)');
  useEffect(() => {
    const title = document.title;
    document.title = 'Демо — Loader3D';
    return () => {
      document.title = title;
    };
  }, []);
  // The admin «Онлайн» tab sees a visitor in the demo and what they have built there (lib/presence.ts).
  useEffect(() => {
    if (!ready) return;
    const update = () => {
      const { vehicles, items } = useStore.getState();
      setPresenceDetail({ demo: true, vehicles: vehicles.length, items: items.length });
    };
    update();
    const stop = useStore.subscribe(update);
    return () => {
      stop();
      setPresenceDetail(null);
    };
  }, [ready]);

  if (!ready) return <DemoFallback />;
  return (
    <DemoMode.Provider value>
      <EditorLayout header={<DemoHeader />} below={<DemoGuide coarse={coarse} />}>
        <DemoGate />
      </EditorLayout>
    </DemoMode.Provider>
  );
}

/**
 * Puts the demo plan into the store (the one the visitor left, or the example), with the demo's limits (the example
 * only), and follows what the visitor does: the steps to try, the PDF (an account's), the time in the demo. Leaving,
 * it keeps the plan for a return in this visit and gives the store back without limits.
 */
function useDemoSession(setReady: (ready: boolean) => void): void {
  const navigate = useNavigate();

  useEffect(() => {
    const store = useStore.getState();
    store.openPlan(useDemo.getState().plan ?? createLandingDemoPlan());
    store.setLimits({ ...DEMO_LIMITS });
    usePlanSync.setState({ planId: null, name: DEMO_TITLE, status: 'saved', error: null });
    useUi.setState({ drawerOpen: false, autoloadOpen: false, pdfOpen: false, displayOpen: false, helpOpen: false });
    setReady(true);

    let thanked = false;

    const offStore = useStore.subscribe((s, prev) => {
      if (s.items === prev.items) return;
      if (useUi.getState().autoloadOpen) {
        markDemoStep('autoload');
        if (!thanked) {
          thanked = true;
          // After the dialog has closed and its own toast is shown.
          window.setTimeout(
            () =>
              toast('Кузов разложен автоматически', {
                description: 'Сохраните схему, чтобы не потерять её: регистрация бесплатная.',
                duration: 8000,
                action: {
                  label: 'Сохранить',
                  onClick: () => {
                    trackAction('demo_toast_save');
                    void demoAccountLink('register').then(({ to, state }) => navigate(to, { state }));
                  },
                },
              }),
            600,
          );
        }
        return;
      }
      const id = s.selectedId;
      const now = id ? s.items.find((i) => i.id === id) : undefined;
      const before = id ? prev.items.find((i) => i.id === id) : undefined;
      if (now && before && (now.pos.x !== before.pos.x || now.pos.y !== before.pos.y || now.pos.z !== before.pos.z)) {
        markDemoStep('move');
      }
    });

    // The PDF is what is taken to the warehouse and the driver: an account's, whichever way it is asked for.
    const offUi = useUi.subscribe((s, prev) => {
      if (s.pdfOpen && !prev.pdfOpen) {
        useUi.setState({ pdfOpen: false });
        openDemoGate('pdf');
      }
    });
    const offAxles = useAxlesDialog.subscribe((s) => {
      if (s.vehicleId) markDemoStep('axles');
    });

    // Active time: the tab visible and the visitor did something within DEMO_IDLE_AFTER.
    let lastInput = Date.now();
    let lastTick = Date.now();
    const input = () => (lastInput = Date.now());
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, input, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.min(now - lastTick, 5000);
      lastTick = now;
      if (document.visibilityState !== 'visible' || now - lastInput > DEMO_IDLE_AFTER) return;
      const demo = useDemo.getState();
      const activeMs = demo.activeMs + delta;
      useDemo.setState({ activeMs });
      // Not over another window (autoload, PDF, axle loads, any dialog or menu open).
      const busy = demo.gate !== null || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
      if (!demo.nudged && activeMs >= DEMO_NUDGE_AFTER && !busy) {
        useDemo.setState({ nudged: true });
        openDemoGate('time');
      }
    }, 1000);

    return () => {
      offStore();
      offUi();
      offAxles();
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, input, { capture: true });
      useDemo.setState({ plan: exportPlan(useStore.getState()) });
      closeDemoGate();
      useStore.getState().setLimits(null);
      usePlanSync.setState({ name: '' });
      useUi.setState({ drawerOpen: false, autoloadOpen: false, pdfOpen: false, displayOpen: false, helpOpen: false });
    };
  }, [navigate, setReady]);
}
