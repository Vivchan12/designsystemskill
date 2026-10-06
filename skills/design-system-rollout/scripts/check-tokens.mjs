#!/usr/bin/env node
/**
 * check-tokens — never hardcode a value a token already names, and every font
 * size is a rung of the type scale.
 *
 * It parses the token CSS itself, so it never goes stale. And it FAILS when it
 * finds no tokens: a guard that parses nothing and passes is worse than no
 * guard, because it is trusted (one sat green for weeks while ~300 off-scale
 * sizes went in).
 *
 * Rules, in screens (the kit is exempt):
 *  1. A raw hex colour that equals a colour token → use the token.
 *  2. A font size off the scale: text-xs…text-9xl, text-[Npx], inline fontSize,
 *     or font-size in a CSS file other than the token files → use a type role.
 *     (Only once the scale exists, i.e. typeTokenPrefix tokens are found.)
 *  3. rounded-[Npx] equal to a radius token → use the token.
 * A line containing `token-exempt: <why>` is skipped. Use it for colours that
 * are per-datum (chart series) or that are concatenated/parsed as hex
 * (`color + '22'`): a var() there is invalid CSS the browser silently drops.
 *
 *   node check-tokens.mjs            # exit 1 on any finding
 *   node check-tokens.mjs --list     # print findings, never fail (for planning)
 */
import { loadConfig, sourceFiles, classStrings, readTokens, isComment, isKit, loadModule, flatten, getPath } from './lib.mjs';
import { styleBlocks, literal, FAMILY } from './rn.mjs';

const cfg = loadConfig();
const LIST = process.argv.includes('--list');
if (cfg.stack === 'react-native') { await native(); process.exit(0); }
const tokens = readTokens(cfg);
if (!cfg.tokenFiles.length || !Object.keys(tokens).length) {
  console.error(`✗ No tokens found. Set "tokenFiles" in design-system.config.json (looked in: ${cfg.tokenFiles.join(', ') || 'none of the defaults exist'}).`);
  process.exit(1);
}
const norm = (h) => { h = h.toLowerCase(); return h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h; };
const colourByHex = {};
for (const [k, v] of Object.entries(tokens)) if (/^#[0-9a-f]{3,6}$/i.test(v)) colourByHex[norm(v)] ??= k;
const rungs = Object.entries(tokens).filter(([k]) => k.startsWith(cfg.typeTokenPrefix));
const radiusByPx = {};
for (const [k, v] of Object.entries(tokens)) if (/radius|rounded/.test(k) && /^\d+px$/.test(v)) radiusByPx[v] ??= k;
if (cfg.typeTokenPrefix && !rungs.length) console.warn(`! No ${cfg.typeTokenPrefix}* tokens yet: the type scale rule is off until they exist.`);

const out = [];
for (const f of sourceFiles(cfg, { extensions: [...cfg.extensions, '.css', '.scss'] })) {
  if (isKit(cfg, f.rel) || cfg.tokenFiles.includes(f.rel)) continue;
  f.text.split('\n').forEach((line, i) => {
    if (isComment(line) || /token-exempt:/.test(line)) return;
    const at = `${f.rel}:${i + 1}`;
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const tok = colourByHex[norm(m[0])];
      if (tok) out.push(`${at}  ${m[0]} is ${tok} — use the token`);
    }
    if (rungs.length) {
      for (const c of classStrings(line)) for (const p of c.split(/\s+/)) {
        const base = p.replace(/^(?:[a-z0-9-]+:)+/, '');
        if (/^text-(xs|sm|base|lg|xl|[2-9]xl)$/.test(base) || /^text-\[\d+(\.\d+)?(px|rem|em)\]$/.test(base))
          out.push(`${at}  ${p} is off the type scale — use a type role (${cfg.typeClassPrefix}*)`);
        if (/^prose(-|$)/.test(base)) out.push(`${at}  ${p}: generated text needs its own route onto the scale, not Tailwind Typography`);
      }
      if (/fontSize\s*:/.test(line)) out.push(`${at}  inline fontSize — use a type role`);
      if (/\.(css|scss)$/.test(f.rel) && /font-size\s*:\s*\d/.test(line)) out.push(`${at}  font-size in CSS — use a type token`);
    }
    for (const m of line.matchAll(/rounded-\[(\d+px)\]/g)) if (radiusByPx[m[1]]) out.push(`${at}  rounded-[${m[1]}] is ${radiusByPx[m[1]]} — use the token`);
  });
}

