import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CloudCheck,
  FileText,
  Layers,
  Lock,
  Magnet,
  Plus,
  Ruler,
  Tablet,
  Truck,
  Undo2,
  WandSparkles,
  Weight,
} from 'lucide-react';
import { LeadForm } from '@/components/LeadForm';
import { OneCLogo } from '@/components/OneCLogo';
import { Logo, LogoMark } from '@/components/Logo';
import { SessionLoader } from '@/components/RouteGuards';
import { SiteFooter } from '@/components/SiteFooter';
import {
  VehicleGlyph,
  displayTitle,
  headerPrimary,
  headerSecondary,
  mutedText,
  primaryPill,
  publicRoot,
  secondaryPill,
  type VehicleKind,
} from '@/components/site';
import { Button } from '@/components/ui/button';
import { trackAction, useSectionTracking } from '@/lib/analytics';
import { TIERS, TIERS_ENABLED, TRIAL_DAYS, formatPrice, type TierInfo } from '@/lib/tiers';
import { FEATURED_TOOLS, TOOLS_HUB, toolPage } from '@/lib/toolPages';
import { cn } from '@/lib/utils';
import { useAuth, wasSignedIn } from '@/store/useAuth';
import { HeroCubes } from './HeroCubes';
import { LandingDemo } from './LandingDemo';

/**
 * The public product page at `/` (prerendered into index.html by scripts/prerender.mjs for search
 * engines, so it renders without a browser too: no window access while rendering). A logged-in user
 * goes on to their plans; `/pricing` shows the same page at the tariffs (a logged-in user — /billing).
 * With TIERS_ENABLED off the page says nothing about tariffs.
 *
 * In the manner of vercel.com: black, Geist, one-colour hairline art, no gradients. The hero is a line
 * drawing of a trailer that keeps loading itself (CSS only). The pictures in public/landing are
 * screenshots of the real editor in its dark theme with the light 3D scene; the PDF views are light, as
 * the printed report. Sections carry `data-section` and buttons `data-track` for the visit statistics
 * of the admin panel (lib/analytics.ts).
 */
export function LandingRoute({ section }: { section?: 'pricing' }) {
  const status = useAuth((s) => s.status);
  if (!section) {
    if (status === 'authenticated') return <Navigate to="/plans" replace />;
    if (status === 'loading' && wasSignedIn()) return <SessionLoader />;
  }
  // A signed-in user compares the tiers on «Тариф и оплата», with their own tier and usage.
  if (section === 'pricing' && status === 'authenticated') return <Navigate to="/billing" replace />;
  return <LandingPage section={section} />;
}

/**
 * Shown in the FAQ section and as FAQPage structured data in index.html (the same list).
 * `tiers`: shown only with tariffs on (true) or only with them off (false).
 */
const ALL_FAQ: Array<{ q: string; a: string; tiers?: boolean }> = [
  {
    q: 'Чем это лучше схемы в Excel или на бумаге?',
    a: 'В Loader3D груз ведёт себя как настоящий: стоит на полу или на другом грузе, не висит и не проходит сквозь соседей. Сразу видно, что поместится, где центр тяжести и не будет ли перегруза, — до того как машина встала под погрузку.',
  },
  {
    q: 'Сколько времени занимает схема на одну машину?',
    a: 'Обычно несколько минут: выберите кузов, добавьте грузы с размерами и весом и нажмите «Автозагрузка». PDF для водителя и склада — ещё одно нажатие.',
  },
  {
    q: 'Можно ли подтягивать товары из 1С?',
    a: TIERS_ENABLED
      ? 'Да, на тарифе «Индивидуальный». Подключаем интеграцию под вашу конфигурацию 1С: товары с габаритами и весом попадают в схему загрузки без ручного ввода. Оставьте заявку — обсудим.'
      : 'Да, по договору. Подключаем интеграцию под вашу конфигурацию 1С: товары с габаритами и весом попадают в схему загрузки без ручного ввода. Оставьте заявку — обсудим.',
  },
  {
    q: 'Какой транспорт можно планировать?',
    a: 'Еврофура 13,6 м, мега, рефрижератор, сцепка 7,7 + 8,2 м, контейнеры 20′ и 40′, грузовики и фургоны — или свой кузов с размерами и грузоподъёмностью. В одной схеме — до 10 машин.',
  },
  {
    q: 'Учитывается ли вес и перегруз?',
    a: 'Да. У каждого груза есть вес, у кузова — грузоподъёмность, у осей машины — допустимые нагрузки. Масса, LDM, центр тяжести и нагрузка на каждую ось пересчитываются при каждом движении, так что перегруз видно до весовой рамки, а не на ней. Автозагрузка не превышает грузоподъёмность и ставит лёгкое на тяжёлое только с полной опорой.',
  },
  {
    q: 'Считает ли Loader3D нагрузку на оси?',
    a: 'Да, для каждой машины в схеме: передняя и ведущая ось тягача, седло, оси полуприцепа, оси грузовика и прицепа. У шаблонов — оси и массы типичных машин (еврофура с тягачом 4×2, сцепка, контейнеровозы, грузовики), их можно заменить данными из документов своей машины. Нагрузки видны под 3D-сценой, в окне с видом сбоку и в PDF для водителя.',
  },
  {
    q: 'Как водитель получит схему?',
    a: 'PDF в один клик: виды сбоку и сверху с номерами мест, список грузов и пошаговая погрузка. Распечатайте его или отправьте водителю в мессенджер.',
  },
  {
    q: 'Сколько это стоит?',
    a: `«Старт» — бесплатно, навсегда. «Pro» — ${formatPrice(1990)} в месяц или ${formatPrice(1590)} в месяц при оплате за год, первые ${TRIAL_DAYS} дней бесплатно, без карты и без автоматических списаний. «Индивидуальный» — по договору, с оплатой по счёту.`,
    tiers: true,
  },
  {
    q: 'Нужно ли что-то устанавливать?',
    a: 'Нет. Loader3D работает в браузере на компьютере и на планшете. Схемы хранятся в аккаунте и открываются с любого устройства.',
  },
  {
    q: 'Можно ли помочь с внедрением?',
    a: 'Да. Напишите через форму на этой странице: заведём ваш транспорт и типовые грузы и покажем команде, как работать с планировщиком.',
    tiers: false,
  },
];

