# Codemods: the mechanical part of each wave

Do the mechanical 70–90% with a script, then the rest by hand. Every codemod
here follows the same shape:

```js
// 1. Collect files recursively (print the list: a sweep is only as wide as its glob).
// 2. For each match: transform, and record before → after.
// 3. ASSERT: each intended target was found (a silent no-op is the commonest failure).
// 4. Write, then RE-COUNT the original pattern across all files and print what is left.
// 5. Run tsc + tests + guards. Look at the diff of 3 random files before trusting the rest.
```

Prefer an AST tool (jscodeshift, ts-morph) once a transform touches JSX
structure, such as replacing an element with a component. Regex is fine for
class-string rewrites inside a single attribute.

## Wave 1: type

| From | To | Notes |
|---|---|---|
| `text-[10px]`, `text-[9px]`, `text-[11px]` | the eyebrow or meta rung | below the floor goes UP to the floor |
| `text-xs` / `text-sm` / `text-base` / `text-lg` … | the nearest rung **by role** | map by context: inside a label → meta; a heading → title |
| `<p className="text-sm text-gray-500">` | `<Text variant="meta" tone="muted">` | do this when the className is *only* typography + tone |
| `<h2 className="text-lg font-bold">` | `<Heading variant="title" as="h2">` | keep the document level in `as` |
| `<span className="text-[10px] uppercase tracking-wider font-bold">` | `<Eyebrow>` | the uppercase + tracking combination is the signature |
| `tracking-*` on screens | delete | the type role owns letter-spacing |

## Wave 2: controls

| From | To |
|---|---|
| `<button className="…bg-brand…text-white…">Label</button>` | `<Button>Label</Button>` (drop the recipe classes; keep layout ones like `w-full`, `ml-auto`) |
| `<button>` containing only an `<i>`/svg | `<IconButton icon="…" label="…">`; the label is required, so read it from the `title`/`aria-label` |
| `<i className="fa-… mr-2" /> Label` inside a Button | `icon="fa-…"` prop |
| `{loading ? <Spinner/> : <i …/>}` inside a button | `loading={loading}` |
| `<label>…</label><input …>` pairs | `<Field label="…"><Input …/></Field>` |
| `animate-spin` / `fa-spin` outside buttons | `<Spinner>` |

Watch for: `type="submit"` must survive. Buttons with `onClick` on a parent
`<form>` keep working only if the type is forwarded.

## Wave 3: surfaces

| From | To |
|---|---|
| `bg-white border rounded-xl p-6` (+ shadow) | `<Card padding="lg">` / `variant="raised"` |
| `bg-red-50 border border-red-200 rounded-lg p-3` | `<Notice tone="danger">` |
| `fixed inset-0 bg-black/50 …` + a centred box | `<Modal>` |
| a hand-built page band | `<PageHeader>` |
| "Nothing here yet" blocks | `<EmptyState>` |

## Wave 4: layout

| From | To |
|---|---|
| `gap-2.5`, `gap-3.5`, `gap-6`, `space-y-8` … | the nearest rung on the spacing scale |
| `mx-4`, `md:px-8` on a page block | delete (the frame sets the edge) |
| `text-red-600`, `bg-green-100` … | the tone prop of the kit component, or a tone utility |
| `text-gray-400/500/600` | `tone="muted"` (or the muted utility) |
| `style={{ background: '…' }}` | a class (inline styles can't be themed) |

## Wave 5: small parts and flows

| From | To |
|---|---|
| `rounded-full px-2 py-0.5 text-xs bg-…` | `<Badge tone>` (a status) or `<Tag>` (a value or count) |
| `h-2 rounded-full overflow-hidden` + inner width % | `<Progress value>` |
| `<table>` | `<Table>` family |
| `<img className="rounded-full …">` | `<Avatar>` |
| "Step {n} of {total}" + Back/Next buttons | `<Wizard>` / `<WizardStep>` |

## Writing (Phase 5)

`check-writing.mjs` exports `toSentenceCase` and `findings`. Convert in
two passes:

1. **Collect**: run `--list`, and group the findings by kind.
2. **Convert** Title Case automatically: apply `toSentenceCase` to the exact string on the exact line, and print `before -> after` for every change.
3. **Hand-fix** the rest:
   - exclamation marks: "Copied!" → "Copied"
   - "AI" in labels: drop it
   - typed arrows → `iconEnd`
   - "..." → "…"
   - "e.g.," → "e.g."
   - hype words → plain words
4. **Review every printed change.** Revert wrongly lowercased names, add them to `properNames`, and run again.
5. **Update tests that match old strings** (`/Generate AI Playbook/i`). Only the string changes; what the test checks stays the same.
