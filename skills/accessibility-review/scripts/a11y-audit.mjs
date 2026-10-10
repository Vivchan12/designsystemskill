#!/usr/bin/env node
/**
 * a11y-audit: what the code tells us about accessibility, mapped to WCAG 2.2.
 * Reads source only; changes nothing. Web (React, Vue, Svelte, HTML, CSS),
 * React Native, Flutter, Android (XML, Compose) and SwiftUI.
 *
 *   node a11y-audit.mjs              # report
 *   node a11y-audit.mjs --json
 *   node a11y-audit.mjs --init       # record today's counts in a11y-baseline.json (an existing app starts here)
 *   node a11y-audit.mjs --strict     # CI: exit 1 if any "fails" rule has more findings than the baseline (0 without one)
 *
 * Two kinds of finding:
 *   fails  a pattern that fails a WCAG criterion (or a platform requirement) wherever it appears
 *   check  a pattern that often fails, and needs a person to look (it may be fine)
 *
 * Code can't show everything: reading order, whether a label makes sense,
 * focus after a dialog closes, what a screen reader actually says. Those are
 * in references/testing.md, and no report from this script means the app is
 * accessible. Run the established tools too (eslint-plugin-jsx-a11y,
 * eslint-plugin-react-native-a11y, axe-core): the "Tools" section says which
 * the project is missing.
 *
 * A line marked `a11y-exempt: <why>` is skipped. Config: a11y.config.json.
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { contrast, passes, isLarge, parseColor } from './contrast.mjs';

const ROOT = process.cwd();
const cfgFile = join(ROOT, 'a11y.config.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const srcDirs = (cfg.srcDirs ?? ['src', 'app', 'components', 'screens', 'lib', 'pages', 'ios', 'android']).filter(d => existsSync(join(ROOT, d)));
const exempt = cfg.exempt ?? ['node_modules', 'dist', 'build', 'Pods', '.gradle', '.next', 'coverage', 'web-build', '.expo'];
const ignore = new Set(cfg.ignore ?? []);
const defaultBg = cfg.contrast?.defaultBackground ?? '#ffffff';
const args = process.argv.slice(2);
const EXT = ['.tsx', '.jsx', '.ts', '.js', '.mjs', '.vue', '.svelte', '.html', '.css', '.scss', '.dart', '.swift', '.kt', '.xml'];

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), rel = relative(ROOT, p).replace(/\\/g, '/');
    if (n.startsWith('.') || exempt.some(e => rel === e || rel.startsWith(e + '/') || n === e)) continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.includes(extname(n)) && !/\.(test|spec|stories|d)\.|\.config\./.test(n)) yield rel;
  }
}
const isTool = (rel) => /(^|\/)(a11y-preview\.js|a11y-audit\.mjs|text-scale-preview\.js|TextScalePreview\.tsx)$/.test(rel);
const files = [...new Set(srcDirs.flatMap(d => [...walk(join(ROOT, d))]))].filter(r => !isTool(r)).map(rel => ({ rel, text: readFileSync(join(ROOT, rel), 'utf8') }));
// Root files a project often keeps outside its source folders: the HTML shell, the app entry, global CSS.
const rootFiles = readdirSync(ROOT).filter(n => /^(index\.html|App\.(t|j)sx?)$/.test(n) || /\.(css|scss)$/.test(n));
for (const n of rootFiles.filter(n => !exempt.includes(n))) if (!files.some(f => f.rel === n)) files.push({ rel: n, text: readFileSync(join(ROOT, n), 'utf8') });

const pkg = existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) : {};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const projectIsRN = !!(deps['react-native'] || deps.expo);
const isRN = (f) => /from\s+['"]react-native['"]/.test(f.text) || (projectIsRN && /\.(t|j)sx?$/.test(f.rel) && !/<(div|span|button|input|a)\b|className=/.test(f.text));
const isMarkup = (f) => /\.(tsx|jsx|vue|svelte|html)$/.test(f.rel) || (/\.(t|j)s$/.test(f.rel) && /<[A-Za-z]/.test(f.text) && /return\s*\(|=>\s*\(/.test(f.text));

// ── A small markup reader: elements with their attributes and children, JSX braces and strings respected ──
function skip(t, i) {   // index just past a string/template/brace group starting at i
  const c = t[i];
  if (c === '"' || c === "'" || c === '`') { for (let j = i + 1; j < t.length; j++) { if (t[j] === '\\') { j++; continue; } if (c === '`' && t[j] === '$' && t[j + 1] === '{') { j = skip(t, j + 1) - 1; continue; } if (t[j] === c) return j + 1; } return t.length; }
  if (c === '{') { let d = 0; for (let j = i; j < t.length; j++) { const x = t[j]; if (x === '"' || x === "'" || x === '`') { j = skip(t, j) - 1; continue; } if (x === '{') d++; else if (x === '}' && --d === 0) return j + 1; } return t.length; }
  return i + 1;
}
const lineAt = (t, i) => t.slice(0, i).split('\n').length;
/** From the first ( or { at/after i, the text up to its matching close: one call's arguments, one closure. */
function group(t, i, open = '(') {
  const close = open === '(' ? ')' : '}', start = t.indexOf(open, i); if (start < 0) return '';
  let d = 0;
  for (let j = start; j < t.length; j++) { const c = t[j]; if (c === '"' || c === "'" || c === '`') { j = skip(t, j) - 1; continue; } if (c === open) d++; else if (c === close && --d === 0) return t.slice(start, j + 1); }
  return t.slice(start);
}
/** The lines that belong to the element starting on line i: until a line at the same or lesser indent starts something new. */
function elementLines(lines, i) {
  const ind = (l) => l.match(/^\s*/)[0].length, base = ind(lines[i]), out = [lines[i]];
  for (let k = i + 1; k < lines.length && k < i + 15; k++) { if (lines[k].trim() && ind(lines[k]) <= base) break; out.push(lines[k]); }
  return out.join('\n');
}
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length)).replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
function elements(src, tagRe) {
  const t = stripComments(src), out = [];
  for (const m of t.matchAll(new RegExp(`<(${tagRe})(?=[\\s/>])`, 'g'))) {
    let i = m.index + m[0].length;
    while (i < t.length && t[i] !== '>') { if ('{"\'`'.includes(t[i])) i = skip(t, i); else i++; }
    const attrs = t.slice(m.index + m[0].length, i), selfClosing = /\/\s*$/.test(attrs);
    let body = '';
    if (!selfClosing) {   // the matching close tag, counting nested ones of the same name
      const tag = m[1].replace(/\./g, '\\.'), re = new RegExp(`<${tag}(?=[\\s/>])|</${tag}\\s*>`, 'g');
      re.lastIndex = i + 1; let d = 1, mm;
      while ((mm = re.exec(t))) { if (mm[0].startsWith('</')) { if (--d === 0) { body = t.slice(i + 1, mm.index); break; } } else d++; }
    }
    out.push({ tag: m[1], attrs, body, line: lineAt(t, m.index), index: m.index, openLine: src.split('\n')[lineAt(t, m.index) - 1] ?? '' });
  }
  return out;
}
const has = (attrs, name) => new RegExp(`(^|[\\s{(])${name.replace(/[-:@]/g, '\\$&')}(?=\\s*=|\\s|/|>|$)`).test(attrs);
const val = (attrs, name) => { const m = attrs.match(new RegExp(`(^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*['"\`]([^'"\`]*)['"\`]\\s*\\}|\\{([^}]*)\\})`)); return m ? (m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim() : null; };
/** Does the element show any text? Icons, images and svgs alone don't count; an expression might be text, so it counts. */
function showsText(body) {
  const withoutGraphics = body.replace(/<(svg)[\s\S]*?<\/\1>/g, '').replace(/<[A-Z][\w.]*Icon\b[^>]*\/>|<Icon\b[^>]*\/>|<(img|Image|svg|Svg)\b[^>]*\/?>/g, '');
  const noTags = withoutGraphics.replace(/<\/?[A-Za-z][^>]*>/g, ' ');
  return /\S/.test(noTags.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ''));
}
const imgWithAlt = (body) => /<(img|Image)\b[^>]*\balt\s*=\s*["{][^"}\s]/.test(body);
const exemptAt = (f, line) => /a11y-exempt:/.test(f.text.split('\n')[line - 1] ?? '');