if (out.length) {
  console.log(out.join('\n') + `\n\n${out.length} token finding(s).`);
  if (!LIST) process.exit(1);
} else {
  console.log(`✓ No token duplication or off-scale type (${Object.keys(tokens).length} tokens, ${rungs.length} type rungs).`);
}

/** React Native: tokens are a TypeScript object ("tokenModule"), and screens
 *  use style objects. "tokenMap" says where each family lives in that object:
 *  { "type": "type", "space": "space", "radius": "radius", "colors": ["palette.day", "palette.night"] } */
async function native() {
  if (!cfg.tokenModule) { console.error('✗ React Native project: set "tokenModule" (the file exporting the tokens object) and "tokenMap" in design-system.config.json.'); process.exit(1); }
  let mod;
  try { mod = await loadModule(cfg, cfg.tokenModule); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  const map = { type: 'type', space: 'space', radius: 'radius', colors: ['colors'], ...cfg.tokenMap };
  const pick = (path) => flatten(getPath(mod, path) ?? {}, path);
  const byValue = (flat, keyTest = () => true) => { const o = {}; for (const [k, v] of Object.entries(flat)) if (keyTest(k) && (typeof v === 'number' || typeof v === 'string')) o[String(v).toLowerCase()] ??= k; return o; };
  const typeFlat = pick(map.type);
  const sizes = new Set(Object.entries(typeFlat).filter(([k, v]) => typeof v === 'number' && (/fontSize$/.test(k) || !/lineHeight|letterSpacing|fontWeight/.test(k))).map(([, v]) => v));
  const space = byValue(pick(map.space)), radius = byValue(pick(map.radius));
  const colour = {}; for (const p of [].concat(map.colors)) Object.assign(colour, byValue(pick(p)));
  const found = Object.keys(typeFlat).length + Object.keys(space).length + Object.keys(radius).length + Object.keys(colour).length;
  if (!found) { console.error(`✗ No tokens found in ${cfg.tokenModule} at ${JSON.stringify(map)}. Fix "tokenMap".`); process.exit(1); }
  const out = [];
  for (const f of sourceFiles(cfg)) {
    if (isKit(cfg, f.rel) || f.rel === cfg.tokenModule) continue;
    const lines = f.text.split('\n');
    for (const b of styleBlocks(f.text)) {
      if (/token-exempt:/.test(lines[b.line - 1] ?? '')) continue;
      const at = `${f.rel}:${b.line}`;
      for (const [k, v] of Object.entries(b.props)) {
        const lit = literal(v), fam = FAMILY(k);
        if (lit === null) continue;
        if (fam === 'fontSize') out.push(`${at}  fontSize: ${lit} ${sizes.has(lit) ? 'is on the scale, but' : 'is off the type scale, and'} set by hand — use a text style`);
        else if (fam === 'colour' && colour[lit]) out.push(`${at}  ${k}: ${v} is ${colour[lit]} — use the theme`);
        else if (fam === 'radius' && radius[String(lit)]) out.push(`${at}  ${k}: ${lit} is ${radius[String(lit)]} — use the token`);
        else if (['padding', 'margin', 'gap'].includes(fam) && lit !== 0 && space[String(lit)]) out.push(`${at}  ${k}: ${lit} is ${space[String(lit)]} — use the token`);
      }
    }
  }
  if (out.length) {
    console.log(out.join('\n') + `\n\n${out.length} token finding(s) (React Native).`);
    if (!LIST) process.exit(1);
  } else console.log(`✓ No hand-set values that duplicate a token (React Native: ${sizes.size} type sizes, ${Object.keys(space).length} spacing, ${Object.keys(radius).length} radii, ${Object.keys(colour).length} colours).`);
}
