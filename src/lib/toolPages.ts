/**
 * The public calculator pages (pages/tools): their addresses and what search engines see of them. Pure data —
 * read by the routes, the prerender (scripts/prerender.mjs: one HTML file per page, sitemap.xml), the visit
 * statistics (PUBLIC_PATHS) and the dark theme of the public pages. Nothing here touches window/document.
 *
 * A new page: an entry here, its content in pages/tools/index.tsx, a row in docs/seo.md.
 */

export type ToolId =
  | 'pallets-truck'
  | 'pallets-container'
  | 'ldm'
  | 'axle-loads'
  | 'pallets-gazelle'
  | 'truck-dimensions'
  | 'container-dimensions'
  | 'boxes-on-pallet'
  | 'cargo-volume'
  | 'loading-plan';

export interface ToolPageInfo {
  id: ToolId;
  path: string;
  /** <title>: the query first, the brand last; up to ~70 characters. */
  title: string;
  /** Meta description: what the page answers, up to ~160 characters. */
  description: string;
  h1: string;
  /** Short name: breadcrumbs, cards, the footer. */
  name: string;
  /** One line under the name on the cards. */
  blurb: string;
  /** Date of the last change of the content, for sitemap.xml. */
  updated: string;
}

export const TOOLS_HUB = {
  path: '/kalkulyator',
  title: 'Калькуляторы загрузки фуры и контейнера онлайн — Loader3D',
  description:
    'Бесплатные калькуляторы для логиста: сколько паллет в еврофуре, контейнере и газели, LDM, нагрузка на оси, объём груза, размеры кузовов.',
  h1: 'Калькуляторы загрузки',
  name: 'Калькуляторы',
  updated: '2026-11-23',
} as const;

