import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import {
  ArrowRight,
  Check,
  FileText,
  Layers,
  Plus,
  Rotate3d,
  Route,
  Scale,
  ScanEye,
  TabletSmartphone,
  type LucideIcon,
} from 'lucide-react';
import { LeadForm } from '@/components/LeadForm';
import { Logo } from '@/components/Logo';
import { SessionLoader } from '@/components/RouteGuards';
import { SiteFooter } from '@/components/SiteFooter';
import { DitherBackground, displayTitle, glassButton, inkButton, lineButton, whiteButton } from '@/components/site';
import { Button } from '@/components/ui/button';
import { TIERS, TIERS_ENABLED, TRIAL_DAYS, formatPrice, tierInfo, type TierInfo } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth, wasSignedIn } from '@/store/useAuth';

/**
 * The public product page at `/` (prerendered into index.html by scripts/prerender.mjs for search
 * engines, so it renders without a browser too: no window access while rendering). A logged-in user
 * goes on to their plans; `/pricing` shows the same page at the tariffs, without the redirect.
 * With TIERS_ENABLED off the page says nothing about tariffs.
 *
 * The pictures in public/landing are screenshots of the real editor (a demo plan: euro truck, 51 places).
 */
export function LandingRoute({ section }: { section?: 'pricing' }) {
  const status = useAuth((s) => s.status);
  if (!section) {
    if (status === 'authenticated') return <Navigate to="/plans" replace />;
    if (status === 'loading' && wasSignedIn()) return <SessionLoader />;
  }
  return <LandingPage section={section} />;
}

/** Shown in the FAQ section and as FAQPage structured data in index.html (the same list). */
/** `tiers`: shown only with tariffs on (true) or only with them off (false). */
const ALL_FAQ: Array<{ q: string; a: string; tiers?: boolean }> = [
  {
    q: 'Нужно ли что-то устанавливать?',
    a: 'Нет. Loader3D работает в браузере на компьютере и на планшете. Схемы хранятся в аккаунте и открываются с любого устройства.',
  },
  {
    q: 'Какой транспорт есть в планировщике?',
    a: 'Готовые шаблоны: еврофура 13,6 м, мега, рефрижератор, сцепка 7,7 + 8,2 м, контейнеры 20′ и 40′, грузовики. Любой кузов можно задать своими размерами и грузоподъёмностью, добавить прицеп.',
  },
  {
    q: 'Сколько паллет поместится в фуру?',
    a: 'В еврофуру 13,6 м в один ярус встают 33 европаллеты 120 × 80. Но реальный груз почти всегда разный: добавьте свои места с размерами и весом — Loader3D покажет, что поместится, сколько останется и где окажется центр тяжести.',
  },
  {
    q: 'Учитывается ли вес и перегруз?',
    a: 'Да. У каждого груза есть вес, у кузова — грузоподъёмность. Статистика показывает массу, LDM, заполнение и центр тяжести, а автозагрузка не превышает грузоподъёмность и ставит лёгкое на тяжёлое только с полной опорой.',
  },
  {
    q: 'Что будет после пробного периода «Pro»?',
    a: `Через ${TRIAL_DAYS} дней аккаунт перейдёт на бесплатный тариф «Старт», все схемы сохранятся. Подключить «Pro» можно в любой момент — без автоматических списаний.`,
    tiers: true,
  },
  {
    q: 'Чем отличается тариф «Индивидуальный»?',
    a: 'Это условия по договору для компаний: лимиты, срок и стоимость под ваши объёмы, оплата по счёту, помощь с внедрением. Оставьте заявку — обсудим задачу.',
    tiers: true,
  },
  {
    q: 'Можно ли помочь с внедрением?',
    a: 'Да. Напишите через форму на этой странице: поможем завести ваш транспорт и типовые грузы и покажем команде, как работать с планировщиком.',
    tiers: false,
  },
];

export const FAQ = ALL_FAQ.filter((f) => f.tiers === undefined || f.tiers === TIERS_ENABLED).map(({ q, a }) => ({ q, a }));

