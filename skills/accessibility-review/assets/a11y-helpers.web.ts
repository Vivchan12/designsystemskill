// Accessibility helpers for the web. Part of the app: copy into src/a11y/ and
// use them from the kit.
//
//   announce('Reading saved')                    polite: said when the screen reader is free (4.1.3)
//   announce('Temperature is out of range', 'assertive')   interrupts: errors only
//   prefersReducedMotion() / onReducedMotionChange(fn)      (2.3.3)
//
// Why one shared region: a live region only announces changes to content that
// was already in the page when the change happened. A region created together
// with its message is often silent. These two regions exist from the start.

let regions: { polite: HTMLElement; assertive: HTMLElement } | null = null;
function ensure() {
  if (regions || typeof document === 'undefined') return regions;
  const make = (live: 'polite' | 'assertive') => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', live);
    el.setAttribute('aria-atomic', 'true');
    if (live === 'assertive') el.setAttribute('role', 'alert'); else el.setAttribute('role', 'status');
    // Visually hidden, still read (the standard "sr-only" pattern).
    el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    document.body.appendChild(el);
    return el;
  };
  regions = { polite: make('polite'), assertive: make('assertive') };
  return regions;
}
if (typeof document !== 'undefined') (document.body ? ensure() : document.addEventListener('DOMContentLoaded', ensure));

export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  const r = ensure(); if (!r || !message) return;
  const el = r[politeness];
  el.textContent = '';
  // A tick between clearing and setting, so the same message twice is still announced.
  setTimeout(() => { el.textContent = message; }, 50);
}

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefersReducedMotion = () => !!query?.matches;
export function onReducedMotionChange(fn: (reduce: boolean) => void) {
  if (!query) return () => {};
  const h = (e: MediaQueryListEvent) => fn(e.matches);
  query.addEventListener('change', h);
  return () => query.removeEventListener('change', h);
}
