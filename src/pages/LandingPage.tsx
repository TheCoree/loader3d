import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { LeadForm } from '@/components/LeadForm';
import { Logo } from '@/components/Logo';
import { SessionLoader } from '@/components/RouteGuards';
import { SiteFooter } from '@/components/SiteFooter';
import {
  GlowCube,
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
import { TIERS, TIERS_ENABLED, TRIAL_DAYS, formatPrice, tierInfo, type TierInfo } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import { useAuth, wasSignedIn } from '@/store/useAuth';

/**
 * The public product page at `/` (prerendered into index.html by scripts/prerender.mjs for search
 * engines, so it renders without a browser too: no window access while rendering). A logged-in user
 * goes on to their plans; `/pricing` shows the same page at the tariffs, without the redirect.
 * With TIERS_ENABLED off the page says nothing about tariffs.
 *
 * Dark only, in the manner of vercel.com: black, Geist, hairlines, product windows and CSS animations.
 * The pictures in public/landing are screenshots of the real editor in its dark theme (a demo plan: euro
 * truck, 51 places); the PDF views (side, top) are light, as the printed report.
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

/** The vehicle templates of the editor, as the strip under the hero. */
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

const HERO_POINTS = ['Для логистов и складов', 'Раскладка с физикой и магнитами', 'PDF-схема для водителя'];

const STEPS = [
  {
    title: 'Выберите транспорт',
    text: 'Еврофура, мега, реф, сцепка, контейнер — или свои размеры кузова и грузоподъёмность.',
    image: { src: '/landing/transport.webp', width: 640, height: 450, alt: 'Панель «Транспорт»: размеры кузова и грузоподъёмность' },
  },
  {
    title: 'Добавьте грузы',
    text: 'Типовые паллеты и IBC в один клик или свои места: размеры, вес, количество.',
    image: { src: '/landing/cargo.webp', width: 716, height: 839, alt: 'Форма «Новый груз»: типовые грузы, размеры, вес и количество' },
  },
  {
    title: 'Разложите и отправьте',
    text: 'Вручную или автозагрузкой. Схема сохраняется сама, PDF — в один клик.',
    image: { src: '/landing/pdf.webp', width: 896, height: 1056, alt: 'Диалог «Экспорт в PDF»: имя файла, ориентация, режим экспорта и тип камеры' },
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
    <div className={publicRoot}>
      <LandingHeader />
      <main>
        <Hero />
        <Showcase
          title="Раскладка руками — как на складе, только заранее"
          lead="Груз ведёт себя как груз:"
          text="встаёт на пол или на другой груз, не висит и не проходит сквозь соседей."
          features={['Физика и опора', 'Магниты к стенкам и граням', 'Кантование в 6 положений', 'Рентген: видно, что внутри']}
        >
          <Window title="Рейс Москва — Казань">
            <Shot
              src="/landing/editor.webp"
              width={2400}
              height={1500}
              alt="Редактор Loader3D в тёмной теме: еврофура с 46 местами в кузове и 5 на доке, размеры кузова, список грузов и статистика"
              className="w-full"
            />
          </Window>
        </Showcase>
        <Showcase
          id="autoload"
          flip
          title="Автозагрузка раскладывает кузов за секунду"
          lead="46 мест из 46"
          text="за одно нажатие: тяжёлое — вниз и к центру, лёгкое — сверху, без перегруза."
          features={['Не превышает грузоподъёмность', 'Лёгкое — только с полной опорой', 'Центр тяжести под контролем', 'Отмена одной кнопкой']}
        >
          <Window title="Автозагрузка" className="relative">
            <Shot
              src="/landing/scene.webp"
              width={1752}
              height={890}
              alt="3D-сцена: полуприцеп с паллетами и размерными линиями, грузы на доке"
              className="w-full opacity-70"
            />
            <div className="absolute inset-y-6 right-6 hidden w-[38%] items-center sm:flex">
              <Shot
                src="/landing/autoload.webp"
                width={1024}
                height={954}
                alt="Диалог автоматической загрузки: загрузим 46 из 46, центр тяжести — 50% длины"
                className="w-full rounded-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
              />
            </div>
          </Window>
        </Showcase>
        <Showcase
          title="Схема, понятная складу и водителю"
          lead="PDF в один клик:"
          text="виды сбоку и сверху с номерами мест, итог по кузову и пошаговая погрузка."
          features={['Виды сбоку и сверху', 'Номера и список мест', 'Пошаговая инструкция', 'Печать или отправка водителю']}
        >
          <PdfPanel />
        </Showcase>
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
  return <div className={cn('mx-auto w-full max-w-[1280px] px-5 sm:px-6', className)}>{children}</div>;
}

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

/** A dark app window around a screenshot: three dots and a title, a faint blue light from above. */
function Window({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-[0_40px_120px_-50px_rgba(47,111,237,0.35)]',
        className,
      )}
    >
      <div className="relative flex h-9 items-center gap-1.5 border-b border-white/[0.08] px-3.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="absolute inset-x-0 text-center text-xs text-white/40">{title}</span>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn(displayTitle, 'text-[2rem] leading-[1.06] sm:text-[2.6rem] lg:text-[3rem]', className)}>
      {children}
    </h2>
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
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/80 backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex h-16 items-center gap-8">
        <Logo className="text-white" />
        <nav aria-label="Разделы" className="hidden items-center gap-6 text-sm md:flex">
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
                <Link to="/login">Войти</Link>
              </Button>
              <Button asChild className={headerPrimary}>
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
    <section className="relative overflow-hidden">
      <Container className="relative grid min-h-[calc(100svh-4rem)] grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto] pt-10 pb-10 lg:max-h-[900px] lg:min-h-[740px]">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.35fr)_auto_minmax(0,0.65fr)] lg:gap-10">
          <GlowCube className="landing-rise order-first mx-auto mt-14 mb-10 scale-[0.72] sm:scale-90 lg:order-none lg:my-0 lg:scale-100" size={190} />
          <div className="order-first">
            <h1
              className={cn(
                displayTitle,
                'landing-rise max-w-[18ch] text-[2.5rem] leading-[1.03] [animation-delay:60ms] sm:text-[3.1rem] lg:text-[3.4rem]',
              )}
            >
              Загрузите фуру в 3D до приезда машины
            </h1>
            <p className={cn(mutedText, 'landing-rise mt-5 max-w-md text-base leading-relaxed [animation-delay:120ms] sm:text-lg')}>
              3D-планировщик загрузки фуры и контейнера. В браузере, без установки.
            </p>
            <div className="landing-rise mt-8 flex flex-wrap gap-3 [animation-delay:180ms]">
              <Button asChild className={primaryPill}>
                <Link to="/register">Начать бесплатно</Link>
              </Button>
              <Button asChild variant="outline" className={secondaryPill}>
                {TIERS_ENABLED ? <a href="#pricing">Тарифы</a> : <a href="#how">Как это работает</a>}
              </Button>
            </div>
          </div>
          <ul className="landing-rise hidden space-y-3 justify-self-end text-[15px] font-medium text-white [animation-delay:240ms] lg:block">
            {HERO_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
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
        <li key={t.name} className="flex items-center gap-3 whitespace-nowrap text-white/80">
          <VehicleGlyph kind={t.kind} className="h-[18px]" />
          <span className="text-[15px] font-medium tracking-[-0.01em]">{t.name}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="landing-rise mt-14 min-w-0 [animation-delay:320ms]">
      <p className={cn(mutedText, 'mb-6 text-center text-[13px]')}>Готовые шаблоны машин и контейнеров — или свои размеры</p>
      <div className="relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="lp-marquee flex">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

/**
 * A product section in the manner of the hero: a big title, the product in a window and, beside it,
 * one fact and what is behind it.
 */
function Showcase({
  id,
  title,
  lead,
  text,
  features,
  flip,
  children,
}: {
  id?: string;
  title: string;
  lead: string;
  text: string;
  features: string[];
  flip?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="relative scroll-mt-16 py-20 sm:py-28">
      <Container className="lp-reveal relative">
        <SectionTitle className={cn('max-w-3xl', flip && 'lg:ml-auto lg:max-w-[42rem]')}>{title}</SectionTitle>
        <div
          className={cn(
            'mt-10 grid items-end gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14',
            flip && 'lg:grid-cols-[300px_minmax(0,1fr)]',
          )}
        >
          <div className={cn(flip && 'lg:order-last')}>{children}</div>
          <div>
            <p className="text-[1.375rem] leading-snug font-medium tracking-[-0.025em] text-white">
              {lead} <span className="text-[#8f8f8f]">{text}</span>
            </p>
            <p className={cn(mutedText, 'mt-8 text-sm')}>Возможности</p>
            <ul className="mt-3 space-y-2 text-[15px] font-medium text-white">
              {features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** A page of the loading plan PDF (print is always light), next to the export dialog. */
function PdfPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] p-5 sm:p-8">
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]"
      />
      <div className="relative mx-auto max-w-[640px] -rotate-1 rounded-md bg-white p-5 text-[#0a0b0d] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] sm:p-7">
        <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-3">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">Схема загрузки · Рейс Москва — Казань</p>
          <p className="hidden text-xs text-black/45 sm:block">Полуприцеп 13,6 м · 46 мест · 18 т</p>
        </div>
        <p className="mt-4 text-xs text-black/45">Вид сбоку</p>
        <Shot src="/landing/side.webp" width={2088} height={612} alt="Вид сбоку на загруженный полуприцеп" className="mt-1.5 w-full rounded" />
        <p className="mt-4 text-xs text-black/45">Вид сверху</p>
        <Shot src="/landing/top.webp" width={2088} height={396} alt="Вид сверху с номерами мест" className="mt-1.5 w-full rounded" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ features grid

/** A cell of the features grid: an animated picture on a faint grid, a title and a text. */
function FeatureCell({ title, text, children, className }: { title: string; text: string; children: ReactNode; className?: string }) {
  return (
    <article className={cn('flex flex-col border-white/10 bg-black', className)}>
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden border-b border-white/10 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:28px_28px]">
        {children}
      </div>
      <div className="p-6 sm:p-7">
        <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-white">{title}</h3>
        <p className={cn(mutedText, 'mt-2 text-[15px] leading-relaxed')}>{text}</p>
      </div>
    </article>
  );
}

function MetricsArt() {
  const rows = [
    { label: 'LDM', value: '13,4 м', width: '98%' },
    { label: 'Масса', value: '18 из 20 т', width: '90%' },
    { label: 'Объём', value: '53%', width: '53%' },
  ];
  return (
    <div className="w-[78%] space-y-4 rounded-lg border border-white/10 bg-black/80 p-5 font-geist-mono text-xs">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex justify-between text-white/50">
            <span>{r.label}</span>
            <span className="text-white">{r.value}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="lp-fill h-full rounded-full bg-primary" style={{ width: r.width, animationDelay: `${i * 0.25}s` }} />
          </div>
        </div>
      ))}
      <div>
        <div className="flex justify-between text-white/50">
          <span>Центр тяжести</span>
          <span className="text-white">50%</span>
        </div>
        <div className="relative mt-2 h-px bg-white/20">
          <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-white/30" />
          <span className="lp-cog absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.5)]" />
        </div>
      </div>
    </div>
  );
}

