import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { FullScreenLoader } from '@/components/RouteGuards';
import { parsePlan } from '@/core/plan';
import { buildStartPlan, decodeStart, fitPlan, type StartPlan } from '@/core/tools/startPlan';
import { useDemo } from '@/editor/demo';
import { decodePlanParam } from '@/lib/demoPlan';
import { plural } from '@/lib/format';
import { useCreatePlan } from '@/lib/plansQuery';
import { useAuth } from '@/store/useAuth';

/** The name of the plan the demo of the landing page brings. */
const DEMO_PLAN_NAME = 'Схема из демо';

/**
 * `/start?d=…` — «Попробовать в 3D» from a calculator page (pages/tools): the calculated body and cargo become a
 * new plan (core/tools/startPlan.ts), which opens in the editor. `/start?plan=…` — «Сохранить схему» of the demo
 * of the landing page (pages/DemoPage): the whole plan of the demo (lib/demoPlan.ts). Behind RequireAuth, so a
 * visitor gets here after the registration and the email code (the address travels in `state.from`). Within the tier's limits:
 * the cargo over the limit is left out (and vehicles over it), a plan over the limit of plans is refused by the API.
 */
export function StartPlanPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const limits = useAuth((s) => s.user?.subscription?.limits ?? null);
  const create = useCreatePlan();
  const started = useRef(false);
  const fromDemo = params.has('plan');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      let start: (StartPlan & { name: string }) | null = null;
      if (fromDemo) {
        const plan = parsePlan(await decodePlanParam(params.get('plan')));
        if (plan) start = { ...fitPlan(plan, limits), name: DEMO_PLAN_NAME };
      } else {
        const spec = decodeStart(params.get('d'));
        if (spec) start = { ...buildStartPlan(spec, limits?.items), name: spec.name };
      }
      if (!start) {
        if (fromDemo) toast.error('Не удалось прочитать схему из демо');
        navigate('/plans', { replace: true });
        return;
      }
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
    })();
    // Runs once per visit of the address: the plan must not be created twice.
  }, []);

  return <FullScreenLoader label={fromDemo ? 'Сохраняем схему из демо…' : 'Собираем схему из калькулятора…'} />;
}