// ── Rules ──
// area, WCAG criterion, level, kind, what, fix
const R = {
  // Screen readers
  'rn-unnamed-control':   ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'React Native: a touchable with no name (an icon or image, no label, no text)', 'add accessibilityLabel="…" (what it does: "Delete reading"), or visible text'],
  'rn-control-no-role':   ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'React Native: a Pressable/Touchable with no role, so it isn\'t announced as a button', 'accessibilityRole="button" (or "link", "tab", "checkbox"…); best set once in the kit\'s Button'],
  'input-placeholder-only': ['Forms', '3.3.2 Labels or Instructions', 'A', 'check', 'A field labelled only by its placeholder: screen readers read it, but it disappears as soon as typing starts, and it is usually low contrast', 'a visible label tied to the field (<label for>, the kit\'s Field, or aria-labelledby on the caption)'],
  'rn-input-unlabelled':  ['Forms', '3.3.2 Labels or Instructions; 4.1.2', 'A', 'fails', 'React Native: a TextInput with no label and no placeholder: announced only as "text field"', 'accessibilityLabel, or aria-labelledby / accessibilityLabelledBy pointing at the visible label\'s nativeID'],
  'rn-state-missing':     ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'React Native: a checkbox, switch, radio or tab with no state (checked / selected isn\'t announced)', 'accessibilityState={{ checked }} / {{ selected }}, or aria-checked / aria-selected'],
  'rn-hidden-control':    ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'React Native: a control hidden from screen readers but still tappable', 'remove aria-hidden / accessibilityElementsHidden / importantForAccessibility="no-hide-descendants" from controls'],
  'rn-live-region-ios':   ['Screen readers', '4.1.3 Status Messages', 'AA', 'fails', 'React Native: announcements use a live region only (aria-live / accessibilityLiveRegion), which is Android-only: VoiceOver users hear nothing', 'call AccessibilityInfo.announceForAccessibility(message) too (assets/a11y-helpers.ts announce())'],
  'rn-status-silent':     ['Screen readers', '4.1.3 Status Messages', 'AA', 'check', 'React Native: a message that appears (error, saved, status) with no announcement', 'announce it: AccessibilityInfo.announceForAccessibility, or aria-live="polite" on Android plus the announcement for iOS'],
  'rn-no-headings':       ['Screen readers', '1.3.1 Info and Relationships', 'A', 'check', 'React Native: no element is marked as a heading anywhere, so screen-reader users can\'t jump between sections', 'accessibilityRole="header" on screen and section titles (the kit\'s Heading)'],
  'web-unnamed-button':   ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'Web: a button with no name (an icon only, no aria-label, no text)', 'aria-label="…" on the button, or visually hidden text; the icon gets aria-hidden="true"'],
  'web-img-no-alt':       ['Screen readers', '1.1.1 Non-text Content', 'A', 'fails', 'Web: an image with no alt attribute', 'alt="what it shows", or alt="" if it is decoration'],
  'web-click-div':        ['Keyboard and focus', '2.1.1 Keyboard; 4.1.2', 'A', 'fails', 'Web: a click handler on an element that isn\'t a control (div, span, li…): no keyboard, no role', 'use a <button> (or <a href> for navigation)'],
  'web-anchor-button':    ['Keyboard and focus', '2.1.1 Keyboard; 4.1.2', 'A', 'fails', 'Web: a link with no real href used as a button', 'a <button type="button">, or give it a real href'],
  'web-aria-hidden-focusable': ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'Web: aria-hidden on something that can take focus', 'remove aria-hidden, or make it unfocusable (and hidden from everyone)'],
  'web-status-silent':    ['Screen readers', '4.1.3 Status Messages', 'AA', 'check', 'Web: a message that appears (error, saved, status) without role="status" / role="alert" / aria-live', 'role="status" for news, role="alert" for errors; the region must exist before the text appears in it'],
  'web-no-lang':          ['Screen readers', '3.1.1 Language of Page', 'A', 'fails', 'Web: <html> has no lang, so screen readers guess the pronunciation', '<html lang="en"> (the page\'s language)'],
  // Forms
  'web-input-unlabelled': ['Forms', '3.3.2 Labels or Instructions; 4.1.2', 'A', 'fails', 'Web: a form field with no accessible name (no label tied to it, no aria-label, no placeholder): announced only as "edit text"', '<label for> / a wrapping <label>, or aria-label / aria-labelledby'],
  'input-purpose':        ['Forms', '1.3.5 Identify Input Purpose', 'AA', 'check', 'A field for the user\'s own details (email, phone, name, address) without autocomplete', 'autoComplete="email" / "tel" / "name"…; React Native: autoComplete (and textContentType on iOS)'],
  'paste-blocked':        ['Forms', '3.3.8 Accessible Authentication (Minimum)', 'AA', 'fails', 'Pasting or password managers are blocked on a sign-in field', 'remove the onPaste block / autocomplete="off": people rely on password managers and pasting'],
  // Keyboard and focus
  'focus-removed':        ['Keyboard and focus', '2.4.7 Focus Visible', 'AA', 'fails', 'Web: the focus outline is removed with nothing in its place', 'keep it, or replace it on :focus-visible (focus-visible:ring-2 …) with 3:1 contrast'],
  'tabindex-positive':    ['Keyboard and focus', '2.4.3 Focus Order', 'A', 'fails', 'Web: a positive tabindex reorders the whole page\'s tab order', 'tabIndex 0 or -1 only; order the DOM instead'],
  // Colour
  'contrast-inline':      ['Contrast and colour', '1.4.3 Contrast (Minimum)', 'AA', 'fails', 'Text colour and background set together that fail the contrast minimum', 'the "nearest passing" colour shown, or a token pair that passes (contrast.mjs)'],
  'contrast-placeholder': ['Contrast and colour', '1.4.3 Contrast (Minimum)', 'AA', 'check', 'Placeholder text below 4.5:1 on the default background', 'darken it, or put the hint in a visible label/helper text instead'],
  'colour-only-status':   ['Contrast and colour', '1.4.1 Use of Color', 'A', 'check', 'A colour that changes with a condition (pass/fail, error, status): is a word or an icon changing too?', 'pair the colour with text ("Failed") or an icon whose shape differs'],
  'link-colour-only':     ['Contrast and colour', '1.4.1 Use of Color', 'A', 'check', 'Links without an underline: inside text they must differ by more than colour', 'underline links in running text (or 3:1 against the text plus a non-colour cue on hover and focus)'],
  // Motion
  'motion-no-reduce':     ['Motion', '2.3.3 Animation from Interactions (AAA); Apple HIG Reduce Motion', 'AAA', 'fails', 'Animation that ignores the Reduce Motion setting (no prefers-reduced-motion / isReduceMotionEnabled anywhere it\'s used)', 'turn non-essential motion off when it\'s set: assets/a11y-helpers (useReducedMotion), CSS @media (prefers-reduced-motion: reduce), MotionConfig reducedMotion="user"'],
  'motion-forced':        ['Motion', '2.3.3 Animation from Interactions (AAA)', 'AAA', 'check', 'Animation told to ignore Reduce Motion (ReduceMotion.Never, reducedMotion="never")', 'only for motion that is essential to the meaning'],
  'autoplay':             ['Motion', '2.2.2 Pause, Stop, Hide', 'A', 'check', 'Something plays or moves on its own (autoplay video, looping animation, auto-advancing carousel)', 'if it runs over 5 seconds beside other content, give a pause control; respect Reduce Motion'],
  // Touch and gestures
  'gesture-only':         ['Touch and gestures', '2.5.1 Pointer Gestures; 2.5.7 Dragging Movements', 'A / AA', 'check', 'A swipe or drag interaction: is there a button that does the same?', 'add a single-tap alternative (a menu item, a "Move up/down" or "Delete" button)'],
  // Flutter
  'flutter-iconbutton-unnamed': ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'Flutter: an IconButton with no tooltip (its accessible name)', 'tooltip: \'…\' (it is also the semantics label)'],
  'flutter-gesture-detector':   ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'check', 'Flutter: GestureDetector has no semantics (no role, no name, no focus)', 'InkWell / a Button widget, or wrap in Semantics(button: true, label: \'…\')'],
  'flutter-input-unlabelled':   ['Forms', '3.3.2 Labels or Instructions; 4.1.2', 'A', 'fails', 'Flutter: a TextField with no label (hintText disappears when typing starts)', 'decoration: InputDecoration(labelText: \'…\')'],
  'flutter-image-unlabelled':   ['Screen readers', '1.1.1 Non-text Content', 'A', 'check', 'Flutter: an image with no semanticLabel and not excluded from semantics', 'semanticLabel: \'…\', or excludeFromSemantics: true if decorative'],
  // Android, iOS
  'android-image-unlabelled':   ['Screen readers', '1.1.1 Non-text Content; 4.1.2', 'A', 'fails', 'Android: an ImageView/ImageButton with no contentDescription', 'android:contentDescription="…", or importantForAccessibility="no" if decorative'],
  'compose-icon-button-unnamed':['Screen readers', '4.1.2 Name, Role, Value', 'A', 'fails', 'Compose: an icon-only button whose Icon has contentDescription = null', 'contentDescription = stringResource(R.string.…)'],
  'swiftui-icon-button':        ['Screen readers', '4.1.2 Name, Role, Value', 'A', 'check', 'SwiftUI: a Button labelled only by an Image: is the label read out?', '.accessibilityLabel("…") or Label("…", systemImage:)'],
};

