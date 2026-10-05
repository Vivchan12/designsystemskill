# Writing in <Product>

How the words on screen are written. DESIGN-SYSTEM.md is how things look; this
is how they read. `npm run check:writing` enforces the parts a machine can check.

## The rules

1. **Sentence case, everywhere.** Buttons, headings, tabs, field labels, empty
   states, dialog titles: capitalise the first word and proper names only.
   "Add item", not "Add Item".
2. **Proper names keep their capitals.** The product's tools and screens (by
   their navigation names), framework terms, people, products, acronyms. The
   list lives in `design-system.config.json` → `properNames` / `properWords`.
3. **Buttons say what happens, starting with a verb.** "Save changes", "Add
   member". A button that goes somewhere names where: "Next: Billing".
4. **Don't label AI in the words.** The icon and the accent colour already say
   a model is involved. "Generate summary", not "Generate AI Summary".
5. **While it's working, say what it's doing**, with an ellipsis character:
   "Saving…" (`…`, not `...`).
6. **Done is past tense, calm.** "Copied", not "Copied Successfully!". No
   exclamation marks anywhere in the interface.
7. **One name for one thing.** Use the navigation name wherever a tool or
   screen is mentioned. Old names are listed in `writing.otherNames`.
8. **Arrows are icons, not characters.** Use the button's `iconEnd`.
9. **Examples start "e.g." without a comma**, and are specific.
10. **Plain words over hype.** Write for someone at the end of a long day.

## Examples

| Instead of | Write |
|---|---|
| Load Example Data | Load example data |
| Generate AI Report | Generate report |
| Processing... | Processing… |
| Copied Content! | Copied |
| View Report → | View report (with `iconEnd="arrow-right"`) |
| e.g., Acme Corp | e.g. Acme Corp |
