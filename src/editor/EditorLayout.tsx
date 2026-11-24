import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { releaseDisplayPreview } from '@/scene/DisplayPreview';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { useUi } from '@/store/useUi';
import { AutoloadDialog } from './AutoloadDialog';
import { CargoPanel } from './CargoPanel';
import { DisplaySettingsDialog } from './DisplaySettingsDialog';
import { HelpDialog } from './HelpDialog';
import { PdfExportDialog } from './PdfExportDialog';
import { Viewport } from './Viewport';
import { guardSceneShortcuts, useMediaQuery } from './hooks';

/** Pinch or double-tap zoom of the page would fight the scene's own gestures on tablets. */
export function useNoPageZoom(): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const before = meta.content;
    meta.content = `${before}, maximum-scale=1, user-scalable=no`;
    return () => {
      meta.content = before;
    };
  }, []);
}

/** Width of the floating cargo panel (wider on large screens, so cargo rows are not cut) and its distance from the edges, px. */
const PANEL_WIDTH = 360;
const PANEL_WIDTH_WIDE = 410;
const PANEL_GAP = 12;

/**
 * While the cargo panel is hidden: a strip along the right edge of the scene. Pointing at the edge
 * slides out a small tab (on touch screens it always shows); a click brings the panel back.
 */
function PanelHandle({ hidden, onOpen }: { hidden: boolean; onOpen(): void }) {
  const count = useStore((s) => s.items.length);
  return (
    <div
      className={cn(
        'group/handle absolute top-1/2 right-0 z-10 flex h-40 w-7 -translate-y-1/2 items-center justify-end',
        !hidden && 'pointer-events-none',
      )}
    >
      <button
        type="button"
        tabIndex={hidden ? 0 : -1}
        aria-hidden={!hidden}
        aria-label="Показать панель грузов"
        title="Показать панель грузов"
        onClick={onOpen}
        className={cn(
          'flex h-24 w-9 translate-x-full flex-col items-center justify-center gap-1.5 rounded-l-2xl border border-r-0 bg-card/95 text-muted-foreground shadow-lg shadow-foreground/10 backdrop-blur-md outline-none',
          'transition-[translate,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-foreground motion-reduce:transition-none',
          'focus-visible:ring-3 focus-visible:ring-ring/50',
          hidden &&
            'group-hover/handle:translate-x-0 focus-visible:translate-x-0 [@media(hover:none)]:translate-x-0',
        )}
      >
        <ChevronLeft className="size-4" />
        <Package className="size-4" />
        <span className="text-[11px] font-medium tabular-nums">{count}</span>
      </button>
    </div>
  );
}

/**
 * The editor around the plan in the store: a header, the 3D scene with its overlays, the cargo panel
 * (floating on wide screens, a drawer on phones) and the editor's dialogs. The plan editor (EditorPage)
 * and the demo of the landing page (DemoPage) differ only in the header and the dialogs of their own
 * (`children`): saving to the server, the conflict, the offer of a tier — or the registration of the demo.
 */
export function EditorLayout({
  header,
  children,
  below,
  className = 'h-dvh',
}: {
  header: ReactNode;
  children?: ReactNode;
  /** Between the header and the scene (the demo's steps). */
  below?: ReactNode;
  /** The height: the whole screen, or the box the editor is embedded in. */
  className?: string;
}) {
  // The display dialog's preview keeps its WebGL context while the editor is open: free it on leaving.
  useEffect(() => releaseDisplayPreview, []);
  const desktop = useMediaQuery('(min-width: 768px)');
  const panelWidth = useMediaQuery('(min-width: 1280px)') ? PANEL_WIDTH_WIDE : PANEL_WIDTH;
  const panelHidden = useUi((s) => s.panelHidden);
  const setPanelHidden = useUi((s) => s.setPanelHidden);
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const floating = desktop && !panelHidden;

  return (
    <div className={cn('flex flex-col overflow-hidden bg-scene', className)} onKeyDown={guardSceneShortcuts}>
      {header}
      {below}
      <div className="relative min-h-0 flex-1">
        <Viewport rightInset={floating ? panelWidth + PANEL_GAP : 0} />
        {desktop && (
          <>
            {/*
              Always mounted (the form keeps what was typed); hidden it slides out to the right and is
              inert, so it takes no focus or clicks. The canvas is full width either way; only the
              overlays above it follow the panel (Viewport animates their inset).
            */}
            <aside
              aria-label="Грузы"
              inert={!floating}
              className={cn(
                'absolute z-10 flex flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-xl shadow-foreground/10 backdrop-blur-md',
                'transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                !floating && 'pointer-events-none translate-x-[calc(100%+24px)] opacity-0',
              )}
              style={{ top: PANEL_GAP, right: PANEL_GAP, bottom: PANEL_GAP, width: panelWidth }}
            >
              <CargoPanel />
            </aside>
            <PanelHandle hidden={!floating} onOpen={() => setPanelHidden(false)} />
          </>
        )}
        {!desktop && (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
              <SheetTitle className="sr-only">Грузы</SheetTitle>
              <SheetDescription className="sr-only">Добавление грузов, автозагрузка и список</SheetDescription>
              <div className="min-h-0 flex-1 pt-8">
                <CargoPanel />
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
      <HelpDialog />
      <AutoloadDialog />
      <PdfExportDialog />
      <DisplaySettingsDialog />
      {children}
    </div>
  );
}
