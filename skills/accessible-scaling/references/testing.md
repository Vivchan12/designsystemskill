# Testing at every size

A screen that looks right at the default tells you nothing about 200%. Check
the main screens at four settings: **smallest**, **default**, **150%** and the
**largest the policy allows**.

## Switch the setting quickly

| Where | Command |
|---|---|
| iOS Simulator | `xcrun simctl ui booted content_size extra-small` · `large` (default) · `accessibility-medium` · `accessibility-extra-extra-extra-large` |
| Android emulator or device | `adb shell settings put system font_scale 0.85` · `1.0` · `1.5` · `2.0` |
| Xcode | Environment Overrides (the slider icon in the debug bar) → Text → Dynamic Type |
| Web (headless) | Set the root size before taking the screenshot: `page.addStyleTag({ content: 'html { font-size: 200% }' })`. Then check nothing scrolls sideways: `await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)` must be false on every route. A captured board must carry the size itself (set it on an element inside `<body>`, or on the board's wrapper), since a capture that clones `<body>` drops a style in `<head>` |

An app that is already open picks up the change; check that it does. A screen
that only updates after a restart isn't listening for the change.

## The review tool (install for the review, delete after)

To go through the sizes with the owner, install the review tool. It's a
floating panel with every iPhone and Android step, and on the web a slider
too. Pick a size and the app re-renders at it.

**Web**: copy `assets/text-scale-preview.js` into the app, and load it in
development only:

```ts
// main.tsx
if (import.meta.env.DEV) import('./text-scale-preview.js');
```

It sets the root font size (what the browser's text-size setting changes) and
marks what goes wrong at that size:

| Mark | Means | Usual fix (`layout.md`) |
|---|---|---|
| red | text that doesn't grow (above 100%), or falls below the floor (below 100%) | a px size: use the `--text-*` role. Text *held at* its floor at small settings is the policy working and isn't marked |
| orange | an icon that stays the same size | size it from `--icon-*`, through the kit's `Icon` |
| purple | text cut off | let it wrap |
| blue | a logo, avatar or badge stretched out of shape | fix its size both ways, don't let the row stretch it |
| teal | a box whose contents push the page sideways | `min-w-0` on the flex or grid child, wrap, or `max-width: 100%` |

A deliberate clamp (a one-line preview) isn't "cut off": mark it
`data-text-clamp`, which the audit honours too.

**Keep it in `src/dev/` and exempt that folder from the project's other
guards** (token, kit, writing). It uses system and named colours only, so a
colour guard has nothing to flag, but its fixed px sizes are deliberate (it
must not scale with the page).

Hover a mark for its sizes. The panel's counts go in the PR description as a
before and after. The chosen size survives a reload; Alt+T hides the panel.
`window.textScalePreview.set(2)` sets a size from a script (for screenshots).

**React Native**: copy `assets/TextScalePreview.tsx` to `src/dev/` and wrap
the app in development only:

```tsx
return __DEV__ ? <TextScalePreview><Root /></TextScalePreview> : <Root />;
```

It sets the size the generated `textScale.ts` reads (`currentScale()`), so it
shows the agreed scale through the kit. Text that doesn't go through the kit
won't move, which is itself the finding. It needs the Phase 2 code; before
that, use the device setting (above).

**Removing it.** The audit lists every place that loads the tool under
"Review tool still installed". `--strict` (the CI check) fails if it's loaded
without a development check, so it can't ship by accident. When the review is
done, delete the file and the lines the audit lists. The `currentScale()`
check in the generated file is harmless without it and stays.

## What to look for at each size

- [ ] No text is clipped, overlapping or cut off mid-word.
- [ ] Every screen with text scrolls to its end.
- [ ] Buttons and rows grew with their labels, and are still at least 44pt high.
- [ ] Headings still look bigger than body text (the hierarchy holds).
- [ ] At the smallest setting, body text is at its floor, not smaller.
- [ ] Rows that should stack have stacked, at 150% and above.
- [ ] Icons grew with their text (look at the menu, list rows and buttons), and icon-only buttons still have a 44pt target.
- [ ] Logos, avatars and badges kept their shape: nothing square has become a tall pill.
- [ ] Inputs: typed text and placeholder grow, and the field grows with them.

## A screenshot matrix

For a review, take each main screen at the four settings and lay them side by
side, one row per screen. Breakage is obvious in seconds that way, and the
same matrix after the fix shows the owner what changed. If the product has a
Claude Design canvas, add the matrix as its own row ("Text scale: main
screen at four sizes").
