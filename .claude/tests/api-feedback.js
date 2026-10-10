/* api/feedback.js — a Node test, not a browser one. Run it with `node .claude/tests/api-feedback.js`;
   it needs no server and no network, because the one call the endpoint makes outward is stubbed.

   WHY THIS EXISTS: v2.13 lets the household report a problem. The note goes to GitHub as an issue
   when a token is configured, and to the server log otherwise. The token is a credential with write
   access to the repo, so it must never leak into a log, a response or a URL; and the endpoint must
   accept only a small, fixed shape so it cannot be used to post arbitrary content.

   WHAT THESE CHECKS HAVE TO PROVE:
   - only POST; a bad body, blank or oversized text, or an unknown kind is "bad_request";
   - not configured -> exactly one "[feedback]" log line, and nothing is fetched;
   - diag keeps only its seven keys, each cut to 120 characters;
   - configured -> one issue POST to the right repo, with the token in the header, a labelled title
     and the from-app + kind labels; the issue number comes back as ref;
   - any GitHub failure (status, throw) falls back to the log; a bad repo name is never fetched;
   - the token never appears in any console output or any response. */
const handler = require('../../api/feedback.js');

const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
function mkRes() { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; }
const bodies = [];
const call = async (body, method) => { const res = mkRes(); await handler({ method: method || 'POST', body }, res); bodies.push(JSON.stringify(res.body)); return res; };

let calls = [], status = 201, reply = { number: 42 }, throwNet = false;
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  if (throwNet) throw new TypeError('fetch failed');
  return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
};
const allOut = [], logs = [], errs = [];
const realLog = console.log, realErr = console.error;
console.log = (...a) => { const s = a.join(' '); logs.push(s); allOut.push(s); };
console.error = (...a) => { const s = a.join(' '); errs.push(s); allOut.push(s); };
const reset = () => { calls = []; logs.length = 0; errs.length = 0; };
const fbLines = () => logs.filter(l => l.startsWith('[feedback] '));
const TOKEN = 'SECRET-TOKEN-123';

