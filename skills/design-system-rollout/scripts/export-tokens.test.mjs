#!/usr/bin/env node
// Tests for export-tokens.mjs. Plain Node, no dependencies:
//   node scripts/design/export-tokens.test.mjs
// Each case is a bug the exporter once had and reported success over.
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };

function run(css, claudeDesign) {
  const dir = mkdtempSync(join(tmpdir(), 'export-tokens-'));
  mkdirSync(join(dir, 'scripts'));
  for (const f of ['export-tokens.mjs', 'lib.mjs']) copyFileSync(join(here, f), join(dir, 'scripts', f));
  writeFileSync(join(dir, 'index.css'), css);
  writeFileSync(join(dir, 'design-system.config.json'), JSON.stringify({ tokenFiles: ['index.css'], typeTokenPrefix: '--t-', claudeDesign }));
  const r = spawnSync(process.execPath, ['scripts/export-tokens.mjs'], { cwd: dir, encoding: 'utf8' });
  let tokens = null;
  try { tokens = JSON.parse(readFileSync(join(dir, 'claude-design/tokens.json'), 'utf8')); } catch {}
  return { code: r.status, out: r.stdout + r.stderr, tokens };
}
const colour = (t, n) => t.color.tokens.find(x => x.name === n);

// The dark block comes FIRST in the file, the shell override after it: file
// order would get both themes wrong.
const CSS = `
.dark .shell { --ink: #EEEEEE; /* dark ink */ }
.dark { --ground: #111111; --shadow-lift: 0 1px 2px rgba(0,0,0,.5); }
:root {
  --ground: #FFFFFF;  /* base ground, overridden in the shell */
  --ink: #333333;
  --accent: #D4582A;
  --ink-alias: var(--ink);
  --shadow-lift: 0 1px 2px rgba(0,0,0,.1);
  --t-body: 0.8125rem;
}
.shell {
  --ground: #E7E9EC;  /* shell ground */
}
.shell p { font-size: var(--t-body); line-height: 1.45; font-weight: 500; }
`;
const THEMES = { light: [':root', '.shell'], dark: ['.dark', '.dark .shell'] };

const a = run(CSS, { name: 'Test', themes: THEMES, include: ['--'] });
check('exits 0 when every scope is listed', a.code === 0, a.out);
check('a scoped override beats the base block (light)', colour(a.tokens, 'ground')?.value.light === '#e7e9ec', JSON.stringify(colour(a.tokens, 'ground')));
check('dark wins over the shell although it comes first in the file', colour(a.tokens, 'ground')?.value.dark === '#111111', JSON.stringify(colour(a.tokens, 'ground')));
check('the most specific dark scope wins', colour(a.tokens, 'ink')?.value.dark === '#eeeeee');
check('a theme with no override inherits the base', colour(a.tokens, 'accent')?.value.dark === '#d4582a');
check('the note comes from the declaration that won', colour(a.tokens, 'ground')?.usage === 'shell ground', colour(a.tokens, 'ground')?.usage);
check('an alias stays an alias', colour(a.tokens, 'ink-alias')?.value.light === '{ink}');
check('shadows keep their dark value', a.tokens?.shadow.tokens[0]?.value?.dark === '0 1px 2px rgba(0,0,0,.5)', JSON.stringify(a.tokens?.shadow.tokens[0]));
check('hex is lower case', !JSON.stringify(a.tokens?.color).match(/#[0-9A-F]*[A-F][0-9A-F]*"/));
const body = a.tokens?.type.groups[0].styles.find(s => s.name === 'body');
check('a text style carries weight and line height', body?.fontWeight === 500 && body?.lineHeight === 1.45, JSON.stringify(body));

// The bug that started this: an override scope missing from the config.
const b = run(CSS, { name: 'Test', themes: { light: [':root'], dark: ['.dark'] }, include: ['--'] });
check('an unlisted override scope fails loudly (exit 1)', b.code === 1 && /"\.shell" redeclares/.test(b.out), b.out.slice(-300));

// Hand-added data survives a re-export.
const c = run(CSS, { name: 'Test', themes: THEMES, include: ['--'], notes: { '--accent': 'Brand accent' }, overrides: { tokens: { ink: { usage: 'Body text' } } } });
check('notes map fills a note without touching the CSS', colour(c.tokens, 'accent')?.usage === 'Brand accent');
check('overrides survive a re-export', colour(c.tokens, 'ink')?.usage === 'Body text');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
