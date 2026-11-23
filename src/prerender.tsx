import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaticRouter } from 'react-router';
import { Shell } from './Shell';
import { TIERS, TIERS_ENABLED } from './lib/tiers';
import { TOOL_PAGES, TOOLS_HUB, documentTitle, type ToolPageInfo } from './lib/toolPages';
import { FAQ } from './pages/LandingPage';
import { toolFaq } from './pages/tools';

/** Loaded by scripts/prerender.mjs (through Vite's SSR loader) after `vite build`. */

/** A page as the browser renders it at `path` before the session is known (hydrated by main.tsx). */
export function renderPage(path: string): string {
  return renderToString(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <StaticRouter location={path}>
          <Shell />
        </StaticRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/** The landing page (kept for the old name). */
export function renderLanding(): string {
  return renderPage('/');
}

/** schema.org data for search engines: the product with its prices and the FAQ shown on the page. */
export function structuredData(siteUrl: string): object[] {
  const prices = TIERS.flatMap((t) => (t.price ? [t.price.monthly] : []));
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Loader3D',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'ru',
      ...(siteUrl ? { url: `${siteUrl}/`, image: `${siteUrl}/landing/og.jpg` } : {}),
      description:
        '3D-планировщик загрузки фуры и контейнера: раскладка паллет с физикой, LDM, вес и центр тяжести, автозагрузка и PDF-схема погрузки.',
      ...(TIERS_ENABLED && {
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'RUB',
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: TIERS.length,
        },
      }),
    },
    faqPage(FAQ),
  ];
}

function faqPage(items: ReadonlyArray<{ q: string; a: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function breadcrumbs(siteUrl: string, trail: Array<{ name: string; path: string }>): object | null {
  if (!siteUrl) return null; // the items need absolute URLs
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: `${siteUrl}${t.path}` })),
  };
}

function toolData(page: ToolPageInfo, siteUrl: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: page.h1,
      description: page.description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'ru',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'RUB' },
      ...(siteUrl ? { url: `${siteUrl}${page.path}` } : {}),
      publisher: { '@type': 'Organization', name: 'Loader3D', ...(siteUrl ? { url: `${siteUrl}/` } : {}) },
    },
    faqPage(toolFaq(page.id)),
    breadcrumbs(siteUrl, [
      { name: 'Loader3D', path: '/' },
      { name: TOOLS_HUB.name, path: TOOLS_HUB.path },
      { name: page.name, path: page.path },
    ]),
  ].filter((d): d is object => d !== null);
}

/** One prerendered HTML file: where it goes and what its <head> says. */
export interface PrerenderedPage {
  path: string;
  /** Under dist/: `index.html` for `/`, `kalkulyator/ldm.html` for `/kalkulyator/ldm` (deploy/Caddyfile tries `{path}.html`). */
  file: string;
  /** null: the <title> and description of index.html (the landing page). */
  title: string | null;
  description: string | null;
  structuredData: object[];
  /** Date of the last change for sitemap.xml (none: not given). */
  updated?: string;
  /** The browser's colour around the page (meta theme-color); none — the template's black. */
  themeColor?: string;
}

/** The calculators are rendered light (lib/theme.ts useToolTheme). */
const TOOL_THEME_COLOR = '#ffffff';

/** Every page scripts/prerender.mjs writes, the landing page first. */
export function prerenderedPages(siteUrl: string): PrerenderedPage[] {
  return [
    { path: '/', file: 'index.html', title: null, description: null, structuredData: structuredData(siteUrl) },
    {
      path: TOOLS_HUB.path,
      file: `${TOOLS_HUB.path.slice(1)}.html`,
      title: TOOLS_HUB.title,
      description: TOOLS_HUB.description,
      updated: TOOLS_HUB.updated,
      themeColor: TOOL_THEME_COLOR,
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: TOOLS_HUB.h1,
          description: TOOLS_HUB.description,
          inLanguage: 'ru',
          ...(siteUrl ? { url: `${siteUrl}${TOOLS_HUB.path}` } : {}),
          hasPart: TOOL_PAGES.map((p) => ({ '@type': 'WebPage', name: p.name, ...(siteUrl ? { url: `${siteUrl}${p.path}` } : {}) })),
        },
        breadcrumbs(siteUrl, [
          { name: 'Loader3D', path: '/' },
          { name: TOOLS_HUB.name, path: TOOLS_HUB.path },
        ]),
      ].filter((d): d is object => d !== null),
    },
    ...TOOL_PAGES.map((p) => ({
      path: p.path,
      file: `${p.path.slice(1)}.html`,
      title: documentTitle(p),
      description: p.description,
      updated: p.updated,
      themeColor: TOOL_THEME_COLOR,
      structuredData: toolData(p, siteUrl),
    })),
  ];
}
