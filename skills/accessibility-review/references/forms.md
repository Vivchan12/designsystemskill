# Forms

## Labels (3.3.2, 1.3.1, 4.1.2)

Every field has a **visible label tied to it in code**:

```html
<label for="temp">Temperature (°C)</label>
<input id="temp" inputmode="decimal" aria-describedby="temp-hint temp-error">
<p id="temp-hint">Probe the thickest part.</p>
```

- A label that only *sits near* the field (a `<label>` with no `for`, an eyebrow, a heading) is not tied: screen readers say "edit text". The audit finds these as **placeholder only** or **no name**.
- **A placeholder is not a label.** Browsers do use it as the accessible name when nothing else exists, so it isn't silent, but it disappears as soon as typing starts, is usually low contrast, and can't hold an error. Use it for an example ("e.g. 3.5"), not the question.
- Groups of radios or checkboxes: `<fieldset>` and `<legend>` (the question), each option with its own label.
- React Native: `accessibilityLabel`, or `aria-labelledby` pointing at the visible label's `nativeID`. Flutter: `InputDecoration(labelText:)`. Compose: `TextField(label = { Text(…) })`.
- The kit's `Field` (label + hint + error, wired up) makes this the default. The audit treats an input inside `<Field>` / `<label>` (configurable `labelWrappers`), or a kit input with a `label` prop, as labelled.

## Required fields

Say it in text ("required", or "*" explained once at the top), not only with
colour. `required` / `aria-required="true"` in code.

## Errors (3.3.1, 3.3.3)

When validation fails:

1. **Which field, in text**, next to the field: "Temperature: enter a number between −30 and 100".
2. **How to fix it**, when known (3.3.3): "Use the format 12:30", not "Invalid".
3. **Tied to the field**: `aria-invalid="true"` and `aria-describedby` pointing at the message (web); `accessibilityHint` or the label plus an announcement (React Native).
4. **Announced**, or focus moved to the first field in error on submit. For a form with several errors, a summary at the top with links to each field.
5. **Not only red**: an icon and the text (colour.md).
6. **Keep what was typed.** Never clear a form on error.

## Personal data (1.3.5)

`autocomplete` on fields about the user, so browsers and password managers fill
them and people with memory or motor difficulties type less:

| Field | `autocomplete` | React Native |
|---|---|---|
| Name | `name`, `given-name`, `family-name` | `autoComplete="name"`, iOS `textContentType="name"` |
| Email | `email` | `autoComplete="email"`, `keyboardType="email-address"` |
| Phone | `tel` | `autoComplete="tel"` |
| Address | `street-address`, `postal-code`, `country-name` | `autoComplete="postal-address"`… |
| Sign in | `username`, `current-password` | `autoComplete="password"`, `textContentType="password"` |
| New password | `new-password` | `textContentType="newPassword"` |
| One-time code | `one-time-code` | `textContentType="oneTimeCode"` |

## Signing in (3.3.8)

- **Allow paste and password managers.** No `onPaste` blocking, no `autocomplete="off"` on passwords, no splitting a code across boxes that refuse paste.
- No puzzle CAPTCHA, or memorised answers, without an alternative (email link, passkey, an object-recognition test).
- Passkeys and "email me a link" are the most accessible sign-in there is.

## Don't ask twice (3.3.7)

Within one process, information already entered is filled in or offered
("Same as delivery address"), unless re-entry is essential (confirming a new
password) or for security.

## Time limits (2.2.1)

A session timeout that loses work needs a warning with at least 20 seconds to
extend by a simple action, or a way to turn it off or set it 10× longer. Save
drafts so a timeout never loses what was typed.
