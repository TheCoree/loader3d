const pluralRules = new Intl.PluralRules('ru-RU');

/** plural(5, ['груз', 'груза', 'грузов']) → '5 грузов'. */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const rule = pluralRules.select(n);
  const word = rule === 'one' ? one : rule === 'few' ? few : many;
  return `${n.toLocaleString('ru-RU')} ${word}`;
}

const relative = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** «только что», «5 минут назад», «вчера», then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'только что';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), 'day');
  return dateFormat.format(new Date(iso));
}

export function fullDate(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** Rough "Chrome · Windows" from a user agent, for the list of sessions. */
export function describeUserAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Неизвестное устройство', mobile: false };
  const browser =
    [
      [/YaBrowser\//, 'Яндекс Браузер'],
      [/Edg\//, 'Edge'],
      [/OPR\/|Opera/, 'Opera'],
      [/Firefox\//, 'Firefox'],
      [/Chrome\//, 'Chrome'],
      [/Safari\//, 'Safari'],
    ].find(([re]) => (re as RegExp).test(ua))?.[1] ?? 'Браузер';
  const os =
    [
      [/iPhone|iPad|iPod/, 'iOS'],
      [/Android/, 'Android'],
      [/Windows/, 'Windows'],
      [/Mac OS X|Macintosh/, 'macOS'],
      [/Linux/, 'Linux'],
    ].find(([re]) => (re as RegExp).test(ua))?.[1] ?? '';
  return { label: os ? `${browser} · ${os}` : String(browser), mobile: /Mobi|iPhone|Android/.test(ua) };
}

/** «АК» for «Анна Карпова», «A» for «anna». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? '?');
  return letters.toUpperCase();
}
