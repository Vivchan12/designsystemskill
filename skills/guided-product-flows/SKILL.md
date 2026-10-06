---
name: guided-product-flows
description: Make a multi-tool app (canvases, workspaces, dashboards, modules) work as one product. Give every tool a step-by-step "Guide me" path built from the decisions only the user can make. Connect the tools' data through one declared map, so an upstream edit flags what is built on it for review instead of silently breaking or overwriting it. Make sure nothing on screen claims more than the data behind it. Use this whenever someone wants wizards, guided setup, onboarding flows or a "guide me" mode; asks how data should flow or sync between screens or tools; reports that changing one thing doesn't update another, or that a "review changes" button does nothing; or wants AI to help fill in a tool without taking over; or wants the guides shown on the product's Claude Design canvas. Use it even if they only say "make it easier to use step by step", "link the tools together", or "the canvases don't talk to each other".
---

# Guided product flows

An app made of many tools (canvases, modules, workspaces) fails its users in
three predictable ways:

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

## The process

Phases in order; each has an exit check. Tell the owner which phase you're in.

### Phase 0: Map the product (≈20 min, no code changes)

1. List every tool in the navigation with its entry file. Write them to `flows.config.json` (template: `assets/flows.config.json`).
2. Run `node <skill>/scripts/flow-audit.mjs`. It reports:
   - which tools already have a step-by-step path (it follows imports from each tool's entry file);
   - whether a declared flow map exists and covers every tool;
   - honesty signals: handlers that take data and drop it (`_quote`), and sample data in files that write state.
3. For each tool, write one line on what it **reads** from other tools and what it **writes**. That table is the draft flow map.
4. Give the owner the table, the "has a path?" column, and the honesty signals worth checking.

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
match a recipe there. Ask the owner to correct the list in one pass.

If the product has a Claude Design canvas, show each proposed guide on it as a row of artboards, one per step, with the options it would really gather from the owner's data. A step with nothing to offer shows up empty before anyone builds it (`references/claude-design.md`).

**Exit:** the owner has signed off each tool's path and steps.

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
data-flow rules.

If the product has a Claude Design canvas, put each built guide on it as a row of artboards, one per step, matched to the screenshots, and update the main screen's artboard if a guide's entry point is there (`references/claude-design.md`).

**Exit:** `flow-audit.mjs` shows every tool with a path; the tests pass; the screenshots have been looked at.

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

**Exit:** a test proves an upstream edit flags each downstream tool and a review clears it; flow-audit shows every tool in the map.

### Phase 4: Honesty sweep (≈1 h)

Work through `references/honesty.md` for every tool, starting with the signals flow-audit raised:

- fixtures reachable by a writing control;
- scores the user can't move;
- dropped arguments;
- claims (in emails, summaries, badges) not backed by data;
- items that arrive unjudged with no way to judge them;
- the same derived fact computed in two places.
- link fields declared in the types that no code ever writes;
- upstream items picked as `[0]` instead of chosen;
- writes that bypass the state path (direct database calls, work held only in component state).

Fix each one, and add a test that fails without the fix.

### Phase 5: Verify and hand over

- For anything interactive, check that it changes the data and that the change survives a reload. A render is not a test.
- Walk each guide once in a real browser, in light and dark, at phone width.
- One PR per phase (or per batch of guides). Report what was verified by running it, and what was not.
- Never merge or deploy without the owner's go-ahead.

## Files in this skill

| File | Read when |
|---|---|
| `scripts/flow-audit.mjs` | Phase 0, and again at the end of Phases 2 and 3 |
| `references/choosing.md` | Phase 1: guide, checklist, setup brief or triage |
| `references/step-recipes.md` | Phase 1: step lists that worked, by kind of tool |
| `references/guide-pattern.md` | Phase 2, and in every guide-building brief |
| `references/data-flow.md` | Phase 3 |
| `references/honesty.md` | Phase 4, and whenever a number or badge appears on screen |
| `references/claude-design.md` | Phases 1–3, if the product has a Claude Design canvas: the guides on the design file, and keeping the main screen on it current |
| `assets/flows.config.json`, `assets/DATA-FLOW.template.md` | Phases 0 and 3 |
