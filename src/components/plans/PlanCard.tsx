import { Copy, Download, Ellipsis, FolderOpen, Package, Pencil, Trash2, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { planApi } from '@/api/endpoints';
import type { PlanSummary } from '@/api/types';
import { useQuery } from '@tanstack/react-query';
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

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The picture of the plan rendered by the editor (editor/planThumbnail.ts). Fetched with the access
 * token (an <img src> could not send it) and kept as a data URL; a new thumbnailAt is a new picture.
 */
function usePlanThumbnail(plan: PlanSummary): string | undefined {
  const { data } = useQuery({
    queryKey: ['plan-thumbnail', plan.id, plan.thumbnailAt],
    queryFn: async ({ signal }) => toDataUrl(await planApi.thumbnail(plan.id, plan.thumbnailAt!, signal)),
    enabled: plan.thumbnailAt !== null,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
  return data;
}

interface PlanCardProps {
  plan: PlanSummary;
  onRename(plan: PlanSummary): void;
  onDelete(plan: PlanSummary): void;
}

export function PlanCard({ plan, onRename, onDelete }: PlanCardProps) {
  const navigate = useNavigate();
  const duplicate = useDuplicatePlan();
  const thumbnail = usePlanThumbnail(plan);
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
    <Card className="plan-card group/plan relative gap-0 rounded-2xl py-0">
      <div className="relative aspect-[16/10] overflow-hidden border-b bg-[#eceff3]">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="size-full object-cover transition-transform duration-500 ease-out group-hover/plan:scale-[1.035]"
            draggable={false}
          />
        ) : (
          <div className="grid size-full place-items-center text-ink/25">
            <Truck className="size-9" strokeWidth={1.25} />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 z-10 rounded-full bg-white/85 text-ink/70 backdrop-blur hover:bg-white hover:text-ink data-[state=open]:bg-white sm:opacity-0 sm:group-hover/plan:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100"
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
        <div className="mt-4 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
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
    <Card className="gap-0 rounded-2xl py-0">
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-2.5 px-5 pt-4 pb-5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="mt-4 h-6 w-1/2 rounded-full" />
      </div>
    </Card>
  );
}
