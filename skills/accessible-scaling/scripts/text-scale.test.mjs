#!/usr/bin/env node
// Tests for scale-table.mjs and text-scale-audit.mjs. Plain Node, no dependencies:
//   node text-scale.test.mjs [path/to/text-scale.config.json]
// Runs from the skill, or from a copy in a project: it needs only the scripts
// beside it. Checks that need the skill's assets are skipped when they're absent.
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '\n    ' + String(detail).slice(0, 700)}`); if (!ok) failed++; };
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'text-scale-'));
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), typeof t === 'string' ? t : JSON.stringify(t)); }
  return (script, ...args) => { const r = spawnSync(process.execPath, [join(here, script), ...args], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
}
// The policy the table checks: a config passed in, else the skill's template, else this copy of it.
const DEFAULT_CONFIG = { policy: { minScale: 0.8, maxScale: 2, minSize: 12 }, roles: {
  caption: { size: 12, lineHeight: 16 }, label: { size: 13, lineHeight: 18 },
  body: { size: 15, lineHeight: 22, reading: true, minSize: 14 }, lead: { size: 17, lineHeight: 24, reading: true, minSize: 15 },
  title: { size: 20, lineHeight: 26, maxScale: 1.75 }, heading: { size: 28, lineHeight: 34, maxScale: 1.35 }, display: { size: 36, lineHeight: 42, maxScale: 1.25 } },
  icons: { sizes: { sm: 16, md: 20, lg: 24 }, maxScale: 1.5 } };
const asset = (f) => join(here, '../assets', f);
const configArg = process.argv[2];
const template = configArg ? JSON.parse(readFileSync(configArg, 'utf8')) : existsSync(asset('text-scale.config.json')) ? JSON.parse(readFileSync(asset('text-scale.config.json'), 'utf8')) : DEFAULT_CONFIG;
const ownPolicy = !!configArg;   // a project's own policy: the default-number checks below don't apply
const row = (out, setting) => out.split('\n').find(l => l.startsWith(`| ${setting} |`)) ?? '';

// ── The scale ──
const run = project({ 'text-scale.config.json': template });
const t = run('scale-table.mjs');
check('the template policy has no problems', t.code === 0 && /No problems/.test(t.out), t.out);
if (!ownPolicy) {
check('the default setting renders every role at its base size', /\| 12 \| 13 \| 15 \| 17 \| 20 \| 28 \| 36 \|$/.test(row(t.out, 'iPhone Large (default)')), row(t.out, 'iPhone Large (default)'));
check('the smallest setting is held at 80%, and body text is lifted to its 14pt floor', /82%/.test(row(t.out, 'iPhone xSmall')) && /\| 14† \|/.test(row(t.out, 'iPhone xSmall')), row(t.out, 'iPhone xSmall'));
check('no text renders below 12pt at any setting', !t.out.split('\n').filter(l => /^\| (iPhone|Android)/.test(l)).some(l => l.split('|').slice(3).some(c => parseFloat(c) < 12)), t.out);
check('reading text reaches 200% (body 15 → 30)', /\| 30\*? \|/.test(row(t.out, 'Android 200%')), row(t.out, 'Android 200%'));
check('above 200% the setting is held at 200%', /↓ held/.test(row(t.out, 'iPhone Accessibility 5')) && /\| 30\* \|/.test(row(t.out, 'iPhone Accessibility 5')), row(t.out, 'iPhone Accessibility 5'));
check('large headings stop growing sooner (display 36 → 45 at 125%)', /\| 45\* \|$/.test(row(t.out, 'Android 200%')), row(t.out, 'Android 200%'));

const flip = project({ 'text-scale.config.json': { ...template, roles: { ...template.roles, title: { size: 20, lineHeight: 26, maxScale: 1.6 } } } })('scale-table.mjs');
check('a heading that stops below the body text is reported, with the fix', flip.code === 1 && /"title" renders smaller than "lead"/.test(flip.out) && /maxScale to at least 1\.70/.test(flip.out), flip.out.split('## Problems')[1]);
const capped = project({ 'text-scale.config.json': { ...template, roles: { ...template.roles, body: { size: 15, lineHeight: 22, reading: true, maxScale: 1.5 } } } })('scale-table.mjs');
check('reading text capped below 200% is reported (WCAG 1.4.4)', capped.code === 1 && /"body" is reading text but can only grow to 150%/.test(capped.out), capped.out.split('## Problems')[1]);
const tight = project({ 'text-scale.config.json': { ...template, roles: { ...template.roles, label: { size: 13, lineHeight: 13 } } } })('scale-table.mjs');
check('a line height under 1.15× is reported', /"label" line height 13 is under 1\.15×/.test(tight.out), tight.out.split('## Problems')[1]);

}
const ts = run('scale-table.mjs', '--emit', 'ts');
check('--emit ts writes a helper with the policy and roles', /export function scaledText/.test(ts.out) && /TEXT_ROLES/.test(ts.out) && /"minScale":/.test(ts.out), ts.out.slice(0, 300));
// The generated helper gives the same sizes as the table.
const helper = ts.out.replace(/^import .*$/m, 'const PixelRatio = { getFontScale: () => 1 };').replace(/ as const/g, '').replace(/export type .*$/m, '').replace(/export /g, '').replace(/size: number/, 'size').replace(/\(\): number =>/, '() =>').replace(/\(globalThis as any\)/, 'globalThis').replace(/role: TextRole/, 'role').replace(/TEXT_ROLES\[role\]/, 'TEXT_ROLES[role]');
const scaledText = new Function(`${helper}; return scaledText;`)();
if (!ownPolicy) {
check('the helper: body at the smallest setting is 14 (the floor)', scaledText('body', 14 / 17).fontSize === 14, JSON.stringify(scaledText('body', 14 / 17)));
check('the helper: body at 200% is 30, line height grows with it', scaledText('body', 2).fontSize === 30 && scaledText('body', 2).lineHeight === 44, JSON.stringify(scaledText('body', 2)));
check('the helper: body at 312% is held at 30', scaledText('body', 53 / 17).fontSize === 30);
check('the helper: display at 200% is held at 45', scaledText('display', 2).fontSize === 45);
check('the helper: icons grow with the text but stop at 1.5× (20 → 30), and never shrink', /export function scaledIcon/.test(ts.out) && new Function(`${helper}; return scaledIcon;`)()(20, 2) === 30 && new Function(`${helper}; return scaledIcon;`)()(20, 0.8) === 20, ts.out.slice(-600));
check('the table shows icon sizes per setting', /## Icons/.test(t.out) && /\| Android 200% \| 200% \| 24 \| 30 \| 36 \|/.test(t.out), t.out.split('## Icons')[1]);
}
const css = run('scale-table.mjs', '--emit', 'css');
if (!ownPolicy) check('--emit css writes an icon size per step, growing with the text up to 1.5×', /--icon-md: clamp\(20px, 1\.25rem, 30px\);/.test(css.out), css.out);
check('--emit css says the file must be imported (Tailwind reading it does not load it)', /@import/.test(css.out) && /not load/.test(css.out), css.out.slice(0, 400));
check('--emit css writes the floor for the review tool', /--text-scale-floor: 12px;/.test(css.out), css.out);
const pre = run('scale-table.mjs', '--emit', 'css', '--prefix', 'ds');
check('--emit css --prefix ds names them --ds-text-* and --ds-icon-*, not a second family', /--ds-text-body: clamp/.test(pre.out) && /--ds-icon-md: clamp/.test(pre.out) && !/--text-body:|--icon-md:/.test(pre.out), pre.out);
if (!ownPolicy) check('--emit css writes a clamp per role, floor and ceiling in px', /--text-body: clamp\(14px, 0\.9375rem, 30px\);/.test(css.out) && /--text-display: clamp\(28\.8px, 2\.25rem, 45px\);/.test(css.out), css.out);

// ── The audit ──
const audit = project({
  'text-scale.config.json': { srcDirs: ['src'], kitDir: 'src/components/ui' },
  'src/components/ui/Text.tsx': "import { scaledText } from '../../theme/textScale';\nexport const Text = (p) => <RNText allowFontScaling={false} style={scaledText(p.role)} />;\n",
  'src/screens/Home.tsx': `<Text allowFontScaling={false}>Hi</Text>
