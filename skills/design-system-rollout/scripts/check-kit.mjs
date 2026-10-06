#!/usr/bin/env node
/**
 * check-kit — the ratchet. Screens are built from the component kit, and the
 * count of hand-built UI in each file may only go DOWN.
 *
 * Why a ratchet and not a hard rule: on day one there are hundreds of
 * hand-built buttons. A hard rule would fail CI until all are migrated; no
 * rule lets new ones in while you migrate the old. The ratchet holds every
 * existing file at today's count and every NEW file at zero, so CI is green
 * from the first commit and the number can only fall.
 *
 *   node check-kit.mjs --init              # first run: record today's counts as the ceiling
 *   node check-kit.mjs                     # CI: fail if any file's count went up
 *   node check-kit.mjs --update-baseline   # lock in improvements (only ever lowers)
 *   node check-kit.mjs --report            # counts left per metric, worst files first
 *   node check-kit.mjs --json              # totals per metric (status.mjs reads these)
 *
 * Metrics are regexes over source lines (below). Turn one off, or add your
 * own, under "kit.metrics" in design-system.config.json:
 *   { "kit": { "disable": ["handLabel"], "metrics": { "rawChart": "<ResponsiveContainer\\b" } } }
 * A line ending in `// kit-exempt: <why>` is not counted.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, sourceFiles, classStrings, isComment, isKit } from './lib.mjs';
import { styleBlocks, literal, FAMILY, touchables } from './rn.mjs';

const cfg = loadConfig();
const args = process.argv.slice(2);
const BASELINE = join(cfg.root, cfg.kit?.baseline ?? 'design-system-baseline.json');

const any = (re) => (l) => (l.match(re) ?? []).length;
const cls = (test) => (l) => classStrings(l).filter(c => test(new Set(c.split(/\s+/)), c)).length;
const has = (set, re) => [...set].some(p => re.test(p));

const DEFAULT_METRICS = {
  rawButton:   [any(/<button\b/g), '<Button> or <IconButton>'],
  rawField:    [(l) => (/<(input|select|textarea)\b/.test(l) && !/type=["']?(file|hidden)/.test(l) ? 1 : 0), '<Input>, <Select>, <Textarea> inside <Field>'],
  rawOverlay:  [any(/\bfixed inset-0\b|\bcreatePortal\(/g), '<Modal> or <Sheet>'],
  rawSpinner:  [any(/\banimate-spin\b|\bfa-spin\b/g), '<Spinner> or <Button loading>'],
  rawType:     [cls((s) => has(s, /^(?:[a-z0-9]+:)*text-(xs|sm|base|lg|xl|[2-9]xl|\[\d)/)), '<Text variant> / <Heading>'],
  handLabel:   [cls((s) => s.has('uppercase')), '<Eyebrow>, or <Badge> for a pill'],
  rawCard:     [cls((s) => has(s, /^bg-(white|gray-50|slate-50|zinc-50|neutral-50)$/) && s.has('border') && has(s, /^rounded-(md|lg|xl|2xl|3xl)$/)), '<Card>'],
  rawPill:     [cls((s) => s.has('rounded-full') && has(s, /^px-/) && has(s, /^py-/)), '<Badge> (a status) or <Tag> (a value)'],
  rawStatus:   [cls((s) => has(s, /^(?:[a-z]+:)*(text|bg|border)-(red|green|amber|yellow|emerald|rose|orange)-\d+/)), 'a tone: success · warning · danger · info'],
  rawGrey:     [cls((s) => has(s, /^(?:[a-z]+:)*text-(gray|slate|zinc|neutral|stone)-\d+$/)), 'tone="muted"'],
  rawTracking: [cls((s) => has(s, /^(?:[a-z]+:)*tracking-/)), 'leave letter-spacing to <Heading> / <Eyebrow>'],
  rawHex:      [any(/#[0-9a-fA-F]{6}\b/g), 'a colour token (or `token-exempt:` for per-datum colours)'],
  stepCounter: [any(/Step \{[^}]+\} of \{|Step \d+ of \d+/g), '<Wizard>'],
  rawTable:    [any(/<table[\s>]/g), '<Table>'],
  inlineStyle: [(l) => (/style=\{\{[^}]*(fontSize|fontWeight|color|background)/.test(l) ? 1 : 0), 'a class or a component prop (inline styles cannot be themed)'],
};

// React Native has no class names: count literal style values and hand-built
// touchables instead. These run per FILE (style objects span lines).
const NATIVE_METRICS = {
  rawFontSize:  [(t) => styleBlocks(t).filter(b => b.props.fontSize && literal(b.props.fontSize) !== null).length, 'a text style from the kit (<Text variant>)'],
  rawSpacing:   [(t) => styleBlocks(t).reduce((n, b) => n + Object.entries(b.props).filter(([k, v]) => ['padding', 'margin', 'gap'].includes(FAMILY(k)) && typeof literal(v) === 'number' && literal(v) !== 0).length, 0), 'a space token'],
  rawRadius:    [(t) => styleBlocks(t).reduce((n, b) => n + Object.entries(b.props).filter(([k, v]) => FAMILY(k) === 'radius' && typeof literal(v) === 'number').length, 0), 'a radius token'],
  rawColour:    [(t) => styleBlocks(t).reduce((n, b) => n + Object.entries(b.props).filter(([k, v]) => FAMILY(k) === 'colour' && typeof literal(v) === 'string').length, 0), 'a colour from the theme hook'],
  rawTouchable: [(t) => touchables(t).length, '<Button>, <IconButton> or a kit row'],
  unlabelledTouchable: [(t) => touchables(t).filter(x => !x.labelled && !x.hasText).length, 'accessibilityLabel on anything without readable text'],
  rawText:      [(t) => (t.match(/<Text\b/g) ?? []).length, 'the kit\'s text components'],
};
const BASE = cfg.stack === 'react-native' ? NATIVE_METRICS : DEFAULT_METRICS;
const PER_FILE = cfg.stack === 'react-native';
const METRICS = Object.fromEntries(Object.entries(BASE).filter(([k]) => !(cfg.kit?.disable ?? []).includes(k)));
for (const [k, re] of Object.entries(cfg.kit?.metrics ?? {})) METRICS[k] = [any(new RegExp(re, 'g')), cfg.kit?.hints?.[k] ?? 'the kit component'];
const exempt = (rel) => isKit(cfg, rel) || rel === cfg.tokenModule || cfg.tokenFiles.includes(rel) || (cfg.kit?.exempt ?? []).some(e => rel === e || rel.startsWith(e + '/'));

const current = {};
for (const f of sourceFiles(cfg)) {
  if (exempt(f.rel)) continue;
  const counts = Object.fromEntries(Object.keys(METRICS).map(k => [k, 0]));
  if (PER_FILE) {
    const text = f.text.split('\n').map(l => (/kit-exempt:|token-exempt:/.test(l) ? '' : l)).join('\n');
    for (const [k, [fn]] of Object.entries(METRICS)) counts[k] += fn(text);
  } else for (const line of f.text.split('\n')) {
    if (isComment(line) || /kit-exempt:|token-exempt:/.test(line)) continue;
    for (const [k, [fn]] of Object.entries(METRICS)) counts[k] += fn(line);
  }
  if (Object.values(counts).some(Boolean)) current[f.rel] = counts;
}
const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const sum = (o, k) => Object.values(o).reduce((a, c) => a + (c[k] ?? 0), 0);

if (args.includes('--init')) {
  if (existsSync(BASELINE) && !args.includes('--force')) { console.error(`${BASELINE} exists. The ceiling is set once; use --update-baseline to lower it.`); process.exit(1); }
  writeFileSync(BASELINE, JSON.stringify(sorted(current), null, 2) + '\n');
  console.log(`Stack: ${cfg.stack}. Baseline: ${Object.keys(current).length} files, ${Object.keys(METRICS).map(k => `${k} ${sum(current, k)}`).join(', ')}.`);
  process.exit(0);
}

if (args.includes('--json')) {
  console.log(JSON.stringify({ stack: cfg.stack, totals: Object.fromEntries(Object.keys(METRICS).map(k => [k, sum(current, k)])) }));
  process.exit(0);
}

if (args.includes('--report')) {
  console.log('| Metric | Left | Use instead | Worst files |\n|---|---|---|---|');
  for (const [k, [, hint]] of Object.entries(METRICS)) {
    const worst = Object.entries(current).filter(([, c]) => c[k]).sort((a, b) => b[1][k] - a[1][k]).slice(0, 4).map(([f, c]) => `${f} (${c[k]})`).join(', ');
    console.log(`| ${k} | ${sum(current, k)} | ${hint} | ${worst} |`);
  }
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
if (!baseline) { console.error(`No baseline yet. Run: node check-kit.mjs --init`); process.exit(1); }

const regressions = [], improved = [];
for (const [rel, counts] of Object.entries(current)) {
  for (const [k, n] of Object.entries(counts)) {
    const b = baseline[rel]?.[k] ?? 0; // a new file, or a new metric, starts at zero
    if (n > b) regressions.push(`${rel}  ${k}: ${b} → ${n}  (use ${METRICS[k][1]})${baseline[rel] ? '' : '  [new file: starts at 0]'}`);
    else if (n < b) improved.push(`${rel} ${k} ${b}→${n}`);
  }
}
for (const [rel, counts] of Object.entries(baseline)) if (!current[rel]) for (const [k, b] of Object.entries(counts)) if (b) improved.push(`${rel} ${k} ${b}→0`);

if (args.includes('--update-baseline')) {
  const next = {};
  for (const rel of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    const row = {};
    for (const k of Object.keys(METRICS)) { const v = Math.min(current[rel]?.[k] ?? 0, baseline[rel]?.[k] ?? 0); if (v) row[k] = v; }
    if (Object.keys(row).length) next[rel] = row;
  }
  writeFileSync(BASELINE, JSON.stringify(sorted(next), null, 2) + '\n');
  console.log(`Baseline lowered (${improved.length} count(s)). It is never raised by this flag.`);
}

if (regressions.length) {
  console.error(`✗ Hand-built UI grew. Build it from the kit (${cfg.kitDir}) instead:\n  ${regressions.join('\n  ')}`);
  process.exit(1);
}
const left = Object.keys(METRICS).map(k => [k, sum(current, k)]).filter(([, n]) => n);
console.log(`✓ Kit ratchet holds. Left to migrate: ${left.reduce((a, [, n]) => a + n, 0)}${left.length ? ` (${left.map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}.`);
if (improved.length && !args.includes('--update-baseline')) console.log(`  ${improved.length} count(s) went down. Lock them in: node check-kit.mjs --update-baseline`);
