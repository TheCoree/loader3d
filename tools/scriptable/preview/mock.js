/** Made-up answers of GET /api/widget/stats (backend/app/schemas/widget.py) for the preview and check.mjs. */

export const SITE = 'https://loader.example.com';
// Not a real key: the same shape as `python -m app widget-key` prints.
export const KEY = 'l3dw_preview0preview0preview0preview0previe';
export const KEYCHAIN = { 'loader3d.widget.url': SITE, 'loader3d.widget.key': KEY };
export const CACHE_PATH = '/Library/loader3d-widget-cache.json';

const SIGNUPS = [3, 1, 4, 2, 0, 5, 3, 2, 6, 1, 3, 4, 2, 5];
const REVENUE = [0, 990, 0, 1990, 990, 0, 0, 990, 2980, 0, 990, 9900, 1990, 990];
const VISITORS = [41, 38, 52, 47, 30, 28, 44, 50, 61, 57, 49, 40, 66, 58];
const REQUESTS = [12, 18, 9, 22, 30, 41, 35, 28, 19, 24, 33, 47, 52, 38, 29, 21, 26, 31, 44, 58, 63, 49, 37, 30, 28, 35, 42, 39, 45, 42];

function day(now, back) {
  const date = new Date(now.getTime() - back * 86400000);
  return date.toISOString().slice(0, 10);
}

export function mockStats({
  now = new Date(),
  status = 'ok',
  issues = [],
  paymentsEnabled = true,
  data = true,
  computedMinutesAgo = 0,
  scale = 1,
  dbMs = 1.4,
} = {}) {
  const revenue = paymentsEnabled ? REVENUE.map((v) => v * scale) : REVENUE.map(() => 0);
  const signups = SIGNUPS.map((v) => v * scale);
  const visitors = VISITORS.map((v) => v * scale);
  const days = SIGNUPS.map((_, i) => ({
    date: day(now, 13 - i),
    signups: signups[i],
    revenue: revenue[i],
    payments: revenue[i] ? Math.max(1, Math.round(revenue[i] / 990 / Math.max(1, scale / 10))) : 0,
    visitors: visitors[i],
  }));
  const sum = (list, field) => list.reduce((total, d) => total + d[field], 0);
  const period = (list) => ({
    signups: sum(list, 'signups'),
    revenue: sum(list, 'revenue'),
    payments: sum(list, 'payments'),
    visitors: sum(list, 'visitors'),
  });
  return {
    status,
    issues,
    generatedAt: now.toISOString(),
    dbOk: status !== 'down',
    paymentsEnabled,
    load: {
      requestsPerMinute: 42 * scale,
      requestsSeries: REQUESTS.map((v) => v * scale),
      p95Ms: issues.includes('slow_responses') ? 2600 : 118,
      errorsLastHour: issues.includes('server_errors') ? 3 : 0,
      dbMs: status === 'down' ? null : dbMs,
      cpu: issues.includes('high_cpu') ? 1.35 : 0.12,
      memory: 0.41,
      disk: issues.includes('low_disk') ? 0.94 : 0.61,
      uptimeSeconds: 3 * 86400 + 5 * 3600,
    },
    data: data
      ? {
          computedAt: new Date(now.getTime() - computedMinutesAgo * 60000).toISOString(),
          online: { users: 3 * scale, guests: 5 * scale },
          week: period(days.slice(-7)),
          previousWeek: period(days.slice(0, 7)),
          days,
          totals: { users: 312 * scale, newLeads: 2, pendingPayments: 1 },
        }
      : null,
  };
}

const json = (status, body) => ({ status, body: JSON.stringify(body) });
const offline = () => {
  throw new Error('The Internet connection appears to be offline.');
};

/** name → { title, stats?, http?, offline?, noInternet?, cache?, configured? } */
export const SCENARIOS = {
  ok: { title: 'Всё работает', stats: () => mockStats() },
  noPayments: { title: 'Оплата не подключена (как на проде сейчас)', stats: () => mockStats({ paymentsEnabled: false }) },
  busy: { title: 'Большие числа', stats: () => mockStats({ scale: 120 }) },
  degraded: {
    title: 'База медленная',
    stats: () => mockStats({ status: 'degraded', issues: ['db_slow'], dbMs: 820 }),
  },
  disk: { title: 'Мало места на диске', stats: () => mockStats({ status: 'degraded', issues: ['low_disk'] }) },
  dbDown: {
    title: 'База недоступна (API отвечает)',
    stats: () => mockStats({ status: 'down', issues: ['db_down'], computedMinutesAgo: 35 }),
  },
  dbNeverAnswered: {
    title: 'База не ответила ни разу',
    stats: () => mockStats({ status: 'down', issues: ['db_down'], data: false }),
  },
  offline: { title: 'Сайт не отвечает (данные из кеша)', offline: true, cache: true },
  offlineNoCache: { title: 'Сайт не отвечает, кеша нет', offline: true },
  noInternet: { title: 'Нет интернета на телефоне', offline: true, noInternet: true, cache: true },
  apiDown: { title: 'Caddy работает, API нет (502)', http: 502, cache: true },
  badKey: { title: 'Неверный ключ (401)', http: 401, cache: true },
  disabled: { title: 'Виджет выключен на сервере (404)', http: 404 },
  notConfigured: { title: 'Ключ ещё не введён', configured: false },
};

/** The fetch of the runtime for a scenario; `seen` collects the requests to the site. */
export function scenarioFetch(name, seen = []) {
  const scenario = SCENARIOS[name];
  return async (request) => {
    if (request.url.startsWith('https://www.apple.com/')) {
      if (scenario.noInternet) offline();
      return { status: 200, body: '<HTML><BODY>Success</BODY></HTML>' };
    }
    seen.push(request);
    if (scenario.offline) offline();
    if (scenario.http === 401) return json(401, { detail: { code: 'invalid_widget_key', message: 'Неверный ключ виджета' } });
    if (scenario.http === 404) return json(404, { detail: 'Not Found' });
    if (scenario.http) return { status: scenario.http, body: '' };
    return json(200, scenario.stats());
  };
}

/** Files of the runtime: the cache of a previous answer, two hours old. */
export function scenarioFiles(name) {
  if (!SCENARIOS[name].cache) return {};
  const savedAt = Date.now() - 2 * 3600 * 1000;
  return {
    [CACHE_PATH]: JSON.stringify({ site: SITE, savedAt, stats: mockStats({ now: new Date(savedAt) }) }),
  };
}

export function scenarioKeychain(name) {
  return SCENARIOS[name].configured === false ? {} : { ...KEYCHAIN };
}
