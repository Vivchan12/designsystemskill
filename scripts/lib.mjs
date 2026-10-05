// Shared by every script in this skill: find the project, read its config,
// and walk its source files. No dependencies beyond Node 18+.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';

export const DEFAULTS = {
  // Where screens live. Directories are walked recursively (a sweep is only
  // as wide as its glob: never trust `dir/*.tsx`).
  srcDirs: ['src', 'app', 'components', 'pages'],
  extensions: ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.html'],
  // The component kit. Excluded from screen rules: it is allowed to use raw values.
  kitDir: 'components/ui',
  // Paths (prefixes) never checked: generated code, the kit gallery, vendored files.
  exempt: ['node_modules', 'dist', 'build', '.next', 'coverage'],
  // CSS files that declare the design tokens as custom properties.
  tokenFiles: ['src/index.css', 'index.css', 'app/globals.css', 'src/styles/tokens.css'],
  // Prefix of the type-scale custom properties, e.g. --ds-text-body: 15px.
  typeTokenPrefix: '--ds-text-',
  // Class prefix of the type role utilities, e.g. text-ds-body.
  typeClassPrefix: 'text-ds-',
  // Writing guard: proper names that keep their capitals mid-sentence.
  properNames: [],
  properWords: [],
  // Render audit: routes to open and where the app runs.
  baseUrl: 'http://localhost:5173',
  routes: ['/'],
};

export function loadConfig(root = process.cwd()) {
  const file = join(root, 'design-system.config.json');
  const user = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const cfg = { ...DEFAULTS, ...user, root: resolve(root), hasConfigFile: existsSync(file) };
  cfg.srcDirs = cfg.srcDirs.filter(d => existsSync(join(cfg.root, d)));
  cfg.tokenFiles = cfg.tokenFiles.filter(f => existsSync(join(cfg.root, f)));
  return cfg;
}

export function* sourceFiles(cfg, { includeTests = false, extensions = cfg.extensions } = {}) {
  const seen = new Set();
  function* walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(cfg.root, p).replace(/\\/g, '/');
      if (name.startsWith('.') || cfg.exempt.some(e => rel === e || rel.startsWith(e + '/'))) continue;
      if (statSync(p).isDirectory()) { yield* walk(p); continue; }
      if (!extensions.includes(extname(name))) continue;
      if (!includeTests && /\.(test|spec|stories)\.[jt]sx?$/.test(name)) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      yield { path: p, rel, text: readFileSync(p, 'utf8') };
    }
  }
  for (const d of cfg.srcDirs) yield* walk(join(cfg.root, d));
  // Root-level entry files (App.tsx, main.tsx) are screens too.
  for (const name of readdirSync(cfg.root)) {
    if (cfg.extensions.includes(extname(name)) && !/config|\.d\.ts$/.test(name) && statSync(join(cfg.root, name)).isFile()) {
      if (!seen.has(name)) { seen.add(name); yield { path: join(cfg.root, name), rel: name, text: readFileSync(join(cfg.root, name), 'utf8') }; }
    }
  }
}

export const isKit = (cfg, rel) => rel === cfg.kitDir || rel.startsWith(cfg.kitDir + '/');

/** Every class string on a line: className="…", class="…", cn('…'), and the
 *  branches of a conditional (`on ? 'bg-white border' : 'bg-gray-50'`). Any
 *  quoted string made only of class-like tokens, with at least one utility,
 *  counts: conditional classes are where a lot of the drift hides. */
const UTILITY = /^(?:[a-z0-9-]+:)*-?(?:bg|text|border|rounded|p[xytblr]?|m[xytblr]?|gap|space|flex|grid|w|h|min|max|shadow|font|leading|tracking|ring|from|to|via|uppercase|items|justify|inline|block|hidden|absolute|relative|fixed|overflow|truncate|opacity|animate|transition|divide|outline|z|top|left|right|bottom|inset)(?:-|$)/;
export function classStrings(line) {
  const out = [];
  for (const m of line.matchAll(/(["'`])((?:(?!\1)[^\n\\])*)\1/g)) {
    // A template literal's static parts are classes too: `px-3 ${on ? 'a' : 'b'}`.
    const body = m[1] === '`' ? m[2].replace(/\$\{[^}]*\}?/g, ' ') : m[2];
    const toks = body.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    if (toks.every(t => /^!?-?[a-z0-9][\w:/.\[\]#%()-]*$/.test(t)) && toks.some(t => UTILITY.test(t))) out.push(body.trim());
  }
  return out;
}

/** Custom properties declared in the token files: { '--ds-text-body': '15px', … }. */
export function readTokens(cfg) {
  const tokens = {};
  for (const f of cfg.tokenFiles) {
    const css = readFileSync(join(cfg.root, f), 'utf8');
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

export const isComment = (line) => /^\s*(\/\/|\*|\/\*|\{\/\*|<!--)/.test(line);
