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
//
// Why a buffer and an invisible marker: a screen reader announces a live
// region when its content changes. Two messages written within a few
// milliseconds overwrite each other, so the first is never read; the same
// message written twice ("Saved", then "Saved" again) is not a change, so the
// second is never read. announce() collects the messages that arrive within
// BUFFER_MS of each other and writes them once, joined; and when the text is
// the same as the last one written, it adds a zero-width space, which screen
// readers don't pronounce but which makes the content different.

const BUFFER_MS = 150;
const INVISIBLE = '\u200B';
type Politeness = 'polite' | 'assertive';
type Region = { el: HTMLElement; pending: string[]; timer: ReturnType<typeof setTimeout> | null; last: string; flips: number };

let regions: Record<Politeness, Region> | null = null;
const early: [string, Politeness][] = [];   // announced before <body> existed: said once it does
function ensure() {
  if (regions || typeof document === 'undefined' || !document.body) return regions;
  const make = (live: Politeness): Region => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', live);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', live === 'assertive' ? 'alert' : 'status');
    // Visually hidden, still read (the standard "sr-only" pattern).
    el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    document.body.appendChild(el);
    return { el, pending: [], timer: null, last: '', flips: 0 };
  };
  regions = { polite: make('polite'), assertive: make('assertive') };
  for (const [m, pol] of early.splice(0)) announce(m, pol);
  return regions;
}
if (typeof document !== 'undefined') (document.body ? ensure() : document.addEventListener('DOMContentLoaded', ensure));

function flush(r: Region) {
  r.timer = null;
  if (!r.pending.length) return;
  // One sentence per message, each once, in the order they came.
  const text = r.pending.filter((m, i, all) => all.indexOf(m) === i).join('. ');
  r.pending = [];
  // Same text as last time: make it differ invisibly, alternating one and two marks.
  const write = text === r.last ? text + INVISIBLE.repeat(1 + (r.flips++ % 2)) : text;
  r.last = text;
  r.el.textContent = write;
}

/** Say a status message. Messages within BUFFER_MS are joined into one announcement; a repeat is still said. */
export function announce(message: string, politeness: Politeness = 'polite') {
  if (!message || !message.trim()) return;
  const all = ensure();
  if (!all) { if (typeof document !== 'undefined') early.push([message, politeness]); return; }
  const r = all[politeness];
  r.pending.push(message.trim().replace(/[.\s]+$/, ''));
  if (r.timer) clearTimeout(r.timer);
  r.timer = setTimeout(() => flush(r), BUFFER_MS);
}

/** Write anything waiting now (tests, or before navigating away). */
export function flushAnnouncements() {
  if (!regions) return;
  for (const r of Object.values(regions)) { if (r.timer) clearTimeout(r.timer); flush(r); }
}

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefersReducedMotion = () => !!query?.matches;
export function onReducedMotionChange(fn: (reduce: boolean) => void) {
  if (!query) return () => {};
  const h = (e: MediaQueryListEvent) => fn(e.matches);
  query.addEventListener('change', h);
  return () => query.removeEventListener('change', h);
}
