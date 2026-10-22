/*
 * large-text: the web "large text" switch. Part of the app (unlike the review
 * tool), so it stays.
 *
 * Sets data-text-scale="large" on <html> while the browser's text size is at
 * or above the threshold (150% of 16px by default), and "normal" otherwise,
 * and keeps it current as the setting changes. It measures a hidden 1rem
 * probe with a ResizeObserver, so it follows the browser setting, a root
 * font-size change, and the review tool alike. It also sets --text-scale (the
 * current ratio) for anything that needs the number.
 *
 * Load it once, as early as possible.
 *
 *   Client-rendered app (Vite, CRA):  import './theme/large-text.js';  in the entry file.
 *
 *   Server-rendered app (Next.js, Remix, Nuxt, SvelteKit, Astro): run it
 *   SYNCHRONOUSLY in <head>, after the stylesheets, as a classic script (no
 *   async, no defer, not type="module"). Otherwise the server's HTML is painted
 *   at the normal layout and jumps to the large one when the bundle loads.
 *   It sets the attribute straight away from the root font size, before
 *   <body> exists. Next.js (App Router), app/layout.tsx:
 *
 *     import { readFileSync } from 'node:fs';
 *     const largeText = readFileSync(process.cwd() + '/src/theme/large-text.js', 'utf8');
 *     <html lang="en" suppressHydrationWarning>
 *       <head><script dangerouslySetInnerHTML={{ __html: largeText }} /></head>
 *
 *   suppressHydrationWarning: the script adds data-text-scale to <html> before
 *   React hydrates, which React would otherwise report as a mismatch (the same
 *   pattern as a dark-mode script). Elsewhere: paste it into the head of the
 *   document template (index.html, app.html, root.tsx), or serve it from
 *   /public with a plain <script src="/large-text.js"></script> in <head>.
 *
 * Tailwind: add the variant, keyed on ANY ancestor (not only <html>), so a
 * captured board or a test can carry it on a wrapper:
 *
 *   // tailwind.config.js
 *   const plugin = require('tailwindcss/plugin');
 *   plugins: [plugin(({ addVariant }) => addVariant('large-text', '[data-text-scale="large"] &'))]
 *
 *   <div className="p-6 large-text:p-4 flex large-text:flex-col">…</div>
 *
 * Plain CSS: [data-text-scale="large"] .row { flex-direction: column; }
 */
(() => {
  if (typeof window === 'undefined' || window.__largeText) return;
  window.__largeText = true;
  const THRESHOLD = Number(document.documentElement.dataset.largeTextAt) || 1.5;   // <html data-large-text-at="1.4"> to change it
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:1rem;height:0;overflow:hidden;top:0;left:0';
  const root = document.documentElement;
  const apply = (scale) => {
    const value = scale >= THRESHOLD - 0.001 ? 'large' : 'normal';
    if (root.dataset.textScale !== value) root.dataset.textScale = value;
    root.style.setProperty('--text-scale', String(Math.round(scale * 100) / 100));
  };
  // Straight away, before <body> exists: the root font size is the browser's
  // text-size setting (and any root size the stylesheets above set). This is
  // what stops the flash on server-rendered pages.
  const rootSize = parseFloat(getComputedStyle(root).fontSize);
  if (rootSize) apply(rootSize / 16);
  // Then keep it current: the probe measures 1rem, and a ResizeObserver fires
  // when the setting, a root font-size change, or the review tool changes it.
  const update = () => { const w = probe.getBoundingClientRect().width; if (w) apply(w / 16); };
  const start = () => { document.body.append(probe); update(); new ResizeObserver(update).observe(probe); };
  document.body ? start() : document.addEventListener('DOMContentLoaded', start);
})();
