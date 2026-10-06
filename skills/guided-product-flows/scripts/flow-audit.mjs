#!/usr/bin/env node
/**
 * flow-audit — for an app made of many tools, answer three questions in
 * one command, from the code rather than from memory:
 *
 *   1. Which tools have a step-by-step guide, and which don't?
 *      (A tool "has a guide" when its entry file, or a local file it imports
 *      up to 3 levels deep, renders the guide component.)
 *   2. Is there one declared map of which tool reads from which, and does
 *      it cover every tool? (Without one, "something upstream changed" ends
 *      up re-implemented per screen, and the copies drift.)
 *   3. Where might the code be recording less than it shows? Handlers that
 *      take a parameter and ignore it (`_quote`), and sample/fixture arrays
 *      in files that also write state.
 *
 *   node flow-audit.mjs                 # all three, as markdown
 *   node flow-audit.mjs --guides        # just question 1
 *
 * Config: flows.config.json in the project root.
 *   {
 *     "tools": { "Product Backlog": "components/ProductBacklog.tsx", … },   every tool in the nav
 *     "guideMarker": "<Wizard\\b|<WizardStep\\b",                         what counts as a guide
 *     "checklistMarker": "onePagerChecks|<Checklist\\b",                   optional: a checklist path counts too
 *     "writeMarker": "set[A-Z]\\w*\\(|onUpdate\\w*\\(|dispatch\\("         optional: what a state write looks like
 *     "flowMap": { "file": "services/dataFlow.ts", "ids": { "Product Backlog": "PRODUCT_BACKLOG", … } }
 *   }
 * Without a config it guesses: every component file under components/,
 * src/components/ or app/ that is routed to is hard to infer, so it lists
 * the files that render a guide and asks you to fill in "tools".
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const cfgPath = join(ROOT, 'flows.config.json');
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const GUIDE = new RegExp(cfg.guideMarker ?? '<Wizard\\b|<WizardStep\\b|<Stepper\\b|<Steps\\b', 'm');
const CHECKLIST = cfg.checklistMarker ? new RegExp(cfg.checklistMarker, 'm') : null;
const WRITE = new RegExp(cfg.writeMarker ?? 'set[A-Z]\\w*\\(|onUpdate\\w*\\(|dispatch\\(|\\.insert\\(|\\.update\\(', 'm');
const ONLY_GUIDES = process.argv.includes('--guides');

const read = (p) => readFileSync(p, 'utf8');
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}.vue`, join(base, 'index.tsx'), join(base, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
/** Files reachable from `file` through local imports, up to `depth` levels. */
function reachable(file, depth = 3, seen = new Set()) {
  if (!file || seen.has(file) || depth < 0) return seen;
  seen.add(file);
  for (const m of read(file).matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g))
    reachable(resolveImport(file, m[1] ?? m[2]), depth - 1, seen);
  return seen;
}
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'node_modules' || n.startsWith('.')) continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|jsx|vue|svelte)$/.test(n) && !/\.(test|spec|stories)\./.test(n)) yield p;
  }
}

const out = [];
const tools = cfg.tools ?? {};
if (!Object.keys(tools).length) {
  out.push('# Flow audit', '', 'No `tools` in flows.config.json yet. List every tool in the navigation with its entry file, then run again.', '', 'Files that render a guide today:', '');
  for (const d of ['components', 'src', 'app'].filter(d => existsSync(join(ROOT, d))))
    for (const f of walk(join(ROOT, d))) if (GUIDE.test(read(f))) out.push(`- ${rel(f)}`);
  console.log(out.join('\n'));
  process.exit(0);
}

// 1. Guides
out.push('# Flow audit', '', '## 1. Does every tool have a step-by-step path?', '', '| Tool | Path | Found in |', '|---|---|---|');
let missing = 0;
for (const [name, entry] of Object.entries(tools)) {
  const file = join(ROOT, entry);
  if (!existsSync(file)) { out.push(`| ${name} | ⚠ entry file not found | \`${entry}\` |`); missing++; continue; }
  const files = [...reachable(file)].filter(f => !/[\\/](ui|primitives)[\\/]/.test(f));
  const guide = files.filter(f => GUIDE.test(read(f))).map(rel);
  const list = CHECKLIST ? files.filter(f => CHECKLIST.test(read(f))).map(rel) : [];
  if (guide.length) out.push(`| ${name} | ✅ guide | ${guide.slice(0, 3).join(', ')} |`);
  else if (list.length) out.push(`| ${name} | ✅ checklist | ${list.slice(0, 2).join(', ')} |`);
  else { out.push(`| ${name} | ❌ none | |`); missing++; }
}
out.push('', `${Object.keys(tools).length - missing} of ${Object.keys(tools).length} tools have a path.${missing ? ' The ❌ rows need a decision: a guide, a checklist, or "none, because…" (references/choosing.md).' : ''}`);

if (!ONLY_GUIDES) {
  // 2. The declared flow map
  out.push('', '## 2. Is there one declared map of how data flows?', '');
  const fm = cfg.flowMap;
  if (!fm?.file || !existsSync(join(ROOT, fm.file))) {
    out.push('No `flowMap.file` in flows.config.json, or the file does not exist. Phase 3 of the skill declares one (references/data-flow.md).');
  } else {
    const src = read(join(ROOT, fm.file));
    const ids = fm.ids ?? {};
    out.push(`Map: \`${fm.file}\``, '', '| Tool | Id | In the map? |', '|---|---|---|');
    for (const name of Object.keys(tools)) {
      const id = ids[name];
      if (!id) { out.push(`| ${name} | (no id in flowMap.ids) | ? |`); continue; }
      // Listed as a key (it reads from something) or as a value (something reads from it).
      const asKey = new RegExp(`^\\s*['"]?${id}['"]?\\s*:`, 'm').test(src);
      const asValue = new RegExp(`['"]${id}['"]`).test(src);
      out.push(`| ${name} | \`${id}\` | ${asKey || asValue ? '✅ listed' : '❌ not listed: an edit upstream will never flag it'} |`);
    }
  }

  // 3. Honesty signals
  out.push('', '## 3. Places that may record less than they show', '');
  const sig = [];
  const all = new Set();
  for (const entry of Object.values(tools)) if (existsSync(join(ROOT, entry))) for (const f of reachable(join(ROOT, entry))) all.add(f);
  for (const f of all) {
    const text = read(f);
    text.split('\n').forEach((line, i) => {
      // A handler that takes data and drops it: the tell for "the counter replaced the thing it counted".
      const m = line.match(/\b(handle\w+|on[A-Z]\w*|add\w+|save\w+|push\w+|pin\w+)\s*[=:(]\s*(?:async\s*)?\(?([^)]*)\)?\s*=>/);
      if (m && /(^|,\s*)_[a-z]\w*/.test(m[2])) sig.push(`| \`${rel(f)}:${i + 1}\` | \`${m[1]}\` ignores \`${m[2].match(/_[a-z]\w*/)[0]}\`: is that data meant to be stored? |`);
      // Sample data that a control might write into the user's record.
      if (/\b(const|let)\s+(SAMPLE|DEMO|MOCK|FAKE|FIXTURE|PLACEHOLDER|EXAMPLE)_?\w*\s*=\s*\[/i.test(line) && WRITE.test(text))
        sig.push(`| \`${rel(f)}:${i + 1}\` | sample data in a file that writes state: can a button put it into the user's record? |`);
    });
  }
  if (sig.length) out.push('Signals, not verdicts: check each one.', '', '| Where | Why look |', '|---|---|', ...sig.slice(0, 30));
  else out.push('None found.');
}
console.log(out.join('\n'));
