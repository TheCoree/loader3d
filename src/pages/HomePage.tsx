import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FileUp, HardDriveUpload, PackageOpen, Plus, RefreshCw, Search, SearchX, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { PlanSort, PlanSummary, Subscription } from '@/api/types';
import { AppHeader } from '@/components/AppHeader';
import { TierBadge } from '@/components/TierBadge';
import { UpgradeDialog, useUpgrade, useUpgradeAction } from '@/components/UpgradeDialog';
import { PlanCard, PlanCardSkeleton } from '@/components/plans/PlanCard';
import { CreatePlanDialog, DeletePlanDialog, RenamePlanDialog } from '@/components/plans/PlanDialogs';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { plural } from '@/lib/format';
import { forgetLegacyPlan, readLegacyPlan, readPlanFile } from '@/lib/planFiles';
import { useCreatePlan, usePlanList } from '@/lib/plansQuery';
import { daysLeft, daysLeftText, limitSummary, longDate, subscriptionState, tierInfo } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

/** Buttons of the page header: pills, like the site. */
const pill = 'h-10 rounded-full px-4.5';

const SORTS: Array<{ value: PlanSort; label: string }> = [
  { value: '-updatedAt', label: 'Недавно изменённые' },
  { value: '-createdAt', label: 'Недавно созданные' },
  { value: 'name', label: 'По названию, А–Я' },
  { value: '-name', label: 'По названию, Я–А' },
  { value: 'updatedAt', label: 'Давно не менялись' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function HomePage() {
  const navigate = useNavigate();
  const create = useCreatePlan();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PlanSort>('-updatedAt');
  const q = useDebounced(search.trim(), 250);
  const list = usePlanList(q, sort);

  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<PlanSummary | null>(null);
  const [deleting, setDeleting] = useState<PlanSummary | null>(null);

  const plans = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const loading = list.isPending;
  const nothingYet = !loading && !list.isError && total === 0 && q === '';
  const subscription = useAuth((s) => s.user?.subscription);
  const planLimit = subscription?.limits.plans ?? null;
  const atPlanLimit = planLimit !== null && q === '' && !loading && total >= planLimit;
  const showUpgrade = useUpgrade((s) => s.show);
  const limitReason = `На тарифе «${subscription?.name}» можно сохранить до ${plural(planLimit ?? 0, ['схемы', 'схем', 'схем'])}. На «Pro» — без ограничений.`;
  const guard = (action: () => void) => () => (atPlanLimit ? showUpgrade(limitReason) : action());

  const importFile = async (file: File) => {
    try {
      const { name, plan } = await readPlanFile(file);
      const created = await create.mutateAsync({ name, data: plan });
      toast.success(`Схема «${created.name}» импортирована`);
      navigate(`/plans/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error && !(error instanceof TypeError) ? error.message : errorMessage(error));
    }
  };

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">Мои схемы</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              {loading
                ? 'Загружаем…'
                : total === 0 && q === ''
                  ? 'Здесь появятся ваши схемы загрузки'
                  : `${plural(total, ['схема', 'схемы', 'схем'])}${q ? ` по запросу «${q}»` : ''}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className={pill} onClick={guard(() => fileRef.current?.click())} disabled={create.isPending}>
              <FileUp /> Импорт JSON
            </Button>
            <Button className={pill} onClick={guard(() => setCreateOpen(true))}>
              <Plus /> Новая схема
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {subscription && <SubscriptionStrip sub={subscription} plans={loading || q !== '' ? undefined : total} />}

        <LegacyPlanBanner />

        {!nothingYet && (
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <InputGroup className="h-10 rounded-full bg-card px-1 sm:max-w-sm">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Поиск по названию"
                value={search}
                aria-label="Поиск по названию"
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label="Очистить поиск" onClick={() => setSearch('')}>
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <Select value={sort} onValueChange={(v) => setSort(v as PlanSort)}>
              <SelectTrigger className="h-10! w-full rounded-full bg-card px-4 sm:ml-auto sm:w-60" aria-label="Сортировка">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <section className="mt-5" aria-busy={list.isFetching}>
          {list.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Не удалось загрузить схемы</AlertTitle>
              <AlertDescription>{errorMessage(list.error)}</AlertDescription>
              <AlertAction>
                <Button size="sm" variant="outline" onClick={() => void list.refetch()}>
                  <RefreshCw /> Повторить
                </Button>
              </AlertAction>
            </Alert>
          ) : loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <PlanCardSkeleton key={i} />
              ))}
            </div>
          ) : nothingYet ? (
            <Empty className="mt-8 rounded-3xl border border-dashed border-foreground/15 bg-card py-20">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="size-12 rounded-2xl bg-foreground text-background [&_svg]:size-6">
                  <PackageOpen />
                </EmptyMedia>
                <EmptyTitle>Пока нет ни одной схемы</EmptyTitle>
                <EmptyDescription>
                  Создайте схему: выберите транспорт, добавьте грузы и разложите их в 3D.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                <Button className={pill} onClick={() => setCreateOpen(true)}>
                  <Plus /> Новая схема
                </Button>
                <Button variant="outline" className={pill} onClick={() => fileRef.current?.click()}>
                  <FileUp /> Импорт JSON
                </Button>
              </EmptyContent>
            </Empty>
          ) : plans.length === 0 ? (
            <Empty className="mt-6 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Ничего не найдено</EmptyTitle>
                <EmptyDescription>Нет схем с «{q}» в названии.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => setSearch('')}>
                  Сбросить поиск
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} onRename={setRenaming} onDelete={setDeleting} />
                ))}
              </div>
              {list.hasNextPage && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                    {list.isFetchingNextPage && <Spinner />}
                    Показать ещё
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
      {subscription && <UpgradeDialog />}

      <CreatePlanDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenamePlanDialog plan={renaming} onClose={() => setRenaming(null)} />
      <DeletePlanDialog plan={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

/** Offers to move the plan kept in this browser before accounts existed into the account. */
function LegacyPlanBanner() {
  const [plan, setPlan] = useState(readLegacyPlan);
  const create = useCreatePlan();
  const navigate = useNavigate();
  if (!plan) return null;

  const save = () =>
    create.mutate(
      { name: 'План из браузера', data: plan },
      {
        onSuccess: (created) => {
          forgetLegacyPlan();
          navigate(`/plans/${created.id}`);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <Alert className="mt-6 border-primary/25 bg-primary/5">
      <HardDriveUpload className="text-primary" />
      <AlertTitle>В этом браузере остался план без аккаунта</AlertTitle>
      <AlertDescription>
        {plural(plan.items.length, ['груз', 'груза', 'грузов'])} — сохраните его как схему, чтобы он был доступен везде.
      </AlertDescription>
      <AlertAction className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            forgetLegacyPlan();
            setPlan(null);
          }}
        >
          Не нужно
        </Button>
        <Button size="sm" onClick={save} disabled={create.isPending}>
          {create.isPending && <Spinner />}
          Сохранить как схему
        </Button>
      </AlertAction>
    </Alert>
  );
}

/**
 * The tier above the plans: «Pro» and its term, the days left of a trial, a reminder to renew;
 * on «Старт» how many plans are saved out of the limit and a quiet way to «Pro». Links to /billing.
 */
function SubscriptionStrip({ sub, plans }: { sub: Subscription; plans: number | undefined }) {
  const state = subscriptionState(sub);
  const action = useUpgradeAction();
  const left = daysLeft(sub);
  const limit = sub.limits.plans;
  const limited = state === 'free' || state === 'expired';
  const full = limit !== null && plans !== undefined && plans >= limit;

  const saved =
    plans === undefined || limit === null
      ? null
      : plans > limit
        ? `${plural(plans, ['схема', 'схемы', 'схем'])} при лимите ${limit}`
        : `Сохранено ${plans} из ${plural(limit, ['схемы', 'схем', 'схем'])}${full ? ' — лимит тарифа исчерпан' : ''}`;
  const text = limited ? (
    state === 'expired' ? (
      `«${tierInfo(sub.expiredTier ?? 'pro').name}» закончился — действуют лимиты «${sub.name}»${saved ? ` · ${saved.charAt(0).toLowerCase()}${saved.slice(1)}` : ''}`
    ) : (
      (saved ?? limitSummary(sub))
    )
  ) : state === 'trial' ? (
    `Пробный период до ${longDate(sub.expiresAt!)} — ${daysLeftText(left ?? 0)}`
  ) : state === 'ending' ? (
    `«${sub.name}» действует до ${longDate(sub.expiresAt!)} — ${daysLeftText(left ?? 0)}`
  ) : (
    <>
      {sub.expiresAt ? `Действует до ${longDate(sub.expiresAt)}` : 'Без ограничения по сроку'}
      <span className="hidden text-muted-foreground md:inline"> · {limitSummary(sub)}</span>
    </>
  );
  // Calls to act: on «Старт», in a trial and when «Pro» is about to end; a running «Pro» only links.
  const cta = limited || state === 'trial' || state === 'ending' ? action : null;

  return (
    <div
      className={cn(
        'mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-card px-4 py-3 text-sm',
        (state === 'ending' || state === 'expired' || full) && 'border-warning/30 bg-warning/5',
      )}
    >
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
        <TierBadge tier={sub.tier} className="h-6 px-2.5" />
        <div className="min-w-0 flex-1">
          <p className={cn('text-pretty', (state === 'ending' || state === 'expired' || full) && 'text-warning')}>{text}</p>
          {limited && limit !== null && plans !== undefined && (
            <Progress
              value={Math.min(100, (100 * plans) / limit)}
              className={cn('mt-2 max-w-64', full && '[&>[data-slot=progress-indicator]]:bg-warning')}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/billing">{limited ? 'Сравнить тарифы' : 'Тариф и оплата'}</Link>
        </Button>
        {cta && (
          <Button size="sm" className="rounded-full px-3.5" onClick={cta.run} disabled={cta.pending}>
            {cta.pending ? <Spinner /> : <Sparkles />}
            {cta.label}
          </Button>
        )}
      </div>
    </div>
  );
}
