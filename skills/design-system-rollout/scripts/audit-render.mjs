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
 *   node audit-render.mjs --capture <dir> --canvas   # + canvas.boards.json: board positions and sizes, ready to merge
 *   node audit-render.mjs --phone          # 390 wide; captures named "-phone"
 *   node audit-render.mjs --signed-out     # no sign-in (audit.setupSignedOut if set): the login and sign-up pages
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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadConfig, readTokens, loadModule, typeScale } from './lib.mjs';

const cfg = loadConfig();
const A = cfg.audit ?? {};
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots'), DARK = args.includes('--dark'), STRICT = args.includes('--strict');
// --phone is shorthand for --width 390; captures made at phone width are named "-phone".
const WIDTH = args.includes('--phone') ? 390 : Number(args[args.indexOf('--width') + 1]) || 1440;
// --signed-out: no sign-in, so the login and sign-up pages can be audited and captured.
// Uses audit.setupSignedOut when there is one (e.g. to dismiss a cookie banner), else no setup.
const SIGNED_OUT = args.includes('--signed-out');
const CANVAS = args.includes('--canvas');
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

const setupFile = SIGNED_OUT ? A.setupSignedOut : A.setup;
const setup = setupFile ? (await import(pathToFileURL(resolve(cfg.root, setupFile)).href)).default : null;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, colorScheme: DARK ? 'dark' : 'light' });
const page = await context.newPage();
page.setDefaultTimeout(8000);
if (setup) await setup(page, { dark: DARK, context, signedOut: SIGNED_OUT });
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
// 44 on a phone (Apple, Google), 24 on a desktop page (WCAG 2.2). "minTarget" may be a
// number, or { phone, desktop }; a single number is never applied to the other width.
const PHONE = cfg.stack === 'react-native' || WIDTH < 600;
const MIN_TARGET = typeof A.minTarget === 'object' ? (PHONE ? A.minTarget.phone ?? 44 : A.minTarget.desktop ?? 24) : (A.minTarget && PHONE ? A.minTarget : PHONE ? 44 : 24);

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
        // A centred column (equal space either side) is a layout, not a stray inset.
        const vw = document.documentElement.clientWidth;
        const centred = Math.abs(b.left - (vw - b.right)) < 4 || Math.abs((b.left + b.right) / 2 - (h.left + h.right) / 2) < 4;
        if (b.width > 400 && el.parentElement && !centred && Math.abs(b.left - h.left) > 2 && Math.abs(b.left - h.left) < 60) misaligned.push(`${Math.round(b.left - h.left)}px ${label(el)}`);
      }
    }
    const tiny = [];
    for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="switch"], [role="checkbox"], input, select, textarea')) {
      const b = el.getBoundingClientRect();
      // Labelled by: aria-label, aria-labelledby, its own text, or a <label> (wrapping, or for=).
      const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent.trim() || el.closest('label') || (el.labels && el.labels.length) || el.getAttribute('title');
      if (b.width && b.height && (b.width < minTarget || b.height < minTarget) && getComputedStyle(el).visibility !== 'hidden') tiny.push(`${Math.round(b.width)}×${Math.round(b.height)} ${label(el)}${named ? '' : '  (and no label)'}`);
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
  // Runs at other widths or in dark mode add to the same list instead of replacing it.
  const listFile = join(CAPTURE, 'capture.json');
  const before = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : [];
  const all = [...before.filter(b => !captured.some(c => c.file === b.file)), ...captured];
  writeFileSync(listFile, JSON.stringify(all, null, 2) + '\n');
  if (CANVAS) {
    // Board positions for the canvas index: one row per screen, its variants side by
    // side (desktop, phone, dark), 80px apart, rows 120px apart plus room for titles.
    // Merge these entries into the canvas's boards and order; nothing is transcribed by hand.
    const rank = (c) => (c.phone ? 1 : 0) + (c.dark ? 2 : 0);
    const rows = [...new Set(all.map(c => c.screen ?? c.route))];
    const boards = {}; let y = 0;
    for (const screen of rows) {
      const items = all.filter(c => (c.screen ?? c.route) === screen).sort((a, b) => rank(a) - rank(b));
      let x = 0;
      for (const c of items) { boards[c.file] = { x, y, w: c.width, h: Math.min(c.height, 8000), title: `${screen}${c.phone ? ', phone' : ''}${c.dark ? ', dark' : ''}` }; x += c.width + 80; }
      y += Math.min(Math.max(...items.map(c => c.height)), 8000) + 120;
    }
    writeFileSync(join(CAPTURE, 'canvas.boards.json'), JSON.stringify({ boards, order: Object.keys(boards) }, null, 2) + '\n');
    console.log(`\nCanvas layout for ${Object.keys(boards).length} boards → ${join(CAPTURE, 'canvas.boards.json')} (merge into the canvas index's "boards" and "order")`);
  }
  console.log(`\nCaptured ${captured.length} artboards → ${CAPTURE}`);
  for (const c of captured) console.log(`  ${c.file}  ${c.width}×${c.height}${c.height > 8000 ? '  ✗ taller than 8000px: split it, or capture a narrower part' : ''}${c.images.length ? `  ${c.images.length} images to upload` : ''}${c.empty ? '  ✗ EMPTY: the app rendered nothing here; give audit.setup a signed-in user and sample data' : ''}`);
}

// The route's real rendered markup, wrapped as a Claude Design artboard: the
// app's own classes, with the design system's stylesheet and fonts linked.
// Exact, because it IS the app; faster than redrawing from a screenshot.
async function capture(route) {
  const base = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'Main';
  const name = base + (SIGNED_OUT ? '-signed-out' : '') + (WIDTH < 600 ? '-phone' : '') + (DARK ? '-dark' : '');
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
  return { route, screen: base + (SIGNED_OUT ? '-signed-out' : ''), file, width: WIDTH, height, dark: DARK, phone: WIDTH < 600, images, empty: text < 20 };
}
console.log(`\n${screens.length} screens at ${WIDTH}px${DARK ? ', dark' : ''}: ${offScale} off-scale, ${contrast} contrast, ${edges} edge, ${small} under ${MIN_TARGET}px to tap. Allowed sizes: ${allowed.join(', ')}px.`);
if (offScale || edges || (STRICT && contrast)) process.exit(1);
