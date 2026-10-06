---
name: guided-product-flows
description: Make an app whose screens or modules build on each other (canvases, planners, dashboards, reports; each one is a "tool", meaning a part of the product, not an AI or developer tool) work as one product. Give every tool a step-by-step "Guide me" path built from the decisions only the user can make. Connect the tools' data through one declared map, so an upstream edit flags what is built on it for review instead of silently breaking or overwriting it. Make sure nothing on screen claims more than the data behind it. Use this whenever someone wants wizards, guided setup, onboarding flows or a "guide me" mode; asks how data should flow or sync between screens or tools; reports that changing one thing doesn't update another, or that a "review changes" button does nothing; or wants AI to help fill in a tool without taking over; or wants the guides shown on the product's Claude Design canvas. Use it even if they only say "make it step by step" or "the canvases don't talk to each other".
---

# Guided product flows

**"Tool" here means a screen or module your users work in**: a canvas, a
planner, a model, a report. It doesn't mean an AI tool or a developer tool.
The skill fits products where those parts build on each other (personas feed
a value proposition, which feeds a business model, which feeds a pitch). It
doesn't fit an app that is mostly one screen.

Such an app fails its users in three predictable ways:

1. **Blank pages.** Each tool opens as an empty form. People don't know which decision to make first, or that another tool already holds half the answer.
2. **Broken threads.** Tools are built on each other, but nothing says so. Change the customer and the pricing page still describes the old one, and nobody is told.
3. **Fiction.** A score that can't move, a "synced" badge on fixture data, an email that claims "validated unit economics" when there is no model behind it. Every one of these is a button or label showing more than the data holds.

This skill fixes all three. It's the distilled version of work done across a
17-tool app, in an order that avoids its dead ends.

## Principles (the why behind every step)

- **The user decides; the app gathers.** A guide step asks for one decision only the user can make, and offers what the other tools already know as options to pick from, ranked by evidence. It never asks for something the app could have read itself.
- **AI drafts around decisions, never instead of them.** AI comes last and is optional ("Draft the full playbook"). It keeps the user's choices word for word, and there is always a way to save without it. On failure nothing changes.
- **Downstream pulls; it is never pushed.** Upstream data reaches a tool only when the user takes it. An upstream edit *flags* the tools built on it; a person reviews; nothing is rewritten automatically.
- **Every number and label must be earned by real data.** If there's nothing to measure, say so. A fixture is never reachable by a button that writes.

## First: which parts fit this product?

The three parts are independent. Decide which apply before mapping anything,
and tell the owner in one line. Don't stop because the product isn't a
"multi-tool workspace":

| Part | Applies when | In a tabs-and-screens app (e.g. a mobile consumer app) |
|---|---|---|
| **Paths** (Phases 1–2) | A screen opens empty, or asks the user for several decisions at once | Onboarding, a plan or goal builder, a first check-in, any empty state with no way in. Most screens that just show content need nothing (`none, because`). |
| **Data flow** (Phase 3) | Something on one screen is derived from data entered on another | A quiz result that drives today's recommendations; a profile that drives a plan. If the app recomputes on every render, you only need the lighter version: one owner per fact, and a decision on each saved copy (`data-flow.md`, "When the app recomputes on every render"). |
| **Honesty** (Phase 4) | Always | Every app has numbers, badges, streaks, scores, sample content and fallbacks that can claim more than the data holds. |

In this skill a **tool** is any screen or tab that owns data of its own (a
check-in, a profile, a plan, a journal). In `flows.config.json`, list those, not
every route. A product with one screen of its own data skips Phase 3; one that
already has a guided first run might only need Phase 4. Run the parts that
apply, and say which you skipped and why.

## Before you start: what this assumes

The patterns come from a React app with one state object and an existing
Wizard component. Check each assumption, and adapt as follows when it doesn't hold:

| Assumes | If not |
|---|---|
| **One place the user's data lives**, with one update path (a root `useState`, a store, a reducer) | Any store works if there's a single function every write goes through: edit recording and flags hang off that function. If writes are scattered (components calling the database directly), the first job is a single write path. That is honesty §12, and it comes before Phase 3. |
| **React** | The thinking modules are plain functions and carry over unchanged. Only the guide component and its test change (Vue, Svelte). In React Native or Expo, a guide is usually a stack of screens rather than one Wizard component: set `guideMarker` in `flows.config.json` to whatever the app's step flow renders (its stepper, or the navigator for the flow). |
| **A Wizard component** (steps, Back/Next, progress, cancel) | The `design-system-rollout` skill builds one into the kit. Without it, build a minimal one first (the props are in `guide-pattern.md`) and use it for every guide. Twenty hand-made step flows is the mess this skill exists to prevent. |
| **AI is available** | Every guide must work without it (`guide-pattern.md`, "Plans without AI"). |
| **Sample data to render** | Phase 0 finds or makes it. Guides, screenshots and the canvas all need believable content in every tool. |