export const FAQ = ALL_FAQ.filter((f) => f.tiers === undefined || f.tiers === TIERS_ENABLED).map(({ q, a }) => ({ q, a }));

/** The vehicle templates of the editor, as the strip under the product picture. */
const TEMPLATES: Array<{ kind: VehicleKind; name: string }> = [
  { kind: 'semi', name: 'Еврофура 13,6 м' },
  { kind: 'semi', name: 'Мега-трейлер' },
  { kind: 'semi', name: 'Рефрижератор' },
  { kind: 'train', name: 'Сцепка 7,7 + 8,2 м' },
  { kind: 'container', name: 'Контейнер 40′ HC' },
  { kind: 'container', name: 'Контейнер 20′' },
  { kind: 'truck', name: 'Грузовик 10 т' },
  { kind: 'van', name: 'Фургон 3 т' },
];

/** The four things the product does best, under the product picture. */
const HIGHLIGHTS = [
  { icon: WandSparkles, label: 'Автозагрузка', text: 'Кузов раскладывается за одно нажатие — с развесовкой и без перегруза.' },
  { icon: Boxes, label: '5000 грузов', text: 'В одной схеме — хоть сборный груз на десять машин.' },
  { icon: Weight, label: 'Нагрузка на оси', text: 'Масса, нагрузка на каждую ось и центр тяжести — при каждом движении груза.' },
  { icon: FileText, label: '1 клик до PDF', text: 'Схема для водителя и склада: виды, номера мест, порядок погрузки.' },
];

const CAPABILITIES = [
  { icon: Truck, label: 'Готовые кузова', text: 'Еврофура, мега, реф, сцепка, контейнеры, грузовики и фургоны.' },
  { icon: Ruler, label: 'Свои размеры', text: 'Любой кузов: длина, ширина, высота и грузоподъёмность.' },
  { icon: Layers, label: 'До 10 машин в схеме', text: 'Перекладывайте груз между машинами, общий док или у каждой свой.' },
  { icon: Magnet, label: 'Физика и магниты', text: 'Груз встаёт на пол или на другой груз и притягивается к стенкам.' },
  { icon: Lock, label: 'Закреплённый груз', text: 'Уже погруженное не сдвинет ни рука, ни автозагрузка.' },
  { icon: Tablet, label: 'На планшете у рампы', text: 'Интерфейс для пальцев: правьте схему прямо на складе.' },
  { icon: CloudCheck, label: 'Сохраняется само', text: 'Схемы в аккаунте, открываются с любого устройства.' },
  { icon: Undo2, label: 'Отмена любого шага', text: 'Ctrl+Z возвращает раскладку назад — пробуйте смело.' },
  { icon: Boxes, label: 'Типовые грузы', text: 'Европаллеты, IBC и свои места — размеры, вес, количество.' },
];

const STEPS = [
  {
    title: 'Выберите транспорт',
    text: 'Шаблон или свой кузов: размеры и грузоподъёмность.',
    image: { src: '/landing/transport.webp', width: 640, height: 450, alt: 'Панель «Транспорт»: размеры кузова и грузоподъёмность' },
  },
  {
    title: 'Добавьте грузы',
    text: 'Типовые паллеты в один клик или свои места с размерами и весом.',
    image: { src: '/landing/cargo.webp', width: 816, height: 839, alt: 'Форма «Новый груз»: типовые грузы, размеры, вес и количество' },
  },
  {
    title: 'Разложите автоматически',
    text: 'Тяжёлое — вниз и к центру, лёгкое — сверху, без перегруза.',
    image: { src: '/landing/autoload.webp', width: 1024, height: 954, alt: 'Диалог автоматической загрузки: загрузим 51 из 51, центр тяжести — 50% длины, по оси' },
  },
  {
    title: 'Отправьте PDF',
    text: 'Виды сбоку и сверху, номера мест и пошаговая погрузка.',
    image: { src: '/landing/pdf.webp', width: 896, height: 1056, alt: 'Диалог «Экспорт в PDF»: имя файла, ориентация и режим экспорта' },
  },
];

