/* v3.10 — U5 Edit item, essentials first; the ⋯ menu's Store row folds; French for the duplicates card.

   WHAT THESE CHECKS HAVE TO PROVE:
   - Edit item opens with name, note, quantity, unit and category, and a "More" row whose value says what is set inside
     (the shop, Urgent / If on sale, Photo) — the photo, Where to buy and the flags are not drawn until it opens;
   - More opens in place (the sheet is patched, the name being typed survives), shows them, and they still work (a flag
     tapped and saved is stored); the next item opens folded again; a Regular has More too;
   - the ⋯ menu's Store row shows only the chosen shop and Change; Change lists every shop; a pick stores it and folds the
     row again; folded, it saves at least 150px with eight shops (the menu still scrolls a little to reach Report a problem);
   - the duplicates card and Change speak French. */
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
    const SP = out ? out.replace(/\.png$/,'') : '';
    const STORES = ["Coles","Woolworths","ALDI","IGA","Harris Farm","Costco","Spudshed","Fruit Shop"].map((n,k) => ({ id:"c"+(k+1), name:n, aisles:[] }));
    const D = DOC({ stores:STORES, items:[ it("1","Yogurt","dairy",{ note:"Greek", qty:3, weight:"1kg", tags:["urgent"], where:"c1" }), it("2","Bread","bakery"), it("3","Milk","dairy",{ qty:2 }) ],
      buyAgain:[{ name:"Butter", cat:"dairy", qty:1, ts:1 }] });
    const BASE = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_store","c1");';
    const hold = async sel => { const t = page.locator(sel).first(); await t.dispatchEvent('pointerdown'); await page.waitForTimeout(700); await t.dispatchEvent('pointerup'); await page.waitForTimeout(700); };
    const sheet = () => page.evaluate(() => { const s = document.querySelector('#sheet[data-look="edit"]'); if(!s) return null; const m = s.querySelector('#edMore');
      return { rows:[...s.querySelectorAll('.edrows > .edcell')].map(c => c.dataset.row), more:m ? { exp:m.getAttribute('aria-expanded'), val:(m.querySelector('.edval')||{}).textContent.trim() } : null,
        flags:s.querySelectorAll('[data-flag]').length, where:!!s.querySelector('#ewHead'), urgentOn:!!s.querySelector('[data-flag="urgent"].on'), name:(s.querySelector('#editName')||{}).value }; });
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE });
    await hold('#zoomer .pill[data-pill="1"]'); const e0 = await sheet();
    if(SP) await page.screenshot({ path: SP + '-edit.png' });
    ok('Edit item opens with the essentials: note, quantity, unit, category, then More — no photo, shop or flags drawn yet',
      e0 && e0.rows.join(',')==='note,qty,unit,cat,more' && e0.flags===0 && !e0.where && e0.more && e0.more.exp==='false', JSON.stringify(e0));
    ok('…and More says what is set inside it (the shop, Urgent)', e0 && /Coles/.test(e0.more.val) && /Urgent/.test(e0.more.val), e0 && e0.more.val);
    await page.fill('#editName', 'Yoghurt'); await page.click('#edMore'); await page.waitForTimeout(400); const e1 = await sheet();
    if(SP) await page.screenshot({ path: SP + '-edit-more.png' });
    ok('More opens in place: Where to buy and both flags appear, the name being typed survives', e1 && e1.more.exp==='true' && e1.where && e1.flags===2 && e1.urgentOn && e1.name==='Yoghurt', JSON.stringify(e1));
    await page.click('[data-flag="urgent"]'); await page.waitForTimeout(300); await page.click('#saveBtn'); await page.waitForTimeout(600);
    const st1 = await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); const i = (c.items||[]).find(x => x.id==='1') || {}; return { name:i.name, tags:i.tags }; });
    ok('…and they still work: Urgent tapped off and the new name are saved', st1.name==='Yoghurt' && !(st1.tags||[]).includes('urgent'), JSON.stringify(st1));
    await hold('#zoomer .pill[data-pill="3"]'); const e2 = await sheet();
    ok('the next item opens folded again, with an empty More value', e2 && e2.more && e2.more.exp==='false' && e2.flags===0 && e2.more.val.replace(/[▸▾]/g,'').trim()==='', JSON.stringify(e2));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    /* the ⋯ menu */
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE }); await page.click('#shopMenu'); await page.waitForTimeout(500);
    const menu = () => page.evaluate(() => { const m = document.querySelector('#shopMenuEl'); const r = m.getBoundingClientRect();
      return { cur:[...m.querySelectorAll('[data-sm-storecur]')].map(b => b.textContent.trim()), change:!!m.querySelector('#smStoreChange'), shops:m.querySelectorAll('[data-sm-store]').length,
        fits: m.scrollHeight <= m.clientHeight + 1 && r.bottom <= innerHeight + 1, sh:m.scrollHeight, ch:m.clientHeight, bottom:Math.round(r.bottom) }; });
    const m0 = await menu(); if(SP) await page.screenshot({ path: SP + '-menu.png' });
    ok('⋯ menu: the Store row shows only the chosen shop and Change', m0.cur.join()==='Coles' && m0.change && m0.shops===0, JSON.stringify(m0));
    ok('…which makes the menu at least 150px shorter than the open row (13 rows at a 46px tap height still need a short scroll to Report a problem)', true, '');
    await page.click('#smStoreChange'); await page.waitForTimeout(300); const m1 = await menu();
    ok('Change lists every shop (Auto-detect, Home, the eight, Other)', m1.shops >= 11 && m1.cur.length===0, JSON.stringify(m1));
    results[results.length-2] = ['…which makes the menu at least 150px shorter than the open row (13 rows at a 46px tap height still need a short scroll to Report a problem)', m1.sh - m0.sh >= 150, (m1.sh - m0.sh) + 'px saved'];
    await page.click('[data-sm-store="c3"]'); await page.waitForTimeout(400); const m2 = await menu(); const stored = await page.evaluate(() => localStorage.getItem('ml_store'));
    ok('a pick stores the shop and folds the row again, the menu still open', stored==='c3' && m2.cur.join()==='ALDI' && m2.shops===0, JSON.stringify({ stored, m2 }));
    /* French */
    const DD = DOC({ items:[ it("1","Carrot","vegetable"), it("2","Carrots","vegetable") ] });
    await mk({ srv:{ "lists/v101": DD }, cache:DD, extra:BASE + 'localStorage.setItem("ml_lang","fr");' });
    const fr = await page.evaluate(() => { const c = document.querySelector('.mergecard'); return c ? { t:c.querySelector('.predict-ttl').textContent, go:(c.querySelector('[data-merge-go]')||{}).textContent, x:(c.querySelector('[data-merge-x]')||{getAttribute:()=>''}).getAttribute('aria-label'), hide:c.querySelector('[data-merge-hide]').textContent } : null; });
    ok('the duplicates card speaks French', fr && /Doublons possibles/.test(fr.t) && fr.go==='Fusionner' && fr.x==='Garder séparés' && fr.hide==='Plus tard', JSON.stringify(fr));
    await page.click('#shopMenu'); await page.waitForTimeout(400);
    ok('…and so does Change', await page.evaluate(() => (document.querySelector('#smStoreChange')||{}).textContent === 'Changer'));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
