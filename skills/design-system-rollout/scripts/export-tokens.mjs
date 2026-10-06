#!/usr/bin/env node
// Export the app's CSS custom properties as a Claude Design system's
// tokens.json: every family a LIST of {name, value, usage}, colours and
// shadows per theme, the type scale with weight and line height, and the
// font files. Also checks text contrast. The values come from the code, so
// the design file and the app can't disagree about what "primary text" is.
//
//   node scripts/design/export-tokens.mjs          # writes <out>/tokens.json, fonts/, canvas-fonts.css
//   node scripts/design/export-tokens.mjs --check  # report only, write nothing
//   node scripts/design/export-tokens.mjs --notes-stub  # the missing usage notes as JSON, to fill in
//
// Reads the `claudeDesign` block of design-system.config.json (template in
// the skill's assets/). Copy this file and lib.mjs into the project
// (scripts/design/), so every agent runs the same export.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig } from './lib.mjs';

const cfg = loadConfig();
const CHECK = process.argv.includes('--check') || process.argv.includes('--notes-stub');
const cd = {
  name: 'Design system',
  themes: { light: [':root'], dark: ['.dark'] },
  include: ['--'],
  exclude: [],
  notes: {},
  textStyles: {},
  fonts: [],
  contrast: null,
  out: 'claude-design',
  ...cfg.claudeDesign,
};
const P = { type: cfg.typeTokenPrefix, radius: '--radius-', spacing: '--space-', shadow: '--shadow-', font: '--font-', ...cfg.claudeDesign?.prefixes };
const folder = cd.folder ?? cd.name.toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^[-_]+|-+$/g, '');
const out = join(cfg.root, cd.out);
const problems = [];

// ── 1. Every declaration, with the scope it sits in and its own note ──
// Precedence comes from the config, not from file order: within a theme the
// LATER selector in its list wins, and every theme after the first sits on top
// of the first theme's list (`.dark .x` overrides `.x`, which overrides
// `:root`). Within one selector, later in the file wins, as in the browser.
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const themeIds = Object.keys(cd.themes);
const chain = (th) => (th === themeIds[0] ? cd.themes[th] : [...cd.themes[themeIds[0]], ...cd.themes[th]]).map(norm);

const decls = [];       // { name, value, keys: [scope], order, note }
const typeRules = [];   // { token, props } for rules that set font-size from a type token
for (const f of cfg.tokenFiles) {
  const css = readFileSync(join(cfg.root, f), 'utf8');
  const stack = [];     // block preludes
  const props = [];     // per open block: its plain declarations
  let buf = '', last = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      // A comment on the same line, after `--x: y;`, is that declaration's note.
      if (last && !css.slice(last.end + 1, i).includes('\n') && !last.note) last.note = css.slice(i + 2, end).replace(/\s+/g, ' ').trim();
      i = end + 1;
      continue;
    }
    if (c === '{') { stack.push(norm(buf)); props.push({}); buf = ''; last = null; continue; }
    if (c === '}') {
      take(buf, i);
      const p = props.pop();
      const fs = p['font-size']?.match(/^var\(\s*(--[\w-]+)/);
      if (fs) typeRules.push({ token: fs[1], props: p });
      stack.pop(); buf = ''; last = null;
      continue;
    }
    if (c === ';') { take(buf, i); buf = ''; continue; }
    buf += c;
  }
  function take(text, end) {
    const m = text.match(/^\s*([-\w]+)\s*:\s*([\s\S]+?)\s*$/);
    if (!m || !stack.length) return;
    if (!m[1].startsWith('--')) { props[props.length - 1][m[1]] = m[2]; return; }
    const ats = stack.filter(s => s.startsWith('@') && !s.startsWith('@layer'));
    const sel = [...stack].reverse().find(s => !s.startsWith('@')) ?? '';
    const keys = sel.split(',').map(s => norm([...ats, s].join(' ')));
    if (ats.length) keys.push(norm(ats.join(' ')));   // "@media (prefers-color-scheme: dark)" alone
    last = { name: m[1], value: m[2], keys, order: decls.length, end, note: '' };
    decls.push(last);
  }
}

