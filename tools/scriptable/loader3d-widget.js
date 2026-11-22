// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: chart-bar;

/*
 * Loader3D — the owner's widget: whether the site works and how loaded it is, who is online, revenue and
 * signups of the week with a chart by day. Installation: tools/scriptable/README.md.
 *
 * Data: GET <site>/api/widget/stats with `Authorization: Bearer <key>` (backend/app/widget.py). The site
 * address and the key live in the iOS keychain (Keychain), never in this text; the last answer is cached
 * in the Library folder of Scriptable (not visible in Files) to be shown, marked with its time, while
 * the site does not answer.
 *
 * The widget's parameter picks what it shows (empty — the overview):
 *   overview | revenue | signups | online | load | status   (or in Russian: обзор, выручка, …)
 * Every view works in every size: small, medium, large, extra large (iPad) and on the lock screen
 * (circular, rectangular, inline).
 */

const KEYCHAIN_URL = 'loader3d.widget.url';
const KEYCHAIN_KEY = 'loader3d.widget.key';
const CACHE_FILE = 'loader3d-widget-cache.json';
const ENDPOINT = '/api/widget/stats';
const TIMEOUT_SECONDS = 12;
// iOS gives a widget a few dozen refreshes a day and decides itself when; asking more often only burns them.
const REFRESH_MINUTES = 15;
const REFRESH_PROBLEM_MINUTES = 5;
// Numbers older than this are marked «данные от …».
const STALE_MINUTES = 20;
const KEY_PATTERN = /^l3dw_[A-Za-z0-9_-]{30,}$/;
const PADDING = 14;
const LARGE_CHART = 34;

const VIEWS = {
  overview: 'overview', обзор: 'overview',
  revenue: 'revenue', выручка: 'revenue', деньги: 'revenue',
  signups: 'signups', регистрации: 'signups', пользователи: 'signups',
  online: 'online', онлайн: 'online',
  load: 'load', нагрузка: 'load', загрузка: 'load',
  status: 'status', статус: 'status',
};
const VIEW_NAMES = {
  overview: 'Обзор', revenue: 'Выручка', signups: 'Регистрации', online: 'Онлайн', load: 'Нагрузка', status: 'Статус',
};

// --- colours ---------------------------------------------------------------------------------------

const rgb = (hex, alpha = 1) => new Color(hex, alpha);
const dynamic = (light, dark) => Color.dynamic(light, dark);
const COLORS = {
  background: dynamic(rgb('#FFFFFF'), rgb('#1C1C1E')),
  label: dynamic(rgb('#000000'), rgb('#FFFFFF')),
  secondary: dynamic(rgb('#3C3C43', 0.6), rgb('#EBEBF5', 0.6)),
  tertiary: dynamic(rgb('#3C3C43', 0.3), rgb('#EBEBF5', 0.3)),
  accent: dynamic(rgb('#2F6FED'), rgb('#7AA5F7')),
  green: dynamic(rgb('#248A3D'), rgb('#30D158')),
  orange: dynamic(rgb('#C93400'), rgb('#FF9F0A')),
  red: dynamic(rgb('#D70015'), rgb('#FF453A')),
  gray: dynamic(rgb('#8E8E93'), rgb('#98989D')),
};
// Charts are pictures, drawn once for both appearances: colours that read on white and on black alike.
const CHART_COLOR = '#2F6FED';
const CHART_EMPTY = '#8E8E93';
// The lock screen tints everything itself: white, with opacity for what is secondary.
const LOCK = { label: Color.white(), secondary: rgb('#FFFFFF', 0.65), chart: '#FFFFFF' };

const ISSUES = {
  db_down: 'База данных недоступна',
  db_slow: 'База отвечает медленно',
  server_errors: 'Ошибки на сервере',
  slow_responses: 'Сайт отвечает медленно',
  high_cpu: 'Высокая нагрузка',
  high_memory: 'Мало памяти',
  low_disk: 'Мало места на диске',
};

// --- formatting ------------------------------------------------------------------------------------

const NBSP = '\u00A0';
const MINUS = '\u2212';

function digits(value) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function rub(value) {
  return `${digits(value)}${NBSP}₽`;
}

/** «12 990 ₽», «125 тыс ₽», «1,2 млн ₽». */
function rubShort(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace('.', ',')}${NBSP}млн${NBSP}₽`;
  if (value >= 1e5) return `${Math.round(value / 1e3)}${NBSP}тыс${NBSP}₽`;
  return rub(value);
}

/** For the lock screen circle: «12 990», «125к», «1,2м». */
function numberTiny(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace('.', ',')}м`;
  if (value >= 1e5) return `${Math.round(value / 1e3)}к`;
  return digits(value);
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «+25%» / «−10%» against the previous week; null when there is nothing to compare with. */
function change(current, previous) {
  if (!previous) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { text: '0%', up: null };
  return { text: `${percent > 0 ? '+' : MINUS}${Math.abs(percent)}%`, up: percent > 0 };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** «14:05», «вчера 14:05», «20.11 14:05». */
function timeText(date) {
  const now = new Date();
  const time = `${date.getHours()}:${pad2(date.getMinutes())}`;
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86400000);
  if (days === 0) return time;
  if (days === 1) return `вчера ${time}`;
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${time}`;
}

function uptimeText(seconds) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}${NBSP}мин`;
  if (seconds < 86400 * 2) return `${Math.round(seconds / 3600)}${NBSP}ч`;
  return `${Math.round(seconds / 86400)}${NBSP}д`;
}

const percent = (share) => (share == null ? '—' : `${Math.round(share * 100)}%`);
const ms = (value) => (value == null ? '—' : `${value < 10 ? value.toFixed(1).replace('.', ',') : Math.round(value)}${NBSP}мс`);

// --- settings: the keychain ------------------------------------------------------------------------

function readSettings() {
  if (!Keychain.contains(KEYCHAIN_URL) || !Keychain.contains(KEYCHAIN_KEY)) return null;
  return { url: Keychain.get(KEYCHAIN_URL), key: Keychain.get(KEYCHAIN_KEY) };
}

