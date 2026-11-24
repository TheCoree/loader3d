import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Check } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { useUpgrade } from '@/components/UpgradeDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { TIERS_ENABLED, TRIAL_DAYS, tierInfo } from '@/lib/tiers';
import { useStore } from '@/store/useStore';
import { DEMO_LIMITS, closeDemoGate, demoAccountLink, openDemoGate, useDemo, type DemoGateReason } from './demo';

const PRO = tierInfo('pro').limits;
const fmt = (n: number) => n.toLocaleString('ru-RU');

/** «…зарегистрируйтесь — это бесплатно» / with tiers: the «Pro» trial. */
const SIGN_UP = TIERS_ENABLED
  ? `зарегистрируйтесь — первые ${TRIAL_DAYS} дней «Pro» бесплатно, без карты`
  : 'зарегистрируйтесь — это бесплатно';

const COPY: Record<DemoGateReason, { title: string; lead: string }> = {
  time: {
    title: 'Загрузите свою машину',
    lead: `Вы уже несколько минут в демо. Чтобы разложить свой груз в своей машине и отдать водителю PDF, ${SIGN_UP}. Схема из демо перенесётся в аккаунт.`,
  },
  limits: {
    title: `В демо — до ${DEMO_LIMITS.vehicles} машин и ${DEMO_LIMITS.items} грузов`,
    lead: TIERS_ENABLED
      ? `В аккаунте с «Pro» — до ${PRO.vehicles} машин и ${fmt(PRO.items)} грузов в схеме, первые ${TRIAL_DAYS} дней бесплатно. Схема из демо перенесётся в аккаунт.`
      : `В аккаунте — до ${PRO.vehicles} машин и ${fmt(PRO.items)} грузов в схеме. Регистрация бесплатная, схема из демо перенесётся в аккаунт.`,
  },
  own: {
    title: 'Свои грузы и машины — в аккаунте',
    lead: `Демо — пример рейса: двигайте груз, включите автозагрузку, посмотрите нагрузку на оси. Чтобы добавить свои грузы, выбрать машину и задать размеры, ${SIGN_UP}.`,
  },
  pdf: {
    title: 'PDF для водителя — в аккаунте',
    lead: `Схема погрузки в PDF — виды сбоку и сверху, номера мест и порядок погрузки — делается в аккаунте. Чтобы получить её, ${SIGN_UP}. Схема из демо перенесётся в аккаунт.`,
  },
  save: {
    title: 'Сохраните схему в аккаунте',
    lead: 'Регистрация бесплатная и занимает полминуты. Схема из демо перенесётся в аккаунт — продолжите с того же места.',
  },
  file: {
    title: 'Файлы схем — в аккаунте',
    lead: 'Скачивать схемы в JSON и загружать их из файла можно после бесплатной регистрации. Схема из демо перенесётся в аккаунт.',
  },
};

const BENEFITS = [
  'Схема из демо — сразу в вашем аккаунте',
  'Сохраняется сама и открывается с любого устройства',
  TIERS_ENABLED
    ? `${TRIAL_DAYS} дней «Pro»: до ${PRO.vehicles} машин, ${fmt(PRO.items)} грузов, автозагрузка`
    : `До ${PRO.vehicles} машин и ${fmt(PRO.items)} грузов в схеме`,
  'PDF для водителя и склада — без ограничений',
  TIERS_ENABLED ? 'Без карты и автоматических списаний' : 'Бесплатно, без карты',
];

/**
 * The registration window of the demo (editor/demo.ts): why it opened, what the account gives and the way
 * into it with the plan on screen. Closing it (the cross, Esc, «Продолжить демо») goes back to the demo.
 * Also takes over the tier offers the editor makes (useUpgrade: a limit, a closed feature) and the store's
 * refusals over DEMO_LIMITS (`setup`: the visitor's own cargo or vehicle — «own») — in the demo they are this
 * window, with nothing about tariffs.
 */
export function DemoGate() {
  const reason = useDemo((s) => s.gate);
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState<'register' | 'login' | null>(null);
  // The last reason stays on screen while the window fades out.
  const [shown, setShown] = useState<DemoGateReason>('save');
  if (reason && reason !== shown) setShown(reason);

  useEffect(() => {
    const offUpgrade = useUpgrade.subscribe((s, prev) => {
      if (s.open && !prev.open) {
        useUpgrade.getState().close();
        openDemoGate('limits');
      }
    });
    const offLimits = useStore.subscribe((s, prev) => {
      if (s.limitHit && s.limitHit !== prev.limitHit) openDemoGate(s.limitHit.kind === 'setup' ? 'own' : 'limits');
    });
    return () => {
      offUpgrade();
      offLimits();
    };
  }, []);

  const go = async (mode: 'register' | 'login') => {
    setLeaving(mode);
    try {
      const { to, state } = await demoAccountLink(mode);
      closeDemoGate();
      navigate(to, { state });
    } finally {
      setLeaving(null);
    }
  };

  const copy = COPY[shown];
  return (
    <Dialog open={reason !== null} onOpenChange={(open) => !open && closeDemoGate()}>
      {/*
        Focus on the window itself, not its first button: it often opens from Enter in a field (a refused size, an
        axle figure), and that same Enter must not press «Зарегистрироваться» at once.
      */}
      <DialogContent
        className="gap-5 sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <LogoMark className="mb-1 size-9 text-foreground" />
          <DialogTitle className="text-xl tracking-[-0.02em] text-balance">{copy.title}</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-pretty">{copy.lead}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2.5 rounded-xl bg-muted/60 p-4 text-sm">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.25} />
              {b}
            </li>
          ))}
        </ul>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button size="lg" className="w-full" disabled={leaving !== null} onClick={() => void go('register')} data-track="demo_gate_register">
            {leaving === 'register' ? <Spinner /> : null}
            Зарегистрироваться бесплатно
            <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={closeDemoGate} data-track="demo_gate_continue">
            Продолжить демо
          </Button>
          <p className="pt-1 text-center text-sm text-muted-foreground">
            Уже есть аккаунт?{' '}
            <button
              type="button"
              disabled={leaving !== null}
              onClick={() => void go('login')}
              data-track="demo_gate_login"
              className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 outline-none hover:decoration-foreground focus-visible:decoration-foreground"
            >
              Войти и сохранить схему
            </button>
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
