import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, FileQuestion, Package, RefreshCw } from 'lucide-react';
import { ApiError, errorMessage } from '@/api/client';
import { planApi } from '@/api/endpoints';
import { FullScreenLoader } from '@/components/RouteGuards';
import { UpgradeDialog, useUpgrade } from '@/components/UpgradeDialog';
import { TIERS_ENABLED } from '@/lib/tiers';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { AutoloadDialog } from '@/editor/AutoloadDialog';
import { CargoPanel } from '@/editor/CargoPanel';
import { ConflictDialog } from '@/editor/ConflictDialog';
import { DisplaySettingsDialog } from '@/editor/DisplaySettingsDialog';
import { EditorHeader } from '@/editor/EditorHeader';
import { HelpDialog } from '@/editor/HelpDialog';
import { PdfExportDialog } from '@/editor/PdfExportDialog';
import { Viewport } from '@/editor/Viewport';
import { guardSceneShortcuts, useMediaQuery } from '@/editor/hooks';
import { flush, hasUnsavedChanges, startSync, stopSync, usePlanSync } from '@/editor/planSync';
import { startThumbnails, stopThumbnails } from '@/editor/planThumbnail';
import { planKeys } from '@/lib/plansQuery';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { useUi } from '@/store/useUi';

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: unknown };

const DEFAULT_TITLE = document.title;

/** Pinch or double-tap zoom of the page would fight the scene's own gestures on tablets. */
function useNoPageZoom(): void {
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

/** /plans/:planId — loads the plan into the store, then mounts the 3D editor around it. */
export function EditorPage() {
  useNoPageZoom();
  const { planId = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    planApi
      .get(planId)
      .then((record) => {
        if (cancelled) return;
        useStore.getState().openPlan(record.data);
        useUi.setState({ drawerOpen: false, autoloadOpen: false, pdfOpen: false, displayOpen: false });
        startSync(record);
        startThumbnails(record, () => void queryClient.invalidateQueries({ queryKey: planKeys.all }));
        setState({ status: 'ready' });
      })
      .catch((error) => !cancelled && setState({ status: 'error', error }));
    return () => {
      cancelled = true;
      void flush();
      stopSync();
      stopThumbnails();
    };
  }, [planId, attempt, queryClient]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      void flush();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const name = usePlanSync((s) => s.name);
  useEffect(() => {
    document.title = state.status === 'ready' && name ? `${name} — Loader3D` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [name, state.status]);

  if (state.status === 'loading') return <FullScreenLoader label="Открываем схему…" />;
  if (state.status === 'error') {
    const missing = state.error instanceof ApiError && state.error.status === 404;
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion />
            </EmptyMedia>
            <EmptyTitle>{missing ? 'Схема не найдена' : 'Не удалось открыть схему'}</EmptyTitle>
            <EmptyDescription>
              {missing ? 'Возможно, её удалили или ссылка неверна.' : errorMessage(state.error)}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button variant="outline" asChild>
              <Link to="/plans">
                <ArrowLeft /> Все схемы
              </Link>
            </Button>
            {!missing && (
              <Button onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw /> Повторить
              </Button>
            )}
          </EmptyContent>
        </Empty>
      </div>
    );
  }
  return <EditorLayout />;
}

/** Width of the floating cargo panel (wider on large screens, so cargo rows are not cut) and its distance from the edges, px. */
const PANEL_WIDTH = 360;
const PANEL_WIDTH_WIDE = 410;
const PANEL_GAP = 12;

/** «не больше 1 машины», «не больше 100 грузов» (genitive after «больше»). */
function limitText(kind: 'vehicles' | 'items', n: number): string {
  const one = n % 10 === 1 && n % 100 !== 11;
  return `${n} ${kind === 'vehicles' ? (one ? 'машины' : 'машин') : one ? 'груза' : 'грузов'}`;
}

/** An edit the store refused because of the tier opens the offer to upgrade. */
function useLimitOffers(): void {
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        const hit = s.limitHit;
        if (!hit || hit === prev.limitHit) return;
        useUpgrade
          .getState()
          .show(`На тарифе «${hit.tierName}» в схеме не больше ${limitText(hit.kind, hit.limit)}. На «Pro» — до 10 машин и 5000 грузов.`);
      }),
    [],
  );
}

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

function EditorLayout() {
  useLimitOffers();
  const desktop = useMediaQuery('(min-width: 768px)');
  const panelWidth = useMediaQuery('(min-width: 1280px)') ? PANEL_WIDTH_WIDE : PANEL_WIDTH;
  const panelHidden = useUi((s) => s.panelHidden);
  const setPanelHidden = useUi((s) => s.setPanelHidden);
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const floating = desktop && !panelHidden;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-scene" onKeyDown={guardSceneShortcuts}>
      <EditorHeader />
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
      <ConflictDialog />
      {TIERS_ENABLED && <UpgradeDialog />}
    </div>
  );
}
