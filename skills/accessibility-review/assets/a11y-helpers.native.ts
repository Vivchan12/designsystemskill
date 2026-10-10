// Accessibility helpers for React Native / Expo. Part of the app: copy into
// src/a11y/ and use them from the kit, so every screen gets the same behaviour.
//
//   announce('Reading saved')               says it on VoiceOver and TalkBack (4.1.3)
//   const reduce = useReducedMotion()       true while Reduce Motion is on (2.3.3)
//   const sr = useScreenReader()            true while VoiceOver / TalkBack is on
//
// Why announce() and not only aria-live: live regions (aria-live,
// accessibilityLiveRegion) are Android-only in React Native. On iOS nothing is
// said unless the app calls announceForAccessibility.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Say a status message on both platforms. `queue` waits for current speech (iOS); errors shouldn't wait. */
export function announce(message: string, { queue = true }: { queue?: boolean } = {}) {
  if (!message) return;
  if (AccessibilityInfo.announceForAccessibilityWithOptions) AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue });
  else AccessibilityInfo.announceForAccessibility(message);
}

/** Reduce Motion (iOS) / Remove animations (Android), kept current while the app runs.
 *  Reanimated already follows it by default (ReduceMotion.System); use this for
 *  core Animated, LayoutAnimation, Lottie, auto-advancing carousels and parallax. */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduce(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

/** Whether a screen reader is on. For adapting, never for hiding things: everything must work either way. */
export function useScreenReader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then(v => { if (alive) setOn(v); });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => { alive = false; sub.remove(); };
  }, []);
  return on;
}
