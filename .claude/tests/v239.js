/* v2.39 — architecture review, step A1: protection headers, the quiet sign-in, and the sign-in sent with every call to the
   app's own server. (The server side — lib/guard.js and the seven functions — is tested by api-guard.js.)

   WHAT THESE CHECKS HAVE TO PROVE:
   - with vercel.json's headers applied to every response, as Vercel will serve them, the app starts and its main screens
     (Shop, Settings, the look page, Plan, the card with its barcode, reading a card's photo) run with NO Content-Security-
     Policy violation — and the policy is really in force: a script the page did not ship is refused;
   - the page gets nosniff, a referrer policy, no framing, and a permissions policy that still allows the camera, the
     microphone and location for the app itself;
   - once the phone has signed in quietly, a call to /api/* carries "Authorization: Bearer <its token>"; Settings › Your data
     says it is signed in;
   - while Anonymous sign-in is off in Firebase, the app works exactly as before, the call carries no token, and Your data says
     why; with the auth library missing altogether (the other suites' stub), nothing breaks either.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,q)=>({id,name:n,cat:c,qty:q||1,weight:"",checked:false,tags:[]});
const NAMES=[["Salad rocket","vegetable",1],["High protein yogurt","fresh",2],["Frozen raspberries","fresh",2],["Cream","fresh",1],["Nexba lemon squash","others",2],["Popcorn Sweet and Salty","others",2],["Linguine","bulk",2],["Honey","bulk",1],["Tofu soft","asian",2]];
const ITEMS=NAMES.map(([n,c,q],i)=>it(String(i+1),n,c,q));
let CARDREPLY = { status:200, body:{ name:'Flybuys', number:'6008943218616910' }, delay:500 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ml_cache_v101")), ${JSON.stringify(o.doc||{})})));
  ${o.extra||''}
})()`; };

const VJ = JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
const rx = s=>new RegExp('^'+s.split('(.*)').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.*)')+'$');   // vercel.json's sources: plain paths and (.*)
const headersFor = p=>{ const o={}; for(const e of VJ.headers||[]) if(rx(e.source).test(p)) for(const h of e.headers) o[h.key.toLowerCase()]=h.value; return o; };
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; let cb=null;
export function initializeAuth(){ return A; }
export function onAuthStateChanged(a, f){ cb=f; setTimeout(()=>f(A.currentUser), 0); return ()=>{}; }
export async function signInAnonymously(){ if(window.__authMode==='off'){ const e=new Error('Firebase: Error (auth/operation-not-allowed).'); e.code='auth/operation-not-allowed'; throw e; }
  A.currentUser={ uid:'anon1', getIdToken: async()=>'tok-123' }; if(cb) cb(A.currentUser); return { user:A.currentUser }; }`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page, apiCalls=[];
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); apiCalls=[];
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    /* every same-origin response gets the headers Vercel would add (vercel.json); the routes below are registered later, so they win */
    await ctx.route(u=>new URL(u).port===String(port), async r=>{ const resp=await r.fetch(); const p=new URL(r.request().url()).pathname;
      r.fulfill({ response:resp, headers:Object.assign({}, resp.headers(), headersFor(p)) }); });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: (/firebase-auth\.js/.test(r.request().url()) && o.auth!=='none') ? AUTHSTUB : STUB }));
    await ctx.route('**/api/card', async r => { apiCalls.push(r.request().headers()); await new Promise(z=>setTimeout(z, 300));
      r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ name:'Flybuys', number:'6008943218616910' }) }); });
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(`window.__csp=[]; window.__authMode=${JSON.stringify(o.auth||'on')}; document.addEventListener('securitypolicyviolation', e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'')));`);
    await page.addInitScript(seed(o));
    const resp = await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); return resp; };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const csp = ()=>page.evaluate(()=>window.__csp.slice());
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const readCard = async()=>{ await tap('#shopMenu'); await tap('#smCard');
    if(!(await page.$('#cardPhotoGo'))) await tap('[data-card-addpanel]');   // a saved card opens first: the + dot is the add panel
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#cardPhotoGo').click()]);
    await fc.setFiles({ name:'card.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500); };
  /* SUPERSEDED by v2.40: the note is now the first line of "Your account" (#acctBox). Still protects what it says. */
  const yourData = async()=>{ await tap('#setNav'); return page.evaluate(()=>{ const n=document.querySelector('#authNote') || document.querySelector('#acctBox .acctline'); return n ? n.textContent : ''; }); };

  try{
    /* ── the headers ─────────────────────────────────────────────────── */
    const resp = await mk({ store:'dand', extra:`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify([{ id:'c1', name:'Flybuys', chain:'', num:'6008943218616910', photo:'' }]))});` });
    const h = resp ? await resp.allHeaders() : {};
    ok('the page is served with a Content-Security-Policy that pins its own scripts', /script-src 'self' 'sha256-/.test(h['content-security-policy']||'') && /frame-ancestors 'none'/.test(h['content-security-policy']||''), (h['content-security-policy']||'').slice(0,90));
    ok('…and nosniff, a referrer policy, no framing, and camera, microphone and location for the app itself', h['x-content-type-options']==='nosniff' && /strict-origin/.test(h['referrer-policy']||'') && h['x-frame-options']==='DENY'
       && /camera=\(self\)/.test(h['permissions-policy']||'') && /microphone=\(self\)/.test(h['permissions-policy']||'') && /geolocation=\(self\)/.test(h['permissions-policy']||''), JSON.stringify([h['x-frame-options'], h['permissions-policy']]));
    ok('the app starts under it', await page.evaluate(()=>!!document.querySelector('#zoomer .pill[data-pill]')), '');
    await shot('start');
    await tap('#shopMenu'); await tap('#smCard'); await tap('#cardClose');
    await tap('#setNav'); await page.waitForTimeout(300);
    await tap('#optLook').catch(()=>{}); await page.waitForTimeout(300); await tap('#lookBack').catch(()=>{});
    await tap('[id^="planNav"]:visible'); await page.waitForTimeout(400);
    await tap('[id^="cartNav"]:visible'); await page.waitForTimeout(400);
    await readCard();
    const v1 = await csp();
    ok('Shop, the card, Settings, the look page, Plan and reading a card run with no policy violation', v1.length===0, JSON.stringify(v1.slice(0,5)));
    const probe = await page.evaluate(()=>{ const s=document.createElement('script'); s.textContent='window.__injected=1'; document.body.appendChild(s); return new Promise(r=>setTimeout(()=>r({ ran:!!window.__injected, v:window.__csp.slice() }), 200)); });
    ok('…and the policy is in force: a script the page did not ship is refused', !probe.ran && probe.v.some(x=>/script-src/.test(x)), JSON.stringify(probe));

    /* ── signed in quietly: the token goes with the call ─────────────── */
    ok('once signed in, a call to the app\'s server carries the phone\'s token', apiCalls.length>=1 && apiCalls[0].authorization==='Bearer tok-123', JSON.stringify(apiCalls.map(c=>c.authorization||'')));
    await page.keyboard.press('Escape').catch(()=>{});
    await mk({});
    const n1 = await yourData();
    ok('Settings › Your data says the phone is signed in quietly', /signed in quietly/.test(n1), n1);

    /* ── Anonymous sign-in still off in Firebase ─────────────────────── */
    await mk({ auth:'off' });
    await readCard();
    ok('with Anonymous sign-in off in Firebase, reading a card still works, without a token', apiCalls.length>=1 && !apiCalls[0].authorization && await page.evaluate(()=>/Check the card/.test((document.querySelector('#ceTitle')||{}).textContent||'')), JSON.stringify(apiCalls));
    await page.keyboard.press('Escape').catch(()=>{});
    await mk({ auth:'off' });
    const n2 = await yourData();
    ok('…and Your data says why: it isn\'t turned on in Firebase yet', /isn't turned on in Firebase/.test(n2), n2);

    /* ── no auth library at all (what every other suite runs with) ───── */
    await mk({ auth:'none' });
    await readCard();
    ok('with no sign-in library at all, the app and its server calls work as before', apiCalls.length>=1 && !apiCalls[0].authorization, JSON.stringify(apiCalls));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  const errs = errors.filter(e=>!/Refused to execute inline script/.test(e));   // the probe above, on purpose
  ok('no console errors anywhere in the run', errs.length===0, JSON.stringify(errs.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
