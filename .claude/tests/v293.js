/* v2.93 — the household's batch of 2 Nov 2026 (screenshots of the Hardware store list).

   WHAT THESE CHECKS HAVE TO PROVE:
   1. (bug, lesson 64) adding "hooks" and +1 in the + sheet's panel, then the panel's Save and the return key, leaves ONE
      item "hooks ×2" (it also added "Hooks 2×"); "door" with the note "Blue", Save, return leaves ONE "door · Blue" (it also
      added a plain "Door"); typing a second item after Save adds only that one;
   2. one page margin: Plan, Shop and Settings start at the same left edge, and Customise the look › Page margins (Left)
      moves all three; the setting says so (its hint names the three pages);
   3. the card and receipt prompts after a shop come down from under the top bar, together in one panel that stays put when
      the page scrolls, with their buttons working ("Not now" on both closes the panel).

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. The fake database is
   v2.58's (writes echo back). */
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
const refused = p => S.refuse && /^lists\\/[^/]+\\/items\\//.test(p);
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
    const it2=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
    const D = DOC({ items:[ it2("1","Yogurt","dairy",{ note:"Blueberrie" }), it2("2","Dates","fruit") ] });
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const items = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).filter(i=>/yogurt/i.test(i.name)).map(i=>({ id:i.id, note:i.note||"", cat:i.cat })); });



    const all = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).map(i=>i.name.toLowerCase()+'|'+(i.note||'')+'|'+i.qty).sort(); });
    const E = DOC({ items:[] });
    const res = {};
    for(const sc of ['hooks','door','next']){
      await mk({ srv:{ "lists/v101": E }, cache:E, extra:BASE });
      await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
      await page.keyboard.type(sc==='door'?'door':'hooks'); await page.waitForTimeout(400);
      await page.locator('#addSheetBody [data-add-typed]').first().click(); await page.waitForTimeout(600);
      if(sc==='door'){ await page.locator('#addSheetBody [data-ae-note]').first().click(); await page.keyboard.type('Blue'); }
      else await page.locator('#addSheetBody button[aria-label="More"]').first().click();
      await page.waitForTimeout(400);
      await page.locator('#addEditDone').click(); await page.waitForTimeout(500);
      const bar = await page.evaluate(()=>document.getElementById('mainInput').value);
      if(sc==='next'){ await page.keyboard.type('screws'); await page.waitForTimeout(300); }
      await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
      res[sc] = { bar, items:await all() }; }
    ok('+ sheet: "hooks" +1 → Save → return leaves one item, hooks ×2 (no "Hooks 2×"), and the bar is empty after Save', res.hooks.items.join()==='hooks||2' && res.hooks.bar==='', JSON.stringify(res.hooks));
    ok('…"door" with the note "Blue" → Save → return leaves one item, door · Blue (no plain Door)', res.door.items.join()==='door|Blue|1', JSON.stringify(res.door));
    ok('…and typing the next item after Save adds only that one (hooks ×2, screws)', res.next.items.join()==='hooks||2,screws||1', JSON.stringify(res.next));

    /* ── 2. one page margin ── */
    const D2 = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ] });
    const edges = ()=>page.evaluate(async()=>{ const out={}; const btn=[...document.querySelectorAll('#bottomnav .navbtn')];
      const left=()=>{ const z=document.getElementById('zoomer'); if(!z) return null; const kids=[...z.querySelectorAll('*')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>40 && r.height>10 && getComputedStyle(e).position!=='fixed'; });
        return Math.round(Math.min(...kids.map(e=>e.getBoundingClientRect().left))); };
      for(const [k,i] of [['plan',0],['shop',1],['settings',2]]){ btn[i].click(); await new Promise(r=>setTimeout(r,900)); out[k]=left(); }
      return out; });
    await mk({ srv:{ "lists/v101": D2 }, cache:D2, extra:BASE });
    const e14 = await edges();
    await mk({ srv:{ "lists/v101": D2 }, cache:D2, extra:BASE+'localStorage.setItem("ml_padl","30");' });
    const e30 = await edges();
    ok('one page margin: Plan, Shop and Settings start at the same left edge, and Page margins › Left 30 moves all three by the same amount',
      e14.plan===e14.shop && e14.shop===e14.settings && e30.plan===e30.shop && e30.shop===e30.settings && e30.shop-e14.shop>=12, JSON.stringify({ e14, e30 }));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8'), src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('…and the setting says it is for every page (with its French)', src.includes('t("The space around every page — Plan, Shop and Settings.")') && fr.includes('"The space around every page — Plan, Shop and Settings."') && fr.includes('"At the till"'));

    /* ── 3. the till prompts from the top ── */
    await mk({ srv:{ "lists/v101": D2 }, cache:D2, extra:BASE+'localStorage.setItem("ml_store","dand"); localStorage.setItem("ml_cardnudge", String(Date.now())); localStorage.setItem("ml_rcptnudge", String(Date.now()));' });
    const tt = ()=>page.evaluate(()=>{ const p=document.getElementById('tillTop'); if(!p) return null; const r=p.getBoundingClientRect(), hb=(document.querySelector('.topbar, header, #topbar')||{getBoundingClientRect:()=>({bottom:0})}).getBoundingClientRect();
      return { top:Math.round(r.top), h:Math.round(r.height), pos:getComputedStyle(p).position, card:!!p.querySelector('#cardNudge'), rc:!!p.querySelector('#rcNudge'), inList:!!document.querySelector('#zoomer #cardNudge, #zoomer #rcNudge') }; });
    const t0 = await tt();
    await page.evaluate(()=>window.scrollTo(0, 400)); await page.waitForTimeout(400);
    const t1 = await tt();
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-till.png') });
    ok('after a shop, the card and receipt prompts come down together in one panel under the top bar — not in the list — and it stays put when the page scrolls',
      t0 && t0.pos==='fixed' && t0.card && t0.rc && !t0.inList && t0.top>=40 && t0.top<200 && t1 && t1.top===t0.top, JSON.stringify({ t0, t1 }));
    await page.locator('#tillTop #cardNudgeNo').click(); await page.waitForTimeout(400);
    const t2 = await tt();
    await page.locator('#tillTop #rcNudgeNo').click(); await page.waitForTimeout(400);
    const t3 = await tt();
    ok('…its buttons work: "Not now" on the card leaves the receipt prompt; "Not now" on that closes the panel', t2 && !t2.card && t2.rc && t3===null, JSON.stringify({ t2, t3 }));
    if(out) await page.screenshot({ path:out });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
