/* v3.07 — the four small items: a narrower browser policy (S5), a bounded fallback for the daily AI limit (S6, tested in
   api-guard.js), an automatic check of the live site after each release (D1) and a written way back (D2).

   WHAT THESE CHECKS HAVE TO PROVE:
   - vercel.json: the app's two policies are identical and no longer allow images from any https site; the privacy and
     concept pages have a real policy (default-src 'none'), not three lines;
   - the app, served WITH that policy as its header, runs with no policy violation — list, a wallpaper, dark theme, Settings,
     the cards grid and a card's barcode — and an image from another site is refused (the policy is really applied);
   - the privacy page, served with its policy, shows its text in the app's font with no violation;
   - the live-check tool passes against this tree served locally, and fails when the served version is not this commit's;
   - the workflow runs it on every push to main and daily; the rollback page exists and names the four ways back. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const NEWER_V = +fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8').match(/const LIST_V = (\d+);/)[1] + 1;   // v2.78 (lesson 44): "a newer app" is always one past the app's own version, never a literal
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `const S = window.__srv || (window.__srv = { docs:{}, subs:[], writes:[], refuse:false });
S.subs = [];
const J = v => v===undefined ? undefined : JSON.parse(JSON.stringify(v));
export const initializeApp=()=>({}); export const getFirestore=()=>({}); export const initializeFirestore=()=>({});
export const persistentLocalCache=()=>({}); export const persistentMultipleTabManager=()=>({});
export const doc=(db,...p)=>({ kind:'doc', path:p.join('/') });
export const collection=(db,...p)=>({ kind:'col', path:p.join('/') });
const meta = { hasPendingWrites:false, fromCache:false };
function docSnap(p){ const d=S.docs[p]; return { id:p.split('/').pop(), exists:()=>d!==undefined, data:()=>J(d), metadata:meta }; }
function colSnap(p){ return { docs:Object.keys(S.docs).filter(k=>k.indexOf(p+'/')===0 && k.slice(p.length+1).indexOf('/')<0).map(docSnap), metadata:meta }; }
function snapOf(r){ return r.kind==='doc' ? docSnap(r.path) : colSnap(r.path); }
function fire(){ S.subs.slice().forEach(s=>setTimeout(()=>{ if(S.subs.includes(s)) s.cb(snapOf(s.r)); }, 0)); }
S.set = (p, d) => { S.docs[p] = J(d); fire(); };
export function onSnapshot(r, a, b){ const cb = typeof a==='function' ? a : b; const s={ r, cb }; S.subs.push(s);
  setTimeout(()=>{ if(S.subs.includes(s)) cb(snapOf(r)); }, 0); return ()=>{ S.subs = S.subs.filter(x=>x!==s); }; }
const refused = p => (S.refuse && /^lists\\/[^/]+\\/items\\//.test(p)) || (S.refusePhotos && /\\/photos\\//.test(p));
const deny = () => Object.assign(new Error('Missing or insufficient permissions.'), { code:'permission-denied' });
export async function setDoc(r, d){ if(refused(r.path)) throw deny(); S.writes.push({ path:r.path, data:J(d), batch:0 }); S.docs[r.path]=J(d); fire(); }
export function writeBatch(){ const ops=[]; return { set(r,d){ ops.push([r,d]); },
  async commit(){ if(ops.some(([r])=>refused(r.path))) throw deny(); S.batches=(S.batches||0)+1;
    ops.forEach(([r,d])=>{ S.writes.push({ path:r.path, data:J(d), batch:S.batches }); S.docs[r.path]=J(d); }); fire(); } }; }
export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const FAKE = (y,m,d)=>`(()=>{ const T=new Date(${y},${m},${d},10,0,0).getTime(), OFF=T-Date.now(), _D=Date;
  class FD extends _D { constructor(...a){ if(a.length) super(...a); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } }
  FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy"), it("2","Bread","bakery")], itemTomb:{ "x9":500 }, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, v:2 }, o||{});
/* the server's records and this phone's cache, seeded before the app's module runs */
const seed = (o) => { o=o||{}; return `(() => {
  const srv = ${JSON.stringify(o.srv||{ "lists/v101": DOC() })};
  window.__srv = { docs:srv, subs:[], writes:[], refuse:${!!o.refuse} };
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  ${o.cache===false ? '' : `const c=${JSON.stringify(o.cache||DOC())}; localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(c, { mv:2 })));`}
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_onb", JSON.stringify({done:1}));
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      if(o.date) await page.addInitScript(FAKE(...o.date)); await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800); };
    const V = JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
    const csp = src => { const h = V.headers.find(x=>x.source===src && x.headers.some(y=>y.key==='Content-Security-Policy')); return h ? h.headers.find(y=>y.key==='Content-Security-Policy').value : ''; };
    const A = csp('/'), B = csp('/index.html'), P = csp('/privacy.html'), C = csp('/concept.html');
    ok('the app\'s two policies are identical, and images come only from the app itself, data:, blob: and the reCAPTCHA mark', A && A===B && /img-src 'self' data: blob: https:\/\/www\.gstatic\.com\/recaptcha\/(;|$)/.test(A) && !/img-src[^;]* https:(;| |$)/.test(A), (A.match(/img-src[^;]*/)||[''])[0]);
    ok('the privacy and concept pages start from "nothing allowed"', /^default-src 'none'/.test(P) && /font-src 'self'/.test(P) && !/script-src/.test(P) && /^default-src 'none'/.test(C) && /script-src 'unsafe-inline'/.test(C), P.slice(0,60));
    /* the app served with its policy */
    const D = DOC({ items:[ it("1","Yogurt","dairy",{ note:"Greek" }), it("2","Bread","bakery"), it("3","Milk","dairy") ] });
    const CARDS = [ { id:"c1", name:"Flybuys", chain:"coles", num:"6008123412341234", photo:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }, { id:"c2", name:"Library", chain:"", num:"A123", photo:"" } ];
    const viol = [];
    const withPolicy = async (pth, policy, extra) => { if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route(u => { const x=new URL(u); return x.pathname===pth || (pth==='/index.html' && x.pathname==='/'); }, async r => { const res = await fetch(`http://127.0.0.1:${port}${pth}`); r.fulfill({ status:200, headers:{ 'content-type':'text/html; charset=utf-8', 'content-security-policy':policy }, body: await res.text() }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console', m => { const t=m.text(); if(/Content Security Policy|Refused to/i.test(t)) viol.push(t.slice(0,140)); else if(m.type()==='error' && !/Failed to load resource/i.test(t)) errors.push(t.slice(0,160)); });
      page.on('pageerror', e => errors.push('PAGEERR '+e.message));
      if(extra!==null) await page.addInitScript(seed({ srv:{ "lists/v101": D }, cache:D, extra }));
      await page.goto(`http://127.0.0.1:${port}${pth}${pth==='/index.html'?'?list=v101':''}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800); };
    await withPolicy('/index.html', A, `localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_theme","dark"); localStorage.setItem("ml_wall","wall-3"); localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(CARDS))});`);
    const up = await page.evaluate(()=>({ tiles:document.querySelectorAll('#zoomer .pill[data-pill]').length, font:getComputedStyle(document.body).fontFamily, bg:getComputedStyle(document.body).backgroundImage.slice(0,40) }));
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#cartNav, #cartNavS').first().click(); await page.waitForTimeout(400);
    await page.locator('#shopMenu').click(); await page.waitForTimeout(300); await page.locator('#smCard').click(); await page.waitForTimeout(400);
    await page.locator('#cardSheet [data-card-pick="c1"]').click(); await page.waitForTimeout(400);
    const photoBtn = page.locator('[data-card-view="photo"]'); if(await photoBtn.count()){ await photoBtn.click(); await page.waitForTimeout(300); }
    const cardImg = await page.evaluate(()=>{ const i=document.querySelector('#cardSheet .cardface img'); return i ? i.naturalWidth : -1; });
    ok('the app runs under its policy with no violation: list, wallpaper, dark theme, Settings, cards and a card\'s photo', up.tiles===3 && /Outfit/.test(up.font) && cardImg===1 && viol.length===0 && errors.length===0, JSON.stringify({ up, cardImg, viol:viol.slice(0,3) }));
    const blocked = await page.evaluate(()=>new Promise(res=>{ const i=new Image(); i.onload=()=>res('loaded'); i.onerror=()=>res('refused'); i.src='https://example.com/x.png'; setTimeout(()=>res('timeout'),4000); }));
    ok('…and an image from another site is refused, so the policy is really applied', blocked==='refused' && viol.some(v=>/img-src/.test(v)), blocked+' '+viol.slice(-1));
    viol.length = 0;
    await withPolicy('/privacy.html', P, null);
    const pv = await page.evaluate(()=>({ h:(document.querySelector('h1')||{}).textContent||'', font:getComputedStyle(document.body).fontFamily, len:document.body.innerText.length, loaded:[...document.fonts].some(f=>f.status==='loaded') }));
    ok('the privacy page, under its policy, shows its text in the app\'s font with no violation', pv.len>1500 && /Outfit/.test(pv.font) && viol.length===0, JSON.stringify({ pv, viol }));
    /* the live check */
    const { spawnSync } = require('child_process'); const tool = path.join(ROOT,'.claude','tools','live-check.js');
    const good = spawnSync('node', [tool, `http://127.0.0.1:${port}`, '--local', '--wait=2'], { encoding:'utf8' });
    ok('the live-check tool passes against this tree served locally', good.status===0 && /The live site matches this commit/.test(good.stdout) && !/FAIL/.test(good.stdout), good.stdout.slice(-120).replace(/\n/g,' | '));
    const http = require('http'); const fake = http.createServer((q,r)=>{ r.writeHead(200,{'content-type':'text/plain'}); r.end(/app\.js/.test(q.url) ? 'const APP_VERSION = "v0.01";' : 'x'); });
    await new Promise(r=>fake.listen(0,'127.0.0.1',r));
    /* run it without blocking this process: the fake site above is served BY this process */
    const bad = await new Promise(res => { let o=''; const c = require('child_process').spawn('node', [tool, `http://127.0.0.1:${fake.address().port}`, '--local', '--wait=1']);
      c.stdout.on('data', d => o += d); c.on('close', code => res({ status:code, stdout:o })); }); fake.close();
    ok('…and fails, naming the older version, when the site serves a different one', bad.status===1 && /FAIL  js\/app\.js is served and says v[\d.]+\s+served an older version: v0\.01/.test(bad.stdout), bad.stdout.slice(0,200).replace(/\n/g,' | '));
    const wf = fs.readFileSync(path.join(ROOT,'.github','workflows','live-check.yml'),'utf8'), rb = fs.readFileSync(path.join(ROOT,'docs','rollback.md'),'utf8');
    ok('the workflow runs it on every push to main and daily, read-only', /push:\s*\n\s*branches: \[main\]/.test(wf) && /schedule:/.test(wf) && /contents: read/.test(wf) && /live-check\.js https:\/\/grocery-app-2-sage\.vercel\.app/.test(wf));
    ok('the rollback page names the ways back: the previous deployment, the revert, the worker\'s kill switch, settings and rules, and the data', /Instant Rollback/.test(rb) && /Revert/.test(rb) && /kill switch/.test(rb) && /Rules/.test(rb) && /Restore/.test(rb));
    ok('the worker really has the kill switch the page points to', /kill switch/i.test(fs.readFileSync(path.join(ROOT,'sw.js'),'utf8')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
