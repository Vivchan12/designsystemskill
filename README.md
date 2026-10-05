# design-system-rollout

A Claude skill that takes an app from "every screen styled by hand" to
"every screen built from one kit, and CI stops it drifting back".

It is the condensed version of a rollout that first took about three days:
an inventory script instead of manual discovery, one decisions sheet instead
of questions spread over days, CI guards installed on day one instead of
after the migration, and five batches of work instead of twenty pull requests.

## What it does

Three layers, and screens only ever touch the top one:

1. **Tokens.** Named values (type rungs, colours, radii, spacing, surfaces) as CSS custom properties.
2. **Components.** A kit built only from tokens. Components take *meaning* (variant, tone, size), never styling classes.
3. **Guards.** CI checks that block anything bypassing 1–2, plus a render audit that measures the real page.

The skill walks through seven phases: inventory, decisions, foundations and
guards, the kit, five migration waves, the writing guide, and locking it in.

## Install

**In Claude Code** — clone it into your skills folder:

```bash
git clone https://github.com/Vivchan12/designsystemskill ~/.claude/skills/design-system-rollout
```

Or per project: clone into `<project>/.claude/skills/design-system-rollout`.

**In the Claude apps:** download `design-system-rollout.skill` from this repo
and open it in a conversation; the file card has a **Save skill** button.

## Use

Point Claude at the project and say what you want, for example:

> Our app's UI is inconsistent — buttons, font sizes and cards are all styled by hand. Put the design elements into one system.

The skill triggers on requests like that. Or invoke it by name.

It starts with an audit and a decisions sheet, and makes no code changes until
you have signed those off.

## Run the scripts on their own

Every script is plain Node (18+), no dependencies, and reads
`design-system.config.json` in your project root
(template in `assets/design-system.config.json`).

```bash
node scripts/inventory.mjs --out ds-inventory.md   # what's there, and how many variants of each
node scripts/check-tokens.mjs                      # raw values that duplicate a token; off-scale type
node scripts/check-kit.mjs --init                  # record today's counts as the ceiling
node scripts/check-kit.mjs                         # fail if hand-built UI grew in any file
node scripts/check-kit.mjs --report                # what's left to migrate, worst files first
node scripts/check-writing.mjs --list              # Title Case, "!", "...", typed arrows, old names
node scripts/audit-render.mjs --shots              # measure the rendered page (needs playwright-core)
```

## What's in here

| Path | What it is |
|---|---|
| `SKILL.md` | The playbook: seven phases, each with an exit check |
| `scripts/` | The inventory, the three CI guards, the render audit, and their shared library |
| `references/decisions.md` | The sheet to fill in and hand to the owner before any code is written |
| `references/kit.md` | Each component's API, and the page-level rules the guards enforce |
| `references/codemods.md` | The mechanical part of each migration wave, with the asserts that stop a silent no-op |
| `references/pitfalls.md` | The traps: guards that check nothing, CSS that compiles to nothing, conversions that break names |
| `assets/` | Config template, CI snippet, and templates for the design-system and writing docs |

## Status

The audit and decisions phases have been tested against a real pre-design-system
codebase. The later migration phases come from a rollout done by hand, and
have not yet been run end to end by the skill itself.