function isLocalHost(host) {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local(:\d+)?$/i.test(host);
}

/** «loader.example.com» → «https://loader.example.com». Only the origin: no path, no login in the URL. */
function normalizeUrl(input) {
  let value = (input || '').trim().replace(/\/+$/, '');
  if (!/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;
  const match = value.match(/^(https?):\/\/([a-z0-9.-]+(:\d{1,5})?)$/i);
  if (!match) throw new Error('Нужен адрес сайта без пути, например https://loader.example.com');
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  // The key must not travel in the clear; plain http only to a computer on the local network.
  if (scheme === 'http' && !isLocalHost(host)) throw new Error('Нужен https://: по http ключ виден в сети');
  return `${scheme}://${host}`;
}

// --- the cache: the last answer, shown while the site does not answer ------------------------------

const files = FileManager.local();
const cachePath = files.joinPath(files.libraryDirectory(), CACHE_FILE);

function readCache(site) {
  try {
    if (!files.fileExists(cachePath)) return null;
    const cache = JSON.parse(files.readString(cachePath));
    return cache && cache.site === site && cache.stats ? cache : null;
  } catch (error) {
    return null;
  }
}

function writeCache(site, stats) {
  try {
    files.writeString(cachePath, JSON.stringify({ site, savedAt: Date.now(), stats }));
  } catch (error) {
    // A full disk must not break the widget.
  }
}

// --- the request -----------------------------------------------------------------------------------

async function fetchStats({ url, key }) {
  const request = new Request(url + ENDPOINT);
  request.method = 'GET';
  request.timeoutInterval = TIMEOUT_SECONDS;
  request.headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  // The key goes only to the address typed in: a redirect (to another host) would carry it along.
  request.onRedirect = () => null;
  let body;
  try {
    body = await request.loadString();
  } catch (error) {
    return { error: 'offline' };
  }
  const status = (request.response && request.response.statusCode) || 0;
  if (status === 200) {
    try {
      const stats = JSON.parse(body);
      if (stats && typeof stats.status === 'string' && stats.load) return { stats };
    } catch (error) {
      // Not JSON: some other site at this address.
    }
    return { error: 'bad_response', status };
  }
  if (status === 401) return { error: 'bad_key', status };
  if (status === 404) return { error: 'disabled', status };
  if (status === 429) return { error: 'rate_limited', status };
  if (status >= 300 && status < 400) return { error: 'redirect', status };
  if (status === 502 || status === 503 || status === 504) return { error: 'api_down', status };
  return { error: 'http', status };
}

/** Whether the phone is online at all: otherwise «сайт не отвечает» would be a false alarm. */
async function internetWorks() {
  try {
    const probe = new Request('https://www.apple.com/library/test/success.html');
    probe.timeoutInterval = 6;
    await probe.loadString();
    return probe.response && probe.response.statusCode === 200;
  } catch (error) {
    return false;
  }
}

async function loadState(settings) {
  const result = await fetchStats(settings);
  if (result.stats) {
    writeCache(settings.url, result.stats);
    return { stats: result.stats, fetchedAt: new Date(), error: null };
  }
  let error = result.error;
  if (error === 'offline' && !(await internetWorks())) error = 'no_internet';
  const cache = readCache(settings.url);
  return {
    stats: cache ? cache.stats : null,
    fetchedAt: cache ? new Date(cache.savedAt) : null,
    error,
    status: result.status,
  };
}

function describeError(result) {
  switch (result.error) {
    case 'offline':
      return 'Сайт не отвечает. Проверьте адрес и что сервер запущен.';
    case 'no_internet':
      return 'Нет подключения к интернету.';
    case 'bad_key':
      return 'Сервер не принял ключ.';
    case 'disabled':
      return 'Эндпоинт виджета выключен: на сервере не задан WIDGET_KEY_SHA256 — или адрес не того сайта.';
    case 'rate_limited':
      return 'Слишком много запросов. Попробуйте через несколько минут.';
    case 'redirect':
      return 'Адрес перенаправляет на другой. Укажите точный https-адрес сайта.';
    case 'api_down':
      return `Сайт открывается, но API не отвечает (HTTP ${result.status}).`;
    default:
      return `Неожиданный ответ сервера (HTTP ${result.status || '—'}).`;
  }
}

// --- what the state means --------------------------------------------------------------------------

/** The headline: «Работает», «Сайт не отвечает»… with its symbol and colour. */
function health(state) {
  const problem = (title, symbol, color, detail = null) => ({ ok: false, title, symbol, color, detail });
  switch (state.error) {
    case 'no_internet':
      return problem('Нет интернета', 'wifi.slash', COLORS.gray, 'Сайт не проверен');
    case 'offline':
      return problem('Сайт не отвечает', 'xmark.octagon.fill', COLORS.red);
    case 'api_down':
      return problem('Сайт не отвечает', 'xmark.octagon.fill', COLORS.red, `API: ошибка ${state.status}`);
    case 'bad_key':
      return problem('Неверный ключ', 'key.fill', COLORS.orange, 'Откройте скрипт в Scriptable');
    case 'disabled':
      return problem('Виджет выключен', 'key.fill', COLORS.orange, 'Нет WIDGET_KEY_SHA256 на сервере');
    case 'redirect':
      return problem('Адрес перенаправляет', 'arrow.uturn.right', COLORS.orange, 'Укажите https-адрес');
    case 'bad_response':
    case 'http':
      return problem('Ошибка сайта', 'xmark.octagon.fill', COLORS.red, `HTTP ${state.status}`);
    default:
      break;
  }
  const stats = state.stats;
  if (!stats) return problem('Нет данных', 'questionmark.circle', COLORS.gray);
  if (stats.status === 'down') return problem('База недоступна', 'xmark.octagon.fill', COLORS.red, 'API отвечает');
  if (stats.status === 'degraded') {
    const issue = stats.issues[0];
    const detail = {
      db_slow: `БД ${ms(stats.load.dbMs)}`,
      server_errors: `${stats.load.errorsLastHour} за час`,
      slow_responses: `p95 ${ms(stats.load.p95Ms)}`,
      high_cpu: `CPU ${percent(stats.load.cpu)}`,
      high_memory: `память ${percent(stats.load.memory)}`,
      low_disk: `диск ${percent(stats.load.disk)}`,
    }[issue];
    return problem(ISSUES[issue] || 'Есть проблемы', 'exclamationmark.triangle.fill', COLORS.orange, detail);
  }
  return { ok: true, title: 'Работает', symbol: 'checkmark.circle.fill', color: COLORS.green, detail: null };
}

/** «обновлено 14:05» or, for old numbers, «данные от 13:20». */
function freshness(state) {
  const data = state.stats && state.stats.data;
  if (!data || !state.fetchedAt) return { text: 'нет данных', stale: true };
  const asOf = state.error ? state.fetchedAt : new Date(data.computedAt);
  const stale = state.error || Date.now() - asOf.getTime() > STALE_MINUTES * 60000;
  return { text: `${stale ? 'данные от' : 'обновлено'} ${timeText(asOf)}`, stale: Boolean(stale) };
}

function numbers(state) {
  const data = state.stats && state.stats.data;
  const load = state.stats && state.stats.load;
  return {
    has: Boolean(data),
    online: data ? data.online : { users: null, guests: null },
    week: data ? data.week : { signups: null, revenue: null, payments: null, visitors: null },
    previous: data ? data.previousWeek : null,
    days: data ? data.days : [],
    totals: data ? data.totals : null,
    load,
    paymentsEnabled: Boolean(state.stats && state.stats.paymentsEnabled),
  };
}

const show = (value, format = digits) => (value == null ? '—' : format(value));

// --- sizes -----------------------------------------------------------------------------------------

/** Points of the widget on this device: [small, medium width, large height]; see Apple's HIG. */
function homeSizes() {
  const screen = Device.screenSize();
  const width = Math.min(screen.width, screen.height);
  const height = Math.max(screen.width, screen.height);
  if (Device.isPad()) return [155, 342, 342];
  const known = {
    '430x932': [170, 364, 382], '440x956': [170, 364, 382], '428x926': [170, 364, 382],
    '414x896': [169, 360, 379], '414x736': [159, 348, 357], '402x874': [162, 348, 365],
    '393x852': [158, 338, 354], '390x844': [158, 338, 354], '375x812': [155, 329, 345],
    '375x667': [148, 321, 324], '320x568': [141, 292, 311],
  }[`${width}x${height}`];
  if (known) return known;
  const scale = width / 393;
  return [Math.round(158 * scale), Math.round(338 * scale), Math.round(354 * scale)];
}

function contentSize(family) {
  const [small, medium, large] = homeSizes();
  const inner = (w, h) => ({ width: w - 2 * PADDING, height: h - 2 * PADDING });
  switch (family) {
    case 'small':
      return inner(small, small);
    case 'medium':
      return inner(medium, small);
    case 'large':
      return inner(medium, large);
    case 'extraLarge':
      return inner(medium * 2 + (Device.isPad() ? 20 : 16), large);
    case 'accessoryRectangular':
      return { width: small >= 169 ? 172 : 160, height: small >= 169 ? 76 : 72 };
    default:
      return { width: 72, height: 72 };
  }
}

// --- drawing ---------------------------------------------------------------------------------------

function canvas(width, height) {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;
  return context;
}

/** Bars by day, the last one (today) brighter; a day without anything is a small grey dash. */
function barChart(values, width, height, color = CHART_COLOR) {
  const context = canvas(width, height);
  const count = Math.max(1, values.length);
  const gap = count > 10 ? 3 : 5;
  const bar = (width - gap * (count - 1)) / count;
  const max = Math.max(1, ...values);
  values.forEach((value, i) => {
    const h = value > 0 ? Math.max(3, (value / max) * height) : 2;
    const radius = Math.min(3, bar / 2, h / 2);
    const path = new Path();
    path.addRoundedRect(new Rect(i * (bar + gap), height - h, bar, h), radius, radius);
    context.addPath(path);
    context.setFillColor(value > 0 ? new Color(color, i === count - 1 ? 1 : 0.55) : new Color(CHART_EMPTY, 0.35));
    context.fillPath();
  });
  return context.getImage();
}

/** Requests per minute: a line with a soft area under it and a dot on «now». */
function sparkline(values, width, height, color = CHART_COLOR, area = true) {
  const context = canvas(width, height);
  const max = Math.max(1, ...values);
  const inset = 3;
  const count = Math.max(2, values.length);
  const points = values.map(
    (value, i) =>
      new Point(inset + (i / (count - 1)) * (width - 2 * inset), height - inset - (value / max) * (height - 2 * inset)),
  );
  if (points.length < 2) return context.getImage();
  if (area) {
    const fill = new Path();
    fill.move(new Point(points[0].x, height));
    points.forEach((point) => fill.addLine(point));
    fill.addLine(new Point(points[points.length - 1].x, height));
    fill.closeSubpath();
    context.addPath(fill);
    context.setFillColor(new Color(color, 0.18));
    context.fillPath();
  }
  const line = new Path();
  line.move(points[0]);
  points.slice(1).forEach((point) => line.addLine(point));
  context.addPath(line);
  context.setStrokeColor(new Color(color, 1));
  context.setLineWidth(2);
  context.strokePath();
  const last = points[points.length - 1];
  context.setFillColor(new Color(color, 1));
  context.fillEllipse(new Rect(last.x - 2.5, last.y - 2.5, 5, 5));
  return context.getImage();
}

/** A ring gauge for the lock screen circle: `share` 0…1 of it is white. */
function ring(share, size, lineWidth = 5) {
  const context = canvas(size, size);
  const radius = (size - lineWidth) / 2;
  const center = size / 2;
  context.setLineWidth(lineWidth);
  context.setStrokeColor(new Color('#FFFFFF', 0.25));
  context.strokeEllipse(new Rect(lineWidth / 2, lineWidth / 2, size - lineWidth, size - lineWidth));
  const value = Math.max(0, Math.min(1, share || 0));
  if (value > 0) {
    const path = new Path();
    const steps = Math.max(2, Math.ceil(90 * value));
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * value * (i / steps);
      const point = new Point(center + radius * Math.cos(angle), center + radius * Math.sin(angle));
      if (i === 0) path.move(point);
      else path.addLine(point);
    }
    context.addPath(path);
    context.setStrokeColor(Color.white());
    context.strokePath();
  }
  return context.getImage();
}

