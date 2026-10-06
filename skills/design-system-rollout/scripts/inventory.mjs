#!/usr/bin/env node
/**
 * inventory — the first hour of a design-system rollout, in one command.
 *
 * Counts every way the project currently does each UI job (type sizes,
 * colours, radii, spacing, buttons, cards, pills, dialogs, form fields…) and
 * how many *variants* of each exist. "Count the variants before designing the
 * component": twenty primary-button recipes usually means the answer is two
 * sizes, not a component with every knob. The report is the input to the
 * decisions sheet (references/decisions.md) and the kit plan.
 *
 *   node inventory.mjs                    # report to stdout
 *   node inventory.mjs --out ds-inventory.md
 *   node inventory.mjs --json             # machine-readable, for diffing later
 *
 * Run from the project root. Reads design-system.config.json if present;
 * otherwise guesses src dirs (src, app, components, pages).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { loadConfig, sourceFiles, classStrings, isComment, isKit, readTokens, loadModule, flatten } from './lib.mjs';
import { styleBlocks, literal, isTokenRef, FAMILY, touchables, count } from './rn.mjs';
import { titleCaseWords } from './check-writing.mjs';

const args = process.argv.slice(2);
const cfg = loadConfig();
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const JSON_OUT = args.includes('--json');

const tally = () => new Map();
const bump = (m, k, file) => { const e = m.get(k) ?? { n: 0, files: new Set(), perFile: new Map() }; e.n++; e.files.add(file); e.perFile.set(file, (e.perFile.get(file) ?? 0) + 1); m.set(k, e); };

const T = {
  typeClass: tally(), typeArbitrary: tally(), typeInline: tally(), typeCss: tally(),
  weight: tally(), tracking: tally(), radius: tally(), shadow: tally(),
  hex: tally(), paletteColour: tally(), greyText: tally(),
  padding: tally(), gap: tally(), margin: tally(),
  buttonRecipe: tally(), cardRecipe: tally(), pillRecipe: tally(),
};
const C = { // counts of hand-built UI by job
  'raw <button>': tally(), 'raw form field (<input>/<select>/<textarea>)': tally(),
  'overlay (fixed inset-0 / createPortal)': tally(), 'spinner (animate-spin / fa-spin)': tally(),
  'hand-built uppercase label': tally(), 'hand-built step counter ("Step 2 of 4")': tally(),
  'raw <table>': tally(), 'inline style colour/size': tally(), 'progress bar drawn by hand': tally(),
  'class that cannot exist (e.g. gray-150)': tally(),
};
const W = { titleCase: tally(), exclaim: tally(), dots: tally(), arrow: tally() };
const files = [];

// ── React Native: style objects instead of class names ──
const N = { fontSize: tally(), lineHeight: tally(), fontWeight: tally(), letterSpacing: tally(), radius: tally(), gap: tally(), padding: tally(), margin: tally(), height: tally(), colour: tally() };
const viaToken = Object.fromEntries(Object.keys(N).map(k => [k, 0]));
const NC = { 'hand-built touchable (Pressable / Touchable*)': tally(), 'touchable with no label and no text (screen readers say "button")': tally(), 'raw <Text> outside the kit': tally(), 'raw <TextInput>': tally(), 'raw <Modal>': tally(), 'raw <ActivityIndicator>': tally(), 'text style with a size but no font family (falls back to the system font)': tally() };
let usesCustomFont = false;
function scanNative(f) {
  for (const b of styleBlocks(f.text)) {
    for (const [k, v] of Object.entries(b.props)) {
      const fam = FAMILY(k);
      if (!fam || !N[fam]) { if (k === 'fontFamily') usesCustomFont = true; continue; }
      const lit = literal(v);
      if (lit !== null) bump(N[fam], String(lit), f.rel);
      else if (isTokenRef(v)) viaToken[fam]++;
    }
    if (b.props.fontSize && !b.props.fontFamily) bump(NC['text style with a size but no font family (falls back to the system font)'], `line ${b.line}`, f.rel);
  }
  for (const t of touchables(f.text)) {
    bump(NC['hand-built touchable (Pressable / Touchable*)'], t.tag, f.rel);
    if (!t.labelled && !t.hasText) bump(NC['touchable with no label and no text (screen readers say "button")'], `line ${t.line}`, f.rel);
  }
  for (const [label, re] of [['raw <Text> outside the kit', /<Text\b/g], ['raw <TextInput>', /<TextInput\b/g], ['raw <Modal>', /<Modal\b/g], ['raw <ActivityIndicator>', /<ActivityIndicator\b/g]])
    for (let n = count(f.text, re); n > 0; n--) bump(NC[label], label, f.rel);
}

const strip = (c) => c.split(/\s+/).filter(Boolean).filter(x => !/^(hover|focus|active|disabled|group-hover|focus-visible|dark|sm|md|lg|xl|2xl|aria-[\w-]+|data-[\w-]+):/.test(x));
const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/;
const PAD = /^-?(p|px|py|pt|pb|pl|pr)-([\w.[\]]+)$/;
const GAP = /^(gap|gap-x|gap-y|space-x|space-y)-([\w.[\]]+)$/;
const MAR = /^-?(m|mx|my|mt|mb|ml|mr)-([\w.[\]]+)$/;
const SMALL = new Set('a an the and or to of in on for with by as at from vs per is it your our my'.split(' '));

for (const f of sourceFiles(cfg)) {
  if (isKit(cfg, f.rel) || f.rel === cfg.tokenModule || cfg.tokenFiles.includes(f.rel)) continue; // the kit and the tokens are allowed raw values; count the screens
  files.push(f.rel);
  if (cfg.stack === 'react-native') scanNative(f);
  const lines = f.text.split('\n');
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    const ctx = lines.slice(i, i + 4).join(' ');
    for (const cls of classStrings(line)) {
      const parts = strip(cls);
      for (const p of parts) {
        if (SIZE.test(p)) bump(T.typeClass, p, f.rel);
        let m;
        if ((m = p.match(/^text-\[(\d+(?:\.\d+)?)(px|rem|em)\]$/))) bump(T.typeArbitrary, m[1] + m[2], f.rel);
        if ((m = p.match(/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/))) bump(T.weight, p, f.rel);
        if (/^tracking-/.test(p)) bump(T.tracking, p, f.rel);
        if (/^rounded(-|$)/.test(p) && !/^rounded-(t|b|l|r|tl|tr|bl|br)-/.test(p)) bump(T.radius, p, f.rel);
        if (/^shadow(-|$)/.test(p)) bump(T.shadow, p, f.rel);
        if ((m = p.match(/^(?:text|bg|border|ring|from|to|via|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d{2,3})/))) bump(T.paletteColour, `${m[1]}-${m[2]}`, f.rel);
        if (/^text-(gray|slate|zinc|neutral|stone)-\d+/.test(p)) bump(T.greyText, p, f.rel);
        // Tailwind's palette has 50, 100…900, 950. Anything else builds no CSS, silently.
        if ((m = p.match(/^(?:text|bg|border|ring|from|to|via|fill|stroke|divide|outline)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d+)(?:\/\d+)?$/)) && !['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].includes(m[1]))
          bump(C['class that cannot exist (e.g. gray-150)'], p, f.rel);
        if ((m = p.match(PAD))) bump(T.padding, m[2], f.rel);
        if ((m = p.match(GAP))) bump(T.gap, m[2], f.rel);
        if ((m = p.match(MAR))) bump(T.margin, m[2], f.rel);
        if (p === 'uppercase') bump(C['hand-built uppercase label'], 'uppercase', f.rel);
        if (p === 'animate-spin') bump(C['spinner (animate-spin / fa-spin)'], p, f.rel);
      }
      const set = new Set(parts);
      // A panel: surface + border + radius on one element.
      // Any surface + border + a non-pill radius: project tokens (rounded-ds-card) count too.
      if ([...set].some(p => /^bg-(?!transparent|none|clip|cover|center|no-repeat|gradient)/.test(p)) && [...set].some(p => /^border(-[blrtxy])?$/.test(p)) && [...set].some(p => /^rounded-(?!full|none|sm$|t-|b-|l-|r-)/.test(p)))
        bump(T.cardRecipe, [...set].filter(p => /^(bg|border|rounded|shadow|p|px|py)(-|$)/.test(p)).sort().join(' '), f.rel);
      // A pill: fully rounded and padded on both axes.
      if (set.has('rounded-full') && [...set].some(p => /^px-/.test(p)) && [...set].some(p => /^py-/.test(p)))
        bump(T.pillRecipe, [...set].filter(p => /^(px|py|text|font|rounded|bg|border)(-|$)/.test(p)).sort().join(' '), f.rel);
      if (set.has('rounded-full') && set.has('overflow-hidden') && [...set].some(p => /^h-(0\.5|1|1\.5|2|2\.5|3)$/.test(p)))
        bump(C['progress bar drawn by hand'], 'track', f.rel);
    }
    // Buttons: the recipe is the class string, minus interaction states.
    if (/<button\b/.test(line)) {
      bump(C['raw <button>'], 'button', f.rel);
      const cls = classStrings(ctx)[0];
      if (cls) bump(T.buttonRecipe, strip(cls).filter(p => /^(px|py|p|h|text|font|rounded|bg|border|shadow)(-|$)/.test(p)).sort().join(' '), f.rel);
    }
    if (/<(input|select|textarea)\b/.test(line) && !/type=["']?(file|hidden|checkbox|radio)/.test(ctx)) bump(C['raw form field (<input>/<select>/<textarea>)'], 'field', f.rel);
    if (/\bfixed inset-0\b|\bcreatePortal\(/.test(line)) bump(C['overlay (fixed inset-0 / createPortal)'], 'overlay', f.rel);
    if (/\bfa-spin\b/.test(line)) bump(C['spinner (animate-spin / fa-spin)'], 'fa-spin', f.rel);
    if (/Step \{[^}]+\} of \{|Step \d+ of \d+/.test(line)) bump(C['hand-built step counter ("Step 2 of 4")'], 'step', f.rel);
    if (/<table[\s>]/.test(line)) bump(C['raw <table>'], 'table', f.rel);
    if (/style=\{\{[^}]*(fontSize|color|background|fontWeight)/.test(line)) bump(C['inline style colour/size'], 'style', f.rel);
    let m;
    if ((m = line.match(/fontSize:\s*['"]?(\d+(?:\.\d+)?(?:px|rem|em)?)/))) bump(T.typeInline, m[1], f.rel);
    if ((m = line.match(/font-size:\s*(\d+(?:\.\d+)?(?:px|rem|em))/))) bump(T.typeCss, m[1], f.rel);
    for (const h of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) bump(T.hex, h[0].toLowerCase(), f.rel);
    // Words on screen: JSX text between tags.
    for (const t of line.matchAll(/>\s*([A-Za-z][^<>{}]{2,60}?)\s*</g)) {
      const text = t[1].trim();
      const words = text.split(/\s+/);
      if (words.length >= 2 && words.length <= 6 && titleCaseWords(text).length && !/[.?=;]|\bnew [A-Z]/.test(text))
        bump(W.titleCase, text, f.rel);
      if (/!\s*$/.test(text)) bump(W.exclaim, text, f.rel);
      if (/\.\.\./.test(text)) bump(W.dots, text, f.rel);
      if (/→|->/.test(text)) bump(W.arrow, text, f.rel);
    }
  });
}

const total = (m) => [...m.values()].reduce((a, e) => a + e.n, 0);
const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n);
const fileList = (m, n = 5) => {
  const per = new Map();
  for (const [, e] of m) for (const [f, k] of e.perFile) per.set(f, (per.get(f) ?? 0) + k);
  return [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([f, k]) => `${f} (${k})`).join(', ');
};


const L = [];
const row = (label, m, unit = 'variants') => L.push(`| ${label} | ${total(m)} | ${m.size} ${unit} |`);
L.push(`# Design inventory`, '', `Scanned ${files.length} files in ${cfg.srcDirs.join(', ') || '(no src dirs found — set srcDirs in design-system.config.json)'}${cfg.kitDir ? `, excluding the kit (${cfg.kitDir})` : ''}.`, '',
  `**Stack: ${cfg.stack}**${cfg.stack === 'react-native' ? ' (style objects and StyleSheet values are read; class-name counts below don\'t apply)' : ''}. Set "stack" in design-system.config.json if that's wrong.`, '');
if (cfg.stack === 'react-native') {
  // A custom font anywhere (the kit, the tokens) means a size with no family falls back to the system font.
  usesCustomFont ||= [...sourceFiles(cfg)].some(f => /fontFamily\s*:/.test(f.text));
  L.push('## At a glance (React Native)', '', '| What | Literal uses | Distinct values | Via a token |', '|---|---|---|---|');
  for (const [k, label] of [['fontSize', 'Font sizes'], ['lineHeight', 'Line heights'], ['fontWeight', 'Font weights'], ['letterSpacing', 'Letter-spacing'], ['radius', 'Corner radii'], ['gap', 'Gaps'], ['padding', 'Padding'], ['margin', 'Margins'], ['height', 'Heights (controls, rows)'], ['colour', 'Colours (hex / rgba)']])
    L.push(`| ${label} | ${total(N[k])} | ${N[k].size} | ${viaToken[k]} |`);
  L.push('', '## Hand-built UI (React Native)', '', '| Job | Count | Worst files |', '|---|---|---|');
  for (const [k, m] of Object.entries(NC)) if (k !== 'text style with a size but no font family (falls back to the system font)' || usesCustomFont) L.push(`| ${k} | ${total(m)} | ${fileList(m)} |`);
}
const web = cfg.stack !== 'react-native';   // class-name tables would print zeros that mean "couldn't look"
if (web) L.push('## At a glance', '', '| What | Uses | Distinct |', '|---|---|---|');
if (web) { row('Font size classes (text-xs…)', T.typeClass); row('Arbitrary font sizes (text-[13px])', T.typeArbitrary); }
if (web) { row('Inline / CSS font sizes', new Map([...T.typeInline, ...T.typeCss])); row('Font weights', T.weight);
row('Letter-spacing (tracking-*)', T.tracking); row('Radii', T.radius); row('Shadows', T.shadow);
row('Raw hex colours', T.hex); row('Palette colours (red-500…)', T.paletteColour); row('Raw grey text', T.greyText);
row('Padding values', T.padding); row('Gap / space values', T.gap); row('Margin values', T.margin);
row('Button recipes', T.buttonRecipe, 'recipes'); row('Card / panel recipes', T.cardRecipe, 'recipes'); row('Pill recipes', T.pillRecipe, 'recipes');
L.push('', '## Hand-built UI by job', '', '| Job | Count | Worst files |', '|---|---|---|');
for (const [k, m] of Object.entries(C)) L.push(`| ${k} | ${total(m)} | ${fileList(m)} |`); }
L.push('', '## Words', '', '| Pattern | Count | Examples |', '|---|---|---|');
for (const [k, label] of [['titleCase', 'Title Case labels'], ['exclaim', 'Exclamation marks'], ['dots', '"..." instead of "…"'], ['arrow', 'Typed arrows']])
  L.push(`| ${label} | ${total(W[k])} | ${top(W[k], 3).map(([t]) => `"${t}"`).join(', ')} |`);

const detail = (title, m, n, note) => {
  if (!m.size) return;
  L.push('', `## ${title}`, ...(note ? ['', note] : []), '', '| Value | Uses | Files |', '|---|---|---|');
  for (const [k, e] of top(m, n)) L.push(`| \`${k || '(none)'}\` | ${e.n} | ${e.files.size} |`);
  if (m.size > n) L.push(`| …and ${m.size - n} more | | |`);
};
if (web) detail('Font sizes in use', new Map([...T.typeClass, ...T.typeArbitrary, ...T.typeInline, ...T.typeCss]), 20, 'Near-misses (11px beside 11.5px beside 12px) are the drift to look for. A scale needs about 6–8 rungs, named by role.');
if (web) detail('Button recipes', T.buttonRecipe, 15, 'Each line is one way a button was styled. Usually collapses to 2 sizes × 3–4 variants.');
if (web) detail('Card / panel recipes', T.cardRecipe, 10);
if (web) detail('Pill recipes', T.pillRecipe, 10);
if (web) detail('Radii', T.radius, 12);
if (web) detail('Padding values', T.padding, 15, 'A spacing scale usually needs 5 rungs between things (e.g. 6 · 8 · 12 · 16 · 20) and 3–4 insets for panels.');
if (web) detail('Gap / space values', T.gap, 15);
detail('Raw hex colours', T.hex, 20, 'Each needs a token, or a `token-exempt` note if it is per-datum (chart series, persona colours).');
if (web) detail('Palette colours', T.paletteColour, 20, 'Status colours picked per screen. Map to tones: success, warning, danger, info.');
detail('Title Case labels (sample)', W.titleCase, 15);
if (cfg.stack === 'react-native') {
  detail('Font sizes in use (React Native)', N.fontSize, 25, 'Near-misses (14 beside 14.5 beside 15) are the drift. A scale needs about 6–8 sizes, named by role.');
  detail('Line heights in use', N.lineHeight, 15);
  detail('Corner radii in use', N.radius, 15);
  detail('Gaps in use', N.gap, 15);
  detail('Padding in use', N.padding, 15);
  detail('Heights in use', N.height, 15, 'Rows and controls. Pick 2–3 standard control heights (at least 44 for anything tappable).');
}

// ── Defined but never used: tokens nobody reaches for ──
const unused = [];
const allSrc = [...sourceFiles(cfg, { extensions: [...cfg.extensions, '.css', '.scss'] })].map(f => f.text).join('\n');
if (cfg.stack === 'react-native' && cfg.tokenModule) {
  try {
    const mod = await loadModule(cfg, cfg.tokenModule);
    const flat = flatten(Object.fromEntries(Object.entries(mod).filter(([k]) => k !== 'default')));
    const tokenSrc = readFileSync(join(cfg.root, cfg.tokenModule), 'utf8');
    const rest = allSrc.replace(tokenSrc, '');
    for (const path of Object.keys(flat)) {
      const [last, parent] = path.split('.').reverse();
      const used = new RegExp(`\\b${parent ?? ''}\\??\\.${last}\\b|\\[['"]${last}['"]\\]`).test(rest);
      if (!used) unused.push(path);
    }
  } catch (e) { L.push('', `_Unused tokens not checked: ${e.message}_`); }
} else if (cfg.stack !== 'react-native') {
  const tw = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'].map(f => join(cfg.root, f)).filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n');
  for (const name of Object.keys(readTokens(cfg))) if (!new RegExp(`var\\(\\s*${name}\\b`).test(allSrc + tw)) unused.push(name);
}
if (unused.length) L.push('', '## Tokens defined but never used', '', `${unused.length} tokens nobody reaches for. Either the screens hardcode their values (compare with the counts above), or the token can go: ${unused.slice(0, 40).map(u => `\`${u}\``).join(', ')}${unused.length > 40 ? ' …' : ''}`);

// ── Files nothing imports: dead components still on the old look ──
const imported = new Set();
for (const m of allSrc.matchAll(/(?:from\s+|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g)) imported.add(basename(m[1]).replace(/\.[jt]sx?$/, ''));
const routesDir = cfg.routesDir ?? (cfg.stack === 'react-native' ? 'app' : null);
const dead = files.filter(rel => !/(^|\/)(index|App|main|_layout|\+[\w-]+)\.[jt]sx?$/.test(rel) && !(routesDir && rel.startsWith(routesDir + '/')) && !imported.has(basename(rel, extname(rel))));
if (dead.length) L.push('', '## Files nothing imports', '', `Probably dead: old components still on the old look. Check each one (a dynamic import or a route file can look unused), then delete it rather than migrate it: ${dead.slice(0, 30).map(d => `\`${d}\``).join(', ')}${dead.length > 30 ? ' …' : ''}`);

// ── Zeros that mean "couldn't look" ──
const shapeZero = total(T.radius) + total(T.padding) + total(T.gap) + total(T.buttonRecipe) + total(T.cardRecipe) === 0;
if (cfg.stack !== 'react-native' && shapeZero && files.length > 5)
  L.splice(6, 0, `> ⚠ **No radii, padding, gaps, buttons or cards were found in ${files.length} files.** That almost always means this scan can't read how the project styles its UI (stack detected: ${cfg.stack}), not that it's clean. Check "stack" in the config before trusting any zero below.`, '');

if (JSON_OUT) {
  const obj = { stack: cfg.stack, files: files.length, unusedTokens: unused.length, deadFiles: dead.length };
  for (const [k, m] of Object.entries({ ...T, ...C, ...W })) obj[k] = { total: total(m), variants: m.size };
  if (cfg.stack === 'react-native') {
    for (const [k, m] of Object.entries(N)) obj[`native.${k}`] = { total: total(m), variants: m.size, viaToken: viaToken[k] };
    for (const [k, m] of Object.entries(NC)) obj[`native.${k}`] = { total: total(m), variants: m.size };
  }
  console.log(JSON.stringify(obj, null, 2));
  process.exit(0);
}
const report = L.join('\n') + '\n';
if (OUT) { writeFileSync(OUT, report); console.log(`Wrote ${OUT} (${files.length} files scanned).`); }
else process.stdout.write(report);