function LanesArt() {
  const lane = (y: number, active: boolean, moving?: boolean) => (
    <g transform={`translate(0 ${y})`}>
      <rect x="20" y="0" width="190" height="34" rx="2" fill="none" stroke={active ? '#2f6fed' : 'rgba(255,255,255,0.3)'} />
      <path d="M212 8h20l8 10v16h-28Z" fill="none" stroke={active ? '#2f6fed' : 'rgba(255,255,255,0.3)'} />
      <g className={moving ? 'lp-lane' : undefined}>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={110 + i * 30} y="6" width="26" height="22" rx="1.5" fill={active ? 'rgba(47,111,237,0.35)' : 'rgba(255,255,255,0.12)'} stroke={active ? '#2f6fed' : 'rgba(255,255,255,0.35)'} />
        ))}
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 260 150" className="w-[82%]" aria-hidden>
      {lane(12, false)}
      {lane(58, true, true)}
      {lane(104, false)}
    </svg>
  );
}

function XrayArt() {
  // An isometric stack: the front boxes fade out and the one behind them shows.
  const box = (x: number, y: number, fill: string, className?: string) => (
    <g transform={`translate(${x} ${y})`} className={className}>
      <path d="M0 14 28 0l28 14-28 14Z" fill={fill} fillOpacity="0.9" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
      <path d="M0 14v30l28 14V28Z" fill={fill} fillOpacity="0.55" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      <path d="M56 14v30L28 58V28Z" fill={fill} fillOpacity="0.35" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
    </g>
  );
  return (
    <svg viewBox="0 0 220 150" className="w-[70%]" aria-hidden>
      {box(82, 18, '#2f6fed')}
      {box(54, 32, '#3a3b40', 'lp-xray')}
      {box(110, 32, '#3a3b40', 'lp-xray')}
      {box(82, 46, '#3a3b40', 'lp-xray')}
    </svg>
  );
}

