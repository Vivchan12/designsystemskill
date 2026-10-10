---
name: accessibility-review
description: Review and fix an app's accessibility against WCAG 2.2 AA and the iOS and Android platform guidelines, for any web, React Native, Expo, Flutter, Android or SwiftUI project. Covers contrast and colour-only status, screen readers (names, roles, states, announcements), keyboard and focus, motion and Reduce Motion, touch targets and gestures, and forms. Runs a code audit mapped to WCAG criteria, a contrast checker for design tokens in every theme, a rendered-page check with axe-core (keyboard, focus, reflow, Reduce Motion), and a development-only review panel; then fixes things in the component kit first and adds a CI ratchet so they stay fixed. Use this whenever someone mentions accessibility, a11y, WCAG, ADA or the European Accessibility Act, screen readers, VoiceOver or TalkBack, colour contrast, colour blindness, keyboard navigation, focus, Reduce Motion, or "make the app accessible". Pairs with accessible-scaling (text size) and design-system-rollout (the kit).
---

# Accessibility review

Accessibility is whether someone who can't see the screen well, can't use a
mouse or a touchscreen precisely, can't tell red from green, or gets dizzy
from motion can still use the app. The standard is **WCAG 2.2 Level AA**;
iOS and Android add their own guidelines on top. `references/standards.md`
has every number this skill uses, with where it comes from.

Be honest about what tools can do. Automated checks find a minority of real
problems: whether a name makes sense, the reading order, and what a screen
reader actually says need a person with VoiceOver, TalkBack or a keyboard.
This skill finds what can be found automatically, fixes it where it lives
(usually the component kit), and then walks a person through the rest.

**Never call an app "accessible" or "WCAG compliant" on the strength of these
scripts.** Say what was checked, how, and what wasn't.

## Every session starts with the facts

Run the audit and read `docs/accessibility.md` if it exists, then tell the
owner what's done and what's next before changing anything. Nothing is
remembered between sessions.

```bash
S=<skill>/scripts
node $S/a11y-audit.mjs            # the code, mapped to WCAG; --json; --init (baseline); --strict (CI)
node $S/contrast.mjs              # design-token pairs in every theme; '#777' '#fff' for one pair
node $S/a11y-render.mjs           # the running app: axe-core, keyboard, focus, Reduce Motion, reflow, text spacing
node $S/a11y.test.mjs             # the scripts' own tests
```

Copy the whole `scripts/` folder into a project if it runs them in CI:
`a11y-audit.mjs` imports `contrast.mjs`.

## The process

### Phase 0: Where it stands (≈30 min, read-only)

1. Copy `assets/a11y.config.json` to the project root. Set `srcDirs`, the kit's input and icon-button names, and `contrast.tokenFiles` / `themes`.
2. Run `a11y-audit.mjs`. It reports by area (contrast and colour, screen readers, forms, keyboard and focus, motion, touch) with the WCAG criterion, **fails** (a failure wherever it appears) or **check** (a person decides), and the files.
3. Run `contrast.mjs`. Declare the pairs the app really uses (`pairs`): body text, muted text, input borders, the main button's label, in every theme.
4. If the app runs locally, run `a11y-render.mjs` on the main routes, with sample data only. Install `axe-core` as a dev dependency if it isn't: it is the standard rule engine and adds about 60 rules.
5. Do one main flow by keyboard, and one with VoiceOver or TalkBack (`references/testing.md`, 10 minutes each). This finds what the scripts can't, and makes the case better than any report.
6. Tell the owner: counts per area, the five worst problems with where they are, and what the scripts can't judge.

**Exit:** the owner has the report and has seen or heard one flow with a screen reader.

### Phase 1: Agree the target (≈10 min of the owner's time)

- The level: **WCAG 2.2 AA** (the legal reference in most places: the European Accessibility Act, ADA cases, Section 508), plus the platform guidelines for native apps (44pt targets on iOS, 48dp on Android, Reduce Motion).
- Which AAA items to adopt anyway. Recommend 2.3.3 Animation from Interactions: Apple's guidelines expect it, and it is cheap.
- The contrast pairs (Phase 0 step 3), signed off like any design decision.
- For an existing app, a baseline: `a11y-audit.mjs --init` records today's counts. CI then fails only if a **fails** rule grows, and the numbers only go down.

Write it into `docs/accessibility.md`: the target, the pairs, the baseline date, and what is out of scope (with why).

**Exit:** the owner signed off the target and the pairs.

### Phase 2: Fix it in the kit first

Most failures repeat because the kit allows them. Fix the components, and every screen built from them inherits it:

