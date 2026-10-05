#!/usr/bin/env node
/**
 * Writing guard: the parts of WRITING.md a machine can check, over the text
 * the app shows (JSX text, label-like props, and the two sides of a label
 * ternary). A line ending in `// writing-exempt: <why>` is skipped.
 *
 *   node check-writing.mjs          # fail on any finding
 *   node check-writing.mjs --list   # print every finding, don't fail
 *
 * Checks:
 *   - Title Case in a label (words after the first capitalised, other than
 *     the proper names below)
 *   - an exclamation mark
 *   - "..." instead of "…"
 *   - a typed arrow (→) in a label
 *   - "e.g.," with a comma
 *   - "AI" as a label prefix ("Generate AI Playbook")
 *   - a second name for a tool ("Opportunity Solution Tree", "Value Map")
 */
import { loadConfig, sourceFiles, isComment, isKit } from './lib.mjs';

const cfg = loadConfig();
const W = cfg.writing ?? {};

// Proper names keep their capitals mid-sentence. Multi-word names are matched
// as whole phrases, so "Business Model" (a product's tool name) stays
// capitalised while "Model" alone ("Model drivers") does not. Put the
// project's tool names, framework terms, people and products in
// design-system.config.json → properNames (phrases) / properWords (single words).
export const PROPER_PHRASES = [...(cfg.properNames ?? [])];
export const PROPER = new Set([
  ...`AI API CSV PDF URL UI UX FAQ SEO CRM ERP SaaS B2B B2C KPI KPIs MVP ROI CAC LTV ARR MRR SLA SLAs P&L Q1 Q2 Q3 Q4
  iOS Android Google Apple Microsoft LinkedIn Slack Figma Stripe Notion GitHub OpenAI`.split(/\s+/).filter(Boolean),
  ...(cfg.properWords ?? []),
]);
const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'by', 'as', 'at', 'from', 'vs', 'per', 'is', 'it', 'your', 'our', 'my', 'I']);

/** The text with proper-name phrases blanked out, so their capitals are not counted. */
const withoutPhrases = (text) => PROPER_PHRASES.reduce((t, p) => t.split(p).join(' '.repeat(p.length)), text);

