import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowRight, ChevronRight, Plus } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteThemeSwitch } from '@/components/site';
import { Button } from '@/components/ui/button';
import { useSectionTracking } from '@/lib/analytics';
import { useSiteTheme } from '@/lib/theme';
import { TIERS_ENABLED, TRIAL_DAYS } from '@/lib/tiers';
import { TOOL_PAGES, TOOLS_HUB, type ToolId } from '@/lib/toolPages';
import { cn } from '@/lib/utils';
import { parseNumber } from '@/core/units';
import type { FloorSpot } from '@/core/tools/floorFit';
import { encodeStart, type StartSpec } from '@/core/tools/startPlan';
import { useAuth } from '@/store/useAuth';

/**
 * Building blocks of the calculator pages (pages/tools): the look of the landing page in the manner of vercel.com,
 * light by default and dark for the visit by the switch in the header (lib/theme.ts useSiteTheme; the colours are
 * the site-* tokens of `.site-page` in index.css). Prerendered on
 * the server like the landing page — nothing here touches window/document while rendering. Sections carry
 * `data-section` and the buttons to the registration `data-track` (lib/analytics.ts).
 */

/** Headlines: Geist, tight, in the page's text colour. */
export const siteTitle = 'font-geist font-[480] tracking-[-0.055em] text-balance text-site-fg';
const solidPill =
  'h-10 rounded-full bg-site-solid px-4 text-[15px] font-medium text-site-solid-fg shadow-none transition-opacity hover:bg-site-solid hover:opacity-85 focus-visible:ring-site-ring';
const outlinePill =
  'h-10 rounded-full border border-site-line bg-site-bg px-4 text-[15px] font-medium text-site-fg shadow-none transition-colors hover:border-site-strong hover:bg-site-soft hover:text-site-fg focus-visible:ring-site-ring';
const headerSolid = 'h-8 rounded-md bg-site-solid px-3 text-sm font-medium text-site-solid-fg hover:bg-site-solid hover:opacity-85';
const headerOutline =
  'h-8 rounded-md border border-site-line bg-site-bg px-3 text-sm font-medium text-site-fg hover:bg-site-soft hover:text-site-fg';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-5 sm:px-6', className)}>{children}</div>;
}

const REGISTER = TIERS_ENABLED ? '/register?tier=pro' : '/register';

/**
 * Where «Попробовать в 3D» leads. With a calculation (`start`): to /start, which makes it a plan — through the
 * registration with the «Pro» trial for a visitor (the address rides in `state.from`, see AuthPage), straight
 * for a signed-in user. Without one: the registration, or the plans.
 */
export function useTryLink(start?: StartSpec | null): { to: string; state?: { from: string } } {
  const user = useAuth((s) => s.user);
  const startPath = start ? `/start?${new URLSearchParams({ d: encodeStart(start) })}` : null;
  if (user) return { to: startPath ?? '/plans' };
  return startPath ? { to: REGISTER, state: { from: startPath } } : { to: REGISTER };
}

/** Sets the title and description of a page opened inside the app (the prerendered HTML has its own). */
function usePageMeta(title: string, description: string, path: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previous = { title: document.title, description: meta?.content, canonical: canonical?.href };
    document.title = title;
    if (meta) meta.content = description;
    if (canonical) canonical.href = new URL(path, canonical.href).href;
    return () => {
      document.title = previous.title;
      if (meta && previous.description !== undefined) meta.content = previous.description;
      if (canonical && previous.canonical) canonical.href = previous.canonical;
    };
  }, [title, description, path]);
}