const AUDIENCE = ['экспедиторов', 'складов и 3PL', 'перевозчиков', 'производителей', 'отделов ВЭД'];

const BENEFITS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Route,
    title: 'Меньше рейсов',
    text: 'Сразу видно, сколько на самом деле помещается в кузов. Машина не уезжает полупустой, а груз не остаётся на складе.',
  },
  {
    icon: Scale,
    title: 'Без перегруза',
    text: 'Вес, грузоподъёмность и центр тяжести под контролем ещё до погрузки — а не на весах и не в дороге.',
  },
  {
    icon: FileText,
    title: 'Понятно складу и водителю',
    text: 'PDF со схемой, списком мест и порядком погрузки вместо устных указаний и рисунков от руки.',
  },
];

const SMALL_FEATURES: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Layers,
    title: 'Несколько машин и сцепки',
    text: 'До 10 машин в одной схеме: перекладывайте груз между ними, общий или отдельный док.',
  },
  {
    icon: ScanEye,
    title: 'Рентген груза',
    text: 'Грузы, которые закрывают обзор, становятся прозрачными — видно всё, что внутри.',
  },
  {
    icon: Rotate3d,
    title: 'Кантование',
    text: 'Шесть положений груза: на бок, на торец, поворот. Физика честно учитывает новую высоту.',
  },
  {
    icon: TabletSmartphone,
    title: 'На планшете у рампы',
    text: 'Интерфейс для пальцев: правьте схему прямо на складе, изменения сохраняются сами.',
  },
];

/** The numbers of the demo plan in the screenshots. */
const METRICS = [
  { label: 'LDM', value: '13,4', unit: 'м' },
  { label: 'Масса', value: '18', unit: 'из 20 т' },
  { label: 'Заполнение', value: '53', unit: '%' },
  { label: 'Центр тяжести', value: '50', unit: '% длины' },
];

const STEPS = [
  {
    title: 'Выберите транспорт',
    text: 'Еврофура, мега, реф, сцепка, контейнер — или свои размеры кузова и грузоподъёмность.',
    image: {
      src: '/landing/transport.webp',
      width: 644,
      height: 455,
      alt: 'Панель «Транспорт»: размеры кузова и грузоподъёмность',
    },
  },
  {
    title: 'Добавьте грузы',
    text: 'Типовые паллеты и IBC в один клик или свои места: размеры, вес, количество.',
    image: {
      src: '/landing/cargo.webp',
      width: 715,
      height: 829,
      alt: 'Форма «Новый груз»: типовые грузы, размеры, вес и количество',
    },
  },
  {
    title: 'Разложите и отправьте',
    text: 'Вручную или автозагрузкой. Схема сохраняется сама, PDF — в один клик.',
    image: {
      src: '/landing/pdf.webp',
      width: 896,
      height: 1056,
      alt: 'Диалог «Экспорт в PDF»: имя файла, ориентация, режим экспорта и тип камеры',
    },
  },
];

const FACTS = [
  { value: '6', label: 'положений груза' },
  { value: '10', label: 'машин в одной схеме' },
  { value: '5000', label: 'грузов в схеме' },
  { value: '1 клик', label: 'до PDF для водителя' },
];

