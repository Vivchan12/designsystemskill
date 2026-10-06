# Product skills for Claude

Two Claude skills, each the condensed version of a piece of work that first
took days by hand.

| Skill | What it does |
|---|---|
| [`design-system-rollout`](skills/design-system-rollout/) | Takes an app from "every screen styled by hand" to "every screen built from one kit, and CI stops it drifting back". |
| [`guided-product-flows`](skills/guided-product-flows/) | Gives every tool in a multi-tool product a way in that isn't a blank page, connects the data between tools, and removes anything on screen that claims more than the data behind it. |

## Install

> **The layout changed.** Each skill now lives in `skills/<name>/`, and the
> `.skill` files are in `dist/`. If you cloned this repo straight into
> `~/.claude/skills/design-system-rollout`, delete that folder and install
> again as below.

**In Claude Code**: copy the skills into your skills folder.

```bash
git clone https://github.com/Vivchan12/designsystemskill.git /tmp/productskills
mkdir -p ~/.claude/skills && cp -r /tmp/productskills/skills/* ~/.claude/skills/
```

For one project only, copy them into `<project>/.claude/skills/` instead.

**In the Claude apps**: download a file from `dist/` and open it in a
conversation. The file card has a **Save skill** button.

---

## design-system-rollout

The work behind it took about three days. The skill shortens it with:

- an inventory script instead of finding the variants by hand;
- one decisions sheet instead of questions spread over days;
- CI guards installed on day one instead of after the migration;
- five batches of work instead of twenty pull requests.

Three layers, and screens only ever touch the top one:

1. **Tokens.** Named values (type rungs, colours, radii, spacing, surfaces) as CSS custom properties.
2. **Components.** A kit built only from tokens. Components take *meaning* (variant, tone, size), never styling classes.
3. **Guards.** CI checks that block anything bypassing 1–2, plus a render audit that measures the real page.

Seven phases: inventory, decisions, foundations and guards, the kit, five
migration waves, the writing guide, and locking it in.

**The design file, in Claude Design.** The skill also makes two Claude Design
artifacts from the code: a **design system** (tokens exported from your CSS,
one card per component, the brand book), and a **canvas of your screens**, with
the main screen first, then its states, setup flow, key pages and the kit. You
sign off the decisions by looking at your own main screen redrawn in the
proposed system. After that, any change to the main screen updates its
artboard in the same piece of work, so the design file never falls behind the
code.

If the app already has its design system in code, the skill has a shorter
**design file only** route: export, bundle, capture, publish, link.

**Ask for it like this:**

> Our app's UI is inconsistent: buttons, font sizes and cards are all styled by hand. Put the design elements into one system.

It starts with an audit and a decisions sheet, and changes no code until you
have signed those off.

**Scripts** (plain Node 18+, no dependencies; they read
`design-system.config.json` in your project root, template in `assets/`):

```bash
S=~/.claude/skills/design-system-rollout/scripts
node $S/inventory.mjs --out ds-inventory.md   # what's there, and how many variants of each
node $S/check-tokens.mjs                      # raw values that duplicate a token; off-scale type
node $S/check-kit.mjs --init                  # record today's counts as the ceiling
node $S/check-kit.mjs                         # fail if hand-built UI grew in any file
node $S/check-kit.mjs --report                # what's left to migrate, worst files first
node $S/check-writing.mjs --list              # Title Case, "!", "...", typed arrows, old names
node $S/audit-render.mjs --shots              # measure the rendered page (needs playwright-core)
node $S/export-tokens.mjs                     # tokens in Claude Design's format: every theme, fonts, contrast check
node $S/export-tokens.test.mjs                # the cascade rules the export must get right
node $S/bundle-kit.mjs                        # the kit as one script + stylesheet, for live component previews
node $S/audit-render.mjs --capture <dir>      # each screen's real markup as a Claude Design artboard
node $S/check-design-sync.mjs                 # which artboards are behind the code
```

## guided-product-flows

For products made of several tools that build on each other (canvases,
planners, models, reports). Three things, in order:

1. **A path into every tool.** Each tool gets one of: a guide (3–5 decisions, options gathered from the other tools), a checklist, a setup brief, or triage for items that arrive unjudged. Logic lives in a plain, tested module; the component only renders it.
2. **Data that flows, and flags.** Which tool reads from which is declared once. An upstream edit flags the tools built on it, and a person reviews them. Nothing downstream is rewritten automatically.
3. **Honesty.** Twelve patterns where a screen claims more than its data: sample data with a button that writes it, scores that can't be earned, handlers that drop what they're given, links nothing ever writes, and more.

Six phases: map, decide each tool's path (one sign-off), build the guides,
connect the data, honesty sweep, verify and hand over. If the product has a
Claude Design canvas, each guide goes on it as a row of steps: proposed at
sign-off, then replaced by the built screens.

**Ask for it like this:**

> Every tool in our app starts as a blank page, and editing one doesn't tell the others. Give each tool a step-by-step path and connect the data between them.

**Script** (plain Node 18+; reads `flows.config.json` in your project root,
template in `assets/`):

```bash
node ~/.claude/skills/guided-product-flows/scripts/flow-audit.mjs
# which tools have a guide or checklist, which are missing from the flow map,
# and honesty signals: dropped arguments, sample data in files that write state
```

---

## What's in here

```
skills/
  design-system-rollout/   SKILL.md, scripts/, references/, assets/
  guided-product-flows/    SKILL.md, scripts/, references/, assets/
dist/
  design-system-rollout.skill
  guided-product-flows.skill
```

## How they were tested

Each skill was run on an early commit of a real product, before the work it
describes had been done, against the same task without the skill.

- **design-system-rollout:** passed 7 of 7 checks with the skill, 4 of 7 without, and finished faster.
- **guided-product-flows:** with the skill, the run found all three honesty bugs that were later fixed by hand (a dropped quote, a sample list that wrote real data, an unearnable score). Without it, the run missed all three. Patterns 10–12 in its `honesty.md` came from what the run without the skill found.

The audit and planning phases have been run by the skills themselves. The
later build phases come from work done by hand, and have not yet been run
end to end by either skill.
