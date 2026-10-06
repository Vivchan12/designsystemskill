# Product skills for Claude

Two Claude skills, each the condensed version of a piece of work that first
took days by hand.

| Skill | What it does |
|---|---|
| [`design-system-rollout`](skills/design-system-rollout/) | Takes an app from "every screen styled by hand" to "every screen built from one kit, and CI stops it drifting back". Web (Tailwind or CSS) and React Native / Expo. |
| [`guided-product-flows`](skills/guided-product-flows/) | For products made of several screens or modules that build on each other. Gives each one a step-by-step way in instead of a blank page, connects the data between them, and removes anything on screen that claims more than the data behind it. |

## Install

> **The layout changed.** Each skill now lives in `skills/<name>/`, and the
> `.skill` files are in `dist/`. If you cloned this repo straight into
> `~/.claude/skills/design-system-rollout`, delete that folder and install
> again as below.

**In Claude Code**: copy the skills into your skills folder.

```bash
git clone https://github.com/Vivchan12/designsystemskill.git /tmp/productskills
git -C /tmp/productskills checkout <commit>     # optional: pin the version your team agreed on
rm -rf ~/.claude/skills/design-system-rollout ~/.claude/skills/guided-product-flows
cp -r /tmp/productskills/skills/design-system-rollout /tmp/productskills/skills/guided-product-flows ~/.claude/skills/
```

This replaces only these two skill folders. If `/tmp/productskills` already
exists, `git -C /tmp/productskills pull` first, or the copy will be stale.

For one project only, copy them into `<project>/.claude/skills/` instead.

**In the Claude apps**: download a file from `dist/` and open it in a
conversation. The file card has a **Save skill** button.

## Using these in a team: what's safe

Both skills are built to start read-only and to change code only in pull
requests that a person merges. The edges worth knowing before you run them:

| Step | What it touches | Risk |
|---|---|---|
| Phase 0 (inventory, status, flow-audit) | Reads the repo. Writes only a report if you pass `--out`, and the status log with `--save`. | Low. Run it anywhere. |
| Token export, kit bundle | Load the project's own tokens file and build the kit with the project's esbuild or typescript: **they run the project's code**. Output goes to `claude-design/`. | Fine on your own repo. Don't point them at code you don't trust. |
| Render audit and capture | Runs your `audit.setup` and `screens` scripts and a headless browser against the app on localhost. | Use sample data only. A setup script that signs in as a real user puts real data into screenshots and captures. |
| Claude Design (publishing) | Creates artifacts in the account of whoever runs it. They're private until shared. | The design file shows whatever the screens showed: sample data, never real users. |
| Migration waves, guides, honesty fixes | Change code, one pull request per wave or fix. | Medium. The skills never merge on their own. Review each PR. Run them on a branch, in a separate worktree if another session or agent shares the folder. |
| `--init`, `--update`, `--update-baseline` | Write baseline and lock files in the repo. | Low, but commit them deliberately: they set what CI enforces. |

**Not yet proven.** Both skills were built on one React and Tailwind app and
tried read-only on one React Native app. The React Native scripts have passed
tests on a sample app, not yet a full rollout. Treat their first report on a
new codebase as something to check against what you see, not as a verdict. A
report full of zeros on a real app means the scan couldn't read it.

**Pin a version.** This repo changes as the skills improve. Install a specific
commit, so everyone on the team runs the same version (see Install), and
update deliberately.

**No secrets in config.** The config files hold paths and names only. Never
put keys or real user data in them, or in the sample-data script.

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
have signed those off. Every session opens with a status report: where each
phase stands, what changed since the last session, and what's next.

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
node $S/native.test.mjs                       # the React Native path
node $S/status.mjs                            # where the rollout stands, what changed since last time, what's next
```

## guided-product-flows

For products made of several screens or modules that users work in, and that
build on each other: canvases, planners, models, reports. The skill calls each
of these a "tool"; that means a part of your product, not an AI or developer
tool. It doesn't fit an app that is mostly one screen. Three things, in order:

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
# which tools have a guide or checklist, which are missing from the flow map, and
# honesty signals: dropped arguments, sample data a button can write, link fields
# nothing writes, inputs picked as [0]. --strict exits 1 while anything is open,
# so it works as a phase's exit check and in CI.
node ~/.claude/skills/guided-product-flows/scripts/flow-audit.test.mjs
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

Since then:

- **A second product.** Both skills ran read-only on a React Native app they weren't built from. The honesty sweep found real problems that affect what users are told to do. The design-system inventory found it couldn't read React Native; that support was then added and tested on a sample app (`native.test.mjs`).
- **The Claude Design path** was run end to end once, on the original product, and the export bugs it found are covered by `export-tokens.test.mjs`.
- **Each script's tests** (`*.test.mjs`) are written to fail against the bug they describe.

Not yet done: a full rollout run start to finish by the skill, and the build
phases on React Native. The first report on a new codebase is a starting point
to check, not a verdict.
