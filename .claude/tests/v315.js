/* v3.15 — H4, part 3: the 10% shop, What we spend and Occasions' "save" step redraw only themselves.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the 10% shop's + and a row's tick patch the sheet in place (same sheet element, the page's tiles behind it untouched)
     and the amount, the price and the total follow;
   - What we spend: picking another month patches the sheet in place and shows that month;
   - Occasions: "Save the list as an occasion" switches the open sheet to its name step in place. */
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


    /* ── 3. the module ── */
    const T = await import(pathToFileURL(path.join(ROOT,'js','tenpct.js')).href);
    const DAY=86400000, T0=new Date(2026,8,1).getTime(), every=(d,n)=>Array.from({length:n},(_,i)=>T0+i*d*DAY);
    const P = { 'yogurt|dairy':{ name:'Yogurt', cat:'dairy', qty:3, ts:every(2,10) }, 'eggs|dairy':{ name:'Eggs', cat:'dairy', qty:1, ts:every(4,6) },
      'bread|bakery':{ name:'Bread', cat:'bakery', qty:1, ts:every(3,6) }, 'rice|pantry':{ name:'Rice', cat:'pantry', qty:1, ts:every(14,3) },
      'sparkling water|liquor':{ name:'Sparkling water', cat:'liquor', qty:6, ts:every(7,4) }, 'sparkling water|others':{ name:'Sparkling water', cat:'others', qty:1, ts:every(10,3) } };
    const su = T.stockUp({ purch:P, priceOf:nm=>({ rice:{unit:10}, 'sparkling water':{unit:1} })[nm.toLowerCase()]||null, pct:10, cap:50 });
    const nm = su.rows.map(r=>r.name);
    ok('the stock-up leaves out fresh food of the thirteen categories (yogurt, eggs, bread) and keeps what keeps', !nm.includes('Yogurt') && !nm.includes('Eggs') && !nm.includes('Bread') && nm.includes('Rice'), JSON.stringify(nm));
    const sw = su.rows.filter(r=>/sparkling/i.test(r.name));
    ok('…one row per name: two "Sparkling water" records make one row (the larger amount), with what one shop usually takes', sw.length===1 && sw[0].qty===24 && sw[0].usual===6, JSON.stringify(sw));
    const rr = Object.assign({}, su.rows.find(r=>r.name==='Rice')); T.setRowQty(rr, 5); const r0 = Object.assign({}, rr); T.setRowQty(rr, 0);
    ok('setRowQty changes the amount and its total, never below 1', r0.qty===5 && r0.total===50 && rr.qty===1 && rr.total===10, JSON.stringify([r0, rr]));

    const PU = { 'rice|pantry':{ name:'Rice', cat:'pantry', qty:1, weight:'', ts:every(14,3) }, 'toilet paper|household':{ name:'Toilet paper', cat:'household', qty:1, weight:'', ts:every(30,2) } };
    const PR = { rice:[{p:10,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}], 'toilet paper':[{p:12,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}] };
    const SP = [{ t:3001, d:'2026-09-12', s:'dand', sn:'Coles Dandenong', tot:30, c:{ others:30 }, n:2 }, { t:3002, d:'2026-10-05', s:'dand', sn:'Coles Dandenong', tot:40, c:{ others:40 }, n:3 }];
    const TD = DOC({ items:[ it("m1","Milk","dairy") ], purch:PU, prices:PR, spend:SP, memb:{ coles:{ on:true, pct:10, cap:50, day:1, used:{} } } });
    const markP = id => page.evaluate(id => { window.__sh = document.getElementById(id); window.__tile = document.querySelector('#zoomer .pill[data-pill]'); }, id);
    const sameP = id => page.evaluate(id => ({ sheet: !!window.__sh && window.__sh === document.getElementById(id), page: !!window.__tile && window.__tile.isConnected }), id);
    await mk({ srv:{ "lists/v101": TD }, cache:TD, date:[2026,9,28], extra:BASE });
    await page.locator('#tenCardList').click(); await page.waitForTimeout(500);
    await markP('tenSheet');
    const rice = page.locator('#tenSheet .tenrow', { has: page.locator('.tr-n', { hasText:/^Rice/ }) });
    await rice.locator('[data-ten-qm$="|1"]').click(); await page.waitForTimeout(300);
    const q = await page.evaluate(() => { const r=[...document.querySelectorAll('#tenSheet .tenrow')].find(x=>/^Rice/.test(x.querySelector('.tr-n').textContent.trim())); return { q:r.querySelector('.tenqty span').textContent, sum:document.querySelector('.tensum').textContent }; });
    const t1 = await sameP('tenSheet');
    ok('10% shop: + patches the sheet in place, and rice is 3 with the total at $42', t1.sheet && t1.page && q.q==='3' && /\$42\.00/.test(q.sum), JSON.stringify({ t1, q }));
    await rice.locator('input[type=checkbox]').click(); await page.waitForTimeout(300);
    const t2 = await sameP('tenSheet'); const sum2 = await page.evaluate(() => document.querySelector('.tensum').textContent);
    ok('…unticking a row too, and the total drops to the other row', t2.sheet && t2.page && /\$12\.00/.test(sum2) && !/\$42/.test(sum2), JSON.stringify({ t2, sum2 }));
    await page.locator('#tenClose').click(); await page.waitForTimeout(300);
    /* What we spend */
    await page.locator('#setNav').click(); await page.waitForTimeout(600); await page.locator('#optSpend').click(); await page.waitForTimeout(500);
    await markP('spendSheet');
    await page.locator('[data-spend-m="2026-09"]').click(); await page.waitForTimeout(400);
    const s1 = await sameP('spendSheet'); const on = await page.evaluate(() => [...document.querySelectorAll('[data-spend-m].on')].map(b => b.dataset.spendM).join());
    ok('What we spend: another month patches the sheet in place and shows that month', s1.sheet && on==='2026-09', JSON.stringify({ s1, on }));
    await page.locator('#spendClose').click(); await page.waitForTimeout(300);
    /* Occasions */
    await page.locator('#optOccAdd').click(); await page.waitForTimeout(500);
    const toSave = await page.locator('#occToSave').count();
    if(toSave){ await markP('occSheet'); await page.locator('#occToSave').click(); await page.waitForTimeout(400);
      const o1 = await sameP('occSheet'); const nm = await page.locator('#occName').count();
      ok('Occasions: "save the list" switches the open sheet to its name step in place', o1.sheet && nm===1, JSON.stringify({ o1, nm })); }
    else ok('Occasions: "save the list" switches the open sheet to its name step in place', false, 'no #occToSave in the add step');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
