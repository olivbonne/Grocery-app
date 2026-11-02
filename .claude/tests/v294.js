/* v2.94 — the list record's old copies are emptied (S8 step 4); "What's in the fridge?".

   WHAT THESE CHECKS HAVE TO PROVE:
   1. a v3 list whose items are records already moves its Regulars, prices and spending to records (v2.75), and THEN — once
      the server has answered for every part — the list record's old arrays (items, itemTomb, buyAgain, baTomb, prices, spend)
      are written empty, with v 4 and parts unchanged; every record is still there; a local backup holding the old data was
      written first; the app still shows the items and Regulars after a relaunch;
   2. a v4 list whose old copy names an item the server does not hold keeps its old copies (nothing is cleared on a doubt);
   3. ⋯ › What's in the fridge?: the photo's products matched to the list ("Milk", "Eggs" — ticked to take off), the rest
      shown as "Also seen"; Take 2 off removes them and records no purchase and no Regular; a failed read says why.

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



    const srvDoc = ()=>page.evaluate(()=>{ const S=window.__srv, d=S.docs['lists/v101']||{}; const keys=Object.keys(S.docs);
      return { v:d.v, parts:d.parts, items:(d.items||[]).length, tomb:Object.keys(d.itemTomb||{}).length, ba:(d.buyAgain||[]).length, baTomb:Object.keys(d.baTomb||{}).length, prices:Object.keys(d.prices||{}).length, spend:(d.spend||[]).length,
        rec:{ items:keys.filter(k=>/\/items\//.test(k)).length, regs:keys.filter(k=>/\/regulars\//.test(k)).length, prices:keys.filter(k=>/\/prices\//.test(k)).length, spend:keys.filter(k=>/\/spend\//.test(k)).length } }; });
    const D3 = DOC({ v:3, parts:["items"], items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ], itemTomb:{ "x9":500 },
      buyAgain:[{ name:"Rice", cat:"bulk", qty:1, weight:"", sub:"", note:"", where:"", ts:2000 }], baTomb:{ "old|bulk":Date.now()-60000 },
      prices:{ milk:[{ p:3.1, s:"", sn:"Coles", d:"2026-10-20", q:1, w:"2 L", t:3000 }] },
      spend:[{ t:3000, d:"2026-10-20", s:"", sn:"Coles", tot:3.1, cats:{ dairy:3.1 } }] });
    const srv3 = { "lists/v101": D3, "lists/v101/items/1": D3.items[0], "lists/v101/items/2": D3.items[1], "lists/v101/items/x9": { id:"x9", gone:500 } };
    await mk({ srv:srv3, cache:D3, extra:BASE }); await page.waitForTimeout(2500);
    const s1 = await srvDoc();
    const snap = await page.evaluate(()=>{ const a=JSON.parse(localStorage.getItem('ml_snap_v101')||'[]'); const l=(a[0]||{}).list||{}; return { n:a.length, items:(l.items||[]).length, ba:(l.buyAgain||[]).length, prices:Object.keys(l.prices||{}).length, spend:(l.spend||[]).length }; });
    ok('a v3 list moves its parts and then empties the record\'s old copies — v 4, all four parts, every record still there',
      s1.v===4 && ['items','regulars','prices','spend'].every(x=>(s1.parts||[]).includes(x)) && s1.items===0 && s1.tomb===0 && s1.ba===0 && s1.baTomb===0 && s1.prices===0 && s1.spend===0
      && s1.rec.items>=2 && s1.rec.regs>=1 && s1.rec.prices>=1 && s1.rec.spend>=1, JSON.stringify(s1));
    ok('…a local backup with the old data was written first', snap.n>=1 && snap.items===2 && snap.ba===1 && snap.prices===1 && snap.spend===1, JSON.stringify(snap));
    const after = await page.evaluate(()=>({ tiles:[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(b=>b.textContent.trim()).join('|') }));
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(2000);
    const after2 = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return { tiles:[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(b=>b.textContent.trim()).join('|'), regs:(c.buyAgain||[]).map(r=>r.name).join(), prices:Object.keys(c.prices||{}).join() }; });
    ok('…and after a relaunch the list still shows Milk and Bread, with Rice in Regulars and the milk price kept', /Milk/.test(after2.tiles) && /Bread/.test(after2.tiles) && after2.regs==='Rice' && after2.prices==='milk', JSON.stringify({ after, after2 }));

    /* 2. a doubt keeps the old copies */
    const D4 = DOC({ v:4, parts:["items","regulars","prices","spend"], items:[ it("1","Milk","dairy"), it("7","Ghost","dairy") ], buyAgain:[], prices:{}, spend:[] });
    await mk({ srv:{ "lists/v101": D4, "lists/v101/items/1": D4.items[0] }, cache:D4, extra:BASE }); await page.waitForTimeout(2500);
    const s2 = await srvDoc();
    ok('a v4 list whose old copy names an item the server does not hold keeps its old copies', s2.items===2, JSON.stringify(s2));

    /* 3. the fridge */
    const F = DOC({ items:[ it("1","Milk","dairy"), it("2","Eggs","dairy"), it("3","Bread","bakery") ] });
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
    const fridgeTry = async(route)=>{ await mk({ srv:{ "lists/v101": F }, cache:F, extra:BASE });
      await ctx.route('**/api/fridge', route);
      await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#smFridge').click()]);
      await fc.setFiles({ name:'f.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1800);
      return page.evaluate(()=>{ const s=document.querySelector('#fridgeSheet'); return s ? s.textContent.replace(/\s+/g,' ').trim() : null; }); };
    const f1 = await fridgeTry(r=>r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[ { name:'milk', brand:'Pauls', size:'2L', qty:1, category:'fresh' }, { name:'eggs', brand:'', size:'', qty:6, category:'fresh' }, { name:'mustard', brand:'Maille', size:'', qty:1, category:'others' } ] }) }));
    const checks = await page.evaluate(()=>[...document.querySelectorAll('#fridgeSheet [aria-checked]')].map(c=>c.getAttribute('aria-checked')==='true'));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-fridge.png') });
    ok('⋯ › What\'s in the fridge?: Milk and Eggs are matched to the list (ticked to take off), mustard is shown as also seen',
      f1 && /On your list/.test(f1) && /Milk/.test(f1) && /Eggs/.test(f1) && /Also seen/.test(f1) && /mustard/i.test(f1) && checks.length===2 && checks.every(Boolean), JSON.stringify({ f1, checks }));
    const before = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return { purch:JSON.stringify(c.purch||{}), regs:(c.buyAgain||[]).length }; });
    await page.locator('#fridgeSheet button', { hasText:/Take 2 off the list/ }).click(); await page.waitForTimeout(800);
    const fl = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return { items:(c.items||[]).map(i=>i.name).join(), purch:JSON.stringify(c.purch||{}), regs:(c.buyAgain||[]).length, sheet:!!document.querySelector('#fridgeSheet') }; });
    ok('…"Take 2 off the list" leaves only Bread, and records no purchase and no Regular (having it at home is not buying it)', fl.items==='Bread' && fl.purch===before.purch && fl.regs===before.regs && !fl.sheet, JSON.stringify({ before, fl }));
    const f2 = await fridgeTry(r=>r.fulfill({ status:502, contentType:'application/json', body:JSON.stringify({ error:'Parse failed', code:'busy' }) }));
    ok('…a failed read says so, with its reason', f2 && /Reason: busy/.test(f2), f2);
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8'), pv = fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8');
    ok('the new words have their French, and the privacy page says where the fridge photo goes', ["What's in the fridge?","In the photo","Also seen"].every(k=>fr.includes(`"${k}"`)) && /fridge/i.test(pv));
    if(out) await page.screenshot({ path:out });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
