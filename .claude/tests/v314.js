/* v3.14 — H4, part 2: Smart add's review, the card editor and the receipt check redraw only themselves.

   WHAT THESE CHECKS HAVE TO PROVE:
   - in Smart add's review a pick (open a row, quantity +, a category, unselect a row) patches the sheet in place: the sheet
     element and the page's tiles behind it are the same elements (the page was not rebuilt), and the result shows;
   - a field being typed in (an item's name) keeps its focus and its text across a + tap;
   - what was picked is what Confirm adds;
   - the card editor's and the receipt check's in-sheet picks do the same (see their checks below). */
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
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const D = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ] });
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE });
    await ctx.route('**/api/parse', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[
      { name:"Apples", qty:1, category:"fruit", weight:"" }, { name:"Leeks", qty:1, category:"vegetable", weight:"" }, { name:"Rice", qty:1, category:"bulk", weight:"" } ] }) }));
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.locator('#mainInput').fill('apples, leeks, rice'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(400);
    await page.locator('[data-add-smart]').first().click(); await page.waitForTimeout(1200);
    const mark = () => page.evaluate(() => { window.__sh = document.getElementById('smartSheetEl'); window.__tile = document.querySelector('#zoomer .pill[data-pill="1"]'); });
    const same = () => page.evaluate(() => ({ sheet: !!window.__sh && window.__sh === document.getElementById('smartSheetEl'), page: !!window.__tile && window.__tile === document.querySelector('#zoomer .pill[data-pill="1"]') }));
    await mark();
    await page.evaluate(() => document.querySelector('[data-smart-edit="0"]').click()); await page.waitForTimeout(300);
    const s1 = await same(); const open1 = await page.locator('[data-smart-name="0"]').count();
    ok('Smart add: opening a row patches the sheet in place (same sheet, the page behind not rebuilt)', s1.sheet && s1.page && open1===1, JSON.stringify(s1));
    await page.locator('[data-smart-name="0"]').click(); await page.keyboard.press('End'); await page.keyboard.type(' red');
    await page.evaluate(() => document.querySelector('[data-smart-q="0|1"]').click()); await page.waitForTimeout(300);
    const f = await page.evaluate(() => ({ act: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.smartName : null, val: (document.querySelector('[data-smart-name="0"]')||{}).value, head:(document.querySelector('.smartchip .smartchip-head')||{}).textContent }));
    const s2 = await same();
    ok('…a + tap while the name is being typed keeps the field, its focus and its text, and shows 2×', f.act==='0' && /Apples red/i.test(f.val) && /2×/.test(f.head) && s2.sheet && s2.page, JSON.stringify({ f, s2 }));
    await page.evaluate(() => document.querySelector('[data-smart-copen="0"]').click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-smart-cat="0|vegetable"]').click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-smart-sel="2"]').click()); await page.waitForTimeout(300);
    const s3 = await same();
    ok('…a category pick and unselecting a row patch in place too', s3.sheet && s3.page, JSON.stringify(s3));
    await page.locator('#smartConfirm').click(); await page.waitForTimeout(900);
    const st = await page.evaluate(() => (JSON.parse(localStorage.getItem('ml_cache_v101')||'{}').items||[]).map(i => i.name + '|' + i.qty + '|' + i.cat));
    ok('what was picked is what Confirm adds (Apples red ×2 in vegetables, Leeks, no Rice)', st.some(x => /^apples red\|2\|vegetable$/i.test(x)) && st.some(x => /^leeks\|1\|/i.test(x)) && !st.some(x => /^rice\|/i.test(x)), JSON.stringify(st));
    /*CARDS-AND-RECEIPT*/
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
