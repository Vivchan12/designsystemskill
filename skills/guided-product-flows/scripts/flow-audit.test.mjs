#!/usr/bin/env node
// Tests for flow-audit.mjs. Plain Node, no dependencies:
//   node flow-audit.test.mjs
// Each case is a false positive or a miss the audit once had.
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const audit = join(dirname(fileURLToPath(import.meta.url)), 'flow-audit.mjs');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '\n    ' + detail}`); if (!ok) failed++; };

function project(files, config) {
  const dir = mkdtempSync(join(tmpdir(), 'flow-audit-'));
  for (const [p, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); }
  writeFileSync(join(dir, 'flows.config.json'), JSON.stringify(config));
  const run = (...args) => { const r = spawnSync(process.execPath, [audit, ...args], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout }; };
  return run;
}

const files = {
  'types.ts': 'export interface ValueProp {\n  id: string;\n  profileId?: string;\n  basedOnId?: string;\n}\n',
  'flow.ts': `export const UPSTREAM = {
  VALUE_PROP: ['PERSONAS'],
  // SUMMARY: ['VALUE_PROP'],   (a comment: must not count as listed)
};
export const SLICES = { PERSONAS: ['profiles'], VALUE_PROP: ['valueProps'] };\n`,
  'Setup.tsx': 'export default () => <Wizard />;\n',
  'Personas.tsx': `const EXAMPLE_QUOTES = ['"It just works."'];
export default function Personas({ setProfiles, addEvidence }) {
  const onPick = (src, _quote) => addEvidence(src);
  const handleAuth = (_event, session) => setProfiles(session.profiles);
  return <Wizard>{EXAMPLE_QUOTES.map(q => (
    <button onClick={() => addEvidence('Interview', q)}>Pin</button>
  ))}</Wizard>;
}\n`,
  'ValueProp.tsx': `const SAMPLE_ROWS = ['Example row'];
export default function ValueProp({ state, setValueProps }) {
  const persona = state.profiles[0];
  const first = 'abc'.split('')[0];
  const linked = state.valueProps.filter(v => v.profileId === persona.id);
  const make = () => setValueProps([...state.valueProps, { id: 'x', basedOnId: persona.id }]);
  return <Wizard>{SAMPLE_ROWS.map(r => <p key={r}>{r}</p>)}</Wizard>;
}\n`,
  'Summary.tsx': 'export default () => <div>summary</div>;\n',
};
const config = {
  tools: { Setup: 'Setup.tsx', Personas: 'Personas.tsx', 'Value prop': 'ValueProp.tsx', Summary: 'Summary.tsx' },
  root: 'Setup',
  flowMap: { file: 'flow.ts', ids: { Setup: 'SETUP', Personas: 'PERSONAS', 'Value prop': 'VALUE_PROP', Summary: 'SUMMARY' } },
  types: ['types.ts'],
};
const run = project(files, config);
const r = run();
const row = (name) => r.out.split('## 2')[1].split('\n').find(l => l.startsWith(`| ${name} |`)) ?? '';   // the flow-map table

check('the root tool is not reported missing from the map', /root/.test(row('Setup')) && !/❌/.test(row('Setup')), row('Setup'));
check('an id that appears only in a comment is not "listed"', /❌ not listed/.test(r.out.split('## 2')[1].split('\n').find(l => l.startsWith('| Summary |')) ?? ''), r.out);
check('a tool with no path is ❌', /\| Summary \| ❌ none/.test(r.out));
check('a dropped LAST argument is flagged', /onPick.*_quote/.test(r.out), r.out);
check('a leading `_event` before a used argument is not flagged', !/_event/.test(r.out));
check('sample data with a control that writes is flagged', /EXAMPLE_QUOTES/.test(r.out));
check('sample data shown read-only is not flagged', !/SAMPLE_ROWS/.test(r.out));
check('`profiles[0]` on a user list is flagged; split()[0] is not', /profiles\[0\]/.test(r.out) && !/split/.test(r.out.split('## 3')[1]));
check('a link field read but never written is flagged', /`profileId` is declared and read but never written/.test(r.out), r.out.split('## 3')[1]);
check('a link field that is written is not flagged', !/`basedOnId` is declared/.test(r.out));
check('the report exits 0 without --strict', r.code === 0);
check('--strict exits 1 while anything is open', run('--strict').code === 1);

// Fixed: Summary gets a checklist and a map entry; the signals are resolved in `ignore`.
const fixed = project({
  ...files,
  'Summary.tsx': 'export default () => <Checklist />;\n',
  'flow.ts': files['flow.ts'].replace("// SUMMARY: ['VALUE_PROP'],   (a comment: must not count as listed)", "SUMMARY: ['VALUE_PROP'],"),
}, {
  ...config, checklistMarker: '<Checklist\\b',
  ignore: { 'Personas.tsx#onPick._quote': 'test', 'Personas.tsx#EXAMPLE_QUOTES': 'test', 'ValueProp.tsx#profiles[0]': 'test', 'types#profileId': 'test' },
});
const f = fixed('--strict');
check('--strict passes once every item is fixed or resolved', f.code === 0, f.out);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