// --- building blocks -------------------------------------------------------------------------------

function text(stack, value, font, color, { scale = 0.6, lines = 1 } = {}) {
  const item = stack.addText(String(value));
  item.font = font;
  item.textColor = color;
  item.lineLimit = lines;
  item.minimumScaleFactor = scale;
  return item;
}

function row(parent, spacing = 0) {
  const stack = parent.addStack();
  stack.layoutHorizontally();
  stack.centerAlignContent();
  stack.spacing = spacing;
  return stack;
}

function column(parent, spacing = 0) {
  const stack = parent.addStack();
  stack.layoutVertically();
  stack.spacing = spacing;
  return stack;
}

/** A line of text that stays on the left. */
function line(parent, value, font, color, options) {
  const stack = row(parent);
  const item = text(stack, value, font, color, options);
  stack.addSpacer();
  return item;
}

function symbol(stack, name, size, color) {
  const sf = SFSymbol.named(name);
  if (!sf) return null;
  sf.applyFont(Font.semiboldSystemFont(size));
  const image = stack.addImage(sf.image);
  image.imageSize = new Size(size * 1.15, size * 1.15);
  image.tintColor = color;
  return image;
}

function image(stack, picture, width, height) {
  const item = stack.addImage(picture);
  item.imageSize = new Size(width, height);
  return item;
}

