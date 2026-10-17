import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { PlanSummary } from '@/api/types';
import { VEHICLE_PRESETS } from '@/core/presets';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { planFromPreset } from '@/lib/planFiles';
import { useCreatePlan, useDeletePlan, useRenamePlan } from '@/lib/plansQuery';
import { cn } from '@/lib/utils';
import { vehicleDims, vehicleIcon } from './vehicles';

const today = () => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date());

/** New plan: a name and a vehicle preset; opens the editor right away. */
export function CreatePlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [presetId, setPresetId] = useState(VEHICLE_PRESETS[0].id);

  useEffect(() => {
    if (open) {
      setName(`Схема от ${today()}`);
      setPresetId(VEHICLE_PRESETS[0].id);
      create.reset();
    }
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), data: planFromPreset(presetId) },
      { onSuccess: (plan) => navigate(`/plans/${plan.id}`) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Новая схема</DialogTitle>
            <DialogDescription>Выберите транспорт — размеры кузова можно поменять в редакторе.</DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-5">
            <Field data-invalid={create.isError}>
              <FieldLabel htmlFor="plan-name">Название</FieldLabel>
              <Input
                id="plan-name"
                value={name}
                maxLength={200}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setName(e.target.value)}
              />
              {create.isError && <FieldError>{errorMessage(create.error)}</FieldError>}
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Транспорт</span>
              <div role="radiogroup" aria-label="Транспорт" className="grid gap-2 sm:grid-cols-2">
                {VEHICLE_PRESETS.map((preset) => {
                  const Icon = vehicleIcon(preset.id);
                  const checked = preset.id === presetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setPresetId(preset.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border bg-card p-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
                        checked && 'border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground',
                          checked && 'bg-primary text-primary-foreground',
                        )}
                      >
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{preset.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{vehicleDims(preset)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Spinner />}
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenamePlanDialog({ plan, onClose }: { plan: PlanSummary | null; onClose(): void }) {
  const rename = useRenamePlan();
  const [name, setName] = useState('');

  useEffect(() => {
    if (plan) {
      setName(plan.name);
      rename.reset();
    }
  }, [plan]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    const trimmed = name.trim();
    if (trimmed === plan.name) return onClose();
    rename.mutate({ plan, name: trimmed }, { onSuccess: onClose });
  };

  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Переименовать схему</DialogTitle>
          </DialogHeader>
          <Field data-invalid={rename.isError}>
            <FieldLabel htmlFor="rename-plan" className="sr-only">
              Название
            </FieldLabel>
            <Input
              id="rename-plan"
              value={name}
              maxLength={200}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setName(e.target.value)}
            />
            {rename.isError && <FieldError>{errorMessage(rename.error)}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim() || rename.isPending}>
              {rename.isPending && <Spinner />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePlanDialog({ plan, onClose }: { plan: PlanSummary | null; onClose(): void }) {
  const remove = useDeletePlan();
  return (
    <AlertDialog open={plan !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить схему?</AlertDialogTitle>
          <AlertDialogDescription>
            «{plan?.name}» будет удалена со всеми грузами. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (!plan) return;
              remove.mutate(plan, {
                onSuccess: () => {
                  toast.success('Схема удалена');
                  onClose();
                },
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
          >
            {remove.isPending && <Spinner />}
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
