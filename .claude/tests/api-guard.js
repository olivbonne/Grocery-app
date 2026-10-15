/* lib/guard.js — a Node test, not a browser one. Run it with `node .claude/tests/api-guard.js`; it needs no server and no
   network: Google's certificates and the Upstash counter are stubbed.

   WHY THIS EXISTS: v2.39 (architecture review A1). The AI functions answered anyone, and their daily limits were counted on
   the phone. Every function now calls guard(req, name) first: it checks the phone's quiet Firebase sign-in and counts a daily
   limit on the server. Both are switched on by the owner (API_AUTH, the Upstash env vars), so the defaults must block nothing.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a token is accepted only when it is RS256, signed by a published certificate, for this project, and not expired —
     a wrong audience, an expired one, a bad signature, an unknown key and junk are each refused, with their reason;
   - API_AUTH "log" (the default) never blocks, and logs the reason for an unsigned call; "require" answers 401 "signin",
     except for feedback (a crash report may come from a phone that never signed in); "off" checks nothing;
   - without the Upstash variables nothing is counted and nothing is fetched; with them, a phone over its daily limit gets
     429 "quota", a phone with no sign-in is counted by a scrambled address, and a counter that fails lets the call through;
   - no log line ever holds the token, the address or the uid;
   - all seven functions call the guard right after their method check, and a blocked call never reaches the AI. */
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
const PROJECT = 'grocery-list-88109';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = () => Math.floor(Date.now() / 1000);
function token(claims, opt) { opt = opt || {};
  const h = b64u(JSON.stringify({ alg: opt.alg || 'RS256', kid: opt.kid || 'k1', typ: 'JWT' }));
  const c = b64u(JSON.stringify(Object.assign({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'uid-abc123', iat: now() - 10, exp: now() + 3600,
    firebase: { sign_in_provider: 'anonymous' } }, claims || {})));
  const sig = crypto.createSign('RSA-SHA256').update(h + '.' + c).sign(opt.key || privateKey);
  return h + '.' + c + '.' + b64u(sig); }

let fetches = [], upstash = { n: 1, fail: false };
globalThis.fetch = async (url, o) => { url = String(url); fetches.push({ url, o });
  if (/securetoken@system/.test(url)) return new Response(JSON.stringify({ k1: PEM }), { status: 200, headers: { 'cache-control': 'public, max-age=3600' } });
  if (/upstash|pipeline/.test(url)) { if (upstash.fail) return new Response('no', { status: 500 }); return new Response(JSON.stringify([{ result: upstash.n }, { result: 1 }]), { status: 200 }); }
  if (/groq|gemini|googleapis.com\/v1beta/.test(url)) return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  return new Response('{}', { status: 404 }); };
const logs = []; console.log = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' '));
const env = (o) => { for (const k of ['API_AUTH', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'QUOTA_RECEIPT']) delete process.env[k]; Object.assign(process.env, o || {}); };
const G = require('../../lib/guard.js');
const req = (tok, ip) => ({ method: 'POST', headers: Object.assign({ 'x-forwarded-for': ip || '203.0.113.9, 10.0.0.1' }, tok ? { authorization: 'Bearer ' + tok } : {}) });

