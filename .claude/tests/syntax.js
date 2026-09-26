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
   vacuous again, this exits 2 and says so instead of printing a green light. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const OPEN = '<script type="module">';
const a = html.indexOf(OPEN), b = html.lastIndexOf('</script>');
if (a < 0 || b <= a) { console.error('could not find the module script in index.html'); process.exit(1); }
const mod = html.slice(a + OPEN.length, b);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-syntax-'));
const check = (file) => spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });

/* 1. the canary — a gate that cannot fail is not a gate */
const canary = path.join(dir, 'canary.mjs');
fs.writeFileSync(canary, mod + '\nconst __CANARY__ = 1; const __CANARY__ = 2;\n');
if (check(canary).status === 0) {
  console.error('GATE IS VACUOUS: a planted duplicate const passed `node --check`. Do not trust any SYNTAX_OK until this is fixed.');
  process.exit(2);
}

/* 2. the real module */
const real = path.join(dir, 'app.mjs');
fs.writeFileSync(real, mod);
const r = check(real);
if (r.status !== 0) { console.error((r.stderr || '').trim()); console.error('\nSYNTAX FAIL: index.html module'); process.exit(1); }

/* 3. the serverless functions — CommonJS, so plain .js is correct for them */
let apiOk = true;
for (const f of fs.readdirSync(path.join(root, 'api')).filter((x) => x.endsWith('.js'))) {
  const q = check(path.join(root, 'api', f));
  if (q.status !== 0) { apiOk = false; console.error((q.stderr || '').trim()); console.error('SYNTAX FAIL: api/' + f); }
}
if (!apiOk) process.exit(1);

console.log(`SYNTAX_OK — module (${mod.split('\n').length} lines, canary caught) + api/*.js`);
