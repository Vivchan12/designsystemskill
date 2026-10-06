---
name: design-system-rollout
description: Turn an app's scattered UI (hand-styled buttons, ad-hoc font sizes, one-off cards, raw colours, inconsistent labels) into one enforced design system — tokens, a component kit, CI guards and a writing guide — and migrate every screen onto it. Use this whenever someone wants to make a product's UI consistent, "put the design elements into a system", build or adopt a component library, clean up typography/spacing/colours across a codebase, add a design-token or type-scale guard, audit UI drift, standardise button/card/dialog styles, write a UI copy style guide, or create or update the product's Claude Design file (design system and screens canvas) from the code — even if they only say "the app looks inconsistent", "tidy up the design", or "make every screen use the same components". Supports React with Tailwind or CSS, and React Native / Expo (style objects, tokens as a TypeScript object).
---

# Design system rollout

Take an existing app from "every screen styled by hand" to "every screen built
from one kit, and CI stops it drifting back". This is the condensed version of
a rollout that first took about three days; the steps below are ordered so it
fits in roughly one working day of agent time plus two short decision
check-ins with the owner.

Three layers, and screens only ever touch the top one:

1. **Tokens.** Named values (type rungs, colours, radii, spacing, surfaces) as CSS custom properties.
2. **Components.** A kit (e.g. `components/ui/`) built only from tokens. Components take *meaning* (variant, tone, size), never styling classes. `className` is for layout only.
3. **Guards.** CI checks that block anything bypassing 1–2, plus a render audit that asks the page what it *is*.

Alongside them, a **design file in Claude Design**: a Design System (tokens and components, exported from the code) and a canvas of the product's screens, with the main screen first. It is updated in the same piece of work as any change to the main screen, so the design never falls behind the code (`references/claude-design.md`).

## Why the original took three days, and what this skill changes

| Slow because… | Do this instead |
|---|---|
| Variants were discovered screen by screen | Run `scripts/inventory.mjs` first. It counts every variant of every UI job in under a second. |
| Design decisions came up one at a time mid-migration | Ask them all at once with `references/decisions.md`, before writing any code. |
| Guards were added after migrating, so drift crept back between PRs | Install the guards on day one with a **ratchet baseline** (CI green immediately; counts can only fall). |
| Migration went component by component, ~20 PRs | Migrate in **5 waves by pattern**, codemods first, parallel subagents per file group, one PR per wave. |
| Bugs were found by reading code ("looks done") | Verify each wave by **rendering** (screenshots light/dark/phone + `audit-render.mjs`), not by a second grep. |
| The same traps were hit repeatedly | Read `references/pitfalls.md` before writing any codemod. |

## Which stack?

Every script detects the stack from `package.json` and prints it at the top:
**tailwind**, **css** or **react-native**. On React Native the scripts read
style objects and a TypeScript tokens object instead of class names and CSS;
read `references/react-native.md` before Phase 0, because it adds phone-only
decisions (tap targets, text scaling, safe areas, day and night) and covers
art and animation as part of the system. If a report's stack is wrong, set
`"stack"` in the config. A report full of zeros on a real app means the scan
couldn't read it, not that the app is clean, and the inventory says so.

## Two routes

- **Full rollout**: the app's UI is styled by hand. Follow every phase below.
- **Design file only**: the app already has its tokens and kit in code, and the owner wants the Claude Design file (design system and screens canvas), or wants it brought up to date. Do Phase 0 steps 1, 3 and 6 (the stack, the config, sample data). Then follow `references/claude-design.md` from start to finish: tooling into the repo, export and check the tokens, bundle the kit, capture the screens, publish, record the links, and set up the sync check. Skip the decisions sheet, guards and migration waves. **Exit:** both artifacts are published and linked from the repo, and `check-design-sync.mjs` reports in sync.

## Every session starts with status

A rollout spans several sessions, often several people. Never start from
memory. Start every session with:

