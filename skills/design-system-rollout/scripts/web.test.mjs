#!/usr/bin/env node
// Tests for the web path and the shared scripts. Plain Node, no dependencies:
//   node web.test.mjs
// Each case is a problem a real run reported.
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '\n    ' + String(detail).slice(0, 700)}`); if (!ok) failed++; };

// A project in a folder with a space in its name: the writing check once checked nothing there.
const dir = join(mkdtempSync(join(tmpdir(), 'ds-web-')), 'My App');
const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
mkdirSync(join(dir, 'scripts'), { recursive: true });
for (const f of readdirSync(here).filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))) copyFileSync(join(here, f), join(dir, 'scripts', f));
const run = (script, ...args) => { const r = spawnSync(process.execPath, [join('scripts', script), ...args], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };

put('package.json', JSON.stringify({ name: 'web', devDependencies: { tailwindcss: '3.4.0' }, scripts: { 'check:tokens': 'x', 'check:kit': 'x', 'check:writing': 'x' } }));
put('src/index.css', `:root {
  --ds-text-body: 15px;
  --ds-ink: #22313f;
  --ds-ok-tint: #e6f4ea;
  --ds-warn-tint: #fff4e5;
  --ds-unused: #123456;
}
`);
put('src/Home.tsx', `export const Home = ({ tone }) => (<div>
  <h2 className="text-lg">Order History</h2>
  <p style={{ color: 'var(--ds-ink)', background: \`var(--ds-\${tone}-tint)\` }}>Hi</p>
  <button className="px-3 py-2 rounded-lg bg-blue-600">Save Changes</button>
  <button className="px-3 py-2 rounded-lg bg-blue-600">Keep</button> {/* kit-exempt: third-party widget */}
</div>);
`);
put('seed.ts', 'export const sample = "<button>Seed Data Here</button>";\n');           // a root file that is exempt
put('assets/logo.png', '');                                                            // an empty file
put('assets/icon.png', Buffer.from('89504e470d0a1a0a0000000d494844520000020000000200', 'hex'));
put('assets/photo.jpg', Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0001108012c01900301220002110103110100', 'hex'));
put('app.json', JSON.stringify({ expo: { icon: './assets/icon.png' } }));               // referenced from config, not code
put('.github/workflows/ci.yml', 'jobs:\n  ui:\n    steps:\n      - run: node scripts/check-kit.mjs\n');
put('design-system.config.json', JSON.stringify({ srcDirs: ['src'], kitDir: 'src/ui', tokenFiles: ['src/index.css'], typeTokenPrefix: '--ds-text-', exempt: ['node_modules', 'seed.ts'], properNames: ['Order History'] }));

const inv = run('inventory.mjs');
check('root files honour "exempt" (seed.ts is not scanned)', !/Seed Data Here/.test(inv.out) && !/seed\.ts/.test(inv.out), inv.out);
check('the inventory skips a line marked kit-exempt (1 raw button, not 2)', /\| raw <button> \| 1 \|/.test(inv.out), inv.out.split('## Hand-built')[1]?.slice(0, 300));
check('a token used through a built name is "maybe used", not unused', /--ds-unused/.test(inv.out.split('## Tokens not found by name')[1] ?? '') && /2 more may be used through a name built at runtime/.test(inv.out) && !/`--ds-ok-tint`.*appears nowhere/.test(inv.out), inv.out.split('## Tokens not found')[1]);
const art = inv.out.split('## Art and images')[1] ?? '';
check('an image referenced from app.json counts as used', /icon\.png \| 1x \| 512×512 \| \d+ \| yes \|/.test(art), art);
check('a JPEG\'s pixel size is read', /photo\.jpg \| 1x \| 400×300 \|/.test(art), art);
check('an empty image file is flagged', /1 empty file/.test(art) && /logo\.png[^\n]*0 \(empty\)/.test(art), art);
check('"Used" says yes or no', /\| yes \|/.test(art) && /\| no \|/.test(art), art);

const wr = run('check-writing.mjs', '--list');
check('check-writing runs from a folder with a space in its path', /Save Changes/.test(wr.out) && !/Order History/.test(wr.out), wr.out);
check('check-writing skips exempt root files', !/Seed Data Here/.test(wr.out), wr.out);

const st = run('status.mjs');
check('status sees the guards in CI when the workflow calls the script directly', /2\. Guards \| ✅ \| 3\/3 npm scripts, in CI/.test(st.out), st.out.split('## Where it stands')[1]?.slice(0, 600));

// The exporter: no prefixes configured, no font tokens.
put('src/index.css', `:root {
  --ds-text-body: 15px;
  --ds-ink: #22313f;
  --ds-radius-md: 8px;
  --ds-space-4: 16px;
  --ds-shadow-raise: 0 1px 2px rgba(0,0,0,.1);
}
`);
put('design-system.config.json', JSON.stringify({ srcDirs: ['src'], tokenFiles: ['src/index.css'], typeTokenPrefix: '--ds-text-', claudeDesign: { name: 'Web', themes: { light: [':root'] }, include: ['--ds-'] } }));
run('export-tokens.mjs');
let t = null; try { t = JSON.parse(readFileSync(join(dir, 'claude-design/tokens.json'), 'utf8')); } catch {}
check('export: radius, spacing and shadow are found by name with no prefixes configured', t?.radius.tokens.length === 1 && t?.spacing.tokens.length === 1 && t?.shadow.tokens.length === 1, JSON.stringify(t && { r: t.radius, s: t.spacing, sh: t.shadow }));
check('export: with no font tokens, the type group points at a family that exists', t && t.type.families[t.type.groups[0].family], JSON.stringify(t?.type));

// The kit bundler passes every React export through (Headless UI / react-aria read React.version).
const bundle = readFileSync(join(here, 'bundle-kit.mjs'), 'utf8');
check('bundle-kit: React is passed through whole, not as a fixed list', /'react': 'module\.exports = window\.React;'/.test(bundle));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