function TumbleArt() {
  const face = 'absolute inset-0 border border-white/50';
  const s = 64;
  return (
    <div className="[perspective:600px]" aria-hidden>
      <div className="lp-tumble relative" style={{ width: s * 1.5, height: s }}>
        <div className={cn(face, 'bg-primary/40')} style={{ transform: `translateZ(${s / 2}px)` }} />
        <div className={cn(face, 'bg-white/[0.06]')} style={{ transform: `rotateY(180deg) translateZ(${s / 2}px)` }} />
        <div
          className={cn(face, 'bg-white/[0.12]')}
          style={{ width: s, left: s * 0.25, transform: `rotateY(90deg) translateZ(${(s * 1.5) / 2}px)` }}
        />
        <div
          className={cn(face, 'bg-white/[0.12]')}
          style={{ width: s, left: s * 0.25, transform: `rotateY(-90deg) translateZ(${(s * 1.5) / 2}px)` }}
        />
        <div className={cn(face, 'bg-white/20')} style={{ height: s, transform: `rotateX(90deg) translateZ(${s / 2}px)` }} />
        <div className={cn(face, 'bg-white/[0.04]')} style={{ height: s, transform: `rotateX(-90deg) translateZ(${s / 2}px)` }} />
      </div>
    </div>
  );
}

