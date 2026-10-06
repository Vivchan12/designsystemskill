# Data flow between tools

## The model in one paragraph

All of the user's data lives in one state object. Each tool **owns** one part
of it and writes only there. Which tools read from which is **declared once**,
in code. When a tool is edited, the time is recorded. When something a tool
reads from changes after that tool was built or last reviewed, the tool is
**flagged**, and a person reviews it. **Nothing downstream is ever rewritten
automatically.**

## The seven rules

1. **One owner per piece of data.** Each tool writes only its own slice. Others may read it, never quietly write it. The one exception is a deliberate write-back (rule 5).
2. **Link by id, don't copy.** A business model points at its value proposition (`basedOnId`). When text *is* carried across, keep where it came from (`sourceRefs: [{ toolId, itemId }]`), so a review can say which item came from what.
3. **Downstream pulls; it is never pushed.** Upstream data reaches a tool only when the user takes it: a "From your personas" chip, a "Sync now" button, a guide step. The user stays the author of every tool.
4. **A change flags; a person decides.** The review shows what changed and when, and links to it. Marking it reviewed records that someone looked; it changes nothing. Editing the flagged tool does **not** clear the flag: fixing one line says nothing about whether the whole upstream change made it in. AI may *propose* updates; it never applies them.
5. **Write-backs are explicit and recorded together.** When one action rightly updates several tools (an experiment decision moves a solution to "building", marks its assumption held up and adds a backlog item), it happens in one state update, on the user's click. The tools written together are recorded as in sync (`syncedAt`), so they don't flag each other.
6. **Edits are content, not references.** An edit is recorded only when a slice's content changes. Reloading data replaces every object with an identical copy; comparing references would flag every tool on load.
7. **New tracking starts from now.** Only edits recorded by this mechanism count, never creation dates. Shipping the feature must not light up existing users' data with "changes" from months ago.

## The pieces (TypeScript sketch)

```ts
// services/dataFlow.ts
export const UPSTREAM: Partial<Record<ToolId, ToolId[]>> = {
  VALUE_PROP: ['PERSONAS', 'IDEAS'],
  BUSINESS_MODEL: ['VALUE_PROP'],
  BACKLOG: ['IDEAS', 'OPPORTUNITY_TREE', 'EXPERIMENTS'],
  // … every tool. The root setup feeds everything and gets its own review (old → new values).
};
export const SLICES: Partial<Record<ToolId, (keyof AppState)[]>> = {
  BACKLOG: ['backlogItems', 'backlogGoal'],
  // …
};

/** Tools whose CONTENT differs between two states (not just references). */
export function editedTools(prev: AppState, next: AppState): ToolId[] {
  return (Object.keys(SLICES) as ToolId[]).filter(t =>
    SLICES[t]!.some(k => prev[k] !== next[k] && JSON.stringify(prev[k]) !== JSON.stringify(next[k])));
}

/** Tools written in one action are in sync with each other. */
export function syncedTogether(changed: ToolId[]): ToolId[] {
  return changed.filter(t => (UPSTREAM[t] ?? []).some(u => changed.includes(u)));
}

export function upstreamChanges(s: AppState, tool: ToolId) {
  const since = latest(s.reviewedAt?.[tool], s.syncedAt?.[tool], builtAt(s, tool));
  return (UPSTREAM[tool] ?? []).filter(u => (s.editedAt?.[u] ?? '') > (since ?? '')).map(u => ({ tool: u, at: s.editedAt![u] }));
}
export const needsReview = (s: AppState, tool: ToolId) => hasContent(s, tool) && upstreamChanges(s, tool).length > 0;
```

In the app's state update (one place, e.g. the root component's effect):

```ts
const edited = editedTools(prev, next);
if (edited.length) {
  const now = new Date().toISOString();
  next.editedAt = { ...next.editedAt, ...Object.fromEntries(edited.map(t => [t, now])) };
  next.syncedAt = { ...next.syncedAt, ...Object.fromEntries(syncedTogether(edited).map(t => [t, now])) };
}
```

## The review: it must go somewhere

The most common failure is a "Review changes" button that does nothing, or
that only dismisses a banner. The review needs:

1. **A queue in build order** (topological over `UPSTREAM`), shown where people start: the home page and the index. Each entry gives the tool, what it's built on, and when that changed.
2. **A dialog per tool:**
   - **What changed**: old → new for the root setup's fields; for other tools, which tool changed and when.
   - **What to check here**: one line per tool, written for it (`WHAT_TO_CHECK[tool]`), e.g. "Do the customer segments still match the persona you edited?"
   - **Open <tool>**, which navigates there.
   - **Mark reviewed**, which records `reviewedAt[tool]` and nothing else.
   - **Next in the queue.**
3. **The tool's own banner** links to the same dialog.

## Keep the doc honest

Write `docs/DATA-FLOW.md` from `assets/DATA-FLOW.template.md`: a table of each
tool and what it reads from, the seven rules, the pieces, and a checklist for
adding a tool. Then add a test that parses the doc's table and compares it
with `UPSTREAM`. If they disagree, the code is right and the doc is stale,
and the test fails until someone fixes it.

## Adding a tool (the checklist that goes in the doc)

1. Give its data one home in the state, and add it to `SLICES`.
2. Add what it reads from to `UPSTREAM`.
3. If it carries text from upstream, store the source id with it.
4. If one action writes to it and another tool, do it in one state update.
5. Add a `WHAT_TO_CHECK` line for it.
6. Test it: an upstream edit flags it, and a review clears it.

## Tests to write

- An upstream edit flags each direct downstream tool, and only those.
- A reload (same content, new references) flags nothing.
- A write-back across two tools doesn't make them flag each other.
- Mark reviewed clears the flag; editing the flagged tool does not.
- The root setup never flags itself.
- The doc's table matches `UPSTREAM`.
