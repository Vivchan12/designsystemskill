# Claude Design: the design file, kept in step with the code

The rollout produces two Claude Design artifacts the owner can open, comment
on and share:

1. **A Design System**: the tokens, the kit's components with live previews,
   and the brand book. Other designs and decks build on it.
2. **A Design canvas** of the product's screens: the main screen first, then
   its states, the key pages and the kit. This is the design file people look
   at, and the one that has to be updated whenever the main screen changes.

Both start from the code, not from memory: the code is the source of truth for
values, and the canvas is where people see and discuss them.

**Follow each type's own instructions for the file formats.** Creating or
reading an artifact of the type returns its current instructions. They change
between releases; this page covers what to make and when, not the file shapes.

## Before creating anything: look for existing ones

List the owner's artifacts of type "Design System" and "Design". If the
project's `DESIGN-SYSTEM.md` or agent instructions already name a canvas or
system, **update that one**: a second canvas of the same product splits the
comments and nobody knows which one is current. Create new ones only when
none exist, and write their links into the project straight away (see "Record
the links").

## 1. The Design System (end of Phase 3)

| What | From |
|---|---|
| `tokens.json` | `scripts/export-tokens.mjs`: the CSS custom properties, each colour with a value per theme, aliases kept (`{ink}`), the type scale, spacing, radius, shadow. The script lists every token with no usage note: write one for each (it's what tells a designer when to use `muted` rather than `secondary`), and add them to the CSS as trailing comments so the next export keeps them. |
| `README.md` (the brand book) | `DESIGN-SYSTEM.md` and `WRITING.md`: the three layers, which component for which job, the type rungs by role, the writing rules with examples. |
| One card per kit component | `references/kit.md` and the kit's own props: a short guideline (what it's for, what the screen provides) and a preview of its variants. |
| Assets | The real logo and icon files, copied, never redrawn. |

Exit: every token has a usage note, every kit component has a card, and text
passes 4.5:1 in every theme (keep a failing pair the product really uses, and
say so in its note).

## 2. The canvas

Lay it out in rows, top to bottom:

| Row | Artboards |
|---|---|
| **Main screen** | `Main`: the screen users land on (the home, dashboard or "Today" screen), at its real size (a 390×844 phone, or a 1280–1440 wide page). Beside it, its states: dark mode, empty (a new user), and phone width for a desktop app. |
| **Components** | One wide artboard showing the kit in use: buttons, fields, cards, badges, dialogs, by variant. |
| **Setup / onboarding** | One artboard per step of the first-run flow, numbered in its titles. |
| **Key pages** | The 5–10 screens people use most, one each, titled by what they do. |
| **Brand** | Icon, launch screen, empty-state art, if the product has them. |

Each row gets a title note. Install the Design System on the canvas, so the
colour pickers and text styles are the product's own.

**Recreate each screen from the real code.** Read the component, run the app,
and take a screenshot of that screen with realistic data. Then build the
artboard to match the screenshot, using the system's tokens. Keep the real
labels from the code. Use believable sample data, never real users' data, and
no lorem ipsum. When a value is missing, show a labelled placeholder like
`[PRICE]`. The canvas shows what the app *is*, not an idealised version: if
the screen has a problem, draw it as it is and raise the problem with the
owner.

## When to update it

| Moment | Update |
|---|---|
| **Phase 1, decisions** | Before any code changes, add a `Main, proposed` artboard next to `Main`, showing the main screen in the proposed system (type rungs, palette, card style from the decisions sheet). The owner signs off the decisions *by looking at their own main screen*, which is faster and catches more than reading a table. |
| **Phase 3, the kit** | Create the Design System; fill the Components row. |
| **Each migration wave** | If the wave touched the main screen or any screen on the canvas, update those artboards in the same piece of work. Main is always checked. Mention the canvas update in the PR description. |
| **Any later change to tokens** | Re-run `export-tokens.mjs`, update the system's `tokens.json` (always sent whole), then reinstall it on the canvas so the canvas picks up the new values. |
| **Phase 6, lock it in** | Add the rule below to the project's agent instructions. |

The rule to add to CLAUDE.md / AGENTS.md:

> **Design file.** The product's screens are on the Claude Design canvas
> <link>, and its tokens and components are in the design system <link>. When
> a change alters the main screen (or any screen on the canvas), update that
> artboard in the same piece of work; when it changes a token, re-run
> `export-tokens.mjs` and update the system. Never create a second canvas.

## How to update an artboard

1. Read the canvas index, then the artboard file you'll change. Someone may
   have edited it by hand since you last saw it; build on what you read, not
   on an older copy.
2. Take a screenshot of the screen in the running app after your change, and
   edit the artboard to match it. Change only what changed.
3. Publish only the changed files to the same canvas. If the publish is
   refused because someone saved meanwhile, read the file again and redo the
   edit.
4. Tell the owner in one line which artboards changed, with the link.

## When the design leads

If the owner edits the canvas first (moves a block on `Main`, tries a new
card style), treat the artboard as the spec. Read it, then build it in code
from the kit. If it needs a value that has no token, raise that with the
owner rather than hardcoding it. Once it ships, the canvas and the code match
again, and the code is the source of truth once more.

## Record the links

As soon as either artifact exists, write both links into `DESIGN-SYSTEM.md`
(a "Design file" section) and the agent instructions. A link that only lives
in a chat is a canvas the next session can't find, so it makes a second one.
