/*
 * text-scale-preview: a review tool, not part of the app. Delete this file and
 * the one line that loads it when the review is done (the audit reminds you).
 *
 * A floating panel that sets the page's text size the way a user's setting
 * would (every iPhone and Android step, or a slider), and marks what goes
 * wrong at that size:
 *   red     text that doesn't grow (sized in px, or a fixed root size); at
 *           settings below 100%, text that falls below the floor instead
 *           (text held at the floor is the policy working, not a finding)
 *   orange  icons and images that stay the same size while the text grows
 *   purple  text that is cut off (clipped, or truncated with "…")
 *   blue    logos, avatars and badges stretched out of shape by the text beside them
 *   teal    what pushes the page sideways (the page scrolls horizontally)
 *
 * A deliberate clamp (a one-line preview, a teaser) is not "cut off": mark it
 * data-text-clamp. The panel uses system colours only, so a project's token
 * guard has nothing to flag; still, keep it in src/dev/ and exempt that folder.
 *
 * Load it in development only, e.g. in main.tsx:
 *   if (import.meta.env.DEV) import('./text-scale-preview.js');
 * or with a script tag in index.html while you review.
 *
 * It sets the root font size, which is what the browser's text-size setting
 * changes, so rem-based sizes and the generated --text-* / --icon-* clamps
 * respond exactly as they would for a user. It assumes your own browser is
 * at its default text size. Shortcut: Alt+T shows or hides the panel.
 */
