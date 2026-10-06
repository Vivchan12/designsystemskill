#!/usr/bin/env node
/**
 * scale-table: the accessibility text scale. For every text-size setting a
 * user can choose on their phone (iPhone Dynamic Type, Android font scale),
 * the size each text role actually renders at once the policy is applied:
 *
 *   rendered = clamp(base × setting, floor, base × roleMax)
 *   where the setting itself is first held between minScale and maxScale.
 *
 *   node scale-table.mjs                      # the table, as markdown
 *   node scale-table.mjs --emit ts > src/theme/textScale.ts    # React Native helper
 *   node scale-table.mjs --emit css > src/styles/text-scale.css # web: then @import it from your entry CSS
 *   node scale-table.mjs --emit css --prefix ds   # --ds-text-body, --ds-icon-md: match the project's token prefix
 *   node scale-table.mjs --json
 *
 * Reads text-scale.config.json in the project root (template in the skill's
 * assets/). It also flags what goes wrong in the policy itself: a role that
 * ends up smaller than a lesser role, body text that can't reach 200%
 * (WCAG 1.4.4), a line height too tight for the size it reaches.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), 'text-scale.config.json');
if (!existsSync(file)) { console.error('✗ No text-scale.config.json in this folder. Copy the template from the skill\'s assets/.'); process.exit(1); }
const cfg = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const emit = args.includes('--emit') ? args[args.indexOf('--emit') + 1] : null;
// A project with its own token prefix (--ds-*) gets one family, not two.
const prefixArg = args.includes('--prefix') ? args[args.indexOf('--prefix') + 1] : cfg.cssPrefix;
const pfx = prefixArg ? `${String(prefixArg).replace(/^-+|-+$/g, '')}-` : '';

// What users can actually pick. iPhone: Dynamic Type sizes, as a ratio of the
// default body size (17pt at "Large"). Android: the font scale presets.
export const SETTINGS = [
  { platform: 'iPhone', name: 'xSmall', scale: 14 / 17 },
  { platform: 'iPhone', name: 'Small', scale: 15 / 17 },
  { platform: 'iPhone', name: 'Medium', scale: 16 / 17 },
  { platform: 'iPhone', name: 'Large (default)', scale: 1 },
  { platform: 'iPhone', name: 'xLarge', scale: 19 / 17 },
  { platform: 'iPhone', name: 'xxLarge', scale: 21 / 17 },
  { platform: 'iPhone', name: 'xxxLarge', scale: 23 / 17 },
  { platform: 'iPhone', name: 'Accessibility 1', scale: 28 / 17 },
  { platform: 'iPhone', name: 'Accessibility 2', scale: 33 / 17 },
  { platform: 'iPhone', name: 'Accessibility 3', scale: 40 / 17 },
  { platform: 'iPhone', name: 'Accessibility 4', scale: 47 / 17 },
  { platform: 'iPhone', name: 'Accessibility 5', scale: 53 / 17 },
  { platform: 'Android', name: 'Small', scale: 0.85 },
  { platform: 'Android', name: 'Default', scale: 1 },
  { platform: 'Android', name: 'Large', scale: 1.15 },
  { platform: 'Android', name: 'Largest (pre-14)', scale: 1.3 },
  { platform: 'Android', name: '150%', scale: 1.5 },
  { platform: 'Android', name: '180%', scale: 1.8 },
  { platform: 'Android', name: '200%', scale: 2 },
];

const policy = { minScale: 0.8, maxScale: 2, minSize: 12, ...cfg.policy };
const roles = Object.entries(cfg.roles ?? {}).map(([name, r]) => ({ name, ...r }))
  .sort((a, b) => a.size - b.size);
if (!roles.length) { console.error('✗ No "roles" in text-scale.config.json: list each text style with its size.'); process.exit(1); }

/** The size a role renders at for a system scale. */
export function rendered(role, systemScale, p = policy) {
  const s = Math.min(Math.max(systemScale, p.minScale), p.maxScale);
  const roleMax = role.maxScale ?? p.maxScale;
  const floor = role.minSize ?? p.minSize;
  const size = Math.min(role.size * s, role.size * roleMax);
  return Math.max(size, Math.min(floor, role.size * roleMax));
}
// Icons beside text grow with it, but less (a 2× icon crowds its row), and
// never shrink (a small icon stops being recognisable).
const icons = { maxScale: 1.5, sizes: { sm: 16, md: 20, lg: 24 }, ...cfg.icons };
export const renderedIcon = (size, systemScale) => size * Math.min(Math.max(systemScale, 1), icons.maxScale, policy.maxScale);
const round = (n) => Math.round(n * 2) / 2;   // half points: what a designer can actually set

