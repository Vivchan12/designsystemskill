// React Native: what a screen's styling looks like when there are no class
// names. Styles are objects, inline (style={{ fontSize: 14 }}) or in
// StyleSheet.create({ title: { fontSize: 14 } }), and a value is either a
// literal (14, '#22313f') or a token reference (type.body.fontSize, space.md).
// Shared by inventory, check-kit and check-tokens.

export const STYLE_KEYS = /^(fontSize|lineHeight|fontWeight|fontFamily|letterSpacing|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|gap|rowGap|columnGap|padding|paddingHorizontal|paddingVertical|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginHorizontal|marginVertical|marginTop|marginBottom|marginLeft|marginRight|height|minHeight|width|minWidth|color|backgroundColor|borderColor|shadowColor|tintColor)$/;
export const FAMILY = (k) =>
  /^fontSize$/.test(k) ? 'fontSize' : /^lineHeight$/.test(k) ? 'lineHeight' : /^fontWeight$/.test(k) ? 'fontWeight' :
  /^fontFamily$/.test(k) ? 'fontFamily' : /^letterSpacing$/.test(k) ? 'letterSpacing' : /Radius$/.test(k) ? 'radius' :
  /^(gap|rowGap|columnGap)$/.test(k) ? 'gap' : /^padding/.test(k) ? 'padding' : /^margin/.test(k) ? 'margin' :
  /^(height|minHeight)$/.test(k) ? 'height' : /^(width|minWidth)$/.test(k) ? 'width' : /[cC]olor$/.test(k) ? 'colour' : null;

// Comments become spaces, so positions and line numbers stay right.
export const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
const lineAt = (text, i) => text.slice(0, i).split('\n').length;

/** Index just past a string or template literal starting at i (templates may nest ${…}). */
function skipString(t, i) {
  const q = t[i];
  for (let j = i + 1; j < t.length; j++) {
    if (t[j] === '\\') { j++; continue; }
    if (q === '`' && t[j] === '$' && t[j + 1] === '{') { j = matchBrace(t, j + 1); continue; }
    if (t[j] === q) return j + 1;
    if (q !== '`' && t[j] === '\n') return j;
  }
  return t.length;
}
/** Index of the bracket matching the one at i, skipping strings and templates. */
function matchBrace(t, i) {
  let d = 0;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === '"' || c === "'" || c === '`') { j = skipString(t, j) - 1; continue; }
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') { d--; if (d === 0) return j; }
  }
  return t.length - 1;
}
/** The top-level `key: value` pairs of the object body between a and b. */
function topProps(t, a, b) {
  const props = [];
  let start = a, d = 0;
  const push = (end) => {
    const seg = t.slice(start, end);
    const m = seg.match(/^\s*['"]?(\w+)['"]?\s*:\s*([\s\S]*?)\s*$/);
    if (m) props.push({ key: m[1], value: m[2] });
  };
  for (let j = a; j < b; j++) {
    const c = t[j];
    if (c === '"' || c === "'" || c === '`') { j = skipString(t, j) - 1; continue; }
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ',' && d === 0) { push(j); start = j + 1; }
  }
  push(b);
  return props;
}

const NOT_A_STYLE_PARENT = /Offset$|^transform$/;   // shadowOffset: { width, height } is not a size
/** Every style object in a file: any { … } holding at least one style key,
 *  with its top-level props, its line, and its name when it is a StyleSheet
 *  entry (`title: { … }`). A template string or a nested object no longer
 *  cuts a style short. */
export function styleBlocks(src) {
  const text = strip(src);
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i) - 1; continue; }
    if (c !== '{') continue;
    const end = matchBrace(text, i);
    const parent = text.slice(Math.max(0, i - 80), i).match(/(\w+)\s*:\s*$/)?.[1];
    if (parent && NOT_A_STYLE_PARENT.test(parent)) continue;
    const props = {};
    for (const p of topProps(text, i + 1, end)) if (STYLE_KEYS.test(p.key)) props[p.key] = p.value.trim();
    if (Object.keys(props).length) out.push({ props, line: lineAt(text, i), name: parent ?? null, start: i, end });
  }
  return out;
}

/** A literal number or colour, as opposed to a token reference or an expression. */
export const literal = (v) => {
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  const s = v.match(/^(['"])(.*)\1$/);
  if (s && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(s[2])) return s[2].toLowerCase();
  if (s && /^\d{3}$|^(bold|normal)$/.test(s[2])) return s[2];
  return null;
};
export const isTokenRef = (v) => /^[A-Za-z_$][\w$]*(\??\.[\w$]+|\[['"][\w-]+['"]\])+$/.test(v);

/** Every colour literal in a file, wherever it sits: a style, an icon's
 *  color="#…", a constant, an rgba(). One list, so the total and the table agree. */
export function colourLiterals(src) {
  const text = strip(src);
  const out = [];
  for (const m of text.matchAll(/(['"`])(#[0-9a-fA-F]{3,8}|rgba?\([^)'"`]*\)|hsla?\([^)'"`]*\))\1/g)) out.push({ value: m[2].toLowerCase().replace(/\s+/g, ''), line: lineAt(text, m.index) });
  return out;
}

const TOUCH = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g;
/** Hand-built touchables: whether each has a label or readable text, and its
 *  height and width when its style says (inline, or a StyleSheet entry it names). */
export function touchables(src, blocks = styleBlocks(src)) {
  const text = strip(src);
  const named = Object.fromEntries(blocks.filter(b => b.name).map(b => [b.name, b.props]));
  const out = [];
  for (const m of text.matchAll(TOUCH)) {
    // The opening tag runs to the first `>` outside braces that isn't part of `=>`.
    let i = m.index + m[0].length, depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '"' || c === "'" || c === '`') { i = skipString(text, i) - 1; continue; }
      if (c === '{') depth++; else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break;
    }
    const open = text.slice(m.index, i + 1);
    const close = text.indexOf(`</${m[1]}>`, i);
    const body = close > 0 ? text.slice(i, close) : '';
    // Its size: style objects inside the tag, plus any styles.x / s.x it names.
    const size = {};
    const styleAt = open.indexOf('style=');
    if (styleAt >= 0) {
      for (const b of blocks) if (b.start > m.index + styleAt && b.end < m.index + open.length) Object.assign(size, b.props);
      for (const r of open.slice(styleAt).matchAll(/\b\w+\.(\w+)\b/g)) if (named[r[1]]) Object.assign(size, named[r[1]]);
    }
    const num = (k) => (size[k] !== undefined && typeof literal(size[k]) === 'number' ? literal(size[k]) : null);
    out.push({
      tag: m[1], line: lineAt(text, m.index),
      labelled: /accessibilityLabel|aria-label|accessibilityLabelledBy/.test(open),
      role: /accessibilityRole|role=/.test(open),
      hitSlop: /hitSlop/.test(open),
      hasText: /<Text\b|<[A-Z]\w*Text\b|<(Heading|Label|Eyebrow|Body)\b/.test(body),
      height: num('minHeight') ?? num('height'),
      width: num('minWidth') ?? num('width'),
    });
  }
  return out;
}

export const count = (src, re) => (strip(src).match(re) ?? []).length;
