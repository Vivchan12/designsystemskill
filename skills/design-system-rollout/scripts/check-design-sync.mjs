#!/usr/bin/env node
// Is the Claude Design file behind the code? Records a fingerprint of the
// files each artboard (and the design system) was built from, and flags any
// that changed since. The rule "update the artboard with the change" only
// holds if something notices when it wasn't.
//
//   node scripts/design/check-design-sync.mjs              # report what's stale (exit 0)
//   node scripts/design/check-design-sync.mjs --strict     # exit 1 if anything is stale (CI)
//   node scripts/design/check-design-sync.mjs --update Main tokens   # after publishing those
//   node scripts/design/check-design-sync.mjs --update all
//
// Config, design-system.config.json:
//   "claudeDesign": { "sync": {
//     "lock": "claude-design.lock.json",                       committed
//     "screens": { "Main": ["components/Home.tsx", "components/Layout.tsx"], … }
//   } }
// "tokens" (the token files) and "kit" (the kit folder) are always tracked.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { loadConfig } from './lib.mjs';

const cfg = loadConfig();
const sync = cfg.claudeDesign?.sync ?? {};
const lockFile = join(cfg.root, sync.lock ?? 'claude-design.lock.json');
const groups = { tokens: cfg.tokenFiles, kit: [cfg.kitDir], ...sync.screens };

const files = (p) => {
  const abs = join(cfg.root, p);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [abs];
  return readdirSync(abs).flatMap(f => (/(^\.|\.test\.|\.stories\.)/.test(f) ? [] : files(join(p, f))));
};
const fingerprint = (paths) => {
  const h = createHash('sha256');
  for (const f of paths.flatMap(files).sort()) h.update(relative(cfg.root, f) + '\0' + readFileSync(f));
  return h.digest('hex').slice(0, 16);
};
let ref = '';
try { ref = execSync('git rev-parse --short HEAD', { cwd: cfg.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}

const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
const args = process.argv.slice(2);
if (args.includes('--update')) {
  const names = args.slice(args.indexOf('--update') + 1).filter(a => !a.startsWith('--'));
  const which = names.includes('all') ? Object.keys(groups) : names;
  const unknown = which.filter(n => !groups[n]);
  if (unknown.length) { console.error(`Unknown: ${unknown.join(', ')}. Known: ${Object.keys(groups).join(', ')}`); process.exit(1); }
  for (const n of which) lock[n] = { fingerprint: fingerprint(groups[n]), ref, at: new Date().toISOString() };
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  console.log(`Recorded ${which.join(', ')} as in sync at ${ref || 'the working tree'}. Commit ${relative(cfg.root, lockFile)}.`);
  process.exit(0);
}

const stale = [];
for (const [name, paths] of Object.entries(groups)) {
  const now = fingerprint(paths);
  if (!lock[name]) stale.push(`${name}: never recorded (publish it, then --update ${name})`);
  else if (lock[name].fingerprint !== now) stale.push(`${name}: its source changed since ${lock[name].ref || lock[name].at.slice(0, 10)}. ${name === 'tokens' ? 'Run design:tokens and update the system' : name === 'kit' ? 'Run design:kit and update the system' : 're-capture it and update the artboard'}, then --update ${name}`);
}
if (!stale.length) { console.log(`Design file in sync: ${Object.keys(groups).join(', ')}.`); process.exit(0); }
console.log(`The design file is behind the code:\n${stale.map(s => '- ' + s).join('\n')}`);
process.exit(args.includes('--strict') ? 1 : 0);