export const TOOL_PAGES: readonly ToolPageInfo[] = [
  {
    id: 'pallets-truck',
    path: '/kalkulyator/pallety-v-evrofure',
    title: 'Сколько паллет в еврофуре: калькулятор европаллет и финпаллет',
    description:
      'Сколько европаллет и финпаллет помещается в еврофуру 13,6 м, мега и рефрижератор: раскладка вдоль и поперёк, два яруса и проверка по весу.',
    h1: 'Сколько паллет помещается в еврофуру',
    name: 'Паллеты в еврофуре',
    blurb: '33 или 34 европаллеты, 26 финпаллет — и почему так',
    updated: '2026-11-23',
  },
  {
    id: 'pallets-container',
    path: '/kalkulyator/pallety-v-konteynere',
    title: 'Сколько паллет в 20- и 40-футовом контейнере: калькулятор',
    description:
      'Сколько европаллет и финпаллет входит в контейнер 20 и 40 футов (и 40′ HC): схема раскладки «ёлочкой», ярусы, вес. Бесплатный расчёт онлайн.',
    h1: 'Сколько паллет помещается в контейнер 20 и 40 футов',
    name: 'Паллеты в контейнере',
    blurb: '11 европаллет в 20′, 25 в 40′ — раскладка «ёлочкой»',
    updated: '2026-11-23',
  },
  {
    id: 'ldm',
    path: '/kalkulyator/ldm',
    title: 'Калькулятор LDM: погрузочные метры онлайн',
    description:
      'Посчитайте погрузочные метры (LDM) груза: формула длина × ширина / 2,4, штабелирование, сколько это от фуры 13,6 м и оплачиваемый вес для сборного груза.',
    h1: 'Калькулятор LDM — погрузочных метров',
    name: 'Калькулятор LDM',
    blurb: 'Погрузочные метры и оплачиваемый вес сборного груза',
    updated: '2026-11-23',
  },
  {
    id: 'axle-loads',
    path: '/kalkulyator/nagruzka-na-osi',
    title: 'Нагрузка на оси тягача и полуприцепа: калькулятор и центр тяжести',
    description:
      'Как распределится вес груза по осям тягача и полуприцепа: центр тяжести, нагрузка на шкворень, переднюю, ведущую ось и тележку. Расчёт онлайн.',
    h1: 'Нагрузка на оси и центр тяжести груза',
    name: 'Нагрузка на оси',
    blurb: 'Центр тяжести, шкворень, ведущая ось и тележка полуприцепа',
    updated: '2026-11-23',
  },
  {
    id: 'pallets-gazelle',
    path: '/kalkulyator/pallety-v-gazeli',
    title: 'Сколько паллет в газель 3, 4 и 4,2 м: калькулятор',
    description:
      'Сколько европаллет помещается в газель с кузовом 3, 4 и 4,2 м: таблица по длине и ширине кузова, раскладка и проверка грузоподъёмности.',
    h1: 'Сколько паллет помещается в газель',
    name: 'Паллеты в газели',
    blurb: 'От 4 до 8 европаллет — решает ширина кузова',
    updated: '2026-11-23',
  },
  {
    id: 'truck-dimensions',
    path: '/kalkulyator/razmery-evrofury',
    title: 'Размеры и объём еврофуры, мега-трейлера и рефрижератора',
    description:
      'Внутренние размеры, объём в м³, грузоподъёмность и паллетоместа еврофуры 13,6 м, мега, рефа и сцепки. Калькулятор объёма кузова по своим размерам.',
    h1: 'Размеры и объём еврофуры',
    name: 'Размеры еврофуры',
    blurb: 'Тент, мега, реф и сцепка: м³, тонны, паллетоместа',
    updated: '2026-11-23',
  },
  {
    id: 'container-dimensions',
    path: '/kalkulyator/razmery-konteynerov',
    title: 'Размеры контейнеров 20 и 40 футов: объём, вес, паллеты',
    description:
      'Внутренние размеры, объём и грузоподъёмность контейнеров 20′, 40′ и 40′ HC, сколько в них паллет. Калькулятор объёма по своим размерам.',
    h1: 'Размеры и объём контейнеров 20 и 40 футов',
    name: 'Размеры контейнеров',
    blurb: '20′, 40′ и 40′ HC: внутренние размеры, м³, паллеты',
    updated: '2026-11-23',
  },
  {
    id: 'boxes-on-pallet',
    path: '/kalkulyator/korobki-na-pallete',
    title: 'Сколько коробок на паллете: калькулятор укладки онлайн',
    description:
      'Сколько коробок помещается на европаллету или финпаллету: раскладка слоя, число слоёв по высоте, вес и высота паллеты с грузом.',
    h1: 'Сколько коробок помещается на паллету',
    name: 'Коробки на паллете',
    blurb: 'Слой, число слоёв, высота и вес паллеты',
    updated: '2026-11-23',
  },
  {
    id: 'cargo-volume',
    path: '/kalkulyator/obem-gruza',
    title: 'Калькулятор объёма груза в м³: какая машина нужна',
    description:
      'Посчитайте объём груза в кубометрах по размерам мест и сколько он займёт в газели, грузовике, еврофуре или контейнере — по объёму и весу.',
    h1: 'Калькулятор объёма груза',
    name: 'Объём груза',
    blurb: 'Кубометры, вес и какая машина подойдёт',
    updated: '2026-11-23',
  },
  {
    id: 'loading-plan',
    path: '/kalkulyator/shema-zagruzki-fury',
    title: 'Схема загрузки фуры онлайн: план погрузки в 3D',
    description:
      'Как составить схему загрузки фуры: размещение паллет, вес и центр тяжести, порядок погрузки и PDF для водителя. Онлайн, в браузере, за несколько минут.',
    h1: 'Схема загрузки фуры онлайн',
    name: 'Схема загрузки фуры',
    blurb: 'План погрузки с весом, центром тяжести и PDF',
    updated: '2026-11-23',
  },
];

/** The <title> of a page: with the brand at the end while that keeps it within 70 characters. */
export function documentTitle(page: ToolPageInfo): string {
  const branded = `${page.title} — Loader3D`;
  return branded.length <= 70 ? branded : page.title;
}

export function toolPage(id: ToolId): ToolPageInfo {
  return TOOL_PAGES.find((p) => p.id === id)!;
}

/** Every address of the calculators: the hub and the pages. */
export const TOOL_PATHS: readonly string[] = [TOOLS_HUB.path, ...TOOL_PAGES.map((p) => p.path)];

/** The strongest pages: on the landing page and first in the footer. */
export const FEATURED_TOOLS: readonly ToolId[] = ['pallets-truck', 'pallets-container', 'ldm', 'axle-loads'];