// ── Problems with the policy itself ──
const problems = [];
for (const r of roles) {
  const reach = (r.maxScale ?? policy.maxScale);
  if (r.role === 'body' || r.reading) { if (reach < 2) problems.push(`"${r.name}" is reading text but can only grow to ${Math.round(reach * 100)}%. WCAG 1.4.4 asks for 200%.`); }
  else if (reach < 2 && r.size < 20) problems.push(`"${r.name}" (${r.size}pt) stops growing at ${Math.round(reach * 100)}%. Only text that starts large (about 20pt and up) should stop before 200%.`);
  if ((r.minSize ?? policy.minSize) > r.size) problems.push(`"${r.name}" (${r.size}pt) is below the floor (${r.minSize ?? policy.minSize}pt) even at the default setting: raise its base size.`);
  if (r.lineHeight && r.lineHeight / r.size < 1.15) problems.push(`"${r.name}" line height ${r.lineHeight} is under 1.15× its size: lines will collide as it grows. Store it as a ratio.`);
}
// A bigger role must never render smaller than a lesser one, at any setting.
for (let i = 1; i < roles.length; i++) for (let j = 0; j < i; j++) {
  const lo = roles[j], hi = roles[i];
  const flips = SETTINGS.filter(st => round(rendered(hi, st.scale)) < round(rendered(lo, st.scale)));
  if (flips.length) problems.push(`"${hi.name}" renders smaller than "${lo.name}" from ${flips[0].platform} ${flips[0].name} up (${round(rendered(hi, flips[0].scale))}pt vs ${round(rendered(lo, flips[0].scale))}pt), on ${flips.length} setting(s): the hierarchy flips. Raise "${hi.name}"'s maxScale to at least ${(Math.ceil(lo.size * (lo.maxScale ?? policy.maxScale) / hi.size * 100) / 100).toFixed(2)}.`);
}
if (icons.maxScale < 1.25) problems.push(`icons.maxScale ${icons.maxScale}: icons will look tiny beside large text. Let them reach at least 1.25×.`);
if (policy.minScale > 1) problems.push('minScale above 1 ignores users who chose smaller text.');
if (policy.maxScale < 2) problems.push(`maxScale ${policy.maxScale}: text can't reach 200%, which WCAG 1.4.4 requires.`);

