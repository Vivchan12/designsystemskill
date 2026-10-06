# design-system-rollout

A Claude skill that takes an app from "every screen styled by hand" to "every
screen built from one kit, and CI stops it drifting back". It works on web apps
(Tailwind or plain CSS) and on React Native / Expo, and it can keep a matching
design file in Claude Design.

The process it encodes first took about three days by hand. The skill shortens
it with:

- an inventory script instead of finding the variants by hand;
- one decisions sheet instead of questions spread over days;
- CI guards installed on day one instead of after the migration;
- five batches of work instead of twenty pull requests;
- a status report that opens every session, so work carries over between sessions and people.

## How it works

Three layers, and screens only ever touch the top one:

1. **Tokens.** Named values (type sizes, colours, radii, spacing, surfaces): CSS custom properties on the web, a TypeScript object on React Native.
2. **Components.** A kit built only from tokens. Components take *meaning* (variant, tone, size), never styling.
3. **Guards.** CI checks that block anything bypassing 1–2, plus a render audit that measures the real page.

Seven phases: inventory, decisions, foundations and guards, the kit, five
migration waves, the writing guide, and locking it in. Each has an exit check
read from the repo, not from memory.

**The design file, in Claude Design (optional).** The skill can make two
Claude Design artifacts from the code: a **design system** (tokens exported
from the code, one card per component, the brand book), and a **canvas of the
screens**, main screen first. You sign off the decisions by looking at your own
main screen at the proposed scale. After that, a change to a screen updates its
artboard in the same piece of work, and a check flags any artboard that falls
behind.

If the app already has its design system in code, there's a shorter **design
file only** route: export, bundle, capture, publish, link.

## Install

**In Claude Code**: copy the skill into your skills folder.

```bash
git clone https://github.com/Vivchan12/designsystemskill.git /tmp/designsystemskill
git -C /tmp/designsystemskill checkout <commit>     # optional: pin the version your team agreed on
rm -rf ~/.claude/skills/design-system-rollout
cp -r /tmp/designsystemskill/skills/design-system-rollout ~/.claude/skills/
```

This replaces only this one skill folder. If `/tmp/designsystemskill` already
exists, `git -C /tmp/designsystemskill pull` first, or the copy will be stale.
For one project only, copy it into `<project>/.claude/skills/` instead.

**In the Claude apps**: download `dist/design-system-rollout.skill` and open
it in a conversation. The file card has a **Save skill** button.

## Use

Ask for it in your own words, for example:

> Our app's UI is inconsistent: buttons, font sizes and cards are all styled by hand. Put the design elements into one system.

It starts read-only with a status report, an inventory and a decisions sheet,
and changes no code until you have signed those off. Every later session opens
with what changed since the last one and what's next.

**Scripts** (plain Node 18+, no dependencies; they read
`design-system.config.json` in your project root, template in `assets/`):

```bash
S=~/.claude/skills/design-system-rollout/scripts
node $S/status.mjs                            # where it stands, what changed since last time, what's next
node $S/status.mjs --save --log ~/notes/app-status.json   # keep the log outside the repo (read-only runs)
node $S/inventory.mjs --out ds-inventory.md   # what's there, and how many variants of each
node $S/check-tokens.mjs                      # hand-set values that duplicate a token; off-scale type
node $S/check-kit.mjs --init                  # record today's counts as the ceiling
node $S/check-kit.mjs                         # fail if hand-built UI grew in any file
node $S/check-kit.mjs --report                # what's left to migrate, worst files first
node $S/check-writing.mjs --list              # Title Case, "!", "...", typed arrows, old names
node $S/audit-render.mjs --shots              # measure the rendered page (needs playwright-core)
node $S/export-tokens.mjs                     # design tokens in Claude Design's format, every theme, contrast check
node $S/bundle-kit.mjs                        # the kit as one script + stylesheet, for live component previews
node $S/audit-render.mjs --capture <dir>      # each screen's real markup as a Claude Design artboard
node $S/check-design-sync.mjs                 # which artboards are behind the code
node $S/export-tokens.test.mjs                # tests: the token cascade
node $S/native.test.mjs                       # tests: the React Native path
```

## Using it in a team: what's safe

The skill starts read-only and changes code only in pull requests that a
person merges. It uses no API keys or logins. "Tokens" below means **design
tokens**: the named colours, font sizes and spacing in the app's code. Running
it uses AI usage on the account of whoever runs it.

| Step | What it touches | Risk |
|---|---|---|
| Status, inventory | Reads the repo. Writes only a report if you pass `--out`, and the status log with `--save` (inside the repo, or wherever `--log` points). | Low. Run it anywhere. |
| Design-token export, kit bundle | Load the project's own design tokens file and build the kit: **they run the project's code**. Output goes to `claude-design/`. | Fine on your own repo. Don't point them at code you don't trust. |
| Render audit and capture | Runs your `audit.setup` and `screens` scripts and a headless browser against the app on localhost. | Use sample data only. A setup script that signs in as a real user puts real data into screenshots and captures. |
| Claude Design (publishing) | Creates artifacts in the account of whoever runs it. They're private until shared. | The design file shows whatever the screens showed: sample data, never real users. |
| Migration waves | Change code, one pull request per wave. | Medium. The skill never merges on its own. Review each PR. Run on a branch, in a separate worktree if another session or agent shares the folder. |
| `--init`, `--update`, `--update-baseline` | Write baseline and lock files in the repo. | Low, but commit them deliberately: they set what CI enforces. |

**Not yet proven everywhere.** It was built on one React and Tailwind app and
tried read-only on one React Native app. The React Native path has passed
tests on sample apps, not yet a full rollout. Treat its first report on a new
codebase as something to check against what you see, not as a verdict. A
report full of zeros on a real app means the scan couldn't read it.

**Pin a version.** This repo changes as the skill improves. Install a specific
commit so everyone on a team runs the same version, and update deliberately.

**No secrets in config.** The config holds paths and names only. Never put
keys or real user data in it, or in the sample-data script.

## What's in here

```
skills/design-system-rollout/
  SKILL.md       the process: phases, exit checks, how to work with the owner
  scripts/       status, inventory, guards, render audit, token export, kit bundle, design sync, tests
  references/    decisions sheet, kit API, codemods, pitfalls, Claude Design, React Native
  assets/        config template, CI snippet, DESIGN-SYSTEM and WRITING templates
dist/
  design-system-rollout.skill
```

## How it was tested

- **Against a run without the skill**, on an early commit of a real product before the work had been done: 7 of 7 checks with the skill, 4 of 7 without, and faster.
- **The Claude Design path** was run end to end once; the export bugs it found are covered by `export-tokens.test.mjs`.
- **On a second, React Native product**, read-only: the gaps it showed were fixed and are covered by `native.test.mjs`.
- **Each test is written to fail** against the bug it describes.

Not yet done: a full rollout run start to finish by the skill, and the build
phases on React Native.
