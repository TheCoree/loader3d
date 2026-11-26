import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { LogoMark } from '@/components/Logo';
import { FullScreenLoader } from '@/components/RouteGuards';
import { Button } from '@/components/ui/button';
import { parsePlan } from '@/core/plan';
import { buildStartPlan, decodeStart, fitPlan, type StartPlan } from '@/core/tools/startPlan';
import { useDemo } from '@/editor/demo';
import { decodePlanParam } from '@/lib/demoPlan';
import { plural } from '@/lib/format';
import { useCreatePlan } from '@/lib/plansQuery';
import { useAuth } from '@/store/useAuth';

/** The name of the plan the demo of the landing page brings. */
const DEMO_PLAN_NAME = 'Схема из демо';
// `&example=1`: the example a message of the team opens (components/MessageDialog.tsx).
const EXAMPLE_PLAN_NAME = 'Пример схемы';

type Start = StartPlan & { name: string };

/**
 * `/start?d=…` — «Попробовать в 3D» from a calculator page (pages/tools): the calculated body and cargo become a
 * new plan (core/tools/startPlan.ts), which opens in the editor. `/start?plan=…` — «Сохранить схему» of the demo
 * of the landing page (pages/DemoPage): the whole plan of the demo (lib/demoPlan.ts). Behind RequireAuth, so a
 * visitor gets here after the registration and the email code (the address travels in `state.from`). Within the tier's limits:
 * the cargo over the limit is left out (and vehicles over it), a plan over the limit of plans is refused by the API.
 *
 * The app comes here by its own navigation. An address opened from outside (a link in a new tab, from another site
 * or a letter) asks first: anyone can make such a link, and it must not put a plan into an account unasked.
 */
export function StartPlanPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const limits = useAuth((s) => s.user?.subscription?.limits ?? null);
  const create = useCreatePlan();
  const fromDemo = params.has('plan');
  // React Router keys only the entries it made itself; the first page of a visit is «default».
  const [confirmed, setConfirmed] = useState(location.key !== 'default');
  const [start, setStart] = useState<Start | null>(null);
  const read = useRef(false);
  const created = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    void (async () => {
      let next: Start | null = null;
      if (fromDemo) {
        const plan = parsePlan(await decodePlanParam(params.get('plan')));
        if (plan) next = { ...fitPlan(plan, limits), name: params.has('example') ? EXAMPLE_PLAN_NAME : DEMO_PLAN_NAME };
      } else {
        const spec = decodeStart(params.get('d'));
        if (spec) next = { ...buildStartPlan(spec, limits?.items), name: spec.name };
      }
      if (!next) {
        if (fromDemo) toast.error('Не удалось прочитать схему из демо');
        navigate('/plans', { replace: true });
        return;
      }
      setStart(next);
    })();
    // Reads the address once per visit.
  }, []);

  useEffect(() => {
    if (!start || !confirmed || created.current) return;
    // The plan must not be created twice.
    created.current = true;
    const { plan, dropped, name } = start;
    create.mutate(
      { name, data: plan },
      {
        onSuccess: (record) => {
          if (fromDemo) useDemo.setState({ plan: null });
          if (dropped > 0) {
            toast.info(`На вашем тарифе в схеме до ${plural(limits?.items ?? 0, ['груза', 'грузов', 'грузов'])}: ещё ${dropped} не добавлены.`);
          }
          navigate(`/plans/${record.id}`, { replace: true });
        },
        onError: (error) => {
          toast.error(errorMessage(error));
          navigate('/plans', { replace: true });
        },
      },
    );
  }, [start, confirmed]);

  if (start && !confirmed) {
    return <StartConfirm start={start} onCreate={() => setConfirmed(true)} onCancel={() => navigate('/plans', { replace: true })} />;
  }
  return <FullScreenLoader label={fromDemo ? 'Сохраняем схему из демо…' : 'Собираем схему из калькулятора…'} />;
}

/** «Создать схему по ссылке?» — for an address opened from outside the app. */
function StartConfirm({ start, onCreate, onCancel }: { start: Start; onCreate: () => void; onCancel: () => void }) {
  const { plan, name } = start;
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 text-foreground">
      <div className="w-full max-w-sm">
        <LogoMark className="size-9" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Создать схему по ссылке?</h1>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          В вашем аккаунте появится схема «{name}»: {plural(plan.vehicles.length, ['машина', 'машины', 'машин'])},{' '}
          {plural(plan.items.length, ['груз', 'груза', 'грузов'])}. Создавайте её, если сами открыли ссылку из калькулятора или
          демо Loader3D.
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={onCreate} autoFocus>
            Создать схему
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </div>
    </div>
  );
}
