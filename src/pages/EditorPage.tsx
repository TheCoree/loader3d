import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileQuestion, RefreshCw } from 'lucide-react';
import { ApiError, errorMessage } from '@/api/client';
import { planApi } from '@/api/endpoints';
import { FullScreenLoader } from '@/components/RouteGuards';
import { UpgradeDialog, useUpgrade } from '@/components/UpgradeDialog';
import { TIERS_ENABLED, tierInfo } from '@/lib/tiers';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ConflictDialog } from '@/editor/ConflictDialog';
import { EditorHeader } from '@/editor/EditorHeader';
import { EditorLayout, useNoPageZoom } from '@/editor/EditorLayout';
import { flush, hasUnsavedChanges, startSync, stopSync, usePlanSync } from '@/editor/planSync';
import { startThumbnails, stopThumbnails } from '@/editor/planThumbnail';
import { planKeys } from '@/lib/plansQuery';
import { useStore } from '@/store/useStore';
import { useUi } from '@/store/useUi';

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: unknown };

const DEFAULT_TITLE = document.title;

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
  return <PlanEditor />;
}

/** «не больше 1 машины», «не больше 100 грузов» (genitive after «больше»). */
function limitText(kind: 'vehicles' | 'items', n: number): string {
  const one = n % 10 === 1 && n % 100 !== 11;
  return `${n} ${kind === 'vehicles' ? (one ? 'машины' : 'машин') : one ? 'груза' : 'грузов'}`;
}

const PRO = tierInfo('pro').limits;

/** An edit the store refused because of the tier opens the offer to upgrade. */
function useLimitOffers(): void {
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        const hit = s.limitHit;
        // `setup` is the demo's (editor/DemoGate.tsx), never a tier's.
        if (!hit || hit === prev.limitHit || hit.kind === 'setup') return;
        useUpgrade
          .getState()
          .show(
            `На тарифе «${hit.tierName}» в схеме не больше ${limitText(hit.kind, hit.limit)}. На «Pro» — до ${limitText('vehicles', PRO.vehicles)} и ${PRO.items.toLocaleString('ru-RU')} грузов.`,
          );
      }),
    [],
  );
}

function PlanEditor() {
  useLimitOffers();
  return (
    <EditorLayout header={<EditorHeader />}>
      <ConflictDialog />
      {TIERS_ENABLED && <UpgradeDialog />}
    </EditorLayout>
  );
}
