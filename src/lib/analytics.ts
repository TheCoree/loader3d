import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { TOOL_PATHS } from './toolPages';

/**
 * Visit statistics of the public pages for the admin panel (backend/app/analytics.py).
 *
 * Only visitors who are not signed in, only on PUBLIC_PATHS. A visit is one page load (an id in memory;
 * a new one after HIDDEN_NEW_VISIT in the background). Reported: the pages opened, active time (the tab
 * is visible and the visitor moved, scrolled or typed within IDLE_AFTER), time in the sections of the
 * landing page (`data-section="…"`), clicks on `data-track="…"` and a registration. Nothing is stored in
 * the browser — no cookies, no local storage.
 *
 * Nothing here touches window or document at module level or while rendering: the landing page is
 * prerendered on the server (scripts/prerender.mjs).
 */
export const PUBLIC_PATHS = ['/', '/pricing', '/demo', '/terms', '/privacy', '/login', '/register', '/reset-password', ...TOOL_PATHS];

const ENDPOINT = '/api/analytics/collect';
const FLUSH_EVERY = 15_000;
const TICK = 1_000;
const IDLE_AFTER = 60_000;
const HIDDEN_NEW_VISIT = 30 * 60_000;

type EventKind = 'page' | 'section' | 'click' | 'signup';
interface TrackedEvent {
  kind: EventKind;
  name: string;
  ms?: number;
}

const state = {
  started: false,
  on: false,
  visitId: '',
  context: { referrer: null as string | null, landing: '/', screen: 0, lang: '' },
  engaged: 0,
  sentEngaged: 0,
  queue: [] as TrackedEvent[],
  sections: new Map<string, number>(),
  visibleSections: new Set<string>(),
  lastActive: 0,
  lastTick: 0,
  hiddenAt: 0,
};

function newVisit(referrer: string | null): void {
  state.visitId = crypto.randomUUID();
  state.context = {
    referrer,
    landing: window.location.pathname + window.location.search,
    screen: window.screen?.width ?? 0,
    lang: navigator.language ?? '',
  };
  state.engaged = 0;
  state.sentEngaged = 0;
  state.queue = [];
  state.sections.clear();
}

function tick(): void {
  const now = Date.now();
  const delta = Math.min(now - state.lastTick, 5 * TICK);
  state.lastTick = now;
  if (!state.on || document.visibilityState !== 'visible' || now - state.lastActive > IDLE_AFTER) return;
  state.engaged += delta;
  for (const section of state.visibleSections) state.sections.set(section, (state.sections.get(section) ?? 0) + delta);
}

function flush(useBeacon = false): void {
  if (!state.visitId) return;
  const events = [...state.queue];
  for (const [name, ms] of state.sections) if (ms >= 500) events.push({ kind: 'section', name, ms: Math.round(ms) });
  if (events.length === 0 && state.engaged - state.sentEngaged < TICK) return;
  const body = JSON.stringify({
    visitId: state.visitId,
    engagedMs: Math.round(state.engaged),
    context: state.context,
    events: events.slice(0, 100),
  });
  state.queue = [];
  for (const [name, ms] of state.sections) if (ms >= 500) state.sections.delete(name);
  state.sentEngaged = state.engaged;
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(
        () => {},
      );
    }
  } catch {
    // Statistics must never break the page.
  }
}

function start(): void {
  if (state.started) return;
  state.started = true;
  const external = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
  newVisit(external);
  state.lastActive = state.lastTick = Date.now();
  const active = () => (state.lastActive = Date.now());
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart']) {
    window.addEventListener(type, active, { passive: true, capture: true });
  }
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-track]') : null;
      const name = target?.getAttribute('data-track');
      if (state.on && name) state.queue.push({ kind: 'click', name });
    },
    true,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      state.hiddenAt = Date.now();
      flush(true);
    } else if (state.hiddenAt && Date.now() - state.hiddenAt > HIDDEN_NEW_VISIT) {
      newVisit(null);
      if (state.on) state.queue.push({ kind: 'page', name: window.location.pathname });
    }
    active();
  });
  window.addEventListener('pagehide', () => flush(true));
  window.setInterval(tick, TICK);
  window.setInterval(() => state.on && flush(), FLUSH_EVERY);
}

/** Counted from now on (a signed-out visitor on a public page) or not (signed in, inside the app). */
function setTracking(on: boolean, path: string): void {
  start();
  if (on) state.queue.push({ kind: 'page', name: path });
  if (state.on && !on) flush();
  state.on = on;
  state.lastActive = Date.now();
}

/**
 * For the presence reports (lib/presence.ts): the visit of this page load (also when it is not counted — the
 * server takes the visit an administrator signs in from out of the statistics), the section of the landing
 * page on screen and how long ago the visitor last moved.
 */
