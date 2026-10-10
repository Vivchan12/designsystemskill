#!/usr/bin/env node
/**
 * contrast: WCAG 2.2 contrast ratios for a project's colours, in every theme.
 *
 *   node contrast.mjs                    # the pairs in a11y.config.json, plus a check of every text × surface token
 *   node contrast.mjs '#767676' '#fff'   # one pair
 *   node contrast.mjs --json
 *   node contrast.mjs --strict           # exit 1 if a declared pair fails (CI)
 *
 * The maths is WCAG's own (Understanding 1.4.3, "relative luminance"):
 *   L = 0.2126 R + 0.7152 G + 0.0722 B, each channel linearised with the 0.04045 threshold
 *   ratio = (L1 + 0.05) / (L2 + 0.05), never rounded: 4.499:1 fails 4.5:1.
 * A translucent colour is composited over what's behind it first.
 *
 * Thresholds (WCAG 2.2 AA):
 *   text   4.5:1  (1.4.3)   body text, labels, placeholders
 *   large  3:1    (1.4.3)   at least 24px, or 18.66px bold (18pt / 14pt bold)
 *   ui     3:1    (1.4.11)  borders of inputs, icons that carry meaning, focus rings, the check in a checkbox
 * Disabled controls and pure decoration have no requirement.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Colour parsing ──
const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', maroon: '#800000', orange: '#ffa500', yellow: '#ffff00', purple: '#800080', navy: '#000080', teal: '#008080',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', dimgray: '#696969', whitesmoke: '#f5f5f5',
  gainsboro: '#dcdcdc', crimson: '#dc143c', tomato: '#ff6347', gold: '#ffd700', transparent: 'rgba(0,0,0,0)' };

/** {r,g,b,a} with r,g,b 0–255 and a 0–1, or null. */
export function parseColor(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(\s*([^)]*)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const ch = (v) => v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v);
    const a = p[3] === undefined ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    return { r: ch(p[0]), g: ch(p[1]), b: ch(p[2]), a };
  }
  m = s.match(/^hsla?\(\s*([^)]*)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const h = parseFloat(p[0]), sat = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100;
    const a = p[3] === undefined ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    return { ...hslToRgb(h, sat, l), a };
  }
  return null;
}
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
export const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** A colour with alpha, laid over an opaque one. */
export function composite(top, under) {
  const a = top.a ?? 1;
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
}
export function luminance({ r, g, b }) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio of fg on bg. A translucent bg sits on `base` (white unless given). Not rounded. */
export function contrast(fg, bg, base = { r: 255, g: 255, b: 255, a: 1 }) {
  const B = typeof bg === 'string' ? parseColor(bg) : bg, F = typeof fg === 'string' ? parseColor(fg) : fg;
  if (!B || !F) return null;
  const back = (B.a ?? 1) < 1 ? composite(B, base) : B;
  const front = (F.a ?? 1) < 1 ? composite(F, back) : F;
  const [l1, l2] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
export const NEED = { text: 4.5, large: 3, ui: 3 };
export const passes = (ratio, use = 'text') => ratio >= NEED[use];   // no rounding, as WCAG says
/** WCAG "large scale": 18pt (24px) or 14pt (18.66px) bold. */
export const isLarge = (px, weight = 400) => px >= 24 || (px >= 18.66 && Number(weight) >= 700);

/** The nearest colour to fg (same hue) that passes on bg: darker on a light background, lighter on a dark one. */
export function suggest(fg, bg, use = 'text') {
  const F = parseColor(fg), B = parseColor(bg);
  if (!F || !B) return null;
  const hsl = rgbToHsl(F), dir = luminance(B) > 0.18 ? -1 : 1;
  for (let i = 1; i <= 100; i++) {
    const l = Math.max(0, Math.min(1, hsl.l + dir * i / 100));
    const c = { ...hslToRgb(hsl.h, hsl.s, l), a: 1 };
    // Round to a real hex before testing: the hex is what gets used.
    const hex = toHex(c);
    if (passes(contrast(hex, B), use)) return hex;
    if (l === 0 || l === 1) break;
  }
  return null;
}

// ── Reading a project's colours ──
function matchBrace(t, i) { let d = 0; for (let j = i; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) return j; } return t.length - 1; }
/** CSS custom properties per theme. `themes` maps a theme to the selectors (or @media) that define it. */
export function cssTokens(text, themes) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];   // { context: '@media … ' + selector, body }
  (function scan(t, ctx) {
    let i = 0;
    while (i < t.length) {
      const open = t.indexOf('{', i); if (open < 0) break;
      const head = t.slice(i, open).trim().split(/[;}]/).pop().trim();
      const close = matchBrace(t, open), body = t.slice(open + 1, close);
      if (head.startsWith('@')) scan(body, `${ctx}${head} `); else blocks.push({ ctx: `${ctx}${head}`, body });
      i = close + 1;
    }
  })(text, '');
  const out = {};
  for (const [theme, sels] of Object.entries(themes)) {
    out[theme] = {};
    for (const b of blocks) {
      const ctxNorm = b.ctx.replace(/\s+/g, ' ');
      if (!sels.some(s => ctxNorm === s || ctxNorm.split(',').map(x => x.trim()).includes(s) || (s.startsWith('@') && ctxNorm.startsWith(s)))) continue;
      for (const m of b.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) out[theme][m[1]] = m[2].trim();
    }
  }
  return out;
}
/** Colours in a JS/TS/JSON theme object, flattened to dotted paths (colors.text.primary). */
export function objectTokens(text) {
  const out = {}, stack = [];
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const re = /(?:(?:const|let|var)\s+([\w$]+)(?:\s*:[^=]+)?\s*=\s*\{)|(["']?)([\w$-]+)\2\s*:\s*(\{|(["'`])([^"'`]*)\5)|(\{)|(\})/g;
  for (const m0 of clean.matchAll(re)) {
    if (m0[1]) { stack.push(m0[1]); continue; }               // const colors = {
    if (m0[8]) { stack.pop(); continue; }
    if (m0[7]) { stack.push(''); continue; }                  // an anonymous { (export default {, a function body)
    const m = [m0[0], m0[2], m0[3], m0[4], m0[5], m0[6]];
    if (m[3] === '{') { stack.push(m[2]); continue; }
    if (parseColor(m[5])) out[[...stack, m[2]].filter(Boolean).join('.')] = m[5];
  }
  return out;
}
/** Resolve var(--x[, fallback]) and token references to a concrete colour string. */
export function resolve(value, vars, depth = 0) {
  if (value == null || depth > 10) return null;
  let v = String(value).trim();
  if (vars[v] !== undefined && !parseColor(v)) return resolve(vars[v], vars, depth + 1);   // a token name
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (m) return vars[m[1]] !== undefined ? resolve(vars[m[1]], vars, depth + 1) : m[2] ? resolve(m[2], vars, depth + 1) : null;
  // rgb(var(--x) / 0.5) style channel tokens are out of scope: say so rather than guess.
  return parseColor(v) ? v : null;
}

const FG_NAME = /(^|[-.])(text|ink|fg|foreground|content|muted|subtle|heading|body|label|link|placeholder)([-.]|$)/i;
const BG_NAME = /(^|[-.])(bg|background|surface|canvas|card|paper|page|panel|sheet|base|backdrop)([-.]|$)/i;

export function loadConfig(root = process.cwd()) {
  const f = join(root, 'a11y.config.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

/** Every declared pair, in every theme, plus the text × surface matrix. */
export function report(root = process.cwd(), cfg = loadConfig(root)) {
  const c = cfg.contrast ?? {};
  const themes = c.themes ?? { light: [':root'], dark: ['.dark', '[data-theme="dark"]', '@media (prefers-color-scheme: dark) :root'] };
  const vars = {};
  for (const name of Object.keys(themes)) vars[name] = {};
  for (const file of c.tokenFiles ?? []) {
    const p = join(root, file); if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    if (/\.(css|scss)$/.test(file)) {
      const t = cssTokens(text, themes);
      // A theme other than the first starts from the first theme's values, then overrides them.
      const first = Object.keys(themes)[0];
      for (const name of Object.keys(themes)) Object.assign(vars[name], name === first ? {} : t[first], t[name]);
    } else {
      const flat = objectTokens(text);
      for (const name of Object.keys(themes)) {
        // An object theme file: keys under a theme name (colors.dark.text) belong to that theme; others to all.
        for (const [k, v] of Object.entries(flat)) {
          const parts = k.split('.'), t = parts.find(p => themes[p]);
          const key = parts.filter(p => !themes[p]).join('.');
          if (!t || t === name) vars[name][key] = v;
        }
      }
    }
  }
  const rows = [];
  for (const [theme, v] of Object.entries(vars)) {
    if (!Object.keys(v).length && Object.keys(vars).length > 1 && theme !== Object.keys(vars)[0]) continue;
    for (const p of c.pairs ?? []) {
      const fg = resolve(p.fg, v), bg = resolve(p.bg, v), use = p.use ?? 'text';
      if (use === 'decor') continue;
      if (!fg || !bg) { rows.push({ theme, fg: p.fg, bg: p.bg, use, ratio: null, ok: null, declared: true, note: `couldn't resolve ${!fg ? p.fg : p.bg}` }); continue; }
      const ratio = contrast(fg, bg);
      rows.push({ theme, fg: p.fg, bg: p.bg, fgValue: fg, bgValue: bg, use, ratio, ok: passes(ratio, use), declared: true, why: p.why, fix: passes(ratio, use) ? null : suggest(fg, bg, use) });
    }
    if (c.matrix !== false) {
      const names = Object.keys(v);
      // "on-dark", "on-primary", "inverse" tokens are made for one particular background: pairing them with every surface is noise.
      const fgs = names.filter(n => FG_NAME.test(n) && !BG_NAME.test(n) && !/(^|[-.])on-|inverse|invert/i.test(n) && resolve(n, v));
      const bgs = names.filter(n => BG_NAME.test(n) && resolve(n, v));
      for (const f of fgs) for (const b of bgs) {
        if ((c.pairs ?? []).some(p => p.fg === f && p.bg === b)) continue;
        const ratio = contrast(resolve(f, v), resolve(b, v));
        if (ratio !== null && !passes(ratio, 'text')) rows.push({ theme, fg: f, bg: b, fgValue: resolve(f, v), bgValue: resolve(b, v), use: 'text', ratio, ok: false, declared: false, fix: suggest(resolve(f, v), resolve(b, v), 'text') });
      }
    }
  }
  return { rows, themes: Object.keys(vars), tokenCount: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, Object.keys(v).length])) };
}

