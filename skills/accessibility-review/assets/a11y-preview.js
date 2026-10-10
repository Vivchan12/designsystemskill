/*
 * a11y-preview: an accessibility review panel for the web. A review tool, not
 * part of the app: load it in development only, delete it when the review is
 * done (a11y-audit.mjs lists where it is loaded, and --strict fails if it
 * would ship).
 *
 *   // main.tsx
 *   if (import.meta.env.DEV) import('./dev/a11y-preview.js');
 *   // optional, for the axe-core button:  if (import.meta.env.DEV) import('axe-core').then(m => { window.axe = m.default; });
 *
 * What it shows, on the live page:
 *   Names         every control's accessible name as a screen reader would get it; red where there is none
 *   Tab order     the order Tab visits controls, numbered
 *   Contrast      text below 4.5:1 (3:1 for large text), with its ratio
 *   Colour vision the page as seen with protanopia, deuteranopia, tritanopia, or no colour at all:
 *                 if a status still reads, it isn't carried by colour alone (1.4.1)
 *   Headings      the outline a screen reader user jumps through
 *   Announcements what live regions (role="status"/"alert", aria-live) say, as it happens
 *   axe-core      a full rule run, when window.axe is available
 * It can't show what VoiceOver or TalkBack actually say: test with them too.
 * Alt+A shows or hides it. Uses system colours only, so token guards don't flag it.
 */