<Text maxFontSizeMultiplier={1.3}>Capped</Text>
<Text maxFontSizeMultiplier={2}>Fine</Text>
<Text adjustsFontSizeToFit numberOfLines={1}>Squeezed</Text>
<Text allowFontScaling={false}>Badge</Text> // text-scale-exempt: decorative count inside a fixed-size badge
`,
  'src/web/site.css': 'html { font-size: 14px; }\n.title { font-size: 22px; }\n.body { font-size: 1rem; }\n',
  'src/web/index.html': '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">\n',
  'src/ios/Views.swift': 'Text("Hi").font(.system(size: 17))\nText("Ok").font(.custom("Brand", size: 17, relativeTo: .body))\nlet f = UIFont.systemFont(ofSize: 15)\nlet g = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont.systemFont(ofSize: 15))\n',
  'src/android/item.xml': '<TextView android:textSize="14dp" />\n<TextView android:textSize="14sp" />\n',
  'src/web/Nav.jsx': `import { LogOut, MapPin } from 'lucide-react';
import { Icon } from './ui/Icon';
<LogOut size={18} /> <span>Logout</span>
<MapPin className="w-4 h-4" /> Location (rem: grows with the text)
<HomeIcon width={16} height={16} />
<Icon name="home" />
<svg width="16" height="16" viewBox="0 0 16 16" />
<LogOut size={scaledIcon(18)} />
<Button size="sm">Ok</Button>
<MapPin className="w-[16px] h-[16px]" />
<button className="min-h-[44px] text-base">Go</button>
<div className="h-[40px] text-sm">Fixed</div>
<p className="truncate" data-text-clamp>A deliberate one-line preview</p>
<p className="truncate">A location that should wrap</p>
`,
  'src/components/ui/Icon.tsx': "import { Home } from 'lucide-react';\nexport const Icon = (p) => <Home size={scaledIcon(20)} />;\nexport const Tiny = () => <Home size={16} />; // fixed on purpose? no: still in the kit, but the kit sizes with scaledIcon\n",
  'src/flutter/main.dart': 'MediaQuery(data: q.copyWith(textScaler: TextScaler.noScaling), child: app)\n',
});
const a = audit('text-scale-audit.mjs');
const line = (what) => a.out.split('\n').find(l => l.includes(what)) ?? '';
check('audit: scaling switched off on a screen is found; in the kit (applying the scale) it is not', /\| system text scaling turned off \| 1 \|/.test(a.out) && !/Text\.tsx/.test(line('system text scaling turned off')), line('system text scaling turned off'));
check('audit: a line marked text-scale-exempt is skipped', !/Home\.tsx:5/.test(a.out));
check('audit: a cap below 200% is found, a cap of 2 is not', /\| scaling capped below 200% \| 1 \|/.test(a.out), line('capped below'));
check('audit: shrink-to-fit and one-line truncation are found as layout breaks', /text shrunk to fit/.test(a.out) && /cut to one line/.test(a.out));
check('audit: web px sizes, a fixed root size and disabled zoom are found', /font size in px \| 1 \|/.test(a.out) && /root font size fixed in px/.test(a.out) && /zoom disabled/.test(a.out), a.out);
check('audit: iOS fixed sizes are found; relativeTo and UIFontMetrics are not', /fixed font size in SwiftUI \| 1 \|/.test(a.out) && /fixed font size in UIKit \| 1 \|/.test(a.out), a.out);
check('audit: Android dp text size found, sp not', /text size in dp or px .* \| 1 \|/.test(a.out), line('text size in dp'));
check('audit: Flutter no-scaling found', /Flutter \| text scaling turned off/.test(a.out));
const icons = line('icon at a fixed size');
check('audit: fixed-size icons are found (lucide size, *Icon width, svg width, w-[16px]), one per element, in the kit too', /\| icon at a fixed size \(text grows, it doesn't\) \| 5 \|/.test(a.out) && /Icon\.tsx:3/.test(icons), icons || a.out);
check('audit: an icon sized with scaledIcon or rem (w-4), a kit Icon and a Button size="sm" are not', !/Nav\.jsx:(4|6|8|9)\b/.test(icons) && !/Icon\.tsx:2/.test(icons), icons);
const fixedH = line('fixed height on a text container');
check('audit: min-h-[44px] is not a fixed height; h-[40px] around text is', /Nav\.jsx:12/.test(fixedH) && !/Nav\.jsx:11/.test(fixedH), fixedH);
const cut = line('text cut off with nowrap');
check('audit: a truncation marked data-text-clamp is deliberate; one without is a finding', /Nav\.jsx:14/.test(cut) && !/Nav\.jsx:13/.test(cut), cut);
check('audit: fixed icons break the layout but do not block the setting', /Breaks at large sizes[\s\S]*icon at a fixed size/.test(a.out) && !/Blocks the setting[^#]*icon at a fixed size/.test(a.out));
check('audit: --strict fails while anything blocks the setting', audit('text-scale-audit.mjs', '--strict').code === 1);
// The generated scale must be loaded in the browser, not only read by Tailwind.
const gen = '/* Generated by scale-table.mjs from text-scale.config.json. Don\'t edit by hand. */\n:root { --text-body: clamp(14px, 0.9375rem, 30px); }\n';
const notLoaded = project({ 'text-scale.config.json': { srcDirs: ['src'] }, 'src/theme/text-scale.css': gen, 'src/index.css': '@tailwind base;\n', 'tailwind.config.js': "require('./src/theme/text-scale.css')\n" })('text-scale-audit.mjs');
check('audit: a generated scale that nothing imports is found (it blocks the setting)', /generated text scale is never loaded/.test(notLoaded.out) && /Blocks the setting/.test(notLoaded.out), notLoaded.out);
const loaded = project({ 'text-scale.config.json': { srcDirs: ['src'] }, 'src/theme/text-scale.css': gen, 'src/index.css': "@import './theme/text-scale.css';\n" })('text-scale-audit.mjs');
check('audit: an imported generated scale is fine', !/never loaded/.test(loaded.out), loaded.out);

// The review tool: its own files aren't findings; where it's loaded is listed, and --strict fails if it would ship.
if (existsSync(asset('text-scale-preview.js'))) {
const tool = readFileSync(asset('text-scale-preview.js'), 'utf8');
check('review tool: no hex colours (a project\'s token guard would flag them)', !/#[0-9a-fA-F]{3,8}\b/.test(tool.replace(/\/\*[\s\S]*?\*\//g, '')) && !/['"]#[0-9a-fA-F]{3,8}['"]/.test(readFileSync(asset('TextScalePreview.tsx'), 'utf8')));
check('review tool: data-text-clamp opts a deliberate clamp out, and text at its floor is not "doesn\'t grow"', /data-text-clamp/.test(tool) && /--text-scale-floor/.test(tool));
check('review tool: checks for sideways scrolling', /scrollWidth\s*>\s*(window\.)?innerWidth|innerWidth\s*</.test(tool));
const withTool = project({
  'text-scale.config.json': { srcDirs: ['src'] },
  'src/text-scale-preview.js': tool,
  'src/dev/TextScalePreview.tsx': readFileSync(join(here, '../assets/TextScalePreview.tsx'), 'utf8'),
  'src/main.tsx': "import './index.css';\nif (import.meta.env.DEV) import('./text-scale-preview.js');\n",
  'src/App.tsx': "import { TextScalePreview } from './dev/TextScalePreview';\nexport default () => __DEV__\n  ? <TextScalePreview><Root /></TextScalePreview>\n  : <Root />;\n",
});
const wt = withTool('text-scale-audit.mjs');
check('audit: the review tool\'s own files are not findings', !/TextScalePreview\.tsx|src\/text-scale-preview\.js:/.test(wt.out.split('## Review tool')[0]), wt.out);
check('audit: where the review tool is loaded is listed, as a reminder to remove it', /## Review tool still installed/.test(wt.out) && /src\/main\.tsx:2/.test(wt.out) && /src\/App\.tsx:1/.test(wt.out), wt.out);
check('audit: --strict passes while the tool is loaded in development only', withTool('text-scale-audit.mjs', '--strict').code === 0, withTool('text-scale-audit.mjs', '--strict').out);
const shipped = project({ 'text-scale.config.json': { srcDirs: ['src'] }, 'src/main.tsx': "import './text-scale-preview.js';\n", 'src/text-scale-preview.js': tool });
const sh = shipped('text-scale-audit.mjs', '--strict');
check('audit: --strict fails when the review tool would ship (loaded without a development guard)', sh.code === 1 && /would ship/.test(sh.out), sh.out);
}
if (existsSync(asset('large-text.js'))) {
  const lt = readFileSync(asset('large-text.js'), 'utf8');
  check('large-text switch: sets data-text-scale on the root from a probe, keyed for any-ancestor variants', /ResizeObserver/.test(lt) && /data-text-scale|dataset\.textScale/.test(lt) && /\[data-text-scale="large"\] &/.test(lt));
}

// Portable: a copy of this test beside the scripts, with no assets, still passes.
if (!process.env.TEXT_SCALE_TEST_NESTED) {
  const copy = mkdtempSync(join(tmpdir(), 'text-scale-copy-'));
  for (const f of ['scale-table.mjs', 'text-scale-audit.mjs', 'text-scale.test.mjs']) copyFileSync(join(here, f), join(copy, f));
  const r = spawnSync(process.execPath, [join(copy, 'text-scale.test.mjs')], { encoding: 'utf8', env: { ...process.env, TEXT_SCALE_TEST_NESTED: '1' } });
  check('the test runs from a copy in a project (no skill assets beside it)', r.status === 0, (r.stdout + r.stderr).split('\n').filter(l => /✗|Error/.test(l)).join('\n'));
}
const clean = project({ 'text-scale.config.json': { srcDirs: ['src'] }, 'src/A.tsx': '<Text>Hi</Text>\n' })('text-scale-audit.mjs', '--strict');
check('audit: a clean project passes --strict', clean.code === 0 && /Nothing found/.test(clean.out), clean.out);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
