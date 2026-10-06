#!/usr/bin/env node
/**
 * flow-audit: for an app made of several tools (screens or modules that build
 * on each other), answer from the code rather than from memory:
 *
 *   1. Which tools have a step-by-step path (a guide or a checklist)?
 *   2. Does the one declared flow map cover every tool?
 *   3. Where might the code record less than it shows (honesty.md)?
 *      - a handler whose LAST parameter is ignored (`handleAdd(src, _quote)`)
 *      - sample data inside a list whose items have a control that writes
 *      - a link field (`profileId`, `basedOn…`, `source…`) that is read but never written
 *      - `list[0]` on what is probably a user's list: an input picked for them
 *
 *   node flow-audit.mjs              # report (exit 0)
 *   node flow-audit.mjs --strict     # exit 1 on any gap or unresolved signal: use it as a phase's exit check
 *   node flow-audit.mjs --guides     # just question 1
 *
 * Config: flows.config.json in the project root (template in the skill's assets/).
 *   tools        { name: entryFile }          every tool in the navigation
 *   root         "Project setup"              the root tool: feeds everything, has its own review, not in the map
 *   none         { name: "because…" }         tools that deliberately have no path
 *   guideMarker / checklistMarker / writeMarker   regexes
 *   flowMap      { file, ids: { name: ID } }
 *   types        ["types.ts"]                 where link fields are declared (check 3c)
 *   collections  ["profiles", …]              the user's lists, for the [0] check (else the slices named in the flow map)
 *   ignore       { "<key printed by the audit>": "why it's fine" }   resolved signals
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const cfgPath = join(ROOT, 'flows.config.json');
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const GUIDE = new RegExp(cfg.guideMarker ?? '<Wizard\\b|<WizardStep\\b|<Stepper\\b|<Steps\\b', 'm');
const CHECKLIST = cfg.checklistMarker ? new RegExp(cfg.checklistMarker, 'm') : null;
const WRITE = new RegExp(cfg.writeMarker ?? 'set[A-Z]\\w*\\(|onUpdate\\w*\\(|dispatch\\(|\\.insert\\(|\\.update\\(', 'm');
const STRICT = process.argv.includes('--strict');
const ONLY_GUIDES = process.argv.includes('--guides');
const ignore = cfg.ignore ?? {};
const none = cfg.none ?? {};

const cache = new Map();
const read = (p) => { if (!cache.has(p)) cache.set(p, readFileSync(p, 'utf8')); return cache.get(p); };
// Comments removed, line breaks kept, so a match in a comment never counts.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}.vue`, join(base, 'index.tsx'), join(base, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
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
    if (n === 'node_modules' || n.startsWith('.') || n === 'dist' || n === 'build') continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?|vue|svelte)$/.test(n) && !/\.(test|spec|stories)\.|\.d\.ts$/.test(n)) yield p;
  }
}

const out = [];
const tools = cfg.tools ?? {};
if (!Object.keys(tools).length) {
  out.push('# Flow audit', '', 'No `tools` in flows.config.json yet. List every tool in the navigation with its entry file (the router or nav component names them), then run again.', '', 'Files that render a guide today:', '');
  for (const d of ['components', 'src', 'app'].filter(d => existsSync(join(ROOT, d))))
    for (const f of walk(join(ROOT, d))) if (GUIDE.test(read(f))) out.push(`- ${rel(f)}`);
  console.log(out.join('\n'));
  process.exit(STRICT ? 1 : 0);
}
let failures = 0;

// ── 1. Paths ──
out.push('# Flow audit', '', '## 1. Does every tool have a step-by-step path?', '', '| Tool | Path | Found in |', '|---|---|---|');
let missing = 0;
for (const [name, entry] of Object.entries(tools)) {
  const file = join(ROOT, entry);
  if (!existsSync(file)) { out.push(`| ${name} | ⚠ entry file not found | \`${entry}\` |`); missing++; continue; }
  const files = [...reachable(file)].filter(f => !/[\\/](ui|primitives)[\\/]/.test(f));
  const guide = files.filter(f => GUIDE.test(code(read(f)))).map(rel);
  const list = CHECKLIST ? files.filter(f => CHECKLIST.test(code(read(f)))).map(rel) : [];
  if (guide.length) out.push(`| ${name} | ✅ guide | ${guide.slice(0, 3).join(', ')} |`);
  else if (list.length) out.push(`| ${name} | ✅ checklist | ${list.slice(0, 2).join(', ')} |`);
  else if (none[name]) out.push(`| ${name} | ➖ none, because ${none[name]} | |`);
  else { out.push(`| ${name} | ❌ none | |`); missing++; }
}
failures += missing;
out.push('', `${Object.keys(tools).length - missing} of ${Object.keys(tools).length} tools have a path or a recorded reason for none.${missing ? ' Each ❌ needs a decision: a guide, a checklist, or `none` with a reason (references/choosing.md).' : ''}`,
  '', '_This checks that a path exists, not that it is a good one. Review each guide against the checklist in references/guide-pattern.md._');

if (!ONLY_GUIDES) {
  // ── 2. The flow map ──
  out.push('', '## 2. Does the declared flow map cover every tool?', '');
  const fm = cfg.flowMap;
  if (!fm?.file || !existsSync(join(ROOT, fm.file))) {
    out.push('No `flowMap.file`, or the file does not exist. Phase 3 declares one (references/data-flow.md).');
    failures++;
  } else {
    const src = code(read(join(ROOT, fm.file)));
    const ids = fm.ids ?? {};
    out.push(`Map: \`${fm.file}\` (comments ignored)`, '', '| Tool | Id | In the map? |', '|---|---|---|');
    for (const name of Object.keys(tools)) {
      const id = ids[name];
      if (name === cfg.root) { out.push(`| ${name} | \`${id ?? '—'}\` | ➖ root: feeds every tool and has its own review |`); continue; }
      if (none[name] && !id) { out.push(`| ${name} | — | ➖ no path, no data of its own |`); continue; }
      if (!id) { out.push(`| ${name} | (no id in flowMap.ids) | ❌ add its id |`); failures++; continue; }
      // As a key (it reads from something), or inside a list (something reads from it).
      const asKey = new RegExp(`(^|[\\s{,])['"]?${id}['"]?\\s*:`, 'm').test(src);
      const asValue = new RegExp(`[\\[,]\\s*(?:['"]${id}['"]|\\w+\\.${id}\\b|${id}\\b)`).test(src);
      if (asKey || asValue) out.push(`| ${name} | \`${id}\` | ✅ ${asKey ? 'reads from tools' : 'read by tools only'} |`);
      else { out.push(`| ${name} | \`${id}\` | ❌ not listed: an edit upstream will never flag it |`); failures++; }
    }
  }

  // ── 3. Honesty signals ──
  out.push('', '## 3. Places that may record less than they show', '');
  const sig = [];
  const resolved = [];
  const add = (key, where, why) => (ignore[key] ? resolved.push(`| \`${key}\` | ${ignore[key]} |`) : sig.push(`| \`${where}\` | ${why} | \`${key}\` |`));
  const toolFiles = new Set();
  for (const entry of Object.values(tools)) if (existsSync(join(ROOT, entry))) for (const f of reachable(join(ROOT, entry))) toolFiles.add(f);
  // The user's lists: from the config, else the state slices the flow map names
  // ('profiles', 'businessModels'), else a guess at any plural.
  const mapSrc = cfg.flowMap?.file && existsSync(join(ROOT, cfg.flowMap.file)) ? code(read(join(ROOT, cfg.flowMap.file))) : '';
  const fromMap = [...new Set([...mapSrc.matchAll(/['"]([a-z]\w*s)['"]/g)].map(m => m[1]))];
  const lists = cfg.collections ?? fromMap;
  const collections = lists.length ? new RegExp(`\\.(${lists.join('|')})\\[0\\]`) : null;
  const NOT_USER_LIST = /^(args|parts|segments|matches|files|entries|keys|values|errors|touches|changedTouches|results|candidates|choices|lines|rows|cols|words|chunks|tokens|items|options|steps|children|nodes|elements|records|messages|content|data)$/;

  for (const f of toolFiles) {
    const lines = code(read(f)).split('\n');
    lines.forEach((line, i) => {
      // 3a. A handler DEFINITION whose last parameter is ignored. A leading
      // `_event` before a used parameter is just a position: not flagged.
      const m = line.match(/(?:\b(?:const|let)\s+|^\s*|\bfunction\s+)(handle\w+|on[A-Z]\w*|add\w+|save\w+|push\w+|pin\w+|record\w+|log\w+)\s*(?:=\s*(?:useCallback\()?\s*(?:async\s*)?|:\s*(?:async\s*)?)?\(([^()]*)\)\s*(?:=>|\{)/);
      if (m) {
        const params = m[2].split(',').map(s => s.trim().split(/[:=\s]/)[0]).filter(Boolean);
        const lastP = params[params.length - 1];
        if (params.length && /^_[a-z]\w*/.test(lastP)) add(`${rel(f)}#${m[1]}.${lastP}`, `${rel(f)}:${i + 1}`, `\`${m[1]}\` takes \`${lastP}\` and ignores it: is that data meant to be stored? (honesty §2)`);
      }
      // 3b. Sample data, flagged only when an item of it is given a control that writes.
      const fx = line.match(/\b(?:const|let)\s+((?:SAMPLE|DEMO|MOCK|FAKE|FIXTURE|PLACEHOLDER|EXAMPLE)\w*|\w*(?:Sample|Demo|Mock|Fake|Fixture|Placeholder|Example)s?\w*)\s*(?::[^=]+)?=\s*\[/i);
      if (fx) {
        const name = fx[1];
        const uses = lines.map((l, j) => (j !== i && new RegExp(`\\b${name}\\b\\s*\\.(map|forEach|flatMap)\\(`).test(l) ? j : -1)).filter(j => j >= 0);
        const writes = uses.some(j => lines.slice(j, j + 30).some(l => /\bon[A-Z]\w*=\{/.test(l) && (WRITE.test(l) || /\b(?:on|handle)?(?:add|save|pin|push|insert|record|import|apply)\w*\(/i.test(l))));
        if (writes) add(`${rel(f)}#${name}`, `${rel(f)}:${i + 1}`, `sample data \`${name}\` is listed with a control that writes: can it enter the user's record? (honesty §1)`);
      }
      // 3d. An input picked for the user.
      const z = collections ? line.match(collections) : line.match(/\.(\w+s)\[0\]/);
      if (z && !NOT_USER_LIST.test(z[1]) && !/split\(|match\(|exec\(/.test(line))
        add(`${rel(f)}#${z[1]}[0]`, `${rel(f)}:${i + 1}`, `\`${z[1]}[0]\`: with two, is the first the right one? Let the user choose, and show which was used (honesty §11)`);
    });
  }

  // 3c. Link fields declared in the types, read somewhere, written nowhere.
  const typeFiles = (cfg.types ?? []).map(t => join(ROOT, t)).filter(existsSync);
  if (typeFiles.length) {
    const fields = new Set();
    for (const t of typeFiles) for (const m of code(read(t)).matchAll(/^\s*(\w+(?:Id|Ids|Ref|Refs)|basedOn\w*|source[A-Z]\w*)\??\s*:/gm)) fields.add(m[1]);
    const srcFiles = ['components', 'services', 'src', 'app', 'lib', 'hooks', 'pages']
      .filter(d => existsSync(join(ROOT, d))).flatMap(d => [...walk(join(ROOT, d))])
      .concat(readdirSync(ROOT).filter(n => /\.(tsx?|jsx?)$/.test(n) && !/config|\.d\.ts$/.test(n)).map(n => join(ROOT, n)))
      .filter(f => !typeFiles.includes(f));
    const all = srcFiles.map(f => code(read(f))).join('\n');
    // `profileId: string` in a type or a parameter list is not a write.
    const TYPE_AFTER = '(?:string|number|boolean|undefined|null|[A-Z]\\w*(?:<[^>]*>)?(?:\\[\\])?)\\s*(?:[;,|)\\]}>=?]|$)';
    for (const fld of fields) {
      const isRead = new RegExp(`\\.${fld}\\b(?!\\s*=[^=])`).test(all);
      const written = new RegExp(`\\.${fld}\\s*=[^=]|[{,]\\s*${fld}\\s*[,}]|\\b${fld}\\s*:(?!\\s*${TYPE_AFTER})`, 'm').test(all);
      if (isRead && !written) add(`types#${fld}`, typeFiles.map(rel).join(', '), `\`${fld}\` is declared and read but never written: a link that's never set, so whatever depends on it never fires (honesty §10)`);
    }
  } else out.push('_Link fields not checked: set `types` in flows.config.json._', '');

  if (sig.length) {
    out.push('Signals, not verdicts. Check each one; fix it, or add its key to `ignore` with the reason.', '', '| Where | Why look | Key |', '|---|---|---|', ...sig.slice(0, 40));
    if (sig.length > 40) out.push(`| … | ${sig.length - 40} more | |`);
    failures += sig.length;
  } else out.push('None open.');
  if (resolved.length) out.push('', `Resolved (${resolved.length}):`, '', '| Key | Why it is fine |', '|---|---|', ...resolved);
  out.push('', '_Scripted: honesty §1, §2, §10, §11. The other eight patterns need reading (Phase 4)._');
}
console.log(out.join('\n'));
if (STRICT && failures) { console.log(`\n✗ ${failures} open item${failures > 1 ? 's' : ''}.`); process.exit(1); }
