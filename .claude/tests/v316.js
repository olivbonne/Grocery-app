/* v3.16 — card photos live in IndexedDB, not in localStorage.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a card photo kept the old way (inline in ml_cards) is moved at start: ml_cards then says "idb" and the photo is in the
     IndexedDB store "ml-cards" under the card's id — so it no longer takes the localStorage space;
   - after a relaunch the card still shows its photo;
   - "No photo" + Save removes it from the store too;
   - Forget everything on this phone deletes the photos (the app starts again with an empty store). */
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
    const BASE='localStorage.setItem("ml_nosmall","1");';
    const CARDS = [ { id:"c1", name:"Flybuys", chain:"coles", num:"6008123412341234", photo:"" }, { id:"c2", name:"Everyday Rewards", chain:"woolworths", num:"9355123412345", photo:"" },
      { id:"c3", name:"Dan Murphy's", chain:"", num:"123456789", photo:"" }, { id:"c4", name:"Library", chain:"", num:"A1234567", photo:"" }, { id:"c5", name:"Priceline Sister Club", chain:"", num:"5551234", photo:"" } ];
    const D = DOC({ items:[ it("1","Milk","dairy") ] });
    const withCards = cs => BASE + `localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(cs))});`;
    const stored = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cards')||'[]').map(c=>c.id+':'+c.name));
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const CARDS2 = [ { id:"c1", name:"Flybuys", chain:"coles", num:"6008123412341234", photo:PNG }, { id:"c2", name:"Library", chain:"", num:"A1234567", photo:"" } ];
    const idb = () => page.evaluate(() => new Promise(res => { try{ const r = indexedDB.open('ml-cards'); r.onsuccess = () => { const db = r.result;
      if(!db.objectStoreNames.contains('photos')){ db.close(); return res({}); } const tx = db.transaction('photos'), st = tx.objectStore('photos'), out = {};
      const c = st.openCursor(); c.onsuccess = () => { const k = c.result; if(k){ out[k.key] = String(k.value).slice(0, 30); k.continue(); } else { db.close(); res(out); } }; c.onerror = () => res({ err:1 }); };
      r.onerror = () => res({ err:2 }); }catch(e){ res({ err:String(e) }); } }));
    const lsCards = () => page.evaluate(() => JSON.parse(localStorage.getItem('ml_cards')||'[]').map(c => c.id + ':' + String(c.photo).slice(0, 12)));
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:withCards(CARDS2) }); await page.waitForTimeout(1500);
    const l1 = await lsCards(), d1 = await idb();
    ok('an inline photo is moved at start: ml_cards says "idb", the store holds the photo under the card\'s id', l1.join()==='c1:idb,c2:' && /^data:image\/png/.test(d1.c1||'') && !('c2' in d1), JSON.stringify({ l1, d1 }));
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800);
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smCard').click(); await page.waitForTimeout(500);
    await page.locator('#cardSheet [data-card-pick="c1"]').first().click(); await page.waitForTimeout(400);
    const pv = page.locator('[data-card-view="photo"]'); if(await pv.count()) { await pv.click(); await page.waitForTimeout(300); }
    const shown = await page.evaluate(() => [...document.querySelectorAll('#cardSheet img')].map(i => i.getAttribute('src').slice(0, 22)));
    ok('after a relaunch the card still shows its photo (read from the store)', shown.some(s => s.startsWith('data:image/png')), JSON.stringify(shown));
    await page.locator('#cardEditThis').click(); await page.waitForTimeout(500);
    await page.locator('#ceNoPhoto').click(); await page.waitForTimeout(300); await page.locator('#ceSave').click(); await page.waitForTimeout(800);
    const l2 = await lsCards(), d2 = await idb();
    ok('"No photo" + Save removes it from the store and from ml_cards', l2.join()==='c1:,c2:' && !('c1' in d2), JSON.stringify({ l2, d2 }));
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:withCards(CARDS2) }); await page.waitForTimeout(1500);
    page.once('dialog', d => d.accept());
    await page.locator('#setNav').click(); await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('optForget').click()); await page.waitForTimeout(2500);
    const d3 = await idb(), l3 = await lsCards();   // the app starts again after Forget, and opens an empty store
    ok('Forget everything on this phone deletes the photos (and the cards)', Object.keys(d3).length===0 && l3.length===0, JSON.stringify({ d3, l3 }));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