const FONT = {
  caption: Font.semiboldSystemFont(12),
  small: Font.mediumSystemFont(11),
  tiny: Font.mediumSystemFont(10),
  status: Font.semiboldSystemFont(15),
  big: (size) => Font.boldRoundedSystemFont(size),
  value: (size) => Font.semiboldRoundedSystemFont(size),
};

/** «■ Loader3D ··· ● Работает»: the brand on the left, the status on the right. */
function header(widget, state, h, { statusText = true, title = 'Loader3D' } = {}) {
  const stack = row(widget, 4);
  symbol(stack, 'shippingbox.fill', 11, COLORS.accent);
  text(stack, title, FONT.caption, COLORS.secondary);
  stack.addSpacer();
  symbol(stack, h.ok ? 'circle.fill' : h.symbol, h.ok ? 7 : 11, h.color);
  if (statusText) text(stack, h.title, FONT.caption, h.color, { scale: 0.7 });
  return stack;
}

function footer(widget, state, extra = null) {
  const stack = row(widget, 4);
  const fresh = freshness(state);
  if (extra) {
    text(stack, extra, FONT.tiny, COLORS.tertiary, { scale: 0.7 });
    stack.addSpacer();
  }
  text(stack, fresh.text, FONT.tiny, fresh.stale ? COLORS.orange : COLORS.tertiary, { scale: 0.7 });
  if (!extra) stack.addSpacer();
}

/** Caption, big number and a line under it: one metric. */
function metric(parent, caption, value, sub, { size = 22, subColor = COLORS.secondary } = {}) {
  const stack = column(parent, 1);
  line(stack, caption, FONT.small, COLORS.secondary);
  line(stack, value, FONT.big(size), COLORS.label, { scale: 0.5 });
  if (sub) line(stack, sub.text ?? sub, FONT.small, sub.color ?? subColor, { scale: 0.7 });
  return stack;
}

function changeLine(current, previous, suffix = '') {
  const delta = change(current || 0, previous || 0);
  if (!delta) return null;
  return {
    text: `${delta.text}${suffix}`,
    color: delta.up === null ? COLORS.secondary : delta.up ? COLORS.green : COLORS.red,
  };
}

const series = (days, field) => days.map((day) => day[field] || 0);

function revenueSub(n) {
  if (!n.has) return null;
  if (!n.paymentsEnabled && !n.week.revenue) return { text: 'оплата не подключена', color: COLORS.tertiary };
  return changeLine(n.week.revenue, n.previous && n.previous.revenue) || {
    text: `${n.week.payments} ${plural(n.week.payments, 'платёж', 'платежа', 'платежей')}`,
    color: COLORS.secondary,
  };
}

function onlineSub(n) {
  if (n.online.guests == null) return null;
  return `${n.online.guests} ${plural(n.online.guests, 'гость', 'гостя', 'гостей')}`;
}

/** The chart of a medium/large widget: revenue if there is any (or payment is on), otherwise signups. */
function mainSeries(n) {
  const revenue = series(n.days, 'revenue');
  if (n.paymentsEnabled || revenue.some(Boolean)) return { values: revenue, title: 'Выручка по дням' };
  return { values: series(n.days, 'signups'), title: 'Регистрации по дням' };
}

// --- home screen -----------------------------------------------------------------------------------