const fmt = (r) => r === null ? '?' : (Math.floor(r * 100) / 100).toFixed(2) + ':1';   // floor, so a fail never displays as 4.50

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), vals = args.filter(a => !a.startsWith('--'));
  if (vals.length >= 2) {
    const r = contrast(vals[0], vals[1]);
    if (r === null) { console.error('✗ Not a colour I can read. Use hex, rgb(), hsl() or a CSS colour name.'); process.exit(2); }
    console.log(`${vals[0]} on ${vals[1]}: ${fmt(r)}`);
    for (const use of ['text', 'large', 'ui']) console.log(`  ${use.padEnd(5)} needs ${NEED[use]}:1  ${passes(r, use) ? '✓ pass' : `✗ fail  (nearest passing: ${suggest(vals[0], vals[1], use)})`}`);
    process.exit(0);
  }
  const { rows, themes, tokenCount } = report();
  if (flags.includes('--json')) { console.log(JSON.stringify({ themes, tokenCount, rows }, null, 2)); process.exit(0); }
  const declared = rows.filter(r => r.declared), matrix = rows.filter(r => !r.declared);
  const L = ['# Contrast', '', `Themes: ${themes.map(t => `${t} (${tokenCount[t]} tokens)`).join(', ')}. WCAG 2.2 AA: text 4.5:1, large text 3:1, UI parts 3:1. Ratios are not rounded.`, ''];
  if (!declared.length && !matrix.length) L.push('No colours found. Set `contrast.tokenFiles` and `contrast.pairs` in a11y.config.json (template in the skill\'s assets/).');
  if (declared.length) {
    L.push('## The pairs the app uses', '', '| Theme | Foreground | Background | Use | Ratio | | Nearest passing |', '|---|---|---|---|---|---|---|');
    for (const r of declared) L.push(`| ${r.theme} | \`${r.fg}\`${r.fgValue && r.fgValue !== r.fg ? ` ${r.fgValue}` : ''} | \`${r.bg}\`${r.bgValue && r.bgValue !== r.bg ? ` ${r.bgValue}` : ''} | ${r.use} | ${fmt(r.ratio)} | ${r.ok === null ? `? ${r.note}` : r.ok ? '✓' : '✗'} | ${r.fix ?? ''} |`);
    L.push('');
  }
  if (matrix.length) {
    L.push(`## Text and surface tokens that fail together (${matrix.length})`, '', 'Every text-like token on every surface-like token, by name. Not every combination is used: check the ones that are, and add them to `pairs` so CI holds them.', '', '| Theme | Text | Surface | Ratio | Nearest passing |', '|---|---|---|---|---|');
    for (const r of matrix.slice(0, 60)) L.push(`| ${r.theme} | \`${r.fg}\` ${r.fgValue} | \`${r.bg}\` ${r.bgValue} | ${fmt(r.ratio)} | ${r.fix ?? ''} |`);
    if (matrix.length > 60) L.push(`| … | ${matrix.length - 60} more (use --json) | | | |`);
  }
  console.log(L.join('\n'));
  const failing = declared.filter(r => r.ok === false).length;
  if (flags.includes('--strict') && failing) { console.log(`\n✗ ${failing} declared pair(s) below the WCAG minimum.`); process.exit(1); }
}