(() => {
  if (typeof window === 'undefined' || window.__a11yPreview) return;
  window.__a11yPreview = true;
  const KEY = 'a11y-preview';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  const state = { open: true, names: false, order: false, contrast: false, vision: 'none', ...load() };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  // ── Accessible name: a practical subset of the accname algorithm ──
  const textOf = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  function nameOf(el) {
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(textOf).join(' ').trim(); if (t) return { name: t, from: 'aria-labelledby' }; }
    const al = el.getAttribute('aria-label'); if (al && al.trim()) return { name: al.trim(), from: 'aria-label' };
    if (el.labels && el.labels.length) { const t = [...el.labels].map(textOf).join(' ').trim(); if (t) return { name: t, from: 'label' }; }
    if (el.tagName === 'IMG' || el.getAttribute('role') === 'img') { const a = el.getAttribute('alt'); if (a !== null) return { name: a, from: 'alt' }; }
    if (/^(button|a|summary)$/i.test(el.tagName) || /^(button|link|tab|menuitem|option|checkbox|radio|switch)$/.test(el.getAttribute('role') ?? '')) {
      // Content: text, plus alt text of images inside; aria-hidden content excluded.
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
      clone.querySelectorAll('img[alt]').forEach(n => n.replaceWith(n.getAttribute('alt')));
      clone.querySelectorAll('svg title').forEach(n => n.replaceWith(' ' + n.textContent + ' '));
      const t = clone.textContent.replace(/\s+/g, ' ').trim(); if (t) return { name: t, from: 'content' };
    }
    const title = el.getAttribute('title'); if (title) return { name: title, from: 'title' };
    const ph = el.getAttribute('placeholder'); if (ph) return { name: ph, from: 'placeholder (disappears when typing)' };
    if (el.type === 'submit' || el.type === 'button') { const v = el.value; if (v) return { name: v, from: 'value' }; }
    return { name: '', from: 'none' };
  }
  const roleOf = (el) => el.getAttribute('role') ?? ({ A: el.hasAttribute('href') ? 'link' : '', BUTTON: 'button', INPUT: ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', submit: 'button', button: 'button' })[el.type] ?? 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button' })[el.tagName] ?? '';
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const inPanel = (el) => el === host || host.contains(el);
  const controls = () => [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=menuitem],[tabindex]:not([tabindex="-1"])')].filter(el => !inPanel(el) && visible(el) && !el.closest('[aria-hidden="true"],[inert]'));
  const tabbable = () => controls().filter(el => el.tabIndex >= 0 && !el.disabled).sort((a, b) => (a.tabIndex || 1e6) - (b.tabIndex || 1e6));

  // ── Contrast (WCAG formula, composited) ──
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  function bgOf(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    return layers.reverse().reduce((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 });
  }
  function lowContrast() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (inPanel(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || !visible(el)) continue;
      if (el.closest('[disabled],[aria-disabled="true"],[aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el), bg = bgOf(el); if (!bg) continue;
      const fg = over(parse(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 }, bg);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
      const px = parseFloat(cs.fontSize), need = (px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700)) ? 3 : 4.5;
      if (ratio < need) out.push({ el, ratio, need });
    }
    return out;
  }

  // ── Panel ──
  const host = document.createElement('div');
  host.setAttribute('data-a11y-preview', '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .p { position: fixed; left: 12px; bottom: 12px; z-index: 2147483647; width: 320px; max-width: calc(100vw - 24px); max-height: 70vh; overflow: auto;
         font: 13px/1.4 system-ui, -apple-system, sans-serif; color-scheme: light dark; color: CanvasText; background: Canvas;
         border: 1px solid GrayText; border-radius: 10px; box-shadow: 0 6px 24px -8px GrayText; padding: 10px 12px; box-sizing: border-box; }
    .p.closed .body { display: none; }
    .top { display: flex; gap: 8px; align-items: center; } .top b { flex: 1; }
    button, select { font: inherit; font-size: 12px; border: 1px solid GrayText; background: ButtonFace; color: ButtonText; border-radius: 6px; padding: 3px 7px; cursor: pointer; }
    button.on { background: CanvasText; color: Canvas; }
    .row { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; align-items: center; }
    .lab { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-top: 10px; }   /* full text colour: GrayText is under 4.5:1 */
    ul { margin: 4px 0; padding-left: 16px; } li { margin: 2px 0; }
    .bad { font-weight: 700; } .bad::before { content: '✗ '; }   /* marked by a symbol, not colour alone */ .log { font-family: ui-monospace, monospace; font-size: 11px; max-height: 120px; overflow: auto; }
  </style>
  <div class="p" role="region" aria-label="Accessibility review">
    <div class="top"><b>Accessibility review</b><button data-act="toggle" title="Alt+A">–</button></div>
    <div class="body">
      <div class="row"><button data-k="names">Names</button><button data-k="order">Tab order</button><button data-k="contrast">Contrast</button>
        <select data-k="vision" aria-label="Colour vision"><option value="none">Full colour</option><option value="protanopia">Protanopia (red-blind)</option><option value="deuteranopia">Deuteranopia (green-blind)</option><option value="tritanopia">Tritanopia (blue-blind)</option><option value="achromatopsia">No colour</option></select></div>
      <div class="summary"></div>
      <div class="lab">Headings</div><ul class="headings"></ul>
      <div class="lab">Announcements (live regions, as they happen)</div><div class="log" aria-live="off"></div>
      <div class="row axe"></div>
      <div class="lab">Review tool: remove before release. Test with VoiceOver / TalkBack / a keyboard too.</div>
    </div>
  </div>`;
  const $ = (s) => shadow.querySelector(s);

  // Colour-vision filters (Machado et al. 2009 matrices, severity 1.0), applied to the page, not the panel.
  const MATRIX = {
    protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
    deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
    tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0';
  svg.innerHTML = Object.entries(MATRIX).map(([k, m]) => `<filter id="a11y-cv-${k}"><feColorMatrix type="matrix" values="${m}"/></filter>`).join('');

  const visionStyle = document.createElement('style');
  visionStyle.setAttribute('data-a11y-preview-layer', '');
  // Overlays live in their own layer so they never change the page's layout.
  const layer = document.createElement('div');
  layer.setAttribute('data-a11y-preview-layer', ''); layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none';
  const tag = (el, text, colour) => {
    const r = el.getBoundingClientRect(), t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${Math.max(0, r.top + scrollY - 16)}px;font:11px/1.3 system-ui,sans-serif;background:${colour};color:white;padding:1px 4px;border-radius:3px;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
    layer.append(t);
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;width:${r.width}px;height:${r.height}px;outline:2px solid ${colour};outline-offset:1px`;
    layer.append(box);
  };

  function render() {
    layer.textContent = '';
    const all = controls();
    const unnamed = all.filter(el => !nameOf(el).name);
    const placeholderOnly = all.filter(el => nameOf(el).from.startsWith('placeholder'));
    if (state.names) for (const el of all) { const n = nameOf(el); tag(el, n.name ? `${roleOf(el) || el.tagName.toLowerCase()}: ${n.name}` : `${roleOf(el) || el.tagName.toLowerCase()}: NO NAME`, n.name ? (n.from.startsWith('placeholder') ? 'saddlebrown' : 'darkgreen') : 'firebrick'); /* tag colours: all ≥ 4.5:1 with white */ }
    if (state.order) tabbable().forEach((el, i) => tag(el, String(i + 1), 'navy'));
    const low = state.contrast ? lowContrast() : [];
    for (const x of low) tag(x.el, `${(Math.floor(x.ratio * 100) / 100).toFixed(2)}:1 (needs ${x.need})`, 'darkmagenta');
    // The page's own content only: not the panel, not the overlay layer.
    visionStyle.textContent = state.vision === 'none' ? '' : `body > :not([data-a11y-preview]):not([data-a11y-preview-layer]) { filter: ${state.vision === 'achromatopsia' ? 'grayscale(1)' : `url(#a11y-cv-${state.vision})`} !important; }`;
    $('.summary').innerHTML = `<ul>
      <li class="${unnamed.length ? 'bad' : ''}">${unnamed.length} control(s) with no name${unnamed.length ? ' (4.1.2)' : ''}</li>
      <li>${placeholderOnly.length} named only by a placeholder</li>
      <li>${tabbable().length} Tab stops</li>
      ${state.contrast ? `<li class="${low.length ? 'bad' : ''}">${low.length} text element(s) below the contrast minimum</li>` : ''}
      <li>${document.getAnimations().filter(a => a.playState === 'running').length} animation(s) running now${matchMedia('(prefers-reduced-motion: reduce)').matches ? ' with Reduce Motion on' : ' (turn on Reduce Motion in DevTools › Rendering to check)'}</li>
    </ul>`;
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter(h => !inPanel(h) && visible(h));
    let prev = 0;
    $('.headings').innerHTML = hs.length ? hs.slice(0, 30).map(h => { const lvl = Number(h.getAttribute('aria-level') ?? h.tagName[1] ?? 2); const skip = prev && lvl > prev + 1; prev = lvl; return `<li class="${skip ? 'bad' : ''}" style="margin-left:${(lvl - 1) * 10}px">h${lvl} ${textOf(h).slice(0, 50).replace(/</g, '&lt;')}${skip ? ' (skips a level)' : ''}</li>`; }).join('') : '<li class="bad">No headings: screen-reader users can\'t jump through the page</li>';
    for (const b of shadow.querySelectorAll('[data-k]')) if (b.tagName === 'BUTTON') b.classList.toggle('on', !!state[b.dataset.k]);
    $('select[data-k=vision]').value = state.vision;
    $('.p').classList.toggle('closed', !state.open);
    $('[data-act=toggle]').textContent = state.open ? '–' : '+';
    $('.axe').innerHTML = window.axe ? '<button data-act="axe">Run axe-core</button><span class="axeout"></span>' : '';
    save();
  }

  // Live regions: log what they would announce.
  const log = (text, kind) => { const d = document.createElement('div'); d.textContent = `${new Date().toLocaleTimeString()} ${kind}: ${text.slice(0, 120)}`; $('.log').prepend(d); };
  const watch = new MutationObserver((list) => {
    for (const m of list) {
      const region = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest?.('[aria-live]:not([aria-live=off]),[role=status],[role=alert],[role=log]');
      if (!region || inPanel(region)) continue;
      const kind = region.getAttribute('role') === 'alert' || region.getAttribute('aria-live') === 'assertive' ? 'alert' : 'polite';
      const text = textOf(region); if (text) log(text, kind);
    }
  });

  shadow.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) state[b.dataset.k] = !state[b.dataset.k];
    if (b.dataset.act === 'toggle') state.open = !state.open;
    if (b.dataset.act === 'axe') {
      const out = $('.axeout'); out.textContent = ' running…';
      layer.style.display = 'none';   // overlays sit on top of text: axe would skip contrast it can't see behind them
      const res = await window.axe.run(document, { exclude: [['[data-a11y-preview]'], ['[data-a11y-preview-layer]']], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      layer.style.display = '';
      out.textContent = ` ${res.violations.length} rule(s) failing` + (res.violations.length ? ': ' + res.violations.map(v => `${v.id} (${v.nodes.length})`).join(', ') : '');
      console.table(res.violations.map(v => ({ rule: v.id, impact: v.impact, elements: v.nodes.length, help: v.help })));
      return;
    }
    render();
  });
  shadow.addEventListener('change', (e) => { if (e.target.dataset.k === 'vision') { state.vision = e.target.value; render(); } });
  window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyA') { state.open = !state.open; render(); } });
  let t; const rerender = () => { clearTimeout(t); t = setTimeout(render, 300); };
  addEventListener('resize', rerender); addEventListener('scroll', rerender, { passive: true });
  new MutationObserver((list) => { if (list.some(m => !inPanel(m.target) && !layer.contains(m.target) && m.target !== layer)) rerender(); }).observe(document.body, { childList: true, subtree: true, characterData: true });

  window.a11yPreview = { render, nameOf, lowContrast: () => lowContrast().map(x => ({ text: textOf(x.el).slice(0, 40), ratio: x.ratio })), set: (k, v) => { state[k] = v; render(); } };
  const mount = () => { document.head.append(visionStyle); document.body.append(svg, layer, host); watch.observe(document.body, { childList: true, subtree: true, characterData: true }); render(); };
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
})();
