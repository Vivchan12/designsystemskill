# Motion

Movement on screen can cause dizziness, nausea and headaches for people with
vestibular disorders, and distracts people with attention difficulties. Both
platforms have a setting for it, and the web exposes it as
`prefers-reduced-motion`.

| | WCAG | What |
|---|---|---|
| Reduce Motion | 2.3.3 (AAA); Apple HIG | Motion triggered by interaction can be turned off. With the setting on: no sliding, zooming, parallax, bouncing. Fades and colour changes are fine. |
| Autoplay | 2.2.2 (A) | Anything that moves, blinks, scrolls or auto-updates by itself for more than 5 seconds beside other content can be paused, stopped or hidden. |
| Flashing | 2.3.1 (A) | Nothing flashes more than 3 times in a second. No tool here measures it: check video, animation, and alert effects by eye. |

## What to turn off, what to keep

- **Off**: slide-in and slide-out transitions, page flips, parallax, zoom-on-hover, bouncing and pulsing attention-grabbers, auto-advancing carousels, scroll-linked effects, smooth scrolling.
- **Keep, maybe as a fade**: a progress indicator or spinner while something loads (essential: mark it `data-motion="essential"` on the web), opacity changes, a state change that needs a transition to be understood (replace a slide with a fade).

## Web

Import `assets/reduced-motion.css` once. It ends animations and transitions
instantly with the setting on, and turns smooth scrolling off; elements
marked `data-motion="essential"` keep theirs. Tailwind: `motion-safe:animate-…`
for motion that should only run when it's welcome.

Libraries don't follow the setting by themselves:

| Library | Default | Do |
|---|---|---|
| Motion / framer-motion | `reducedMotion: "never"` | `<MotionConfig reducedMotion="user">` at the root: transforms and layout animations stop, opacity stays |
| GSAP | ignores it | `gsap.matchMedia()` with `(prefers-reduced-motion: reduce)` |
| Lottie | plays | don't autoplay, or show the last frame, when `prefersReducedMotion()` |
| CSS keyframes | play | covered by reduced-motion.css |

## React Native

| | Default | Do |
|---|---|---|
| Reanimated (3 and 4) | follows the setting: animations default to `ReduceMotion.System` | nothing; avoid `ReduceMotion.Never` except for essential motion |
| Core `Animated`, `LayoutAnimation` | ignore it | `useReducedMotion()` (assets/a11y-helpers.native.ts): skip the animation or set the end value directly |
| Lottie (`lottie-react-native`) | plays | `autoPlay={!reduce}` and show a still frame |
| Moti | via Reanimated | check the version follows Reanimated's setting |

On Android, `reduceMotionChanged` is also true when "Transition animation
scale" is off in developer options.

## Flutter, SwiftUI

- Flutter: `MediaQuery.disableAnimationsOf(context)`; skip or shorten animations when true.
- SwiftUI: `@Environment(\.accessibilityReduceMotion) var reduceMotion`; `withAnimation(reduceMotion ? nil : .spring())`. UIKit: `UIAccessibility.isReduceMotionEnabled`.

## Checking it

- Turn the setting on: iOS Settings › Accessibility › Motion › Reduce Motion; Android Settings › Accessibility › Remove animations; macOS System Settings › Accessibility › Display › Reduce motion; Chrome DevTools › Rendering › Emulate CSS media feature prefers-reduced-motion.
- `a11y-render.mjs` loads each route with the setting on and lists anything still moving.
- The audit finds motion defined without any reduce-motion handling in the project: CSS keyframes that move things, Tailwind `animate-bounce`/`animate-ping`, framer-motion without `reducedMotion="user"`, core Animated, GSAP, Lottie.