```bash
node <skill>/scripts/status.mjs          # read-only
```

- **First run.** Show the owner the full report: where each phase stands (read from the repo, with the evidence), the headline counts, and the plan in order. Agree on what this session will do before changing anything.
- **Every later run.** Lead with "Since last time": the phases newly done, the counts that moved (before → after, better or worse), and anything that regressed. Then say what is still left and what this session will tackle.
- **At the end of a session**, run it with `--save` and commit `design-system-status.json`, so the next session (yours or someone else's) can compare against it.

The phases are read from evidence in the repo, never from what a session
remembers: the config, `docs/design-decisions.md` marked "Signed off", the
token files, the guard scripts and CI, the kit folder, the ratchet's counts
per wave, `WRITING.md`, and the agent instructions. If a phase is marked
wrong, fix the evidence, not the report.

## The process

Follow these phases in order. Each has an exit check; don't start the next
phase until it passes. Tell the owner which phase you're in as you go.

### Phase 0: Inventory (≈15 min, no code changes)

1. Find the stack: CSS approach (Tailwind? CSS modules? styled-components?), component folders, how screens are routed, whether a kit already exists. Then look for what's already there, because a rollout usually finishes a half-built system rather than starting from nothing:
   - existing tokens;
   - existing shared components, and how many screens actually use them;
   - existing design docs and reference folders (check whether they still match the live app);
   - more than one visual style, for example a separate look on login or marketing pages.
2. **Test every existing guard before trusting it.** Plant one violation (e.g. `text-[10px]` in a screen) and run the guard. If it stays green, it is checking nothing. Report that as a finding, because it explains how the drift got in (`pitfalls.md` §1).
3. Write `design-system.config.json` in the project root (template: `assets/design-system.config.json`). Set `srcDirs` to **every** folder that holds screens: a sweep is only as wide as its glob.
4. Run `node <skill>/scripts/inventory.mjs --out ds-inventory.md`, then read the report. It shows:
   - how many font sizes, radii, colours, paddings and gaps are in use, and how many distinct variants each has;
   - "recipes" (the class combinations used) for buttons, cards and pills;
   - hand-built dialogs, spinners, form fields, step counters, tables and progress bars;
   - Title Case labels, "!", "..." and typed arrows;
   - classes that can't exist (a palette shade such as `gray-150` that Tailwind doesn't have). These render nothing, silently.
   - on React Native: literal style values per family (and how many already go through a token), hand-built touchables, touchables with no label, and text styles with no font family;
   - tokens defined but never used, and files nothing imports (dead components still on the old look: delete them rather than migrate them).
5. Write a 10-line summary for the owner: the headline counts, the 3 worst areas, and any broken guard or stale doc you found.
6. **Find or make sample data.** The render audit, the screenshots and the Claude Design capture all need the app to render real screens offline: a signed-in test user with believable content in every main screen. Look for an existing fixture, seed script or stubbed sign-in (tests, Storybook, an e2e setup). If there isn't one, write `scripts/audit-setup.mjs`. It signs in, or stubs the auth and network calls with `page.route(...)`, and loads sample data. Never use a real user's data, and never lorem ipsum. Without it, every later "verify by rendering" step checks an empty or signed-out page.

**Exit:** the owner has seen the summary, and the app renders its main screen with sample data offline.

### Phase 1: Decisions in one sitting (≈15 min of the owner's time)

Fill in `references/decisions.md` with *proposed* answers drawn from the
inventory: the type scale, spacing scale, radii, colours and tones, surfaces,
dark mode, the kit list and writing rules. Present it as a single document and
ask the owner to change anything they disagree with.