function smallWidget(widget, state, view, size) {
  const h = health(state);
  const n = numbers(state);
  if (view === 'status') {
    const top = row(widget);
    symbol(top, h.symbol, 30, h.color);
    top.addSpacer();
    widget.addSpacer();
    line(widget, h.title, FONT.status, h.color, { lines: 2, scale: 0.7 });
    widget.addSpacer(2);
    // Old numbers of a site that does not answer would only mislead here.
    const details = h.detail || (n.load && !state.error ? `БД ${ms(n.load.dbMs)} · ${n.load.requestsPerMinute} запр/мин` : '');
    if (details) line(widget, details, FONT.small, COLORS.secondary, { lines: 2, scale: 0.7 });
    if (state.stats && !state.error) {
      line(widget, `API работает ${uptimeText(state.stats.load.uptimeSeconds)}`, FONT.small, COLORS.secondary);
    }
    widget.addSpacer();
    footer(widget, state);
    return;
  }

  header(widget, state, h, { statusText: false, title: view === 'overview' ? 'Loader3D' : VIEW_NAMES[view] });
  widget.addSpacer(3);
  if (view === 'overview' || !h.ok) line(widget, h.title, FONT.status, h.color, { scale: 0.7 });
  widget.addSpacer();

  if (view === 'revenue' || view === 'signups') {
    const revenue = view === 'revenue';
    line(widget, 'за 7 дней', FONT.small, COLORS.secondary);
    line(widget, revenue ? show(n.week.revenue, rubShort) : show(n.week.signups), FONT.big(revenue ? 28 : 34), COLORS.label, {
      scale: 0.5,
    });
    const sub = revenue ? revenueSub(n) : changeLine(n.week.signups, n.previous && n.previous.signups, ' к прошлой');
    if (sub) line(widget, sub.text, FONT.small, sub.color, { scale: 0.7 });
    widget.addSpacer(6);
    if (n.has) image(widget, barChart(series(n.days.slice(-7), revenue ? 'revenue' : 'signups'), size.width, 26), size.width, 26);
    return;
  }

  if (view === 'load') {
    const load = n.load;
    const top = row(widget, 3);
    text(top, show(load && load.requestsPerMinute), FONT.big(32), COLORS.label, { scale: 0.5 });
    text(top, 'запр/мин', FONT.small, COLORS.secondary);
    top.addSpacer();
    widget.addSpacer(4);
    if (load) image(widget, sparkline(load.requestsSeries, size.width, 28), size.width, 28);
    widget.addSpacer(6);
    line(widget, `БД ${ms(load && load.dbMs)} · p95 ${ms(load && load.p95Ms)}`, FONT.small, COLORS.secondary, { scale: 0.7 });
    line(widget, `CPU ${percent(load && load.cpu)} · диск ${percent(load && load.disk)}`, FONT.small, COLORS.secondary, {
      scale: 0.7,
    });
    return;
  }

  if (view === 'online') {
    line(widget, show(n.online.users), FONT.big(44), COLORS.label, { scale: 0.5 });
    line(widget, plural(n.online.users || 0, 'пользователь', 'пользователя', 'пользователей'), FONT.small, COLORS.secondary);
    const guests = onlineSub(n);
    if (guests) line(widget, `${guests} на сайте`, FONT.small, COLORS.secondary);
    widget.addSpacer();
    footer(widget, state);
    return;
  }

  // The overview.
  const people = row(widget, 4);
  people.bottomAlignContent();
  text(people, show(n.online.users), FONT.big(34), COLORS.label, { scale: 0.5 });
  const label = column(people);
  text(label, 'онлайн', FONT.small, COLORS.secondary);
  label.addSpacer(6);
  people.addSpacer();
  const guests = onlineSub(n);
  if (guests) line(widget, guests, FONT.small, COLORS.secondary);
  widget.addSpacer(6);
  line(widget, 'За 7 дней', FONT.tiny, COLORS.secondary);
  const week = row(widget, 3);
  text(week, show(n.week.revenue, rubShort), FONT.value(15), COLORS.label, { scale: 0.6 });
  week.addSpacer();
  symbol(week, 'person.badge.plus', 10, COLORS.secondary);
  text(week, show(n.week.signups), FONT.value(15), COLORS.label);
  widget.addSpacer(3);
  footer(widget, state);
}

function mediumWidget(widget, state, view, size) {
  const h = health(state);
  const n = numbers(state);
  header(widget, state, h);
  if (h.detail) line(widget, h.detail, FONT.tiny, COLORS.secondary);
  widget.addSpacer();

  if (view === 'revenue' || view === 'signups' || view === 'load') {
    const body = row(widget, 12);
    const left = column(body, 2);
    left.size = new Size(size.width * 0.38, 0);
    const chartWidth = size.width * 0.62 - 12;
    if (view === 'load') {
      const load = n.load;
      metric(left, 'Запросы/мин', show(load && load.requestsPerMinute), null, { size: 30 });
      line(left, `p95 ${ms(load && load.p95Ms)}`, FONT.small, COLORS.secondary);
      line(left, `БД ${ms(load && load.dbMs)}`, FONT.small, COLORS.secondary);
      const right = column(body, 4);
      if (load) image(right, sparkline(load.requestsSeries, chartWidth, 50), chartWidth, 50);
      const facts = row(right);
      text(facts, `CPU ${percent(load && load.cpu)} · память ${percent(load && load.memory)} · диск ${percent(load && load.disk)}`, FONT.tiny, COLORS.secondary, { scale: 0.6 });
      facts.addSpacer();
    } else {
      const revenue = view === 'revenue';
      metric(
        left,
        revenue ? 'Выручка · 7 дн' : 'Регистрации · 7 дн',
        revenue ? show(n.week.revenue, rubShort) : show(n.week.signups),
        revenue ? revenueSub(n) : changeLine(n.week.signups, n.previous && n.previous.signups, ' к прошлой'),
        { size: 28 },
      );
      const extra = revenue
        ? n.has && `${n.week.payments} ${plural(n.week.payments, 'платёж', 'платежа', 'платежей')}`
        : n.totals && `всего ${digits(n.totals.users)}`;
      if (extra) line(left, extra, FONT.small, COLORS.tertiary);
      const right = column(body, 3);
      if (n.has) image(right, barChart(series(n.days, revenue ? 'revenue' : 'signups'), chartWidth, 56), chartWidth, 56);
      const axis = row(right);
      text(axis, '14 дней', FONT.tiny, COLORS.tertiary);
      axis.addSpacer();
      text(axis, 'сегодня', FONT.tiny, COLORS.tertiary);
    }
    widget.addSpacer();
    footer(widget, state);
    return;
  }

  if (view === 'online' || view === 'status') {
    const body = row(widget, 12);
    metric(body, 'Онлайн', show(n.online.users), onlineSub(n), { size: 34 });
    const load = n.load;
    metric(body, 'Запросы', show(load && load.requestsPerMinute), 'в минуту', { size: 34 });
    metric(body, 'База', ms(load && load.dbMs), load ? `p95 ${ms(load.p95Ms)}` : null, { size: 22 });
    widget.addSpacer();
    footer(widget, state, state.stats && !state.error ? `API работает ${uptimeText(state.stats.load.uptimeSeconds)}` : null);
    return;
  }

  // The overview: three metrics and the chart of the last two weeks.
  const metrics = row(widget, 10);
  metric(metrics, 'Онлайн', show(n.online.users), onlineSub(n));
  metric(metrics, 'Выручка · 7 дн', show(n.week.revenue, rubShort), revenueSub(n));
  metric(
    metrics,
    'Регистрации',
    n.has ? `+${digits(n.week.signups)}` : '—',
    changeLine(n.week.signups, n.previous && n.previous.signups) || (n.has ? 'за 7 дней' : null),
  );
  widget.addSpacer(8);
  const chart = mainSeries(n);
  if (n.has) image(widget, barChart(chart.values, size.width, 30), size.width, 30);
  widget.addSpacer(3);
  footer(widget, state, n.has ? `${chart.title} · 14 дн` : null);
}

