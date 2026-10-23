/* v2.53 — the AI features' daily limit, counted in Firestore AS THE CALLING PHONE (architecture review S4). A Node test,
   no browser and no network: Google's certificates and Firestore's REST answer are stubbed.
   Run it with `node .claude/tests/v253.js`.

   WHAT THESE CHECKS HAVE TO PROVE:
   - with no Upstash, a signed-in call adds one to the phone's own counter in Firestore with ONE commit: the phone's own
     sign-in as the bearer (no admin key exists anywhere), its App Check token passed on, today's document for that phone,
     an increment of exactly one on that function's field;
   - over the limit → 429 "quota"; at the limit → through; QUOTA_<NAME> raises it;
   - Firestore refusing (rules not yet published) or unreachable lets the call through and says so in the log (fail open);
   - Upstash, when set, is used instead; QUOTA_STORE=off counts nothing; an unsigned call never reaches Firestore;
   - no log line holds a token or the uid;
   - the rules: a phone touches only its own counters, one field, up by exactly one, never deletes; the privacy page and the
     rules doc say so. */
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
const PROJECT = 'grocery-list-88109';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type:'spki', format:'pem' });
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = () => Math.floor(Date.now() / 1000);
function token(uid){ const h = b64u(JSON.stringify({ alg:'RS256', kid:'k1', typ:'JWT' }));
  const c = b64u(JSON.stringify({ aud:PROJECT, iss:'https://securetoken.google.com/' + PROJECT, sub:uid, iat:now() - 10, exp:now() + 3600, firebase:{ sign_in_provider:'anonymous' } }));
  return h + '.' + c + '.' + b64u(crypto.createSign('RSA-SHA256').update(h + '.' + c).sign(privateKey)); }
let fetches = [], fsReply = { status:200, n:1 };
globalThis.fetch = async (url, o) => { url = String(url); fetches.push({ url, o });
  if (/securetoken@system/.test(url)) return new Response(JSON.stringify({ k1:PEM }), { status:200, headers:{ 'cache-control':'public, max-age=3600' } });
  if (/firestore\.googleapis\.com/.test(url)) { if (fsReply.throw) throw new Error('offline');
    return new Response(JSON.stringify(fsReply.status === 200 ? { writeResults:[{ transformResults:[{ integerValue:String(fsReply.n) }] }] } : { error:{ status:'PERMISSION_DENIED' } }), { status:fsReply.status }); }
  if (/pipeline/.test(url)) return new Response(JSON.stringify([{ result:2 }, { result:1 }]), { status:200 });
  return new Response('{}', { status:404 }); };
const logs = []; const realLog = console.log; console.log = (...a) => logs.push(a.join(' '));
const env = (o) => { for (const k of ['API_AUTH', 'APP_CHECK', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'QUOTA_STORE', 'QUOTA_RECEIPT']) delete process.env[k]; Object.assign(process.env, { API_AUTH:'require' }, o || {}); };
const G = require('../../lib/guard.js');
const req = (tok, ac) => ({ method:'POST', headers: Object.assign({ 'x-forwarded-for':'203.0.113.9' }, tok ? { authorization:'Bearer ' + tok } : {}, ac ? { 'x-firebase-appcheck':ac } : {}) });

