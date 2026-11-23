// After `vite build`: puts the landing page and the calculator pages into dist/ as real HTML for search
// engines and link previews (the browser hydrates them) — dist/index.html for `/`, dist/kalkulyator/ldm.html
// for `/kalkulyator/ldm` and so on (deploy/Caddyfile tries `{path}.html`), — keeps the empty SPA shell as
// dist/app.html for every other route, and writes robots.txt and sitemap.xml.
//
// SITE_URL (https://loader.example.com, optional) makes canonical, Open Graph and sitemap URLs absolute;
// without it there is no canonical link and no sitemap (they need absolute URLs).
// YANDEX_VERIFICATION / GOOGLE_SITE_VERIFICATION (optional): the codes of the verification meta tags of
// Yandex.Webmaster and Google Search Console, put on the landing page; several — separated by commas.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'vite';

const SITE_URL = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
if (SITE_URL && !/^https?:\/\/[^/\s]+$/.test(SITE_URL)) {
  console.error(`SITE_URL must look like https://loader.example.com, got "${SITE_URL}"`);
  process.exit(1);
}

/** Verification codes: letters, digits, `-` and `_` only (they go into an attribute). */
function codes(name) {
  const list = (process.env[name] ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  for (const c of list) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(c)) {
      console.error(`${name} must be the code from the meta tag (letters, digits, - and _), got "${c}"`);
      process.exit(1);
    }
  }
  return list;
}
const VERIFICATION = [
  ...codes('YANDEX_VERIFICATION').map((c) => `<meta name="yandex-verification" content="${c}" />`),
  ...codes('GOOGLE_SITE_VERIFICATION').map((c) => `<meta name="google-site-verification" content="${c}" />`),
];

const escape = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const json = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

/** Puts a page's own title, description and colour into the template (index.html is the landing page's). */
function withMeta(html, { title, description, themeColor }) {
  let out = html;
  if (themeColor) out = out.replace(/(<meta\s+name="theme-color"\s+content=")[^"]*(")/, `$1${escape(themeColor)}$2`);
  if (title) {
    out = out
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escape(title)}$2`);
  }
  if (description) {
    out = out
      .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escape(description)}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escape(description)}$2`);
  }
  // The landing page's keywords describe the landing page only.
  if (title) out = out.replace(/\s*<meta\s+name="keywords"[\s\S]*?\/>/, '');
  return out;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let code = 0;
try {
  const { renderPage, prerenderedPages } = await server.ssrLoadModule('/src/prerender.tsx');
  const template = readFileSync('dist/index.html', 'utf8');
  if (!template.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty #root');
  writeFileSync('dist/app.html', template);

  const pages = prerenderedPages(SITE_URL);
  for (const page of pages) {
    const landing = page.path === '/';
    const head = [
      ...(landing ? ['<link rel="preload" as="image" href="/landing/editor.webp" fetchpriority="high" />', ...VERIFICATION] : []),
      ...page.structuredData.map((d) => `<script type="application/ld+json">${json(d)}</script>`),
    ];
    let html = withMeta(template, page);
    if (SITE_URL) {
      const url = `${SITE_URL}${page.path}`;
      head.push(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`);
      html = html.replace('content="/landing/og.jpg"', `content="${SITE_URL}/landing/og.jpg"`);
    }
    html = html
      .replace('</head>', `    ${head.join('\n    ')}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${renderPage(page.path)}</div>`);
    const file = `dist/${page.file}`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    console.log(`prerendered ${file} (${Math.round(html.length / 1024)} kB)`);
  }

  const robots = ['User-agent: *', 'Allow: /', 'Disallow: /plans', 'Disallow: /start', 'Disallow: /verify-email', 'Disallow: /account', 'Disallow: /admin', 'Disallow: /api/'];
  if (SITE_URL) robots.push('', `Sitemap: ${SITE_URL}/sitemap.xml`);
  writeFileSync('dist/robots.txt', `${robots.join('\n')}\n`);
  if (SITE_URL) {
    const entries = [
      ...pages.map((p) => ({ path: p.path, updated: p.updated })),
      ...['/register', '/terms', '/privacy'].map((path) => ({ path })),
    ];
    const urls = entries.map(
      ({ path, updated }) => `  <url><loc>${SITE_URL}${path}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}</url>`,
    );
    writeFileSync(
      'dist/sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    );
  }
  console.log(`${pages.length} pages${SITE_URL ? ` for ${SITE_URL}` : ''}${VERIFICATION.length ? `, ${VERIFICATION.length} verification tag(s)` : ''}`);
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  await server.close();
}
// Modules of the app keep handles open (BroadcastChannel of the auth store): do not wait for them.
process.exit(code);