(async () => {
  try {
    delete process.env.FEEDBACK_GITHUB_TOKEN; delete process.env.FEEDBACK_REPO;
    /* ── shape of the request ───────────────────────────────────────── */
    let r = await call({}, 'GET');
    ok('only POST', r.code === 405 && r.body.code === 'method', JSON.stringify(r.body));
    r = await call(42);
    ok('a non-object body is bad_request', r.code === 400 && r.body.code === 'bad_request', JSON.stringify(r.body));
    r = await call('{not json');
    ok('an unparseable string body is bad_request', r.code === 400 && r.body.code === 'bad_request', JSON.stringify(r.body));
    r = await call({ kind: 'idea', text: '   ' });
    ok('blank text is bad_request', r.code === 400 && r.body.code === 'bad_request', JSON.stringify(r.body));
    r = await call({ kind: 'idea', text: 'x'.repeat(2001) });
    ok('2001 characters is bad_request', r.code === 400 && r.body.code === 'bad_request', JSON.stringify(r.body));
    r = await call({ kind: 'rant', text: 'hello' });
    ok('an unknown kind is bad_request', r.code === 400 && r.body.code === 'bad_request', JSON.stringify(r.body));

    /* ── not configured: the log path ───────────────────────────────── */
    reset();
    r = await call(JSON.stringify({ kind: 'idea', text: 'a JSON string body works' }));
    ok('a JSON-string body works, via log', r.code === 200 && r.body.ok === true && r.body.via === 'log', JSON.stringify(r.body));
    ok('exactly one [feedback] line, carrying the text', fbLines().length === 1 && fbLines()[0].includes('a JSON string body works'), JSON.stringify(logs));
    ok('nothing is fetched when not configured', calls.length === 0, calls.length);

    reset();
    r = await call({ kind: 'looks', text: 'diag test', diag: { version: '2.13', ua: 'U'.repeat(300), secret: 'drop-me', cookie: 'x' } });
    const logged = JSON.parse(fbLines()[0].slice('[feedback] '.length));
    ok('diag drops unknown keys', JSON.stringify(Object.keys(logged.diag).sort()) === '["ua","version"]', JSON.stringify(logged.diag));
    ok('diag values are cut to 120', logged.diag.ua.length === 120 && logged.diag.version === '2.13', logged.diag.ua.length);
    reset();
    await call({ kind: 'idea', text: 'diag not an object', diag: 'nope' });
    ok('a non-object diag becomes {}', JSON.stringify(JSON.parse(fbLines()[0].slice(11)).diag) === '{}', fbLines()[0]);

    /* ── configured: GitHub ─────────────────────────────────────────── */
    process.env.FEEDBACK_GITHUB_TOKEN = TOKEN; process.env.FEEDBACK_REPO = 'owner/repo';
    reset(); status = 201; reply = { number: 42 };
    r = await call({ kind: 'broken', text: 'The list will not load\nsecond line', diag: { version: '2.13', page: 'list' } });
    ok('one fetch, to the repo issues URL', calls.length === 1 && calls[0].url === 'https://api.github.com/repos/owner/repo/issues', calls.map(c => c.url).join());
    ok('…the URL carries no token', calls.length === 1 && !calls[0].url.includes(TOKEN), '');
    ok('…Authorization carries the token', calls[0] && calls[0].opts.headers.Authorization === 'Bearer ' + TOKEN, '');
    const sent = calls[0] ? JSON.parse(calls[0].opts.body) : {};
    ok('…title starts "[Broken] " and is the first line', sent.title === '[Broken] The list will not load', sent.title);
    ok('…labels are from-app and the kind', Array.isArray(sent.labels) && sent.labels.includes('from-app') && sent.labels.includes('broken'), JSON.stringify(sent.labels));
    ok('…body has the text then the diag', /second line\n\n---\nversion: 2\.13\npage: list/.test(sent.body || ''), sent.body);
    ok('201 + {number:42} -> via github, ref 42', r.code === 200 && r.body.ok === true && r.body.via === 'github' && r.body.ref === 42, JSON.stringify(r.body));
    ok('nothing is logged on success', fbLines().length === 0, JSON.stringify(logs));

    reset(); status = 500; reply = { message: 'boom ' + TOKEN };
    r = await call({ kind: 'idea', text: 'github is down' });
    ok('GitHub 500 falls back to log', r.body.via === 'log' && fbLines().length === 1, JSON.stringify(r.body));
    ok('…and console.error names the status', errs.some(l => l === 'feedback github 500'), JSON.stringify(errs));

    reset(); status = 201; throwNet = true;
    r = await call({ kind: 'complaint', text: 'network is gone' });
    ok('a fetch that throws falls back to log', r.body.via === 'log' && fbLines().length === 1, JSON.stringify(r.body));
    ok('…and console.error says net fail', errs.some(l => l === 'feedback github net fail'), JSON.stringify(errs));
    throwNet = false;

    for (const bad of ['owner/repo?x=1', '../x']) {
      process.env.FEEDBACK_REPO = bad; reset();
      r = await call({ kind: 'idea', text: 'bad repo ' + bad });
      ok('bad FEEDBACK_REPO "' + bad + '" is never fetched, via log', calls.length === 0 && r.body.via === 'log', calls.length + ' ' + JSON.stringify(r.body));
    }

    /* ── the token never leaks ──────────────────────────────────────── */
    ok('the token appears in no console output', !allOut.some(l => l.includes(TOKEN)), '');
    ok('the token appears in no response', !bodies.some(b => b.includes(TOKEN)), '');
  } catch (e) { ok('the suite ran to the end', false, e.stack); }

  console.log = realLog; console.error = realErr;
  let pass = 0; results.forEach(([n, c, x]) => { if (c) pass++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x && !c ? '   ' + x : '')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