const findings = [];
const add = (rule, f, line, detail) => { if (ignore.has(rule) || (f && line && exemptAt(f, line))) return; findings.push({ rule, at: f ? `${f.rel}${line ? ':' + line : ''}` : '(project)', detail }); };
const RN_TOUCH = 'Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|TouchableNativeFeedback';
const extraControls = (cfg.controls ?? []).join('|');
// Kit inputs used on screens (web): checked like <input>. A wrapper that renders the label counts.
const inputComponents = cfg.inputComponents ?? ['Input', 'Textarea', 'Select', 'TextField'];
// Icon-button components (MUI, Chakra, a kit): they need a name of their own.
const iconButtons = cfg.iconButtons ?? ['IconButton', 'ActionIcon', 'Fab'];
const labelWrappers = cfg.labelWrappers ?? ['label', 'Field', 'FormField', 'FormControl', 'FormItem', 'FormGroup'];
// A kit primitive that spreads its props ({...rest}) gets its name, role and label from its caller: judged where it's used.
const spreads = (attrs) => /\{\s*\.\.\./.test(attrs);
const hiddenEl = (attrs) => /className\s*=\s*\{?\s*["'`][^"'`]*\b(hidden|sr-only)\b|\bhidden\b(?!\s*=\s*\{?\s*false)|display\s*:\s*['"]?none|type\s*=\s*["']hidden/.test(attrs);

// Something that appears when a message exists: {error && <p>…}, {saved && <Toast>…}.
const STATUS_COND = /\{\s*!?\(?\s*[\w.?]*(error|errors|err|errorMessage|success|saved|message|notice|alert|toast|warning|feedback)\w*[\w.?]*\)?\s*&&\s*\(?\s*</i;
let rnAnnounces = false, rnLiveRegions = [], rnHeadings = false, rnScreens = 0;
let reduceHandled = false; const motionAt = [];   // where motion is defined: { f, line, what }
// Components that announce themselves (role="alert"/"status"/aria-live inside their own file): {cond && <Notice>} is fine.
const announcing = new Set();
for (const f of files) if (/role\s*=\s*\{?[^}\n]*['"](alert|status)['"]|aria-live|accessibilityLiveRegion|announceForAccessibility/.test(f.text)) {
  const base = f.rel.split('/').pop().replace(/\.\w+$/, ''); announcing.add(base);
  for (const m of f.text.matchAll(/export\s+(?:default\s+)?(?:const|function)\s+([A-Z]\w*)/g)) announcing.add(m[1]);
}
const silentStatus = (l) => { const m = l.match(STATUS_COND); if (!m) return false; const tag = (l.slice(m.index).match(/<([A-Z][\w.]*)/) ?? [])[1]; return !(tag && announcing.has(tag.split('.').pop())); };

for (const f of files) {
  const t = f.text;
  if (/announceForAccessibility|announce\(\s*['"`]/.test(t)) rnAnnounces = rnAnnounces || isRN(f);
  if (/prefers-reduced-motion|isReduceMotionEnabled|reduceMotionChanged|useReducedMotion|ReducedMotionConfig|reducedMotion\s*=\s*["']user["']|disableAnimations|accessibilityReduceMotion|ANIMATOR_DURATION_SCALE/.test(t)) reduceHandled = true;

  // ── Markup: React (web and native), Vue, Svelte, HTML ──
  if (isMarkup(f)) {
    const rn = isRN(f);
    if (rn) {
      if (/screens?\//i.test(f.rel) || /Screen\.(t|j)sx$/.test(f.rel)) rnScreens++;
      if (/accessibilityRole\s*=\s*["{']*header|role\s*=\s*["{']*(heading|header)/.test(t)) rnHeadings = true;
      for (const e of elements(t, RN_TOUCH + (extraControls ? '|' + extraControls : ''))) {
        if ((!has(e.attrs, 'onPress') && !has(e.attrs, 'onLongPress')) || spreads(e.attrs)) continue;
        const named = /accessibilityLabel|aria-label|accessibilityLabelledBy|aria-labelledby/.test(e.attrs);
        if (!named && !showsText(e.body)) add('rn-unnamed-control', f, e.line);
        if (!/accessibilityRole|\brole\s*=/.test(e.attrs) && new RegExp(`^(${RN_TOUCH})$`).test(e.tag)) add('rn-control-no-role', f, e.line);
        if (/aria-hidden\s*=\s*\{?\s*true|accessibilityElementsHidden\s*=\s*\{?\s*true|importantForAccessibility\s*=\s*["{']*no-hide-descendants/.test(e.attrs)) add('rn-hidden-control', f, e.line);
      }
      for (const e of elements(t, 'TextInput')) {
        if (spreads(e.attrs)) continue;
        if (!/accessibilityLabel|aria-label|accessibilityLabelledBy|aria-labelledby/.test(e.attrs)) add(has(e.attrs, 'placeholder') ? 'input-placeholder-only' : 'rn-input-unlabelled', f, e.line);
        const kb = val(e.attrs, 'keyboardType') ?? '', tct = val(e.attrs, 'textContentType') ?? '';
        if ((/email|phone/.test(kb) || /emailAddress|telephoneNumber|name|password/.test(tct)) && !has(e.attrs, 'autoComplete')) add('input-purpose', f, e.line);
        if (/onPaste|contextMenuHidden\s*=\s*\{?\s*true/.test(e.attrs) && /secureTextEntry|password/i.test(e.attrs)) add('paste-blocked', f, e.line);
      }
      for (const e of elements(t, '[A-Z][\\w.]*')) {
        const role = (e.attrs.match(/(?:accessibilityRole|role)\s*=\s*\{?\s*["'](\w+)["']/) ?? [])[1];
        if (role && /^(checkbox|switch|radio|tab|togglebutton)$/.test(role) && !/accessibilityState|aria-checked|aria-selected|aria-pressed/.test(e.attrs)) add('rn-state-missing', f, e.line);
      }
      t.split('\n').forEach((l, i) => { if (/accessibilityLiveRegion\s*=|aria-live\s*=/.test(l)) rnLiveRegions.push({ f, line: i + 1 }); });
      if (!/announceForAccessibility|\bannounce\(/.test(t))
        t.split('\n').forEach((l, i, ls) => { if (silentStatus(l) && !/accessibilityLiveRegion|aria-live|accessibilityRole\s*=\s*["{']*alert|role\s*=\s*["{']*alert/.test(elementLines(ls, i))) add('rn-status-silent', f, i + 1); });
    } else {
      for (const e of elements(t, 'button')) {
        if (/aria-label|aria-labelledby|\btitle\s*=/.test(e.attrs) || spreads(e.attrs) || hiddenEl(e.attrs) || showsText(e.body) || imgWithAlt(e.body)) continue;
        add('web-unnamed-button', f, e.line);
      }
      for (const e of elements(t, iconButtons.join('|'))) {
        if (!/aria-label|aria-labelledby|\blabel\s*=|\btitle\s*=|accessibilityLabel/.test(e.attrs) && !spreads(e.attrs) && !/<Tooltip\b[^>]*title\s*=/.test(t.slice(Math.max(0, e.index - 200), e.index))) add('web-unnamed-button', f, e.line, e.tag);
      }
      for (const e of elements(t, '[A-Za-z][\\w.]*')) {
        if (/^role$/.test(e.tag)) continue;
        if (/role\s*=\s*["{']*button/.test(e.attrs) && !/aria-label|aria-labelledby/.test(e.attrs) && !showsText(e.body) && e.tag !== 'button') add('web-unnamed-button', f, e.line);
        if (/^(div|span|li|p|td|tr|section|article|img|i|svg)$/.test(e.tag) && /(^|\s)(onClick|@click|v-on:click|on:click)\s*=/.test(e.attrs) && !/\brole\s*=/.test(e.attrs)) add('web-click-div', f, e.line);
        if (/^(button|a|input|select|textarea)$/.test(e.tag) || /tabIndex|tabindex/.test(e.attrs)) {
          if (/aria-hidden\s*=\s*(["']true["']|\{\s*true\s*\})/.test(e.attrs) && !/tabIndex\s*=\s*\{?\s*["']?-1/i.test(e.attrs)) add('web-aria-hidden-focusable', f, e.line);
        }
        const ti = e.attrs.match(/tab[iI]ndex\s*=\s*\{?\s*["']?(\d+)/); if (ti && Number(ti[1]) > 0) add('tabindex-positive', f, e.line);
      }
      for (const e of elements(t, 'img|Image')) if (!/(^|\s)(alt|:alt)\s*=|\{\s*\.\.\./.test(e.attrs) && !/aria-hidden|role\s*=\s*["']presentation/.test(e.attrs)) add('web-img-no-alt', f, e.line);
      for (const e of elements(t, 'a')) {
        const href = val(e.attrs, 'href');
        if (/(onClick|@click|on:click)\s*=/.test(e.attrs) && (!has(e.attrs, 'href') || href === '#' || /^javascript:/.test(href ?? ''))) add('web-anchor-button', f, e.line);
      }
      const before = (i) => t.slice(Math.max(0, i - 600), i);
      const wrapRe = labelWrappers.join('|');
      for (const e of elements(t, ['input', 'select', 'textarea', ...inputComponents].join('|'))) {
        const type = (val(e.attrs, 'type') ?? '').toLowerCase();
        if (/^(hidden|submit|button|reset|image)$/.test(type) || spreads(e.attrs) || hiddenEl(e.attrs)) continue;
        const id = val(e.attrs, 'id');
        const insideLabel = (() => { const b = before(e.index); for (const w of labelWrappers) { if (b.lastIndexOf('<' + w + ' ') > b.lastIndexOf('</' + w) || b.lastIndexOf('<' + w + '>') > b.lastIndexOf('</' + w)) return true; } return false; })();
        if (/^[A-Z]/.test(e.tag) && /\blabel\s*=/.test(e.attrs)) continue;   // a kit input that takes its label as a prop
        const forMatch = id && new RegExp(`(htmlFor|for)\\s*=\\s*["{']*\\s*["']?${id.replace(/[^\w-]/g, '')}["']?`).test(t);
        if (!/aria-label|aria-labelledby|\btitle\s*=/.test(e.attrs) && !insideLabel && !forMatch) {
          if (has(e.attrs, 'placeholder')) add('input-placeholder-only', f, e.line);
          else add('web-input-unlabelled', f, e.line, id ? 'has an id, but no label for it in this file' : '');
        }
        const name = `${val(e.attrs, 'name') ?? ''} ${id ?? ''}`;
        if ((/^(email|tel)$/.test(type) || /\b(email|phone|tel|mobile|first-?name|last-?name|full-?name|surname|address|postcode|postal|zip)\b/i.test(name)) && !/autoComplete|autocomplete/.test(e.attrs)) add('input-purpose', f, e.line);
        if (type === 'password' && (/autoComplete\s*=\s*["{']*off|autocomplete\s*=\s*["']off/.test(e.attrs) || /onPaste\s*=/.test(e.attrs))) add('paste-blocked', f, e.line);
      }
      if (!/toast\.|sonner|react-hot-toast|notistack|useToast/.test(t))
        t.split('\n').forEach((l, i, ls) => { if (silentStatus(l) && !/aria-live|role\s*=\s*["{']*(status|alert)/.test(elementLines(ls, i))) add('web-status-silent', f, i + 1); });
      if (/\.html$/.test(f.rel)) { const h = t.match(/<html\b[^>]*>/i); if (h && !/\blang\s*=/.test(h[0])) add('web-no-lang', f, lineAt(t, h.index)); }
      // Tailwind focus removal on the same element, with no replacement
      t.split('\n').forEach((l, i) => {
        const cls = l.match(/class(Name)?\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/); if (!cls) return;
        const c = cls[2];
        // A container focused only by code (tabIndex={-1}: a dialog, a skip-link target) may drop its outline.
        const near = t.split('\n').slice(Math.max(0, i - 4), i + 2).join('\n');
        if (/(^|\s)(focus:)?outline-none(\s|$)/.test(c) && !/focus(-visible|-within)?:(ring|outline|border|shadow|bg|underline)|(^|\s)ring-|focus-visible:|focus-ring/.test(c) && !/tab[iI]ndex\s*=\s*\{?\s*["']?-1/.test(near)) add('focus-removed', f, i + 1);
      });
    }
    // Colour pairs and colour-coded status, any React / markup file
    t.split('\n').forEach((l, i) => {
      const fg = l.match(/(?:\bcolor\s*:\s*|text-\[)['"]?(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/), bg = l.match(/(?:background(?:Color)?\s*:\s*|bg-\[)['"]?(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/);
      if (fg && bg) {
        const r = contrast(fg[1], bg[1]);
        const size = Number((l.match(/fontSize\s*:\s*(\d+)/) ?? [])[1] ?? (l.match(/text-\[(\d+)px\]/) ?? [])[1] ?? 16);
        const bold = /fontWeight\s*:\s*['"]?(bold|[7-9]00)|font-bold|font-extrabold|font-black/.test(l);
        const use = isLarge(size, bold ? 700 : 400) ? 'large' : 'text';
        if (r !== null && !passes(r, use)) add('contrast-inline', f, i + 1, `${fg[1]} on ${bg[1]}: ${(Math.floor(r * 100) / 100).toFixed(2)}:1, needs ${use === 'large' ? 3 : 4.5}:1`);
      }
      const ph = l.match(/placeholderTextColor\s*=\s*\{?\s*['"](#[0-9a-fA-F]{3,8})|placeholder:text-\[(#[0-9a-fA-F]{3,8})\]/);
      if (ph) { const r = contrast(ph[1] ?? ph[2], defaultBg); if (r !== null && r < 4.5) add('contrast-placeholder', f, i + 1, `${ph[1] ?? ph[2]} on ${defaultBg}: ${(Math.floor(r * 100) / 100).toFixed(2)}:1`); }
      // A ternary that picks between two colours (or colour classes) on a style/class line.
      if (/\?/.test(l) && /(color|Color|className|class=|:class|style|fill|stroke|tint)/.test(l)) {
        const tern = l.match(/\?\s*([^:?]{1,80}?)\s*:\s*([^,;)}]{1,80})/);
        const colourish = (s) => /#[0-9a-f]{3,8}\b|\b(red|green|amber|orange|yellow|rose|emerald|lime|danger|success|error|warning|positive|negative|critical|ok)\b/i.test(s ?? '');
        if (tern && colourish(tern[1]) && colourish(tern[2])) {
          const cond = (l.slice(0, l.indexOf('?')).match(/([\w.!]+(?:\s*[<>=!]=?=?\s*[\w.'"-]+)?)\s*$/) ?? [])[1];
          // A style variant (danger, primary…) is a design choice whose label says what it is; not a status.
          const variant = /^!?(danger|destructive|primary|secondary|variant|tone|intent|kind|size|dark|isDark|light)$/.test((cond ?? '').trim());
          const nearby = elementLines(t.split('\n'), i);
          const alsoSwitches = cond && [...nearby.matchAll(new RegExp(cond.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\?\\s*([^:?]{1,60}?)\\s*:\\s*([^,;)}]{1,60})', 'g'))].some(m => !colourish(m[1]) || /fa-|Icon|icon|name=|['"][A-Z+−-]/.test(m[0]));
          if (!alsoSwitches && !variant) add('colour-only-status', f, i + 1);
        }
      }
    });
    // Motion and gestures
    t.split('\n').forEach((l, i) => {
      if (/from\s+['"](framer-motion|motion\/react)['"]/.test(l) && !/useReducedMotion|reducedMotion\s*=\s*["']user/.test(t)) motionAt.push({ f, line: i + 1, what: 'framer-motion (reducedMotion defaults to "never")' });
      if (/\bAnimated\.(timing|spring|loop|decay)\(|LayoutAnimation\.(configureNext|easeInEaseOut|spring)/.test(l)) motionAt.push({ f, line: i + 1, what: 'React Native Animated (does not follow Reduce Motion by itself)' });
      if (/from\s+['"]gsap['"]|from\s+['"]@react-spring|from\s+['"]react-spring/.test(l)) motionAt.push({ f, line: i + 1, what: l.match(/gsap|react-spring/)[0] });
      if (/<LottieView\b|from\s+['"]lottie-react/.test(l)) motionAt.push({ f, line: i + 1, what: 'Lottie' });
      const bare = l.match(/(?<![\w:-])animate-(bounce|ping)\b/); if (bare && !/motion-reduce:animate-none/.test(l)) motionAt.push({ f, line: i + 1, what: bare[0] + ' (use motion-safe:)' });
    });
    t.split('\n').forEach((l, i) => {
      if (/ReduceMotion\.Never|reducedMotion\s*=\s*["']never/.test(l)) add('motion-forced', f, i + 1);
      if (/<video\b[^>]*\bautoPlay|<video\b[^>]*\bautoplay|\bautoplay\s*[:=]\s*\{?\s*(true|\d)|<LottieView\b[^>]*\bloop\b|autoPlay[^>]*\bloop\b/.test(l) && !/controls|a11y-exempt/.test(l)) add('autoplay', f, i + 1);
      if (/\b(Swipeable|ReanimatedSwipeable|PanGestureHandler|Gesture\.Pan\(|DraggableFlatList|DragDropContext|DndContext|useDraggable|useSortable|SortableContext|draggable\s*=\s*\{?\s*["']?true)/.test(l)) add('gesture-only', f, i + 1);
    });
  }

  // ── CSS ──
  if (/\.(css|scss)$/.test(f.rel) || /<style[\s>]/.test(t)) {
    const css = t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(), body = m[2], line = lineAt(css, m.index + m[0].indexOf(m[2]));
      if (/:focus(?!-within)(?!:not)/.test(sel) && /outline\s*:\s*(none|0)\b/.test(body) && !/box-shadow|border(-color)?\s*:|outline-offset|outline\s*:\s*\d+px\s+\w/.test(body) && !/:focus:not\(:focus-visible\)/.test(sel)
        && !sel.split(',').every(x => { const base = x.trim().replace(/:focus\b.*$/, ''); return base && css.includes(`${base}:focus-visible`); })) add('focus-removed', f, line);
      if (/^\s*(a|a:link|\.prose a|p a)\s*$/.test(sel) && /text-decoration\s*:\s*none/.test(body)) add('link-colour-only', f, line);
      const fg = body.match(/(?:^|[;\s])color\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/), bg = body.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/);
      if (fg && bg) {
        const r = contrast(fg[1], bg[1]);
        const px = Number((body.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/) ?? [])[1] ?? 16), bold = /font-weight\s*:\s*(bold|[7-9]00)/.test(body);
        const use = isLarge(px, bold ? 700 : 400) ? 'large' : 'text';
        if (r !== null && !passes(r, use)) add('contrast-inline', f, line, `${sel}: ${fg[1]} on ${bg[1]}: ${(Math.floor(r * 100) / 100).toFixed(2)}:1, needs ${use === 'large' ? 3 : 4.5}:1`);
      }
      if (/::?placeholder/.test(sel)) { const c = body.match(/color\s*:\s*(#[0-9a-fA-F]{3,8})/); if (c) { const r = contrast(c[1], defaultBg); if (r < 4.5) add('contrast-placeholder', f, line, `${c[1]} on ${defaultBg}: ${(Math.floor(r * 100) / 100).toFixed(2)}:1`); } }
    }
    keyframeMotion(f, css);
    css.split('\n').forEach((l, i) => { if (/scroll-behavior\s*:\s*smooth/.test(l)) motionAt.push({ f, line: i + 1, what: 'smooth scrolling' }); if (/animation[\w-]*\s*:[^;]*\binfinite\b/.test(l) && !/\b(spin|pulse|loading|loader|skeleton|shimmer|progress|indeterminate)\b/i.test(l)) add('autoplay', f, i + 1, 'an animation that never stops'); });
  }

  // ── Flutter ──
  if (f.rel.endsWith('.dart')) {
    const call = (re, fn) => { for (const m of t.matchAll(re)) fn(group(t, m.index + m[0].length - 1), lineAt(t, m.index)); };
    call(/\bIconButton\s*\(/g, (a, line) => { if (!/tooltip\s*:|semanticLabel/.test(a)) add('flutter-iconbutton-unnamed', f, line); });
    call(/\bGestureDetector\s*\(/g, (a, line) => { if (!/Semantics\s*\(/.test(t.slice(Math.max(0, t.lastIndexOf('\n', t.indexOf(a)) - 120), t.indexOf(a)))) add('flutter-gesture-detector', f, line); });
    call(/\b(?:Image\.(?:asset|network|file|memory)|SvgPicture\.(?:asset|network))\s*\(/g, (a, line) => { if (!/semanticLabel|semanticsLabel|excludeFromSemantics/.test(a)) add('flutter-image-unlabelled', f, line); });
    call(/\bTextF(?:ormF)?ield\s*\(/g, (a, line) => { if (!/labelText|semanticsLabel|label\s*:/.test(a)) add('flutter-input-unlabelled', f, line); });
    t.split('\n').forEach((l, i) => { if (/AnimationController\s*\(|\.repeat\(\)|Lottie\.(asset|network)/.test(l)) motionAt.push({ f, line: i + 1, what: 'Flutter animation (check MediaQuery.disableAnimationsOf)' }); });
  }
  // ── Android ──
  if (f.rel.endsWith('.xml')) {
    for (const m of t.matchAll(/<(ImageView|ImageButton|androidx\.appcompat\.widget\.AppCompatImageView|com\.google\.android\.material\.floatingactionbutton\.FloatingActionButton)\b([^>]*)\/?>/g))
      if (!/contentDescription|importantForAccessibility\s*=\s*"no"/.test(m[2])) add('android-image-unlabelled', f, lineAt(t, m.index));
  }
  if (f.rel.endsWith('.kt')) {
    const lines = t.split('\n');
    lines.forEach((l, i) => { if (/IconButton\s*\(/.test(l) && /contentDescription\s*=\s*null/.test(lines.slice(i, i + 6).join('\n'))) add('compose-icon-button-unnamed', f, i + 1); });
  }
  // ── SwiftUI ──
  if (f.rel.endsWith('.swift')) {
    for (const m of t.matchAll(/\bButton\s*(\(action:[^)]*\))?\s*\{/g)) {
      const blk = group(t, m.index + m[0].length - 1, '{'), after = t.slice(m.index + m[0].length - 1 + blk.length, m.index + m[0].length + blk.length + 80);
      if (/Image\(systemName:|Image\("/.test(blk) && !/Text\(|Label\(|accessibilityLabel/.test(blk + after.split('\n')[0] + after.split('\n')[1])) add('swiftui-icon-button', f, lineAt(t, m.index));
    }
    t.split('\n').forEach((l, i) => { if (/\.repeatForever|withAnimation\(\.spring|\.animation\(\.spring/.test(l)) motionAt.push({ f, line: i + 1, what: 'SwiftUI animation (check accessibilityReduceMotion)' }); });
  }
}

// Keyframes that move things (translate, scale, rotate, position): fading alone is not motion.
function keyframeMotion(f, text) {
  for (const m of text.matchAll(/@keyframes\s+([\w-]+)\s*\{|['"]?([\w-]+)['"]?\s*:\s*\{\s*['"]?(?:0%|from)['"]?\s*:/g)) {
    let d = 0, j = text.indexOf('{', m.index);
    for (let k = j; k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) { j = k; break; } }
    const body = text.slice(m.index, j);
    if (/transform|translate|scale|rotate|(^|[\s;{])(left|top|right|bottom)\s*:/.test(body) && !/spin/.test(m[1] ?? m[2])) motionAt.push({ f, line: lineAt(text, m.index), what: `keyframes "${m[1] ?? m[2]}" move things` });
  }
}
for (const n of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs']) if (existsSync(join(ROOT, n))) {
  const f = { rel: n, text: readFileSync(join(ROOT, n), 'utf8') };
  if (/keyframes/.test(f.text)) keyframeMotion(f, f.text.slice(f.text.indexOf('keyframes')));
  if (/prefers-reduced-motion/.test(f.text)) reduceHandled = true;
}

// ── Project-level findings ──
if (rnLiveRegions.length && !rnAnnounces) for (const { f, line } of rnLiveRegions) add('rn-live-region-ios', f, line);
if (projectIsRN && rnScreens >= 2 && !rnHeadings) add('rn-no-headings', null, null);
if (!reduceHandled) { const seen = new Set(); for (const m of motionAt) { const k = `${m.f.rel}:${m.line}`; if (!seen.has(k)) { seen.add(k); add('motion-no-reduce', m.f, m.line, m.what); } } }

// ── The review panel: development only, and listed until it's removed ──
const DEV_GUARD = /import\.meta\.env\.DEV|__DEV__|process\.env\.NODE_ENV/;
const toolUses = [];
for (const f of files) {
  const lines = f.text.split('\n');
  lines.forEach((l, i) => {
    if (!/a11y-preview/.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
    toolUses.push({ at: `${f.rel}:${i + 1}`, guarded: DEV_GUARD.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n')) });
  });
}

// ── Tools the project should run as well ──
const tools = [];
const isWeb = files.some(f => isMarkup(f) && !isRN(f));
if (isWeb && /react/.test(Object.keys(deps).join(' ')) && !deps['eslint-plugin-jsx-a11y']) tools.push('eslint-plugin-jsx-a11y: about 35 lint rules for React markup, in the editor as you type');
if (isWeb && !deps['axe-core'] && !deps['@axe-core/playwright'] && !deps['jest-axe'] && !deps['vitest-axe']) tools.push('axe-core (with @axe-core/playwright): the standard engine for checking the rendered page; a11y-render.mjs and the review panel use it when it is installed');
if (projectIsRN && !deps['eslint-plugin-react-native-a11y']) tools.push('eslint-plugin-react-native-a11y: checks role/state/value props are valid (it covers Touchable*, not Pressable: this audit covers that)');
if (projectIsRN) tools.push('On devices: VoiceOver (iOS) and TalkBack (Android), Xcode Accessibility Inspector, Android Accessibility Scanner. Nothing replaces them.');

// ── Baseline (ratchet) ──
const counts = {};
for (const x of findings) counts[x.rule] = (counts[x.rule] ?? 0) + 1;
const baseFile = join(ROOT, 'a11y-baseline.json');
if (args.includes('--init')) { writeFileSync(baseFile, JSON.stringify({ _about: 'a11y-audit.mjs counts on the day this was recorded. CI fails if a "fails" rule grows. Lower these as you fix; never raise them.', ...counts }, null, 2) + '\n'); console.log(`Recorded ${findings.length} findings across ${Object.keys(counts).length} rules in a11y-baseline.json.`); process.exit(0); }
const baseline = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')) : null;

if (args.includes('--json')) { console.log(JSON.stringify({ files: files.length, findings: findings.map(x => ({ ...x, area: R[x.rule][0], wcag: R[x.rule][1], level: R[x.rule][2], kind: R[x.rule][3] })), counts, tools }, null, 2)); process.exit(0); }

const L = ['# Accessibility audit', '', `${files.length} files${srcDirs.length ? ' in ' + srcDirs.join(', ') : ' (no source folders found: set srcDirs in a11y.config.json)'}. Mapped to WCAG 2.2. **fails**: a pattern that fails wherever it appears. **check**: often fails; a person decides.`, ''];
const AREAS = ['Contrast and colour', 'Screen readers', 'Forms', 'Keyboard and focus', 'Motion', 'Touch and gestures'];
if (!findings.length) L.push('Nothing found in the code. That is not the same as accessible: do the checks in references/testing.md with a screen reader and a keyboard.', '');
for (const area of AREAS) {
  const rules = Object.keys(counts).filter(r => R[r][0] === area).sort((a, b) => (R[a][3] === 'fails' ? 0 : 1) - (R[b][3] === 'fails' ? 0 : 1) || counts[b] - counts[a]);
  if (!rules.length) continue;
  L.push(`## ${area}`, '', '| | What | WCAG | Count | Fix | Where (first 5) |', '|---|---|---|---|---|---|');
  for (const r of rules) {
    const at = findings.filter(x => x.rule === r);
    const base = baseline?.[r];
    L.push(`| ${R[r][3] === 'fails' ? '✗ fails' : '? check'} | ${R[r][4]} | ${R[r][1]} (${R[r][2]}) | ${counts[r]}${base !== undefined ? ` (baseline ${base})` : ''} | ${R[r][5]} | ${at.slice(0, 5).map(x => `\`${x.at}\`${x.detail ? ` ${x.detail}` : ''}`).join('<br>')} |`);
  }
  L.push('');
}
if (toolUses.length) L.push('## Review panel still installed', '', 'Delete assets/a11y-preview.js from the app, and these lines, when the review is done.', '', ...toolUses.map(u => `- \`${u.at}\`${u.guarded ? ' (development only)' : ' **not behind a development check: it would ship to users**'}`), '');
if (tools.length) L.push('## Tools to run as well', '', ...tools.map(x => `- ${x}`), '');
L.push('## What code can\'t tell you', '', 'Reading order, whether names make sense out of context, where focus goes after a dialog closes, what is announced and when, whether an error says how to fix it. Do references/testing.md on the main flows with VoiceOver or TalkBack and a keyboard.');
console.log(L.join('\n'));

if (args.includes('--strict')) {
  const over = Object.entries(counts).filter(([r, n]) => R[r][3] === 'fails' && n > (baseline?.[r] ?? 0));
  const shipping = toolUses.filter(u => !u.guarded);
  if (shipping.length) console.log(`\n✗ The review panel would ship: ${shipping.map(u => u.at).join(', ')}`);
  if (over.length) console.log(`\n✗ ${over.map(([r, n]) => `${r}: ${n}${baseline ? ` (baseline ${baseline[r] ?? 0})` : ''}`).join(', ')}`);
  if (over.length || shipping.length) process.exit(1);
}
