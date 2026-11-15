import { Copy, Download, Ellipsis, FolderOpen, Package, Pencil, Trash2, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { planApi } from '@/api/endpoints';
import type { PlanSummary } from '@/api/types';
import { CARGO_COLORS } from '@/core/presets';
import { CargoIllustration } from '@/components/CargoIllustration';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { fullDate, plural, timeAgo } from '@/lib/format';
import { downloadPlan } from '@/lib/planFiles';
import { useDuplicatePlan } from '@/lib/plansQuery';

/** A stable colour per plan, so cards are easy to tell apart. */
function planColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return CARGO_COLORS[Math.abs(hash) % CARGO_COLORS.length];
}

interface PlanCardProps {
  plan: PlanSummary;
  onRename(plan: PlanSummary): void;
  onDelete(plan: PlanSummary): void;
}

export function PlanCard({ plan, onRename, onDelete }: PlanCardProps) {
  const navigate = useNavigate();
  const duplicate = useDuplicatePlan();
  const color = planColor(plan.id);
  const href = `/plans/${plan.id}`;

  const exportJson = async () => {
    try {
      const full = await planApi.get(plan.id);
      downloadPlan(full.name, full.data);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card className="group/plan relative gap-0 rounded-2xl py-0 ring-ink/[0.07] transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-[0_28px_50px_-28px_rgba(10,11,13,0.35)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <div
        className="relative h-36 overflow-hidden border-b border-ink/[0.05]"
        style={{
          background: `radial-gradient(120% 90% at 50% 100%, color-mix(in oklab, ${color} 26%, #f4f4f6) 0%, #f4f4f6 70%)`,
        }}
      >
        <CargoIllustration className="absolute -bottom-7 left-1/2 h-44 -translate-x-1/2 transition-transform duration-300 group-hover/plan:scale-[1.04]" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 z-10 rounded-full bg-white/80 text-ink/70 shadow-sm backdrop-blur hover:bg-white data-[state=open]:bg-white sm:opacity-0 sm:group-hover/plan:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100"
              aria-label="Действия со схемой"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => navigate(href)}>
              <FolderOpen /> Открыть
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRename(plan)}>
              <Pencil /> Переименовать
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={duplicate.isPending}
              onSelect={() =>
                duplicate.mutate(plan, {
                  onSuccess: (copy) => toast.success(`Создана копия «${copy.name}»`),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <Copy /> Дублировать
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportJson()}>
              <Download /> Скачать JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(plan)}>
              <Trash2 /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="px-5 pt-4 pb-5">
        <h3 className="truncate font-display text-[17px] leading-snug font-medium tracking-[-0.01em]">
          <Link to={href} className="outline-none after:absolute after:inset-0 after:rounded-2xl" title={plan.name}>
            {plan.name}
          </Link>
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground" title={`Изменено ${fullDate(plan.updatedAt)}`}>
          Изменено {timeAgo(plan.updatedAt)}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5 text-xs text-ink/70">
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <Package className="size-3.5" />
            {plural(plan.itemCount, ['груз', 'груза', 'грузов'])}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <Truck className="size-3.5" />
            {plan.vehicleCount > 1 && `${plural(plan.vehicleCount, ['машина', 'машины', 'машин'])} · `}
            {plural(plan.bodyCount, ['кузов', 'кузова', 'кузовов'])}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function PlanCardSkeleton() {
  return (
    <Card className="gap-0 rounded-2xl py-0 ring-ink/[0.07]">
      <Skeleton className="h-36 rounded-none" />
      <div className="space-y-2.5 px-5 pt-4 pb-5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="mt-4 h-6 w-1/2 rounded-full" />
      </div>
    </Card>
  );
}
