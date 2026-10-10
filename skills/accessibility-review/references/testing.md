# Testing with what people use

The scripts find patterns. These checks find whether a person can actually
get through the app. Do them on the **main flows** (sign in, the thing people
open the app for, the most common form), at the start (Phase 0, one flow) and
before calling the work done (Phase 4, all of them). Write down what you did
and what you found in `docs/accessibility.md`.

## Keyboard only (web, 10 minutes)

Put the mouse away. From the address bar, press Tab.

- [ ] A skip link appears first (on pages with navigation) and works.
- [ ] Every control is reached, in an order that matches the screen.
- [ ] You can always see where focus is.
- [ ] Focus never disappears under a sticky header, footer or banner.
- [ ] Enter and Space activate buttons; Enter follows links; arrow keys work inside tabs, menus, radio groups, sliders.
- [ ] A dialog: focus moves into it, Tab stays inside, Escape closes it, focus returns to the button that opened it.
- [ ] Nothing traps focus. Nothing happens just because something received focus.
- [ ] The whole flow can be completed.

## VoiceOver on iPhone (15 minutes)

Turn on: Settings › Accessibility › VoiceOver, or set Accessibility Shortcut
to VoiceOver and triple-click the side button.

| Gesture | Does |
|---|---|
| Swipe right / left | next / previous item |
| Double-tap | activate |
| Two-finger swipe up | read everything from the top |
| Rotate two fingers (rotor), then swipe up/down | move by headings, links, form controls |
| Two-finger scrub (Z) | back / close |
| Three-finger swipe | scroll |

- [ ] Every item says what it is: name, role ("button", "heading"), state ("selected", "checked").
- [ ] No "button" with no name; no file names or "image" read for icons.
- [ ] Decorative icons are skipped; cards read as one sensible sentence.
- [ ] Headings let you jump through the screen (rotor › Headings).
- [ ] After saving, an error, or loading finishing, VoiceOver says so.
- [ ] A modal: swiping doesn't escape into the screen behind.
- [ ] Every swipe action and drag has an alternative you can reach.
- [ ] The flow can be completed.

## TalkBack on Android (15 minutes)

Turn on: Settings › Accessibility › TalkBack, or hold both volume keys for 3
seconds once the shortcut is set. On an emulator, install TalkBack from the
Play Store (an image with Play Store), then:
`adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService`.

Swipe right / left to move, double-tap to activate, swipe down then up (or
three-finger tap, by version) for the reading controls. Same checklist as
VoiceOver. Announcements are the most common difference between the two:
test both.

## Screen reader on the web

VoiceOver on macOS (Cmd+F5; VO = Ctrl+Option; VO+Right to move; VO+U for the
rotor) with Safari, or NVDA on Windows (free) with Firefox or Chrome. Same
checklist, plus: the page title is announced on load and on every screen
change.

## Zoom and text size

- [ ] Browser zoom 200% and 400%: nothing lost, nothing overlapping, no sideways scrolling at 400% (1.4.10).
- [ ] Phone text size at the largest setting: the accessible-scaling skill covers this.

## Reduce Motion

- [ ] With the setting on (motion.md has where), nothing slides, zooms, bounces or parallaxes. Spinners and fades are fine.
- [ ] Nothing that moves by itself runs for more than 5 seconds without a pause.

## Colour

- [ ] Greyscale (iOS Settings › Accessibility › Display & Text Size › Color Filters; Android Color correction; the review panel's "No colour"): every status still reads.
- [ ] Dark mode: the contrast pairs pass there too (`contrast.mjs`).

## Tools

| Platform | Tool | Finds |
|---|---|---|
| Web | axe DevTools extension, or `a11y-render.mjs` with axe-core | ~60 rules on the rendered page |
| Web | Chrome DevTools › Accessibility pane; Rendering › Emulate vision deficiencies, prefers-reduced-motion | the accessibility tree; colour blindness; motion |
| Web | the review panel (`assets/a11y-preview.js`) | names, Tab order, contrast, colour vision, headings, announcements |
| iOS | Xcode › Open Developer Tool › Accessibility Inspector (Audit) | missing labels, small targets, contrast, Dynamic Type |
| Android | Accessibility Scanner (Play Store) | labels, 48dp targets, contrast |
| React Native | `eslint-plugin-react-native-a11y`; `@testing-library/react-native` `getByRole` / `getByLabelText` in tests | prop mistakes; tests that fail when a name disappears |
| React web | `eslint-plugin-jsx-a11y`; Testing Library `getByRole`; `jest-axe` / `vitest-axe` | in the editor; in unit tests |

Writing tests with `getByRole('button', { name: 'Delete reading' })` makes
the accessible name part of the contract: a test fails when it's lost.

## When to bring in people

For a legal statement of conformance, or a product used by many disabled
people, get an expert audit and test with disabled users. Tools and
checklists don't replace either. Say so to the owner rather than implying
this review is one.
