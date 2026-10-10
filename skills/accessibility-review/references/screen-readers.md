# Screen readers: names, roles, states, announcements

A screen reader says, for each thing the user moves to, its **name** ("Delete
reading"), its **role** ("button"), and its **state** ("checked", "selected",
"expanded"). It also says **status messages** ("Reading saved") when the app
announces them. WCAG 4.1.2, 1.1.1, 1.3.1 and 4.1.3. Most real failures are one
of these four missing.

## The rules, on every platform

1. **Every control has a name.** Visible text is the best name. An icon-only control needs a label that says what it *does* ("Delete reading", not "Trash icon" or "Button").
2. **Use the platform's own control** (a `<button>`, a `Pressable` with a role, a SwiftUI `Button`). A clickable box is not a button to a screen reader.
3. **Say the state.** Checkboxes, switches, tabs, expandable sections, selected chips.
4. **Decoration is hidden.** An icon next to a word that says the same is noise: hide it.
5. **Headings are headings.** Screen-reader users move through a screen by headings; a title that only looks big isn't one.
6. **Messages are announced.** Errors, "saved", "3 results", loading finished: announced without moving focus.
7. **Group what belongs together.** A card with a title, a value and a date is one stop, read as one sentence, not three.
8. **Hide what's behind a modal.** Otherwise swiping moves into the page underneath.

## Web

```html
<!-- 1, 2: a real button with a name; the icon hidden -->
<button type="button" aria-label="Delete reading"><svg aria-hidden="true">…</svg></button>
<!-- or visible text that's visually hidden -->
<button type="button"><svg aria-hidden="true">…</svg><span class="sr-only">Delete reading</span></button>

<!-- 3: state -->
<button aria-pressed="true">Bold</button>
<button aria-expanded="false" aria-controls="filters">Filters</button>
<a href="/today" aria-current="page">Today</a>          <!-- the current nav item: not by colour alone -->

<!-- images: describe the information, or hide decoration -->
<img src="chart.png" alt="Fridge temperature this week, between 2 and 4°C">
<img src="divider.png" alt="">
```

- **Live regions must exist before the message.** A region added together with its text is often silent. Keep one polite and one assertive region on the page from the start and put messages into them: `assets/a11y-helpers.web.ts` `announce()`. `role="status"` is polite; `role="alert"` interrupts, so use it for errors only.
- **Landmarks**: `<header>`, `<nav>`, `<main>` (one), `<footer>`; a skip link to `<main>` for keyboard users (2.4.1).
- **Prefer HTML to ARIA.** `<button>` over `<div role="button" tabindex="0" onkeydown=…>`. A wrong ARIA role is worse than none.
- **`aria-hidden="true"` never on anything focusable**: it hides it from the screen reader while the keyboard can still reach it.
- **The page title** changes with the screen (2.4.2); `<html lang>` is set (3.1.1).

## React Native

```tsx
<Pressable
  onPress={remove}
  accessibilityRole="button"                 // or role="button"
  accessibilityLabel="Delete reading"        // or aria-label
  accessibilityHint="Removes it from today's log"   // optional: what happens, if not obvious
  hitSlop={8}
>
  <Ionicons name="trash" size={20} accessible={false} />
</Pressable>

<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} onPress={toggle}>…</Pressable>
<Text accessibilityRole="header">Today</Text>

// A card read as one item: accessible groups the children into one stop
<View accessible accessibilityLabel={`${name}, ${temp} degrees, ${time}`}>…</View>
```

- **Pressable and Touchable\* have no role by default.** Without `accessibilityRole="button"` VoiceOver reads the text but not that it's a button. Set it once in the kit's Button.
- **Announcements: live regions are Android-only.** `accessibilityLiveRegion` / `aria-live` do nothing on iOS. Call `AccessibilityInfo.announceForAccessibility(message)` (works on both): `assets/a11y-helpers.native.ts` `announce()`. The audit fails a project that uses live regions without it.
- **Modals**: RN's `<Modal>` handles it. A custom overlay needs `aria-modal` / `accessibilityViewIsModal` (iOS) and `importantForAccessibility="no-hide-descendants"` on what's behind (Android).
- **Reading order** follows the view tree. If the visual order differs (absolute positioning), fix the tree; `experimental_accessibilityOrder` exists but is experimental.
- **Placeholders** are read, but disappear while typing: give fields a label.
- `eslint-plugin-react-native-a11y` checks prop values; it covers `Touchable*`, not `Pressable`. The audit covers `Pressable`.

## Flutter

```dart
IconButton(icon: const Icon(Icons.delete), tooltip: 'Delete reading', onPressed: remove)   // tooltip is the label
Semantics(button: true, label: 'Open reading', child: GestureDetector(onTap: open, child: card))
Image.asset('chart.png', semanticLabel: 'Temperature this week, 2 to 4°C')
Image.asset('divider.png', excludeFromSemantics: true)
Semantics(header: true, child: Text('Today'))
MergeSemantics(child: Row(children: [Text(name), Text('$temp°C')]))   // one stop
SemanticsService.announce('Reading saved', TextDirection.ltr);       // or Semantics(liveRegion: true)
```

`GestureDetector` has no semantics: prefer `InkWell` or a Button widget, or wrap it in `Semantics`.

## Android (Views and Compose)

- `android:contentDescription` on `ImageView`/`ImageButton`; `importantForAccessibility="no"` for decoration. Compose: `Icon(…, contentDescription = stringResource(…))`, `null` only for decoration next to text.
- Headings: `android:accessibilityHeading="true"`; Compose `Modifier.semantics { heading() }`.
- Labels for fields: `android:labelFor`, or a `TextInputLayout` hint.
- Announcements: `android:accessibilityLiveRegion="polite"`; Compose `Modifier.semantics { liveRegion = LiveRegionMode.Polite }`.
- Group: `Modifier.semantics(mergeDescendants = true)`.

## SwiftUI / UIKit

- `.accessibilityLabel("Delete reading")`; better, `Label("Delete reading", systemImage: "trash")`, which names the button and still shows only the icon with `.labelStyle(.iconOnly)`.
- Headings: `.accessibilityAddTraits(.isHeader)`.
- Group: `.accessibilityElement(children: .combine)`.
- Announcements: `AccessibilityNotification.Announcement("Reading saved").post()` (iOS 17+), or `UIAccessibility.post(notification: .announcement, argument: "Reading saved")`.
- Decoration: `.accessibilityHidden(true)`.

## Writing names

- Say what it does or where it goes, in the words on screen: "Add reading", "Fridge 2, 3 degrees".
- Don't repeat the role ("Delete button" is read as "Delete button, button").
- Unique where it matters: ten "Edit" buttons in a list need "Edit Fridge 2".
- Keep the visible text inside the name (2.5.3 Label in Name): voice-control users say what they see.
