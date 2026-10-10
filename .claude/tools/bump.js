/* Version bump. `node .claude/tools/bump.js 2.20` — run by /release (one version per batch).

   Sets APP_VERSION in js/app.js and rewrites every ?v=<n.nn> in index.html, js/**\/*.js and sw.js
   to the new number, so the page, its modules and the service worker's PRECACHE always name the same
   release and a phone never pairs a new page with an old file. A ?v= that does not match
   APP_VERSION fails the v219 suite. Exits 1 if the number is malformed, if APP_VERSION is not found
   exactly once, or if index.html, js/app.js's imports or sw.js's PRECACHE hold no ?v= at all. */
const fs = require('fs');
const path = require('path');

const v = process.argv[2] || '';
if (!/^\d+\.\d\d$/.test(v)) { console.error('usage: node .claude/tools/bump.js N.NN  (e.g. 2.20)'); process.exit(1); }
const root = path.resolve(__dirname, '..', '..');
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

const appFile = path.join(root, 'js', 'app.js');
const app = fs.readFileSync(appFile, 'utf8');
const VRE = /const APP_VERSION = "v\d+\.\d\d";/g;
const hits = app.match(VRE) || [];
if (hits.length !== 1) { console.error(`js/app.js: expected exactly one APP_VERSION line, found ${hits.length}`); process.exit(1); }

const files = [path.join(root, 'index.html'), path.join(root, 'sw.js')];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
  }
})(path.join(root, 'js'));

/* all or nothing: work out every change first, write only if all of them are sound */
const counts = {}, outs = new Map();
for (const f of files) {
  let s = f === appFile ? app.replace(VRE, `const APP_VERSION = "v${v}";`) : fs.readFileSync(f, 'utf8');
  let n = 0;
  s = s.replace(/\?v=\d+\.\d+/g, () => { n++; return '?v=' + v; });
  counts[rel(f)] = n; outs.set(f, s);
}
const bad = ['index.html', 'js/app.js', 'sw.js'].filter((k) => !counts[k]);
if (bad.length) { console.error('no ?v= found in: ' + bad.join(', ') + ' — nothing written'); process.exit(1); }
for (const [f, s] of outs) { if (s !== fs.readFileSync(f, 'utf8')) fs.writeFileSync(f, s); console.log(`${rel(f)}: ${counts[rel(f)]} ?v= set to ${v}`); }
console.log(`js/app.js: APP_VERSION = v${v}`);