| Component | Make it impossible to get wrong |
|---|---|
| Button / IconButton | an icon-only button **requires** a label (a required prop, not an optional one); a role on every platform; 44pt / 48dp / 24px targets; a visible focus ring on `:focus-visible` |
| Input / Field | the visible label is tied to the field (`<label for>`, `aria-labelledby`, RN `accessibilityLabel` or `aria-labelledby`); errors and hints linked with `aria-describedby`; `aria-invalid`; `autoComplete` for personal data |
| Icon | decorative by default (`aria-hidden`, RN `accessible={false}`), meaningful only with a label |
| Notice / Toast | announces itself: `role="status"` / `role="alert"` on the web, `announce()` on React Native (assets/a11y-helpers.native.ts) |
| Heading | real heading semantics: `<h2>`…, RN `accessibilityRole="header"`, SwiftUI `.isHeader`, Flutter `Semantics(header: true)` |
| Dialog / Sheet | focus moves in, stays in, Escape closes, focus returns; RN `aria-modal` / `accessibilityViewIsModal` |
| Status badge / chip | colour plus text or an icon whose shape differs |
| Motion | `assets/reduced-motion.css` imported once (web); `useReducedMotion()` for core Animated / Lottie (RN); Reanimated already follows the setting |

The details per area are in the references. Fix the kit, then run the audit again: many screen findings disappear.

**Exit:** the kit components meet the table; the audit's counts dropped.

### Phase 3: Fix the screens, area by area

In this order, because it's the order of harm (blocked → hard → unpleasant):

1. **Names and labels**: controls with no name, fields with no label (`references/screen-readers.md`, `references/forms.md`).
2. **Keyboard and focus** (web): click handlers on divs, removed focus rings, dialogs (`references/keyboard-and-touch.md`).
3. **Status messages**: errors and confirmations that aren't announced.
4. **Contrast**: the token pairs first, then one-off colours (`references/colour.md`).
5. **Colour alone**: status shown only by colour.
6. **Motion**: Reduce Motion everywhere it matters (`references/motion.md`).
7. **Touch and gestures**: target sizes, a button alternative for every swipe or drag.
8. **Forms**: errors that say how to fix, autocomplete, nothing that blocks password managers.

After each area: run the audit, lower the baseline, check one screen by hand.

**Exit:** no **fails** findings on the main flows (or each one has `a11y-exempt: <why>` that the owner agreed), and the manual checks in `references/testing.md` pass on them.

### Phase 4: Test with what people use

The review panel (`assets/a11y-preview.js`, web, development only) shows on the live page every control's accessible name, the Tab order, contrast failures, the page as seen with each type of colour blindness, the heading outline, and what live regions announce. With axe-core loaded it runs the full rule set too. Then the scripts in `references/testing.md`: VoiceOver, TalkBack, keyboard only, 200% zoom, Reduce Motion on, a colour filter on.

**Exit:** the main flows done start to finish with a screen reader and with a keyboard, and the results written into `docs/accessibility.md`.

### Phase 5: Keep it

- CI: `a11y-audit.mjs --strict` (fails if a **fails** rule grows past the baseline, or the review panel would ship) and `contrast.mjs --strict` (fails if a declared pair fails). `a11y-render.mjs --strict` too, if CI can run the app.
- The established lint rules in the editor: `eslint-plugin-jsx-a11y` (React web), `eslint-plugin-react-native-a11y`. The audit's "Tools" section says which are missing.
- Remove the review panel: the audit lists where it is loaded.
- A note in the project's agent instructions: icon buttons need labels, fields need tied labels, messages announce, motion respects Reduce Motion, new pairs go into `contrast.pairs`.

## Working with the owner

- Show, don't describe: a screen reader reading a button as "button" with no name makes the case in five seconds.
- Plain language: "people using VoiceOver hear 'button' and nothing else", not "4.1.2 failure".
- Never merge or release without the owner's go-ahead. Changes go in pull requests.
- Be plain about limits: say what the tools can't check, and when something needs an expert audit or testing with disabled users (for a legal claim of conformance, it does).
- Don't hide content from screen readers to make a report pass.

## Files in this skill

| File | Read when |
|---|---|
| `scripts/a11y-audit.mjs` | Phase 0, after every fix, and in CI with `--strict` |
| `scripts/contrast.mjs` | Phases 0–1 (token pairs), and in CI with `--strict` |
| `scripts/a11y-render.mjs` | Phase 0 and Phase 4: needs the app running and playwright-core; uses axe-core when installed |
| `scripts/a11y.test.mjs` | After changing a script |
| `references/standards.md` | Phase 1: the criteria, the numbers, the platform guidelines, sources |
| `references/screen-readers.md` | Phases 2–3: names, roles, states, announcements on each platform |
| `references/colour.md` | Contrast, colour alone, dark mode, Increase Contrast |
| `references/keyboard-and-touch.md` | Focus, dialogs, targets, gestures |
| `references/motion.md` | Reduce Motion, autoplay, flashing |
| `references/forms.md` | Labels, errors, autocomplete, sign-in |
| `references/testing.md` | Phase 0 step 5 and Phase 4: the manual checks, step by step |
| `assets/a11y.config.json` | Phase 0 |
| `assets/a11y-preview.js` | The review panel (web, development only, removed in Phase 5) |
| `assets/a11y-helpers.native.ts`, `assets/a11y-helpers.web.ts` | Phase 2: `announce()`, `useReducedMotion()` |
| `assets/reduced-motion.css` | Phase 2 (web) |
