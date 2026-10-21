/* v2.48 — first-time use (Do later L1; docs/onboarding-proposal.md, with the household's answers: shops when Shop is first
   opened, pinning on the first tick, the aisle map offered on a second visit, "Never" per shop).

   WHAT THESE CHECKS HAVE TO PROVE:
   - a NEW phone (it gave its name here) gets "Where do you usually shop?" the first time it is in Shop: chips untick and add
     shops, Done saves the answer and it is not asked again; then the one-line how-it-works tip, once;
   - a phone already in use (the household's) gets neither;
   - ticking at a picked shop with no location offers to pin it; Not now lasts the visit, Never is per shop; Pin it saves
     the location;
   - auto-detect at an unknown place, after a tick, asks which shop this is; the answer pins it AND gives the recent ticks
     that shop (so the walking order learns from this trip) — and nothing else is learned from a tick;
   - the second day at a shop with no aisle map offers one; Start opens the aisle map, Never is per shop;
   - ONE card at a time: the receipt card wins over a first-time card;
   - ml_onb is in BOTH appearance-slot exclusion lists, and Settings brings the questions back.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; let cb=null; window.__auth=A; window.__calls=[];
const user=(uid,email)=>({ uid, email:email||null, isAnonymous:!email, getIdToken: async()=>'tok-'+uid });
export function initializeAuth(){ if(window.__restore){ A.authStateReady=()=>new Promise(r=>setTimeout(()=>{ A.currentUser=user('anon1'); r(); }, 300)); } return A; }
export function onAuthStateChanged(a, f){ cb=f; setTimeout(()=>f(A.currentUser), 0); return ()=>{}; }
export async function signInAnonymously(){ A.currentUser=user('anon1'); window.__calls.push('anon'); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function sendSignInLinkToEmail(a, email, s){ window.__calls.push('send'); window.__sent={ email, s };
  if(window.__sendFail){ const e=new Error('x'); e.code=window.__sendFail; throw e; } }
export function isSignInWithEmailLink(a, url){ return /[?&]oobCode=/.test(String(url||'')) && /[?&]mode=signIn/.test(String(url||'')); }
export const EmailAuthProvider={ credentialWithLink:(email, url)=>({ email, url }) };
export async function linkWithCredential(u, cred){ window.__calls.push('link:'+cred.email);
  if(window.__taken){ const e=new Error('x'); e.code='auth/credential-already-in-use'; throw e; }
  u.email=cred.email; u.isAnonymous=false; if(cb) cb(u); return { user:u }; }
export async function signInWithEmailLink(a, email, url){ window.__calls.push('signin:'+email); A.currentUser=user('acct2', email); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function signOut(){ window.__calls.push('out'); A.currentUser=null; if(cb) cb(null); }`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const ITEMS=[it("1","Milk","dairy"),it("2","Bread","bakery"),it("3","Apples","fruit")];
const DAY=(o)=>{ const d=new Date(Date.now()+o*864e5); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, ${JSON.stringify(o.doc||{})})));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}"); localStorage.setItem("ml_installhint","1");
  ${o.onb ? `localStorage.setItem("ml_onb", ${JSON.stringify(JSON.stringify(o.onb))});` : ''}
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true,
      geolocation: o.geo || { latitude:0, longitude:0 }, permissions: o.noGeo ? [] : ['geolocation'] });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const has = sel=>page.evaluate(s=>!!document.querySelector(s), sel);
  const onb = async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('ml_onb'))||'{}');
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const doc = async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('ml_cache_v101'))||'{}');
  try {
    /* ── a new phone: Your shops, then the tip ───────────────────── */
    await mk({ onb:{ fresh:1 } });
    ok('a new phone in Shop is asked where it usually shops, with the shops as chips', await has('#onbShops') && await page.locator('#onbShops [data-onb-store]').count() >= 3, '');
    await shot('shops');
    const first = await page.locator('#onbShops [data-onb-store]').first().getAttribute('data-onb-store');
    await tap(`#onbShops [data-onb-store="${first}"]`);
    ok('…a chip unticks a shop (hidden on the list), and the card stays up', ((await doc()).storeMeta||{})[first] && (await doc()).storeMeta[first].hidden === true && await has('#onbShops'), JSON.stringify((await doc()).storeMeta));
    await page.fill('#onbShopName', 'Corner Grocer'); await tap('#onbShopAdd');
    ok('…"Add another shop" adds it to the list\'s shops', ((await doc()).stores||[]).some(s=>s.name==='Corner Grocer') && /Corner Grocer/.test(await page.locator('#onbShops').textContent()), '');
    ok('…only one first-time card at a time (no tip yet)', !(await has('#onbTip')), '');
    await tap('#onbShopsDone');
    ok('Done saves the answer and the card goes', (await onb()).shops === 'done' && !(await has('#onbShops')), JSON.stringify(await onb()));
    ok('then the how-it-works tip shows, once', await has('#onbTip'), '');
    await shot('tip');
    await tap('#onbTipOk');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    ok('…Got it, and after a reload neither comes back', !(await has('#onbTip')) && !(await has('#onbShops')) && (await onb()).tip === 1, '');

    /* ── a phone already in use ──────────────────────────────────── */
    await mk({});
    ok('a phone already in use (the household\'s) gets neither the shops card nor the tip', !(await has('#onbShops')) && !(await has('#onbTip')), '');

    /* ── pin a picked shop with no location ──────────────────────── */
    const PIN = { store:'c1', geo:{ latitude:-37.9, longitude:145.1 }, doc:{ stores:[{id:'c1',name:'Corner Grocer',aisles:[]}] },
      items:[it("1","Milk","dairy",{checked:true,checkedAt:Date.now(),checkedStore:'c1',checkedBy:'O'}),it("2","Bread","bakery")] };
    await mk(PIN);
    ok('ticking at a picked shop with no location offers to pin it', await has('#onbPin') && /Corner Grocer/.test(await page.locator('#onbPin').textContent()), '');
    await shot('pin');
    await tap('#onbPinLater');
    ok('…Not now: gone for this visit', !(await has('#onbPin')), '');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    ok('…and back on the next visit', await has('#onbPin'), '');
    await tap('#onbPinGo'); await page.waitForTimeout(800);
    const locs = JSON.parse(await page.evaluate(()=>localStorage.getItem('ml_storelocs'))||'{}');
    ok('Pin it saves this spot as the shop\'s location, and the card goes', locs.c1 && Math.abs(locs.c1.lat+37.9)<0.001 && !(await has('#onbPin')), JSON.stringify(locs));
    await mk(PIN); await tap('#onbPinNever');
    ok('Never is remembered for that shop only', (await onb()).pin && (await onb()).pin.c1 === 'never' && !(await has('#onbPin')), JSON.stringify(await onb()));

    /* ── auto-detect found nothing: which shop is this? ──────────── */
    const WH = { store:'auto', extra:`localStorage.setItem("ml_useloc","1"); localStorage.setItem("ml_sorts", JSON.stringify({}));`, doc:{ stores:[{id:'c1',name:'Corner Grocer',aisles:[]}] },
      items:[it("1","Milk","dairy",{checked:true,checkedAt:Date.now()-60000,checkedStore:'',checkedBy:'O'}),it("2","Bread","bakery",{checked:true,checkedAt:Date.now()-9*3600000,checkedStore:'',checkedBy:'O'}),it("3","Apples","fruit")] };
    await mk(WH); await page.waitForTimeout(800);
    ok('after a tick where auto-detect knows no shop, it asks which shop this is', await has('#onbWhich') && await has('#onbWhich [data-onb-here="c1"]'), await page.evaluate(()=>JSON.stringify(document.querySelector('.installcard')?.id||'none')));
    await shot('which');
    if(await has('#onbWhich [data-onb-here="c1"]')){ await tap('#onbWhich [data-onb-here="c1"]'); await page.waitForTimeout(800); }
    const d2 = await doc(), l2 = JSON.parse(await page.evaluate(()=>localStorage.getItem('ml_storelocs'))||'{}');
    ok('…the answer pins the shop here and gives this trip\'s ticks that shop', l2.c1 && Math.abs(l2.c1.lat)<0.001 && d2.items.find(i=>i.id==='1').checkedStore==='c1', JSON.stringify(l2)+' '+JSON.stringify(d2.items.map(i=>i.checkedStore)));
    ok('…but not a tick from hours ago, and nothing else changes on the items', d2.items.find(i=>i.id==='2').checkedStore==='' && !d2.items.find(i=>i.id==='3').checked, '');
    await mk(Object.assign({}, WH, { noGeo:true }));
    ok('with location refused, it does not ask (nothing could be pinned)', !(await has('#onbWhich')), '');

    /* ── the aisle map on a second visit ─────────────────────────── */
    const MAP = { store:'c1', doc:{ stores:[{id:'c1',name:'Corner Grocer',aisles:[],lat:-37.9,lng:145.1}] }, onb:{ visits:{ c1:[DAY(-3), DAY(0)] } } };
    await mk(MAP);
    ok('the second day at a shop with no aisle map offers one', await has('#onbMap'), '');
    await shot('map');
    await tap('#onbMapGo');
    ok('…Start opens the aisle map for that shop', await has('#amSheet') && !(await has('#onbMap')), '');
    await mk(Object.assign({}, MAP, { onb:{ visits:{ c1:[DAY(0)] } } }));
    ok('…not on the first day', !(await has('#onbMap')), '');
    await mk(MAP); await tap('#onbMapNever');
    ok('…Never is remembered for that shop', (await onb()).map && (await onb()).map.c1==='never' && !(await has('#onbMap')), '');
    await page.evaluate(()=>{ const b=[...document.querySelectorAll('.tile,.pill,[data-id]')].find(e=>/Milk/.test(e.textContent)); });
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const tg = src.slice(src.indexOf('function toggleItem('), src.indexOf('function toggleItem(')+900);
    ok('a tick only counts the day for this question (onbVisit) — nothing else is learned from it', /onbVisit\(it\.checkedStore\)/.test(tg) && !/aiLearn|purchLog|histLog\("bought/.test(tg), '');

    /* ── one at a time, and the setting ──────────────────────────── */
    await mk({ onb:{ fresh:1, shops:'done' }, extra:`localStorage.setItem("ml_rcptnudge", String(Date.now()));` });
    ok('the receipt card wins: no first-time card under it', await has('#rcNudge') && !(await has('#onbTip')), '');
    ok('ml_onb is kept in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_onb\$/.test(x)).length===2, '');
    await mk({ onb:{ fresh:1, shops:'skip', tip:1, visits:{ c1:[DAY(0)] } } });
    await tap('#setNav'); await page.locator('#optOnbReset').scrollIntoViewIfNeeded(); await tap('#optOnbReset');
    const o2 = await onb();
    ok('Settings › First-time questions › Ask again clears the answers and keeps the visit days', o2.fresh===1 && !o2.shops && !o2.tip && o2.visits && o2.visits.c1, JSON.stringify(o2));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