if (emit === 'ts') {
  console.log(`// Generated by scale-table.mjs from text-scale.config.json. Don't edit by hand.
// Every text component reads its size from here, so the phone's text-size
// setting is respected within the agreed range, the same way everywhere.
import { PixelRatio } from 'react-native';

/** The phone's setting, unless the review tool (TextScalePreview) is choosing one. */
export const currentScale = (): number => (globalThis as any).__TEXT_SCALE_PREVIEW__ ?? PixelRatio.getFontScale();

export const TEXT_SCALE_POLICY = ${JSON.stringify(policy)} as const;
export const TEXT_ROLES = ${JSON.stringify(Object.fromEntries(roles.map(r => [r.name, { size: r.size, lineHeight: r.lineHeight ?? null, maxScale: r.maxScale ?? policy.maxScale, minSize: r.minSize ?? policy.minSize }])), null, 2)} as const;
export type TextRole = keyof typeof TEXT_ROLES;

/** The rendered size and line height of a role for the phone's current setting.
 *  Use with allowFontScaling={false}: the scale is applied here, within limits. */
export function scaledText(role: TextRole, systemScale = currentScale()) {
  const r = TEXT_ROLES[role];
  const s = Math.min(Math.max(systemScale, TEXT_SCALE_POLICY.minScale), TEXT_SCALE_POLICY.maxScale);
  const size = Math.max(Math.min(r.size * s, r.size * r.maxScale), Math.min(r.minSize, r.size * r.maxScale));
  return { fontSize: size, lineHeight: r.lineHeight ? Math.round(size * (r.lineHeight / r.size)) : undefined };
}

export const ICON_SIZES = ${JSON.stringify(icons.sizes)} as const;

/** An icon's size for the phone's current setting: it grows with the text,
 *  up to ${icons.maxScale}×, and never shrinks. Pass a step (ICON_SIZES.md) or a number. */
export function scaledIcon(size: number, systemScale = currentScale()) {
  return Math.round(size * Math.min(Math.max(systemScale, 1), ${icons.maxScale}, TEXT_SCALE_POLICY.maxScale));
}`);
  process.exit(0);
}
if (emit === 'css') {
  // On the web, rem follows the browser's text-size setting. The floor and the
  // ceiling are in px, so they hold whatever that setting is; page zoom still
  // scales everything, px included, so zooming is never blocked.
  console.log(`/* Generated by scale-table.mjs from text-scale.config.json. Don't edit by hand.
   Each role follows the browser's text-size setting (rem), held between a
   floor and a ceiling (px). Use: font-size: var(--${pfx}text-body).

   Import this file from your entry CSS: @import './text-scale.css';
   A Tailwind config that reads these names does not load them in the browser:
   without the import, every var() here is undefined and falls back silently. */
:root {
  --text-scale-floor: ${policy.minSize}px;   /* for the review tool: text held here at small settings is fine */
${roles.map(r => {
    const min = Math.max(r.minSize ?? policy.minSize, r.size * policy.minScale);
    const max = r.size * (r.maxScale ?? policy.maxScale);
    return `  --${pfx}text-${r.name}: clamp(${+min.toFixed(2)}px, ${+(r.size / 16).toFixed(4)}rem, ${+max.toFixed(2)}px);`;
  }).join('\n')}

  /* Icons grow with the text up to ${icons.maxScale}×, and never shrink.
     Use: width: var(--${pfx}icon-md); height: var(--${pfx}icon-md). */
${Object.entries(icons.sizes).map(([n, v]) => `  --${pfx}icon-${n}: clamp(${v}px, ${+(v / 16).toFixed(4)}rem, ${+(v * Math.min(icons.maxScale, policy.maxScale)).toFixed(2)}px);`).join('\n')}
}`);
  console.error(`\nNext: @import this file from your entry CSS (index.css or main.css). Tailwind reading it does not load it in the browser.`);
  process.exit(0);
}
if (args.includes('--json')) {
  console.log(JSON.stringify({ policy, roles, icons, settings: SETTINGS.map(st => ({ ...st, sizes: Object.fromEntries(roles.map(r => [r.name, round(rendered(r, st.scale))])) })), problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

const L = [];
L.push('# Text scale', '', `Policy: the phone's setting is followed between **${Math.round(policy.minScale * 100)}%** and **${Math.round(policy.maxScale * 100)}%** of the default; no text renders below **${policy.minSize}pt**${roles.some(r => r.maxScale) ? '; some roles stop growing sooner (below)' : ''}.`, '');
L.push(`| Setting | Phone asks for | ${roles.map(r => `${r.name} (${r.size})`).join(' | ')} |`, `|---|---|${roles.map(() => '---').join('|')}|`);
for (const st of SETTINGS) {
  const held = st.scale < policy.minScale ? ' ↑ held' : st.scale > policy.maxScale ? ' ↓ held' : '';
  L.push(`| ${st.platform} ${st.name} | ${Math.round(st.scale * 100)}%${held} | ${roles.map(r => { const v = round(rendered(r, st.scale)); const capped = r.size * st.scale > v + 0.25 ? '*' : r.size * st.scale < v - 0.25 ? '†' : ''; return v + capped; }).join(' | ')} |`);
}
L.push('', '`*` held at its maximum; `†` lifted to the floor. "↑ held" / "↓ held": the phone asks for more or less than the policy allows, so the nearest limit is used.');
const lim = roles.filter(r => r.maxScale);
if (lim.length) L.push('', `Roles that stop growing sooner: ${lim.map(r => `${r.name} at ${Math.round(r.maxScale * 100)}% (${round(r.size * r.maxScale)}pt)`).join(', ')}.`);
const iconSteps = Object.entries(icons.sizes);
if (iconSteps.length) {
  L.push('', '## Icons', '', `Icons beside text grow with it up to **${Math.round(icons.maxScale * 100)}%**, and never shrink. Icon-only buttons keep a 44pt tap area at every setting.`, '');
  L.push(`| Setting | Phone asks for | ${iconSteps.map(([n, v]) => `${n} (${v})`).join(' | ')} |`, `|---|---|${iconSteps.map(() => '---').join('|')}|`);
  for (const st of SETTINGS) L.push(`| ${st.platform} ${st.name} | ${Math.round(st.scale * 100)}% | ${iconSteps.map(([, v]) => round(renderedIcon(v, st.scale))).join(' | ')} |`);
}
L.push('', problems.length ? `## Problems with this policy\n\n${problems.map(p => '- ' + p).join('\n')}` : 'No problems: every role keeps its place in the hierarchy at every setting, reading text reaches 200%, and nothing falls below the floor.');
console.log(L.join('\n'));
process.exit(problems.length ? 1 : 0);
