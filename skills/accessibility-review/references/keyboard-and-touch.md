# Keyboard, focus and touch

## Keyboard (web)

Everything that works with a mouse works with a keyboard (2.1.1), in a sensible
order (2.4.3), with a visible indicator of where focus is (2.4.7), never
hidden under sticky content (2.4.11), and never stuck (2.1.2).

| Pattern | Do |
|---|---|
| A clickable `div`, `span`, `li`, `img` | a `<button>` (actions) or `<a href>` (navigation). They get Enter/Space, focus and a role for free |
| `<a onClick>` with no href | `<button type="button">` |
| `outline: none` / `outline-none` | keep the default, or replace it on `:focus-visible`: `focus-visible:ring-2 ring-offset-2`. The ring needs 3:1 against what's around it (1.4.11) |
| `tabIndex` above 0 | 0 or -1 only; fix the DOM order instead |
| Custom widgets (tabs, menus, comboboxes, sliders) | follow the WAI-ARIA Authoring Practices pattern for that widget (arrow keys inside, Tab between), or use a library that does (Radix, React Aria, Headless UI) |
| Sticky header / cookie banner covering focused items | `scroll-padding-top` equal to the header's height; banners as modal or out of the way |
| A long nav before the content | a skip link to `<main>` as the first focusable element (2.4.1) |

### Dialogs

When a dialog opens: focus moves into it (to its first field, or its title
with `tabIndex={-1}`); Tab stays inside; Escape closes it; when it closes,
focus returns to what opened it. `role="dialog"` + `aria-modal="true"` +
`aria-labelledby` the title. The native `<dialog>` element with `showModal()`
does most of this. A container that only receives focus by code (`tabIndex={-1}`)
may hide its outline; the audit allows that.

### Hover and focus content (1.4.13)

Tooltips and popovers that appear on hover or focus: dismissable with Escape,
hoverable (the pointer can move onto them), and they stay until dismissed.

## Touch

| | Minimum |
|---|---|
| WCAG 2.5.8 (AA) | 24 × 24 CSS px, or spaced so a 24 px circle centred on each doesn't touch another |
| Apple HIG | 44 × 44 pt (28 × 28 pt absolute minimum) |
| Android | 48 × 48 dp, padding included; 8 dp apart |

A small icon can keep its look and get a bigger target: padding, `hitSlop`
(React Native), `.contentShape` and `.frame(minWidth: 44, minHeight: 44)`
(SwiftUI), `minimumInteractiveComponentSize` (Compose, Material does it). The
design-system-rollout skill's render audit measures targets.

### Gestures (2.5.1, 2.5.7)

Every swipe, drag, pinch or long-press has a single-tap alternative:

| Gesture | Alternative |
|---|---|
| Swipe a row to delete | a Delete button in the row's menu, or on its detail screen |
| Drag to reorder | Move up / Move down buttons, or a "Move to…" menu |
| Drag a slider thumb | tapping the track, or + / − buttons; an `adjustable` role so screen readers can step it |
| Pinch to zoom a chart | zoom buttons |
| Long-press for options | the same options in a visible menu |

Screen readers also change gestures: VoiceOver and TalkBack users swipe to
move between items, so custom swipe handlers often never fire for them. On
React Native, `accessibilityActions` adds named actions (Delete, Archive) a
screen reader user can pick from the rotor or actions menu.

### Orientation (1.3.4)

Don't lock to portrait unless it's essential: tablets on stands, and phones
mounted on wheelchairs, are often in landscape.
