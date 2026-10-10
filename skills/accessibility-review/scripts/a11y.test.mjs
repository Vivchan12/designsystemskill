#!/usr/bin/env node
// Tests for contrast.mjs and a11y-audit.mjs. Plain Node, no dependencies:
//   node a11y.test.mjs
// Each audit case is either a WCAG failure the rule must find, or a false
// alarm a real app produced that it must not.
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contrast, passes, parseColor, suggest, isLarge, cssTokens, objectTokens, resolve } from './contrast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '\n    ' + String(detail).slice(0, 900)}`); if (!ok) failed++; };
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'a11y-'));
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), typeof t === 'string' ? t : JSON.stringify(t)); }
  const run = (script, ...a) => { const r = spawnSync(process.execPath, [join(here, script), ...a], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
  return { dir, run, audit: () => JSON.parse(run('a11y-audit.mjs', '--json').out) };
}
const at = (res, rule) => res.findings.filter(x => x.rule === rule).map(x => x.at);

// ── Contrast: WCAG's own numbers ──
check('#767676 on white is 4.54:1 and passes text', Math.abs(contrast('#767676', '#fff') - 4.54) < 0.005 && passes(contrast('#767676', '#fff'), 'text'));
check('#777 on white (4.48:1) fails text: ratios are never rounded up', !passes(contrast('#777', '#fff'), 'text') && contrast('#777', '#fff') > 4.47);
check('#949494 on white is the 3:1 example in Understanding 1.4.11', passes(contrast('#949494', '#ffffff'), 'ui') && contrast('#949494', '#ffffff') < 3.1);
check('black on white is 21:1', Math.abs(contrast('#000', '#fff') - 21) < 1e-9);
check('translucent text is composited over its background first', Math.abs(contrast('rgba(0,0,0,0.5)', '#fff') - contrast('#808080', '#fff')) < 0.05);
check('a translucent background sits on white unless told otherwise', contrast('#000', 'rgba(0,0,0,0)') === 21);
check('colours: hex 3/4/6/8, rgb(), rgb space syntax, hsl(), names', parseColor('#0f08')?.a < 1 && parseColor('rgb(10 20 30 / 50%)')?.a === 0.5 && Math.round(parseColor('hsl(0, 100%, 50%)').r) === 255 && parseColor('white').g === 255);
check('large text: 24px, or 18.66px bold', isLarge(24) && !isLarge(23) && isLarge(19, 700) && !isLarge(19, 400));
const s = suggest('#999999', '#ffffff');
check('suggest: the nearest passing colour, darker on a light background, and it really passes', s && passes(contrast(s, '#fff'), 'text') && !passes(contrast('#' + (parseInt(s.slice(1, 3), 16) + 2).toString(16).repeat(3), '#fff'), 'text'), s);
check('suggest: lighter on a dark background', (() => { const x = suggest('#555555', '#111111'); return x && parseColor(x).r > 0x55 && passes(contrast(x, '#111'), 'text'); })());
const css = ':root { --ink: #222; --muted: var(--grey-500); --grey-500: #9ca3af; --surface: #fff; }\n.dark { --ink: #eee; --surface: #111; }\n@media (prefers-color-scheme: dark) { :root { --surface: #000; } }';
const tk = cssTokens(css, { light: [':root'], dark: ['.dark'], dm: ['@media (prefers-color-scheme: dark) :root'] });
check('css tokens per theme, var() resolved', resolve('--muted', tk.light) === '#9ca3af' && tk.dark['--ink'] === '#eee' && tk.dm['--surface'] === '#000');
const obj = objectTokens("export const colors = { text: { primary: '#111', muted: '#8a8a8a' }, surface: '#fff', spacing: 4 };");
check('JS theme objects are flattened to dotted paths', obj['colors.text.muted'] === '#8a8a8a' && obj['colors.surface'] === '#fff' && !('colors.spacing' in obj), JSON.stringify(obj));
const cp = project({ 'a11y.config.json': { contrast: { tokenFiles: ['src/t.css'], themes: { light: [':root'], dark: ['.dark'] }, pairs: [{ fg: '--muted', bg: '--surface', use: 'text' }, { fg: '--ink', bg: '--surface' }] } }, 'src/t.css': ':root { --ink: #222; --muted: #9ca3af; --surface: #fff; --text-faint: #c0c0c0; --bg-card: #fafafa; }\n.dark { --ink: #eee; --surface: #111; }' });
const cr = cp.run('contrast.mjs');
check('contrast.mjs: declared pairs in each theme, with the nearest passing colour', /\| light \| `--muted`[^\n]*✗[^\n]*#/.test(cr.out) && /\| dark \| `--ink`[^\n]*✓/.test(cr.out), cr.out);
check('contrast.mjs: the text × surface matrix lists undeclared failing pairs', /--text-faint/.test(cr.out.split('fail together')[1] ?? ''), cr.out);
check('contrast.mjs --strict fails while a declared pair fails', cp.run('contrast.mjs', '--strict').code === 1);

// ── Web ──
const web = project({
  'package.json': { dependencies: { react: '18' } },
  'index.html': '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  'src/Nav.jsx': `import { X } from 'lucide-react';
export const Nav = ({ onClose, ok, saved, error, type }) => (<div>
  <button onClick={onClose} className="p-2">
    <X className="h-6 w-6" />
  </button>
  <button onClick={onClose} aria-label="Close"><X /></button>
  <button onClick={onClose}>Save</button>
  <img src="/logo.png" onClick={onClose} />
  <img src="/deco.png" alt="" />
  <div onClick={onClose}>Open</div>
  <div role="button" tabIndex={0} onClick={onClose} onKeyDown={onClose}>Fine</div>
  <a onClick={onClose}>Go</a>
  <a href="/home">Home</a>
  <label className="block">Email</label>
  <input type="email" name="email" placeholder="you@example.com" />
  <label htmlFor="d1">From</label><input id="d1" type="date" />
  <label>Name <input name="name" autoComplete="name" /></label>
  <input type="date" />
  <input type="file" className="hidden" />
  <input type="password" autoComplete="off" />
  <button tabIndex={3}>Late</button>
  <button aria-hidden="true">Hidden</button>
  <input className="outline-none" aria-label="Search" />
  <input className="outline-none focus-visible:ring-2" aria-label="Search" />
  {error && <p className="text-red-600">{error}</p>}
  {saved && <p role="status">Saved</p>}
  <span className={ok ? 'text-green-600' : 'text-red-600'}>●</span>
  <span className={ok ? 'text-green-600' : 'text-red-600'}><i className={ok ? 'fa-check' : 'fa-xmark'} /></span>
  <p style={{ color: '#999', backgroundColor: '#fff' }}>Faint</p>
  <p style={{ color: '#595959', backgroundColor: '#fff' }}>Fine</p>
</div>);
`,
  'src/ui/Field.jsx': `export const Input = ({ ...rest }) => <input {...rest} />;
export const Notice = ({ tone, children }) => <div role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
export const Sheet = () => <div role="dialog" tabIndex={-1} className="outline-none">x</div>;
`,
  'src/Form.jsx': `import { Input, Notice } from './ui/Field';
export const Form = ({ error, v }) => (<form>
  <Input value={v} />
  <Field label="Title"><Input value={v} /></Field>
  <Input value={v} label="Title" />
  <Input value={v} placeholder="Or name your own" />
  {error && <Notice tone="danger">{error}</Notice>}
  <IconButton onClick={v}><MenuIcon /></IconButton>
  <IconButton aria-label="Open menu" onClick={v}><MenuIcon /></IconButton>
</form>);
`,
  'src/styles.css': `.a:focus { outline: none; }
.range:focus { outline: none; }
.range:focus-visible { box-shadow: 0 0 0 3px #000; }
.b:focus:not(:focus-visible) { outline: none; }
@keyframes slideIn { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes spin { to { transform: rotate(360deg) } }
.loading { animation: pulse 2s infinite; }
.marquee { animation: scroll 10s linear infinite; }
a { text-decoration: none; }
.bad { color: #aaa; background: #fff; }
input::placeholder { color: #bbb; }
`,
});
const w = web.audit();
check('web: icon-only button without a name fails; aria-label or text passes', at(w, 'web-unnamed-button').some(a => a.endsWith('Nav.jsx:3')) && !at(w, 'web-unnamed-button').some(a => /Nav\.jsx:(6|7)$/.test(a)), JSON.stringify(at(w, 'web-unnamed-button')));
check('web: MUI-style IconButton without aria-label fails; with one passes', at(w, 'web-unnamed-button').some(a => a.endsWith('Form.jsx:8')) && !at(w, 'web-unnamed-button').some(a => a.endsWith('Form.jsx:9')));
check('web: img without alt fails; alt="" (decorative) passes', at(w, 'web-img-no-alt').some(a => a.endsWith('Nav.jsx:8')) && !at(w, 'web-img-no-alt').some(a => a.endsWith('Nav.jsx:9')));
check('web: onClick on img/div fails; role="button" with tabIndex passes', at(w, 'web-click-div').some(a => a.endsWith(':8')) && at(w, 'web-click-div').some(a => a.endsWith(':10')) && !at(w, 'web-click-div').some(a => a.endsWith(':11')), JSON.stringify(at(w, 'web-click-div')));
check('web: <a onClick> without href fails; a real link passes', at(w, 'web-anchor-button').length === 1 && at(w, 'web-anchor-button')[0].endsWith(':12'));
check('web: a visible label not tied to its input (placeholder only) is a check, not a pass', at(w, 'input-placeholder-only').some(a => a.endsWith('Nav.jsx:15')));
check('web: htmlFor, a wrapping <label>, a kit Field or a label prop all label a field', !at(w, 'web-input-unlabelled').concat(at(w, 'input-placeholder-only')).some(a => /Nav\.jsx:(16|17)$|Form\.jsx:(4|5)$/.test(a)), JSON.stringify(w.findings.filter(x => /input/.test(x.rule))));
check('web: a field with no name at all fails (kit Input on a screen too)', at(w, 'web-input-unlabelled').some(a => a.endsWith('Nav.jsx:18')) && at(w, 'web-input-unlabelled').some(a => a.endsWith('Form.jsx:3')));
check('web: hidden inputs and kit primitives that spread props are not judged', !at(w, 'web-input-unlabelled').some(a => /Nav\.jsx:19$|Field\.jsx/.test(a)));
check('web: autocomplete="off" on a password fails 3.3.8', at(w, 'paste-blocked').some(a => a.endsWith(':20')));
check('web: an email field with no autocomplete is a 1.3.5 check; with one it is not', at(w, 'input-purpose').some(a => a.endsWith('Nav.jsx:15')) && !at(w, 'input-purpose').some(a => a.endsWith('Nav.jsx:17')));
check('web: positive tabindex fails; aria-hidden on a button fails', at(w, 'tabindex-positive').some(a => a.endsWith(':21')) && at(w, 'web-aria-hidden-focusable').some(a => a.endsWith(':22')));
check('web: outline-none with no replacement fails; with focus-visible:ring passes; a tabIndex=-1 dialog may drop it', at(w, 'focus-removed').some(a => a.endsWith('Nav.jsx:23')) && !at(w, 'focus-removed').some(a => /Nav\.jsx:24$|Field\.jsx/.test(a)), JSON.stringify(at(w, 'focus-removed')));
check('css: :focus { outline: none } fails; replaced by :focus-visible, or :focus:not(:focus-visible), passes', at(w, 'focus-removed').some(a => a.endsWith('styles.css:1')) && !at(w, 'focus-removed').some(a => /styles\.css:(2|4)$/.test(a)), JSON.stringify(at(w, 'focus-removed')));
check('web: a message that appears without role/aria-live is a check; role="status" or a kit Notice that announces is fine', at(w, 'web-status-silent').some(a => a.endsWith('Nav.jsx:25')) && !at(w, 'web-status-silent').some(a => /Nav\.jsx:26$|Form\.jsx:7$/.test(a)), JSON.stringify(at(w, 'web-status-silent')));
check('colour-only status: a colour ternary is a check; one where the icon switches too is not', at(w, 'colour-only-status').some(a => a.endsWith('Nav.jsx:27')) && !at(w, 'colour-only-status').some(a => a.endsWith('Nav.jsx:28')), JSON.stringify(at(w, 'colour-only-status')));
check('inline contrast: #999 on #fff fails with its ratio; #595959 passes; CSS rules too', w.findings.some(x => x.rule === 'contrast-inline' && x.at.endsWith('Nav.jsx:29') && /2\.84:1/.test(x.detail)) && !at(w, 'contrast-inline').some(a => a.endsWith('Nav.jsx:30')) && at(w, 'contrast-inline').some(a => /styles\.css:11$/.test(a)), JSON.stringify(w.findings.filter(x => x.rule === 'contrast-inline')));
check('placeholder colour below 4.5:1 is a check', at(w, 'contrast-placeholder').some(a => /styles\.css:12$/.test(a)));
check('motion: keyframes that move fail without prefers-reduced-motion; fades and spinners don\'t count', at(w, 'motion-no-reduce').some(a => a.endsWith('styles.css:5')) && !at(w, 'motion-no-reduce').some(a => /styles\.css:(6|7)$/.test(a)), JSON.stringify(w.findings.filter(x => x.rule === 'motion-no-reduce')));
check('motion: an endless animation is a 2.2.2 check; a loading pulse is not', at(w, 'autoplay').some(a => a.endsWith('styles.css:9')) && !at(w, 'autoplay').some(a => a.endsWith('styles.css:8')));
check('links with no underline: a 1.4.1 check', at(w, 'link-colour-only').length === 1);
check('html without lang fails 3.1.1', at(w, 'web-no-lang').some(a => a.startsWith('index.html')));
check('tools: recommends jsx-a11y and axe-core when missing', w.tools.some(x => /jsx-a11y/.test(x)) && w.tools.some(x => /axe-core/.test(x)));
const reduced = project({ 'package.json': {}, 'src/a.css': '@keyframes slideIn { from { transform: translateY(10px) } }\n@media (prefers-reduced-motion: reduce) { * { animation: none !important } }\n' }).audit();
check('motion: one prefers-reduced-motion rule in the project clears it', !at(reduced, 'motion-no-reduce').length);
const tw = project({ 'package.json': {}, 'tailwind.config.js': "module.exports = { theme: { extend: { keyframes: { float: { '0%': { transform: 'translateY(0)' } } } } } }", 'src/A.jsx': 'export const A = () => <div className="animate-bounce motion-safe:animate-ping">x</div>;\n' }).audit();
check('motion: keyframes in tailwind.config and animate-bounce are found', at(tw, 'motion-no-reduce').some(a => a.startsWith('tailwind.config.js')) && at(tw, 'motion-no-reduce').some(a => a.endsWith('A.jsx:1')), JSON.stringify(tw.findings));

// ── React Native ──
const rn = project({
  'package.json': { dependencies: { 'react-native': '0.76', expo: '52' } },
  'src/screens/Home.tsx': `import { Pressable, TouchableOpacity, Text, TextInput, View, Animated, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
export function Home({ onDelete, error, checked }) {
  Animated.timing(v, { toValue: 1, useNativeDriver: true }).start();
  return (<View>
    <Pressable onPress={onDelete}>
      <Ionicons name="trash" size={20} />
    </Pressable>
    <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete reading">
      <Ionicons name="trash" size={20} />
    </Pressable>
    <TouchableOpacity onPress={onDelete} accessibilityRole="button"><Text>Save</Text></TouchableOpacity>
    <TextInput placeholder="Temperature" />
    <TextInput />
    <TextInput accessibilityLabel="Temperature" keyboardType="email-address" />
    <Pressable onPress={onDelete} accessibilityRole="checkbox" accessibilityLabel="Done"><Text>Done</Text></Pressable>
    <Pressable onPress={onDelete} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel="Done"><Text>Done</Text></Pressable>
    <Pressable onPress={onDelete} accessibilityRole="button" aria-hidden={true}><Text>Ghost</Text></Pressable>
    <Text accessibilityLiveRegion="polite">{error}</Text>
    <Swipeable renderRightActions={x}><Text>Row</Text></Swipeable>
  </View>);
}
`,
  'src/screens/Settings.tsx': `import { View, Text } from 'react-native';
export const Settings = ({ saved }) => (<View>
  {saved && <Text>Saved</Text>}
</View>);
`,
  'src/ui/Button.tsx': `import { Pressable } from 'react-native';
export const Button = (props) => <Pressable accessibilityRole="button" {...props} />;
`,
});
const r = rn.audit();
check('RN: an icon-only Pressable with no label fails; with accessibilityLabel passes', at(r, 'rn-unnamed-control').some(a => a.endsWith('Home.tsx:6')) && !at(r, 'rn-unnamed-control').some(a => a.endsWith('Home.tsx:9')), JSON.stringify(at(r, 'rn-unnamed-control')));
check('RN: a Pressable with no role fails; with accessibilityRole passes; the kit Button that spreads props is not judged', at(r, 'rn-control-no-role').some(a => a.endsWith('Home.tsx:6')) && !at(r, 'rn-control-no-role').some(a => /Home\.tsx:(9|12)$|Button\.tsx/.test(a)), JSON.stringify(at(r, 'rn-control-no-role')));
check('RN: TextInput with a placeholder only is a check; with nothing fails; with a label passes', at(r, 'input-placeholder-only').some(a => a.endsWith('Home.tsx:13')) && at(r, 'rn-input-unlabelled').some(a => a.endsWith('Home.tsx:14')) && !at(r, 'rn-input-unlabelled').some(a => a.endsWith('Home.tsx:15')));
check('RN: an email keyboard with no autoComplete is a 1.3.5 check', at(r, 'input-purpose').some(a => a.endsWith('Home.tsx:15')));
check('RN: a checkbox role without accessibilityState fails; with it passes', at(r, 'rn-state-missing').some(a => a.endsWith('Home.tsx:16')) && !at(r, 'rn-state-missing').some(a => a.endsWith('Home.tsx:17')));
check('RN: a control hidden from screen readers but tappable fails', at(r, 'rn-hidden-control').some(a => a.endsWith('Home.tsx:18')));
check('RN: a live region with no announceForAccessibility anywhere fails (iOS hears nothing)', at(r, 'rn-live-region-ios').some(a => a.endsWith('Home.tsx:19')));
check('RN: a message that appears with no announcement is a check', at(r, 'rn-status-silent').some(a => a.endsWith('Settings.tsx:3')));
check('RN: no headings anywhere in the screens is a check', at(r, 'rn-no-headings').length === 1);
check('RN: core Animated without isReduceMotionEnabled fails; a swipe is a check', at(r, 'motion-no-reduce').some(a => a.endsWith('Home.tsx:4')) && at(r, 'gesture-only').some(a => a.endsWith('Home.tsx:20')));
check('tools: recommends eslint-plugin-react-native-a11y, and says devices are still needed', r.tools.some(x => /react-native-a11y/.test(x)) && r.tools.some(x => /VoiceOver/.test(x)));
const rn2 = project({ 'package.json': { dependencies: { 'react-native': '0.76' } }, 'src/A.tsx': `import { Text, AccessibilityInfo } from 'react-native';
import { withTiming, ReduceMotion } from 'react-native-reanimated';
export const A = ({ error }) => { AccessibilityInfo.announceForAccessibility(error); const x = withTiming(1); const y = withTiming(1, { reduceMotion: ReduceMotion.Never }); return <Text accessibilityLiveRegion="polite">{error}</Text>; };
` }).audit();
check('RN: Reanimated follows Reduce Motion by default (not flagged); ReduceMotion.Never is a check; announcing clears the live-region failure', !at(rn2, 'motion-no-reduce').length && at(rn2, 'motion-forced').length === 1 && !at(rn2, 'rn-live-region-ios').length, JSON.stringify(rn2.findings));

// ── Flutter, Android, SwiftUI ──
const native = project({
  'lib/main.dart': `IconButton(icon: Icon(Icons.delete), onPressed: del),
IconButton(icon: Icon(Icons.delete), tooltip: 'Delete', onPressed: del),
GestureDetector(onTap: go, child: Icon(Icons.add)),
Image.asset('a.png'),
Image.asset('b.png', semanticLabel: 'Logo'),
TextField(decoration: InputDecoration(hintText: 'Temp')),
TextField(decoration: InputDecoration(labelText: 'Temp')),
`,
  'android/res/layout/item.xml': '<ImageView android:src="@drawable/x" />\n<ImageView android:src="@drawable/y" android:contentDescription="@string/y" />\n',
  'android/Item.kt': 'IconButton(onClick = del) {\n  Icon(Icons.Default.Delete, contentDescription = null)\n}\n',
  'ios/V.swift': 'Button(action: del) {\n  Image(systemName: "trash")\n}\nButton(action: del) {\n  Label("Delete", systemImage: "trash")\n}\n',
});
native.dir; const n = JSON.parse(native.run('a11y-audit.mjs', '--json').out);
check('Flutter: IconButton without tooltip fails; with one passes', at(n, 'flutter-iconbutton-unnamed').length === 1 && at(n, 'flutter-iconbutton-unnamed')[0].endsWith(':1'), JSON.stringify(n.findings));
check('Flutter: GestureDetector and an unlabelled image are checks; a TextField with only hintText fails', at(n, 'flutter-gesture-detector').length === 1 && at(n, 'flutter-image-unlabelled').length === 1 && at(n, 'flutter-input-unlabelled').length === 1);
check('Android: ImageView without contentDescription fails; Compose icon button with contentDescription = null fails', at(n, 'android-image-unlabelled').length === 1 && at(n, 'compose-icon-button-unnamed').length === 1);
check('SwiftUI: a button labelled only by an image is a check; Label() passes', at(n, 'swiftui-icon-button').length === 1);

// ── Exemptions, baseline, strict ──
const ex = project({ 'package.json': {}, 'src/A.jsx': 'export const A = () => <div onClick={x}>x</div>; // a11y-exempt: a drag handle; the row has a button for the same action\n' }).audit();
check('a line marked a11y-exempt is skipped', !ex.findings.length, JSON.stringify(ex.findings));
const base = project({ 'package.json': {}, 'src/A.jsx': 'export const A = () => <div onClick={x}>x</div>;\n' });
check('--strict fails on a "fails" finding with no baseline', base.run('a11y-audit.mjs', '--strict').code === 1);
base.run('a11y-audit.mjs', '--init');
check('--init records the counts; --strict then passes until a rule grows', existsSync(join(base.dir, 'a11y-baseline.json')) && base.run('a11y-audit.mjs', '--strict').code === 0);
writeFileSync(join(base.dir, 'src/B.jsx'), 'export const B = () => <span onClick={x}>y</span>;\n');
check('--strict fails when a rule grows past its baseline, naming it', (() => { const x = base.run('a11y-audit.mjs', '--strict'); return x.code === 1 && /web-click-div: 2 \(baseline 1\)/.test(x.out); })());
check('a "check" finding never fails --strict', project({ 'package.json': {}, 'src/A.jsx': "export const A = ({ok}) => <span className={ok ? 'text-green-600' : 'text-red-600'}>x</span>;\n" }).run('a11y-audit.mjs', '--strict').code === 0);
const withTool = project({ 'package.json': {}, 'src/main.tsx': "if (import.meta.env.DEV) import('./dev/a11y-preview.js');\n", 'src/dev/a11y-preview.js': readFileSync(join(here, '../assets/a11y-preview.js'), 'utf8') });
const wt = withTool.run('a11y-audit.mjs', '--strict');
check('the review panel: its own file is not audited; where it loads is listed; dev-only passes --strict', wt.code === 0 && /Review panel still installed/.test(wt.out) && /src\/main\.tsx:1` \(development only\)/.test(wt.out) && !/dev\/a11y-preview\.js:/.test(wt.out.split('Review panel')[0]), wt.out);
const shipped = project({ 'package.json': {}, 'src/main.tsx': "import './dev/a11y-preview.js';\n" }).run('a11y-audit.mjs', '--strict');
check('the review panel loaded without a development check fails --strict', shipped.code === 1 && /would ship/.test(shipped.out), shipped.out);
const clean = project({ 'package.json': {}, 'src/A.jsx': 'export const A = () => <button>Save</button>;\n' });
check('a clean project says code can\'t prove accessibility', /That is not the same as accessible/.test(clean.run('a11y-audit.mjs').out));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
