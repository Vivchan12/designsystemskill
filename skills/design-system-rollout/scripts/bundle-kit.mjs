#!/usr/bin/env node
// Bundle the component kit for a Claude Design system: ONE classic script that
// assigns window.<Namespace>, plus the app's stylesheet, so the system's
// component cards are the real kit rendered live, not look-alikes.
//
//   npm run build                                   # the stylesheet comes from the app's own build
//   node scripts/design/bundle-kit.mjs              # writes <out>/components/bundle.js, bundle.css, preview stubs
//   node scripts/design/bundle-kit.mjs --css dist/assets/index-abc.css --out /tmp/x
//
// Uses the project's own esbuild (every Vite project has it). Claude Design
// previews run React 18 from window.React, so react/react-dom imports are
// mapped onto those globals, and APIs that only exist in React 19 are flagged.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib.mjs';

const cfg = loadConfig();
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const cd = cfg.claudeDesign ?? {};
const kit = cd.kit ?? {};
const namespace = kit.namespace ?? (cd.name ?? 'Kit').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ?? '').toUpperCase()).replace(/^./, c => c.toUpperCase());
const out = resolve(cfg.root, arg('--out') ?? cd.out ?? 'claude-design');
const entry = kit.entry ?? ['index.ts', 'index.tsx', 'index.js'].map(f => join(cfg.kitDir, f)).find(f => existsSync(join(cfg.root, f)));
if (!entry) { console.error(`No kit entry found in ${cfg.kitDir}: set claudeDesign.kit.entry`); process.exit(1); }

const esbuildPath = join(cfg.root, 'node_modules/esbuild/lib/main.js');
if (!existsSync(esbuildPath)) { console.error('esbuild not found in node_modules: run npm install (or npm i -D esbuild)'); process.exit(1); }
const esbuild = (await import(pathToFileURL(esbuildPath).href)).default ?? (await import(pathToFileURL(esbuildPath).href));

// react, react-dom and their sub-paths → the page's React 18 globals.
const SHIMS = {
  'react': 'const R = window.React; export default R; export const { Children, Component, Fragment, PureComponent, StrictMode, Suspense, cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition } = R;',
  'react/jsx-runtime': 'const R = window.React; const j = (t, p, k) => R.createElement(t, k === undefined ? p : { ...p, key: k }); export const jsx = j, jsxs = j, jsxDEV = j, Fragment = R.Fragment;',
  'react-dom': 'const D = window.ReactDOM; export default D; export const { createPortal, flushSync } = D;',
  'react-dom/client': 'const D = window.ReactDOM; export default D; export const { createRoot, hydrateRoot } = D;',
};
SHIMS['react/jsx-dev-runtime'] = SHIMS['react/jsx-runtime'];
const shimPlugin = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, a => ({ path: a.path, namespace: 'react-globals' }));
    b.onLoad({ filter: /.*/, namespace: 'react-globals' }, a => ({ contents: SHIMS[a.path] ?? SHIMS[a.path.split('/')[0]], loader: 'js' }));
    // The kit's own stylesheet imports come from bundle.css instead.
    b.onResolve({ filter: /\.(css|scss)$/ }, () => ({ path: 'empty', namespace: 'empty-css' }));
    b.onLoad({ filter: /.*/, namespace: 'empty-css' }, () => ({ contents: '', loader: 'js' }));
  },
};

// The page sets data-theme="dark" on <html>; most apps switch on a class.
const darkClass = kit.darkClass ?? 'dark';
const banner = `(function(){var d=document.documentElement;function s(){d.classList.toggle(${JSON.stringify(darkClass)},d.getAttribute('data-theme')==='dark')}s();new MutationObserver(s).observe(d,{attributes:true,attributeFilter:['data-theme']})})();`;

const result = await esbuild.build({
  entryPoints: [join(cfg.root, entry)], bundle: true, write: false, format: 'iife', globalName: namespace,
  platform: 'browser', target: 'es2019', minify: kit.minify ?? true, metafile: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [shimPlugin], logLevel: 'silent',
}).catch(e => { console.error(e.message); process.exit(1); });