Propose; don't interrogate. Every question should come with a recommended answer
and the evidence for it ("13 font sizes in use; 10px, 11px and 12px cover 70%
of them, so I propose rungs at 11, 12, 13, 15, 17, 22, 28, 38").

Show the decisions on the product itself: on the Claude Design canvas (create it if there isn't one, after checking for an existing one), put the current main screen as `Main` and the same screen in the proposed system as `Main, proposed`, side by side. The owner signs off by looking at their own main screen (`references/claude-design.md`).

**Exit:** the owner has signed off (or edited) the decisions sheet.

### Phase 2: Foundations and guards (≈1–2 h)

1. **Tokens.** Write the decided values as CSS custom properties, and map them in the Tailwind config (or the equivalent) as role-named utilities, e.g. `text-ds-body`, `bg-ds-panel`, `rounded-ds-card`. Set the body default to the body rung, so unsized text is never the browser's 16px. Make buttons and inputs inherit font size.
2. **Copy the guards** into the project's `scripts/` folder and add npm scripts:
   - `check:tokens`: `check-tokens.mjs`
   - `check:kit`: `check-kit.mjs`
   - `check:writing`: `check-writing.mjs`
   - `audit:render`: `audit-render.mjs`

   They import `lib.mjs`, so copy that too. Run `check-kit.mjs --init` once to record today's counts as the ceiling.
3. **CI.** Add `check:tokens`, `check:kit` and `check:writing` to the existing CI job (`assets/ci-snippet.yml`). Use `check:tokens --list` and `check:writing --list` (report only) until their waves land, then switch them to failing mode.
4. **Prove each guard fails.** Plant one violation per guard, watch it go red, then remove it. A guard that finds no inputs and passes is worse than none (`pitfalls.md` §1).

**Exit:** CI is green with the guards in it, and each guard has been seen to fail on a planted violation.

### Phase 3: The kit (≈2–3 h)

Build the components named in the decisions sheet. Use `references/kit.md` for
each component's API shape, the rules it enforces, and what it replaces. Start
with the components that clear the largest inventory counts: usually
Text/Heading/Eyebrow, then Button, then Field and its inputs, then Card and Notice.

- Each component takes meaning, never style: `<Button variant="secondary" size="sm" icon="…" loading>`, `<Text variant="meta" tone="muted">`.
- Add a gallery page (`/design-system`) that renders every component in every variant. It is the visual spec, and the render audit covers it.
- Write `DESIGN-SYSTEM.md` from `assets/DESIGN-SYSTEM.template.md` as you go, with the component table and the rules.
- Add a small unit test per component for the guarantees that matter: ARIA roles, `type="button"`, focus trap in Modal, `loading` disabling the button.

Then create the **Claude Design system** (`references/claude-design.md`). Copy the design scripts into the repo. Run `export-tokens.mjs`, and keep fixing its report (scopes, notes, text styles, fonts, contrast) until it exits clean. Run `bundle-kit.mjs`, and fill in each component's preview with its real states. Write the brand book from `DESIGN-SYSTEM.md`. Install the system on the canvas and fill the Components row.

**Exit:** the gallery renders cleanly in light and dark, `audit-render.mjs` passes on the gallery route, and the design system has a usage note on every token and a card for every component.

### Phase 4: Migrate in five waves (most of the day)

Five waves, one PR each, in this order, because each later wave's codemod
relies on the earlier one:

1. **Type.** Hand-sized text becomes Text/Heading/Eyebrow/Icon size, and off-scale sizes go onto rungs.
2. **Controls.** Buttons, icon buttons, form fields, spinners, sliders, tabs and segmented controls.
3. **Surfaces.** Cards, notices, dialogs/sheets, popovers, page headers, empty states.
4. **Layout.** One edge (no inset page blocks), one padding down a page, the spacing scale, status colours to tones, greys to `muted`.
5. **Small parts and flows.** Pills to Badge/Tag, progress bars, tables, avatars, step-by-step flows to Wizard.

For each wave:

1. **Codemod the mechanical part.** Read `references/codemods.md` first: it has the patterns, and the asserts that stop a codemod silently doing nothing.
2. **Hand-migrate the rest in parallel.** Split the remaining files into groups that don't overlap, and give each group to a subagent in its own git worktree. Include the decisions sheet, `kit.md` and the wave's rules in every brief.
3. **Verify by rendering.**
   - Type-check, then run the tests and the guards.
   - Run `audit-render.mjs --shots`, plus `--dark` and `--width 390`.
   - Look at the screenshots of the screens the wave touched. Interactive changes need a real edit, a save and a reload, not just a render (`pitfalls.md` §7).
4. **Lock in progress:** `check-kit.mjs --update-baseline`. It only ever lowers counts.
5. **Update the design file.** If the wave changed the main screen or any screen on the canvas, update those artboards to match the new screenshots. Always check `Main`.
6. **Open one PR for the wave.** Report the counts before and after (`check-kit.mjs --report`), and say which artboards were updated.

**Exit:** every ratchet metric is 0 (or each remaining one is justified with `kit-exempt:`), and the render audit is clean in all three modes.

### Phase 5: Writing (≈1 h)

1. Write `WRITING.md` from `assets/WRITING.template.md`. The defaults are 10 rules (sentence case, verbs on buttons, no "AI" in labels, "…", calm past tense, one name per thing, arrows as icons, "e.g." with no comma, plain words). Put the product's own names in `properNames`.
2. Run `check-writing.mjs --list`. Convert Title Case with `toSentenceCase` from the same script, **then review every changed string by hand**: proper names and plan names are where the converter is wrong (`pitfalls.md` §6).
3. Switch `check:writing` to failing mode in CI.

### Phase 6: Lock it in (≈15 min)

- Add a short "Design system" section to the project's agent instructions (CLAUDE.md / AGENTS.md): use the kit, never hardcode a token's value, follow WRITING.md, run the audit after UI changes.
- Write the traps that were specific to this project into a LEARNINGS file.
- Write both Claude Design links into `DESIGN-SYSTEM.md` and the agent instructions, with the rule: a change to the main screen updates its artboard in the same piece of work, a change to a token re-runs `export-tokens.mjs`, and nobody creates a second canvas. Add `check-design-sync.mjs` to CI (report only), so a stale artboard is noticed (`references/claude-design.md`).

## Working with the owner

- **Report from status, not from memory.** Open with `status.mjs`'s update, and close with what moved this session and what's next.
- **Two check-ins, not twenty.** Phase 1 (decisions) and the PR for each wave. Don't stop mid-wave to ask about a single button; follow the decisions sheet, and list judgement calls in the PR description.
- **Never merge or deploy without the owner's go-ahead.** Open PRs, report CI, wait for "merge it".
- **Report honestly.** Give counts before and after, what was verified by rendering, and what was not checked.

## Files in this skill

| File | Read when |
|---|---|
| `scripts/inventory.mjs` | Phase 0 |
| `scripts/check-kit.mjs`, `check-tokens.mjs`, `check-writing.mjs`, `audit-render.mjs`, `lib.mjs` | Phase 2: copy into the project |
| `references/decisions.md` | Phase 1 |
| `references/kit.md` | Phase 3, and in every migration brief |
| `references/codemods.md` | Before writing any codemod (Phase 4) |
| `references/claude-design.md` | The design-file-only route, and Phases 1, 3, 4 and 6 of a full rollout |
| `scripts/export-tokens.mjs` (+ `.test.mjs`), `bundle-kit.mjs`, `check-design-sync.mjs`, `audit-render.mjs --capture` | Copy into the project's `scripts/design/`: tokens, component previews, screen capture, staleness check |
| `scripts/status.mjs` | The start and end of every session |
| `references/react-native.md` | Before Phase 0 on a React Native or Expo app |
| `references/pitfalls.md` | Before Phase 2, and whenever something "looks done" but you haven't rendered it |
| `assets/design-system.config.json`, `assets/ci-snippet.yml` | Phase 0 and Phase 2 |
| `assets/DESIGN-SYSTEM.template.md`, `assets/WRITING.template.md` | Phases 3 and 5 |