function ToolHeader() {
  const user = useAuth((s) => s.user);
  return (
    <header className="sticky top-0 z-40 border-b border-site-line bg-site-bg/80 backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex h-16 items-center gap-4 sm:gap-8">
        <Logo className="text-site-fg" />
        <nav aria-label="Разделы" className="hidden items-center gap-6 text-sm md:flex">
          <Link to={TOOLS_HUB.path} className="text-site-muted transition-colors hover:text-site-fg">
            Калькуляторы
          </Link>
          <Link to="/#features" className="text-site-muted transition-colors hover:text-site-fg">
            Возможности
          </Link>
          {TIERS_ENABLED && (
            <Link to="/pricing" className="text-site-muted transition-colors hover:text-site-fg">
              Тарифы
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SiteThemeSwitch />
          {user ? (
            <Button asChild className={headerSolid}>
              <Link to="/plans">Мои схемы</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" className={headerOutline}>
                <Link to="/login" data-track="header_login">
                  Войти
                </Link>
              </Button>
              <Button asChild className={headerSolid}>
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

function Breadcrumbs({ name }: { name?: string }) {
  const item = 'transition-colors hover:text-site-fg';
  return (
    <nav aria-label="Навигация" className="text-[13px] text-site-faint">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to="/" className={item}>
            Loader3D
          </Link>
        </li>
        <ChevronRight className="size-3.5 text-site-faint" aria-hidden />
        <li>
          {name ? (
            <Link to={TOOLS_HUB.path} className={item}>
              {TOOLS_HUB.name}
            </Link>
          ) : (
            <span aria-current="page" className="text-site-fg">
              {TOOLS_HUB.name}
            </span>
          )}
        </li>
        {name && (
          <>
            <ChevronRight className="size-3.5 text-site-faint" aria-hidden />
            <li aria-current="page" className="text-site-fg">
              {name}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

/** The frame of a calculator page or the hub: header, breadcrumbs, the H1 with its lead, content, footer. */
export function ToolShell({
  title,
  description,
  path,
  h1,
  lead,
  name,
  children,
}: {
  title: string;
  description: string;
  path: string;
  h1: string;
  lead: ReactNode;
  /** The page's name in the breadcrumbs; none on the hub. */
  name?: string;
  children: ReactNode;
}) {
  usePageMeta(title, description, path);
  useSectionTracking();
  // Opened by a link inside the site: from the top (the first page load keeps the browser's own scroll).
  const { key } = useLocation();
  useEffect(() => {
    if (key !== 'default') window.scrollTo(0, 0);
  }, [key]);
  const [theme] = useSiteTheme();
  return (
    <div
      className={cn(
        'site-page min-h-dvh bg-site-bg font-geist text-site-fg antialiased selection:bg-primary/25',
        theme === 'dark' && 'dark',
      )}
    >
      <ToolHeader />
      <main>
        <Container className="pt-10 pb-12 sm:pt-14 sm:pb-16">
          <Breadcrumbs name={name} />
          <h1 className={cn(siteTitle, 'mt-6 max-w-4xl text-[2.3rem] leading-[1.02] sm:text-[3rem] lg:text-[3.5rem]')}>{h1}</h1>
          <div className="mt-6 max-w-3xl space-y-3 text-[17px] leading-[1.65] text-pretty text-site-muted [&_strong]:font-medium [&_strong]:text-site-fg">
            {lead}
          </div>
        </Container>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

// ------------------------------------------------------------------ calculator frame and inputs

/** The calculator: inputs on the left, results on the right (one under the other on a phone). */
export function CalcFrame({ inputs, results, className }: { inputs: ReactNode; results: ReactNode; className?: string }) {
  return (
    <section data-section="tool_calc" aria-label="Калькулятор" className={className}>
      <Container>
        <div className="grid overflow-hidden rounded-xl border border-site-line bg-site-panel lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className="space-y-6 border-b border-site-line p-5 sm:p-7 lg:border-r lg:border-b-0">{inputs}</div>
          <div className="min-w-0 p-5 sm:p-7">{results}</div>
        </div>
      </Container>
    </section>
  );
}

export function FieldGroup({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[13px] font-medium text-site-fg">{title}</legend>
      <div className="mt-3 space-y-3">{children}</div>
      {hint && <p className="mt-2 text-[12px] leading-relaxed text-site-faint">{hint}</p>}
    </fieldset>
  );
}

const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-site-line bg-site-field px-3 font-geist-mono text-[14px] text-site-fg tabular-nums outline-none transition-colors placeholder:text-site-faint hover:border-site-strong focus-visible:border-site-strong focus-visible:ring-3 focus-visible:ring-site-ring aria-invalid:border-site-error';

export interface NumberState {
  text: string;
  value: number | null;
  set(text: string): void;
  /** Puts a number in (a preset was chosen). */
  put(value: number): void;
}

const plainFormat = new Map<number, Intl.NumberFormat>();
/** «13,6» — a number as a field shows it. */
export function plainNumber(n: number, digits = 2): string {
  let f = plainFormat.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, useGrouping: false });
    plainFormat.set(digits, f);
  }
  return f.format(n);
}

/** A number field's text and its value (null: empty, not a number or outside [min, max]). */
export function useNumber(initial: number, min: number, max: number, digits = 2): NumberState {
  const [text, setText] = useState(() => plainNumber(initial, digits));
  const parsed = parseNumber(text);
  const value = parsed !== null && parsed >= min && parsed <= max ? parsed : null;
  return { text, value, set: setText, put: (v: number) => setText(plainNumber(v, digits)) };
}

export function NumberField({
  label,
  unit,
  state,
  onEdit,
  className,
}: {
  label: string;
  unit?: string;
  state: NumberState;
  /** Called on typing (a preset is no longer the choice). */
  onEdit?: () => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('block min-w-0', className)}>
      <span className="block text-[12px] text-site-muted">{label}</span>
      <span className="relative mt-1.5 block">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={state.text}
          aria-invalid={state.value === null || undefined}
          onChange={(e) => {
            state.set(e.target.value);
            onEdit?.();
          }}
          className={cn(inputClass, unit && 'pr-10')}
        />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[12px] text-site-faint">{unit}</span>}
      </span>
    </label>
  );
}

/** One choice of a few, as pills. `null` value: none of them (own sizes). */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange(value: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-site-ring',
            value === o.value ? 'bg-site-solid text-site-solid-fg' : 'border border-site-line text-site-muted hover:border-site-strong hover:text-site-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange(checked: boolean): void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[14px] text-site-fg">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 cursor-pointer appearance-none rounded border border-site-strong bg-transparent bg-center bg-no-repeat transition-colors outline-none checked:border-site-solid checked:bg-site-solid checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20d=%22M3.5%208.5l3%203%206-7%22%20fill=%22none%22%20stroke=%22%23fff%22%20stroke-width=%222%22/%3E%3C/svg%3E')] dark:checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20d=%22M3.5%208.5l3%203%206-7%22%20fill=%22none%22%20stroke=%22%23000%22%20stroke-width=%222%22/%3E%3C/svg%3E')] focus-visible:ring-3 focus-visible:ring-site-ring"
      />
      {label}
    </label>
  );
}

/** A small button inside the inputs (add a row). */
export function GhostButton({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-site-line px-3 text-[13px] text-site-muted transition-colors outline-none hover:border-site-strong hover:text-site-fg focus-visible:ring-3 focus-visible:ring-site-ring"
    >
      <Plus className="size-3.5" /> {children}
    </button>
  );
}

// ------------------------------------------------------------------ results

const numberFormats = new Map<number, Intl.NumberFormat>();
/** «1 234,5» */
export function num(n: number, digits = 1): string {
  let f = numberFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits });
    numberFormats.set(digits, f);
  }
  return f.format(n);
}

/** «12,4 т» from a tonne up, «450 кг» below. */
export function tonnes(kg: number): string {
  return Math.abs(kg) >= 1000 ? `${num(kg / 1000, 2)} т` : `${num(kg, 0)} кг`;
}

export function BigResult({ value, label, note }: { value: ReactNode; label: ReactNode; note?: ReactNode }) {
  return (
    <div aria-live="polite">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-geist text-[3.5rem] leading-none font-semibold tracking-[-0.06em] text-site-fg tabular-nums sm:text-[4.5rem]">
          {value}
        </span>
        <span className="text-lg text-site-fg">{label}</span>
      </p>
      {note && <p className="mt-3 text-[15px] leading-relaxed text-site-muted">{note}</p>}
    </div>
  );
}

export function Stats({ items }: { items: ReadonlyArray<{ label: string; value: ReactNode; hint?: ReactNode } | false | null> }) {
  const shown = items.filter((x): x is { label: string; value: ReactNode; hint?: ReactNode } => !!x);
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-site-line bg-site-line sm:grid-cols-3">
      {shown.map((s, i) => {
        // The last cell fills its row: no empty cell shows the grid's lines through.
        const last = i === shown.length - 1;
        const span = last
          ? cn(shown.length % 2 === 1 && 'col-span-2', shown.length % 3 === 1 ? 'sm:col-span-3' : shown.length % 3 === 2 ? 'sm:col-span-2' : 'sm:col-span-1')
          : '';
        return (
          <div key={s.label} className={cn('bg-site-panel px-4 py-3.5', span)}>
            <dt className="text-[12px] text-site-faint">{s.label}</dt>
            <dd className="mt-1 font-geist-mono text-[15px] text-site-fg tabular-nums">{s.value}</dd>
            {s.hint && <dd className="mt-0.5 text-[12px] text-site-faint">{s.hint}</dd>}
          </div>
        );
      })}
    </dl>
  );
}

/** A remark under the results: `warn` — something limits the answer. */
export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <p
      className={cn(
        'rounded-lg px-4 py-3 text-[14px] leading-relaxed',
        warn ? 'bg-site-warn-soft text-site-warn' : 'bg-site-soft text-site-muted',
      )}
    >
      {children}
    </p>
  );
}

