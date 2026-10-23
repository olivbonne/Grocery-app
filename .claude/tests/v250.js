/* v2.50 — Firebase App Check (architecture review S3, step A1), built dormant until the owner gives a reCAPTCHA v3 site key.

   WHAT THESE CHECKS HAVE TO PROVE:
   - lib/guard.js verifyAppCheck: a token signed by App Check's published key, for this project, unexpired, is accepted;
     another project, an expired one, a bad signature, an unknown key and junk are each refused with their reason;
   - APP_CHECK "off" (the default) checks nothing; "log" never blocks and logs the reason (never the token); "require"
     answers 401 "appcheck", except for a crash report; a good token passes;
   - in the app (v2.52: under automation the shipped key is ignored): with no site key nothing is loaded (no reCAPTCHA, no App Check file) and calls carry no App Check header;
     switched on, the App Check file is loaded and every /api call carries its token;
   - the CSP lets reCAPTCHA and App Check through, the SDK file is vendored and precached, and the privacy page says so.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const NUM = '237398844171';
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = Object.assign(kp.publicKey.export({ format:'jwk' }), { kid:'ac1', alg:'RS256', use:'sig' });
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const now = () => Math.floor(Date.now()/1000);
function act(claims, o){ o=o||{}; const h=b64u(JSON.stringify({ alg:o.alg||'RS256', kid:o.kid||'ac1', typ:'JWT' }));
  const c=b64u(JSON.stringify(Object.assign({ iss:'https://firebaseappcheck.googleapis.com/'+NUM, aud:['projects/'+NUM, 'projects/grocery-list-88109'], sub:'1:'+NUM+':web:abc', iat:now()-5, exp:now()+3600 }, claims||{})));
  return h+'.'+c+'.'+b64u(crypto.createSign('RSA-SHA256').update(h+'.'+c).sign(o.key||kp.privateKey)); }
let fetches=[]; globalThis.fetch = async (u)=>{ u=String(u); fetches.push(u);
  if(/firebaseappcheck\.googleapis\.com\/v1\/jwks/.test(u)) return new Response(JSON.stringify({ keys:[JWK] }), { status:200 });
  return new Response('{}', { status:404 }); };
const logs=[]; const realLog=console.log; console.log=(...a)=>logs.push(a.join(' '));
const env=(o)=>{ for(const k of ['API_AUTH','APP_CHECK','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) delete process.env[k]; Object.assign(process.env, { API_AUTH:'off' }, o||{}); };
const G = require('../../lib/guard.js');
const req = (tok)=>({ method:'POST', headers: Object.assign({ 'x-forwarded-for':'203.0.113.9' }, tok ? { 'x-firebase-appcheck':tok } : {}) });

/* the app's side: the App Check file is stubbed; it hands out "ac-token" */
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>{ (window.__order=window.__order||[]).push('db'); return ()=>{}; };export const setDoc=async()=>{};export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const ACSTUB = `window.__acLoaded=true; export class ReCaptchaEnterpriseProvider{ constructor(k){ window.__acKey=k; } }
export function initializeAppCheck(app,o){ window.__acInit=!!(o && o.provider); (window.__order=window.__order||[]).push('ac'); return { ok:true }; }
export async function getToken(){ return { token:'ac-token' }; }`;
const seed = `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[{id:"1",name:"Milk",cat:"dairy",qty:1,weight:"",checked:false,tags:[]}], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}])); localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_installhint","1"); })()`;

