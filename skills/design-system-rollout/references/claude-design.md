# Claude Design: the design file, kept in step with the code

The rollout produces two Claude Design artifacts the owner can open, comment
on and share:

1. **A Design System**: the tokens, the kit's components rendered live, the
   fonts, and the brand book. Other designs and decks build on it.
2. **A Design canvas** of the product's screens: the main screen first, then
   its states, the key pages and the kit. This is the design file people look
   at, and the one that has to be updated whenever the main screen changes.

Both start from the code. The code is the source of truth for values; the
canvas is where people see and discuss them.

**Follow each type's own instructions for file formats.** Creating or reading
an artifact of the type returns its current instructions, and they change
between releases. This page covers what to make, when, and the traps; the type
covers the file shapes. Where the two disagree on how to *work with the
artifact*, the type wins (see "Verifying").

## 0. Before anything

- **Look for existing ones.** List the owner's artifacts of type "Design
  System" and "Design". If `DESIGN-SYSTEM.md` or the agent instructions name
  one, update that. A second canvas of the same product splits the comments,
  and nobody knows which is current.
- **Create the artifacts before reading their reference files.** Each type's
  reference files (the format, the token grammar, the preview contract) are
  served from an artifact *of that type*; reading them by the type's own link
  is refused. So create the Design System and the canvas first (empty is
  fine), then read `artifact-type/reference/…` from them.
- **Pick the branch to build from.** Use the deployed branch (usually `main`):
  the design file shows the product people actually use. If main is behind a
  working branch the owner considers current (the UI work is there, not yet
  merged), ask once which one to use. Record the choice: the exporter writes
  `meta.ref` (branch@commit), and the system's `lastChange.via` should name the
  same branch and commit.
- **Put the tooling in the repo, not in your skills folder.** Copy the
  skill's whole `scripts/` folder into the project's `scripts/design/` (the
  scripts share `lib.mjs` and `rn.mjs`; copying them one by one is how a
  fresh install ends up crashing). Add npm scripts: `design:tokens`, `design:kit`, `design:capture`,
  `design:sync`. Commit them, the `claudeDesign` block of
  `design-system.config.json`, and `claude-design.lock.json`.
  **Don't commit the output** (`claude-design/` goes in `.gitignore`): it's
  generated, and the published system is the copy people use. Docs and agent
  instructions point at `npm run design:tokens`, never at `~/.claude/skills/…`,
  which another agent or machine won't have.

## 1. The Design System (end of Phase 3)

### Tokens: `npm run design:tokens`

Configure `claudeDesign` in `design-system.config.json` (template in
`assets/`):

| Key | What | Get it right |
|---|---|---|
| `themes` | Theme id → selectors that declare its tokens, **in cascade order** (later wins). Every theme after the first sits on top of the first theme's list. | Include *every* scope that redeclares tokens, e.g. `{"light": [":root", ".app-shell"], "dark": [".dark", ".dark .app-shell"]}`. A scope left out means its overrides are exported with the wrong value. |
| `notes` | Token → usage note. | Write notes here, not as CSS comments: existing comments often hold history ("was #88807D…") that shouldn't be rewritten. `--notes-stub` prints the missing ones as JSON to fill in. |
| `textStyles` | Style → `lineHeight`, `fontWeight`, `letterSpacing`. | The exporter finds these when a CSS rule sets `font-size: var(--type-token)` beside them. It lists the rest for you to add here. |
| `fonts` | `{family, src, weight, style, as}` per font file. | The `src` path is in `node_modules` (e.g. `@fontsource-variable/…/files/*.woff2`) or `public/`. Include icon fonts (Font Awesome) as well. They are copied on every export, so a re-export never drops them. |
| `ignoreScopes` | Selectors that redeclare tokens but aren't a theme: a phone-size override, a print style. | The export **fails** on any redeclaring scope that isn't listed under `themes` or `ignoreScopes`. That was the silent bug: an override nobody listed exported the base value. |
| `overrides` | `{tokens: {name: {value, usage}}, add: {family: [tokens]}}` | Anything you'd otherwise fix by hand in `tokens.json`. Hand edits are lost on the next export; overrides aren't. |
| `contrast` | `{text: [...], grounds: [...], large: [...]}` | Every text colour is checked on every ground, in every theme: 4.5:1, or 3:1 for tokens listed in `large`. A failure the product really ships stays, with the ratio stated in its note. |

