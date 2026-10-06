#!/usr/bin/env node
// Tests for the React Native path (inventory, check-kit, check-tokens,
// check-writing, export-tokens). Plain Node, no dependencies:
//   node native.test.mjs
// Each case comes from the first run on a React Native app, where the
// web-only scripts printed zeros that read as "clean".
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '\n    ' + String(detail).slice(0, 600)}`); if (!ok) failed++; };

const dir = mkdtempSync(join(tmpdir(), 'ds-native-'));
const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
mkdirSync(join(dir, 'scripts'));
for (const f of readdirSync(here).filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))) copyFileSync(join(here, f), join(dir, 'scripts', f));

put('package.json', JSON.stringify({ name: 'fixture', dependencies: { expo: '54.0.0', 'react-native': '0.81.0' } }));
put('src/theme/tokens.js', `export const palette = {
  day: { ground: '#FDF6E3', ink: '#22313F' },
  night: { ground: '#141A21', ink: '#EEF1F4' },
};
export const space = { sm: 8, md: 16, lg: 24 };
export const radius = { md: 12, lg: 20 };
export const type = { body: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter' } };
`);
put('src/components/ui/Text.tsx', `import { Text } from 'react-native';
export const Body = ({ children }) => <Text style={{ fontSize: 15, fontFamily: 'Inter' }}>{children}</Text>;
`);
put('src/components/OldCard.tsx', `export default () => <View style={{ borderRadius: 18 }} />;\n`);
put('src/screens/Today.tsx', `import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Body } from '../components/ui/Text';
import { space } from '../theme/tokens';
export default function Today() {
  const p = new Promise<void>(r => r());
  return (
    <View style={{ padding: 16, gap: space.sm, borderRadius: 12 }}>
      <Text style={{ fontSize: 14.5, color: '#22313F' }}>Good morning</Text>
      <Text style={s.title}>Harbour Walk</Text>
      <Pressable onPress={() => {}}><Icon name="close" /></Pressable>
      <Pressable onPress={() => {}}><Text>Start Check In</Text></Pressable>
      <Body>Follow Pip</Body>
    </View>
  );
}
const s = StyleSheet.create({ title: { fontSize: 22, lineHeight: 27 } });
`);
put('design-system.config.json', JSON.stringify({
  srcDirs: ['src'], kitDir: 'src/components/ui', tokenModule: 'src/theme/tokens.js',
  tokenMap: { type: 'type', space: 'space', radius: 'radius', colors: ['palette.day', 'palette.night'] },
  writing: { properNames: ['Harbour Walk', 'Pip'] },
  claudeDesign: { name: 'Fixture', contrast: { text: ['ink'], grounds: ['ground'] } },
}));
const run = (script, ...args) => { const r = spawnSync(process.execPath, [join('scripts', script), ...args], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };

const inv = run('inventory.mjs');
check('the inventory says which stack it read', /Stack: react-native/.test(inv.out), inv.out);
check('it reads font sizes from style objects, not class names', /\| Font sizes \| 2 \| 2 \|/.test(inv.out), inv.out);
check('it counts a value used through a token separately', /\| Gaps \| 0 \| 0 \| 1 \|/.test(inv.out), inv.out);
check('it prints no class-name tables (zeros that mean "couldn\'t look")', !/Font size classes \(text-xs/.test(inv.out));
check('it finds a touchable with no label and no text', /no label and no text[^|]*\| 1 \|/.test(inv.out), inv.out);
check('it finds a text style with a size but no font family', /no font family[^|]*\| 2 \|/.test(inv.out), inv.out);
check('it lists tokens defined but never used', /never used[\s\S]*`space\.md`/.test(inv.out), inv.out);
check('it lists files nothing imports', /nothing imports[\s\S]*OldCard\.tsx/.test(inv.out), inv.out);
check('the tokens file is not counted as a screen', !/tokens\.js/.test(inv.out.split('## At a glance')[1]?.split('## Tokens defined')[0] ?? ''), inv.out);
check('Title Case honours proper names under "writing"', !/Harbour Walk|Follow Pip/.test(inv.out.split('## Words')[1] ?? '') && /Start Check In/.test(inv.out));

const tok = run('check-tokens.mjs', '--list');
check('check-tokens: a literal that equals a token is named', /padding: 16 is space\.md/.test(tok.out) && /borderRadius: 12 is radius\.md/.test(tok.out), tok.out);
check('check-tokens: a hand-set colour equal to a theme colour', /'#22313F' is palette\.day\.ink/.test(tok.out), tok.out);
check('check-tokens: off-scale font size', /fontSize: 14\.5 is off the type scale/.test(tok.out), tok.out);
check('check-tokens fails without --list', run('check-tokens.mjs').code === 1);

const kit = run('check-kit.mjs', '--init');
check('check-kit counts native metrics', /Stack: react-native/.test(kit.out) && /rawTouchable 2/.test(kit.out) && /unlabelledTouchable 1/.test(kit.out), kit.out);

const wr = run('check-writing.mjs', '--list');
check('check-writing: "new Promise" is code, not a label', !/Promise/.test(wr.out), wr.out);
check('check-writing: proper names under "writing" are kept', !/Harbour Walk|Pip/.test(wr.out) && /Start Check In/.test(wr.out), wr.out);

const ex = run('export-tokens.mjs');
let t = null; try { t = JSON.parse(readFileSync(join(dir, 'claude-design/tokens.json'), 'utf8')); } catch {}
const ink = t?.color.tokens.find(x => x.name === 'ink');
check('export-tokens: theme colours merge into one token per name', ink?.value.light === '#22313f' && ink?.value.dark === '#eef1f4', ex.out);
check('export-tokens: a type style keeps its line height and family', JSON.stringify(t?.type.groups[0].styles[0]) === JSON.stringify({ name: 'body', fontSize: '15px', lineHeight: '22px', family: 'inter' }), JSON.stringify(t?.type));
check('export-tokens: spacing in px', t?.spacing.tokens.some(x => x.name === 'space-md' && x.value === '16px'));

// status: first run, then a session's progress, then the update.
const st1 = run('status.mjs', '--save');
check('status: the first run lists phases and a plan', /first run/.test(st1.out) && /## Where it stands/.test(st1.out) && /## Next/.test(st1.out), st1.out);
check('status: an undone phase says what is missing, not the requirement', /no docs\/design-decisions\.md/.test(st1.out), st1.out);
put('docs/design-decisions.md', '# Design decisions\n\nSigned off: 2026-10-06\n');
put('src/screens/Today.tsx', readFileSync(join(dir, 'src/screens/Today.tsx'), 'utf8').replace('fontSize: 14.5, ', ''));
const st2 = run('status.mjs');
check('status: a restart reports phases newly done', /Done since then: 1\. Decisions signed off/.test(st2.out), st2.out);
check('status: a restart reports counts that fell', /Hand-set font sizes \| 2 \| 1 \| ↓ better/.test(st2.out), st2.out);
check('status: without --save it writes nothing', JSON.parse(readFileSync(join(dir, 'design-system-status.json'), 'utf8')).runs.length === 1);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