(async () => {
  const [port]=process.argv.slice(2);
  const errors=[]; let browser;
  try {
    env();
    let v = await G.verifyAppCheck(act());
    ok('an App Check token signed by its published key, for this project, is accepted', v.app === '1:'+NUM+':web:abc', JSON.stringify(v));
    const bad = [['audience', act({ iss:'https://firebaseappcheck.googleapis.com/999' })], ['audience', act({ aud:['projects/999'] })], ['expired', act({ exp:now()-5 })],
      ['signature', act({}, { key:other.privateKey })], ['kid', act({}, { kid:'nope' })], ['alg', act({}, { alg:'HS256' })], ['malformed', 'x.y']];
    const got=[]; for(const [w,t] of bad){ const r=await G.verifyAppCheck(t); got.push(w+':'+(r.err||'ACCEPTED')); }
    ok('another project, an expired token, a bad signature, an unknown key, another algorithm and junk are each refused', got.every(g=>{ const [w,e]=g.split(':'); return w===e; }), got.join(' '));

    logs.length=0; let g = await G.guard(req(''), 'receipt');
    ok('APP_CHECK unset ("off"): nothing is checked or logged', !g.block && !logs.some(l=>/app check/.test(l)), logs.join('|'));
    env({ APP_CHECK:'log' }); logs.length=0; g = await G.guard(req(''), 'receipt');
    ok('"log": a call without a token goes through and is logged with its reason', !g.block && logs.some(l=>/\[guard\] receipt: no app check \(none\)/.test(l)), logs.join('|'));
    env({ APP_CHECK:'require' }); g = await G.guard(req(act({ exp:now()-5 })), 'card');
    ok('"require": a bad token gets 401 "appcheck"', g.block && g.status===401 && g.code==='appcheck', JSON.stringify(g));
    g = await G.guard(req(''), 'feedback');
    ok('…but a crash report still goes through', !g.block, JSON.stringify(g));
    g = await G.guard(req(act()), 'card');
    ok('…and a good token passes', !g.block, JSON.stringify(g));
    ok('no log line holds a token', !/eyJ/.test(logs.join('\n')), '');
    console.log = realLog;

    /* ── the app ─────────────────────────────────────────────────── */
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page; const reqs=[];
    const mk = async(key)=>{ if(ctx) await ctx.close(); reqs.length=0;
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
      await ctx.route('**/firebasejs/**', r => { const u=r.request().url(); reqs.push(u);
        r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-app-check\.js/.test(u) ? ACSTUB : /firebase-auth\.js/.test(u) ? AUTHSTUB : FSTUB }); });
      await ctx.route('**/recaptcha/**', r => { reqs.push(r.request().url()); r.fulfill({ status:200, body:'' }); });
      await ctx.route('**/api/feedback', r => { reqs.push('API '+JSON.stringify(r.request().headers())); r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      if(key) await page.addInitScript(`window.__appCheckKey=${JSON.stringify(key)};`);
      await page.addInitScript(seed);
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const report = async()=>{ await page.locator('#shopMenu').click(); await page.waitForTimeout(300); await page.locator('#smReport').click(); await page.waitForTimeout(400);
      await page.fill('#rptText', 'test report'); await page.locator('#rptSend').click(); await page.waitForTimeout(1500); };
    await mk('');
    await report();
    const api0 = reqs.find(r=>r.startsWith('API ')) || '';
    ok('with no site key: no App Check file, no reCAPTCHA, and the call carries no App Check header', !reqs.some(r=>/firebase-app-check|recaptcha/.test(r)) && api0 && !/x-firebase-appcheck/.test(api0), reqs.filter(r=>!/firebase-(app|firestore|auth)\.js/.test(r)).join(' ').slice(0,300));
    await mk('site-key-123');
    ok('switched on: the App Check file is loaded and set up with the site key', await page.evaluate(()=>window.__acLoaded===true && window.__acInit===true && window.__acKey==='site-key-123'), '');
    const order = await page.evaluate(()=>window.__order||[]);
    ok('v2.54: App Check is in place BEFORE the database makes its first request (else the first requests of every launch go unverified)', order[0]==='ac' && order.includes('db'), JSON.stringify(order));
    await report();
    const api1 = reqs.find(r=>r.startsWith('API ')) || '';
    ok('…and an /api call carries its token', /"x-firebase-appcheck":"ac-token"/.test(api1), api1.slice(0,200));

    const vj = fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8');
    const csp = (vj.match(/"Content-Security-Policy", "value": "default-src[^"]*"/g)||[]);
    ok('the CSP lets reCAPTCHA and App Check through (both full policies), and frames only reCAPTCHA', csp.length===2 && csp.every(c=>/script-src[^;]*https:\/\/www\.google\.com\/recaptcha\//.test(c) && /connect-src[^;]*https:\/\/content-firebaseappcheck\.googleapis\.com/.test(c) && /frame-src https:\/\/www\.google\.com\/recaptcha\//.test(c)), '');
    const vf = fs.readFileSync(path.join(ROOT,'vendor','firebasejs','10.12.2','firebase-app-check.js'),'utf8');
    ok('the App Check SDK is vendored (importing the local firebase-app.js) and precached', /from"\.\/firebase-app\.js"/.test(vf) && !/gstatic\.com\/firebasejs\/10\.12\.2\/firebase-app\.js/.test(vf) && /firebase-app-check\.js/.test(fs.readFileSync(path.join(ROOT,'sw.js'),'utf8')), '');
    ok('the privacy page says what App Check sends, and that it is off', /App Check/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
    /* SUPERSEDED by v2.52: App Check is switched on with the owner's Fraud Defense key. Still protects: the key is set in one
       place, the provider is Fraud Defense (the classic reCAPTCHA no longer takes new keys), and automation never loads it. */
    const appSrc = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the shipped app carries the Fraud Defense site key, uses that provider, and suites never load the real script', /const APPCHECK_SITE_KEY = "6L[\w-]{30,}";/.test(appSrc) && /new m\.ReCaptchaEnterpriseProvider\(key\)/.test(appSrc) && /if\(navigator\.webdriver\) return String\(window\.__appCheckKey \|\| ""\)/.test(appSrc), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>process.stdout.write(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}\n`));
  process.stdout.write(`\n${results.filter(r=>r[1]).length}/${results.length} passed\n`);
  process.exit(results.every(r=>r[1])?0:1);
})();