// An IIFE build doesn't list its exports; an ESM pass of the same entry does.
const esm = await esbuild.build({ entryPoints: [join(cfg.root, entry)], bundle: true, write: false, format: 'esm', metafile: true, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, plugins: [shimPlugin], logLevel: 'silent', outdir: 'x' });
const exportsList = Object.values(esm.metafile.outputs).find(o => o.entryPoint)?.exports ?? [];
const components = exportsList.filter(n => /^[A-Z][a-z]/.test(n));   // components, not CONSTANTS
const parts = new Set(kit.parts ?? []);   // shown inside a parent's card: no card of their own
let js = result.outputFiles[0].text.replace(/^var /, `window.${namespace} = `);
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace, components: components.map(name => ({ name })) })} */\n`;
const warnings = [];
if (/<\/script|<!--/i.test(js)) { js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3C!--'); warnings.push('the bundle contained "</script" or "<!--"; escaped it, check the strings it was in still read right'); }

// React 19-only APIs render nothing (or throw) on the page's React 18.
const R19 = [[/\buse\(\s*\w/, 'use()'], [/\buseActionState\b/, 'useActionState'], [/\buseOptimistic\b/, 'useOptimistic'], [/\buseFormStatus\b/, 'useFormStatus'], [/<(\w+Context)\s+value=/, '<Context value> as a provider (use <Context.Provider>)'], [/function\s+\w+\s*\(\s*\{[^}]*\bref\b[^}]*\}/, 'ref as a plain prop (use forwardRef)']];
for (const file of Object.keys(result.metafile.inputs).filter(f => !f.includes(':') && !f.startsWith('<') && !f.includes('node_modules') && existsSync(join(cfg.root, f)))) {
  const src = readFileSync(join(cfg.root, file), 'utf8');
  for (const [re, what] of R19) if (re.test(src)) warnings.push(`${file}: ${what} is React 19 only; the preview runs React 18`);
}

// The stylesheet: the app's own production CSS, so every class the kit uses exists.
let cssFile = arg('--css') ?? kit.css;
if (!cssFile) {
  const dir = join(cfg.root, 'dist/assets');
  const css = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.css')).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs) : [];
  cssFile = css[0];
}
mkdirSync(join(out, 'components'), { recursive: true });
writeFileSync(join(out, 'components/bundle.js'), header + banner + '\n' + js);
if (cssFile && existsSync(resolve(cfg.root, cssFile))) {
  const css = readFileSync(resolve(cfg.root, cssFile), 'utf8');
  if (/<\/style/i.test(css)) warnings.push('bundle.css contains "</style"; Claude Design inlines it, so remove that string');
  copyFileSync(resolve(cfg.root, cssFile), join(out, 'components/bundle.css'));
} else warnings.push('no stylesheet: run `npm run build` first, or pass --css <file>');

// A preview stub per component that has none yet. Each must then show the
// component's real states; the stub only gets the plumbing right.
const root = kit.previewRoot ?? '';
const stubs = [];
for (const name of components.filter(n => !parts.has(n))) {
  const f = join(out, 'components', name, 'preview.html');
  if (existsSync(f)) continue;
  mkdirSync(join(out, 'components', name), { recursive: true });
  writeFileSync(f, `<!-- @dsCard group="TODO" height=160 -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head>
<body>
<div id="root" class="${root}" style="min-height:160px;box-sizing:border-box"></div>
<script>
const { ${name} } = window.${namespace};
const h = React.createElement;
// TODO: replace with the component's real variants and states, side by side.
function Demo() { return h(${name}, null, '${name}'); }
ReactDOM.createRoot(document.getElementById('root')).render(h(Demo));
</script>
</body>
</html>
`);
  stubs.push(name);
}

console.log(`# Kit bundle → ${out}/components/\n`);
console.log(`window.${namespace}: ${components.length} components (${Math.round(js.length / 1024)} KB)${cssFile ? `; stylesheet from ${cssFile}` : ''}`);
console.log(`Theme switch: data-theme="dark" on the page → .${darkClass} on <html>`);
if (stubs.length) console.log(`\nPreview stubs written (fill in each one's real states, and its group): ${stubs.join(', ')}`);
if (warnings.length) console.log(`\n**Check:**\n${warnings.map(w => '- ' + w).join('\n')}`);
