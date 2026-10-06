# How data flows between tools

Every tool in <Product> is built on others. This page is the one place that
says how that works, what the rules are, and how to add a tool without
breaking it. Read it before adding a tool, adding a field another tool reads,
or adding anything that writes to more than one tool at once.

## The model in one paragraph

All of the user's data lives in one state object. Each tool **owns** one part
of it and writes only there. Which tools read from which is **declared once**,
in `<path>/dataFlow.ts`. When a tool is edited, the time is recorded. When
something a tool reads from changes after that tool was built or last
reviewed, the tool is **flagged**, and the user reviews it. **Nothing
downstream is ever rewritten automatically.**

## The flow

The root setup feeds every tool and has its own review (old → new values).
Beyond that, each tool reads from:

| Tool | Reads from |
|---|---|
| <Tool> | <Tool>, <Tool> |

This table is `UPSTREAM` in `<path>/dataFlow.ts`. If they ever disagree, the
code is right and this page is out of date (a test checks they match).

## The rules

1. **One owner per piece of data.**
2. **Link by id, don't copy.**
3. **Downstream pulls; it is never pushed.**
4. **A change flags; a person decides.**
5. **Write-backs are explicit and recorded together.**
6. **Edits are content, not references.**
7. **New tracking starts from now.**

(See the skill's `references/data-flow.md` for each rule's reasoning; copy
the parts that apply.)

## The pieces

| Piece | Where | What it is |
|---|---|---|
| `UPSTREAM` | | Which tools each tool reads from |
| `SLICES` | | Which part of the state each tool owns |
| `editedAt` | state | When each tool's data last changed |
| `syncedAt` | state | When a tool was last written together with its upstream |
| `reviewedAt` | state | When each tool was last reviewed |
| `reviewQueue` | | Every flagged tool, in build order |
| Review dialog | | What changed, what to check, open the tool, mark reviewed |

## Adding a tool

1. Give its data one home in the state, and add it to `SLICES`.
2. Add what it reads from to `UPSTREAM`.
3. If it carries text from upstream, store the source id with it.
4. If one action writes to it and another tool, do it in one state update.
5. Add a `WHAT_TO_CHECK` line for it.
6. Test it: an upstream edit flags it, and a review clears it.