(async () => {
  try {
    env();
    const good = token();
    let v = await G.verifyIdToken(good);
    ok('a token signed by a published certificate, for this project, is accepted', v.uid === 'uid-abc123', JSON.stringify(v));
    const bad = [['audience', token({ aud: 'someone-else' })], ['audience', token({ iss: 'https://securetoken.google.com/x' })], ['expired', token({ exp: now() - 5 })],
      ['signature', token({}, { key: other.privateKey })], ['kid', token({}, { kid: 'nope' })], ['alg', token({}, { alg: 'HS256' })], ['malformed', 'a.b'], ['malformed', '!!.??.**']];
    const got = []; for (const [want, t] of bad) { const r = await G.verifyIdToken(t); got.push(want + ':' + (r.err || 'ACCEPTED')); }
    ok('a wrong project, an expired token, a bad signature, an unknown key, another algorithm and junk are each refused', got.every((g) => { const [w, e] = g.split(':'); return w === e; }), got.join(' '));
    G._reset(); fetches = []; await G.verifyIdToken(good); await G.verifyIdToken(good);
    ok('Google\'s certificates are fetched once and kept for their max-age', fetches.filter((f) => /securetoken@system/.test(f.url)).length === 1, String(fetches.length));

    /* modes */
    logs.length = 0; fetches = [];
    let g = await G.guard(req(''), 'receipt');
    ok('by default ("log") an unsigned call goes through, and is logged with its reason', !g.block && logs.some((l) => /\[guard\] receipt: unsigned \(none\)/.test(l)), JSON.stringify(g) + ' ' + logs.join('|'));
    ok('…and with no Upstash variables nothing is counted or fetched', fetches.length === 0, fetches.map((f) => f.url).join(' '));
    g = await G.guard(req(token({ exp: now() - 5 })), 'card');
    ok('…an expired token is logged as such, still not blocked', !g.block && logs.some((l) => /card: unsigned \(expired\)/.test(l)), logs.slice(-1)[0]);
    g = await G.guard(req(good), 'card');
    ok('a valid sign-in is passed on as the uid', !g.block && g.uid === 'uid-abc123', JSON.stringify(g));
    env({ API_AUTH: 'require' });
    g = await G.guard(req(''), 'parse');
    ok('"require": a call without a sign-in gets 401 "signin"', g.block && g.status === 401 && g.code === 'signin', JSON.stringify(g));
    g = await G.guard(req(token({ aud: 'x' })), 'parse');
    ok('…and so does one with a token for another project', g.block && g.status === 401, JSON.stringify(g));
    g = await G.guard(req(''), 'feedback');
    ok('…but a crash report or problem report still goes through', !g.block, JSON.stringify(g));
    g = await G.guard(req(good), 'parse');
    ok('…and a signed-in call goes through', !g.block && g.uid === 'uid-abc123', JSON.stringify(g));
    env({ API_AUTH: 'off' }); logs.length = 0;
    g = await G.guard(req(''), 'parse');
    ok('"off" checks nothing and logs nothing', !g.block && logs.length === 0, logs.join('|'));

    /* quotas */
    env({ UPSTASH_REDIS_REST_URL: 'https://example.upstash.io/', UPSTASH_REDIS_REST_TOKEN: 'up-secret' }); fetches = []; upstash = { n: 15, fail: false };
    g = await G.guard(req(good), 'receipt');
    const call = fetches.find((f) => /pipeline/.test(f.url)); const body = call ? JSON.parse(call.o.body) : null;
    ok('with Upstash set, the call is counted for the day, by the signed-in phone', call && call.url === 'https://example.upstash.io/pipeline' && body[0][0] === 'INCR'
       && body[0][1] === 'q:receipt:u:uid-abc123:' + new Date().toISOString().slice(0, 10) && body[1][0] === 'EXPIRE' && call.o.headers.authorization === 'Bearer up-secret', JSON.stringify(body));
    ok('…the 15th receipt of the day still goes through', !g.block, JSON.stringify(g));
    upstash.n = 16; g = await G.guard(req(good), 'receipt');
    ok('…the 16th gets 429 "quota"', g.block && g.status === 429 && g.code === 'quota', JSON.stringify(g));
    process.env.QUOTA_RECEIPT = '40'; g = await G.guard(req(good), 'receipt');
    ok('…a limit can be raised with QUOTA_RECEIPT', !g.block, JSON.stringify(g));
    delete process.env.QUOTA_RECEIPT; fetches = []; upstash.n = 30;
    g = await G.guard(req('', '198.51.100.7'), 'receipt');
    const k = JSON.parse(fetches.find((f) => /pipeline/.test(f.url)).o.body)[0][1];
    ok('a phone with no sign-in is counted by a scrambled address, with three times the room', !g.block && /^q:receipt:ip:[0-9a-f]{16}:/.test(k) && !/198\.51/.test(k), k);
    upstash.n = 46; g = await G.guard(req('', '198.51.100.7'), 'receipt');
    ok('…and is stopped past it', g.block && g.code === 'quota', JSON.stringify(g));
    upstash = { n: 0, fail: true }; logs.length = 0;
    g = await G.guard(req(good), 'receipt');
    ok('a counter that fails lets the call through, and says so in the log', !g.block && logs.some((l) => /quota store unavailable/.test(l)), logs.join('|'));

    const all = logs.concat(results.map((r) => r[2])).join('\n');
    ok('no log line holds a token, an address, the uid or the Upstash token', !/eyJ|203\.0\.113|198\.51\.100|uid-abc123|up-secret/.test(logs.join('\n')), logs.join('|').slice(0, 200));

    /* the seven functions */
    const fns = ['aisle', 'card', 'feedback', 'parse', 'receipt', 'recipe-search', 'recipe'];
    const wired = fns.filter((f) => { const s = fs.readFileSync(path.join(ROOT, 'api', f + '.js'), 'utf8');
      const gi = s.indexOf(`guard(req, '${f}')`), mi = s.search(/req\.method !== 'POST'/); return /require\('\.\.\/lib\/guard\.js'\)/.test(s) && gi > 0 && mi > 0 && gi > mi; });
    ok('all seven functions call the guard, right after their method check', wired.length === 7, wired.join(','));
    env({ API_AUTH: 'require' }); process.env.GROQ_API_KEY = 'k'; process.env.GEMINI_API_KEY = 'k'; fetches = [];
    const card = require('../../api/card.js'); const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await card({ method: 'POST', headers: {}, body: { image: 'data:image/jpeg;base64,' + 'A'.repeat(400) } }, res);
    ok('a blocked call answers 401 "signin" and never reaches the AI', res.code === 401 && res.body && res.body.code === 'signin' && fetches.length === 0, JSON.stringify(res.body) + ' ' + fetches.length);
  } catch (e) { ok('suite ran to the end', false, e.stack.slice(0, 300)); }
  results.forEach(([n, p, x]) => process.stdout.write(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}\n`));
  process.stdout.write(`\n${results.filter((r) => r[1]).length}/${results.length} passed\n`);
  process.exit(results.every((r) => r[1]) ? 0 : 1);
})();