function TabletArt() {
  return (
    <svg viewBox="0 0 220 150" className="w-[66%]" aria-hidden>
      <rect x="20" y="10" width="180" height="128" rx="12" fill="#050505" stroke="rgba(255,255,255,0.35)" />
      <rect x="30" y="20" width="160" height="108" rx="4" fill="none" stroke="rgba(255,255,255,0.15)" />
      <rect x="40" y="58" width="96" height="44" rx="2" fill="none" stroke="rgba(255,255,255,0.4)" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={44 + i * 22} y="74" width="18" height="24" rx="1" fill="rgba(47,111,237,0.4)" stroke="#2f6fed" />
      ))}
      <rect x="146" y="28" width="36" height="92" rx="3" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
      <circle className="lp-blink" cx="100" cy="86" r="9" fill="rgba(255,255,255,0.18)" stroke="#fff" strokeOpacity="0.8" />
    </svg>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="lp-reveal">
        <SectionTitle className="max-w-3xl">Всё для схемы загрузки — в одном окне</SectionTitle>
        <p className={cn(mutedText, 'mt-5 max-w-xl text-lg leading-relaxed')}>
          Не чертёж и не таблица: настоящая 3D-сцена, в которой груз ведёт себя как груз.
        </p>
        <div className="mt-12 grid overflow-hidden rounded-xl border border-white/10 sm:grid-cols-2 lg:grid-cols-3 [&>*]:border-b sm:[&>*]:border-r">
          <FeatureCell title="LDM, вес и центр тяжести" text="Пересчитываются на лету — при каждом движении груза.">
            <MetricsArt />
          </FeatureCell>
          <FeatureCell title="Несколько машин и сцепки" text="До 10 машин в схеме: перекладывайте груз между ними, общий или свой док.">
            <LanesArt />
          </FeatureCell>
          <FeatureCell title="Рентген груза" text="Грузы, которые закрывают обзор, становятся прозрачными — видно всё, что внутри.">
            <XrayArt />
          </FeatureCell>
          <FeatureCell title="Кантование" text="Шесть положений: на бок, на торец, поворот. Физика учитывает новую высоту.">
            <TumbleArt />
          </FeatureCell>
          <FeatureCell title="На планшете у рампы" text="Интерфейс для пальцев: правьте схему прямо на складе, изменения сохраняются сами.">
            <TabletArt />
          </FeatureCell>
          <Link
            to="/register"
            className="group flex flex-col justify-between bg-primary p-7 text-white transition-colors hover:bg-[#2a63d6] sm:p-8"
          >
            <span className="flex items-start justify-between gap-3 text-[1.75rem] leading-[1.05] font-semibold tracking-[-0.045em]">
              Первая схема за 5 минут
              <ArrowRight className="size-7 shrink-0 transition-transform group-hover:translate-x-1" />
            </span>
            <span className="mt-16 text-[15px] leading-relaxed text-white/85">
              Регистрация бесплатна. Без установки — прямо в браузере.
            </span>
          </Link>
        </div>
        <dl className="mt-16 grid grid-cols-2 border-y border-white/10 sm:grid-cols-4">
          {FACTS.map((f, i) => (
            <div key={f.label} className={cn('flex flex-col-reverse px-1 py-8 sm:px-6', i > 0 && 'sm:border-l sm:border-white/10', i % 2 === 1 && 'border-l border-white/10 sm:border-l')}>
              <dt className={cn(mutedText, 'mt-1 text-sm')}>{f.label}</dt>
              <dd className="text-[2.4rem] leading-none font-semibold tracking-[-0.05em] text-white tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Steps() {
  return (
    <section id="how" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="lp-reveal">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle className="max-w-2xl">Три шага от заявки до схемы погрузки</SectionTitle>
          <Button asChild className={primaryPill}>
            <Link to="/register">
              Попробовать на своём грузе <ArrowRight />
            </Link>
          </Button>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-white/10 bg-[radial-gradient(70%_60%_at_50%_30%,rgba(47,111,237,0.14),transparent)] p-6 sm:p-8">
                <Shot {...s.image} className="max-h-full w-auto max-w-full rounded-lg shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10" />
              </div>
              <div className="p-6 sm:p-7">
                <p className="font-geist-mono text-xs text-primary">0{i + 1}</p>
                <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-white">{s.title}</h3>
                <p className={cn(mutedText, 'mt-2 text-[15px] leading-relaxed')}>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="pricing" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="lp-reveal">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <SectionTitle className="max-w-2xl">Начните бесплатно. Платите, когда планировщик начнёт экономить рейсы</SectionTitle>
            <p className={cn(mutedText, 'mt-5 max-w-xl text-lg leading-relaxed')}>
              Попробуйте «{tierInfo('pro').name}» {TRIAL_DAYS} дней бесплатно — без карты и автоматических списаний.
            </p>
          </div>
          <div role="radiogroup" aria-label="Период оплаты" className="inline-flex rounded-full border border-white/10 p-1 text-sm">
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
                  yearly === o.value ? 'bg-white text-black' : 'text-[#a1a1a1] hover:text-white',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
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
  const top = !!tier.highlighted;
  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border bg-[#0a0a0a] p-8',
        top ? 'border-white/40 shadow-[0_0_80px_-20px_rgba(47,111,237,0.5)]' : 'border-white/10',
      )}
    >
      {top && <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/30 blur-3xl" />}
      <div className="relative flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">{tier.name}</h3>
        {top && <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/80">Выбор логистов</span>}
      </div>
      <p className={cn(mutedText, 'relative mt-2 min-h-10 text-sm leading-relaxed')}>{tier.tagline}</p>
      <div className="relative mt-8 flex items-baseline gap-2 text-white">
        {price === null ? (
          <span className="text-[2rem] font-semibold tracking-[-0.045em]">По договору</span>
        ) : price === 0 ? (
          <>
            <span className="text-[2.5rem] font-semibold tracking-[-0.05em]">0 ₽</span>
            <span className={cn(mutedText, 'text-sm')}>навсегда</span>
          </>
        ) : (
          <>
            <span className="text-[2.5rem] font-semibold tracking-[-0.05em] tabular-nums">{formatPrice(price)}</span>
            <span className={cn(mutedText, 'text-sm')}>в месяц</span>
          </>
        )}
      </div>
      <p className={cn(mutedText, 'relative mt-2 min-h-5 text-[13px]')}>
        {tier.price &&
          tier.price.monthly > 0 &&
          (yearly ? `${formatPrice(tier.price.yearly * 12)} при оплате за год` : 'при оплате помесячно')}
        {tier.price === null && 'Лимиты, срок и цена — под ваши объёмы'}
      </p>
      <Button asChild variant={top ? 'default' : 'outline'} className={cn('relative mt-8', top ? primaryPill : secondaryPill)}>
        {href.startsWith('#') ? <a href={href}>{tier.cta}</a> : <Link to={href}>{tier.cta}</Link>}
      </Button>
      <ul className="relative mt-8 space-y-3 border-t border-white/10 pt-8 text-[15px]">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check className={cn('mt-0.5 size-4 shrink-0', top ? 'text-primary' : 'text-white/40')} strokeWidth={2} />
            <span className="text-white/80">{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="lp-reveal grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionTitle>Частые вопросы</SectionTitle>
          <p className={cn(mutedText, 'mt-5 max-w-sm text-lg leading-relaxed')}>
            Не нашли ответ — напишите нам через форму ниже, ответим в течение рабочего дня.
          </p>
        </div>
        <div className="border-b border-white/10 lg:col-span-7">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-t border-white/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[17px] font-medium tracking-[-0.015em] text-white outline-none focus-visible:text-primary [&::-webkit-details-marker]:hidden">
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
    <section id="contact" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="lp-reveal">
        <div className="grid gap-10 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] p-6 sm:p-10 lg:grid-cols-2 lg:gap-16 lg:p-14">
          <div>
            <SectionTitle className="text-[1.8rem] sm:text-[2.2rem] lg:text-[2.4rem]">{CONTACT.title}</SectionTitle>
            <p className={cn(mutedText, 'mt-5 text-lg leading-relaxed text-pretty')}>{CONTACT.text}</p>
            <ul className="mt-8 space-y-3">
              {CONTACT.points.map((x) => (
                <li key={x} className="flex items-center gap-3 text-[15px] text-white/85">
                  <Check className="size-4 text-primary" strokeWidth={2.5} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-black p-6 sm:p-8">
            <LeadForm tier={TIERS_ENABLED ? 'custom' : undefined} submitLabel={CONTACT.submit} submitClassName={cn(primaryPill, 'w-full')} />
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(45%_70%_at_50%_100%,rgba(47,111,237,0.28),transparent)]"
      />
      <Container className="lp-reveal relative text-center">
        <SectionTitle className="mx-auto max-w-3xl">Следующую машину — загрузите в Loader3D</SectionTitle>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild className={primaryPill}>
            <Link to="/register">Начать бесплатно</Link>
          </Button>
          <Button asChild variant="outline" className={secondaryPill}>
            <a href="#contact">Оставить заявку</a>
          </Button>
        </div>
      </Container>
    </section>
  );
}