const included = (n) => cd.include.some(p => n.startsWith(p)) && !cd.exclude.some(p => n.startsWith(p));
const winner = (name, th) => {
  const ch = chain(th);
  let best = null, bestRank = -1;
  for (const d of decls) {
    if (d.name !== name) continue;
    const rank = Math.max(...d.keys.map(k => ch.lastIndexOf(k)));
    if (rank < 0) continue;
    if (rank > bestRank || (rank === bestRank && d.order > best.order)) { best = d; bestRank = rank; }
  }
  return best;
};
const raw = (name, th) => winner(name, th)?.value;
function resolve(name, th) {
  let v = raw(name, th);
  const seen = new Set([name]);
  for (let n = 0; v && n < 16; n++) {
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
    if (!m) break;
    if (seen.has(m[1])) return undefined;
    seen.add(m[1]);
    v = raw(m[1], th) ?? m[2];
  }
  return v;
}
// The note: the config's notes map first (it never touches the CSS), then the
// comment on the declaration that actually won, then any comment on the name.
const noteFor = (name) => cd.notes[name] ?? cd.notes[name.replace(/^--/, '')]
  ?? themeIds.map(th => winner(name, th)?.note).find(Boolean)
  ?? decls.find(d => d.name === name && d.note)?.note ?? '';

