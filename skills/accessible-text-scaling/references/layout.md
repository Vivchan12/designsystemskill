# Layouts that survive large text

Following the setting is half the job. The other half is a layout that still
works when body text is twice its normal size. Most breakage comes from a few
patterns, each with a standard fix.

| Breaks | Why | Do instead |
|---|---|---|
| **Fixed heights** on rows, buttons and cards | The text grows; the box doesn't. Text is clipped or overflows. | `minHeight`, plus padding. A button is at least 44pt high and grows with its label. |
| **Side-by-side rows** (icon, label, value, chevron) | At large sizes the label gets one word per line. | Above a threshold (e.g. scale ≥ 1.5), stack: label on its own line, value below. One `useIsLargeText()` hook, used by the kit's row components. |
| **Text cut to one line** | `numberOfLines={1}` hides most of a label at 200%. | Allow 2–3 lines at large sizes. Keep one line only for values that are short by nature (a time, a count). |
| **Text shrunk to fit** (`adjustsFontSizeToFit`) | It undoes the user's setting exactly where it matters. | Let it wrap. |
| **Horizontal lists of chips or tabs** | They overflow the screen. | Wrap onto more lines, or scroll horizontally with a visible edge. Tab bars: keep the icon, and show the enlarged label through the system's large content viewer. |
| **Screens that don't scroll** | Content that fitted at 100% runs off the bottom at 200%. | Every screen with text scrolls. Fixed footers (a main button) stay, and the content above them scrolls. |
| **Text over images** | Larger text covers more of the image, or runs out of it. | Put the text below the image at large sizes, or give it a solid background. |
| **Icons that don't grow** | A 16pt icon beside 30pt text looks broken and is hard to see. | Size every icon from the scale: `scaledIcon()` (React Native) or `var(--icon-*)` (web), through the kit's `Icon`. They grow up to 1.5× and never shrink. The audit lists every fixed-size icon. |
| **Logo tiles and badges stretched by the text beside them** | A fixed-width box in a row is stretched to the row's height as the text grows: a square logo becomes a tall pill. | Fix its size both ways (`aspect-ratio: 1` or width and height together), `align-self: flex-start` or `center`, `flex-shrink: 0`. |
| **Labels cut off with "…"** | `truncate` on a location, a name or a menu item hides most of it at 200%. | Let it wrap to 2–3 lines. Keep one line only for values that are short by nature. |
| **Modals and sheets with fixed sizes** | The content can't fit. | Size to content up to the screen height, then scroll. |

## The threshold switch

A layout that is right at 100% is usually wrong at 200%, and vice versa. So
give the kit one switch:

```ts
// true when text is at or above 150% of normal
export const useIsLargeText = () => PixelRatio.getFontScale() >= 1.5;   // re-render on change via useWindowDimensions()
```

Rows stack, grids drop a column, and side-by-side buttons stack when it's
true. Screens don't decide this themselves: the kit's components do, once.

On the web the switch is `assets/large-text.js`: copy it into the app and load
it once. It sets `data-text-scale="large"` on `<html>` at 150% and above,
following the browser setting live, and `--text-scale` to the current ratio.
Add the Tailwind variant keyed on **any ancestor**, so a captured design board
or a test wrapper can carry it too:

```js
// tailwind.config.js
const plugin = require('tailwindcss/plugin');
plugins: [plugin(({ addVariant }) => addVariant('large-text', '[data-text-scale="large"] &'))]
```

## Spacing at 150% and above

Large text needs the room that padding was using. Without this the text grows,
the gutters and insets stay, and the line length collapses: the complaint
people actually make at large sizes is "everything is squashed into a narrow
column", not "the text is too big".

The rules:

1. **Insets drop one step** under `large-text:` (a card's `p-6` becomes `p-4`; the page gutter `px-6` becomes `px-4`). One step, not to zero.
2. **Bleeds follow.** Anything that bleeds into the gutter with a negative margin (a full-width tab bar, a table, a hero image) uses the same step, so it still meets the edge.
3. **Nothing adds an inset inside the page's.** A screen inside the page shell doesn't carry its own padding as well: that doubles at 200% and is the most common cause of a narrow column. One owner per edge: the shell owns the page gutter, the card owns its inset.
4. **Line up with the menu glyph.** On a phone the content edge lines up with the hamburger *glyph*, not the 44px button around it: pull the glyph flush with the header edge (a negative margin equal to the button's padding) and keep the tap area. Then the page edge and the icon edge are the same number at every setting.
5. **Gaps between blocks** drop a step only when the blocks stack; gaps between lines of text don't change (line height already grows).
6. **Drawers and sheets** size in rem, capped at the screen: `width: min(20rem, 85vw)`. A drawer fixed at 280px holds less text every step up.
7. **Wide content gets `min-w-0`.** A flex or grid child with a chart or long words won't shrink below its content without it, and pushes the whole page sideways. The review tool marks it (teal).

```jsx
<main className="px-6 large-text:px-4">
  <Card className="p-6 large-text:p-4">…</Card>
  <Tabs className="-mx-6 large-text:-mx-4" />           {/* the bleed follows the gutter */}
  <div className="grid grid-cols-[1fr_auto] large-text:grid-cols-1 gap-4">
    <Chart className="min-w-0" />
  </div>
</main>
```

Measure it, don't eyeball it: at 80%, 100%, 150% and 200% on a 390px screen,
the content's left edge and the menu glyph's left edge should be the same
number. Put those numbers in the PR.