## The process

Phases in order; each has an exit check. Tell the owner which phase you're in.
`flow-audit.mjs --strict` exits 1 while anything it checks is open, which makes
the exit checks below real.

### Phase 0: Map the product (≈20 min, no code changes)

1. List every tool in the navigation with its entry file. The router or nav component names them (a `switch` on the view, a routes file). Write them to `flows.config.json` (template: `assets/flows.config.json`). Name the `root` tool (setup: it feeds everything and has its own review), and set `types` to the file that declares the data model.
2. Run `node <skill>/scripts/flow-audit.mjs`. It reports:
   - which tools already have a step-by-step path (it follows imports from each tool's entry file);
   - whether a declared flow map exists and covers every tool;
   - honesty signals: handlers that drop their last argument (`_quote`), sample data that a control can write into the user's record, link fields that are read but never written, and `[0]` on a user's list.
3. For each tool, write one line on what it **reads** from other tools and what it **writes**. That table is the draft flow map.
4. Find or make **sample data**: a test user whose every tool has believable content. Guides are reviewed, screenshotted and put on the canvas with it, never with a real user's data.
5. Give the owner the table, the "has a path?" column, and the honesty signals worth checking.

**Exit:** the owner has seen the map and the gaps.

### Phase 1: Decide each tool's path (≈15 min of the owner's time)

Not every tool needs a wizard. Use `references/choosing.md` to propose one per tool:

| The tool… | Give it |
|---|---|
| asks the user to make decisions (positioning, priorities, a plan) | a **guide**: 3–5 steps, one decision each |
| is assembled from other tools (a summary, an export, a 1-pager) | a **checklist** of what's missing, each item linking to the tool that fills it |
| is a conversation or practice session (a rehearsal, a chat) | a short **setup brief** (who, what for, what worries you) that shapes the session |
| receives items unjudged (a backlog, an inbox) | **triage**: one item at a time, with a progress bar and the call to make |

Propose the steps for each guide using `references/step-recipes.md`; most tools
match a recipe there. Put every tool on one sheet (`assets/paths.template.md`):
its path, steps, where each step's options come from, whether it writes as it
goes or saves at the end, and where AI comes in. Ask the owner to correct the
sheet in one pass. A tool with no path gets `none` and a reason in
`flows.config.json`.

If the product has a Claude Design canvas, show each proposed guide on it as a row of artboards, one per step, with the options it would really gather from the sample data. A step with nothing to offer shows up empty before anyone builds it (`references/claude-design.md`).

**Exit:** the owner has signed off the sheet.

### Phase 2: Build the guides (most of the time)

Build each guide the same way (`references/guide-pattern.md` has the code
skeletons):

1. **A pure "thinking" module per tool** (`services/<tool>Thinking.ts`). It holds:
   - the steps;
   - the option builders, which gather candidates from other tools' data, strongest evidence first;
   - the composers (e.g. turning parts into a positioning line);
   - `firstUnfinishedStep()`, so the guide reopens where the user left off.

   No React, no AI. Unit-test it, and watch each test fail with the code broken before trusting it.
2. **A thin guide component** on the app's Wizard, one question per step:
   - options as cards or ticks, plus "Or write your own";
   - Next stays disabled until the step is answered;
   - each step either writes as it goes, so leaving part-way loses nothing, or saves once at the end with a no-AI save option.
3. **A mode switch on the tool:** a "Guide me / full view" toggle. It defaults to the guide when the tool is empty, and to the full view once there's content.
4. **Carry provenance.** Items the guide adds keep where they came from and why: `source: 'experiment'`, `evidence: 'Passed: 17 of 50 (34%, bar 20%)'`. The full view shows that line.
5. **Guard rails, not gates.** Warn about a bad shape ("4 of 5 items are Must Haves; keep Musts to about 60%"), but don't block.
6. **A component test that walks the guide end to end** (pick an option, Next, check the state written), plus a screenshot of each step.

Build guides in parallel: one subagent per tool, each in its own worktree,
each briefed with `guide-pattern.md`, the tool's signed-off steps and the
data-flow rules. **Shared files are yours, not theirs.** The app root, the
types, the flow map, the navigation and the Wizard itself would conflict
across agents. Each agent delivers its new files (thinking module, guide,
tests) and a short note of what it needs in the shared files; you apply
those notes in one pass after merging.

If the product has a Claude Design canvas, put each built guide on it as a row of artboards, one per step, matched to the screenshots, and update the main screen's artboard if a guide's entry point is there (`references/claude-design.md`).

**Exit:** section 1 of `flow-audit.mjs --strict` is clean; each guide passes the review checklist in `guide-pattern.md`; the tests pass; the screenshots have been looked at.

### Phase 3: Connect the data (≈2 h)

Follow `references/data-flow.md`. In short:

1. **Declare the map once in code:** `UPSTREAM` (tool → the tools it reads from) and `SLICES` (tool → the part of the state it owns). Everything else derives from these two.
2. **Record edits by content, not reference.** Reloading data replaces every object with an identical copy; that is not an edit.
3. **Flag, don't rewrite.** A tool is flagged when anything it reads from changed after it was last built or reviewed.
4. **Write-backs are explicit and recorded together.** One user action that updates several tools (an experiment decision updates the tree, the risks and the backlog) happens in one step, and those tools are marked as in sync with each other so they don't flag each other.
5. **The review must go somewhere.** A queue in build order, and a dialog that shows:
   - what changed (old → new) and when;
   - what to check on this tool;
   - a button that opens the tool.

   "Mark reviewed" records only that someone looked. A review button that does nothing is the commonest failure here.
6. **Document the map** in `docs/DATA-FLOW.md` (`assets/DATA-FLOW.template.md`), with a test that fails if the doc's table and the code's map disagree.

**Exit:** a test proves an upstream edit flags each downstream tool and a review clears it; a test proves loading a project marks nothing as edited and saves nothing; section 2 of `flow-audit.mjs --strict` is clean.

### Phase 4: Honesty sweep (≈1 h)

Work through all fourteen patterns in `references/honesty.md` for every tool,
most consequential first: in a health, money or safety product, anything that
changes what the user is told to do comes first. flow-audit scripts parts of
five (§1, §2, §9, §10, §11). **No signals from the script is not an
all-clear**; the rest need reading:

1. Fiction with a button: sample data a control can write into the user's record. *(scripted)*
2. The counter that replaced the thing it counted: a handler that drops its data. *(scripted)*
3. Metrics that can't be earned.
4. Claims the data doesn't back (emails, summaries, badges, exports).
5. Work that arrives unjudged, with no way to judge it.
6. One fact computed in several places.
7. One relationship built in two directions (push and import).
8. Safety nets that never fire (retries, fallbacks, error handlers).
9. Failure that pretends to succeed: a canned result shown as real, or a labelled sample that loses its label once saved. *(fallbacks scripted)*
10. Links nothing ever writes *(scripted)*, and answers asked for and never used.
11. The input picked for the user (`[0]`, `.find()`). *(scripted)*
12. Writes that go around the state.
13. A state some screens forget (pregnancy, a paused account).
14. A question with only one answer.

Fix each one, and add a test that fails without the fix. For a flagged signal
that turns out to be fine, add its key to `ignore` in `flows.config.json`
with the reason, so it stays resolved.

**Exit:** `flow-audit.mjs --strict` exits 0, and every one of the fourteen has been checked for every tool.

### Phase 5: Verify and hand over

- For anything interactive, check that it changes the data and that the change survives a reload. A render is not a test.
- Walk each guide once in a real browser, in light and dark, at phone width (390px): steps stack, options stay tappable (44px), Back and Next stay in reach.
- Walk each guide by keyboard alone: focus moves to the new step's question on Next, every option is reachable with Tab and chosen with Space or Enter, and progress is announced.
- If the product records analytics, add one event per step (shown, answered, left) so the owner can see where people drop out. Report it as a suggestion if there's nothing to send it to.
- One PR per phase (or per batch of guides). Report what was verified by running it, and what was not.
- Never merge or deploy without the owner's go-ahead.

## Files in this skill

| File | Read when |
|---|---|
| `scripts/flow-audit.mjs` (+ `.test.mjs`) | Phase 0, and with `--strict` as the exit check of Phases 2, 3 and 4 |
| `references/choosing.md` | Phase 1: guide, checklist, setup brief or triage |
| `references/step-recipes.md` | Phase 1: step lists that worked, by kind of tool |
| `references/guide-pattern.md` | Phase 2, and in every guide-building brief |
| `references/data-flow.md` | Phase 3 |
| `references/honesty.md` | Phase 4, and whenever a number or badge appears on screen |
| `references/claude-design.md` | Phases 1–3, if the product has a Claude Design canvas: the guides on the design file, and keeping the main screen on it current |
| `assets/flows.config.json`, `assets/paths.template.md`, `assets/DATA-FLOW.template.md` | Phases 0, 1 and 3 |
