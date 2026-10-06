#!/usr/bin/env node
/**
 * status: where the rollout stands, what changed since last time, and what
 * to do next. Run it at the start of every session, before any other work.
 *
 *   node status.mjs           # report only: reads the project, writes nothing
 *   node status.mjs --save    # also record this run in design-system-status.json (commit it)
 *   node status.mjs --save --log ~/notes/myapp-status.json   # keep the log OUTSIDE the repo
 *                                                          # (read-only test runs: nothing written to the project)
 *
 * First run: the current state of every phase, the headline counts, and the
 * plan in order. Later runs: the same, plus what moved since the last saved
 * run (counts before → after, phases newly done), so a restarted session
 * starts from facts rather than from memory.
 *
 * It reads; it never changes code. Counts come from inventory.mjs --json and
 * check-kit.mjs --json, so they mean exactly what those scripts mean.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib.mjs';

const cfg = loadConfig();
const here = dirname(fileURLToPath(import.meta.url));
const SAVE = process.argv.includes('--save');
// The log can live outside the project (--log, or DS_STATUS_LOG), so a read-only
// run still has something to compare with next time.
const logArg = process.argv.includes('--log') ? process.argv[process.argv.indexOf('--log') + 1] : process.env.DS_STATUS_LOG;
const LOG = logArg ? resolve(logArg.replace(/^~(?=\/)/, homedir())) : join(cfg.root, cfg.statusFile ?? 'design-system-status.json');
const NATIVE = cfg.stack === 'react-native';

const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(here, script), ...args], { cwd: cfg.root, encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return null; }
};
const read = (p) => (existsSync(join(cfg.root, p)) ? readFileSync(join(cfg.root, p), 'utf8') : '');
const git = (c) => { try { return execSync(`git ${c}`, { cwd: cfg.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const pkgScripts = (() => { try { return JSON.parse(read('package.json')).scripts ?? {}; } catch { return {}; } })();
const ci = existsSync(join(cfg.root, '.github/workflows')) ? readdirSync(join(cfg.root, '.github/workflows')).map(f => read(`.github/workflows/${f}`)).join('\n') : '';
const docs = ['CLAUDE.md', 'AGENTS.md'].map(read).filter(Boolean).join('\n');

// ── The numbers ──
const inv = run('inventory.mjs', '--json') ?? {};
const kit = run('check-kit.mjs', '--json');
const k = kit?.totals ?? {};
const n = (key) => inv[key]?.total ?? 0;
const v = (key) => inv[key]?.variants ?? 0;

// Headline counts: what the owner should watch fall. Lower is better for all.
const metrics = NATIVE ? {
  'Font sizes in use (distinct)': v('native.fontSize'),
  'Hand-set font sizes': n('native.fontSize'),
  'Hand-set spacing (padding, gap, margin)': n('native.padding') + n('native.gap') + n('native.margin'),
  'Hand-set corner radii': n('native.radius'),
  'Hand-set colours': n('native.colour'),
  'Hand-built touchables': n('native.hand-built touchable (Pressable / Touchable*)'),
  'Touchables with no label': n('native.touchable with no label and no text (screen readers say "button")'),
  'Raw <Text> outside the kit': n('native.raw <Text> outside the kit'),
  'Tokens not found by name': inv.unusedTokens ?? 0,
  'Files nothing imports': inv.deadFiles ?? 0,
  'Title Case labels': n('titleCase'),
} : {
  'Font sizes in use (distinct)': v('typeClass') + v('typeArbitrary') + v('typeInline') + v('typeCss'),
  'Raw hex colours': n('hex'),
  'Button recipes (distinct)': v('buttonRecipe'),
  'Card recipes (distinct)': v('cardRecipe'),
  'Raw <button>': n('raw <button>'),
  'Raw form fields': n('raw form field (<input>/<select>/<textarea>)'),
  'Hand-built dialogs': n('overlay (fixed inset-0 / createPortal)'),
  'Classes that cannot exist': n('class that cannot exist (e.g. gray-150)'),
  'Tokens not found by name': inv.unusedTokens ?? 0,
  'Files nothing imports': inv.deadFiles ?? 0,
  'Title Case labels': n('titleCase'),
};

// ── The phases: each is done when its evidence exists in the repo ──
const has = (p) => existsSync(join(cfg.root, p));
const sum = (...keys) => keys.reduce((a, x) => a + (k[x] ?? 0), 0);
const WAVES = NATIVE
  ? [['Type', ['rawFontSize', 'rawText']], ['Controls', ['rawTouchable', 'unlabelledTouchable']], ['Layout', ['rawSpacing', 'rawRadius', 'rawColour']]]
  : [['Type', ['rawType', 'handLabel', 'rawTracking']], ['Controls', ['rawButton', 'rawField', 'rawSpinner']], ['Surfaces', ['rawOverlay', 'rawCard']], ['Layout', ['rawStatus', 'rawGrey', 'rawHex', 'inlineStyle']], ['Small parts and flows', ['rawPill', 'rawTable', 'stepCounter']]];
const decisions = read('docs/design-decisions.md');
const tokensExist = NATIVE ? !!cfg.tokenModule && has(cfg.tokenModule) : cfg.tokenFiles.length > 0;
const guards = ['check:tokens', 'check:kit', 'check:writing'].filter(s => pkgScripts[s]);
// CI runs the guard whether the workflow says `npm run check:kit` or calls the script directly.
const inCI = /check:kit|check-kit(\.mjs)?\b/.test(ci);
const kitFiles = has(cfg.kitDir) ? readdirSync(join(cfg.root, cfg.kitDir)).filter(f => /\.(tsx|jsx|vue|svelte)$/.test(f) && !/\.test\./.test(f)) : [];
const designLinks = (read('DESIGN-SYSTEM.md') + docs).match(/claude\.ai\/(?:code\/)?artifact\/\w+/g) ?? [];

const phases = [
  ['0. Inventory', has('design-system.config.json'), has('design-system.config.json') ? 'design-system.config.json' : 'no design-system.config.json', 'Write design-system.config.json (template in the skill\'s assets/) and run inventory.mjs. Read references/react-native.md first on a native app.'],
  ['0. Sample data', !!cfg.audit?.setup && has(cfg.audit.setup), cfg.audit?.setup ? (has(cfg.audit.setup) ? cfg.audit.setup : `${cfg.audit.setup} is missing`) : 'no audit.setup script', 'Find or write scripts/audit-setup.mjs: a test user with believable content in every main screen.'],
  ['1. Decisions signed off', /signed off/i.test(decisions), decisions ? (/signed off/i.test(decisions) ? 'docs/design-decisions.md, signed off' : 'docs/design-decisions.md, not signed off yet') : 'no docs/design-decisions.md', 'Fill references/decisions.md with proposed answers from the counts, get the owner\'s sign-off, save it as docs/design-decisions.md with "Signed off: <date>".'],
  ['2. Tokens', tokensExist, tokensExist ? (NATIVE ? cfg.tokenModule : cfg.tokenFiles.join(', ')) : (NATIVE ? 'no tokenModule' : 'no token CSS found'), 'Write the decided values as tokens.'],
  ['2. Guards', guards.length === 3 && inCI, `${guards.length}/3 npm scripts${inCI ? ', in CI' : ', not in CI'}`, 'Copy the guards into scripts/, add check:tokens, check:kit and check:writing to package.json and CI, run check-kit --init, and prove each guard fails on a planted violation.'],
  ['3. Kit', kitFiles.length >= 5 && has('DESIGN-SYSTEM.md'), `${kitFiles.length} components${has('DESIGN-SYSTEM.md') ? ', DESIGN-SYSTEM.md' : ', no DESIGN-SYSTEM.md'}`, 'Build the kit from the decisions sheet (references/kit.md), with a gallery and DESIGN-SYSTEM.md.'],
  ...WAVES.map(([name, keys], i) => [`4. Wave ${i + 1}: ${name}`, kit !== null && sum(...keys) === 0, kit ? `${sum(...keys)} left (${keys.map(x => `${x} ${k[x] ?? 0}`).join(', ')})` : 'no counts', `Migrate the ${name.toLowerCase()} wave: codemods first (references/codemods.md), then by hand in parallel, verify by rendering, check-kit --update-baseline, one PR.`]),
  ['5. Writing', has('WRITING.md') && !!pkgScripts['check:writing'], has('WRITING.md') ? 'WRITING.md' : 'no WRITING.md', 'Write WRITING.md from the template, fix Title Case by hand-checked conversion, switch check:writing to failing.'],
  ['6. Locked in', /DESIGN-SYSTEM\.md|design system/i.test(docs), !docs ? 'no CLAUDE.md / AGENTS.md' : /DESIGN-SYSTEM\.md|design system/i.test(docs) ? 'CLAUDE.md / AGENTS.md cover it' : 'CLAUDE.md / AGENTS.md don\'t mention it', 'Add the design-system rules to CLAUDE.md / AGENTS.md, and project-specific traps to LEARNINGS.'],
  ['Design file (Claude Design)', designLinks.length >= 2, `${designLinks.length} artifact link(s) in the docs`, 'Optional: create the design system and screens canvas (references/claude-design.md) and record both links.'],
];

// ── Compare with the last saved run ──
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { runs: [] };
const last = log.runs[log.runs.length - 1];
const now = { at: new Date().toISOString(), ref: `${git('rev-parse --abbrev-ref HEAD')}@${git('rev-parse --short HEAD')}`, stack: cfg.stack, metrics, kit: k, phases: Object.fromEntries(phases.map(([p, done]) => [p, done])) };

const L = [];
L.push(`# Design system status`, '', `${now.at.slice(0, 10)}, ${now.ref || 'not a git repo'}. Stack: **${cfg.stack}**. Run ${log.runs.length + 1}${last ? `; last saved run ${last.at.slice(0, 10)} (${last.ref})` : ' (first run)'}.`);

if (last) {
  L.push('', '## Since last time', '');
  const moved = Object.entries(metrics).filter(([m, x]) => last.metrics?.[m] !== undefined && last.metrics[m] !== x);
  const newly = phases.filter(([p, done]) => done && !last.phases?.[p]).map(([p]) => p);
  const lost = phases.filter(([p, done]) => !done && last.phases?.[p]).map(([p]) => p);
  if (newly.length) L.push(`Done since then: ${newly.join(', ')}.`, '');
  if (lost.length) L.push(`**No longer done:** ${lost.join(', ')}. Something regressed; look at this first.`, '');
  if (moved.length) {
    L.push('| Count | Then | Now | |', '|---|---|---|---|');
    for (const [m, x] of moved) L.push(`| ${m} | ${last.metrics[m]} | ${x} | ${x < last.metrics[m] ? '↓ better' : '↑ worse'} |`);
  }
  if (!newly.length && !moved.length && !lost.length) L.push('Nothing has moved since the last saved run.');
}

L.push('', '## Where it stands', '', '| Phase | | Evidence |', '|---|---|---|');
for (const [p, done, evidence] of phases) L.push(`| ${p} | ${done ? '✅' : '◻'} | ${evidence} |`);

L.push('', '## Headline counts', '', '| Count | Now |', '|---|---|');
for (const [m, x] of Object.entries(metrics)) L.push(`| ${m} | ${x} |`);

const todo = phases.filter(([p, done]) => !done && !p.startsWith('Design file'));
L.push('', '## Next', '');
if (!todo.length) L.push('Every phase is done. Keep the guards in CI; run this again after big UI changes.');
else todo.slice(0, 3).forEach(([p, , , action], i) => L.push(`${i + 1}. **${p}.** ${action}`));
if (todo.length > 3) L.push('', `Then: ${todo.slice(3).map(([p]) => p).join(' → ')}.`);
L.push('', '_Phases are read from the repo (files, scripts, CI, counts), not remembered. If one is marked wrong, fix the evidence, not this report._');

console.log(L.join('\n'));
if (SAVE) {
  log.runs.push(now);
  mkdirSync(dirname(LOG), { recursive: true });
  writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`\nSaved as run ${log.runs.length} in ${LOG.startsWith(cfg.root + '/') ? LOG.replace(cfg.root + '/', '') + '. Commit it, so the next session can compare.' : LOG + ' (outside the project; nothing in the repo changed).'}`);
}
