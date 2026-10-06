# Claude Design: the guides on the design file

If the product has a Claude Design canvas of its screens (its `DESIGN-SYSTEM.md`
or agent instructions link it, or the owner's artifacts list one of type
"Design"), the guides go on it. That puts the step lists in front of the owner
in a form they can sign off by looking, comment on step by step, and share. If
there's no canvas yet, ask once whether to make one. Never make a second one:
two canvases of one product split the comments, and nobody knows which is
current.

Follow the Design type's own instructions for the file format. Creating or
reading a canvas returns them, and they change between releases.

## When

| Moment | On the canvas |
|---|---|
| **Phase 1, sign-off** | One row per tool that gets a guide, titled "Guide: <Tool>". One artboard per proposed step: the question, the hint, and the options *as they would be gathered from the owner's real data*. This makes a step with nothing to offer show up as empty before anyone builds it. |
| **Phase 2, built** | Replace each proposed artboard with the built step, matched to a screenshot of the running guide. |
| **Phase 3, connected** | One artboard showing the flow map: tools as boxes in build order, arrows for "reads from", and the review dialog with one real example. |
| **Any later change to a guide or to the main screen** | Update those artboards in the same piece of work. The main screen is always checked: a guide's entry point usually lives there. |

## How

- Recreate each step from the real component and a screenshot of it, using the installed design system's tokens. Keep the real labels. Use believable sample data, never a real user's.
- Updating: read the canvas index and the artboard first (someone may have edited it), change only what changed, and publish only those files to the same canvas. If the publish is refused, read again and redo the edit.
- Tell the owner in one line which artboards changed, with the link.
- Write the canvas link into the project's agent instructions, if it isn't there already.
