#!/usr/bin/env node
/**
 * audit-render — open every screen in a real browser and ask the page what it
 * IS, not what the source SAYS. Catches what no grep can:
 *   - text with no size class, inheriting 16px (often larger than the headings)
 *   - a CSS rule with higher specificity silently beating the utility
 *   - a portal to <body> escaping the scope where the tokens are defined
 *   - text below WCAG AA contrast (alpha-aware: rgba(255,255,255,.04) is not white)
 *   - top-level panels not lining up with the page header ("one edge")
 *
 *   node audit-render.mjs                  # app must already be running at baseUrl
 *   node audit-render.mjs --shots          # + a full-page screenshot per route (audit-shots/)
 *   node audit-render.mjs --dark           # prefers-color-scheme: dark
 *   node audit-render.mjs --width 390      # phone
 *   node audit-render.mjs --strict         # also fail on contrast misses
 *   node audit-render.mjs --capture <dir>  # + each route's real markup as a Claude Design artboard (<dir>/<name>.dc.html)
 *
 * Config (design-system.config.json):
 *   "baseUrl": "http://localhost:5173",
 *   "routes": ["/", "/settings", …],          every screen, not a sample
 *   "audit": {
 *     "setup": "scripts/audit-setup.mjs",     optional: export default async (page, { dark }) => { sign in, seed data, set theme }
 *     "scope": ".app-shell",                  optional: only audit text inside this element
 *     "headerSelector": "header h1",          optional: the element whose box defines the page edge
 *     "allowedSizes": [12, 13, 15, 18, 22, 38]  optional: else read from typeTokenPrefix tokens
 *     "captureRoot": "#root",               optional: the element captured by --capture (default body)
 *   }
 * Needs playwright or playwright-core installed in the project (npm i -D playwright-core).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadConfig, readTokens, loadModule, typeScale } from './lib.mjs';

const cfg = loadConfig();
const A = cfg.audit ?? {};
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots'), DARK = args.includes('--dark'), STRICT = args.includes('--strict');
const WIDTH = Number(args[args.indexOf('--width') + 1]) || 1440;
const CAPTURE = args.includes('--capture') ? resolve(cfg.root, args[args.indexOf('--capture') + 1]) : null;

const req = createRequire(join(cfg.root, 'package.json'));
let chromium;
try { ({ chromium } = req('playwright')); } catch { try { ({ chromium } = req('playwright-core')); } catch {
  console.error('✗ Install playwright-core in the project: npm i -D playwright-core'); process.exit(1); } }

const toPx = (v) => { const m = String(v).match(/([\d.]+)(px|rem)?/); return m ? +(m[2] === 'rem' ? m[1] * 16 : m[1]) : NaN; };
let allowed = A.allowedSizes ?? Object.entries(readTokens(cfg)).filter(([k]) => k.startsWith(cfg.typeTokenPrefix)).map(([, v]) => toPx(v)).filter(n => !isNaN(n));
if (!A.allowedSizes && cfg.stack === 'react-native' && cfg.tokenModule) {
  // React Native: the type scale is the fontSize of each style in the tokens object.
  const mod = await loadModule(cfg, cfg.tokenModule);
  allowed = typeScale(mod, cfg.tokenMap).sizes;
}
if (!allowed.length) { console.error(`✗ No type scale: set audit.allowedSizes, or declare ${cfg.typeTokenPrefix}* tokens.`); process.exit(1); }

const setup = A.setup ? (await import(pathToFileURL(resolve(cfg.root, A.setup)).href)).default : null;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, colorScheme: DARK ? 'dark' : 'light' });
const page = await context.newPage();
page.setDefaultTimeout(8000);
if (setup) await setup(page, { dark: DARK, context });
if (SHOTS) mkdirSync(join(cfg.root, 'audit-shots'), { recursive: true });
if (CAPTURE) mkdirSync(CAPTURE, { recursive: true });
const captured = [];

// Screens: web routes, or (for a one-URL app such as a React Native / Expo web
// build) a module that taps its way to each screen:
//   export default [{ name: 'Today', go: async (page) => { … } }, …]
const screens = A.screens
  ? (await import(pathToFileURL(resolve(cfg.root, A.screens)).href)).default
  : cfg.routes.map(route => ({ name: route, go: (p) => p.goto(cfg.baseUrl + route, { waitUntil: 'networkidle' }).catch(() => {}) }));
if (A.screens) await page.goto(cfg.baseUrl, { waitUntil: 'networkidle' }).catch(() => {});
// Anything tappable smaller than this is hard to hit: 44 on phones, 24 (WCAG 2.2) on the web.
const MIN_TARGET = A.minTarget ?? (cfg.stack === 'react-native' || WIDTH < 600 ? 44 : 24);

let offScale = 0, contrast = 0, edges = 0, small = 0;
for (const { name: route, go } of screens) {
  await go(page);
  await page.waitForTimeout(400);
  const r = await page.evaluate(({ allowed, scope, headerSelector, minTarget }) => {
    const root = (scope && document.querySelector(scope)) || document.body;
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
    const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const bgOf = (el) => { // composite translucent backgrounds up the tree
      const layers = [];
      for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
      return layers.reverse().reduce((acc, c) => blend(c, acc), { r: 255, g: 255, b: 255, a: 1 });
    };
    const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''} "${el.textContent.trim().slice(0, 40)}"`;
    const off = [], low = [];
    for (const el of root.querySelectorAll('*')) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (!allowed.some(a => Math.abs(a - size) < 0.26)) off.push(`${size}px ${label(el)}`);
      const fg = parse(cs.color);
      if (fg && fg.a > 0.3 && !el.closest('[disabled],[aria-disabled="true"]')) {
        const bg = bgOf(el); const f = blend(fg, bg);
        const [hi, lo] = [lum(f), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
        if (ratio < (large ? 3 : 4.5)) low.push(`${ratio.toFixed(2)}:1 ${label(el)}`);
      }
    }
    const misaligned = [];
    const head = headerSelector && document.querySelector(headerSelector);
    if (head) {
      const h = head.getBoundingClientRect();
      for (const el of root.querySelectorAll('section, [class*="card"], [class*="panel"]')) {
        const b = el.getBoundingClientRect();
        if (b.width > 400 && el.parentElement && Math.abs(b.left - h.left) > 2 && Math.abs(b.left - h.left) < 60) misaligned.push(`${Math.round(b.left - h.left)}px ${label(el)}`);
      }
    }
    const tiny = [];
    for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="switch"], [role="checkbox"], input, select, textarea')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height && (b.width < minTarget || b.height < minTarget) && getComputedStyle(el).visibility !== 'hidden') tiny.push(`${Math.round(b.width)}×${Math.round(b.height)} ${label(el)}${el.getAttribute('aria-label') ? '' : el.textContent.trim() ? '' : '  (and no label)'}`);
    }
    return { off: [...new Set(off)], low: [...new Set(low)], misaligned, tiny: [...new Set(tiny)] };
  }, { allowed, scope: A.scope, headerSelector: A.headerSelector, minTarget: MIN_TARGET });
  if (SHOTS) await page.screenshot({ path: join(cfg.root, 'audit-shots', `${route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'}-${WIDTH}${DARK ? '-dark' : ''}.png`), fullPage: true });
  if (CAPTURE) captured.push(await capture(route));
  offScale += r.off.length; contrast += r.low.length; edges += r.misaligned.length; small += r.tiny.length;
  if (r.off.length || r.low.length || r.misaligned.length || r.tiny.length) {
    console.log(`\n${route}`);
    r.off.slice(0, 15).forEach(x => console.log(`  off-scale  ${x}`));
    r.low.slice(0, 10).forEach(x => console.log(`  contrast   ${x}`));
    r.misaligned.slice(0, 5).forEach(x => console.log(`  edge       ${x}`));
    r.tiny.slice(0, 8).forEach(x => console.log(`  target     ${x}`));
  }
}
await browser.close();
if (CAPTURE) {
  writeFileSync(join(CAPTURE, 'capture.json'), JSON.stringify(captured, null, 2) + '\n');
  console.log(`\nCaptured ${captured.length} artboards → ${CAPTURE}`);
  for (const c of captured) console.log(`  ${c.file}  ${c.width}×${c.height}${c.height > 8000 ? '  ✗ taller than 8000px: split it, or capture a narrower part' : ''}${c.images.length ? `  ${c.images.length} images to upload` : ''}${c.empty ? '  ✗ EMPTY: the app rendered nothing here; give audit.setup a signed-in user and sample data' : ''}`);
}

// The route's real rendered markup, wrapped as a Claude Design artboard: the
// app's own classes, with the design system's stylesheet and fonts linked.
// Exact, because it IS the app; faster than redrawing from a screenshot.
async function capture(route) {
  const name = (route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'Main') + (WIDTH < 600 ? '-phone' : '') + (DARK ? '-dark' : '');
  const { text, html, height, images } = await page.evaluate((sel) => {
    const root = (sel && document.querySelector(sel)) || document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, noscript, iframe, object, embed').forEach(n => n.remove());
    return { text: root.innerText.trim().length, html: clone.outerHTML, height: Math.ceil(document.documentElement.scrollHeight), images: [...new Set([...root.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(Boolean))] };
  }, A.captureRoot);
  const C = cfg.claudeDesign ?? {};
  const folder = C.folder ?? (C.name ?? 'kit').toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^[-_]+|-+$/g, '');
  const links = A.captureLinks ?? ['canvas-fonts.css', `ds/${folder}/components/bundle.css`];
  const dark = (C.kit?.darkClass ?? 'dark');
  // `{{` would be read as a template hole on the canvas.
  const body = html.replace(/\{\{/g, '&#123;&#123;');
  const file = `${name}.dc.html`;
  writeFileSync(join(CAPTURE, file), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name}</title>
<script src="./support.js"></script>
${links.map(l => `<link rel="stylesheet" href="${l}">`).join('\n')}
</head>
<body>
<x-dc>
<helmet>
<style>
body{margin:0}
</style>
</helmet>
<div${DARK ? ` class="${dark}"` : ''} style="min-height: ${height}px; position: relative">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${WIDTH},"height":${height}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`);
  return { route, file, width: WIDTH, height, dark: DARK, images, empty: text < 20 };
}
console.log(`\n${screens.length} screens at ${WIDTH}px${DARK ? ', dark' : ''}: ${offScale} off-scale, ${contrast} contrast, ${edges} edge, ${small} under ${MIN_TARGET}px to tap. Allowed sizes: ${allowed.join(', ')}px.`);
if (offScale || edges || (STRICT && contrast)) process.exit(1);