// ── 2. Classify ──
const COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\))$/i;
const toPx = (v) => { const m = String(v).match(/^(-?[\d.]+)rem$/); return m ? `${+(m[1] * 16).toFixed(2)}px` : v; };
const tok = (n) => n.replace(/^--/, '');
const startsWithAny = (key, name) => [].concat(P[key] ?? []).find(x => x && name.startsWith(x));
let ref = '';
try { ref = execSync('git rev-parse --abbrev-ref HEAD', { cwd: cfg.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '@' + execSync('git rev-parse --short HEAD', { cwd: cfg.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}

const T = {
  name: cd.name, version: 1,
  meta: { source: 'code', paths: cfg.tokenFiles, ref, exportedAt: new Date().toISOString() },
  color: { themes: themeIds.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })), tokens: [] },
  type: { fonts: [], families: {}, groups: [{ name: 'Text', family: 'sans', styles: [] }] },
  spacing: { tokens: [] }, radius: { tokens: [] }, shadow: { tokens: [] },
};
const skipped = [];
const perTheme = (name, ok) => {
  const v = {};
  for (const th of themeIds) {
    const r = raw(name, th);
    const alias = r?.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    const val = alias && COLOR.test(resolve(alias[1], th) ?? '') && included(alias[1]) ? `{${tok(alias[1])}}` : resolve(name, th);
    if (val && (ok(val) || val.startsWith('{'))) v[th] = /^#[0-9a-f]+$/i.test(val) ? val.toLowerCase() : val;
  }
  return v;
};
const names = [...new Set(decls.map(d => d.name))].filter(included);
for (const name of names) {
  const first = resolve(name, themeIds[0]) ?? themeIds.map(th => resolve(name, th)).find(Boolean);
  if (first === undefined) { skipped.push(`${name}: not declared under any theme selector, or unresolvable`); continue; }
  const one = (value) => ({ name: tok(name), value, usage: noteFor(name) });
  const sameEverywhere = () => new Set(themeIds.map(th => resolve(name, th))).size === 1;
  let k;
  if ((k = startsWithAny('type', name))) {
    const style = { name: tok(name).slice(tok(k).length), fontSize: toPx(first) };
    const rule = typeRules.find(r => r.token === name)?.props ?? {};
    const conf = cd.textStyles[style.name] ?? {};
    const lh = conf.lineHeight ?? rule['line-height'], fw = conf.fontWeight ?? rule['font-weight'], ls = conf.letterSpacing ?? rule['letter-spacing'];
    if (lh) style.lineHeight = /^[\d.]+$/.test(lh) ? Number(lh) : toPx(lh);
    if (fw) style.fontWeight = /^\d+$/.test(String(fw)) ? Number(fw) : fw;
    if (ls) style.letterSpacing = ls;
    if (noteFor(name)) style.usage = noteFor(name);
    if (!lh || !fw) problems.push(`type style "${style.name}" has no ${[!lh && 'line height', !fw && 'weight'].filter(Boolean).join(' or ')}: add it under claudeDesign.textStyles`);
    T.type.groups[0].styles.push(style);
  } else if ((k = startsWithAny('font', name))) {
    T.type.families[tok(name).slice(tok(k).length)] = first;
  } else if (startsWithAny('radius', name)) { T.radius.tokens.push(one(toPx(first))); if (!sameEverywhere()) problems.push(`${name} differs by theme; only the first theme's value is exported`); }
  else if (startsWithAny('spacing', name)) { T.spacing.tokens.push(one(toPx(first))); if (!sameEverywhere()) problems.push(`${name} differs by theme; only the first theme's value is exported`); }
  else if (startsWithAny('shadow', name)) {
    // Per theme when the themes differ, so dark shadows aren't dropped.
    const v = perTheme(name, s => !/var\(|url\(/.test(s));
    T.shadow.tokens.push(one(new Set(Object.values(v)).size > 1 ? v : first));
  } else if (COLOR.test(first)) {
    T.color.tokens.push(one(perTheme(name, s => COLOR.test(s))));
  } else skipped.push(`${name}: ${first}`);
}
const fam = Object.keys(T.type.families);
if (fam.length && !T.type.families.sans) T.type.groups[0].family = fam[0];
// An alias of a token that didn't make the export drops silently in Claude Design: resolve it instead.
const have = new Set(T.color.tokens.map(x => x.name));
for (const t of T.color.tokens) for (const th of Object.keys(t.value))
  if (t.value[th].startsWith('{') && !have.has(t.value[th].slice(1, -1))) t.value[th] = resolve('--' + t.name, th);

// A token redeclared under a selector no theme lists is the silent bug this
// script once had: the override never reaches the export. Say so, loudly.
const listed = new Set([...themeIds.flatMap(chain), ...(cd.ignoreScopes ?? []).map(norm)]);
const unlisted = {};
for (const d of decls) if (included(d.name) && !d.keys.some(k => listed.has(k))) (unlisted[d.keys[0]] ??= new Set()).add(d.name);
for (const [scope, set] of Object.entries(unlisted))
  problems.push(`"${scope}" redeclares ${set.size} token${set.size > 1 ? 's' : ''} (${[...set].slice(0, 4).join(', ')}${set.size > 4 ? '…' : ''}) but no theme lists it: add it to claudeDesign.themes in cascade order, or to ignoreScopes if it's not a theme (a phone-size override, a print style)`);

// Overrides: anything hand-added after an export lives here, so a re-export keeps it.
// { "tokens": { "<name>": { "value": …, "usage": … } }, "add": { "<family>": [ {name, value, usage} ] } }
const ov = cd.overrides ?? {};
for (const fam of ['color', 'spacing', 'radius', 'shadow']) {
  for (const t of T[fam].tokens) if (ov.tokens?.[t.name]) Object.assign(t, ov.tokens[t.name]);
  for (const t of ov.add?.[fam] ?? []) T[fam].tokens.push(t);
}
for (const st of T.type.groups[0].styles) if (ov.tokens?.[st.name]) Object.assign(st, ov.tokens[st.name]);

// ── 3. Fonts: copied from the project, so a re-export never drops them ──
const fontFaces = [];
for (const f of cd.fonts) {
  const src = join(cfg.root, f.src);
  if (!existsSync(src)) { problems.push(`font file not found: ${f.src}`); continue; }
  const file = `fonts/${f.as ?? basename(f.src)}`;
  T.type.fonts.push({ family: f.family, file, weight: String(f.weight ?? '400'), style: f.style ?? 'normal' });
  fontFaces.push(`@font-face{font-family:"${f.family}";font-style:${f.style ?? 'normal'};font-weight:${f.weight ?? 400};font-display:swap;src:url(ds/${folder}/${file}) format("${file.split('.').pop()}")}`);
  if (!CHECK) { mkdirSync(join(out, 'fonts'), { recursive: true }); copyFileSync(src, join(out, file)); }
}
if (!cd.fonts.length && fam.length) problems.push('no font files listed: add claudeDesign.fonts, or the design file falls back to system fonts');

// ── 4. Contrast: every text colour on every ground, in every theme ──
const contrastRows = [];
if (cd.contrast) {
  const rgb = (v) => {
    let m = v.match(/^#([0-9a-f]{3,8})$/i);
    if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1); }
    m = v.match(/^rgba?\(([^)]+)\)$/i);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    return null;
  };
  const colourOf = (n, th) => { let v = T.color.tokens.find(t => t.name === n)?.value?.[th] ?? T.color.tokens.find(t => t.name === n)?.value?.[themeIds[0]]; for (let i = 0; v?.startsWith('{') && i < 16; i++) { const t = T.color.tokens.find(x => x.name === v.slice(1, -1)); v = t?.value?.[th] ?? t?.value?.[themeIds[0]]; } return v && rgb(v); };
  const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
  const lum = (c) => { const [r, g, b] = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const large = new Set(cd.contrast.large ?? []);
  for (const th of themeIds) for (const fgN of cd.contrast.text ?? []) for (const bgN of cd.contrast.grounds ?? []) {
    const fg = colourOf(fgN, th), bgc = colourOf(bgN, th);
    if (!fg || !bgc) { problems.push(`contrast: can't read ${!fg ? fgN : bgN} in ${th}`); continue; }
    const bg = over(bgc, [255, 255, 255]);
    const a = lum(over(fg, bg)), b = lum(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const need = large.has(fgN) ? 3 : 4.5;
    if (ratio < need) contrastRows.push(`| ${th} | ${fgN} | ${bgN} | ${ratio.toFixed(2)}:1 | ${need}:1 |`);
  }
}

if (!CHECK) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'tokens.json'), JSON.stringify(T, null, 2) + '\n');
  if (fontFaces.length) writeFileSync(join(out, 'canvas-fonts.css'), fontFaces.join('\n') + '\n');
}