function largeWidget(widget, state, view, size) {
  const h = health(state);
  const n = numbers(state);
  const load = n.load;
  header(widget, state, h);
  if (h.detail) line(widget, h.detail, FONT.small, COLORS.secondary);
  widget.addSpacer(10);

  const top = row(widget, 10);
  metric(top, 'Онлайн', show(n.online.users), onlineSub(n), { size: 28 });
  metric(top, 'Запросы/мин', show(load && load.requestsPerMinute), load ? `p95 ${ms(load.p95Ms)}` : null, { size: 28 });
  if (load) {
    const spark = column(top);
    spark.addSpacer(14);
    image(spark, sparkline(load.requestsSeries, size.width * 0.3, 34), size.width * 0.3, 34);
  }

  const block = (title, value, sub, values, extra, chart = true) => {
    widget.addSpacer(12);
    const head = row(widget, 6);
    text(head, title, FONT.small, COLORS.secondary);
    head.addSpacer();
    if (sub) text(head, sub.text ?? sub, FONT.small, sub.color ?? COLORS.secondary);
    const value_ = row(widget, 6);
    text(value_, value, FONT.big(26), COLORS.label, { scale: 0.5 });
    value_.addSpacer();
    if (extra) text(value_, extra, FONT.small, COLORS.tertiary);
    widget.addSpacer(4);
    // 326 pt of a large widget: header 14, metrics 64, two blocks of 60 + chart, the two lines at the bottom 27,
    // and a line of detail when something is wrong.
    if (n.has && chart) image(widget, barChart(values, size.width, LARGE_CHART), size.width, LARGE_CHART);
  };
  // Without online payment and without any revenue, a chart of zeros only takes the place of visitors.
  const noRevenue = !n.paymentsEnabled && !series(n.days, 'revenue').some(Boolean);
  const showRevenue = view !== 'signups';
  const showSignups = view !== 'revenue';
  if (showRevenue) {
    block(
      'Выручка · 7 дн',
      show(n.week.revenue, rub),
      revenueSub(n),
      series(n.days, 'revenue'),
      n.has && !noRevenue ? `${n.week.payments} ${plural(n.week.payments, 'платёж', 'платежа', 'платежей')}` : null,
      !noRevenue,
    );
  }
  if (showSignups) {
    block(
      'Регистрации · 7 дн',
      n.has ? `+${digits(n.week.signups)}` : '—',
      changeLine(n.week.signups, n.previous && n.previous.signups, ' к прошлой'),
      series(n.days, 'signups'),
      n.totals ? `всего ${digits(n.totals.users)}` : null,
    );
  }
  if ((showRevenue !== showSignups || noRevenue) && n.week.visitors != null) {
    block(
      'Посетители · 7 дн',
      digits(n.week.visitors),
      changeLine(n.week.visitors, n.previous && n.previous.visitors, ' к прошлой'),
      series(n.days, 'visitors'),
      null,
    );
  }

  widget.addSpacer();
  line(
    widget,
    `БД ${ms(load && load.dbMs)} · CPU ${percent(load && load.cpu)} · память ${percent(load && load.memory)} · диск ${percent(load && load.disk)}`,
    FONT.small,
    COLORS.secondary,
    { scale: 0.6 },
  );
  widget.addSpacer(2);
  const tasks = [];
  if (n.totals && n.totals.newLeads) tasks.push(`${n.totals.newLeads} ${plural(n.totals.newLeads, 'новая заявка', 'новые заявки', 'новых заявок')}`);
  if (n.totals && n.totals.pendingPayments) tasks.push(`ждут оплаты: ${n.totals.pendingPayments}`);
  if (load && load.errorsLastHour) tasks.push(`ошибок за час: ${load.errorsLastHour}`);
  footer(widget, state, tasks.join(' · ') || null);
}

// --- lock screen -----------------------------------------------------------------------------------

function circularWidget(widget, state, view) {
  const h = health(state);
  const n = numbers(state);
  widget.addAccessoryWidgetBackground = true;
  const center = (build) => {
    const stack = row(widget);
    stack.addSpacer();
    build(stack);
    stack.addSpacer();
  };
  if (!h.ok && (view === 'overview' || view === 'status' || view === 'online' || !state.stats)) {
    widget.addSpacer();
    center((s) => symbol(s, h.symbol, 22, LOCK.label));
    widget.addSpacer(2);
    center((s) => text(s, state.error ? 'сайт' : 'сбой', Font.semiboldSystemFont(11), LOCK.label));
    widget.addSpacer();
    return;
  }
  if (view === 'load') {
    const load = n.load;
    const share = load && load.cpu != null ? load.cpu : load ? load.requestsPerMinute / Math.max(1, ...load.requestsSeries) : 0;
    widget.backgroundImage = ring(share, 72, 5);
    widget.addSpacer();
    center((s) => text(s, show(load && load.requestsPerMinute, numberTiny), Font.boldRoundedSystemFont(20), LOCK.label));
    center((s) => text(s, 'в мин', Font.mediumSystemFont(9), LOCK.secondary));
    widget.addSpacer();
    return;
  }
  const content = {
    revenue: ['rublesign', show(n.week.revenue, numberTiny), '7 дн'],
    signups: ['person.badge.plus', n.has ? `+${numberTiny(n.week.signups)}` : '—', '7 дн'],
    status: [h.symbol, 'OK', 'сайт'],
  }[view] || ['person.2.fill', show(n.online.users), 'онлайн'];
  widget.addSpacer();
  center((s) => symbol(s, content[0], 11, LOCK.secondary));
  center((s) => text(s, content[1], Font.boldRoundedSystemFont(content[1].length > 4 ? 15 : 20), LOCK.label, { scale: 0.5 }));
  center((s) => text(s, content[2], Font.mediumSystemFont(9), LOCK.secondary));
  widget.addSpacer();
}

