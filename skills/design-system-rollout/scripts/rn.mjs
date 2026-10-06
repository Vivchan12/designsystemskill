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

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const lineAt = (text, i) => text.slice(0, i).split('\n').length;

/** Every style object in a file: innermost { … } blocks holding at least one style key. */
export function styleBlocks(src) {
  const text = strip(src);
  const out = [];
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const props = {};
    for (const p of m[1].matchAll(/(?:^|[,\s])(\w+)\s*:\s*([^,\n}]+)/g)) if (STYLE_KEYS.test(p[1])) props[p[1]] = p[2].trim();
    if (Object.keys(props).length) out.push({ props, line: lineAt(text, m.index) });
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

const TOUCH = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g;
/** Hand-built touchables: whether each has an accessibility label, or text a screen reader can read. */
export function touchables(src) {
  const text = strip(src);
  const out = [];
  for (const m of text.matchAll(TOUCH)) {
    // The opening tag runs to the first `>` that isn't part of `=>`.
    let i = m.index + m[0].length, depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++; else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break;
    }
    const open = text.slice(m.index, i + 1);
    const close = text.indexOf(`</${m[1]}>`, i);
    const body = close > 0 ? text.slice(i, close) : '';
    out.push({
      tag: m[1], line: lineAt(text, m.index),
      labelled: /accessibilityLabel|aria-label|accessibilityLabelledBy/.test(open),
      role: /accessibilityRole|role=/.test(open),
      hasText: /<Text\b|<[A-Z]\w*Text\b|<(Heading|Label|Eyebrow|Body)\b/.test(body),
      selfClosing: /\/>$/.test(open),
    });
  }
  return out;
}

export const count = (src, re) => (strip(src).match(re) ?? []).length;