(() => {
  if (typeof window === 'undefined' || window.__textScalePreview) return;
  window.__textScalePreview = true;

  const SETTINGS = [
    ['iPhone', 'xS', 14 / 17], ['iPhone', 'S', 15 / 17], ['iPhone', 'M', 16 / 17], ['iPhone', 'L (default)', 1],
    ['iPhone', 'xL', 19 / 17], ['iPhone', 'xxL', 21 / 17], ['iPhone', 'xxxL', 23 / 17],
    ['iPhone', 'AX1', 28 / 17], ['iPhone', 'AX2', 33 / 17], ['iPhone', 'AX3', 40 / 17], ['iPhone', 'AX4', 47 / 17], ['iPhone', 'AX5', 53 / 17],
    ['Android', 'Small', 0.85], ['Android', 'Default', 1], ['Android', 'Large', 1.15], ['Android', 'Largest', 1.3],
    ['Android', '150%', 1.5], ['Android', '180%', 1.8], ['Android', '200%', 2],
  ];
  const KEY = 'text-scale-preview';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const state = { scale: 1, marks: true, open: true, ...load() };
  const root = document.documentElement;
  const originalRoot = root.style.fontSize;

  // ── The panel, in a shadow root with px sizes so the page's scaling can't reach it ──
  const host = document.createElement('div');
  host.setAttribute('data-text-scale-preview', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const C = { text: 'crimson', icon: 'darkorange', cut: 'darkorchid', shape: 'dodgerblue', wide: 'darkcyan' };
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .p { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; width: 300px; max-width: calc(100vw - 24px);
         font: 13px/1.4 system-ui, -apple-system, sans-serif; color-scheme: light dark; color: CanvasText; background: Canvas;
         border: 1px solid GrayText; border-radius: 10px; box-shadow: 0 6px 24px -8px GrayText; padding: 10px 12px; box-sizing: border-box; }
    .p.closed .body { display: none; }
    .top { display: flex; align-items: center; gap: 8px; }
    .top b { flex: 1; font-size: 13px; }
    .big { font-size: 20px; font-weight: 700; min-width: 56px; text-align: right; }
    button { font: inherit; font-size: 12px; border: 1px solid GrayText; background: ButtonFace; border-radius: 6px; padding: 3px 7px; cursor: pointer; color: ButtonText; }
    button.on { background: CanvasText; color: Canvas; border-color: CanvasText; }
    .row { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
    .lab { font-size: 11px; font-weight: 600; margin-top: 8px; }   /* full text colour: GrayText is under 4.5:1 */
    input[type=range] { width: 100%; }
    .key { display: grid; grid-template-columns: 12px 1fr auto; gap: 4px 6px; align-items: center; font-size: 12px; margin-top: 8px; }
    .sw { width: 10px; height: 10px; border-radius: 2px; }
    .note { font-size: 11px; margin-top: 8px; }
  </style>
  <div class="p">
    <div class="top"><b>Text size review</b><span class="big"></span><button data-act="toggle" title="Alt+T">–</button></div>
    <div class="body">
      <div class="lab">iPhone</div><div class="row" data-group="iPhone"></div>
      <div class="lab">Android</div><div class="row" data-group="Android"></div>
      <div class="lab">Any size</div><input type="range" min="50" max="320" step="5" aria-label="Text size, percent">
      <div class="row"><button data-act="marks">Mark problems</button><button data-act="check">Re-check</button><button data-act="reset">Reset</button></div>
      <div class="key">
        <span class="sw" style="background:${C.text}"></span><span data-label="text">Text that doesn't grow</span><span data-n="text">–</span>
        <span class="sw" style="background:${C.icon}"></span><span>Icons that don't grow</span><span data-n="icon">–</span>
        <span class="sw" style="background:${C.cut}"></span><span>Text cut off</span><span data-n="cut">–</span>
        <span class="sw" style="background:${C.shape}"></span><span>Shapes stretched</span><span data-n="shape">–</span>
        <span class="sw" style="background:${C.wide}"></span><span>Pushes the page sideways</span><span data-n="wide">–</span>
      </div>
      <div class="note">Review tool: remove before release. Hover a mark to see its sizes.</div>
    </div>
  </div>`;
  const $ = (s) => shadow.querySelector(s);
  for (const [platform, name, scale] of SETTINGS) {
    const b = document.createElement('button');
    b.textContent = name; b.dataset.scale = String(scale); b.title = `${platform} ${name}: ${Math.round(scale * 100)}%`;
    $(`[data-group="${platform}"]`).append(b);
  }

  // ── Measuring ──
  const inPanel = (el) => el === host || host.contains(el);
  const textEls = () => [...document.body.querySelectorAll('*')].filter(el => !inPanel(el) && !/^(SCRIPT|STYLE|NOSCRIPT|svg|SVG)$/.test(el.tagName) && !el.closest('svg') &&
    [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  const iconEls = () => [...document.body.querySelectorAll('svg, img')].filter(el => {
    if (inPanel(el) || (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg'))) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.width <= 64 && r.height <= 64;
  });
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // Small boxes with no text of their own (logo tiles, avatars, dots): their shape should hold.
  const shapeEls = () => [...document.body.querySelectorAll('div, span, i, a, figure, picture')].filter(el => {
    if (inPanel(el) || el.textContent.trim() || el.querySelector('div, p, span:not(:empty)')) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8 && r.width <= 96 && r.height <= 96;
  });
  const measure = () => ({
    shape: new Map(shapeEls().map(el => { const r = el.getBoundingClientRect(); return [el, r.width / r.height]; })),
    text: new Map(textEls().filter(visible).map(el => [el, parseFloat(getComputedStyle(el).fontSize)])),
    icon: new Map(iconEls().map(el => [el, el.getBoundingClientRect().width])),
  });
  const setRoot = (s) => { root.style.fontSize = s === 1 && !originalRoot ? '' : `${s * 100}%`; };

  let marked = [];
  const clearMarks = () => { for (const { el, outline, offset, title } of marked) { el.style.outline = outline; el.style.outlineOffset = offset; if (title === null) el.removeAttribute('title'); else el.title = title; } marked = []; };
  const mark = (el, colour, note) => {
    if (marked.some(m => m.el === el)) return;
    marked.push({ el, outline: el.style.outline, offset: el.style.outlineOffset, title: el.getAttribute('title') });
    el.style.outline = `2px dashed ${colour}`; el.style.outlineOffset = '1px'; el.title = `[text size review] ${note}`;
  };

  function check() {
    clearMarks();
    const counts = { text: 0, icon: 0, cut: 0, shape: 0, wide: 0 };
    const s = state.scale;
    // Baseline at the default size, then the chosen size: same elements, same frame.
    setRoot(1); const base = measure();
    setRoot(s); const now = measure();
    const floor = parseFloat(getComputedStyle(root).getPropertyValue('--text-scale-floor')) || 12;
    $('[data-label="text"]').textContent = s < 0.96 ? `Text below the ${floor}px floor` : "Text that doesn't grow";
    if (s < 0.96) {
      // Smaller settings: text held at its floor is the policy working. Only text under the floor is a finding.
      for (const [el, size] of now.text) if (size < floor - 0.25) { counts.text++; if (state.marks) mark(el, C.text, `text ${size}px is below the ${floor}px floor at ${Math.round(s * 100)}%`); }
    }
    if (s > 1.04) {
      for (const [el, size] of now.text) {
        const b = base.text.get(el); if (!b) continue;
        // Grew with the setting at all? A capped heading still moves; a px size doesn't.
        if (size - b < 0.5) { counts.text++; if (state.marks) mark(el, C.text, `text stays ${b}px at ${Math.round(s * 100)}%`); }
      }
      for (const [el, w] of now.icon) {
        const b = base.icon.get(el); if (!b) continue;
        if (w - b < 0.5) { counts.icon++; if (state.marks) mark(el, C.icon, `icon stays ${Math.round(b)}px at ${Math.round(s * 100)}%`); }
      }
    }
    for (const [el, ratio] of now.shape) {
      const b = base.shape.get(el); if (!b) continue;
      const change = ratio > b ? ratio / b : b / ratio;
      if (change > 1.25) { counts.shape++; if (state.marks) mark(el, C.shape, `shape changed from ${b.toFixed(2)}:1 to ${ratio.toFixed(2)}:1 (width:height) at ${Math.round(s * 100)}%`); }
    }
    for (const el of now.text.keys()) {
      if (el.closest('[data-text-clamp]')) continue;   // a deliberate clamp
      const cs = getComputedStyle(el);
      const hidesX = /hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis';
      const hidesY = /hidden|clip/.test(cs.overflowY) || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp;
      if ((hidesX && el.scrollWidth > el.clientWidth + 1) || (hidesY && el.scrollHeight > el.clientHeight + 1)) {
        counts.cut++; if (state.marks) mark(el, C.cut, `text cut off at ${Math.round(s * 100)}%`);
      }
    }
    // Sideways scrolling: mark the box that can't hold its contents, i.e. the
    // parent of whatever sticks out past the screen edge (one mark per box).
    // Inside a container that scrolls sideways on purpose is fine.
    counts.wide = 0;
    if (root.scrollWidth > innerWidth + 1) {
      const vw = innerWidth + 1, boxes = new Map();
      const scrollsX = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true; return false; };
      for (const el of document.body.querySelectorAll('*')) {
        if (inPanel(el) || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) continue;
        const r = el.getBoundingClientRect();
        if (r.right <= vw || r.width === 0 || scrollsX(el) || getComputedStyle(el).position === 'fixed') continue;
        const parent = el.parentElement;
        if (parent && parent !== document.body && parent.getBoundingClientRect().right > vw) continue;   // its parent already sticks out
        const box = parent && parent !== document.body && parent !== document.documentElement ? parent : el;
        boxes.set(box, Math.max(boxes.get(box) ?? 0, r.right - innerWidth));
      }
      for (const [box, past] of boxes) { counts.wide++; if (state.marks) mark(box, C.wide, `contents run ${Math.round(past)}px past the screen edge at ${Math.round(s * 100)}%: the page scrolls sideways (try min-w-0, flex-wrap, or max-width: 100%)`); }
    }
    // "–": the check doesn't apply at this size (nothing to compare at 100%; icons only grow).
    const na = { text: Math.abs(s - 1) <= 0.04, icon: s <= 1.04 };
    for (const k of Object.keys(counts)) $(`[data-n="${k}"]`).textContent = na[k] ? '–' : counts[k];
    window.__textScalePreviewCounts = counts;   // for scripted screenshots
    return counts;
  }

  function apply() {
    setRoot(state.scale);
    $('.big').textContent = `${Math.round(state.scale * 100)}%`;
    $('input[type=range]').value = String(Math.round(state.scale * 100));
    for (const b of shadow.querySelectorAll('[data-scale]')) b.classList.toggle('on', Math.abs(Number(b.dataset.scale) - state.scale) < 0.005);
    $('[data-act="marks"]').classList.toggle('on', state.marks);
    $('.p').classList.toggle('closed', !state.open);
    $('[data-act="toggle"]').textContent = state.open ? '–' : '+';
    save();
    requestAnimationFrame(() => requestAnimationFrame(check));
  }

  shadow.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.scale) state.scale = Number(b.dataset.scale);
    else if (b.dataset.act === 'marks') state.marks = !state.marks;
    else if (b.dataset.act === 'toggle') state.open = !state.open;
    else if (b.dataset.act === 'reset') state.scale = 1;
    apply();
  });
  $('input[type=range]').addEventListener('input', (e) => { state.scale = Number(e.target.value) / 100; apply(); });
  window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyT') { state.open = !state.open; apply(); } });
  // Screens change as you navigate: re-check after the page settles.
  let t; new MutationObserver((list) => {
    if (list.every(m => inPanel(m.target) || m.attributeName === 'style' || m.attributeName === 'title')) return;
    clearTimeout(t); t = setTimeout(check, 400);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  window.textScalePreview = { set: (s) => { state.scale = s; apply(); }, check, settings: SETTINGS };
  const mount = () => { document.body.append(host); apply(); };
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
})();
