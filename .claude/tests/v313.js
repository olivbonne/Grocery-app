/* v3.13 — drag to reorder the membership cards in My cards.

   WHAT THESE CHECKS HAVE TO PROVE:
   - in the My cards grid, holding a card and moving it drops it in the new place, and the stored order (ml_cards) — the
     order everywhere — follows; the other cards keep their relative order;
   - a quick tap still shows the card (no drag), and the tap that ends a drag does not open a card;
   - in edit mode the same drag works, and the earlier / later buttons still move a card one place. */
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
    const openMenuCard = async()=>{ await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smCard').click(); await page.waitForTimeout(500); };
    const box = async id => page.locator(`#cardSheet .cardtile[data-card-id="${id}"]`).boundingBox();
    const drag = async (from, to) => { const a = await box(from), b = await box(to);
      await page.mouse.move(a.x + a.width/2, a.y + a.height/2); await page.mouse.down(); await page.waitForTimeout(650);
      const tx = b.x + b.width*0.75, ty = b.y + b.height/2; for(let k=1;k<=8;k++){ await page.mouse.move(a.x + a.width/2 + (tx - a.x - a.width/2)*k/8, a.y + a.height/2 + (ty - a.y - a.height/2)*k/8); await page.waitForTimeout(30); }
      await page.mouse.up(); await page.waitForTimeout(500); };
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:withCards(CARDS) });
    await openMenuCard();
    await drag('c1', 'c3');
    const o1 = await stored(); const v1 = await page.evaluate(() => ({ grid:!!document.querySelector('#cardSheet .cardgrid'), title:(document.getElementById('cardTitle')||{}).textContent }));
    if(out) await page.screenshot({ path: out });
    ok('holding Flybuys and moving it past Dan Murphy\'s puts it there; the others keep their order', o1.map(x=>x.split(':')[0]).join()==='c2,c3,c1,c4,c5', JSON.stringify(o1));
    ok('…and the release does not open a card (the grid is still showing)', v1.grid && v1.title==='My cards', JSON.stringify(v1));
    await page.locator('#cardSheet .cardtile[data-card-id="c4"] .cardtile-open').click(); await page.waitForTimeout(500);
    const v2 = await page.evaluate(() => ({ grid:!!document.querySelector('#cardSheet .cardgrid'), title:(document.getElementById('cardTitle')||{}).textContent }));
    ok('a quick tap still shows the card', !v2.grid && v2.title==='Library', JSON.stringify(v2));
    await page.locator('#cardAll').click(); await page.waitForTimeout(400); await page.locator('#cardGridEdit').click(); await page.waitForTimeout(400);
    await drag('c5', 'c2');
    const o2 = await stored();
    ok('in edit mode the drag works too', o2.map(x=>x.split(':')[0]).join()==='c2,c5,c3,c1,c4', JSON.stringify(o2));
    await page.locator('[data-card-mv="c4|-1"]').click(); await page.waitForTimeout(400);
    const o3 = await stored();
    ok('…and "move earlier" still moves a card one place', o3.map(x=>x.split(':')[0]).join()==='c2,c5,c3,c4,c1', JSON.stringify(o3));
    ok('the cards were never changed, only their order', o3.length===5 && o3.includes('c3:Dan Murphy\'s'));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
