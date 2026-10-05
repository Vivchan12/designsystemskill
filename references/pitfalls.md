# Pitfalls: what made the first rollout slow, and what made it lie

Every item here cost hours the first time. Most of them are silent: tsc
passes, the build passes, the guard says done, and the page is still wrong.
Read this before writing guards (§1) or codemods (§2–§4).

## 1. Guards that check nothing

- **A guard that parses zero inputs and passes is worse than no guard**, because it is trusted. One token check stayed green for weeks because the tokens had moved to a selector its parser didn't expect, so it compared every size against an empty list. Make every guard fail when it finds no tokens, no files or no rungs (the bundled ones do).
- **Prove each guard fails.** Plant one violation, see it go red, then remove the plant.
- **Duplicate matching is the wrong rule for type.** For colours and radii a near-duplicate is a typo; type drift is near-misses (11px beside 11.5px beside 12px). Reject every size that isn't a rung, rather than only exact duplicates of tokens.
- **Every generator of text needs a route onto the scale.** Markdown renderers, Tailwind `prose` (sizes in em) and AI replies all need it.

## 2. Codemods that report success and change nothing

- **A trailing `\b` does not fire after `]`.** `\brounded-\[(\d+)px\]\b` skips every `rounded-[12px]` followed by a space. Use an explicit lookahead such as `(?=[\s"'`}]|$)`.
- **Alternations match in the order written**, not longest first. `tracking-(wide|wider)` against `tracking-wider` matches `wide` and leaves a stray `r`. Sort the alternatives longest first, or anchor the end.
- **A replace that finds nothing is a silent no-op.** Every scripted edit should assert that its target exists: `assert old in s` in Python, or check the count in JS. In one session a "proper names" list edit silently failed twice, and the converter then lowercased "Geoffrey Moore" and "Customer Profile".
- **After any sweep, re-count the pattern and require zero.** "Changed 63 files" is not the same as "nothing is left".
- **A sweep is only as wide as its glob.** Walk directories recursively and print the file list; `components/*.tsx` silently skips the subfolders.

## 3. CSS that does nothing, silently

- **An element with no size class inherits 16px**, which is often larger than the headings around it. There is nothing to grep for, so measure: the render audit flags it.
- **A wrapper-scoped rule outranks the utility it duplicates.** `.hero h1 { font-size: 38px }` beats `text-ds-band`, so changing the token changes nothing. If a token change appears to do nothing, look for a more specific rule restating it as a literal.
- **Tailwind opacity modifiers on `var()` colours generate no CSS.** `bg-brand/10` silently compiled to nothing for 50 tints. Route tints through `color-mix()` in the Tailwind config, and test it by grepping the *built* CSS for the class.
- **Don't route solid colours through a feature older browsers lack.** Sending every colour through `color-mix()` blanked brand backgrounds on Safari before 16.2. Only tints need it.
- **Two classes for one property resolve by stylesheet order**, not by the order you wrote them. Give the component a prop instead of overriding its classes.
- **A global `!important` beats every utility.** A `.dark .bg-white { … !important }` rule meant every `dark:bg-[#…]` was ignored. Make surfaces tokens.
- **Portals escape the token scope.** If tokens are declared on `.app-shell` rather than `:root`, a modal rendered into `<body>` has no tokens. Put the scope class on the portal root.
- **`var(--token)` can't be used where a colour is concatenated or parsed as hex** (`color + '22'`, `readableInk(hex)`). It becomes invalid CSS that the browser drops. Keep those raw and mark them `token-exempt:`. An automated pass that "fixed" them broke several colour legends.
- **`minmax(240px, 1fr)` can't shrink below 240px.** Use `minmax(min(240px, 100%), 1fr)`.
- **Media queries read the viewport, not the space you have.** A fixed side panel makes `md:` fire on a canvas that is actually narrow.

## 4. Component migrations that break behaviour

- **Forward `type`.** A kit Button that defaults to `type="button"` and doesn't forward `type="submit"` stops five forms submitting, and nothing errors.
- **Don't spread `key` into props.** React consumes it, so a handler reading `props.key` gets `undefined` and the edit silently does nothing.
- **Count variants before designing the component.** Twenty primary-button recipes became two sizes, not a component with every knob.
- **Where a component already works, normalise its classes in place**, rather than rewriting it into the kit if it has no tests. It's the same visual result with far less risk.

## 5. Verification that misleads

- **"Looks untidy" is where functional bugs hide.** For anything interactive, check that it actually changes the data and that the change survives a reload. Two read-only canvases passed a full click-through.
- **Screenshots go stale.** Confirm state in text (the DOM, the data) before drawing a conclusion from a picture.
- **Synthetic `blur` events don't trigger React's `onBlur`**, which listens for `focusout`. A save-on-blur field looks broken to a test that is itself the problem.
- **Audit false positives first**, or nobody will trust the tool:
  - alpha-blended backgrounds read as solid;
  - intentionally inverted controls flagged in dark mode;
  - `truncate` (clipping on purpose) flagged as overflow;
  - inputs whose value is longer than the box.

  Exclude these and every remaining hit is real.
- **Tests must fail without the fix.** Revert the fix, watch the test go red, then restore it.

## 6. Writing conversions

- **Sentence-casing is phrase-aware or it is wrong.** "Business Model" (a tool name) keeps its capitals; "Model drivers" doesn't. Put multi-word names in `properNames` *before* converting.
- **Each sentence starts fresh.** A capital after ". " is not Title Case.
- **Hyphenated plan and product names** ("Self-Starter") split into words. Add them as phrases.
- **Some capitals are framework terms inside their own tool.** For example, "Value Map" is the right half of a Value Proposition canvas. Keep them with `writing-exempt:` and the reason, even where the "one name per thing" rule would rename them elsewhere.
- **Lowercasing breaks acronyms.** `focus.replace(/^./, toLowerCase)` turned "TAM" into "tAM". Lowercase the first letter only when the second is lowercase.
- **JSX text that wraps onto its own line** (`<Button …>\n  Start Pitch\n</Button>`) is invisible to a single-line regex. The bundled check reads the previous line for this. About 75 labels hid this way.
- **Review every converted string by hand.** The converter does 90% of the work; the remaining 10% are names.

## 7. Process

- **Shared working directory:** check the branch before every commit. Never `git add -A`: stage specific paths, because another agent's files may be sitting there.
- **One PR per wave, merged in order.** Later waves conflict with earlier ones in the same files, so merge main into the next wave's branch rather than rebasing someone else's.
- **Don't merge or deploy without the owner's go-ahead.** After a deploy, check every domain the account serves. A domain answering 200 is not the same as it serving the right product.
