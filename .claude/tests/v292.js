/* v2.92 — four household items (screenshots 1–2 Nov 2026).

   WHAT THESE CHECKS HAVE TO PROVE:
   1. (bug, lesson 62) in the + sheet, an added item whose note is typed to match an item already on the list folds into it:
      one "Can sardine · Tomatoe" ×2 is left, on this phone AND on the (echoing) database — for the plain Regular, "+ another"
      and "Add 'Can sardine'"; two identical items that were on the list before are left alone;
   2. the 10% card says "Later", not "Not this month": early in the month at the shop it puts the card away until mid-month
      (toast), across a relaunch; when that reminder comes due the card shows mid-month even at home; the old stored form still
      hides it for the month;
   3. the stock-up list leaves out fresh food of the thirteen categories (yogurt, eggs, bread), shows one row per name, and
      every row has − / + that change its amount and total without unticking it;
   4. (lesson 63) a failed receipt read says why: the server's code ("unreadable") and, for a dropped connection, a reason too.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. The fake database is
   v2.58's (writes echo back). The clock is v2.20's Date subclass (FAKE). */
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

    /* ── 1. the + sheet folds a twin ── */
    const cs = ()=>page.evaluate(()=>{ const S=window.__srv; const srv=Object.keys(S.docs).filter(k=>/\/items\//.test(k)).map(k=>S.docs[k]).filter(i=>/sardine/i.test(i.name)).map(i=>(i.note||'')+'×'+i.qty).sort();
      const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return { srv, cache:(c.items||[]).filter(i=>/sardine/i.test(i.name)).map(i=>(i.note||'')+'×'+i.qty).sort() }; });
    const RG = (extra)=>{ const items=[ it("21","Bread","bakery"), it("22","Can sardine","pantry",{ note:"Tomatoe" }) ].concat(extra||[]);
      const d = DOC({ v:3, parts:["items"], items, buyAgain:[{ name:"Can sardine", cat:"pantry", qty:1, weight:"", sub:"", note:"", where:"", ts:2000 }, { name:"Can sardine", cat:"pantry", qty:1, weight:"", sub:"", note:"Tomatoe", where:"", ts:2000 }] });
      const srv = { "lists/v101": d }; items.forEach(x=>srv["lists/v101/items/"+x.id]=x); return { srv, cache:d }; };
    const res = {};
    for(const sel of ['data-add-ba','data-add-another','data-add-typed']){
      const g = RG(); await mk({ srv:g.srv, cache:g.cache, extra:BASE }); await page.waitForTimeout(1200);
      await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
      for(const ch of 'can sardine'){ await page.keyboard.type(ch); await page.waitForTimeout(30); }
      await page.waitForTimeout(400);
      await page.locator('#addSheetBody ['+sel+']').first().click(); await page.waitForTimeout(700);
      await page.locator('#addSheetBody [data-ae-note]').first().click(); await page.keyboard.type('Tomatoe'); await page.waitForTimeout(400);
      await page.locator('#mainInput').click(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
      const toast = await page.evaluate(()=>document.body.textContent.includes('Already on the list — added to its count'));
      await page.waitForTimeout(1200);
      res[sel] = Object.assign(await cs(), { toast }); }
    ok('+ sheet: a "Can sardine" given the note "Tomatoe" folds into the "Can sardine · Tomatoe" already there — one item ×2, on this phone and the database, with a word saying so (Regular, "+ another", typed name)',
      Object.values(res).every(r=>r.srv.join()==='Tomatoe×2' && r.cache.join()==='Tomatoe×2' && r.toast), JSON.stringify(res));
    { const g = RG([ it("23","Can sardine","pantry",{ note:"Olive oil" }), it("24","Can sardine","pantry",{ note:"Olive oil" }) ]);
      await mk({ srv:g.srv, cache:g.cache, extra:BASE }); await page.waitForTimeout(1200);
      await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
      for(const ch of 'dates'){ await page.keyboard.type(ch); await page.waitForTimeout(30); }
      await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
      const r = await cs();
      ok('…only what the sheet added is ever folded: two "Olive oil" sardines already on the list are left as they were', r.cache.join()==='Olive oil×1,Olive oil×1,Tomatoe×1' && r.srv.join()==='Olive oil×1,Olive oil×1,Tomatoe×1', JSON.stringify(r)); }

    /* ── 2. the 10% card: Later ── */
    const PU = { 'rice|pantry':{ name:'Rice', cat:'pantry', qty:1, weight:'', ts:every(14,3) }, 'toilet paper|household':{ name:'Toilet paper', cat:'household', qty:1, weight:'', ts:every(30,2) } };
    const PR = { rice:[{p:10,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}], 'toilet paper':[{p:12,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}] };
    const TD = DOC({ purch:PU, prices:PR, memb:{ coles:{ on:true, pct:10, cap:50, day:1, used:{} } } });
    const card = ()=>page.evaluate(()=>{ const c=document.querySelector('#tenCard'); return c ? c.textContent.replace(/\s+/g,' ').trim() : null; });
    await mk({ srv:{ "lists/v101": TD }, cache:TD, date:[2026,9,3], extra:BASE+'localStorage.setItem("ml_store","dand");' });
    const c1 = await card();
    await page.locator('#tenCardHide').click(); await page.waitForTimeout(300);
    const toastT = await page.evaluate(()=>(document.getElementById('toast')||{}).textContent||''); const toast = /We'll remind you on (15 Oct|Oct 15)/.test(toastT);
    const c2 = await card();
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    const c3 = await card();
    ok('at Coles on 3 October the card offers "Later" (not "Not this month"); it puts the card away until mid-month, says so, and stays away after a relaunch',
      c1 && /Later/.test(c1) && !/Not this month/.test(c1) && toast && c2===null && c3===null, JSON.stringify({ c1, toastT, c2, c3 }));
    const due = new Date(2026,9,15,10).getTime();
    await mk({ srv:{ "lists/v101": TD }, cache:TD, date:[2026,9,16], extra:BASE+`localStorage.setItem("ml_tenhide","coles|2026-10|${due}");` });
    const c4 = await card();
    await mk({ srv:{ "lists/v101": TD }, cache:TD, date:[2026,9,16], extra:BASE });
    const c5 = await card();
    ok('…when that reminder comes due (16 October, at home) the card is back mid-month; with no reminder set, not then', !!c4 && c5===null, JSON.stringify({ c4, c5 }));
    await mk({ srv:{ "lists/v101": TD }, cache:TD, date:[2026,9,28], extra:BASE+'localStorage.setItem("ml_tenhide","coles|2026-10");' });
    ok('…and a month already put away the old way ("Not this month") stays away', (await card())===null);

    /* ── 3. the sheet's − / + ── */
    await mk({ srv:{ "lists/v101": TD }, cache:TD, date:[2026,9,28], extra:BASE });
    await page.locator('#tenCardList').click(); await page.waitForTimeout(500);
    const rowOf = ()=>page.evaluate(()=>{ const r=[...document.querySelectorAll('#tenSheet .tenrow')].find(x=>/^Rice/.test(x.querySelector('.tr-n').textContent.trim()));
      return r ? { q:r.querySelector('.tenqty span').textContent, p:r.querySelector('.tr-p').textContent.trim(), on:r.querySelector('input').checked, s:r.querySelector('.tr-s').textContent.trim(), sum:document.querySelector('.tensum').textContent } : null; });
    const b0 = await rowOf();
    await page.locator('#tenSheet .tenrow', { has: page.locator('.tr-n', { hasText:/^Rice/ }) }).locator('[data-ten-qm$="|1"]').click(); await page.waitForTimeout(300);
    const b1 = await rowOf();
    ok('the stock-up sheet: each row says what one shop usually takes and has − / +; + makes rice 3 for $30 and the total follows, the row stays ticked',
      b0 && /usually 1 every 14 days/.test(b0.s) && b0.q==='2' && b1 && b1.q==='3' && /\$30\.00/.test(b1.p) && b1.on && /\$42\.00/.test(b1.sum), JSON.stringify({ b0, b1 }));
    const ov = await page.evaluate(()=>{ const s=document.querySelector('#tenSheet'); return [...s.querySelectorAll('.tenrow')].some(r=>r.scrollWidth>r.clientWidth+1) || document.documentElement.scrollWidth>390; });
    ok('…and the rows fit a 390px screen', !ov);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-ten.png') });

    /* ── 4. a failed receipt says why ── */
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
    const rcTry = async(route)=>{ await mk({ srv:{ "lists/v101": TD }, cache:TD, extra:BASE });
      await ctx.route('**/api/receipt', route);
      await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#smRcpt').click()]);
      await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1800);
      return page.evaluate(()=>{ const s=document.querySelector('#rcSheet'); return s ? s.textContent.replace(/\s+/g,' ').trim() : null; }); };
    const e1 = await rcTry(r=>r.fulfill({ status:502, contentType:'application/json', body:JSON.stringify({ error:'Parse failed', code:'unreadable' }) }));
    const e2 = await rcTry(r=>r.abort('connectionreset'));
    ok('a failed receipt read says what happened and why: "couldn\'t make sense of that photo" with "Reason: unreadable"; a dropped connection gives a reason too',
      e1 && /couldn't make sense of that photo/i.test(e1) && /Reason: unreadable/.test(e1) && e2 && /Reason: \S+/.test(e2), JSON.stringify({ e1, e2 }));

    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Later','Remind me later this month',"We'll remind you on {d}",'Put away until {m} ends','Already on the list — added to its count','Reason:'].every(k=>fr.includes(`"${k}"`)));
    if(out) await page.screenshot({ path:out });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