function rectangularWidget(widget, state, view, size) {
  const h = health(state);
  const n = numbers(state);
  const head = row(widget, 4);
  symbol(head, h.symbol, 11, LOCK.label);
  text(head, view === 'overview' || view === 'status' || !h.ok ? h.title : VIEW_NAMES[view], Font.semiboldSystemFont(13), LOCK.label, { scale: 0.7 });
  head.addSpacer();

  if (h.ok && (view === 'revenue' || view === 'signups' || view === 'load')) {
    const body = row(widget, 6);
    const left = column(body);
    const chartWidth = Math.round(size.width * 0.42);
    if (view === 'load') {
      const load = n.load;
      text(left, show(load && load.requestsPerMinute), Font.boldRoundedSystemFont(22), LOCK.label, { scale: 0.5 });
      text(left, 'запр/мин', Font.mediumSystemFont(11), LOCK.secondary);
      body.addSpacer();
      if (load) image(body, sparkline(load.requestsSeries, chartWidth, 34, LOCK.chart, false), chartWidth, 34);
    } else {
      const revenue = view === 'revenue';
      text(left, revenue ? show(n.week.revenue, rubShort) : n.has ? `+${digits(n.week.signups)}` : '—', Font.boldRoundedSystemFont(20), LOCK.label, {
        scale: 0.5,
      });
      text(left, 'за 7 дней', Font.mediumSystemFont(11), LOCK.secondary);
      body.addSpacer();
      if (n.has) image(body, barChart(series(n.days.slice(-7), revenue ? 'revenue' : 'signups'), chartWidth, 30, LOCK.chart), chartWidth, 30);
    }
    return;
  }

  const lines = [];
  if (h.detail) lines.push(h.detail);
  if (state.error && n.has) lines.push(freshness(state).text);
  if (view === 'status' && state.stats && !state.error) {
    lines.push(`БД ${ms(n.load.dbMs)} · ${n.load.requestsPerMinute} запр/мин`);
  }
  if (n.has) {
    const guests = n.online.guests == null ? '' : ` · ${onlineSub(n)}`;
    lines.push(`${n.online.users} онлайн${guests}`);
    lines.push(`${rubShort(n.week.revenue)} · +${digits(n.week.signups)} рег. за 7 дн`);
  }
  lines.slice(0, 2).forEach((value) => line(widget, value, Font.mediumSystemFont(12), LOCK.secondary, { scale: 0.7 }));
}

function inlineWidget(widget, state, view) {
  const h = health(state);
  const n = numbers(state);
  let value;
  if (!h.ok || view === 'status') value = h.ok ? 'Loader3D работает' : `Loader3D: ${h.title.toLowerCase()}`;
  else if (view === 'revenue') value = `${show(n.week.revenue, rubShort)} за 7 дн`;
  else if (view === 'signups') value = `+${show(n.week.signups)} ${plural(n.week.signups || 0, 'регистрация', 'регистрации', 'регистраций')} за 7 дн`;
  else if (view === 'load') value = `${show(n.load && n.load.requestsPerMinute)} запр/мин · CPU ${percent(n.load && n.load.cpu)}`;
  else value = `${show(n.online.users)} онлайн · ${show(n.week.revenue, rubShort)}`;
  const stack = row(widget, 4);
  symbol(stack, h.ok ? 'shippingbox.fill' : h.symbol, 12, LOCK.label);
  text(stack, value, Font.mediumSystemFont(13), LOCK.label);
}

// --- the widget ------------------------------------------------------------------------------------

function buildWidget(family, state, view, settings) {
  const widget = new ListWidget();
  const lockScreen = family.startsWith('accessory');
  if (!lockScreen) {
    widget.backgroundColor = COLORS.background;
    widget.setPadding(PADDING, PADDING, PADDING, PADDING);
  }
  // A tap opens the admin panel.
  if (settings) widget.url = `${settings.url}/admin`;
  const problem = !health(state).ok;
  widget.refreshAfterDate = new Date(Date.now() + (problem ? REFRESH_PROBLEM_MINUTES : REFRESH_MINUTES) * 60000);

  const size = contentSize(family);
  if (family === 'small') smallWidget(widget, state, view, size);
  else if (family === 'medium') mediumWidget(widget, state, view, size);
  else if (family === 'large' || family === 'extraLarge') largeWidget(widget, state, view, size);
  else if (family === 'accessoryCircular') circularWidget(widget, state, view);
  else if (family === 'accessoryRectangular') rectangularWidget(widget, state, view, size);
  else inlineWidget(widget, state, view);
  return widget;
}

/** Shown in a widget before the address and the key are entered in the app. */
function setupWidget(family) {
  const widget = new ListWidget();
  if (family === 'accessoryCircular') {
    widget.addAccessoryWidgetBackground = true;
    const stack = row(widget);
    stack.addSpacer();
    symbol(stack, 'key.fill', 22, LOCK.label);
    stack.addSpacer();
    return widget;
  }
  if (family.startsWith('accessory')) {
    const stack = row(widget, 4);
    symbol(stack, 'key.fill', 12, LOCK.label);
    text(stack, 'Loader3D: откройте Scriptable', Font.mediumSystemFont(12), LOCK.label, { lines: 2 });
    return widget;
  }
  widget.backgroundColor = COLORS.background;
  widget.setPadding(PADDING, PADDING, PADDING, PADDING);
  header(widget, {}, { ok: false, title: '', symbol: 'key.fill', color: COLORS.orange }, { statusText: false });
  widget.addSpacer();
  line(widget, 'Нужны адрес и ключ', FONT.status, COLORS.label, { lines: 2 });
  widget.addSpacer(4);
  line(widget, 'Откройте скрипт в Scriptable и введите их.', FONT.small, COLORS.secondary, { lines: 3 });
  widget.addSpacer();
  return widget;
}

