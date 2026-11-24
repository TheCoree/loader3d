import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDemo, type DemoStep } from './demo';

const STEPS: Array<{ id: DemoStep; label: string; hint: { mouse: string; touch: string } }> = [
  {
    id: 'move',
    label: 'Перетащите груз',
    hint: {
      mouse: 'Тяните груз мышью — он встанет на пол или на другой груз. Фон — вращение, колесо — масштаб.',
      touch: 'Потяните груз пальцем — он встанет на пол или на другой груз. Палец по фону — вращение, два пальца — масштаб.',
    },
  },
  {
    id: 'autoload',
    label: 'Автозагрузка',
    hint: {
      mouse: 'В панели грузов нажмите «Загрузить в кузов» — груз с дока разложится сам, с развесовкой.',
      touch: 'Откройте «Грузы» и нажмите «Загрузить в кузов» — груз с дока разложится сам.',
    },
  },
  {
    id: 'axles',
    label: 'Нагрузка на оси',
    hint: {
      mouse: 'Под сценой нажмите «Нагрузка на оси» — сколько тонн на каждой оси тягача и полуприцепа и где перегруз.',
      touch: 'Под сценой нажмите «Нагрузка на оси» — сколько тонн на каждой оси и где перегруз.',
    },
  },
];

/**
 * A strip under the header of the demo: three things to try, each ticked when done (editor/demo.ts), and what
 * to do for the next one. `coarse` — a touch screen: the hints speak of fingers.
 */
export function DemoGuide({ coarse }: { coarse: boolean }) {
  const steps = useDemo((s) => s.steps);
  const next = STEPS.find((s) => !steps[s.id]);
  return (
    <div className="z-10 flex h-10 shrink-0 items-center gap-3 border-b bg-background px-3 text-xs text-muted-foreground">
      <ol className="flex shrink-0 items-center gap-1" aria-label="Что попробовать в демо">
        {STEPS.map((s, i) => {
          const done = steps[s.id];
          const current = s === next;
          return (
            <li
              key={s.id}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-full px-1 transition-colors sm:pr-2.5',
                current && 'bg-muted text-foreground',
              )}
            >
              <span
                className={cn(
                  'grid size-4 place-items-center rounded-full text-[10px] font-semibold tabular-nums',
                  done ? 'bg-primary text-primary-foreground' : current ? 'bg-foreground text-background' : 'bg-foreground/10',
                )}
              >
                {done ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('hidden font-medium sm:inline', done && 'line-through decoration-foreground/30')}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="min-w-0 flex-1 truncate" aria-live="polite">
        {next ? (
          coarse ? next.hint.touch : next.hint.mouse
        ) : (
          <span className="text-foreground">Всё получилось. Свои машины, грузы и PDF для водителя — после бесплатной регистрации.</span>
        )}
      </p>
    </div>
  );
}
