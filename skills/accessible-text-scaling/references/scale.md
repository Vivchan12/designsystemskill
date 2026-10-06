# The text scale: a range, not a fixed size

Phones let people choose their text size. On an iPhone it runs from about 82%
of normal (xSmall) to about 312% (the largest accessibility size). On Android
it runs from 85% to 200%. Someone with low vision, or an older user, may set
it very large; someone who wants more on screen may set it small.

An app has three bad options and one good one:

| Approach | What happens |
|---|---|
| Ignore the setting (fixed sizes) | People who need bigger text can't get it. Fails accessibility requirements. |
| Follow it with no limits | At the largest sizes, headings fill the screen, buttons overflow, and layouts break. Small settings make text unreadably small. |
| Cap everything low (e.g. 130%) | Looks tidy, still fails the people who need it most. |
| **Follow it within a range, per role** | Text grows and shrinks with the setting, inside limits that keep every role readable and the layout whole. |

## The policy: three numbers, and a limit per role

| Setting | Recommended | Why |
|---|---|---|
| `minScale` | **0.8** (80%) | Follow a smaller setting a little, so a user who wants denser screens gets them, but no further. |
| `maxScale` | **2.0** (200%) | WCAG 1.4.4 asks that text can be resized to 200%. This is the **least** you can allow for reading text, not a style choice. |
| `minSize` | **12pt** | No text renders below this at any setting. Reading text gets a higher floor of its own (body 14pt, lead 15pt), so the smallest setting never makes a paragraph hard to read. |
| a role's `maxScale` | display ≈ 1.25, heading ≈ 1.35, title ≈ 1.75 | Text that starts large doesn't need to double: a 36pt headline at 200% is 72pt and pushes everything else off the screen. Body text, labels and captions grow to the full 200%. |

The rule that keeps it coherent: **a bigger role never renders smaller than a
lesser one, at any setting.** If a title stops growing at 35pt while body text
keeps going to 34pt, the hierarchy is about to flip. `scale-table.mjs` checks
this for every setting and tells you the smallest `maxScale` that fixes it.

### What about the very largest iPhone sizes (above 200%)?

The policy above holds everything at 200%. That's a reasonable default, and it
meets the requirement. For apps whose core is reading (articles, instructions,
health information), consider letting **body text** go further (`maxScale: 2.5`
or more on the body role only), with the layout patterns in `layout.md`. The
people who choose those sizes do so because they need them.

### Line height grows with the size

Store line height as a ratio of the size (22/15 ≈ 1.47), not as a fixed
number. A fixed 22pt line height on text that has grown to 30pt makes the lines
overlap. Keep it at least 1.15× the size.

### What doesn't scale

Icons beside text grow with it, up to 1.5× by default (`icons.maxScale` in the
config), and never shrink. The table shows their sizes per setting, and the
generated code includes them (`scaledIcon()`, `--icon-*`), so icons follow the
same agreed scale as the text. Icon-only buttons keep a 44pt tap area at every setting.
Numbers in charts and tab bar labels are the usual exceptions on iOS. For
those, use the system's large content viewer (long-press shows an enlarged
version) rather than letting them grow.

## The deliverable

`scale-table.mjs` prints the table: one row per setting a user can choose,
one column per text role, the size it renders at, with what was held at a
limit marked. That table is what the owner signs off. It is the accessibility
scale. Then it generates the code that applies it (`--emit ts` for React
Native, `--emit css` for the web), so the numbers in the table and in the app
can't drift apart.
