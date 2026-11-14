/* v3.17 — Undo for the last few actions.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a delete's toast says the name as written ("Salt & pepper deleted", not "&amp;"), and its Undo puts the item back;
   - after the toast is gone, the ⋯ menu offers "Undo: …" for the recent actions, newest first, and it still works;
   - an undo puts back only what that action changed: another item changed since keeps its change;
   - a Smart add batch can be undone; an item from it that was changed since is left, and the toast says so. */
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
    const D = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery"), it("3","Salt & pepper","pantry") ] });
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE });
    await ctx.route('**/api/parse', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[
      { name:"Apples", qty:1, category:"fruit", weight:"" }, { name:"Leeks", qty:1, category:"vegetable", weight:"" } ] }) }));
    const hold = async sel => { const t = page.locator(sel).first(); await t.dispatchEvent('pointerdown'); await page.waitForTimeout(700); await t.dispatchEvent('pointerup'); await page.waitForTimeout(700); };
    const names = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ml_cache_v101')||'{}').items||[]).map(i => i.name + (i.checked ? '✓' : '') + (i.qty>1 ? '×'+i.qty : '')).sort().join(','));
    const toastT = () => page.evaluate(() => (document.querySelector('#toast span')||{}).textContent || '');
    await hold('#zoomer .pill[data-pill="3"]'); await page.locator('#delBtn').click(); await page.waitForTimeout(500);
    const t1 = await toastT(); const n1 = await names();
    ok('a delete\'s toast names the item as written ("Salt & pepper", not "&amp;")', /Salt & pepper/.test(t1) && !/&amp;/.test(t1) && !/Salt/.test(n1), JSON.stringify({ t1, n1 }));
    await page.locator('#undoBtn').click(); await page.waitForTimeout(500);
    ok('…and its Undo puts the item back', /Salt & pepper/.test(await names()), await names());
    /* an action, then another change, then the undo from the menu after the toast is gone */
    await hold('#zoomer .pill[data-pill="1"]'); await page.locator('#delBtn').click(); await page.waitForTimeout(400);
    await page.locator('#zoomer .pill[data-pill="2"]').click(); await page.waitForTimeout(600);   // tick Bread (a change after the delete)
    await page.waitForTimeout(5600);
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-undo]')].map(b => b.textContent.replace(/\s+/g,' ').trim()));
    ok('after the toast is gone the ⋯ menu offers the recent undos, newest first', rows.length >= 1 && /Milk deleted/.test(rows[0]), JSON.stringify(rows));
    await page.locator('[data-undo]').first().click(); await page.waitForTimeout(600);
    const n2 = await names();
    ok('…the menu\'s Undo puts Milk back, and Bread keeps the tick it got since', /Milk(,|$)/.test(n2) && /Bread✓/.test(n2), n2);
    /* Smart add batch, one of its items changed since */
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.locator('#mainInput').fill('apples, leeks'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(400);
    await page.locator('[data-add-smart]').first().click(); await page.waitForTimeout(1200);
    await page.locator('#smartConfirm').click(); await page.waitForTimeout(900);
    const n3 = await names();
    await hold('#zoomer .pill:has-text("Apples")'); await page.evaluate(() => document.getElementById('qPlus').click()); await page.waitForTimeout(200); await page.locator('#saveBtn').click(); await page.waitForTimeout(600);
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const rows2 = await page.evaluate(() => [...document.querySelectorAll('[data-undo]')].map(b => b.textContent.replace(/\s+/g,' ').trim()));
    const smartRow = page.locator('[data-undo]', { hasText:/Smart add/ }).first(); await smartRow.click(); await page.waitForTimeout(600);
    const n4 = await names(), t4 = await toastT();
    ok('a Smart add batch can be undone: Leeks goes, Apples (changed since) stays, and the toast says one was left', /Apples×2/.test(n3 + n4) && !/Leeks/.test(n4) && /Apples×2/.test(n4) && /1 changed since/.test(t4), JSON.stringify({ n3, rows2, n4, t4 }));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