The report lists what it couldn't export (layout sizes, motion), tokens
without a note, and contrast failures. It exits 1 while a scope is unlisted or
a font file is missing. Read the whole report before publishing.
`export-tokens.test.mjs` covers the cascade rules: run it after changing the
script.

### Components: `npm run build && npm run design:kit`

`bundle-kit.mjs` builds the kit into what Claude Design previews need:

- **`components/bundle.js`**: one classic script assigning `window.<Namespace>`. React imports are mapped to the page's React 18 globals. APIs that exist only in React 19 (`use()`, `<Context value>`, `ref` as a plain prop, `useActionState`…) are flagged, because they break on the preview's React 18. Fix them in the kit (`forwardRef`, `<Context.Provider>`); both work on 18 and 19.
- **The theme switch.** Claude Design sets `data-theme="dark"` on the page; the bundle mirrors it onto the app's own dark class (`kit.darkClass`, default `dark`).
- **`components/bundle.css`**: the app's own production stylesheet, so every class the kit uses exists. Font URLs inside it won't resolve; the fonts come from the system's `fonts/`.
- **A preview stub per component** without one. Each stub gets the plumbing right: the marker line, a root with `kit.previewRoot` classes (the app's shell class, ground and text colour), and the namespace import. Replace its body with the component's real variants and states, and set its `group`. List sub-parts that are shown inside a parent's card (`Th`, `Td`, `WizardStep`) in `kit.parts`, so they get no card of their own.

### The brand book

The README is `DESIGN-SYSTEM.md` and `WRITING.md` rewritten for a designer:
grounds, text colours, which accent for what, the type rungs by role, spacing
by role, which component for which job, the writing rules. End it with a
**Known gaps** section: contrast failures, what wasn't exported, anything
hand-added.

**Exit:** every token has a note, every type style has weight and line height,
every component has a card showing its real states, fonts are in, and the
report's contrast failures are named in the README.

### On React Native

- **Tokens:** `export-tokens.mjs` reads `tokenModule`, merging each theme's colours by name.
- **Component cards:** `bundle-kit.mjs` builds the kit through `react-native-web`. Without it, use captures from the Expo web build as static cards.
- **Screens:** capture from the Expo web build with a `screens` module (`react-native.md`), at 390 wide. Add the art (illustrations, character frames) as design-system assets by group, because on many native apps the art *is* the look.

## 2. The canvas

| Row | Artboards |
|---|---|
| **Main screen** | `Main`: the screen users land on (home, dashboard, "Today"), at its real size. Beside it, `Main-dark` and `Main-phone`. |
| **Components** | The kit in use, by variant. |
| **Setup / onboarding** | One artboard per step of the first-run flow. |
| **Key pages** | The 5–10 screens people use most, titled by what they do. |
| **Brand** | Icon, launch screen, empty-state art, if any. |

Each row gets a title note. Install the system on the canvas, as the type's
instructions describe: `tokens.json`, `components/bundle.css` and the `fonts/`
go under `ds/<folder>/`, plus `canvas-fonts.css` at the canvas root (the
exporter writes it with those paths).

### Recreate screens by capturing them, not redrawing them

`npm run design:capture` (`audit-render.mjs --capture claude-design/screens`)
opens each route in a real browser and writes its rendered markup as an
artboard file. The artboard uses the app's own classes, with the system's
stylesheet and fonts linked. That makes it exact (it *is* the app) and quicker
than redrawing from a screenshot. Run it for each variant into the same
folder, and the runs add up:

```bash
S=scripts/design
node $S/audit-render.mjs --capture claude-design/screens                 # desktop
node $S/audit-render.mjs --capture claude-design/screens --dark
node $S/audit-render.mjs --capture claude-design/screens --phone         # 390 wide, named "-phone"
node $S/audit-render.mjs --capture claude-design/screens --signed-out    # the login and sign-up pages
node $S/audit-render.mjs --capture claude-design/screens --phone --canvas
```

`--canvas` writes `canvas.boards.json`: every captured board with its
position and size, one row per screen and its variants side by side. Merge
its `boards` and `order` into the canvas index instead of copying sizes from
`capture.json` by hand. `--signed-out` uses `audit.setupSignedOut` if the
project has one (to dismiss a cookie banner, say), and no sign-in otherwise.

It needs the app to render real screens with sample data, so give the audit a
`setup` script (Phase 2's render audit uses the same one). The script signs in
a test user and seeds believable sample data: never a real user's, never lorem
ipsum. If the app can't run offline, stub the network in `setup`
(`page.route(...)` returning the sample data). The capture marks any artboard
whose root came out empty.

Then:
- **Images**: upload each one listed in `capture.json` as an asset and point the `src` at the returned URL.
- **Height**: an artboard can be at most 8000px tall. The capture flags any taller one. Split it into parts (above and below the fold), or lay a long gallery out in columns.
- **Interactive bits** (open menus, a dialog) need their own capture: open them in `setup` or with a route parameter, then capture again.
- **Type files**: when publishing the component bundle's `index.d.ts`, send it with `contentType: "text/plain"` (`files: { "project/components/index.d.ts": { from: "…", contentType: "text/plain" } }`). Without it the type isn't recognised and the whole publish is refused.

## When to update it

| Moment | Update |
|---|---|
| **Phase 1, decisions** | Before any code changes, add a row titled "Design system: proposed scale" with three boards:<br>• **the main screen as it is now**;<br>• **the same screen in the proposed system**;<br>• **what changes**: each text size, spacing step and control height, before → after.<br>The owner signs off by looking at their own screen. If the main screen changes little, say which screens change most (often the reading-heavy ones: articles, instructions, long forms), and add one of those as a second pair. |
| **Phase 3, the kit** | Create the system; fill the Components row. |
| **Each migration wave** | Re-capture any screen on the canvas that the wave touched (always `Main`), and publish only those artboards. List them in the PR. |
| **Any token change** | `npm run design:tokens`, then update the system's `tokens.json` (always sent whole) and reinstall it on the canvas. |
| **Phase 6** | Add the rule below to the agent instructions. |

> **Design file.** Screens: <canvas link>. Design system: <system link>. When
> a change alters a screen on the canvas (always check the main screen),
> re-capture it with `npm run design:capture` and update that artboard in the
> same piece of work. When a token changes, run `npm run design:tokens` and
> update the system. Never create a second canvas.

## Noticing when it's stale

`check-design-sync.mjs` keeps `claude-design.lock.json`: a fingerprint of the
files each artboard was built from (`claudeDesign.sync.screens`, e.g.
`"Main": ["components/Home.tsx", "components/Layout.tsx"]`), plus the token
files and the kit. After publishing an update, run it with `--update` for the
artboards you changed. In CI, run it without `--strict`: it lists what's
behind and doesn't block, because a design file a day behind is fine and a
blocked merge isn't. Use `--strict` locally, before saying the work is done.

## Updating an artboard

1. Read the canvas index and the artboard first: someone may have edited it by hand.
2. Re-capture the route and replace the artboard's contents. If the owner has hand-edited it (added notes, moved things), keep their edits and change only what the code changed.
3. Publish only the changed files to the same canvas. If the publish is refused because someone saved meanwhile, read the file again and redo the change.
4. Run `check-design-sync.mjs --update <artboard>` and commit the lock file.
5. Tell the owner in one line which artboards changed, with the link.

## Verifying

The canvas type asks you **not** to open, render or screenshot the canvas
unless the owner asks. That doesn't conflict with "verify by rendering": what
you verify is the *source*.
- The capture is made from the running app.
- The kit bundle is checked by rendering one preview locally on React 18, light and dark: load the React 18 UMD files, `bundle.css` and `bundle.js` in a headless browser, mount two or three components, and look for errors.
- The tokens are checked by the exporter's report.

If you want to look at the published canvas, ask the owner first.

## When the design leads

If the owner edits the canvas first (moves a block on `Main`, tries a card
style), treat the artboard as the spec. Build it in code from the kit, then
re-capture. If it needs a value no token names, raise it rather than
hardcoding it.

## Record the links

As soon as either artifact exists, write both links into `DESIGN-SYSTEM.md`
(a "Design file" section) and the agent instructions. A link that only lives
in a chat is a canvas the next session can't find, so it makes a second one.
