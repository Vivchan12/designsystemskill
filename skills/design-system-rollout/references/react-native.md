# React Native (and Expo)

The process is the same: inventory, one decisions sheet, tokens, a kit, guards
with a ratchet, migrate in waves. What changes is where styling lives, how
tokens are written, and a handful of things only a phone has.

The scripts detect React Native from `package.json` (`react-native` or `expo`)
and say so at the top of every report. If a report says `Stack: tailwind` on
a native app, set `"stack": "react-native"` in the config before trusting any
number in it.

## Config

```json
{
  "srcDirs": ["src", "app"],
  "kitDir": "src/components/ui",
  "tokenModule": "src/theme/tokens.ts",
  "tokenMap": { "textStyles": "type", "space": "space", "radius": "radius", "colors": ["palette.day", "palette.night"] },
  "entries": ["src/navigation/RootNavigator.tsx"],
  "assetDirs": ["assets"],
  "writing": { "properNames": ["Product Name", "Character Name"] }
}
```

- `tokenModule`: the file that exports the tokens object. It loads on an ordinary Expo app: Node strips the TypeScript itself, and every package it imports (a hook, `react-native`, `expo-*`) is replaced by a stand-in, because only the plain values matter here. A relative import (`./useSettings`) is stood in too, and the report says so. If tokens really live in that other file, point `tokenModule` at it, or install esbuild so it gets bundled.
- `tokenMap`: where each family lives in that object. List `colors` once per theme, first theme first. The Claude Design export merges them by name, so `palette.day.ink` and `palette.night.ink` become one token, `ink`, with a light and a dark value.
- **The type scale**, whichever shape it has:
  - `textStyles`: styles with `fontSize` (and ideally `lineHeight`, `fontFamily`);
  - `fontSizes`: a plain size scale (`{ body: 15, title: 21 }`);
  - `fonts`: font names only (`{ serif: 'Serif-SemiBold' }`).

  If `type` holds only font names, the report says so. If the app has neither styles nor a scale, that is the first decision to make, not a reading error.
