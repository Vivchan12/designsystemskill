# The kit: components, their APIs, and the rules they enforce

Hand this file to every migration subagent. Each component takes **meaning**
(a variant, a tone, a size), never classes for how it looks. `className` is
for layout only: margin, flex, width, truncation. Typography in `className`
on a kit component should fail `check:kit` (add that rule once the kit
exists).

The APIs below come from a working rollout (React + Tailwind) and are a
starting point. Adapt the names to the decisions sheet; keep the shape.

## Text

| Component | Use for | Props |
|---|---|---|
| `<Text>` | all non-heading text | `variant`: meta · body · lead; `tone`: default · muted · inherit · danger · success; `weight`; `leading`: none · tight · snug · relaxed; `as` |
| `<Heading>` | every heading, and a figure | `variant`: item · section · title · stat · band · display; `as` sets the document level separately from the look |
| `<Eyebrow>` | uppercase kicker above a section, field or stat | `tone`, `as` |
| `<Prose>` | generated or markdown text | `variant`: body · lead; sizes children on the scale (Tailwind Typography's `prose` sizes in em: ban it) |
| `<Icon>` | an icon glyph | `name`, `size` (a type rung), `label` when it carries meaning on its own |

## Actions and controls

| Component | Use for | Props and rules |
|---|---|---|
| `<Button>` | any action with a label | `variant`: primary · secondary · ghost · danger · link · dashed (an "Add" slot) · accent (AI actions only); `size`: sm · md; `icon` before the label, `iconEnd` after it (where it goes); `loading` swaps the icon for a spinner, disables the button and sets aria-busy. Never write an `<i>` inside a Button. Default `type="button"`, but forward `type="submit"`: dropping it silently breaks forms. |
| `<IconButton>` | icon-only action | `icon`, **`label` required** (the accessible name), `size` |
| `<Chip>` | toggleable or removable tag, filter, suggestion | `selected`, `icon`, `count` |
| `<Segmented>` | 2–4 exclusive options in one bar | `options`, `value`, `onChange`, `label` |
| `<Tabs>` | switching panels (role tablist) | `tabs`, `value`, `onChange`, `label` |
| `<OptionCard>` | a large choice with a description (wizard answers) | `selected`, `onSelect`, `title`, `description`, `icon` |
| `<Switch>` / `<Checkbox>` | on/off setting; ticking a checklist item | `checked`, `onChange`, `label`, with proper roles |
| `<Slider>` | any value on a range | `label`, `value`, `min`, `max`, `step`, `format`. Named categories are not ranges: use Segmented. |
| `<Input>` / `<Textarea>` / `<Select>` | every form field | `size`, `invalid`; one focus colour and one error style in both themes |
| `<Field>` | a field's label, hint and error, linked to the control | `label`, `hint`, `error`, `optional`; one control as its child (it wires id, aria-describedby and aria-invalid) |
| `<Spinner>` | the one "working…" glyph outside buttons | `size`, `tone`, `label` |

## Surfaces and feedback

| Component | Use for | Props and rules |
|---|---|---|
| `<Card>` | a bordered panel | `variant`: plain · raised · muted · elevated · popover · placeholder (dashed) · insight; `padding`: sm · md · lg · xl. A message is a Notice, not a tinted Card. |
| `<Notice>` | any message about the page: error, warning, tip, done | `tone`: info · success · warning · danger (danger is `role="alert"`); `title`, `actions`, `onDismiss` |
| `<Badge>` | a status word in a pill (uppercase) | `tone`; `color` for a per-datum colour |
| `<Tag>` | a value or count in a pill (sentence case) | same tones; `size` |
| `<Modal>` | any dialog | `open`, `onClose`, `title`, `footer`, `size`, `dismissible` (false = must be answered). Traps focus, closes on Escape, returns focus. Portals carry the token scope class. |
| `<Sheet>` | the phone's bottom drawer | `open`, `onClose`, `title` |
| `<EmptyState>` | what a screen shows before it has content | `icon`, `title`, `description`, `actions` |
| `<Progress>` / `<ProgressSteps>` / `<Dot>` | how far along; steps; a legend marker | `value`, `tone`, `size`, `label` |
| `<Table>`, `<Th>`, `<Tr>`, `<Td>` | data tables | `caption`, `minWidth` (scrolls rather than squeezes), `numeric` cells |
| `<Avatar>` | a person | `src`, `initials`, `color`, `size`. Never send names to an avatar service. |

## Page structure and flows

| Component | Use for | Rules |
|---|---|---|
| `<PageHeader>` | the band at the top of each screen | Sizes its title through Heading. Never restyle a heading through a wrapper class: it silently outranks the token. |
| `<Wizard>` / `<WizardStep>` | every guided, step-by-step flow | Progress is segments captioned "Step n of N · name". Back sits bottom-left (hidden on the first step) and the primary button bottom-right; the primary names where it goes ("Next: Core job"), and on the last step what it does ("Generate model"), with an AI accent when it spends credit. Cancel sits beside the primary. One question per step, with its hint underneath. Inline wizards fill the content column. |

## Page-level rules (check:kit and the render audit enforce them)

1. **One edge.** The frame sets the side padding once, and every page block starts and ends on the header's text column. Never inset a block again with `mx-N` or a bare `md:px-N`.
2. **One padding down a page.** Cards stacked on the page share one inner padding, so their text lines up.
3. **One spacing scale** (decisions §2). Values off it fail.
4. **Status colours are tones**, never `red-500`/`green-600` picked per screen.
5. **Secondary text is `tone="muted"`**, never `text-gray-N` (most Tailwind greys fail contrast).
6. **Letter-spacing belongs to the type role**, never to a screen.
7. **Inline styles can't be themed.** Backgrounds and colours go in classes or props.
8. **Genuine exceptions are marked on the line** with the reason: `// token-exempt: per-datum chart colour`, `// kit-exempt: third-party widget`.
