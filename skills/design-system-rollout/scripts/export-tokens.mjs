#!/usr/bin/env node
// Export the app's CSS custom properties as a Claude Design system's
// tokens.json: every family a LIST of {name, value, usage}, colours per theme.
// The values come from the code, so the design file and the app can't disagree
// about what "primary text" is.
//
//   node export-tokens.mjs                 # writes claude-design/tokens.json, prints a report
//   node export-tokens.mjs --out <file>
//
// Reads the `claudeDesign` block of design-system.config.json (see assets/).
// A trailing comment on a declaration becomes its usage note.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadConfig } from './lib.mjs';

const cfg = loadConfig();
const cd = {
  name: 'Design system',
  themes: { light: [':root'], dark: ['.dark'] },
  include: ['--'],
  prefixes: { type: cfg.typeTokenPrefix, radius: '--radius-', spacing: '--space-', shadow: '--shadow-', font: '--font-' },
  ...cfg.claudeDesign,
};
cd.prefixes = { type: cfg.typeTokenPrefix, radius: '--radius-', spacing: '--space-', shadow: '--shadow-', font: '--font-', ...cfg.claudeDesign?.prefixes };
const outArg = process.argv.indexOf('--out');
const out = join(cfg.root, outArg > 0 ? process.argv[outArg + 1] : 'claude-design/tokens.json');

// ── 1. Declarations per theme, from the selector each block sits under ──
// A block nested in @media/@supports is skipped unless the theme lists that
// at-rule itself (e.g. "@media (prefers-color-scheme: dark)"): a phone-only
// override is not a theme.
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const themeOf = {};
for (const [theme, sels] of Object.entries(cd.themes)) for (const s of sels) themeOf[norm(s)] = theme;
const themeIds = Object.keys(cd.themes);

const decl = {};   // name → { theme → raw value }
const usage = {};  // name → comment
for (const f of cfg.tokenFiles) {
  const css = readFileSync(join(cfg.root, f), 'utf8');
  const stack = [];
  let buf = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const text = css.slice(i + 2, end).trim();
      // A comment right after `--x: y;` on the same line is that token's note.
      const m = buf.match(/(--[\w-]+)\s*:[^;]*;\s*$/) || css.slice(Math.max(0, i - 200), i).match(/(--[\w-]+)\s*:[^;\n]*;[ \t]*$/);
      if (m && !usage[m[1]]) usage[m[1]] = text;
      i = end + 1;
      continue;
    }
    if (c === '{') { stack.push(norm(buf)); buf = ''; continue; }
    if (c === '}') { flush(); stack.pop(); buf = ''; continue; }
    if (c === ';') { flush(buf + ';'); buf = ''; continue; }
    buf += c;
  }
  function flush(text = buf) {
    const m = text.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/);
    if (!m) return;
    const ats = stack.filter(s => s.startsWith('@') && !s.startsWith('@layer'));
    const sel = [...stack].reverse().find(s => !s.startsWith('@'));
    const key = ats.length ? norm(ats.join(' ')) : sel;
    const theme = themeOf[key] ?? (ats.length ? undefined : themeOf[sel]);
    if (!theme) return;
    if (!cd.include.some(p => m[1].startsWith(p))) return;
    (decl[m[1]] ??= {})[theme] ??= m[2].trim();
  }
}

// ── 2. Resolve and classify ──
const COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch)\([^()]*\))$/i;
const raw = (name, theme) => decl[name]?.[theme] ?? decl[name]?.[themeIds[0]];
function resolve(name, theme, seen = new Set()) {
  let v = raw(name, theme);
  for (let n = 0; v && n < 10; n++) {
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
    if (!m) break;
    if (seen.has(m[1])) return undefined;
    seen.add(m[1]);
    v = raw(m[1], theme) ?? m[2];
  }
  return v;
}
const toPx = (v) => { const m = String(v).match(/^([\d.]+)rem$/); return m ? `${+(m[1] * 16).toFixed(2)}px` : v; };
const tokName = (n) => n.replace(/^--/, '');
const note = (n) => usage[n] ?? '';

