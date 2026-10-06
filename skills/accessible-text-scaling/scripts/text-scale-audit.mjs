#!/usr/bin/env node
/**
 * text-scale-audit: where the code ignores, blocks or breaks the user's
 * text-size setting. Reads source only; changes nothing.
 *
 *   node text-scale-audit.mjs            # report
 *   node text-scale-audit.mjs --strict   # exit 1 while anything that BLOCKS scaling remains (CI)
 *
 * Two kinds of finding:
 *   blocks: the setting is ignored (scaling turned off, sizes in a unit that
 *           doesn't scale, zoom disabled). Users who need bigger text don't get it.
 *   breaks: the setting is followed but the layout can't take it (fixed
 *           heights around text, one-line truncation, text shrunk to fit).
 *
 * Reads text-scale.config.json (srcDirs, kitDir, exempt). The kit may turn
 * system scaling off when it applies the agreed scale itself (scaledText);
 * that is not a finding there. A line with `text-scale-exempt: <why>` is skipped.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const cfgFile = join(ROOT, 'text-scale.config.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const srcDirs = (cfg.srcDirs ?? ['src', 'app', 'components', 'lib', 'ios', 'android']).filter(d => existsSync(join(ROOT, d)));
const exempt = cfg.exempt ?? ['node_modules', 'dist', 'build', 'Pods', '.gradle'];
const kitDir = cfg.kitDir ?? 'src/components/ui';
const STRICT = process.argv.includes('--strict');
const EXT = ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.html', '.swift', '.kt', '.xml', '.dart', '.vue', '.svelte'];

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), rel = relative(ROOT, p).replace(/\\/g, '/');
    if (n.startsWith('.') || exempt.some(e => rel === e || rel.startsWith(e + '/') || n === e)) continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.includes(extname(n)) && !/\.(test|spec|stories)\./.test(n)) yield { p, rel };
  }
}
const files = [...new Set(srcDirs.flatMap(d => [...walk(join(ROOT, d))]).map(f => f.rel))].map(rel => ({ rel, text: readFileSync(join(ROOT, rel), 'utf8') }));
for (const n of ['index.html', 'App.tsx', 'App.js'].filter(n => existsSync(join(ROOT, n)))) files.push({ rel: n, text: readFileSync(join(ROOT, n), 'utf8') });

// [platform, kind, what, regex (per line), test on the match (optional), fix]
const RULES = [
  // React Native
  ['React Native', 'blocks', 'system text scaling turned off', /allowFontScaling\s*[=:]\s*\{?\s*false/, null, 'remove it, or use the kit\'s text components, which apply the agreed range'],
  ['React Native', 'blocks', 'scaling capped below 200%', /maxFontSizeMultiplier\s*[=:]\s*\{?\s*([\d.]+)/, (m) => Number(m[1]) < 2, 'cap at 2 or more, except for large display text'],
  ['React Native', 'breaks', 'text shrunk to fit its box', /adjustsFontSizeToFit/, null, 'let it wrap instead; shrinking undoes the user\'s setting'],
  ['React Native', 'breaks', 'cut to one line', /numberOfLines\s*=\s*\{\s*1\s*\}/, null, 'allow 2–3 lines at large sizes, or wrap; keep 1 only for genuinely single-line values'],
  // Web
  ['Web', 'blocks', 'zoom disabled in the viewport', /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/, null, 'remove it: people zoom to read'],
  ['Web', 'blocks', 'root font size fixed in px (overrides the browser setting)', /^\s*(html|:root)\s*\{[^}]*font-size\s*:\s*\d+(\.\d+)?px/, null, 'leave the root at 100%, or use a percentage'],
  ['Web', 'blocks', 'font size in px', /font-size\s*:\s*\d+(\.\d+)?px|fontSize\s*:\s*['"]\d+(\.\d+)?px['"]|\btext-\[\d+(\.\d+)?px\]/, null, 'use rem (or the generated --text-* variables)'],
  ['Web', 'breaks', 'fixed height on a text container', /\b(height|max-height)\s*:\s*\d+px[^;]*;[^}]*\b(line-height|font-size)\b|(?<![\w-])h-\[\d+px\][^"'`]*\btext-/, null, 'use min-height, or padding'],
  ['Web', 'breaks', 'text cut off with nowrap', /white-space\s*:\s*nowrap[^}]*text-overflow|\btruncate\b|\bline-clamp-\d/, (m, line) => !/data-text-clamp/.test(line), 'allow wrapping for anything longer than a value or a name; mark a deliberate clamp (a preview, a teaser) with data-text-clamp'],
  // iOS
  ['iOS', 'blocks', 'fixed font size in SwiftUI', /\.font\(\s*\.system\(\s*size:\s*[\d.]+(?![^)]*relativeTo)|Font\.custom\([^)]*size:\s*[\d.]+(?![^)]*relativeTo)/, null, 'use a text style (.body) or relativeTo: so it follows Dynamic Type'],
  ['iOS', 'blocks', 'fixed font size in UIKit', /UIFont\.(systemFont|boldSystemFont)\(ofSize:|UIFont\(name:[^)]*size:/, (m, line) => !/UIFontMetrics/.test(line), 'wrap in UIFontMetrics(forTextStyle:).scaledFont(for:), and set adjustsFontForContentSizeCategory = true'],
  ['iOS', 'blocks', 'Dynamic Type turned off', /adjustsFontForContentSizeCategory\s*=\s*false/, null, 'set it to true'],
  ['iOS', 'breaks', 'Dynamic Type range capped', /\.dynamicTypeSize\(\s*\.\.\.\s*\.(xSmall|small|medium|large|xLarge|xxLarge|xxxLarge)\b/, null, 'allow at least .accessibility2 for reading text'],
  // Android
  ['Android', 'blocks', 'text size in dp or px (ignores the font scale)', /android:textSize\s*=\s*"[\d.]+(dp|px|dip)"|fontSize\s*=\s*[\d.]+\.dp\b/, null, 'use sp'],
  ['Android', 'breaks', 'cut to one line', /android:maxLines\s*=\s*"1"|android:singleLine\s*=\s*"true"|maxLines\s*=\s*1\b/, null, 'allow more lines at large sizes'],
  // Flutter
  ['Flutter', 'blocks', 'text scaling turned off', /textScaleFactor\s*:\s*1(\.0)?\b|TextScaler\.noScaling|TextScaler\.linear\(\s*1(\.0)?\s*\)/, null, 'clamp instead: MediaQuery.textScalerOf(context).clamp(minScaleFactor: …, maxScaleFactor: …)'],
];

// Icons: a fixed size beside text that grows. Only tags that are icons (imported
// from an icon library, named …Icon, or a bare <svg>), so <Button size="sm"> or
// an avatar's size is never mistaken for one.
const ICON_LIBS = /['"](lucide-react(-native)?|react-feather|@heroicons\/[\w/-]+|@tabler\/icons[\w-]*|phosphor-react(-native)?|@phosphor-icons\/[\w-]+|react-icons\/[\w-]+|@expo\/vector-icons[\w/-]*|react-native-vector-icons\/[\w-]+|@mui\/icons-material[\w/-]*|@radix-ui\/react-icons|iconoir-react|@iconify\/react)['"]/;
// A number or px is fixed. Tailwind's w-4 / h-5 / size-6 are rem, so they grow
// with the root size, and are not findings; w-[16px] is.
const FIXED_SIZE = /\b(size|width|height)\s*=\s*(\{\s*\d+(\.\d+)?\s*\}|['"]\d+(\.\d+)?(px)?['"])|\bclassName\s*=\s*\{?\s*['"`][^'"`]*(?<![\w-])(w|h|size)-\[\d+(\.\d+)?px\]/;
const SCALED_SIZE = /scaledIcon|--[\w-]*icon-|\b\d*\.?\d+em\b/;
function iconNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(['"][^'"]+['"])/g)) {
    if (!ICON_LIBS.test(m[3])) continue;
    if (m[1]) names.add(m[1]);
    for (const n of (m[2] ?? '').split(',')) { const a = n.trim().split(/\s+as\s+/).pop(); if (a) names.add(a); }
  }
  return names;
}
const ICON_RULE = ['Any', 'breaks', 'icon at a fixed size (text grows, it doesn\'t)', 'size it from the scale: scaledIcon(ICON_SIZES.md) on React Native, var(--icon-md) or 1em on the web; better, use the kit\'s Icon'];
// Judged per element, in the kit too: a kit file that sizes one icon from the
// scale doesn't excuse another it fixes, and one that never says --icon- can
// still size every icon in rem.
function fixedIcons(f) {
  const names = iconNames(f.text), out = [];
  f.text.split('\n').forEach((line, i) => {
    if (/text-scale-exempt:/.test(line) || /^\s*(\/\/|\*|#)/.test(line)) return;
    for (const m of line.matchAll(/<([A-Za-z][\w.]*)\b([^>]*)/g)) {
      const tag = m[1], attrs = m[2];
      const isIcon = tag === 'svg' || names.has(tag) || /^[A-Z]\w*Icon$|^Icon\.\w+$/.test(tag) && tag !== 'Icon';
      if (isIcon && FIXED_SIZE.test(attrs) && !SCALED_SIZE.test(attrs)) { out.push(`${f.rel}:${i + 1}`); break; }
    }
  });
  return out;
}

// The review tool (assets/text-scale-preview.js, TextScalePreview.tsx) sets
// fixed sizes on purpose and is meant to be deleted: its own files are not
// findings, but every place that loads it is listed, and loading it without a
// development-only guard fails --strict.
const isTool = (rel) => /(^|\/)(text-scale-preview\.js|TextScalePreview\.tsx)$/.test(rel);
const DEV_GUARD = /import\.meta\.env\.DEV|__DEV__|process\.env\.NODE_ENV/;
const toolUses = [];
for (const f of files) {
  if (isTool(f.rel)) continue;
  const lines = f.text.split('\n');
  lines.forEach((line, i) => {
    if (!/text-scale-preview|TextScalePreview/.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
    // Guarded when a dev check sits on this line or just above, or (for an import) where the component is used.
    const near = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    const isImport = /^\s*import\s/.test(line) && !/import\(/.test(line);
    const uses = isImport ? lines.map((l, j) => [l, j]).filter(([l, j]) => j !== i && /TextScalePreview|text-scale-preview/.test(l)) : [];
    const guarded = DEV_GUARD.test(near) || (isImport && uses.length > 0 && uses.every(([, j]) => DEV_GUARD.test(lines.slice(Math.max(0, j - 3), j + 1).join('\n'))));
    toolUses.push({ at: `${f.rel}:${i + 1}`, guarded });
  });
}

const findings = [];
// The generated CSS must be imported where the browser loads it. A Tailwind
// config that reads it only knows the names: every var() is then undefined
// and falls back silently (icons sat at their default size in a real run).
for (const g of files.filter(f => /\.(css|scss)$/.test(f.rel) && /Generated by scale-table\.mjs/.test(f.text))) {
  const base = g.rel.split('/').pop().replace(/\.(css|scss)$/, '');
  const loads = files.some(f => f !== g && !/(^|\/)(tailwind|postcss)\.config\./.test(f.rel) &&
    f.text.split('\n').some(l => l.includes(base) && /@import|@use|\bimport\b|require\(|<link/.test(l)));
  if (!loads) findings.push({ platform: 'Web', kind: 'blocks', what: 'the generated text scale is never loaded (nothing imports it)', fix: `@import it from the entry CSS (e.g. @import './${g.rel.split('/').slice(-2).join('/')}';). Tailwind reading it is not loading it`, at: g.rel });
}
for (const f of files) {
  if (isTool(f.rel)) continue;
  const inKit = f.rel === kitDir || f.rel.startsWith(kitDir + '/');
  if (/\.(tsx|jsx|js|ts|vue|svelte|html)$/.test(f.rel)) for (const at of fixedIcons(f)) { const [platform, kind, what, fix] = ICON_RULE; findings.push({ platform, kind, what, fix, at }); }
  f.text.split('\n').forEach((line, i) => {
    if (/text-scale-exempt:/.test(line) || /^\s*(\/\/|\*|#)/.test(line)) return;
    const hits = new Set();
    for (const [platform, kind, what, re, test, fix] of RULES) {
      const m = line.match(re);
      if (!m || (test && !test(m, line))) continue;
      // One problem per line: a fixed root size is not also "a px size".
      if (what === 'font size in px' && hits.has('root font size fixed in px (overrides the browser setting)')) continue;
      hits.add(what);
      // The kit may switch system scaling off when it applies the agreed range itself.
      if (inKit && what === 'system text scaling turned off' && /scaledText|TEXT_ROLES/.test(f.text)) continue;
      findings.push({ platform, kind, what, fix, at: `${f.rel}:${i + 1}` });
    }
  });
}

const L = ['# Text scaling audit', '', `${files.length} files in ${srcDirs.join(', ') || '(no source folders found: set srcDirs in text-scale.config.json)'}.`, ''];
if (!findings.length) L.push('Nothing found that blocks or breaks the text-size setting. This reads the code only: still check the screens at the largest setting (references/testing.md).');
else {
  const groups = new Map();
  for (const x of findings) { const k = `${x.kind}|${x.platform}|${x.what}`; (groups.get(k) ?? groups.set(k, { ...x, at: [] }).get(k)).at.push(x.at); }
  for (const kind of ['blocks', 'breaks']) {
    const g = [...groups.values()].filter(x => x.kind === kind).sort((a, b) => b.at.length - a.at.length);
    if (!g.length) continue;
    L.push(`## ${kind === 'blocks' ? 'Blocks the setting (users who need bigger text don\'t get it)' : 'Breaks at large sizes (the setting is followed, the layout can\'t take it)'}`, '', '| Platform | What | Count | Fix | Where (first 5) |', '|---|---|---|---|---|');
    for (const x of g) L.push(`| ${x.platform} | ${x.what} | ${x.at.length} | ${x.fix} | ${x.at.slice(0, 5).map(a => `\`${a}\``).join(' ')} |`);
    L.push('');
  }
}
if (toolUses.length) {
  L.push('', '## Review tool still installed', '', 'The text size review tool is loaded here. Delete it, and these lines, when the review is done.', '');
  for (const u of toolUses) L.push(`- \`${u.at}\`${u.guarded ? ' (development only)' : ' **not behind a development check: it would ship to users**'}`);
}
console.log(L.join('\n'));
const blocking = findings.filter(x => x.kind === 'blocks').length;
const shipping = toolUses.filter(u => !u.guarded).length;
if (STRICT && blocking) console.log(`\n✗ ${blocking} place(s) block the text-size setting.`);
if (STRICT && shipping) console.log(`\n✗ The review tool would ship: ${shipping} place(s) load it without a development check.`);
if (STRICT && (blocking || shipping)) process.exit(1);
