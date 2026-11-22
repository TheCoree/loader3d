#!/usr/bin/env node
/**
 * Runs loader3d-widget.js in the Scriptable stand-in for every size, view and situation (mock.js) and
 * checks what it builds: no exception, no «undefined»/«NaN» on screen, the key only in the header, the
 * right status words, a refresh date, the cache. Then the first run in the app (setup from the clipboard).
 *
 *   node tools/scriptable/preview/check.mjs
 *
 * Against a running API as well (the key from the environment, never from the command line):
 *   LOADER3D_URL=http://127.0.0.1:8000 LOADER3D_WIDGET_KEY_FILE=path/to/key.txt node tools/scriptable/preview/check.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runScript } from './scriptable-shim.js';
import { CACHE_PATH, KEY, SCENARIOS, SITE, scenarioFetch, scenarioFiles, scenarioKeychain } from './mock.js';

const source = await readFile(new URL('../loader3d-widget.js', import.meta.url), 'utf8');
const FAMILIES = ['small', 'medium', 'large', 'extraLarge', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline'];
const PARAMETERS = [null, 'overview', 'revenue', 'signups', 'online', 'load', 'status', 'Выручка', ' нагрузка ', 'nonsense'];
const SCREENS = [
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 375, height: 667 },
  { width: 402, height: 874 },
  { width: 360, height: 640 }, // unknown: scaled
];

function texts(node, out = []) {
  if (node.type === 'text') out.push(node.text);
  for (const child of node.children ?? []) texts(child, out);
  return out;
}

function images(node, out = []) {
  if (node.type === 'image') out.push(node);
  for (const child of node.children ?? []) images(child, out);
  return out;
}

let runs = 0;
async function run(options) {
  runs += 1;
  const outcome = await runScript(source, options);
  assert.ok(outcome.completed, 'Script.complete() was not called');
  return outcome;
}

// --- every size × view × situation -----------------------------------------------------------------

for (const [name, scenario] of Object.entries(SCENARIOS)) {
  for (const family of FAMILIES) {
    for (const parameter of PARAMETERS) {
      for (const screen of family === 'medium' && parameter === null ? SCREENS : [SCREENS[0]]) {
        const where = `${name} / ${family} / ${parameter} / ${screen.width}×${screen.height}`;
        const seen = [];
        const files = scenarioFiles(name);
        const before = Date.now();
        const outcome = await run({
          family,
          parameter,
          screen,
          isPad: family === 'extraLarge',
          keychain: scenarioKeychain(name),
          files,
          fetch: scenarioFetch(name, seen),
        }).catch((error) => {
          throw new Error(`${where}: ${error.stack}`);
        });
        const widget = outcome.widget;
        assert.ok(widget, `${where}: no widget`);
        const shown = texts(widget);
        const keyOnly = scenario.configured === false && family === 'accessoryCircular';
        assert.ok(shown.length > 0 || keyOnly, `${where}: nothing shown`);
        for (const value of shown) {
          assert.ok(!/undefined|NaN|null|\[object|Infinity/.test(value), `${where}: «${value}»`);
          assert.ok(value.trim().length > 0 || value === '', `${where}: blank text`);
        }
        for (const image of images(widget)) {
          assert.ok(image.imageSize && image.imageSize.width > 0 && image.imageSize.height > 0, `${where}: image without size`);
        }

        if (scenario.configured === false) {
          assert.equal(seen.length, 0, `${where}: asked the site without a key`);
          if (keyOnly) assert.equal(images(widget)[0].image.name, 'key.fill');
          else assert.ok(shown.join(' ').includes('Scriptable'), `${where}: no hint to open Scriptable`);
          continue;
        }
        // The key travels only in the header, to the address in the keychain.
        assert.equal(seen.length, 1, `${where}: ${seen.length} requests`);
        const [request] = seen;
        assert.equal(request.url, `${SITE}/api/widget/stats`);
        assert.equal(request.headers.Authorization, `Bearer ${KEY}`);
        assert.ok(!request.url.includes(KEY));
        assert.equal(typeof request.onRedirect, 'function');
        assert.equal(request.onRedirect({}), null, 'redirects must be refused');
        assert.equal(widget.url, `${SITE}/admin`);
        const refresh = widget.refreshAfterDate.getTime() - before;
        assert.ok(refresh >= 4 * 60000 && refresh <= 16 * 60000, `${where}: refresh in ${refresh} ms`);

        const all = shown.join(' | ');
        const home = !family.startsWith('accessory');
        if (scenario.offline && !scenario.noInternet && (home || family === 'accessoryRectangular')) {
          assert.ok(all.includes('Сайт не отвечает'), `${where}: ${all}`);
        }
        if (family === 'accessoryInline' && scenario.offline && !scenario.noInternet) {
          assert.ok(all.includes('сайт не отвечает'), `${where}: ${all}`);
        }
        if (scenario.noInternet && (home || family === 'accessoryRectangular')) assert.ok(all.includes('Нет интернета'), `${where}: ${all}`);
        if (name === 'dbDown' && (home || family === 'accessoryRectangular')) assert.ok(all.includes('База недоступна'), `${where}: ${all}`);
        if (name === 'badKey' && home) assert.ok(all.includes('Неверный ключ'), `${where}: ${all}`);
        if (scenario.cache && (scenario.offline || scenario.http) && home && parameter !== 'load' && family !== 'small') {
          assert.ok(/данные от/.test(all), `${where}: the cached numbers are not marked: ${all}`);
        }
        if (name === 'ok') {
          const cache = JSON.parse(files[CACHE_PATH]);
          assert.equal(cache.site, SITE);
          assert.equal(cache.stats.status, 'ok');
          assert.ok(!files[CACHE_PATH].includes(KEY), 'the key must not be cached');
        }
      }
    }
  }
}

// --- the first run in the app: the key from the clipboard ------------------------------------------

{
  const keychain = {};
  const clipboard = { value: KEY };
  const answers = [];
  const outcome = await run({
    inApp: true,
    keychain,
    clipboard,
    fetch: scenarioFetch('ok'),
    onAlert: async (alert) => {
      answers.push(alert.title);
      if (alert.title === 'Подключение к Loader3D') {
        assert.equal(alert.fields[1].secure, true, 'the key field must be secure');
        assert.equal(alert.fields[1].text, KEY, 'the key from the clipboard');
        alert.fields[0].text = ' Loader.Example.com/ ';
        return 0;
      }
      return 0;
    },
  });
  assert.deepEqual(answers.slice(0, 2), ['Подключение к Loader3D', 'Готово']);
  assert.equal(keychain['loader3d.widget.url'], SITE);
  assert.equal(keychain['loader3d.widget.key'], KEY);
  assert.equal(clipboard.value, '', 'the clipboard must be cleared');
  assert.equal(outcome.widget, null);
}

// --- plain http and a wrong key are refused before anything is saved ------------------------------

{
  const keychain = {};
  const titles = [];
  let attempt = 0;
  await run({
    inApp: true,
    keychain,
    fetch: scenarioFetch('ok'),
    onAlert: async (alert) => {
      titles.push(alert.title);
      if (alert.title !== 'Подключение к Loader3D') return 0;
      attempt += 1;
      if (attempt === 1) {
        alert.fields[0].text = 'http://loader.example.com';
        alert.fields[1].text = KEY;
        return 0;
      }
      if (attempt === 2) {
        alert.fields[0].text = 'https://loader.example.com';
        alert.fields[1].text = 'not-a-key';
        return 0;
      }
      return -1;
    },
  });
  assert.deepEqual(titles, ['Подключение к Loader3D', 'Адрес не подходит', 'Подключение к Loader3D', 'Ключ не подходит', 'Подключение к Loader3D']);
  assert.deepEqual(keychain, {});
}

// --- a preview from the app menu -------------------------------------------------------------------

{
  const outcome = await run({
    inApp: true,
    keychain: scenarioKeychain('ok'),
    fetch: scenarioFetch('ok'),
    onAlert: async (alert) => (alert.title === 'Loader3D — виджет' ? 0 : alert.message === 'Размер виджета' ? 4 : 2),
  });
  assert.equal(outcome.presented.family, 'accessoryRectangular');
}

console.log(`OK: ${runs} runs of the widget script, ${Object.keys(SCENARIOS).length} situations × ${FAMILIES.length} sizes × ${PARAMETERS.length} parameters`);

// --- optionally: a live API ------------------------------------------------------------------------

if (process.env.LOADER3D_URL) {
  const keyFile = process.env.LOADER3D_WIDGET_KEY_FILE;
  const key = (keyFile ? await readFile(keyFile, 'utf8') : process.env.LOADER3D_WIDGET_KEY ?? '').trim();
  const url = process.env.LOADER3D_URL.replace(/\/+$/, '');
  const live = async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(request.timeoutInterval * 1000),
    });
    return { status: response.status, body: await response.text() };
  };
  for (const family of ['medium', 'accessoryInline']) {
    const outcome = await run({
      family,
      keychain: { 'loader3d.widget.url': url, 'loader3d.widget.key': key },
      fetch: live,
    });
    console.log(`live ${family}: ${texts(outcome.widget).join(' | ')}`);
  }
}