/**
 * Top view of a floor with pieces on it, in the units of the floor (cm). The doors are on the left, the front
 * wall (the cab, or nothing for a pallet) on the right, as the editor's top view in the PDF.
 */
export function FloorPlan({
  floor,
  spots,
  ends,
  label,
  className,
}: {
  floor: { l: number; w: number };
  spots: readonly FloorSpot[];
  /** Captions under the left and the right end; none — no captions. */
  ends?: [string, string];
  label: string;
  className?: string;
}) {
  const pad = Math.max(floor.l, floor.w) * 0.01;
  // The drawing is at most 18rem high (max-h-72): no wider than that at its proportions, so the captions stay under it.
  const maxWidth = `${(18 * (floor.l + 2 * pad)) / (floor.w + 2 * pad)}rem`;
  return (
    <figure className={cn('mx-auto w-full', className)} style={{ maxWidth }}>
      <svg
        viewBox={`${-pad} ${-pad} ${floor.l + 2 * pad} ${floor.w + 2 * pad}`}
        className="block h-auto max-h-72 w-full"
        role="img"
        aria-label={label}
      >
        <rect x={0} y={0} width={floor.l} height={floor.w} className="fill-site-plan-floor stroke-site-plan-line" vectorEffect="non-scaling-stroke" />
        {ends && <line x1={floor.l} y1={0} x2={floor.l} y2={floor.w} className="stroke-site-fg" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
        {spots.map((s, i) => (
          <rect
            key={i}
            x={floor.l - s.x - s.l}
            y={s.z}
            width={s.l}
            height={s.w}
            className={cn(s.turned ? 'fill-site-piece-turned' : 'fill-site-piece', 'stroke-site-piece-line')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {ends && (
        <figcaption className="mt-2 flex justify-between font-geist-mono text-[11px] text-site-faint">
          <span>← {ends[0]}</span>
          <span>{ends[1]} →</span>
        </figcaption>
      )}
    </figure>
  );
}

/**
 * «Попробовать в 3D» under the result: the same cargo, with physics, weight and a PDF. `start` — what was
 * calculated, to open as the first plan after the registration (core/tools/startPlan.ts).
 */
export function TryIn3D({ title, children, start }: { title: string; children: ReactNode; start?: StartSpec | null }) {
  const link = useTryLink(start);
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-site-line px-5 py-4">
      <div className="max-w-md">
        <p className="text-[15px] font-medium text-site-fg">{title}</p>
        <p className="mt-1 text-[14px] leading-relaxed text-site-muted">{children}</p>
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <Button asChild className={solidPill}>
          <Link to={link.to} state={link.state} data-track="tool_try3d">
            Попробовать в 3D <ArrowRight />
          </Link>
        </Button>
        <span className="text-[12px] text-site-faint">
          {start ? 'Откроется с этим грузом. ' : ''}
          {TIERS_ENABLED ? `${TRIAL_DAYS} дней «Pro» бесплатно, без карты` : 'Бесплатно, прямо в браузере'}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ text, tables, FAQ, links

/** The explanation under the calculator: h2 sections of plain text. */
export function Article({ children }: { children: ReactNode }) {
  return (
    <section data-section="tool_guide" className="border-t border-site-line py-20 sm:py-24">
      <Container>
        <div
          className={cn(
            // Text in a reading column; tables and pictures may take more room.
            'max-w-[1000px] space-y-5 text-[16px] leading-[1.75] text-site-muted [&>h2]:max-w-3xl [&>h3]:max-w-3xl [&>p]:max-w-3xl [&>ul]:max-w-3xl',
            '[&_h2]:pt-8 [&_h2]:font-geist [&_h2]:text-[1.6rem] [&_h2]:leading-tight [&_h2]:font-medium [&_h2]:tracking-[-0.03em] [&_h2]:text-site-fg first:[&_h2]:pt-0',
            '[&_h3]:pt-3 [&_h3]:text-[17px] [&_h3]:font-medium [&_h3]:text-site-fg',
            '[&_strong]:font-medium [&_strong]:text-site-fg',
            '[&_a]:text-site-fg [&_a]:underline [&_a]:decoration-site-faint [&_a]:underline-offset-4 hover:[&_a]:decoration-site-fg',
            '[&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:list-decimal marker:text-site-faint',
          )}
        >
          {children}
        </div>
      </Container>
    </section>
  );
}

/** A reference table (numbers in mono, the first column as the row's name). */
export function DataTable({
  caption,
  head,
  rows,
  note,
}: {
  caption?: string;
  head: readonly string[];
  rows: ReadonlyArray<readonly ReactNode[]>;
  note?: ReactNode;
}) {
  return (
    <div className="not-prose my-8 max-w-full">
      <div className="overflow-x-auto rounded-lg border border-site-line">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          {caption && <caption className="px-4 pt-4 text-left text-[13px] font-medium text-site-fg">{caption}</caption>}
          <thead>
            <tr className="border-b border-site-line text-[12px] text-site-faint">
              {head.map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-site-line">
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-4 py-3 font-normal whitespace-nowrap text-site-fg">
                      {cell}
                    </th>
                  ) : (
                    <td key={j} className="px-4 py-3 font-geist-mono whitespace-nowrap text-site-fg tabular-nums">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-3 text-[13px] leading-relaxed text-site-faint">{note}</p>}
    </div>
  );
}

export interface FaqItem {
  q: string;
  a: string;
}

/** What a calculator page shows besides its registry entry (lib/toolPages.ts). */
export interface ToolContent {
  /** Under the H1: the short answer first. */
  lead: ReactNode;
  calculator: ReactNode;
  /** The explanation under the calculator: h2 sections. */
  article: ReactNode;
  /** Shown on the page and as FAQPage structured data (the same text). */
  faq: readonly FaqItem[];
  related: readonly ToolId[];
  cta: { title: string; text: string };
}

export function ToolFaq({ items }: { items: readonly FaqItem[] }) {
  return (
    <section data-section="tool_faq" className="border-t border-site-line py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-12">
        <h2 className={cn(siteTitle, 'text-[2rem] leading-tight sm:text-[2.4rem] lg:col-span-4')}>Вопросы</h2>
        <div className="border-b border-site-line lg:col-span-8">
          {items.map((item) => (
            <details key={item.q} className="group border-t border-site-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium tracking-[-0.01em] text-site-fg outline-none transition-colors hover:text-site-fg focus-visible:text-white [&::-webkit-details-marker]:hidden">
                <h3>{item.q}</h3>
                <Plus className="size-4 shrink-0 text-site-faint transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="max-w-2xl pr-10 pb-6 leading-relaxed text-site-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Cards of other calculators. */
export function ToolCards({ ids, className }: { ids: readonly ToolId[]; className?: string }) {
  const pages = ids.map((id) => TOOL_PAGES.find((p) => p.id === id)!).filter(Boolean);
  // Full rows only: the hairlines between the cards are the background showing through.
  const columns = pages.length % 3 === 0 ? 'md:grid-cols-3' : pages.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2';
  return (
    <ul className={cn('grid gap-px overflow-hidden rounded-xl border border-site-line bg-site-line', columns, className)}>
      {pages.map((p) => (
        <li key={p.id} className="bg-site-bg">
          <Link to={p.path} className="group flex h-full flex-col justify-between gap-6 p-6 transition-colors hover:bg-site-panel">
            <span>
              <span className="block text-[16px] font-medium tracking-[-0.01em] text-site-fg">{p.name}</span>
              <span className="mt-1.5 block text-[14px] leading-relaxed text-site-muted">{p.blurb}</span>
            </span>
            <ArrowRight className="size-4 text-site-faint transition-all group-hover:translate-x-0.5 group-hover:text-site-fg" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RelatedTools({ ids }: { ids: readonly ToolId[] }) {
  return (
    <section data-section="tool_related" className="border-t border-site-line py-20 sm:py-24">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className={cn(siteTitle, 'text-[2rem] leading-tight sm:text-[2.4rem]')}>Другие калькуляторы</h2>
          <Link to={TOOLS_HUB.path} className="inline-flex items-center gap-1.5 text-sm text-site-muted transition-colors hover:text-site-fg">
            Все калькуляторы <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <ToolCards ids={ids} className="mt-10" />
      </Container>
    </section>
  );
}

export function ToolCta({ title, text }: { title: string; text: string }) {
  const link = useTryLink();
  return (
    <section data-section="tool_cta" className="border-t border-site-line py-24 sm:py-32">
      <Container className="flex flex-wrap items-end justify-between gap-8">
        <div className="max-w-2xl">
          <h2 className={cn(siteTitle, 'text-[2.2rem] leading-[1.04] sm:text-[2.8rem]')}>{title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-site-muted">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild className={solidPill}>
            <Link to={link.to} data-track="tool_cta_register">
              {TIERS_ENABLED ? `${TRIAL_DAYS} дней «Pro» бесплатно` : 'Начать бесплатно'}
            </Link>
          </Button>
          <Button asChild variant="outline" className={outlinePill}>
            <Link to="/#how">Как это работает</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
