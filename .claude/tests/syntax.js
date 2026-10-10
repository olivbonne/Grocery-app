/* The syntax gate. `node .claude/tests/syntax.js` — no server, no browser, about a second.

   WHY THIS FILE EXISTS: the gate used to be a one-line shell command copied into CLAUDE.md, the
   verify-app skill and the executor agent. Two separate bugs made it check nothing:

   1. Extracting to the FIRST `</script>`. The module contains `</script>` inside a template
      literal, so that compiles only a prefix — how a duplicate top-level const reached the
      browser in v1.82. Hence lastIndexOf.
   2. Saving the extract as `.js`. Found 2026-09-26: Node 22 fails the CommonJS parse on the
      module's `import` lines, detects module syntax, and under `--check` never reports the module
      parse — so `node --check app.js` passed a file with a duplicate const planted in it. Every
      "SYNTAX_OK" before this file existed was vacuous. The browser suites (which fail on any page
      error) were the real gate, which is why nothing broken shipped. As `.mjs` it is parsed as a
      module and the error is caught.

   So this does not trust itself: before checking the real file it plants a known error in a copy
   and requires the check to FAIL on it. If a future Node, or a future edit here, makes the gate
   vacuous again, this exits 2 and says so instead of printing a green light.

   v2.19: the module and the styles left index.html for js/app.js (+ js/data/*.js) and app.css. So the
   gate now fails if index.html grows an inline module or <style> back, checks every .js under js/
   (each as .mjs, canary planted in a copy of js/app.js), and — since Node cannot load app.js (its
   Firebase imports are absolute site paths) — links the relative imports by hand: each imported
   file must exist and export every name imported from it. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* 0. the page holds no inline module and no inline styles any more */
if (/<script type="module">\s*\S/.test(html)) { console.error('SYNTAX FAIL: index.html holds an inline <script type="module"> again — the app lives in js/app.js'); process.exit(1); }
if (/<style[\s>]/.test(html)) { console.error('SYNTAX FAIL: index.html holds an inline <style> block again — the styles live in app.css'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
  }
})(path.join(root, 'js'));
const appFile = path.join(root, 'js', 'app.js');
if (!files.includes(appFile)) { console.error('SYNTAX FAIL: js/app.js not found'); process.exit(1); }
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-syntax-'));
const check = (file) => spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
const app = fs.readFileSync(appFile, 'utf8');

/* 1. the canary — a gate that cannot fail is not a gate */
const canary = path.join(dir, 'canary.mjs');
fs.writeFileSync(canary, app + '\nconst __CANARY__ = 1; const __CANARY__ = 2;\n');
if (check(canary).status === 0) {
  console.error('GATE IS VACUOUS: a planted duplicate const passed `node --check`. Do not trust any SYNTAX_OK until this is fixed.');
  process.exit(2);
}

/* 2. every module, as .mjs */
files.forEach((f, i) => {
  const t = path.join(dir, 'm' + i + '.mjs');
  fs.writeFileSync(t, fs.readFileSync(f, 'utf8'));
  const r = check(t);
  if (r.status !== 0) { console.error((r.stderr || '').trim()); console.error('\nSYNTAX FAIL: ' + rel(f)); process.exit(1); }
});

/* 3. link the relative imports: the file exists and exports every imported name */
const missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = path.resolve(path.dirname(f), m[2].replace(/[?#].*$/, ''));
    if (!fs.existsSync(target)) { missing.push(`${rel(f)}: ${m[2]} — no such file`); continue; }
    const tsrc = fs.readFileSync(target, 'utf8');
    const exported = new Set();
    for (const x of tsrc.matchAll(/export\s+(?:const|let|var|function\*?|async\s+function|class)\s+([A-Za-z_$][\w$]*)/g)) exported.add(x[1]);
    for (const x of tsrc.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of x[1].split(',')) { const p = n.trim().split(/\s+as\s+/); if (p[0]) exported.add((p[1] || p[0]).trim()); }
    for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/)[0].trim(); if (name && !exported.has(name)) missing.push(`${rel(f)}: ${name} is not exported by ${rel(target)}`); }
  }
}
if (missing.length) { missing.forEach((x) => console.error('IMPORT FAIL: ' + x)); process.exit(1); }

/* 4. the serverless functions — CommonJS, so plain .js is correct for them */
let apiOk = true;
for (const f of fs.readdirSync(path.join(root, 'api')).filter((x) => x.endsWith('.js'))) {
  const q = check(path.join(root, 'api', f));
  if (q.status !== 0) { apiOk = false; console.error((q.stderr || '').trim()); console.error('SYNTAX FAIL: api/' + f); }
}
if (!apiOk) process.exit(1);

console.log(`SYNTAX_OK — js/app.js (${app.split('\n').length} lines, canary caught) + ${files.length - 1} more modules, imports linked + api/*.js`);