export function LandingPage({ section }: { section?: 'pricing' }) {
  const { hash } = useLocation();
  useEffect(() => {
    const id = section ?? hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [hash, section]);
  useSectionTracking();

  return (
    <div className={publicRoot}>
      <LandingHeader />
      <main>
        <Hero />
        <LandingDemo />
        <Showcase />
        <Features />
        <Workflow />
        <Integration />
        {TIERS_ENABLED && <Pricing />}
        <Faq />
        <Tools />
        <div data-section="cta">
          <Contact />
          <FinalCta />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// ------------------------------------------------------------------ building blocks

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-5 sm:px-6', className)}>{children}</div>;
}

function Shot({
  src,
  width,
  height,
  alt,
  className,
  style,
  eager,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
}) {
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      style={style}
      loading={eager ? undefined : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      className={cn('block h-auto', className)}
    />
  );
}

/** A hairline frame on near-black, as Vercel frames its product pictures. */
function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-xl border border-white/[0.09] bg-[#0a0a0a]', className)}>{children}</div>;
}

function Heading({ children, className, as: Tag = 'h2' }: { children: ReactNode; className?: string; as?: 'h1' | 'h2' }) {
  return (
    <Tag className={cn(displayTitle, 'text-[2.4rem] leading-[1.02] sm:text-[3rem] lg:text-[3.5rem]', className)}>{children}</Tag>
  );
}

/** «Bold label. Grey text.» — the caption under a framed picture. */
function Caption({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <p className="max-w-xl text-[15px] leading-relaxed sm:text-base">
        <span className="font-medium text-[#ededed]">{title}</span> <span className="text-[#a1a1a1]">{children}</span>
      </p>
      {action}
    </div>
  );
}

const smallOutline =
  'h-8 rounded-full border border-[#2e2e2e] bg-[#0a0a0a] px-3.5 text-[13px] font-medium text-[#ededed] transition-colors hover:border-[#454545] hover:bg-[#1a1a1a]';

const NAV = [
  { href: '#features', label: 'Возможности' },
  { href: '#how', label: 'Как это работает' },
  { href: '#integration', label: '1С' },
  ...(TIERS_ENABLED ? [{ href: '#pricing', label: 'Тарифы' }] : []),
  { href: '#faq', label: 'Вопросы' },
];

function LandingHeader() {
  const user = useAuth((s) => s.user);
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/80 backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex h-16 items-center gap-8">
        <Logo className="text-white" />
        <nav aria-label="Разделы" className="hidden items-center gap-6 text-sm lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={cn(mutedText, 'transition-colors hover:text-white')}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Button asChild className={headerPrimary}>
              <Link to="/plans">Мои схемы</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" className={headerSecondary}>
                <Link to="/login" data-track="header_login">
                  Войти
                </Link>
              </Button>
              <Button asChild className={headerPrimary}>
                <Link to="/register" data-track="header_register">
                  <span className="sm:hidden">Начать</span>
                  <span className="hidden sm:inline">Начать бесплатно</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}

// ------------------------------------------------------------------ hero

function Hero() {
  return (
    <section data-section="hero" className="relative overflow-hidden">
      <Container className="grid items-center gap-12 pt-16 pb-16 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:pt-28 lg:pb-24">
        <div className="relative z-10">
          <a
            href="#integration"
            className="landing-rise group inline-flex items-center gap-2.5 rounded-full border border-white/[0.12] bg-[#0a0a0a] py-1 pr-3 pl-1 text-[13px] text-[#a1a1a1] transition-colors hover:border-white/25 hover:text-white"
          >
            <OneCLogo decorative className="size-6" />
            Интеграция с 1С: товары сразу в схему загрузки
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
          <Heading
            as="h1"
            className="landing-rise mt-6 max-w-[13ch] text-[2.9rem] leading-[0.98] [animation-delay:60ms] sm:text-[3.6rem] lg:text-[4.25rem]"
          >
            Загрузите фуру до приезда машины
          </Heading>
          <p className={cn(mutedText, 'landing-rise mt-6 max-w-[34rem] text-lg leading-[1.6] [animation-delay:120ms]')}>
            3D-планировщик загрузки фур и контейнеров: автозагрузка с развесовкой, нагрузка на каждую ось и центр тяжести,
            PDF-схема для водителя. Прямо в браузере.
          </p>
          <div className="landing-rise mt-9 flex flex-wrap gap-3 [animation-delay:180ms]">
            <Button asChild className={primaryPill}>
              <Link to="/register" data-track="hero_register">
                Начать бесплатно
              </Link>
            </Button>
            {/* The demo is for wide screens (LandingDemo); phones get the steps. */}
            <Button asChild variant="outline" className={cn(secondaryPill, 'hidden lg:inline-flex')}>
              <Link to="/demo" data-track="hero_demo" onPointerEnter={() => void import('./DemoPage')}>
                Открыть демо <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className={cn(secondaryPill, 'lg:hidden')}>
              <a href="#how" data-track="hero_how">
                Как это работает
              </a>
            </Button>
          </div>
        </div>
        {/* Wide screens only: on a phone the motion says little and costs the battery. */}
        <div className="landing-rise hidden [animation-delay:200ms] lg:block">
          <HeroCubes />
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ product picture

function Showcase() {
  return (
    <section data-section="showcase" className="relative">
      <Container>
        <ul className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {HIGHLIGHTS.map((h) => (
            <li key={h.label}>
              <p className="flex items-center gap-2 text-sm text-[#a1a1a1]">
                <h.icon className="size-4" strokeWidth={1.75} />
                {h.label}
              </p>
              <p className="mt-3 text-base leading-relaxed text-[#ededed]">{h.text}</p>
            </li>
          ))}
        </ul>
        <TemplatesStrip />
      </Container>
    </section>
  );
}

/** Every vehicle template of the editor, sliding by like a strip of logos. */
function TemplatesStrip() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-14 pr-14">
      {TEMPLATES.map((t) => (
        <li key={t.name} className="flex items-center gap-3 whitespace-nowrap text-white/70">
          <VehicleGlyph kind={t.kind} className="h-[18px]" />
          <span className="text-[15px] font-medium tracking-[-0.01em]">{t.name}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-20 min-w-0 border-y border-white/[0.08] py-8 sm:mt-24">
      <p className={cn(mutedText, 'mb-6 text-center text-[13px]')}>Готовые шаблоны машин и контейнеров — или свои размеры</p>
      <div className="relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <div className="lp-marquee flex">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ features

function Features() {
  return (
    <section id="features" data-section="features" className="scroll-mt-16 py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Heading>Машина уходит полной</Heading>
          <p className={cn(mutedText, 'mt-6 max-w-sm text-lg leading-relaxed')}>
            Не чертёж и не таблица: 3D-сцена, в которой груз ведёт себя как груз, а цифры считаются сами.
          </p>
        </div>
        <div className="grid gap-16">
          <div className="lp-reveal">
            <Frame className="relative">
              <Shot
                src="/landing/editor.webp"
                width={2400}
                height={1500}
                alt="Схема загрузки еврофуры в 3D"
                className="w-full opacity-40"
              />
              <div className="absolute inset-0 grid place-items-center p-6 sm:p-10">
                <Shot
                  src="/landing/autoload.webp"
                  width={1024}
                  height={954}
                  alt="Диалог автоматической загрузки: загрузим 51 из 51, центр тяжести — 50% длины, по оси"
                  className="w-[62%] max-w-[480px] rounded-xl ring-1 ring-white/15"
                />
              </div>
            </Frame>
            <Caption
              title="Автозагрузка."
              action={
                <Button asChild variant="outline" className={smallOutline}>
                  <Link to="/register">Попробовать</Link>
                </Button>
              }
            >
              Тяжёлое — вниз и к центру, лёгкое — сверху и только с полной опорой. Грузоподъёмность не превышается, а
              закреплённый груз остаётся на месте.
            </Caption>
          </div>
          <div className="lp-reveal">
            <Frame className="px-4 pt-8 pb-5 sm:px-10 sm:pt-12 sm:pb-8">
              <AxleArt />
            </Frame>
            <Caption
              title="Нагрузка на каждую ось."
              action={
                <Button asChild variant="outline" className={smallOutline}>
                  <Link to="/register">Попробовать</Link>
                </Button>
              }
            >
              Передняя и ведущая ось тягача, седло, оси полуприцепа, грузовика и прицепа: сколько на каждой и сколько можно.
              Перегруз видно на схеме — до весовой рамки, а не на ней.
            </Caption>
          </div>
          <div className="grid gap-16 xl:grid-cols-2 xl:gap-8">
            <div className="lp-reveal">
              <Frame className="grid aspect-[4/3] place-items-center">
                <MetricsArt />
              </Frame>
              <Caption title="Вес, оси и центр тяжести.">LDM, масса, нагрузка на оси и центр тяжести — при каждом движении груза.</Caption>
            </div>
            <div className="lp-reveal">
              <Frame className="grid aspect-[4/3] place-items-center p-5">
                <PdfPage />
              </Frame>
              <Caption title="PDF для водителя.">Виды сбоку и сверху, номера мест и пошаговая погрузка — в один клик.</Caption>
            </div>
          </div>
        </div>
      </Container>

      <Container className="mt-24 sm:mt-32">
        <ul className="grid gap-x-10 gap-y-12 border-t border-white/[0.08] pt-14 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <li key={c.label} className="group">
              <p className="flex items-center gap-2 text-sm text-[#a1a1a1] transition-colors group-hover:text-[#ededed]">
                <c.icon className="size-4" strokeWidth={1.75} />
                {c.label}
              </p>
              <p className="mt-3 max-w-[22rem] text-base leading-relaxed text-[#ededed]">{c.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function MetricsArt() {
  const rows = [
    { label: 'LDM', value: '13,4 м', width: '98%' },
    { label: 'Масса', value: '18 из 20 т', width: '90%' },
    { label: 'Ведущая ось', value: '10,4 из 11,5 т', width: '90%' },
  ];
  return (
    <div className="w-[80%] max-w-[380px] space-y-5 font-geist-mono text-xs">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex justify-between text-[#8f8f8f]">
            <span>{r.label}</span>
            <span className="text-[#ededed]">{r.value}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="lp-fill h-full rounded-full bg-[#ededed]" style={{ width: r.width, animationDelay: `${i * 0.25}s` }} />
          </div>
        </div>
      ))}
      <div>
        <div className="flex justify-between text-[#8f8f8f]">
          <span>Центр тяжести</span>
          <span className="text-[#ededed]">50% длины</span>
        </div>
        <div className="relative mt-3 h-px bg-white/20">
          <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-white/30" />
          <span className="lp-cog absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}

/**
 * The axle loads of a loaded euro truck, side view in line art like the editor's «Нагрузка на оси» window: the cab
 * on the right, the loads under the wheels against their limits — the drive axle over it, as a front-heavy load does.
 */
const AXLE_ART = { width: 640, height: 210, ground: 196, wheel: 15, deck: 150, roof: 58, front: 486, doors: 40 };
/** cm of the truck to px: the 13,6 m trailer from the doors to the front wall. */
const AXLE_PX = (AXLE_ART.front - AXLE_ART.doors) / 1360;
const AXLE_LOADS: Array<{ x: number; axles: number; load: string; max: string; over?: boolean; label: string }> = [
  { x: 935, axles: 3, load: '15,9', max: '24', label: 'оси полуприцепа' },
  { x: 220, axles: 1, load: '11,9', max: '11,5', over: true, label: 'ведущая' },
  { x: -130, axles: 1, load: '6,4', max: '8', label: 'передняя' },
];
/** Cargo in the trailer, cm from the front wall and high: the heavy rows at the front. */
const AXLE_CARGO = [
  { from: 0, to: 360, h: 150 },
  { from: 360, to: 600, h: 120 },
  { from: 600, to: 840, h: 140 },
  { from: 840, to: 960, h: 100 },
];

function AxleArt() {
  const { width, height, ground, wheel, deck, roof, front, doors } = AXLE_ART;
  const at = (cm: number) => front - cm * AXLE_PX;
  const cy = ground - wheel;
  const line = 'rgba(255,255,255,0.5)';
  const faint = 'rgba(255,255,255,0.32)';
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Вид сбоку на загруженную фуру: нагрузка на каждую ось и перегруз ведущей оси"
      >
        <line x1={0} y1={ground} x2={width} y2={ground} stroke="rgba(255,255,255,0.14)" vectorEffect="non-scaling-stroke" />
        {AXLE_CARGO.map((c) => (
          <rect
            key={c.from}
            x={at(c.to)}
            y={deck - c.h * AXLE_PX * 1.15}
            width={(c.to - c.from) * AXLE_PX - 3}
            height={c.h * AXLE_PX * 1.15}
            rx={2}
            fill="rgba(255,255,255,0.07)"
            stroke="rgba(255,255,255,0.28)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* The semi-trailer, its frame and the landing gear. */}
        <rect x={doors} y={roof} width={front - doors} height={deck - roof} fill="none" stroke={line} vectorEffect="non-scaling-stroke" />
        <line x1={doors} y1={deck + 7} x2={front} y2={deck + 7} stroke={faint} vectorEffect="non-scaling-stroke" />
        <line x1={at(302)} y1={deck + 7} x2={at(302)} y2={ground - 4} stroke={faint} vectorEffect="non-scaling-stroke" />
        {/* The tractor: the cab, and the chassis under the front of the trailer with the kingpin. */}
        <path
          d={`M${front + 8} ${deck + 20} V${roof + 26} H${front + 62} L${front + 76} ${roof + 58} V${deck + 20} Z`}
          fill="none"
          stroke={line}
          vectorEffect="non-scaling-stroke"
        />
        <line x1={at(300)} y1={deck + 20} x2={front + 76} y2={deck + 20} stroke={faint} vectorEffect="non-scaling-stroke" />
        <path d={`M${at(160) - 6} ${deck + 7} h12 l-6 7 Z`} fill="rgba(255,255,255,0.6)" />
        {AXLE_LOADS.flatMap((g) =>
          Array.from({ length: g.axles }, (_, i) => {
            const x = at(g.x + (i - (g.axles - 1) / 2) * 130);
            return (
              <g key={`${g.x}-${i}`}>
                <circle
                  cx={x}
                  cy={cy}
                  r={wheel}
                  fill="#0a0a0a"
                  stroke={g.over ? '#ededed' : 'rgba(255,255,255,0.45)'}
                  strokeWidth={g.over ? 1.6 : 1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={x} cy={cy} r={wheel * 0.4} fill="none" stroke={faint} vectorEffect="non-scaling-stroke" />
              </g>
            );
          }),
        )}
      </svg>
      {/* The loads under the wheels (HTML, crisp at any size). */}
      <div className="relative mt-3 h-14 font-geist-mono" aria-hidden>
        {AXLE_LOADS.map((g) => (
          <span
            key={g.x}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1 whitespace-nowrap"
            style={{ left: `${(at(g.x) / width) * 100}%` }}
          >
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs tabular-nums',
                g.over ? 'bg-[#ededed] text-[#0a0a0a]' : 'border border-white/15 text-[#ededed]',
              )}
            >
              {g.load} из {g.max} т
            </span>
            <span className={cn('text-[11px]', g.over ? 'text-[#ededed]' : 'text-[#8f8f8f]')}>
              {g.over ? 'перегруз ведущей' : g.label}
            </span>
          </span>
        ))}
      </div>
    </figure>
  );
}

/** A page of the loading plan PDF (print is always light). */
function PdfPage() {
  return (
    <div className="w-full max-w-[460px] -rotate-1 rounded-md bg-white p-4 text-[#0a0b0d] sm:p-5">
      <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2.5">
        <p className="text-[13px] font-semibold tracking-[-0.01em]">Схема загрузки · Москва — Казань</p>
        <p className="hidden text-[11px] text-black/45 sm:block">13,6 м · 46 мест · 18 т</p>
      </div>
      <p className="mt-3 text-[11px] text-black/45">Вид сбоку</p>
      <Shot src="/landing/side.webp" width={2088} height={612} alt="Вид сбоку на загруженный полуприцеп" className="mt-1 w-full rounded" />
      <p className="mt-3 text-[11px] text-black/45">Вид сверху</p>
      <Shot src="/landing/top.webp" width={2088} height={396} alt="Вид сверху с номерами мест" className="mt-1 w-full rounded" />
    </div>
  );
}

// ------------------------------------------------------------------ how it works

/**
 * Wide screens: the steps on the left with a thread between them, the widget of the chosen one on the right
 * — all four pictures are on a stage of one height, top-aligned, and only fade (no movement), so nothing
 * jumps and each is loaded before it is chosen. Phones: the steps one under another, each with its widget
 * centred under it.
 */
/** The sticky header of the landing page, px. */
const HEADER = 64;

const stepNumber = (i: number) => String(i + 1).padStart(2, '0');

/**
 * «От заявки до схемы»: on wide screens the section — its heading too — holds still while the page scrolls through
 * STEPS: the list on the left, the picture of the step on the right (they only fade into each other), the hairline over each step filling as it goes (done steps full); a click
 * scrolls to a step. Read and written once a frame, only while the section is near the screen (as LandingDemo).
 * Phones: the steps one under another. Prerendered: the first render is the first step, nothing filled.
 */
function Workflow() {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = track.current;
    const ol = list.current;
    if (!el || !ol) return;
    const media = window.matchMedia('(min-width: 1024px)');
    const fills = [...ol.querySelectorAll<HTMLElement>('[data-fill]')];
    let raf = 0;
    let shown = 0;
    let last = '';
    const update = () => {
      raf = 0;
      if (!media.matches) return;
      const rect = el.getBoundingClientRect();
      const travel = Math.max(1, rect.height - (window.innerHeight - HEADER));
      const p = Math.min(1, Math.max(0, (HEADER - rect.top) / travel)) * STEPS.length;
      const i = Math.min(STEPS.length - 1, Math.floor(p));
      if (i !== shown) {
        shown = i;
        setActive(i);
      }
      const within = Math.min(1, p - i);
      const key = `${i}:${within.toFixed(3)}`;
      if (key === last) return;
      last = key;
      fills.forEach((f, k) => {
        f.style.transform = `scaleX(${k < i ? 1 : k === i ? within : 0})`;
      });
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    let following = false;
    const follow = (on: boolean) => {
      if (on === following) return;
      following = on;
      if (on) window.addEventListener('scroll', schedule, { passive: true });
      else window.removeEventListener('scroll', schedule);
    };
    const near = new IntersectionObserver(
      ([entry]) => {
        follow(entry.isIntersecting);
        schedule();
      },
      { rootMargin: '25% 0px' },
    );
    near.observe(el);
    window.addEventListener('resize', schedule);
    return () => {
      near.disconnect();
      follow(false);
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  /** Scrolls to where step `i` is on screen (a little into it, so it is the active one). */
  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const travel = Math.max(1, rect.height - (window.innerHeight - HEADER));
    const top = window.scrollY + rect.top - HEADER + travel * ((i + 0.05) / STEPS.length);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <section id="how" data-section="workflow" className="scroll-mt-16 border-t border-white/[0.08] pt-24 pb-12 sm:pt-32 lg:pt-0 lg:pb-0">
      <Container>
        {/* Wide screens: the heading, the steps and their pictures hold still while the page scrolls through the steps. */}
        <div ref={track} className="relative lg:h-[300vh]">
          <div className="lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:pt-12 lg:pb-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <Heading className="max-w-2xl lg:text-[3rem]">От заявки до схемы — за пять минут</Heading>
              <Button asChild className={primaryPill}>
                <Link to="/register">
                  Попробовать на своём грузе <ArrowRight />
                </Link>
              </Button>
            </div>

            <div className="mt-10 hidden min-h-0 flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] items-center gap-16 lg:grid">
              <ol ref={list} className="grid">
                {STEPS.map((s, i) => (
                  <li key={s.title}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={active === i ? 'step' : undefined}
                      className="group relative block w-full py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/[0.1]" />
                      <span aria-hidden data-fill="" className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[#ededed]" />
                      <span className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline">
                        <span
                          className={cn(
                            'font-geist-mono text-[13px] tabular-nums transition-colors duration-300',
                            active === i ? 'text-[#ededed]' : 'text-[#5f5f5f] group-hover:text-[#8f8f8f]',
                          )}
                        >
                          {stepNumber(i)}
                        </span>
                        <span>
                          <span
                            className={cn(
                              'block text-lg font-medium tracking-[-0.01em] transition-colors duration-300',
                              active === i ? 'text-[#ededed]' : 'text-[#8f8f8f] group-hover:text-[#a1a1a1]',
                            )}
                          >
                            {s.title}
                          </span>
                          <span
                            className={cn(
                              'mt-1.5 block text-[15px] leading-relaxed transition-colors duration-300',
                              active === i ? 'text-[#a1a1a1]' : 'text-[#5f5f5f]',
                            )}
                          >
                            {s.text}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {/* The pictures stand in one place and only fade into each other. */}
              <div className="relative h-full max-h-[620px]">
                {STEPS.map((s, i) => (
                  <div
                    key={s.image.src}
                    aria-hidden={active !== i}
                    className={cn(
                      'absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-out motion-reduce:transition-none',
                      active === i ? 'opacity-100' : 'pointer-events-none opacity-0',
                    )}
                  >
                    <Shot
                      {...s.image}
                      className="h-auto max-h-full w-auto rounded-[18px]"
                      style={{ maxWidth: Math.min(s.image.width / 1.6, 640) }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Phones and narrow windows: one under another. */}
            <ol className="mt-12 grid gap-12 lg:hidden">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t border-white/[0.1] pt-6">
                  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline">
                    <span className="font-geist-mono text-[13px] text-[#8f8f8f] tabular-nums">{stepNumber(i)}</span>
                    <div>
                      <p className="text-lg font-medium tracking-[-0.01em] text-[#ededed]">{s.title}</p>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-[#a1a1a1]">{s.text}</p>
                    </div>
                  </div>
                  <Shot {...s.image} className="mx-auto mt-6 w-full rounded-2xl" style={{ maxWidth: s.image.width / 2 }} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ 1С

const ONE_C_ROWS = [
  { name: 'Паллета EUR, бытовая химия', size: '120×80×145', weight: '520 кг' },
  { name: 'Короб, посуда', size: '60×40×40', weight: '18 кг' },
  { name: 'IBC 1000 л', size: '120×100×116', weight: '1 040 кг' },
];

function Integration() {
  return (
    <section id="integration" data-section="integration" className="scroll-mt-16 border-t border-white/[0.08] py-24 sm:py-32">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading className="max-w-xl">
            Товары из{' '}
            <span className="whitespace-nowrap">
              <span className="sr-only">1С</span>
              <OneCLogo decorative className="inline-block size-[1.08em] align-[-0.17em]" />
            </span>{' '}
            — сразу в схему загрузки
          </Heading>
          <p className={cn(mutedText, 'mt-6 max-w-lg text-lg leading-relaxed')}>
            Номенклатура с габаритами и весом приходит из вашей учётной системы. Никакого ручного ввода и ошибок в
            размерах — открыли рейс и загрузили.
          </p>
          <ul className="mt-8 space-y-3 text-[15px] text-[#ededed]">
            {['Габариты и вес — из карточек товаров', 'Список грузов для рейса — без ручного ввода', 'Подключаем под вашу конфигурацию 1С'].map(
              (x) => (
                <li key={x} className="flex items-center gap-3">
                  <Check className="size-4 text-[#a1a1a1]" strokeWidth={2} />
                  {x}
                </li>
              ),
            )}
          </ul>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild className={primaryPill}>
              <a href="#contact" data-track="integration_lead">
                Обсудить подключение
              </a>
            </Button>
            <span className="text-sm text-[#8f8f8f]">
              {TIERS_ENABLED ? 'На тарифе «Индивидуальный»' : 'Подключаем по договору'}
            </span>
          </div>
        </div>

        <Frame className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <OneCLogo className="size-11" />
            <div className="relative h-px flex-1 bg-white/15">
              {[0, 0.9, 1.8].map((d) => (
                <span
                  key={d}
                  className="lp-flow absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ededed]"
                  style={{ '--d': `${d}s` } as CSSProperties}
                />
              ))}
            </div>
            <span className="grid size-11 place-items-center" role="img" aria-label="Loader3D">
              <LogoMark className="size-10 text-white" />
            </span>
          </div>
          <p className="mt-8 font-geist-mono text-[11px] tracking-wide text-[#8f8f8f] uppercase">Номенклатура из 1С</p>
          <ul className="mt-3 divide-y divide-white/[0.08] rounded-lg border border-white/[0.08] font-geist-mono text-xs">
            {ONE_C_ROWS.map((r) => (
              <li key={r.name} className="flex items-center gap-4 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[#ededed]">{r.name}</span>
                <span className="hidden text-[#8f8f8f] sm:inline">{r.size}</span>
                <span className="w-16 text-right text-[#ededed]">{r.weight}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-center gap-2 text-sm text-[#a1a1a1]">
            <ArrowUpRight className="size-4" />
            Попадает в рейс с размерами и весом — осталось нажать «Автозагрузка»
          </p>
        </Frame>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ pricing

function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="pricing" data-section="pricing" className="scroll-mt-16 border-t border-white/[0.08] py-24 sm:py-32">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Heading>Тарифы</Heading>
            <p className={cn(mutedText, 'mt-5 max-w-xl text-lg leading-relaxed')}>
              Начните бесплатно. «Pro» — первые {TRIAL_DAYS} дней без оплаты, без карты и без автоматических списаний.
            </p>
          </div>
          <div role="radiogroup" aria-label="Период оплаты" className="inline-flex rounded-full border border-[#2e2e2e] p-1 text-sm">
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
                  'rounded-full px-4 py-1.5 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-white/30',
                  yearly === o.value ? 'bg-[#ededed] text-black' : 'text-[#a1a1a1] hover:text-white',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-[1fr_1.15fr_1fr]">
          {TIERS.map((t) => (
            <PriceCard key={t.id} tier={t} yearly={yearly} />
          ))}
        </div>
      </Container>
    </section>
  );
}

/**
 * «Pro» stands out by contrast alone: the one light card of the three, with the strongest button;
 * «Старт» is the quiet one.
 */
function PriceCard({ tier, yearly }: { tier: TierInfo; yearly: boolean }) {
  const href = tier.id === 'free' ? '/register' : tier.id === 'pro' ? '/register?tier=pro' : '#contact';
  const price = tier.price && (yearly ? tier.price.yearly : tier.price.monthly);
  const pro = !!tier.highlighted;
  const action = (
    <Button
      asChild
      className={cn(
        'h-11 w-full rounded-full text-[15px] font-medium shadow-none transition-colors',
        pro ? 'bg-black text-white hover:bg-[#1f1f1f]' : 'border border-[#2e2e2e] bg-[#0a0a0a] text-[#ededed] hover:border-[#454545] hover:bg-[#1a1a1a]',
      )}
    >
      {href.startsWith('#') ? (
        <a href={href} data-track={`pricing_${tier.id}`}>
          {tier.cta}
        </a>
      ) : (
        <Link to={href} data-track={`pricing_${tier.id}`}>
          {tier.cta}
        </Link>
      )}
    </Button>
  );
  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl p-7 sm:p-8',
        pro
          ? 'order-first bg-[#ededed] text-[#0a0a0a] lg:order-none lg:-my-4 lg:py-12'
          : 'border border-white/[0.09] bg-[#0a0a0a] text-[#ededed]',
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold tracking-[-0.03em]">{tier.name}</h3>
        {pro && <span className="rounded-full bg-black px-2.5 py-1 text-xs font-medium text-white">Выбор логистов</span>}
      </div>
      <p className={cn('mt-2 min-h-10 text-sm leading-relaxed', pro ? 'text-black/60' : 'text-[#a1a1a1]')}>{tier.tagline}</p>
      <div className="mt-8 flex items-baseline gap-2">
        {price === null ? (
          <span className="text-[2rem] font-semibold tracking-[-0.045em]">По договору</span>
        ) : price === 0 ? (
          <span className="text-[2rem] font-semibold tracking-[-0.045em] text-[#a1a1a1]">Бесплатно</span>
        ) : (
          <>
            <span className="text-[3rem] leading-none font-semibold tracking-[-0.055em] tabular-nums">{formatPrice(price)}</span>
            <span className="text-sm text-black/55">в месяц</span>
          </>
        )}
      </div>
      <p className={cn('mt-3 min-h-5 text-[13px]', pro ? 'text-black/55' : 'text-[#8f8f8f]')}>
        {tier.price && tier.price.monthly > 0 && (yearly ? `${formatPrice(tier.price.yearly * 12)} при оплате за год` : 'при оплате помесячно')}
        {tier.price?.monthly === 0 && 'навсегда, без карты'}
        {tier.price === null && 'Лимиты, срок и цена — под ваши объёмы'}
      </p>
      <div className="mt-8">{action}</div>
      <ul className={cn('mt-8 space-y-3 border-t pt-8 text-[15px]', pro ? 'border-black/10' : 'border-white/[0.08]')}>
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check className={cn('mt-0.5 size-4 shrink-0', pro ? 'text-black' : 'text-[#8f8f8f]')} strokeWidth={2.25} />
            <span className={pro ? 'text-black/80' : 'text-[#ededed]/85'}>{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// ------------------------------------------------------------------ FAQ, contact, final

function Faq() {
  return (
    <section id="faq" data-section="faq" className="scroll-mt-16 border-t border-white/[0.08] py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Heading>Вопросы</Heading>
          <p className={cn(mutedText, 'mt-6 max-w-sm text-lg leading-relaxed')}>
            Не нашли ответ — напишите через форму ниже, ответим в течение рабочего дня.
          </p>
        </div>
        <div className="border-b border-white/[0.08] lg:col-span-7">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-t border-white/[0.08]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[17px] font-medium tracking-[-0.015em] text-[#ededed] outline-none transition-colors hover:text-white focus-visible:text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="size-4 shrink-0 text-white/50 transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className={cn(mutedText, 'max-w-2xl pr-10 pb-7 leading-relaxed')}>{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Links to the free calculators (pages/tools): for visitors and for search engines. */
function Tools() {
  return (
    <section id="tools" data-section="tools" className="scroll-mt-16 border-t border-white/[0.08] py-24 sm:py-32">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Heading>Бесплатные калькуляторы</Heading>
            <p className={cn(mutedText, 'mt-5 max-w-xl text-lg leading-relaxed')}>
              Быстрые ответы без регистрации: сколько паллет встанет в машину, погрузочные метры и нагрузка на оси.
            </p>
          </div>
          <Button asChild variant="outline" className={secondaryPill}>
            <Link to={TOOLS_HUB.path} data-track="tools_all">
              Все калькуляторы <ArrowRight />
            </Link>
          </Button>
        </div>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.09] sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED_TOOLS.map((id) => {
            const page = toolPage(id);
            return (
              <li key={id} className="bg-black">
                <Link
                  to={page.path}
                  data-track="tools_card"
                  className="group flex h-full flex-col justify-between gap-8 p-6 transition-colors hover:bg-[#0a0a0a]"
                >
                  <span>
                    <span className="block text-[16px] font-medium tracking-[-0.01em] text-[#ededed]">{page.name}</span>
                    <span className="mt-1.5 block text-[14px] leading-relaxed text-[#a1a1a1]">{page.blurb}</span>
                  </span>
                  <ArrowRight className="size-4 text-white/40 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

const CONTACT = TIERS_ENABLED
  ? {
      title: 'Особые объёмы, 1С или договор — обсудим',
      text: 'Тариф «Индивидуальный» — для компаний: свои лимиты, интеграция с 1С, договор и оплата по счёту. Поможем с внедрением: заведём транспорт и типовые грузы, обучим команду.',
      points: ['Интеграция с 1С', 'Условия и срок — по договору, закрывающие документы', 'Персональный контакт для вопросов'],
      submit: 'Обсудить условия',
    }
  : {
      title: 'Особая задача, 1С или большие объёмы — обсудим',
      text: 'Расскажите, что и как вы грузите: подключим 1С, заведём ваш транспорт и типовые грузы, покажем команде, как работать с планировщиком.',
      points: ['Интеграция с 1С', 'Настройка под ваш транспорт и грузы', 'Ответ в течение рабочего дня'],
      submit: 'Отправить',
    };

function Contact() {
  return (
    <section id="contact" className="scroll-mt-16 border-t border-white/[0.08] py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading className="max-w-xl text-[2.2rem] sm:text-[2.6rem] lg:text-[3rem]">{CONTACT.title}</Heading>
          <p className={cn(mutedText, 'mt-6 max-w-lg text-lg leading-relaxed text-pretty')}>{CONTACT.text}</p>
          <ul className="mt-8 space-y-3">
            {CONTACT.points.map((x) => (
              <li key={x} className="flex items-center gap-3 text-[15px] text-[#ededed]">
                <Check className="size-4 text-[#a1a1a1]" strokeWidth={2.25} />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <Frame className="p-6 sm:p-8">
          <LeadForm
            tier={TIERS_ENABLED ? 'custom' : undefined}
            submitLabel={CONTACT.submit}
            submitClassName={cn(primaryPill, 'w-full')}
            onSent={() => trackAction('lead_sent')}
          />
        </Frame>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-white/[0.08] py-28 sm:py-36">
      <Container className="flex flex-wrap items-end justify-between gap-8">
        <Heading className="max-w-2xl">Следующую машину — загрузите в Loader3D</Heading>
        <div className="flex flex-wrap gap-3">
          <Button asChild className={primaryPill}>
            <Link to="/register" data-track="cta_register">
              Начать бесплатно
            </Link>
          </Button>
          <Button asChild variant="outline" className={secondaryPill}>
            <a href="#contact" data-track="cta_lead">
              Оставить заявку
            </a>
          </Button>
        </div>
      </Container>
    </section>
  );
}
