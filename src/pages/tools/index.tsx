import { TOOL_PAGES, TOOLS_HUB, documentTitle, toolPage, type ToolId } from '@/lib/toolPages';
import { cn } from '@/lib/utils';
import { AXLE_LOADS } from './AxlePage';
import { BOXES_ON_PALLET, CARGO_VOLUME } from './CargoPages';
import { CONTAINER_DIMENSIONS, TRUCK_DIMENSIONS } from './DimensionsPages';
import { LDM } from './LdmPage';
import { PALLETS_CONTAINER, PALLETS_GAZELLE, PALLETS_TRUCK } from './PalletPages';
import { LOADING_PLAN } from './SchemePage';
import { Article, Container, RelatedTools, ToolCards, ToolCta, ToolFaq, ToolShell, siteTitle, type FaqItem, type ToolContent } from './kit';

/**
 * The public calculator pages (/kalkulyator/…): a free calculator, a short explanation and «Попробовать в 3D».
 * Prerendered by scripts/prerender.mjs like the landing page (one HTML file each), hydrated by main.tsx.
 * Addresses, titles and descriptions — lib/toolPages.ts; the numbers — core/tools.
 */

export const TOOL_CONTENT: Record<ToolId, ToolContent> = {
  'pallets-truck': PALLETS_TRUCK,
  'pallets-container': PALLETS_CONTAINER,
  ldm: LDM,
  'axle-loads': AXLE_LOADS,
  'pallets-gazelle': PALLETS_GAZELLE,
  'truck-dimensions': TRUCK_DIMENSIONS,
  'container-dimensions': CONTAINER_DIMENSIONS,
  'boxes-on-pallet': BOXES_ON_PALLET,
  'cargo-volume': CARGO_VOLUME,
  'loading-plan': LOADING_PLAN,
};

/** The FAQ of a page, for its FAQPage structured data (src/prerender.tsx). */
export function toolFaq(id: ToolId): readonly FaqItem[] {
  return TOOL_CONTENT[id].faq;
}

export function ToolPage({ id }: { id: ToolId }) {
  const page = toolPage(id);
  const content = TOOL_CONTENT[id];
  return (
    <ToolShell title={documentTitle(page)} description={page.description} path={page.path} h1={page.h1} lead={content.lead} name={page.name}>
      {content.calculator}
      <Article>{content.article}</Article>
      <ToolFaq items={content.faq} />
      <RelatedTools ids={content.related} />
      <ToolCta {...content.cta} />
    </ToolShell>
  );
}

/** Groups of the hub, in the order a logistician meets the questions. */
const HUB_GROUPS: Array<{ title: string; text: string; ids: ToolId[] }> = [
  {
    title: 'Сколько поместится',
    text: 'Паллеты и коробки — в фуре, контейнере, газели и на паллете.',
    ids: ['pallets-truck', 'pallets-container', 'pallets-gazelle', 'boxes-on-pallet'],
  },
  {
    title: 'Место, вес и оси',
    text: 'Погрузочные метры, объём груза и как его вес ляжет на оси.',
    ids: ['ldm', 'cargo-volume', 'axle-loads'],
  },
  {
    title: 'Кузова и схема',
    text: 'Размеры машин и контейнеров и как составить схему загрузки.',
    ids: ['truck-dimensions', 'container-dimensions', 'loading-plan'],
  },
];

export function ToolsHub() {
  return (
    <ToolShell
      title={TOOLS_HUB.title}
      description={TOOLS_HUB.description}
      path={TOOLS_HUB.path}
      h1={TOOLS_HUB.h1}
      lead={
        <p>
          Бесплатные калькуляторы для логиста и склада: сколько паллет встанет в машину, погрузочные метры, объём груза и нагрузка
          на оси — без регистрации. Когда цифры сошлись, ту же машину можно загрузить в 3D и отдать водителю PDF-схему.
        </p>
      }
    >
      <section data-section="tool_related" className="pb-8">
        <Container className="space-y-16">
          {HUB_GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className={cn(siteTitle, 'text-[1.8rem] leading-tight sm:text-[2.2rem]')}>{g.title}</h2>
              <p className="mt-2 text-[16px] text-site-muted">{g.text}</p>
              <ToolCards ids={g.ids} className="mt-6" />
            </div>
          ))}
        </Container>
      </section>
      <ToolCta
        title="Посчитали — загрузите в 3D"
        text="Loader3D: схема загрузки фуры и контейнера с физикой, весом и центром тяжести, автозагрузка и PDF для водителя."
      />
    </ToolShell>
  );
}

/** Every page id has content (checked by the type) and the hub lists every page. */
export const HUB_IDS: readonly ToolId[] = HUB_GROUPS.flatMap((g) => g.ids);
export const ALL_TOOL_IDS: readonly ToolId[] = TOOL_PAGES.map((p) => p.id);