// --- the app: setup and preview --------------------------------------------------------------------

async function say(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction('OK');
  await alert.presentAlert();
}

async function choose(title, message, options, cancel = 'Отмена') {
  const alert = new Alert();
  alert.title = title;
  if (message) alert.message = message;
  options.forEach((option) => alert.addAction(option));
  alert.addCancelAction(cancel);
  return alert.presentSheet();
}

async function setup(current) {
  const clipboard = (Pasteboard.pasteString() || '').trim();
  const fromClipboard = KEY_PATTERN.test(clipboard) ? clipboard : '';
  const alert = new Alert();
  alert.title = 'Подключение к Loader3D';
  alert.message = [
    'Адрес сайта и ключ виджета (его печатает python -m app widget-key). Ключ хранится в связке ключей iOS, не в тексте скрипта.',
    fromClipboard ? 'Ключ взят из буфера обмена.' : '',
    current ? 'Пустое поле ключа — оставить прежний.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  alert.addTextField('https://loader.example.com', current ? current.url : '');
  alert.addSecureTextField('l3dw_…', fromClipboard);
  alert.addAction('Сохранить');
  alert.addCancelAction('Отмена');
  if ((await alert.presentAlert()) === -1) return null;

  let url;
  try {
    url = normalizeUrl(alert.textFieldValue(0));
  } catch (error) {
    await say('Адрес не подходит', error.message);
    return setup(current);
  }
  const key = alert.textFieldValue(1).trim() || (current ? current.key : '');
  if (!KEY_PATTERN.test(key)) {
    await say('Ключ не подходит', 'Ключ начинается с l3dw_ — его печатает команда python -m app widget-key.');
    return setup(current);
  }

  const result = await fetchStats({ url, key });
  if (!result.stats) {
    const answer = await choose('Проверка не прошла', describeError(result), ['Исправить', 'Сохранить всё равно']);
    if (answer === 0) return setup(current);
    if (answer === -1) return null;
  }
  Keychain.set(KEYCHAIN_URL, url);
  Keychain.set(KEYCHAIN_KEY, key);
  if (result.stats) writeCache(url, result.stats);
  // Do not leave the key in the clipboard, where other apps read it.
  if (fromClipboard && Pasteboard.pasteString() === key) Pasteboard.copyString('');
  if (result.stats) await say('Готово', `Сайт: ${health({ stats: result.stats }).title.toLowerCase()}. Добавьте на экран виджет Scriptable и выберите этот скрипт.`);
  return { url, key };
}

async function preview(settings) {
  const families = [
    ['Маленький', 'small'],
    ['Средний', 'medium'],
    ['Большой', 'large'],
    ['Экран блокировки: круг', 'accessoryCircular'],
    ['Экран блокировки: прямоугольник', 'accessoryRectangular'],
    ['Экран блокировки: строка', 'accessoryInline'],
  ];
  if (Device.isPad()) families.splice(3, 0, ['Очень большой', 'extraLarge']);
  const f = await choose('Предпросмотр', 'Размер виджета', families.map(([name]) => name));
  if (f === -1) return;
  const views = Object.keys(VIEW_NAMES);
  const v = await choose('Предпросмотр', 'Что показывать (это же слово — параметр виджета)', views.map((view) => `${VIEW_NAMES[view]} — ${view}`));
  if (v === -1) return;
  const family = families[f][1];
  const widget = buildWidget(family, await loadState(settings), views[v], settings);
  const present = {
    small: 'presentSmall', medium: 'presentMedium', large: 'presentLarge', extraLarge: 'presentExtraLarge',
    accessoryCircular: 'presentAccessoryCircular', accessoryRectangular: 'presentAccessoryRectangular',
    accessoryInline: 'presentAccessoryInline',
  }[family];
  await widget[present]();
}

async function runInApp() {
  let settings = readSettings();
  if (!settings) {
    settings = await setup(null);
    if (!settings) return;
  }
  const actions = ['Предпросмотр виджета', 'Проверить подключение', 'Изменить адрес или ключ', 'Удалить ключ и кеш'];
  const answer = await choose('Loader3D — виджет', `Сайт: ${settings.url}`, actions, 'Закрыть');
  if (answer === 0) await preview(settings);
  if (answer === 1) {
    const result = await fetchStats(settings);
    if (result.stats) {
      writeCache(settings.url, result.stats);
      const h = health({ stats: result.stats });
      const n = numbers({ stats: result.stats });
      await say(h.title, `${h.detail ? h.detail + '\n' : ''}Онлайн: ${show(n.online.users)} · запросов в минуту: ${result.stats.load.requestsPerMinute}`);
    } else {
      await say('Нет связи с сайтом', describeError(result));
    }
  }
  if (answer === 2) await setup(settings);
  if (answer === 3) {
    const confirm = await choose('Удалить ключ?', 'Адрес, ключ и последние данные удалятся с этого телефона. На сервере ключ отзывается удалением его хэша из WIDGET_KEY_SHA256.', ['Удалить']);
    if (confirm === 0) {
      Keychain.remove(KEYCHAIN_URL);
      Keychain.remove(KEYCHAIN_KEY);
      if (files.fileExists(cachePath)) files.remove(cachePath);
    }
  }
}

async function runInWidget() {
  const family = config.widgetFamily || 'small';
  const view = VIEWS[String(args.widgetParameter || '').trim().toLowerCase()] || 'overview';
  const settings = readSettings();
  const widget = settings ? buildWidget(family, await loadState(settings), view, settings) : setupWidget(family);
  Script.setWidget(widget);
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  await runInWidget();
} else {
  await runInApp();
}
Script.complete();
