import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { FullScreenLoader } from '@/components/RouteGuards';
import { buildStartPlan, decodeStart } from '@/core/tools/startPlan';
import { plural } from '@/lib/format';
import { useCreatePlan } from '@/lib/plansQuery';
import { useAuth } from '@/store/useAuth';

/**
 * `/start?d=…` — «Попробовать в 3D» from a calculator page (pages/tools): the calculated body and cargo become a
 * new plan (core/tools/startPlan.ts), which opens in the editor. Behind RequireAuth, so a visitor gets here
 * after the registration and the email code (the address travels in `state.from`). Within the tier's limits:
 * the cargo over the limit is left out, a plan over the limit of plans is refused by the API.
 */
export function StartPlanPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const limits = useAuth((s) => s.user?.subscription?.limits ?? null);
  const create = useCreatePlan();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const spec = decodeStart(params.get('d'));
    if (!spec) {
      navigate('/plans', { replace: true });
      return;
    }
    const { plan, dropped } = buildStartPlan(spec, limits?.items);
    create.mutate(
      { name: spec.name, data: plan },
      {
        onSuccess: (record) => {
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
    // Runs once per visit of the address: the plan must not be created twice.
  }, []);

  return <FullScreenLoader label="Собираем схему из калькулятора…" />;
}