- **Navigation:**
  - **React Navigation:** the screens are imported by the navigator, so nothing is needed. List the navigator file itself (and `App.tsx`, if it isn't at the root) under `entries`, so it isn't reported as unused.
  - **expo-router:** files in `app/` are routes, and are recognised automatically when expo-router is installed (`routesDir` overrides the folder).
- `assetDirs`: where the art lives (default `assets`, `src/assets`).

## Tokens: a TypeScript object, read through a theme hook

There are no CSS custom properties. The tokens are an object, and screens
read them through one hook:

```ts
// src/theme/tokens.ts: the values, once
export const palette = { day: { ground: '#fdf6e3', ink: '#22313f' }, night: { ground: '#141a21', ink: '#eef1f4' } };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 20 };
export const type = { body: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter-Medium' }, … };

// src/theme/useTheme.ts: the ONLY way a screen gets colours
export const useTheme = () => palette[useColorScheme() === 'dark' ? 'night' : 'day'];
```

Rules that matter more on native:
- **Screens never read `palette.day` or `palette.night` directly.** A screen that does is stuck in one mode: it breaks dark mode, or a "night" palette chosen by time of day. It's the native version of a hardcoded hex; the inventory counts these, and the ratchet holds them (`directPalette`).
- **A text style always sets a `fontFamily`.** One without falls back to the system font on the device, and the inventory reports these.
- **Line heights are absolute numbers** in React Native, not multipliers. Store both size and line height per text style, and never one without the other.

## What the scripts read

| Script | On React Native |
|---|---|
| `inventory.mjs` | Every style object, inline (`style={{ fontSize: 14 }}`) or in `StyleSheet.create`, parsed properly, so a template string or a nested object doesn't cut a style short. It reports:<br>• literal values per family, and separately those already through a token;<br>• **control heights**, read from the styles of the touchables themselves and kept apart from pictures and bars;<br>• every colour literal (styles, icon props, constants, rgba), counted once;<br>• the phone checks: touchables under 44 without `hitSlop`, text scaling turned off and whether any maximum is set, screens handling safe areas themselves, and direct palette reads that bypass the theme hook;<br>• hand-built touchables, unlabelled ones, raw `<Text>` and the like, and text styles with no font family;<br>• the type scale the tokens define, tokens nothing uses, and files nothing imports;<br>• an **art inventory**: every image and animation by folder, its densities (flags missing @2x/@3x where the app uses them), pixel size and weight, and any that no file mentions. |
| `check-tokens.mjs` | A literal that equals a token (`padding: 16` is `space.md`), any hand-set `fontSize`, and a hand-set colour that is a theme colour. |
| `check-kit.mjs` | The ratchet, with native metrics: `rawFontSize`, `rawSpacing`, `rawRadius`, `rawColour`, `rawTouchable`, `unlabelledTouchable`, `rawText`, `smallTarget`, `directPalette`. |
| `check-writing.mjs` | The same rules. Proper names can sit under `writing.properNames`. |
| `export-tokens.mjs` | Reads `tokenModule`, not CSS. |
| `bundle-kit.mjs` | Builds the kit through `react-native-web` (Expo: `npx expo install react-native-web react-dom`). Without it, the component cards come from captures instead. |
| `audit-render.mjs` | Runs against the Expo web build (`npx expo export --platform web`, served locally), using a `screens` module (below), not routes. It also checks tap targets. |

## The render audit on a one-URL app

An Expo app usually has one URL and navigates in-app, so web `routes` reach
only the first screen. Give the audit a module that taps its way to each screen:

```js
// scripts/audit-screens.mjs
export default [
  { name: 'Today', go: async (page) => {} },   // the first screen
  { name: 'Nourish', go: async (page) => { await page.getByRole('tab', { name: 'Nourish' }).click(); } },
  { name: 'Profile', go: async (page) => { await page.getByRole('tab', { name: 'Profile' }).click(); } },
];
```

Point `audit.screens` at it, and point `audit.setup` at the sample-data
script from Phase 0 (onboarding completed, a believable profile).
`--width 390` is the default size to check. Anything tappable under 44×44 is
reported, and so is an unlabelled one.

The web build is a stand-in. Fonts, layout and colour match, but safe areas,
the keyboard, haptics and native navigation don't show. Check those on a
device or simulator at the end of each wave (below).

## Things only a phone has (add them to the decisions sheet)

| Decision | Propose |
|---|---|
| **Tap target** | 44×44 minimum (Apple) / 48dp (Android). Control heights from the inventory's height counts, usually 44 and 52. Use `hitSlop` to enlarge a small icon's target without changing the layout. |
| **Text scaling** | Users set larger text in the system. Decide the maximum: `maxFontSizeMultiplier` on the kit's text components (e.g. 1.6), never `allowFontScaling={false}` on body text. Test each screen at the largest setting. |
| **Safe areas** | One `Screen` component in the kit owns the safe-area insets (`react-native-safe-area-context`). Screens never pad for the notch themselves. |
| **Day and night** | Is night a system dark mode, a time-of-day palette, or both? Either way it comes through the theme hook. |
| **Accessibility** | Every kit touchable takes a required `label` when it has no visible text, plus a role. The ratchet's `unlabelledTouchable` count only goes down. |
| **Motion** | Durations and easing as tokens (`motion.quick = 150`). Respect reduced motion (`AccessibilityInfo.isReduceMotionEnabled`); the kit's animated components check it once. |

## Art, illustration and animation are part of the system

For a product whose look is its illustrations (an engraved style, a
character, a scene that changes over time), those assets are design-system parts as much
as the buttons are:

- **An asset inventory:** every illustration, frame and icon, with its size, where it's used, and its source file. List any that are missing at 2× or 3×.
- **Rules for use:** where art may appear, its sizes, what it sits on (which grounds), and what text may sit over it.
- **Animation as data:** frame sequences or Lottie files, each with a name, duration and loop rule, read through one component rather than set up per screen.
- **In Claude Design:** upload the art to the design system's assets, by group (Characters, Scenes, Icons), with a README per group saying how each is used.

## Clean up before migrating

The inventory's last two sections often save a wave of work:
- **Files nothing imports:** old components still on the old look. Check each one, then delete it rather than migrate it.
- **Tokens defined but never used:** either the screens hardcode the same value (migrate the screens), or the token is wrong (fix or drop it). Set the scale from the inventory's counts, not from the old token file.
- **Stale docs:** a design doc or agent instructions describing an old palette or a removed component pattern misleads every later session. Fix them in the first PR.

## Migration waves on native

The same five waves, with native names:

1. **Type:** raw `<Text>` with a hand-set `fontSize` → the kit's text components (`<Body>`, `<Title>`, `<Label>`).
2. **Controls:** hand-built `Pressable` / `TouchableOpacity` → `<Button>`, `<IconButton>`, `<Row>`, with labels and standard heights.
3. **Surfaces:** cards, sheets, modals → kit components; one `Screen` with safe areas.
4. **Layout:** literal padding, gap and radius → tokens; direct palette reads → the theme hook.
5. **Small parts and flows:** chips, progress, step-by-step flows (onboarding) onto the kit.

Onboarding is often built outside the kit because it was built first. It is
also the first thing every user sees, so migrate it early, not last.

After each wave, open the app on a device or simulator in light and dark, at
the largest text setting, and on the smallest phone the product supports.