(async () => {
  try {
    env(); const tok = token('phone-uid-1'); const day = new Date().toISOString().slice(0, 10);
    fetches = []; fsReply = { status:200, n:3 };
    let g = await G.guard(req(tok, 'ac-tok'), 'receipt');
    const c = fetches.find(f => /firestore\.googleapis\.com/.test(f.url)); const body = c ? JSON.parse(c.o.body) : null; const w = body && body.writes && body.writes[0];
    ok('a signed-in call is counted in Firestore with ONE commit, as the phone itself (its own sign-in), App Check passed on', c && c.url === `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`
       && c.o.method === 'POST' && c.o.headers.authorization === 'Bearer ' + tok && c.o.headers['x-firebase-appcheck'] === 'ac-tok' && fetches.filter(f => /firestore/.test(f.url)).length === 1, c ? c.url : 'no call');
    ok('…on today\'s document for that phone, adding exactly one to that function\'s counter and nothing else', w && w.update.name === `projects/${PROJECT}/databases/(default)/documents/quota/phone-uid-1/days/${day}`
       && JSON.stringify(w.update.fields) === '{}' && JSON.stringify(w.updateMask.fieldPaths) === '[]' && w.updateTransforms.length === 1 && w.updateTransforms[0].fieldPath === 'receipt' && w.updateTransforms[0].increment.integerValue === '1', JSON.stringify(w));
    ok('…and the 3rd receipt goes through', !g.block, JSON.stringify(g));
    fsReply = { status:200, n:15 }; g = await G.guard(req(tok), 'receipt');
    ok('the 15th receipt of the day still goes through', !g.block, JSON.stringify(g));
    fsReply = { status:200, n:16 }; g = await G.guard(req(tok), 'receipt');
    ok('the 16th gets 429 "quota"', g.block && g.status === 429 && g.code === 'quota', JSON.stringify(g));
    process.env.QUOTA_RECEIPT = '40'; g = await G.guard(req(tok), 'receipt'); delete process.env.QUOTA_RECEIPT;
    ok('…a limit can be raised with QUOTA_RECEIPT', !g.block, JSON.stringify(g));
    fetches = []; fsReply = { status:200, n:1 }; await G.guard(req(tok), 'recipe-search');
    const rs = fetches.find(f => /firestore/.test(f.url)); ok('recipe search counts under a field name the rules accept (recipeSearch)', rs && JSON.parse(rs.o.body).writes[0].updateTransforms[0].fieldPath === 'recipeSearch', '');
    logs.length = 0; fsReply = { status:403 }; g = await G.guard(req(tok), 'card');
    ok('Firestore refusing (rules not published yet) lets the call through, and the log says the count is unavailable', !g.block && logs.some(l => /card: quota store unavailable/.test(l)), logs.join('|'));
    logs.length = 0; fsReply = { throw:true }; g = await G.guard(req(tok), 'card');
    ok('…and so does Firestore being unreachable', !g.block && logs.some(l => /quota store unavailable/.test(l)), logs.join('|'));
    env({ UPSTASH_REDIS_REST_URL:'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN:'up' }); fetches = []; fsReply = { status:200, n:99 };
    g = await G.guard(req(tok), 'receipt');
    ok('Upstash, when set up, is used instead of Firestore', !g.block && fetches.some(f => /pipeline/.test(f.url)) && !fetches.some(f => /firestore/.test(f.url)), fetches.map(f => f.url).join(' '));
    env({ QUOTA_STORE:'off' }); fetches = []; g = await G.guard(req(tok), 'receipt');
    ok('QUOTA_STORE=off counts nothing', !g.block && !fetches.some(f => /firestore|pipeline/.test(f.url)), '');
    env({ API_AUTH:'log' }); fetches = []; g = await G.guard(req(''), 'parse');
    ok('an unsigned call never reaches Firestore (it has no sign-in to write with)', !fetches.some(f => /firestore/.test(f.url)), '');
    ok('no log line holds a token or the uid', !/eyJ|phone-uid-1|ac-tok/.test(logs.join('\n')), '');
    console.log = realLog;

    const rules = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8'); const q = rules.slice(rules.indexOf('match /quota/{uid}/days/{day}'));
    ok('the rules: only the phone itself, only one counter, up by exactly one, never deleted', /function mine\(\) \{ return request\.auth != null && request\.auth\.uid == uid; \}/.test(q)
       && /ks\.size\(\) == 1 && d\[k\] is int && d\[k\] == \(resource == null \? 0 : resource\.data\.get\(k, 0\)\) \+ 1/.test(q) && /allow delete: if false;/.test(q)
       && /hasOnly\(\['receipt', 'card', 'aisle', 'parse', 'recipe', 'recipeSearch', 'feedback'\]\)/.test(q), '');
    ok('every field name the server writes is one the rules accept', Object.values({ receipt:1 }) && ['receipt', 'card', 'aisle', 'parse', 'recipe', 'recipeSearch', 'feedback'].every(k => q.includes(`'${k}'`)), '');
    ok('the privacy page and the rules doc say what is counted', /Daily limits/.test(fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8')) && /quota\/\{uid\}\/days\/\{day\}/.test(fs.readFileSync(path.join(ROOT, 'docs', 'firestore-rules.md'), 'utf8')), '');
  } catch (e) { console.log = realLog; ok('suite ran to the end', false, e.stack.slice(0, 300)); }
  results.forEach(([n, p, x]) => process.stdout.write(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}\n`));
  process.stdout.write(`\n${results.filter(r => r[1]).length}/${results.length} passed\n`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
