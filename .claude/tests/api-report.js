/* lib/report.js — a Node test, not a browser one. Run it with `node .claude/tests/api-report.js`; it needs no network: GitHub is
   stubbed.

   WHY THIS EXISTS: v3.11 (H3, logs that last). Vercel keeps the server's log for one hour; twice a failure was gone before it
   could be read (the receipt failure, App Check). A server failure (5xx) now becomes one GitHub issue per function and code.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a 5xx opens ONE issue, label `server-failure`, title `[Server] <fn>: <code> · sig:<fn>/<code>`, whose body holds the
     function, the code, the status, the time, the region and the deployment — and nothing the caller could put there;
   - a repeat on this instance within 30 minutes writes nothing; after that it comments on the open issue (no second issue);
   - a 4xx, the code `unreadable`, SERVER_REPORTS=off, a missing token or repo, and an unsafe function name write nothing;
   - a code that is not plain lowercase becomes `other` (no free text in a title);
   - GitHub failing or hanging never throws and ends within the timeout, and the log line never holds the token;
   - every AI function routes its failures through reportFailure, feedback does not, and a 5xx answer is sent BEFORE the
     report (the phone is not kept waiting). */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
const R = require(path.join(ROOT, 'lib', 'report.js'));
const TOKEN = 'ghp_TESTTOKEN_never_logged';
let calls = [], mode = 'ok', issues = [];
const logs = []; const origErr = console.error; console.error = (...a) => logs.push(a.join(' '));
global.fetch = async (url, opt) => { opt = opt || {}; calls.push({ url, method: opt.method || 'GET', body: opt.body ? JSON.parse(opt.body) : null, auth: (opt.headers || {}).Authorization });
  if (mode === 'down') throw new Error('net');
  if (mode === 'hang') return new Promise((res, rej) => { if (opt.signal) opt.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
  if (mode === '403') return { ok: false, status: 403, json: async () => ({}), text: async () => 'secret body' };
  if (/\/issues\?/.test(url)) return { ok: true, status: 200, json: async () => issues, text: async () => JSON.stringify(issues) };
  if (/\/comments$/.test(url)) return { ok: true, status: 201, json: async () => ({ id: 9 }), text: async () => '' };
  const n = 100 + issues.length; issues.push({ number: n, title: JSON.parse(opt.body).title });
  return { ok: true, status: 201, json: async () => ({ number: n }), text: async () => '' }; };
const env = (o) => { for (const k of ['FEEDBACK_GITHUB_TOKEN', 'FEEDBACK_REPO', 'SERVER_REPORTS', 'VERCEL_REGION', 'VERCEL_GIT_COMMIT_SHA']) delete process.env[k];
  Object.assign(process.env, o); };
const ON = { FEEDBACK_GITHUB_TOKEN: TOKEN, FEEDBACK_REPO: 'o/r', VERCEL_REGION: 'syd1', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' };
const fresh = () => { R._reset(); calls = []; issues = []; mode = 'ok'; logs.length = 0; };

(async () => {
  try {
    /* 1. a first failure opens one issue */
    env(ON); fresh();
    const w1 = await R.reportFailure('receipt', 502, 'quota');
    const made = calls.filter(c => c.method === 'POST' && /\/issues$/.test(c.url));
    const b = made[0] && made[0].body;
    ok('a 5xx opens one issue, labelled server-failure, titled by function and code', w1 === true && made.length === 1 && b.title === '[Server] receipt: quota · sig:receipt/quota' && JSON.stringify(b.labels) === '["server-failure"]', JSON.stringify(b && { t: b.title, l: b.labels }));
    ok('…its body holds the function, the code, the status, the time, the region and the deployment', b && /function: receipt/.test(b.body) && /code: quota/.test(b.body) && /HTTP status: 502/.test(b.body)
      && /when: \d{4}-\d\d-\d\dT/.test(b.body) && /region: syd1/.test(b.body) && /deployment: abcdef1\b/.test(b.body) && !/abcdef12/.test(b.body), b && b.body);
    ok('…sent with the token in the Authorization header only', made[0] && made[0].auth === 'Bearer ' + TOKEN && !JSON.stringify(made[0].body).includes(TOKEN));
    /* 2. a repeat within 30 minutes writes nothing; after, it comments */
    calls = []; const w2 = await R.reportFailure('receipt', 502, 'quota');
    ok('a repeat on this instance within 30 minutes writes nothing (and asks nothing)', w2 === false && calls.length === 0, calls.length);
    const realNow = Date.now; Date.now = () => realNow() + R.THROTTLE_MS + 1000;
    calls = []; const w3 = await R.reportFailure('receipt', 502, 'quota'); Date.now = realNow;
    const com = calls.filter(c => /\/comments$/.test(c.url)), more = calls.filter(c => c.method === 'POST' && /\/issues$/.test(c.url));
    ok('…after 30 minutes it comments "Happened again" on the open issue, with no second issue', w3 === true && com.length === 1 && /issues\/100\/comments$/.test(com[0].url) && /Happened again/.test(com[0].body.body) && more.length === 0, JSON.stringify(com.map(c => c.url)));
    /* 3. other functions / codes are their own issues */
    calls = []; await R.reportFailure('parse', 500, 'not_configured');
    ok('another function or code is its own issue', issues.length === 2 && issues[1].title === '[Server] parse: not_configured · sig:parse/not_configured', JSON.stringify(issues.map(i => i.title)));
    /* 4. what is never reported */
    const none = async (label, fn, st, code, o) => { env(Object.assign({}, ON, o || {})); fresh(); const w = await R.reportFailure(fn, st, code); ok(label, w === false && calls.length === 0, calls.length); };
    await none('a 4xx (a caller\'s mistake) is never reported', 'receipt', 400, 'bad_request');
    await none('"could not read this photo" (unreadable) is never reported', 'receipt', 502, 'unreadable');
    await none('SERVER_REPORTS=off switches it off', 'receipt', 502, 'quota', { SERVER_REPORTS: 'off' });
    await none('no token: nothing', 'receipt', 502, 'quota', { FEEDBACK_GITHUB_TOKEN: '' });
    await none('no repository: nothing', 'receipt', 502, 'quota', { FEEDBACK_REPO: '' });
    await none('an unsafe function name: nothing', 'Receipt <b>', 502, 'quota');
    env(ON); fresh(); await R.reportFailure('receipt', 502, 'Quota exceeded: user 42 <script>');
    const t = calls.find(c => c.method === 'POST'); ok('a code that is not plain lowercase is written as "other"', t && t.body.title === '[Server] receipt: other · sig:receipt/other', t && t.body.title);
    /* 5. GitHub failing */
    for (const m of ['down', '403']) { env(ON); fresh(); mode = m; let threw = false, w;
      try { w = await R.reportFailure('aisle', 502, 'upstream'); } catch (e) { threw = true; }
      ok('GitHub ' + (m === 'down' ? 'unreachable' : 'refusing (403)') + ': no throw, a log line without the token or GitHub\'s answer', !threw && w === false && logs.some(l => /\[report\] aisle\/upstream/.test(l)) && !logs.some(l => l.includes(TOKEN) || l.includes('secret body')), JSON.stringify(logs)); }
    env(ON); fresh(); mode = 'hang'; const t0 = Date.now(); const wh = await R.reportFailure('card', 504, 'timeout');
    ok('GitHub hanging: it gives up within its timeout (about 3 s) and logs "timed out"', wh === false && Date.now() - t0 < 4500 && logs.some(l => /timed out/.test(l)), (Date.now() - t0) + 'ms ' + JSON.stringify(logs));
    /* 6. the functions */
    const FN = ['aisle', 'card', 'fridge', 'receipt', 'recipe-search', 'recipe', 'parse'];
    const src = Object.fromEntries(FN.concat('feedback').map(f => [f, fs.readFileSync(path.join(ROOT, 'api', f + '.js'), 'utf8')]));
    const wired = FN.filter(f => /require\('\.\.\/lib\/report'\)/.test(src[f]) && /return reportFailure\('[a-z_]+', status, code\)/.test(src[f]));
    ok('every AI function sends its failures through reportFailure', wired.length === FN.length, 'wired: ' + wired.join(','));
    const order = FN.filter(f => { const m = src[f].match(/function fail\(res, status, code, error\) \{([\s\S]*?)\n\}/); return m && m[1].indexOf('res.status(status)') >= 0 && m[1].indexOf('res.status(status)') < m[1].indexOf('reportFailure'); });
    ok('…answering the phone first, then reporting', order.length === FN.length, 'in order: ' + order.join(','));
    ok('parse answers every 5xx through fail() now (no bare res.status(5..) left)', !/res\.status\(5\d\d\)/.test(src.parse), (src.parse.match(/res\.status\(5\d\d\)[^;]*/g) || []).join(' | '));
    ok('Report a problem itself does not report its failures', !/lib\/report/.test(src.feedback));
    const pv = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8'), mon = fs.readFileSync(path.join(ROOT, 'docs', 'monitoring.md'), 'utf8');
    ok('the privacy page and docs/monitoring.md say what is written down', /When the app’s server fails|When the app's server fails/.test(pv) && /server-failure/.test(mon));
  } catch (e) { ok('suite ran to the end', false, (e.stack || e.message).slice(0, 300)); }
  console.error = origErr;
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
