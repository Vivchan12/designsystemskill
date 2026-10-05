# Design system

Three layers, and screens only touch the top one:

1. **Tokens.** The named values (type sizes, colours, radii, spacing, surfaces) in `<token file>`.
2. **Components.** The kit in `<kitDir>`, built only from tokens. **Screens are built from these.**
3. **Guards.** CI checks that block anything bypassing layers 1–2.

Live gallery of every component: **`/design-system`** in the app.

## Components

Import from `<kitDir>`. Each one takes *meaning* (a variant, a tone), never
classes for how it looks. `className` is for layout only: margin, flex,
width, truncation.

| Component | Use for | Key props |
|---|---|---|
| `<Text>` | … | … |

## The scale

| Class | Size | Line height | Role (use for) |
|---|---|---|---|
| `text-ds-eyebrow` | 11px | 1.3 | UPPERCASE kickers, badges |
| `text-ds-meta` | 12px | 1.4 | captions, helper text |
| `text-ds-body` | 13px | 1.45 | **default** UI text |
| … | | | |

## Spacing

| Job | Size | Class |
|---|---|---|
| Row | 6px | 1.5 |
| Tight | 8px | 2 |
| Stack | 12px | 3 |
| Group | 16px | 4 |
| Section | 20px | 5 |

## Rules

0. **Use the kit.** The rules below matter only when building the kit itself.
1. Only type-role classes set a font size. CI enforces it.
2. Choose by role, not by eye. If a value between two rungs looks right, the rung is wrong for everyone: change the rung, in one place.
3. The smallest size is 11px.
4. Generated text goes through `<Prose>`.
5. Portals carry the token scope.
6. Two surfaces, both tokens: `panel` and `popover`.
7. One edge: every page block lines up with the header.
8. One spacing scale.
9. Genuine exceptions are marked on the line: `token-exempt: <why>` / `kit-exempt: <why>`.

## How it is enforced

| Check | What it catches | When |
|---|---|---|
| `check:tokens` | raw values that duplicate a token; off-scale font sizes | CI |
| `check:kit` | hand-built UI growing in any file (ratchet; new files start at 0) | CI |
| `check:writing` | Title Case, "!", "...", typed arrows, old names | CI |
| `audit:render` | computed off-scale text, unsized 16px text, contrast, page edge | before merging UI changes; `--dark`, `--width 390` |

## Adding to the kit

If the kit lacks something, add it to the kit (with a gallery entry and a row
above), rather than styling a one-off on a screen.
