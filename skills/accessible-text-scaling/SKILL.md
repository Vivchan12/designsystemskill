---
name: accessible-text-scaling
description: Make an app respect the text size people set on their phone or browser (iPhone Dynamic Type, Android font scale, browser text size), within a range that stays readable and keeps layouts whole. Builds an accessibility text scale per text role (a floor so small settings never make text unreadable, a ceiling of at least 200% for reading text, smaller ceilings for large headings), generates the code that applies it, fixes the layouts that break at large sizes, and adds a check that stops scaling being switched off again. Use this whenever someone mentions large text, Dynamic Type, font scale, accessibility text size, older users or users with low vision, "text gets huge on some phones", "the layout breaks when people make the font bigger", allowFontScaling, maxFontSizeMultiplier, or WCAG text resize. Works on React Native and Expo, iOS, Android, Flutter and the web. Best run after a design system exists (named text roles), for example after the design-system-rollout skill.
---

# Accessible text scaling

People set their text size on their phone: bigger because they can't read
small text, smaller to fit more on the screen. An app should follow that
setting, **within a range per text role**: a floor so nothing becomes
unreadable, and a ceiling so large text stays usable and layouts don't break.

`references/scale.md` explains the policy and the numbers. In short:

| | Default | |
|---|---|---|
| Smallest it follows | **80%** of normal | with a hard floor: no text under 12pt, reading text under 14pt |
| Largest it follows | **200%** of normal | the minimum for reading text (WCAG 1.4.4); large headings stop sooner |
| Hierarchy | a bigger role never renders smaller than a lesser one | at every setting |

This skill comes **after** a design system: it needs text roles (body, label,
title…) applied through shared components. If text sizes are still set by
hand on each screen, run the design-system rollout's type wave first, or
apply this to the components that exist and leave the rest for the ratchet.

## Every session starts with the facts

Run the audit and the scale table, read `docs/text-scale.md` if it exists, and
tell the owner what's done and what's next before changing anything. Nothing
is remembered between sessions; everything is read from the repo.

## The process

### Phase 0: How the app treats the setting today (≈15 min, read-only)