export function analyticsSnapshot(): { visitId: string | null; section: string | null; idleSeconds: number } {
  const sections = [...state.visibleSections];
  return {
    visitId: state.visitId || null,
    section: sections.at(-1) ?? null,
    idleSeconds: state.lastActive ? Math.max(0, Math.round((Date.now() - state.lastActive) / 1000)) : 0,
  };
}

/** A marked action that is not a click on a `data-track` element (a lead sent, for one). */
export function trackAction(name: string): void {
  if (state.on) state.queue.push({ kind: 'click', name });
}

/** A registration in this visit (called by the auth store before the visitor becomes signed in). */
export function trackSignup(tier: string): void {
  if (!state.on) return;
  state.queue.push({ kind: 'signup', name: tier });
  flush();
}

/** In the Shell: follows the route and the sign-in state (useAuth `status`). */
export function usePageTracking(status: 'loading' | 'authenticated' | 'anonymous'): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (status === 'loading') return;
    setTracking(status === 'anonymous' && PUBLIC_PATHS.includes(pathname), pathname);
  }, [pathname, status]);
}

/** On the landing page: time in each `[data-section]` element while at least a third of it is on screen. */
export function useSectionTracking(): void {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const name = (entry.target as HTMLElement).dataset.section;
          if (!name) continue;
          if (entry.isIntersecting) state.visibleSections.add(name);
          else state.visibleSections.delete(name);
        }
      },
      { threshold: [0, 0.33, 0.66, 1], rootMargin: '-15% 0px -15% 0px' },
    );
    const sections = document.querySelectorAll<HTMLElement>('[data-section]');
    sections.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      state.visibleSections.clear();
    };
  }, []);
}

/**
 * The sections of the landing page (`data-section`), in page order, as the admin panel names them; then the
 * sections of the calculator pages (pages/tools, the same on every one of them).
 */
export const SECTION_NAMES: Record<string, string> = {
  hero: 'Первый экран',
  demo: 'Скриншот редактора и вход в демо',
  showcase: 'Главное и шаблоны машин',
  features: 'Возможности',
  workflow: 'Как это работает',
  integration: 'Интеграция с 1С',
  pricing: 'Тарифы',
  faq: 'Вопросы',
  tools: 'Бесплатные калькуляторы',
  cta: 'Финальный призыв',
  tool_calc: 'Калькулятор: расчёт',
  tool_guide: 'Калькулятор: объяснение',
  tool_faq: 'Калькулятор: вопросы',
  tool_related: 'Калькулятор: другие калькуляторы',
  tool_cta: 'Калькулятор: финальный призыв',
};

/** Marked buttons (`data-track`) as the admin panel names them. */
export const TRACK_NAMES: Record<string, string> = {
  header_login: 'Шапка: «Войти»',
  header_register: 'Шапка: «Начать бесплатно»',
  hero_register: 'Первый экран: «Начать бесплатно»',
  hero_how: 'Первый экран: «Как это работает»',
  hero_demo: 'Первый экран: «Открыть демо»',
  showcase_demo: 'Скриншот редактора: «Открыть демо»',
  integration_lead: '1С: «Обсудить подключение»',
  pricing_free: 'Тарифы: «Старт»',
  pricing_pro: 'Тарифы: «Pro»',
  pricing_custom: 'Тарифы: «Индивидуальный»',
  cta_register: 'Финал: «Начать бесплатно»',
  cta_lead: 'Финал: «Оставить заявку»',
  tools_card: 'Главная: карточка калькулятора',
  tools_all: 'Главная: «Все калькуляторы»',
  tool_try3d: 'Калькулятор: «Попробовать в 3D»',
  tool_cta_register: 'Калькулятор: финальная кнопка регистрации',
  tool_theme: 'Шапка сайта: светлая / тёмная тема',
  lead_sent: 'Заявка отправлена',
  demo_back: 'Демо: назад на главную',
  demo_save: 'Демо: «Сохранить схему»',
  demo_toast_save: 'Демо: «Сохранить» после автозагрузки',
  demo_gate_time: 'Демо: окно регистрации через 5 минут',
  demo_gate_limits: 'Демо: окно регистрации — лимит машин или грузов',
  demo_gate_own: 'Демо: окно регистрации — свои грузы или машина',
  demo_gate_pdf: 'Демо: окно регистрации — PDF',
  demo_gate_save: 'Демо: окно регистрации — сохранение',
  demo_gate_file: 'Демо: окно регистрации — файлы JSON',
  demo_gate_register: 'Демо, окно: «Зарегистрироваться бесплатно»',
  demo_gate_login: 'Демо, окно: «Войти и сохранить схему»',
  demo_gate_continue: 'Демо, окно: «Продолжить демо»',
};
