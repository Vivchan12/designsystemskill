# The standards, and every number this skill uses

## WCAG 2.2

The Web Content Accessibility Guidelines are W3C's standard, and the reference
for most accessibility law (the European Accessibility Act, which has applied
to many consumer products and services in the EU since 28 June 2025; ADA
cases in the US; Section 508; the UK public sector regulations). Level **AA**
is the usual target. WCAG is written for the web, but its criteria are applied
to native apps too (EN 301 549, the European standard, does exactly that).

2.2 added nine criteria to 2.1, six of them at A or AA (2.4.11, 2.5.7, 2.5.8,
3.2.6, 3.3.7, 3.3.8), and removed 4.1.1 Parsing.

### The criteria this skill checks, and how

| Criterion | Level | The requirement | Checked by |
|---|---|---|---|
| 1.1.1 Non-text Content | A | Images and icons that carry meaning have a text alternative; decorative ones are hidden | audit, axe |
| 1.3.1 Info and Relationships | A | Structure shown visually (headings, lists, labels) is in the code too | audit (headings, RN), axe, panel |
| 1.3.5 Identify Input Purpose | AA | Fields for the user's own data say what they are (`autocomplete`) | audit |
| 1.4.1 Use of Color | A | Colour is never the only way information is shown | audit (check), panel (colour vision) |
| 1.4.3 Contrast (Minimum) | AA | Text 4.5:1; large text 3:1 | contrast.mjs, audit, render, axe, panel |
| 1.4.10 Reflow | AA | Usable at 320 CSS px wide without scrolling sideways | render |
| 1.4.11 Non-text Contrast | AA | Parts needed to see a control or its state (input borders, icons, focus rings, the check in a checkbox): 3:1 against adjacent colours | contrast.mjs (`use: "ui"`) |
| 1.4.12 Text Spacing | AA | Nothing lost when line height is 1.5, paragraph spacing 2×, letter spacing 0.12em, word spacing 0.16em | render |
| 2.1.1 Keyboard | A | Everything works by keyboard | audit (click on non-controls), render |
| 2.1.2 No Keyboard Trap | A | Focus can always move on | render |
| 2.2.1 Timing Adjustable | A | Time limits can be turned off, adjusted or extended | testing.md |
| 2.2.2 Pause, Stop, Hide | A | Moving or auto-updating content that starts by itself and lasts over 5 s can be paused | audit (check) |
| 2.3.1 Three Flashes | A | Nothing flashes more than 3 times a second | testing.md |
| 2.3.3 Animation from Interactions | **AAA** | Motion triggered by interaction can be turned off | audit, render (with Reduce Motion) |
| 2.4.3 Focus Order | A | Focus order keeps meaning | audit (positive tabindex), render, panel |
| 2.4.7 Focus Visible | AA | A visible focus indicator | audit, render |
| 2.4.11 Focus Not Obscured (Minimum) | AA | The focused item isn't entirely hidden (sticky headers, cookie banners) | render |
| 2.5.1 Pointer Gestures | A | Multi-finger or path gestures have a single-pointer alternative | audit (check) |
| 2.5.7 Dragging Movements | AA | Anything done by dragging can be done without | audit (check) |
| 2.5.8 Target Size (Minimum) | AA | Targets 24 × 24 CSS px, or spaced so a 24 px circle on each doesn't overlap another | axe, design-system-rollout's render audit |
| 3.1.1 Language of Page | A | The page's language is set | audit, axe |
| 3.3.1 Error Identification | A | An error says which field, in text | forms.md, testing.md |
| 3.3.2 Labels or Instructions | A | Fields have labels or instructions | audit |
| 3.3.3 Error Suggestion | AA | If the fix is known, say it | forms.md |
| 3.3.7 Redundant Entry | A | Don't ask for the same thing twice in one process | forms.md |
| 3.3.8 Accessible Authentication (Minimum) | AA | No memory or puzzle test to sign in without an alternative; password managers and paste allowed | audit |
| 4.1.2 Name, Role, Value | A | Every control has a name, a role, and its state, available to assistive technology | audit, axe, panel |
| 4.1.3 Status Messages | AA | Status messages are announced without moving focus | audit, panel (announcement log) |

2.3.3 is AAA. It's here because Apple's guidelines expect apps to honour
Reduce Motion, because motion makes some people ill, and because it is cheap
to do. Agree it with the owner (Phase 1).

## Contrast: the exact rules

- **Formula** (WCAG "relative luminance"): each sRGB channel `c/255`, linearised as `c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`; `L = 0.2126R + 0.7152G + 0.0722B`; ratio `(L1+0.05)/(L2+0.05)` with L1 the lighter.
- **Never round up.** "4.499:1 would not meet the 4.5:1 threshold" (Understanding 1.4.3). `#777777` on white is 4.48:1 and fails, although many tools display "4.5".
- **Large text** is 18pt or 14pt bold, which is **24 CSS px, or 18.66 px bold**. Font size as delivered, not after the user zooms.
- **Translucent colours** are composited over what's behind them before measuring.
- **No requirement for**: disabled controls, pure decoration, logos, text in a photo with other significant content. Placeholder text and hover/focus text **are** covered.
- **Non-text (1.4.11)**: 3:1 for what you need to see to find or operate a control, and for its state. A control with readable text or an icon doesn't need a visible border.

Reference values: `#767676` on white is 4.54:1 (about the lightest grey that passes for body text on white); `#949494` on white is 3.03:1 (about the lightest that passes 1.4.11, the example W3C uses); black on white is 21:1.

## The platforms

| | iOS (Apple HIG) | Android (developer.android.com) | Web (WCAG) |
|---|---|---|---|
| Control size | 44 × 44 pt default; 28 × 28 pt minimum | 48 × 48 dp, padding included; 8 dp between targets | 24 × 24 CSS px minimum (2.5.8); 44 px is AAA (2.5.5) |
| Text contrast | 4.5:1 up to 17pt; 3:1 at 18pt and above, **and for bold text** | 4.5:1 below 18sp (or below 14sp bold); 3:1 otherwise | 4.5:1; 3:1 at 24px, or 18.66px bold |
| Motion | Respond to Reduce Motion: cut automatic and repeating animation, zooming, scaling, peripheral motion | "Remove animations" setting | `prefers-reduced-motion` |
| Colour | "Convey information with more than color alone"; check light and dark; offer more contrast under Increase Contrast | | 1.4.1 |

Where the platforms are looser than WCAG (Apple's 3:1 for any bold text,
Android's 18sp large text), this skill uses WCAG's stricter rule and says so.

## Sources

- WCAG 2.2 and its Understanding documents: w3.org/TR/WCAG22, w3.org/WAI/WCAG22/Understanding (source: github.com/w3c/wcag).
- Apple Human Interface Guidelines, Accessibility: developer.apple.com/design/human-interface-guidelines/accessibility.
- Android, Make apps more accessible: developer.android.com/guide/topics/ui/accessibility/apps.
- React Native, Accessibility and AccessibilityInfo: reactnative.dev/docs/accessibility.
- Reanimated, accessibility guide (ReduceMotion.System is the default); Motion (framer-motion) docs (`reducedMotion` defaults to "never").
- axe-core rule list: github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md.