export function titleCaseWords(text) {
  // Each sentence starts fresh: a capital after ". " is not Title Case.
  const sentences = withoutPhrases(text).split(/(?<=[.?!:])\s+/);
  return sentences.flatMap(sentence => {
    const words = sentence.match(/[A-Za-z][A-Za-z'’&]*/g) ?? [];
    const firstWordAt = sentence.search(/[A-Za-z]/);
    return words.filter((w, i) => {
      if (i === 0 && sentence.indexOf(w) === firstWordAt) return false;
      return /^[A-Z]/.test(w) && !PROPER.has(w) && w !== w.toUpperCase() && !SMALL.has(w.toLowerCase()) && !/[A-Z].*[A-Z]/.test(w.slice(1));
    });
  });
}

/** Sentence case: the first word of each sentence and proper names keep their capitals. */
export function toSentenceCase(text) {
  const keep = [];
  let t = text;
  for (const p of [...PROPER_PHRASES].sort((a, b) => b.length - a.length)) {
    t = t.split(p).join(`\u0000${keep.push(p) - 1}\u0000`);
  }
  let startOfSentence = true;
  t = t.replace(/\u0000\d+\u0000|[A-Za-z][A-Za-z'’]*|[.?!:]\s+/g, (m) => {
    if (/^[.?!:]/.test(m)) { startOfSentence = true; return m; }
    if (m.startsWith('\u0000')) { startOfSentence = false; return m; }
    const w = m;
    if (startOfSentence) { startOfSentence = false; return w; }
    if (PROPER.has(w) || w === w.toUpperCase() || /[A-Z].*[A-Z]/.test(w.slice(1))) return w;
    return w[0].toLowerCase() + w.slice(1);
  });
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

// One name per thing: { "Opportunity Solution Tree": "Opportunity Tree" } in
// design-system.config.json → writing.otherNames flags the old name anywhere.
const OTHER_NAMES = Object.entries(W.otherNames ?? {}).map(([old, name]) => [new RegExp(`\\b${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), name]);

const LABEL_PROPS = 'label|title|actionLabel|finishLabel|nextLabel|cancelLabel|loadingLabel|description|placeholder|hint|kicker|eyebrow';

/** The user-facing strings on one line of TSX, with where each came from.
 *  `prev` is the line before, for text that wraps onto its own line. */
export function uiStrings(line, prev = '') {
  const out = [];
  for (const m of line.matchAll(/>\s*([^<>{}]*[A-Za-z][^<>{}]*?)\s*</g)) out.push({ kind: 'text', text: m[1] });
  // Text that runs on past the end of the line: `icon="fa-play">Start pitch simulation`
  const tail = line.match(/[^=]>\s*([^<>{}]*[A-Za-z][^<>{}]*)$/);
  if (tail && !/^\s*</.test(tail[1])) out.push({ kind: 'text', text: tail[1].trim() });
  // A line of bare text inside an element opened on the line above.
  const t = line.trim();
  if (/[^=]>$/.test(prev.trim()) && /^[A-Z][^<>{}=;()`]*$/.test(t) && !/^[A-Z_]+$/.test(t)) out.push({ kind: 'text', text: t });
  for (const m of line.matchAll(new RegExp(`\\b(${LABEL_PROPS})="([^"]+)"`, 'g'))) out.push({ kind: m[1], text: m[2] });
  // Labels kept in objects and arrays ({ label: 'Base case' }).
  for (const m of line.matchAll(/\b(label|title|subLabel|heading)\s*:\s*(['"])([^'"]{2,80})\2/g)) out.push({ kind: 'object', text: m[3] });
  for (const m of line.matchAll(/\?\s*'([^']{2,80})'\s*:\s*'([^']{2,80})'/g)) out.push({ kind: 'ternary', text: m[1] }, { kind: 'ternary', text: m[2] });
  // Not text: TypeScript between angle brackets (React.FC<{ a: () => void }>).
  return out.filter(s => /[A-Za-z]{2}/.test(s.text) && !/;|=>|\?:|\bReact\.|\bvoid\b|\s\?\s.*\s:\s|&&|\|\|/.test(s.text));
}

export function findings(line, prev = '') {
  const out = [];
  for (const { kind, text } of uiStrings(line, prev)) {
    const t = text.trim();
    if (kind !== 'placeholder' && kind !== 'description' && kind !== 'hint') {
      const tc = titleCaseWords(t);
      if (tc.length && t.split(/\s+/).length <= 8) out.push(`Title Case ("${tc.slice(0, 3).join('", "')}") in "${t}" — sentence case`);
      if (/→/.test(t)) out.push(`typed arrow in "${t}" — use the button's iconEnd`);
      if (/^(Generate|Create|Draft|Run|Quick) AI\b/.test(t)) out.push(`"AI" in the label "${t}" — the wand icon says it`);
    }
    if (/!(\s|$|")/.test(t)) out.push(`exclamation mark in "${t}"`);
    if (/\.\.\./.test(t)) out.push(`"..." in "${t}" — use …`);
    if (/\be\.g\.,/.test(t)) out.push(`"e.g.," in "${t}" — no comma`);
    for (const [re, name] of OTHER_NAMES) if (re.test(t)) out.push(`"${t.match(re)[0]}" — call it "${name}"`);
  }
  return out;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const list = process.argv.includes('--list');
  const all = [];
  for (const f of sourceFiles(cfg, { extensions: ['.tsx', '.jsx', '.vue', '.svelte', '.html'] })) {
    if (isKit(cfg, f.rel) || (W.exempt ?? []).some(e => f.rel.startsWith(e))) continue;
    const lines = f.text.split('\n');
    lines.forEach((line, i) => {
      const s = line.trim();
      if (isComment(line) || s.startsWith('import ') || /writing-exempt:/.test(line)) return;
      for (const msg of findings(line, lines[i - 1] ?? '')) all.push(`${f.rel}:${i + 1}  ${msg}`);
    });
  }
  if (all.length) {
    console.log(all.join('\n'));
    console.log(`\n${all.length} writing finding(s). See WRITING.md.`);
    if (!list) process.exit(1);
  } else {
    console.log('✓ UI writing follows WRITING.md.');
  }
}