1. Find the text roles: the design system's type scale (tokens, a `Text` component's variants). Write them into `text-scale.config.json` (template: `assets/text-scale.config.json`), with each role's size and line height at the default setting.
2. Run `node <skill>/scripts/text-scale-audit.mjs`. It reports where scaling is **blocked** (switched off, sizes in units that don't scale, zoom disabled) and where it **breaks** layouts (fixed heights around text, one-line truncation, text shrunk to fit, icons at a fixed size). It covers React Native, web, iOS, Android and Flutter.
3. Look at the main screen at the largest setting. The quickest way is the **review tool** (`references/testing.md`): a development-only panel that switches the app between every iPhone and Android text size, and on the web marks text that doesn't grow, icons that don't grow, text cut off and shapes stretched. One screenshot usually makes the case better than the report.
4. Tell the owner: how many places block the setting, the worst screens at large sizes, and whether text roles exist yet.

**Exit:** the owner has seen the audit and one screen at the largest size.

### Phase 1: Agree the scale (≈10 min of the owner's time)

1. Run `node <skill>/scripts/scale-table.mjs`. It prints the scale: one row per setting a user can choose (every iPhone size, every Android step), one column per role, and the size each renders at, with what is held at a limit marked. It also lists problems in the policy: a hierarchy that flips, reading text that can't reach 200%, a line height too tight.
2. Adjust the config until there are no problems: per-role floors (`minSize`) and ceilings (`maxScale`). Propose the defaults; the owner changes only what they disagree with.
3. Save the signed-off table as `docs/text-scale.md`, with "Signed off: <date>".

**Exit:** the owner has signed off the table, and `scale-table.mjs` reports no problems.

### Phase 2: Apply it in one place

1. Generate the code: `scale-table.mjs --emit ts` (React Native) or `--emit css` (web, with `--prefix <yours>` if the design system has a token prefix). For iOS, Android and Flutter, `references/platforms.md` shows the equivalent. Generated, not hand-copied, so the table and the app can't drift.
   - **Web: `@import` the generated CSS from the entry CSS.** Tailwind reading it is not loading it: without the import every `var()` is silently undefined, and the build still passes. The audit checks this.
   - **Web: add the large-text switch** (`assets/large-text.js`) and its `large-text:` variant, for Phase 3.
2. The kit's text components (and text inputs) use it. On React Native they apply the scale themselves and switch system scaling off **only there**. They re-render when the setting changes.
3. Screens use the kit's text components. Any screen that sets its own font size or switches scaling off is a finding (Phase 4 makes it fail CI).

**Exit:** the kit's text components apply the scale; a unit test checks a role's size at the smallest, default and largest settings.

### Phase 3: Fix the layouts that break

Work through `references/layout.md`. Usually, in this order:

1. Fixed heights become minimum heights.
2. Screens with text scroll.
3. One-line truncation becomes 2–3 lines; text shrunk to fit is allowed to wrap.
4. One "large text" switch (at 150% and above) in the kit makes rows stack, grids drop a column, and side-by-side buttons stack. On the web it's `assets/large-text.js` with a `large-text:` variant.
5. Spacing gives way at 150% and above: insets drop one step, bleeds follow, nothing adds an inset inside the page's, and the content edge lines up with the menu glyph (`references/layout.md`, "Spacing at 150% and above"). This is usually what users notice most.
6. Nothing pushes the page sideways at 200% (wide content gets `min-w-0`).
7. Icons grow with their text: the kit's `Icon` sizes them from the scale (`scaledIcon()` / `--icon-*`), and the audit lists every icon still at a fixed size. Logos and badges keep their shape. Tap targets stay at 44pt or more.

Fix the components first (rows, buttons, cards, list items), so the screens built from them inherit the fix.

**Exit:** the main screens pass the checklist in `references/testing.md` at the smallest, default, 150% and largest settings, and the review tool shows no marks on them.

### Phase 4: Keep it

- Remove the review tool: delete its file and the lines the audit lists under "Review tool still installed". (While it stays, `--strict` makes sure it is development-only.)
- Add `text-scale-audit.mjs --strict` to CI: it fails while anything **blocks** the setting. A line that has a real reason keeps `text-scale-exempt: <why>`.
- Add the screenshot matrix (main screens × four sizes) to the PR that finishes the work, and keep it in the design file if there is one.
- Add a short note to the project's agent instructions: text comes from the kit's text components; never switch scaling off on a screen; check new screens at the largest size.

## Working with the owner

- One sign-off: the table (Phase 1). Everything else follows from it.
- Show, don't describe: a screenshot at the largest size before, and after.
- Never merge or release without the owner's go-ahead. Changes go in pull requests.
- Be plain about limits: some layouts (dense tables, charts, tab bars) won't take 200% text, and need a different presentation at large sizes rather than larger text. Say which ones, and what you did instead.

## Files in this skill

| File | Read when |
|---|---|
| `scripts/text-scale-audit.mjs` | Phase 0, and in CI with `--strict` |
| `scripts/scale-table.mjs` | Phase 1 (the table), Phase 2 (`--emit ts` / `--emit css`) |
| `references/scale.md` | Phase 1: the policy, the numbers, and why |
| `references/platforms.md` | Phase 2: React Native, iOS, Android, Flutter, web |
| `references/layout.md` | Phase 3 |
| `references/testing.md` | Phases 0, 3 and 4 |
| `assets/text-scale.config.json` | Phase 0 |
| `assets/large-text.js` | Phase 2–3 (web): the large-text switch; part of the app |
| `assets/text-scale-preview.js`, `assets/TextScalePreview.tsx` | The review tool (web, React Native): Phases 0 and 3, removed in Phase 4 |
| `scripts/text-scale.test.mjs` | After changing a script. Also runs from a copy in a project: `node text-scale.test.mjs [path/to/text-scale.config.json]` checks the project's own policy |
