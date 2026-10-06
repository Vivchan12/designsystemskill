# Decisions sheet

Fill this in from the inventory **before** writing code, then give it to the
owner as one document. Every row has a proposed answer and the evidence for
it, so the owner only has to correct what they disagree with. This sheet
replaces the stream of one-at-a-time questions that made the first rollout
slow.

Copy the sheet into the project as `docs/design-decisions.md` once it is
signed off. Every migration brief links to it.

---

## 1. Type scale

About 6–8 rungs, **named by role**, never by size. People pick a size by
what the text does, not by the pixel value that looks right.

| Role | Proposed | Use for | Evidence from the inventory |
|---|---|---|---|
| eyebrow | 11px, uppercase, bold, tracked | kickers, badges, tab labels | 10px used 269×, 9px 50×: raise both to the floor |
| meta | 12px | captions, timestamps, helper text | text-xs 162× |
| body (default) | 13px | UI text: labels, buttons, inputs, cells | |
| lead | 15px | paragraphs people read, generated text | |
| title | 17px | card and section headings | |
| stat | 22px | figures, KPIs, empty-state headings | |
| band | 28px (22px on phones) | page header title | |
| display | 38px (28px on phones) | hero title only | |

- **Floor:** 11px. Nothing a person has to read is smaller.
- **Units:** rem, so text follows the reader's browser setting.
- **Line heights:** at least 1.45 for body and reading text.
- **Fonts:** sans for UI, and a display face only for band/display, if the brand has one.

## 2. Spacing scale

One size per job, applied to gaps and vertical margins *between* things.

| Job | Proposed | Tailwind |
|---|---|---|
| row: things on one line | 6px | 1.5 |
| tight: controls side by side, a label to its field | 8px | 2 |
| stack: items in a list | 12px | 3 |
| group: groups inside a card | 16px | 4 |
| section: blocks on a page | 20px | 5 |

- **Panel insets** (padding *inside* a card): sm 12 · md 16 · lg 20 · xl 24.
- **Hairlines:** 2px and 4px only.

## 3. Radii

Usually three: chip (6–8px), card (12px), frame or dialog (16–20px), plus
`full` for pills and avatars. Evidence: *N radii in use*.

## 4. Colour

- **Brand:** primary, accent, ink (text), page background.
- **Tones** (each with a tint, an ink and a border that pass contrast in both themes): neutral, info, success, warning, danger.
- **Muted text:** one grey, tuned to pass 4.5:1 on the page background in both themes. It replaces every `text-gray-N`.
- **Surfaces:** `panel` (cards, dialogs) and `popover` (chrome, menus, anything floating), so a menu reads as above the page in dark mode.
- **Per-datum colours** (chart series, per-category colours) stay raw, each marked `token-exempt:` with the reason.

## 5. Dark mode and phone

- Dark mode: yes or no? If yes, the surfaces and tones above need a dark value each, and the audit runs with `--dark` every wave.
- Phone width to verify: 390px.
- Wide canvases (graphs, swimlanes) get a second reading on phones (an outline, stacked lanes), not a shrunken one.

## 6. The kit

The components to build, ranked by how much of the inventory each one
clears. See `kit.md` for each component's API.

| Component | Replaces (inventory count) | Build? |
|---|---|---|
| Text / Heading / Eyebrow / Icon | hand-sized text (N) | yes |
| Button / IconButton | raw buttons (N), N recipes collapse to: sizes sm·md × variants primary·secondary·ghost·danger·link (+accent if AI actions) | yes |
| Field / Input / Textarea / Select | raw fields (N) | yes |
| Card | panel recipes (N) | yes |
| Notice | hand-drawn message boxes (N) | yes |
| Modal / Sheet | overlays (N) | yes |
| Badge / Tag | pill recipes (N) | yes |
| Spinner, Progress | spinners (N), bars (N) | yes |
| PageHeader | page bands | if screens share a header |
| Wizard / WizardStep | step counters (N) | if there are guided flows |
| Table, Avatar, EmptyState, Tabs, Segmented, Chip, Switch, Checkbox, Slider | as the counts justify | |

## 7. Writing

- Sentence case everywhere: yes (recommended).
- Proper names that keep their capitals: the product's tool and screen names, framework terms, plan names, people, partner products. **List them** (they go in the config's `properNames`).
- One name per thing: list the old or alternate names to retire, e.g. `"Order Log" → "Order History"`.
- Buttons start with a verb; no "AI" in labels (the icon says it); "…" while working; calm past tense when done; no "!".
- UK or US spelling?

## 8. Process

- Which branch and PR conventions? Who says "merge it"?
- Is there a CI workflow to add the guards to? Which file?
- Any screens out of scope, such as marketing pages or pre-auth screens? Those go in `kit.exempt` in the config.