export function LandingPage({ section }: { section?: 'pricing' }) {
  const { hash } = useLocation();
  useEffect(() => {
    const id = section ?? hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [hash, section]);

  return (
    <div className="min-h-dvh bg-ink text-ink antialiased selection:bg-primary/25">
      <LandingHeader />
      <main>
        <Hero />
        <Benefits />
        <Features />
        <Steps />
        {TIERS_ENABLED && <Pricing />}
        <Faq />
        <Contact />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

// ------------------------------------------------------------------ building blocks

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}>{children}</div>;
}

function SectionHeader({
  title,
  text,
  center,
  dark,
  className,
}: {
  title: ReactNode;
  text?: ReactNode;
  center?: boolean;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-3xl', center && 'mx-auto text-center', className)}>
      <h2 className={cn(displayTitle, 'text-[1.85rem] leading-[1.06] sm:text-[2.6rem] lg:text-[3rem]')}>{title}</h2>
      {text && (
        <p
          className={cn(
            'mt-5 text-lg leading-relaxed text-pretty sm:text-xl',
            dark ? 'text-white/55' : 'text-ink/55',
            center && 'mx-auto max-w-2xl',
          )}
        >
          {text}
        </p>
      )}
    </div>
  );
}

/** A screenshot of the editor; below the fold it loads lazily. */
function Shot({
  src,
  width,
  height,
  alt,
  className,
  eager,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      loading={eager ? undefined : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      className={cn('block h-auto', className)}
    />
  );
}

const NAV = [
  { href: '#features', label: 'Возможности' },
  { href: '#how', label: 'Как это работает' },
  ...(TIERS_ENABLED ? [{ href: '#pricing', label: 'Тарифы' }] : []),
  { href: '#faq', label: 'Вопросы' },
  { href: '#contact', label: 'Контакты' },
];

function LandingHeader() {
  const user = useAuth((s) => s.user);
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink/90 text-white backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Разделы" className="hidden flex-1 items-center justify-center gap-8 text-sm text-white/60 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="transition-colors hover:text-white">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {user ? (
            <Button asChild className={cn(whiteButton, 'h-9 px-4 text-sm')}>
              <Link to="/plans">
                Мои схемы <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                className="h-9 rounded-full px-3.5 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                <Link to="/login">Войти</Link>
              </Button>
              <Button asChild className={cn(whiteButton, 'h-9 px-4 text-sm')}>
                <Link to="/register">Начать бесплатно</Link>
              </Button>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <DitherBackground className="-z-10" />
      {/* Keeps the headline readable over the waves. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_50%_at_50%_30%,rgba(10,11,13,0.9)_0%,rgba(10,11,13,0.6)_55%,rgba(10,11,13,0)_100%)]"
      />
      <Container className="pt-20 text-center sm:pt-28 lg:pt-32">
        <p className="landing-rise mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-white/70 backdrop-blur">
          <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_2px_rgba(47,111,237,0.7)]" />
          3D-планировщик загрузки фуры и контейнера
        </p>
        <h1
          className={cn(
            displayTitle,
            'landing-rise mx-auto mt-7 max-w-4xl text-[2.3rem] leading-[1.05] tracking-[-0.022em] [animation-delay:60ms] sm:text-[3.25rem] lg:text-[4.5rem]',
          )}
        >
          Загрузите фуру в 3D до того, как приедет машина
        </h1>
        <p className="landing-rise mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-white/60 [animation-delay:120ms] sm:text-xl">
          Раскладывайте паллеты и коробки по кузову с физикой и магнитами, следите за LDM, весом и центром тяжести и отдавайте
          водителю PDF-схему погрузки. В браузере, без установки.
        </p>
        <div className="landing-rise mt-10 flex flex-col items-center justify-center gap-3 [animation-delay:180ms] sm:flex-row">
          <Button asChild size="lg" className={cn(whiteButton, 'h-12 px-7 text-base')}>
            <Link to="/register">
              Начать бесплатно <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className={cn(glassButton, 'h-12 px-7 text-base')}>
            {TIERS_ENABLED ? <a href="#pricing">Тарифы</a> : <a href="#features">Возможности</a>}
          </Button>
        </div>
        <p className="landing-rise mt-5 text-sm text-white/40 [animation-delay:220ms]">
          {TIERS_ENABLED
            ? `Бесплатный тариф навсегда · «${tierInfo('pro').name}» ${TRIAL_DAYS} дней без оплаты · Без карты`
            : 'Без установки · В браузере и на планшете · Схемы сохраняются в аккаунте'}
        </p>
      </Container>

      {/* The product: dark above its middle, white below — it bridges the hero and the page. */}
      <div className="relative mt-16 sm:mt-20">
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[38%] bg-white" />
        <Container className="relative">
          <figure className="landing-rise rounded-[20px] bg-white/[0.06] p-1.5 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur [animation-delay:280ms] sm:rounded-[24px] sm:p-2">
            <Shot
              eager
              src="/landing/editor.webp"
              width={2400}
              height={1500}
              alt="Редактор Loader3D: еврофура с 46 местами в кузове и 5 на доке, размеры кузова, список грузов и статистика — LDM, вес и центр тяжести"
              className="w-full rounded-[14px] ring-1 ring-black/5 sm:rounded-[16px]"
            />
            <figcaption className="sr-only">Рабочее окно планировщика</figcaption>
          </figure>
        </Container>
      </div>
      <div className="bg-white">
        <Container className="pt-12 pb-4 text-center sm:pt-16">
          <p className="text-[15px] text-ink/45">
            Для{' '}
            {AUDIENCE.map((a, i) => (
              <span key={a}>
                <span className="text-ink/75">{a}</span>
                {i < AUDIENCE.length - 2 ? ', ' : i === AUDIENCE.length - 2 ? ' и ' : ''}
              </span>
            ))}{' '}
            — всех, кто грузит каждый день
          </p>
        </Container>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section className="bg-white py-24 sm:py-32">
      <Container>
        <SectionHeader
          title="Схема загрузки — до рампы, а не на ней"
          text="Когда раскладку видно заранее, склад собирает груз в нужном порядке, а логист отправляет ровно столько машин, сколько нужно."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-3xl border border-ink/[0.07] p-7 sm:p-8">
              <span className="grid size-11 place-items-center rounded-2xl bg-ink/[0.04] text-ink">
                <Icon className="size-5" strokeWidth={1.6} />
              </span>
              <h3 className="mt-10 font-display text-xl font-medium tracking-[-0.02em]">{title}</h3>
              <p className="mt-2.5 leading-relaxed text-ink/55">{text}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** A card of the features grid: a title and a text, with a picture below. */
function FeatureCard({
  title,
  text,
  children,
  className,
}: {
  title: string;
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn('flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-ink/[0.06]', className)}>
      <div className="p-7 sm:p-9">
        <h3 className="font-display text-[1.375rem] font-medium tracking-[-0.025em]">{title}</h3>
        <p className="mt-2.5 max-w-md leading-relaxed text-ink/55">{text}</p>
      </div>
      {children}
    </article>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16 bg-[#f4f4f6] py-24 sm:py-32">
      <Container>
        <SectionHeader
          title="Всё, что нужно для схемы загрузки, — в одном окне"
          text="Не чертёж и не таблица: настоящая 3D-сцена, в которой груз ведёт себя как груз."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-12">
          <FeatureCard
            className="lg:col-span-7"
            title="Раскладка руками, как в жизни"
            text="Тяните груз мышью или пальцем: он встаёт на пол или на другой груз, не висит и не проходит сквозь соседей, прилипает к стенкам и граням."
          >
            <div className="mt-auto pl-7 sm:pl-9">
              <Shot
                src="/landing/scene.webp"
                width={1600}
                height={814}
                alt="3D-сцена: полуприцеп с паллетами и размерными линиями, грузы на доке"
                className="w-full rounded-tl-2xl ring-1 ring-ink/[0.06]"
              />
            </div>
          </FeatureCard>
          <FeatureCard
            className="lg:col-span-5"
            title="Автозагрузка"
            text="Тяжёлое — на пол и ближе к середине, лёгкое — сверху. Сначала результат, потом решение: всё отменяется одной кнопкой."
          >
            <div className="mt-auto flex justify-center bg-gradient-to-b from-transparent to-[#eef0f4] px-7 pb-0 sm:px-10">
              <Shot
                src="/landing/autoload.webp"
                width={1024}
                height={954}
                alt="Диалог автоматической загрузки: загрузим 46 из 46, центр тяжести — 50% длины"
                className="w-full max-w-[400px] translate-y-3 rounded-2xl shadow-[0_24px_60px_-20px_rgba(10,11,13,0.35)] ring-1 ring-ink/[0.06]"
              />
            </div>
          </FeatureCard>
          <FeatureCard
            className="lg:col-span-7"
            title="PDF для водителя и склада"
            text="Виды сбоку и сверху с номерами мест, итог по кузову и пошаговая инструкция погрузки."
          >
            <PdfPreview />
          </FeatureCard>
          <FeatureCard
            className="lg:col-span-5"
            title="LDM, вес и центр тяжести"
            text="Погрузочные метры, заполнение, масса и центр тяжести пересчитываются на лету — при каждом движении груза."
          >
            <dl className="grid grid-cols-2 gap-2 px-7 sm:px-9">
              {METRICS.map((m) => (
                <div key={m.label} className="rounded-2xl bg-[#f4f4f6] px-4 py-3.5">
                  <dt className="text-[13px] text-ink/50">{m.label}</dt>
                  <dd className="mt-1 flex items-baseline gap-1.5 font-display text-2xl font-medium tracking-[-0.02em] tabular-nums">
                    {m.value}
                    <span className="text-sm font-normal tracking-normal text-ink/45">{m.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto overflow-hidden pt-6 pb-9 pl-7 sm:pl-9">
              <Shot
                src="/landing/stats.webp"
                width={1792}
                height={197}
                alt="Статистика кузова в редакторе: заполнение 53%, LDM 13,4 м, 18 т из 20 т, центр тяжести 50%"
                className="w-[720px] max-w-none rounded-2xl shadow-[0_16px_40px_-18px_rgba(10,11,13,0.3)] ring-1 ring-ink/[0.06]"
              />
            </div>
          </FeatureCard>
          {SMALL_FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-3xl bg-white p-7 ring-1 ring-ink/[0.06] sm:p-8 lg:col-span-3">
              <Icon className="size-5 text-ink/70" strokeWidth={1.6} />
              <h3 className="mt-8 font-display text-lg font-medium tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/55">{text}</p>
            </article>
          ))}
        </div>
        <dl className="mt-20 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-ink/10 pt-12 sm:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="flex flex-col-reverse">
              <dt className="mt-2 text-[15px] text-ink/50">{f.label}</dt>
              <dd className="font-display text-[2.5rem] font-medium tracking-[-0.04em] tabular-nums sm:text-5xl">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/** A page of the loading plan PDF, drawn with the editor's own side and top views. */
function PdfPreview() {
  return (
    <div className="mt-auto px-7 sm:px-9">
      <div className="translate-y-2 rounded-t-2xl bg-white p-5 shadow-[0_-10px_50px_-20px_rgba(10,11,13,0.3)] ring-1 ring-ink/[0.08] sm:p-7">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink/[0.08] pb-3">
          <p className="font-display text-[15px] font-semibold tracking-[-0.01em]">Схема загрузки · Рейс Москва — Казань</p>
          <p className="hidden text-xs text-ink/45 sm:block">Полуприцеп 13,6 м · 46 мест · 18 т</p>
        </div>
        <p className="mt-4 text-xs text-ink/45">Вид сбоку</p>
        <Shot
          src="/landing/side.webp"
          width={1800}
          height={549}
          alt="Вид сбоку на загруженный полуприцеп"
          className="mt-1.5 w-full rounded-lg"
        />
        <p className="mt-4 text-xs text-ink/45">Вид сверху</p>
        <Shot
          src="/landing/top.webp"
          width={1800}
          height={341}
          alt="Вид сверху с номерами мест"
          className="mt-1.5 w-full rounded-lg"
        />
      </div>
    </div>
  );
}

function Steps() {
  return (
    <section id="how" className="scroll-mt-16 bg-white py-24 sm:py-32">
      <Container>
        <SectionHeader
          title="Три шага от заявки до схемы погрузки"
          text="Без обучения и без установки: первая схема — за несколько минут."
        />
        <ol className="mt-14 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl bg-[#f4f4f6] p-6 sm:p-8">
                <Shot
                  {...s.image}
                  className="max-h-full w-auto max-w-full rounded-xl shadow-[0_20px_50px_-24px_rgba(10,11,13,0.35)] ring-1 ring-ink/[0.06]"
                />
              </div>
              <div className="mt-6 flex gap-4 px-1">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-medium text-white tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-xl font-medium tracking-[-0.02em]">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink/55">{s.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <Button asChild size="lg" className={inkButton}>
            <Link to="/register">
              Попробовать на своём грузе <ArrowRight />
            </Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}

function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="pricing" className="scroll-mt-16 bg-[#f4f4f6] py-24 sm:py-32">
      <Container>
        <SectionHeader
          center
          title="Начните бесплатно. Платите, когда планировщик начнёт экономить рейсы"
          text={`Попробуйте «${tierInfo('pro').name}» ${TRIAL_DAYS} дней бесплатно — без карты и автоматических списаний.`}
        />
        <div className="mt-10 flex justify-center">
          <div
            role="radiogroup"
            aria-label="Период оплаты"
            className="inline-flex rounded-full bg-white p-1 text-sm ring-1 ring-ink/[0.08]"
          >
            {[
              { value: false, label: 'Помесячно' },
              { value: true, label: 'За год −20%' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={yearly === o.value}
                onClick={() => setYearly(o.value)}
                className={cn(
                  'rounded-full px-4 py-1.5 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  yearly === o.value ? 'bg-ink text-white' : 'text-ink/55 hover:text-ink',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <PriceCard key={t.id} tier={t} yearly={yearly} />
          ))}
        </div>
      </Container>
    </section>
  );
}

function PriceCard({ tier, yearly }: { tier: TierInfo; yearly: boolean }) {
  const href = tier.id === 'free' ? '/register' : tier.id === 'pro' ? '/register?tier=pro' : '#contact';
  const price = tier.price && (yearly ? tier.price.yearly : tier.price.monthly);
  const dark = !!tier.highlighted;
  const muted = dark ? 'text-white/55' : 'text-ink/50';
  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-3xl p-8 sm:p-9',
        dark ? 'bg-ink text-white shadow-[0_40px_80px_-30px_rgba(10,11,13,0.55)]' : 'bg-white ring-1 ring-ink/[0.07]',
      )}
    >
      {dark && (
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/30 blur-3xl" />
      )}
      <div className="relative flex items-center justify-between gap-4">
        <h3 className="font-display text-[1.375rem] font-medium tracking-[-0.025em]">{tier.name}</h3>
        {dark && <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">Выбор логистов</span>}
      </div>
      <p className={cn('relative mt-2 min-h-10 text-sm leading-relaxed', muted)}>{tier.tagline}</p>
      <div className="relative mt-8 flex items-baseline gap-2">
        {price === null ? (
          <span className="font-display text-[2rem] font-medium tracking-[-0.04em]">По договору</span>
        ) : price === 0 ? (
          <>
            <span className="font-display text-[2.5rem] font-medium tracking-[-0.04em]">0 ₽</span>
            <span className={cn('text-sm', muted)}>навсегда</span>
          </>
        ) : (
          <>
            <span className="font-display text-[2.5rem] font-medium tracking-[-0.04em] tabular-nums">{formatPrice(price)}</span>
            <span className={cn('text-sm', muted)}>в месяц</span>
          </>
        )}
      </div>
      <p className={cn('relative mt-2 min-h-5 text-[13px]', muted)}>
        {tier.price &&
          tier.price.monthly > 0 &&
          (yearly ? `${formatPrice(tier.price.yearly * 12)} при оплате за год` : 'при оплате помесячно')}
        {tier.price === null && 'Лимиты, срок и цена — под ваши объёмы'}
      </p>
      <Button
        asChild
        size="lg"
        variant={dark || tier.id === 'free' ? 'default' : 'outline'}
        className={cn('relative mt-8', dark ? whiteButton : tier.id === 'free' ? inkButton : lineButton)}
      >
        {href.startsWith('#') ? <a href={href}>{tier.cta}</a> : <Link to={href}>{tier.cta}</Link>}
      </Button>
      <ul className={cn('relative mt-8 space-y-3 border-t pt-8 text-[15px]', dark ? 'border-white/10' : 'border-ink/[0.08]')}>
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check className={cn('mt-0.5 size-4 shrink-0', dark ? 'text-primary' : 'text-ink/40')} strokeWidth={2} />
            <span className={dark ? 'text-white/85' : 'text-ink/70'}>{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-white py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-12">
        <SectionHeader
          className="lg:col-span-5"
          title="Частые вопросы"
          text="Не нашли ответ — напишите нам через форму ниже, ответим в течение рабочего дня."
        />
        <div className="border-b border-ink/[0.08] lg:col-span-7">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-t border-ink/[0.08]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-medium tracking-[-0.01em] outline-none focus-visible:text-primary [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/[0.04] transition-colors group-open:bg-ink group-open:text-white">
                  <Plus className="size-4 transition-transform duration-200 group-open:rotate-45" />
                </span>
              </summary>
              <p className="max-w-2xl pr-12 pb-7 leading-relaxed text-ink/55">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

const CONTACT = TIERS_ENABLED
  ? {
      title: 'Особые объёмы и условия — обсудим лично',
      text: 'Тариф «Индивидуальный» — для компаний, которым нужны свои лимиты, договор и оплата по счёту, а также помощь с внедрением: настроим транспорт и типовые грузы, обучим команду.',
      points: ['Условия и срок — по договору', 'Закрывающие документы', 'Персональный контакт для вопросов'],
      submit: 'Обсудить условия',
    }
  : {
      title: 'Особая задача или большие объёмы — обсудим',
      text: 'Расскажите, что и как вы грузите: поможем с внедрением, заведём ваш транспорт и типовые грузы, покажем команде, как работать с планировщиком.',
      points: ['Помощь с внедрением', 'Настройка под ваш транспорт и грузы', 'Ответ в течение рабочего дня'],
      submit: 'Отправить',
    };

function Contact() {
  return (
    <section id="contact" className="scroll-mt-16 bg-white pb-24 sm:pb-32">
      <Container>
        <div className="grid gap-10 rounded-[32px] bg-[#f4f4f6] p-6 sm:p-12 lg:grid-cols-2 lg:gap-16 lg:p-16">
          <div className="lg:pt-2">
            <h2 className={cn(displayTitle, 'text-[1.8rem] leading-[1.08] sm:text-[2.4rem]')}>{CONTACT.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-pretty text-ink/55">{CONTACT.text}</p>
            <ul className="mt-8 space-y-3.5">
              {CONTACT.points.map((x) => (
                <li key={x} className="flex items-center gap-3 text-[15px] text-ink/75">
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(10,11,13,0.25)] ring-1 ring-ink/[0.05] sm:p-8">
            <LeadForm tier={TIERS_ENABLED ? 'custom' : undefined} submitLabel={CONTACT.submit} submitClassName={inkButton} />
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <DitherBackground className="-z-10 opacity-70" waveSpeed={0.025} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(10,11,13,0.92),rgba(10,11,13,0.4))]"
      />
      <Container className="py-28 text-center sm:py-40">
        <h2
          className={cn(
            displayTitle,
            'mx-auto max-w-3xl text-[2.1rem] leading-[1.05] tracking-[-0.022em] sm:text-[3.25rem] lg:text-[4rem]',
          )}
        >
          Следующую машину — загрузите в Loader3D
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/55">
          {TIERS_ENABLED
            ? 'Регистрация за минуту. Бесплатный тариф — без ограничения по сроку.'
            : 'Регистрация за минуту — и можно загружать первую машину.'}
        </p>
        <Button asChild size="lg" className={cn(whiteButton, 'mt-10 h-12 px-8 text-base')}>
          <Link to="/register">
            Создать аккаунт <ArrowRight />
          </Link>
        </Button>
      </Container>
    </section>
  );
}