const t = {
  name: cd.name, version: 1,
  meta: { source: `code: ${cfg.tokenFiles.join(', ')}`, exportedAt: new Date().toISOString() },
  color: { themes: themeIds.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })), tokens: [] },
  type: { fonts: [], families: {}, groups: [{ name: 'Text', family: 'sans', styles: [] }] },
  spacing: { tokens: [] }, radius: { tokens: [] }, shadow: { tokens: [] },
};
const skipped = [];
const p = cd.prefixes;
// Each family takes one prefix or a list of them.
const match = (key, name) => [].concat(p[key] ?? []).find(x => x && name.startsWith(x));
for (const name of Object.keys(decl)) {
  const first = resolve(name, themeIds[0]);
  if (first === undefined) { skipped.push(`${name}: unresolved`); continue; }
  const entry = (value) => ({ name: tokName(name), value, usage: note(name) });
  if (match('type', name)) {
    t.type.groups[0].styles.push({ name: tokName(name).slice(tokName(match('type', name)).length), fontSize: toPx(first), ...(note(name) && { usage: note(name) }) });
  } else if (match('font', name)) {
    t.type.families[tokName(name).slice(tokName(match('font', name)).length)] = first;
  } else if (match('radius', name)) t.radius.tokens.push(entry(toPx(first)));
  else if (match('spacing', name)) t.spacing.tokens.push(entry(toPx(first)));
  else if (match('shadow', name)) t.shadow.tokens.push(entry(first));
  else if (COLOR.test(first)) {
    // Keep an alias when the source is one (`var(--brand)` → "{brand}"), so the
    // design file shows the same relationship the code has.
    const value = {};
    for (const th of themeIds) {
      const r = raw(name, th);
      const alias = r?.match(/^var\(\s*(--[\w-]+)\s*\)$/);
      const v = alias && COLOR.test(resolve(alias[1], th) ?? '') ? `{${tokName(alias[1])}}` : resolve(name, th);
      if (v && (COLOR.test(v) || v.startsWith('{'))) value[th] = v;
    }
    t.color.tokens.push({ name: tokName(name), value, usage: note(name) });
  } else skipped.push(`${name}: ${first}`);
}
// The first family is "sans" for the type group; name it whatever the code calls its body face.
const fam = Object.keys(t.type.families);
if (fam.length && !t.type.families.sans) t.type.groups[0].family = fam[0];
// An alias of a token that didn't make the export drops silently in the page: resolve it instead.
const have = new Set(t.color.tokens.map(x => x.name));
for (const tok of t.color.tokens) for (const th of Object.keys(tok.value))
  if (tok.value[th].startsWith('{') && !have.has(tok.value[th].slice(1, -1))) tok.value[th] = resolve('--' + tok.name, th);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(t, null, 2) + '\n');

const all = [...t.color.tokens, ...t.spacing.tokens, ...t.radius.tokens, ...t.shadow.tokens];
const noUsage = all.filter(x => !x.usage).map(x => x.name);
console.log(`# Token export → ${out.replace(cfg.root + '/', '')}\n`);
console.log(`| Family | Count |\n|---|---|`);
console.log(`| colour (${themeIds.join(' / ')}) | ${t.color.tokens.length} |\n| type styles | ${t.type.groups[0].styles.length} |\n| font families | ${fam.length} |\n| spacing | ${t.spacing.tokens.length} |\n| radius | ${t.radius.tokens.length} |\n| shadow | ${t.shadow.tokens.length} |`);
if (noUsage.length) console.log(`\n**${noUsage.length} tokens have no usage note.** Write one for each before publishing (a trailing comment in the CSS is picked up next time):\n${noUsage.join(', ')}`);
if (skipped.length) console.log(`\n**Not exported** (not a colour, length or shadow, or not resolvable):\n${skipped.map(s => '- ' + s).join('\n')}`);
if (!Object.keys(decl).length) { console.log('\nNo tokens found: check `tokenFiles` and `claudeDesign.themes` selectors.'); process.exit(1); }
