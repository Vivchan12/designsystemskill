# Contrast and colour

## Contrast

| What | Needs | WCAG |
|---|---|---|
| Body text, labels, placeholders, text on buttons | 4.5:1 | 1.4.3 |
| Large text: 24px+, or 18.66px+ bold | 3:1 | 1.4.3 |
| Input borders, meaningful icons, focus rings, the check in a checkbox, chart lines | 3:1 against what's next to them | 1.4.11 |
| Disabled controls, decoration, logos | nothing | |

Ratios are never rounded up: 4.49:1 fails. Translucent colours are measured
after compositing.

### Fix it in the tokens, once

1. List the pairs the app really uses in `a11y.config.json` → `contrast.pairs` (body on page, muted on page, muted on card, border on page, white on the primary button, in every theme). `use`: `text`, `large`, `ui`.
   Pair **semantic** tokens (`--surface`, `--text-muted`), the ones that change with the theme, not palette tokens (`--white`, `--grey-400`) that stay the same in every theme: a dark-theme row that compares against `--white` measures nothing real.
2. `node contrast.mjs` measures them in every theme and gives the **nearest passing colour** (same hue, darker on light backgrounds, lighter on dark) for each that fails.
3. Change the token, not the screens. `--strict` in CI holds it.

The matrix (every text-like token on every surface-like token, by name) finds
pairs nobody declared. Not every combination is used: check the ones that are
and add them to `pairs`.

### The usual offenders

- **Muted / secondary grey** on white or on a light card: the most common failure. `#767676` is about the lightest grey that passes on white.
- **Placeholders**: covered by 1.4.3 and usually far too light. Better still, a visible label (forms.md).
- **White text on brand colours**: orange, yellow, light green and teal often fail with white; use dark text on them or darken the colour.
- **Text on images or gradients**: no tool can measure reliably. Put a solid scrim behind the text and check the worst point.
- **Dark mode**: a pair that passes in light often fails in dark (and the other way). Every theme, every pair.
- **Opacity**: `opacity: 0.6` on text, or `text-black/50`, lowers contrast.

## Colour alone (1.4.1)

Colour can't be the only way something is shown, because about 1 in 12 men
and 1 in 200 women have a colour vision deficiency, and colour disappears in
bright sunlight, on a greyscale screen, or when printed.

| Instead of | Do |
|---|---|
| A red or green dot for fail / pass | the dot **and** an icon of a different shape (✓ / ✕) **or** the word ("Out of range") |
| A red border on an invalid field | the border and an error message in text, and an error icon |
| Links shown only by colour inside text | an underline (or 3:1 against the text around them plus a non-colour change on hover and focus) |
| The current nav item in a different colour | colour plus a marker (a bar, bold weight) and `aria-current="page"` |
| Chart series told apart by colour | direct labels, or different markers or dash patterns too |
| A required field in red | the word "required" or an asterisk explained at the top |

A lightness difference of 3:1 or more between the two states also counts as
more than hue (Understanding 1.4.1), but an icon or word is clearer.

**Check it**: the review panel's colour-vision filters (protanopia,
deuteranopia, tritanopia, no colour), Chrome DevTools › Rendering › Emulate
vision deficiencies, or a phone's greyscale filter. If the status still
reads, it isn't colour alone.

## The phone's settings

- **iOS Increase Contrast** (`AccessibilityInfo.isDarkerSystemColorsEnabled()` in RN; `@Environment(\.colorSchemeContrast)` in SwiftUI): Apple asks for a higher-contrast palette when it's on, at least where the default doesn't meet the minimums. System colours adapt by themselves.
- **Android High contrast text** (`isHighTextContrastEnabled()` in RN): the system adds outlines to text; check custom text still reads.
- **Dark mode** is a theme like any other: same pairs, same minimums.
- **Invert Colors (iOS)**: photos and video should not invert: `accessibilityIgnoresInvertColors` on them.
- **Bold Text (iOS)**: `isBoldTextEnabled()`; system fonts follow it, custom fonts don't unless you do.