// ── Report ──
const all = [...T.color.tokens, ...T.spacing.tokens, ...T.radius.tokens, ...T.shadow.tokens];
const noUsage = all.filter(x => !x.usage).map(x => x.name);
if (process.argv.includes('--notes-stub')) {
  console.log(JSON.stringify(Object.fromEntries(noUsage.map(n => ['--' + n, ''])), null, 2));
  process.exit(0);
}
console.log(`# Token export${CHECK ? ' (check only)' : ` → ${cd.out}/tokens.json`}${ref ? `, from ${ref}` : ''}\n`);
console.log(`| Family | Count |\n|---|---|`);
console.log(`| colour (${themeIds.join(' / ')}) | ${T.color.tokens.length} |\n| type styles | ${T.type.groups[0].styles.length} |\n| font families / files | ${fam.length} / ${T.type.fonts.length} |\n| spacing | ${T.spacing.tokens.length} |\n| radius | ${T.radius.tokens.length} |\n| shadow | ${T.shadow.tokens.length} |`);
if (contrastRows.length) console.log(`\n**Contrast below the minimum** (say so in the token's note, or fix the colour):\n\n| Theme | Text | Ground | Ratio | Needs |\n|---|---|---|---|---|\n${contrastRows.join('\n')}`);
else if (cd.contrast) console.log('\nContrast: every text colour passes on every ground, in every theme.');
else console.log('\nContrast not checked: add claudeDesign.contrast { text, grounds, large }.');
if (noUsage.length) console.log(`\n**${noUsage.length} tokens have no usage note.** Add each to claudeDesign.notes (keeps the CSS comments as they are):\n${noUsage.join(', ')}`);
if (problems.length) console.log(`\n**To fix:**\n${problems.map(p => '- ' + p).join('\n')}`);
if (skipped.length) console.log(`\n**Not exported** (layout sizes, motion and other values Claude Design has no family for):\n${skipped.map(s => '- ' + s).join('\n')}`);
if (!decls.length) { console.log('\nNo tokens found: check `tokenFiles` and the `claudeDesign.themes` selectors.'); process.exit(1); }
// Never report success over a known problem: exit 1 so CI and agents notice.
if (Object.keys(unlisted).length || problems.some(p => p.startsWith('font file'))) { console.log('\n✗ Not clean: fix the items above before publishing.'); process.exit(1); }
