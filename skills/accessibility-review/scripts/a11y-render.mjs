#!/usr/bin/env node
/**
 * a11y-render: check the rendered pages in a headless browser, for what
 * source code can't show. Needs the app running, and playwright-core.
 *
 *   node a11y-render.mjs                 # every route in a11y.config.json "render"
 *   node a11y-render.mjs --json
 *   node a11y-render.mjs --strict        # exit 1 on any serious finding (CI)
 *
 * Per route:
 *   axe-core       the standard rule engine (WCAG 2.0–2.2 A/AA), when the project has axe-core installed
 *   contrast       text as rendered against its real background (also without axe)
 *   keyboard       Tab through the page: order, a visible focus indicator (2.4.7), focus hidden under
 *                  sticky content (2.4.11), focus stuck in one place (2.1.2)
 *   reduce motion  with prefers-reduced-motion: reduce, anything still moving (2.3.3)
 *   reflow         at 320px wide, nothing scrolls sideways (1.4.10)
 *   text spacing   with WCAG's spacing overrides, no text clipped (1.4.12)
 *
 * Config (a11y.config.json):
 *   "render": { "baseUrl": "http://localhost:5173", "routes": ["/", "/login"],
 *               "setup": "scripts/a11y-setup.mjs",   // optional: export default async (page) => { sign in with SAMPLE data }
 *               "maxTabs": 60 }
 * Use sample data only: whatever the setup signs in as ends up in the report.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const cfg = existsSync(join(ROOT, 'a11y.config.json')) ? JSON.parse(readFileSync(join(ROOT, 'a11y.config.json'), 'utf8')) : {};
const r = cfg.render ?? {};
const args = process.argv.slice(2);
const req = createRequire(join(ROOT, 'package.json'));
let chromium;
try { ({ chromium } = req('playwright-core')); } catch { try { ({ chromium } = req('playwright')); } catch { console.error('✗ playwright-core is not installed in this project: npm i -D playwright-core (the browser comes from PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH).'); process.exit(2); } }
const axePath = process.env.A11Y_AXE_PATH ?? (() => { try { return req.resolve('axe-core/axe.min.js'); } catch { return null; } })();
const baseUrl = (args.find(a => a.startsWith('http')) ?? r.baseUrl ?? 'http://localhost:5173').replace(/\/$/, '');
const routes = r.routes ?? ['/'];

// ── In-page helpers (serialised into the page) ──
const PAGE = {
  contrast: () => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
    const bgOf = (el) => {   // the colour behind el: translucent layers composited down to the first opaque one
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null;   // an image or gradient behind the text: a person checks it
        const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let out = { r: 255, g: 255, b: 255, a: 1 };
      for (const c of layers.reverse()) out = over(c, out);
      return out;
    };
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      if (el.closest('[disabled],[aria-disabled="true"],[aria-hidden="true"]')) continue;   // inactive or hidden: no requirement
      const bg = bgOf(el); if (!bg) continue;
      let fg = parse(cs.color); if (!fg) continue;
      fg = over(fg, bg);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
      const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) out.push({ text: el.textContent.trim().slice(0, 40), ratio: Math.floor(ratio * 100) / 100, need: large ? 3 : 4.5, fg: cs.color, sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') });
    }
    return out;
  },
  focused: () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || '').trim().slice(0, 40);
    const indicator = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
    // Hidden under sticky/fixed content: the element at its centre isn't it (or inside it).
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const top = (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) ? document.elementFromPoint(cx, cy) : null;
    const covered = top && !el.contains(top) && !top.contains(el) && (() => { for (let n = top; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; })();
    const id = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (name ? ` "${name}"` : '');
    return { id, indicator, outline: cs.outlineStyle + ' ' + cs.outlineWidth, shadow: cs.boxShadow !== 'none', covered: !!covered, key: rect.x + ',' + rect.y + ',' + id };
  },
  moving: () => document.getAnimations().filter(a => a.playState === 'running' && !a.effect?.target?.closest?.('[data-motion="essential"]')).filter(a => {
    try { return a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none' || k.translate || k.scale || k.rotate || k.left || k.top); } catch { return false; }
  }).map(a => (a.animationName ?? a.transitionProperty ?? 'animation') + ' on ' + (a.effect.target?.tagName?.toLowerCase() ?? '?') + (a.effect.target?.className && typeof a.effect.target.className === 'string' ? '.' + a.effect.target.className.trim().split(/\s+/)[0] : '')),
  clipped: () => [...document.querySelectorAll('body *')].filter(el => {
    const cs = getComputedStyle(el);
    if (!/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)) return false;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !el.querySelector('p,span,li')) return false;
    return el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
  }).slice(0, 20).map(el => el.tagName.toLowerCase() + ' "' + (el.innerText || '').trim().slice(0, 30) + '"'),
};
const SPACING = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
for (const route of routes) {
  const url = baseUrl + route, res = { route, axe: null, contrast: [], focus: { order: [], noIndicator: [], covered: [], trapped: false }, moving: [], reflow: null, spacing: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrors = []; page.on('pageerror', e => consoleErrors.push(e.message)); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  if (r.setup) { const mod = await import(pathToFileURL(resolve(ROOT, r.setup)).href); await mod.default(page, { baseUrl }); }
  await page.goto(url, { waitUntil: 'networkidle' }).catch(e => { res.error = e.message; });
  if (res.error) { results.push(res); await ctx.close(); continue; }
  await page.waitForTimeout(800);
  // A blank page passes every check. Say so instead.
  const content = await page.evaluate(() => ({ text: document.body.innerText.trim().length, controls: document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]').length }));
  if (!content.text && !content.controls) { res.error = `the page rendered nothing${consoleErrors.length ? ` (console: ${consoleErrors[0].slice(0, 160)})` : ''}. Every check would pass on an empty page, so none were run`; results.push(res); await ctx.close(); continue; }
  if (axePath) {
    await page.addScriptTag({ path: axePath });
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(x => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length, first: x.nodes[0]?.target?.join(' ') })));
    res.axe = v;
  }
  res.contrast = await page.evaluate(PAGE.contrast);
  // Keyboard: Tab from the top
  const seen = new Map();
  for (let i = 0; i < (r.maxTabs ?? 60); i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(PAGE.focused);
    if (!f) continue;
    if (seen.has(f.key) && i > 0 && res.focus.order.at(-1) === f.id && seen.get(f.key) > 2) { res.focus.trapped = f.id; break; }
    seen.set(f.key, (seen.get(f.key) ?? 0) + 1);
    if (seen.get(f.key) > 1 && res.focus.order.length > 3) break;   // wrapped round to the start
    res.focus.order.push(f.id);
    if (!f.indicator) res.focus.noIndicator.push(f.id);
    if (f.covered) res.focus.covered.push(f.id);
  }
  await ctx.close();
  // Reduce motion
  const rm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p2 = await rm.newPage();
  if (r.setup) { const mod = await import(pathToFileURL(resolve(ROOT, r.setup)).href); await mod.default(p2, { baseUrl }); }
  await p2.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await p2.waitForTimeout(300);
  res.moving = await p2.evaluate(PAGE.moving);
  // Reflow at 320px, then text spacing
  await p2.setViewportSize({ width: 320, height: 640 });
  await p2.waitForTimeout(300);
  res.reflow = await p2.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: innerWidth }));
  await p2.setViewportSize({ width: 1280, height: 800 });
  await p2.addStyleTag({ content: SPACING });
  await p2.waitForTimeout(200);
  res.spacing = await p2.evaluate(PAGE.clipped);
  await rm.close();
  results.push(res);
}
await browser.close();

if (args.includes('--json')) { console.log(JSON.stringify({ axe: !!axePath, results }, null, 2)); process.exit(0); }
const L = ['# Rendered accessibility', '', `${baseUrl}, ${routes.length} route(s). ${axePath ? 'axe-core ran (WCAG 2.0–2.2 A/AA rules).' : '**axe-core is not installed**: `npm i -D axe-core` adds about 60 more rules. The checks below ran without it.'}`, ''];
let serious = 0;
for (const x of results) {
  L.push(`## ${x.route}`, '');
  if (x.error) { L.push(`Couldn't load: ${x.error}`, ''); serious++; continue; }
  if (x.axe) {
    if (!x.axe.length) L.push('- axe-core: no violations.');
    else { L.push('- axe-core:', '', '  | Rule | Impact | Elements | What | First |', '  |---|---|---|---|---|'); for (const v of x.axe) L.push(`  | ${v.id} | ${v.impact} | ${v.nodes} | ${v.help} | \`${v.first}\` |`); L.push(''); }
    serious += x.axe.filter(v => /serious|critical/.test(v.impact)).length;
  }
  L.push(x.contrast.length ? `- ✗ Contrast (1.4.3): ${x.contrast.length} text element(s) below the minimum, e.g. ${x.contrast.slice(0, 4).map(c => `"${c.text}" ${c.ratio}:1 (needs ${c.need})`).join('; ')}` : '- ✓ Contrast (1.4.3): rendered text passes.');
  serious += x.contrast.length ? 1 : 0;
  const fo = x.focus;
  L.push(`- Keyboard: ${fo.order.length} stops by Tab${fo.order.length ? `: ${fo.order.slice(0, 8).join(' → ')}${fo.order.length > 8 ? ' → …' : ''}` : ' (nothing focusable: is the page usable by keyboard?)'}`);
  if (fo.noIndicator.length) { L.push(`  - ✗ No visible focus indicator (2.4.7): ${fo.noIndicator.slice(0, 6).join(', ')}`); serious++; }
  if (fo.covered.length) { L.push(`  - ✗ Focus hidden under sticky or fixed content (2.4.11): ${fo.covered.slice(0, 6).join(', ')}`); serious++; }
  if (fo.trapped) { L.push(`  - ✗ Focus stuck on ${fo.trapped} (2.1.2)`); serious++; }
  L.push(x.moving.length ? `- ✗ Still moving with Reduce Motion on (2.3.3): ${[...new Set(x.moving)].slice(0, 6).join(', ')}` : '- ✓ Nothing moves with Reduce Motion on.');
  serious += x.moving.length ? 1 : 0;
  const sideways = x.reflow && x.reflow.scrollWidth > x.reflow.width + 1;
  L.push(sideways ? `- ✗ Reflow (1.4.10): at 320px wide the page is ${x.reflow.scrollWidth}px: it scrolls sideways` : '- ✓ Reflow (1.4.10): nothing scrolls sideways at 320px.');
  serious += sideways ? 1 : 0;
  L.push(x.spacing.length ? `- ? Text spacing (1.4.12): clipped with the spacing overrides: ${x.spacing.slice(0, 5).join(', ')}` : '- ✓ Text spacing (1.4.12): nothing clipped.');
  L.push('');
}
L.push('This finds what a browser can measure. Whether names make sense, the reading order, and what a screen reader says still need a person: references/testing.md.');
console.log(L.join('\n'));
if (args.includes('--strict') && serious) { console.log(`\n✗ ${serious} serious finding(s).`); process.exit(1); }
