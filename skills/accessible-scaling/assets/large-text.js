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
 * Load it once, early:            import './theme/large-text.js';
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
  const update = () => {
    const scale = probe.getBoundingClientRect().width / 16;
    if (!scale) return;
    const root = document.documentElement;
    const value = scale >= THRESHOLD - 0.001 ? 'large' : 'normal';
    if (root.dataset.textScale !== value) root.dataset.textScale = value;
    root.style.setProperty('--text-scale', String(Math.round(scale * 100) / 100));
  };
  const start = () => { document.body.append(probe); update(); new ResizeObserver(update).observe(probe); };
  document.body ? start() : document.addEventListener('DOMContentLoaded', start);
})();
