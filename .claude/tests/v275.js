/* v2.75 — S8 step 3: Regulars, prices and spending as records of their own (lists/{code}/regulars|prices|spend/{id}).

   WHAT THESE CHECKS HAVE TO PROVE:
   - the move: a split (v3) list opened on this version takes a backup, writes every Regular (and removal), every price key and
     every spending entry as a record, and only THEN marks them moved (parts) and v 4 — the record's old arrays kept as written;
   - after it, a new Regular is one record and the list record does not grow;
   - another phone's Regular (a record on the server) arrives here;
   - "Forget every price" reaches every phone: the list record carries when (clr), the records from before are ignored, even
     after reopening;
   - with the new rules not published (records refused) the list stays v3 and works;
   - the rules carry the three collections and refuse writing a v4 list back as older.
   The fake database is v258's (window.__srv), with refuseParts for the new collections.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.56 an object
   literal at the start of a statement in a seed is a block — assign it first. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
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
const refused = p => (S.refuse && /^lists\\/[^/]+\\/items\\//.test(p)) || (S.refuseParts && /^lists\\/[^/]+\\/(regulars|prices|spend)\\//.test(p));
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
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy"), it("2","Bread","bakery")], itemTomb:{ "x9":500 }, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, v:2 }, o||{});
/* the server's records and this phone's cache, seeded before the app's module runs */
const seed = (o) => { o=o||{}; return `(() => {
  const srv = ${JSON.stringify(o.srv||{ "lists/v101": DOC() })};
  window.__srv = { docs:srv, subs:[], writes:[], refuse:${!!o.refuse}, refuseParts:${!!o.refuseParts} };
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  ${o.cache===false ? '' : `const c=${JSON.stringify(o.cache||DOC())}; localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(c, { mv:2 })));`}
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_onb", JSON.stringify({done:1}));
  ${o.extra||''}
})()`; };

const SPLIT = (o) => { const d = DOC(Object.assign({ v:3, parts:["items"],
    buyAgain:[{ name:"Rice", cat:"bulk", qty:1, weight:"", sub:"", note:"", where:"", ts:2000 }], baTomb:{ "old|bulk":Date.now()-60000 },
    prices:{ milk:[{ p:3.1, s:"", sn:"Coles", d:"2026-10-20", q:1, w:"2 L", t:3000 }] },
    spend:[{ t:3000, d:"2026-10-20", s:"", sn:"Coles", tot:3.1, cats:{ dairy:3.1 } }] }, o||{}));
  return { "lists/v101": d, "lists/v101/items/1": Object.assign({}, d.items[0]), "lists/v101/items/2": Object.assign({}, d.items[1]) }; };

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
      page.on('dialog', d=>d.accept());
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(2200); };
    const srv = ()=>page.evaluate(()=>({ docs:window.__srv.docs, writes:window.__srv.writes }));
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));

    /* 1. the move */
    const S0 = SPLIT();
    await mk({ srv:S0, cache:S0["lists/v101"] });
    let s = await srv();
    const keys = Object.keys(s.docs), L = s.docs["lists/v101"];
    const reg = keys.filter(k=>/^lists\/v101\/regulars\//.test(k)).map(k=>s.docs[k]);
    ok('the move writes every Regular and every removal as a record', reg.some(r=>r.name==='Rice' && r.k==='rice|bulk') && reg.some(r=>r.k==="old|bulk" && r.gone>0), JSON.stringify(reg));
    ok('…every price key and every spending entry', keys.includes('lists/v101/prices/milk') && s.docs['lists/v101/prices/milk'].recs.length===1 && keys.includes('lists/v101/spend/3000'), JSON.stringify(keys));
    const order = s.writes.map(w=>w.path), firstRec = order.findIndex(p=>/\/(regulars|prices|spend)\//.test(p)), markV4 = order.findIndex((p,i)=>p==='lists/v101' && s.writes[i].data.v===4);
    ok('…and only THEN marks them moved, v 4', L.v===4 && ['items','regulars','prices','spend'].every(x=>(L.parts||[]).includes(x)) && firstRec>=0 && markV4>firstRec, JSON.stringify({ v:L.v, parts:L.parts, firstRec, markV4 }));
    ok('…keeping the record\'s old arrays as they were (the backup)', (L.buyAgain||[]).length===1 && L.buyAgain[0].name==='Rice' && (L.prices||{}).milk && (L.spend||[]).length===1, JSON.stringify({ ba:L.buyAgain, sp:L.spend }));
    ok('…with a backup taken on this phone first', await page.evaluate(()=>!!localStorage.getItem('ml_snap_v101')), '');

    /* 2. a new Regular is one record */
    const n2 = s.writes.length;
    await page.locator('[data-pill="1"]').click(); await page.waitForTimeout(500);
    await page.locator('#sweepBtn').click(); await page.waitForTimeout(1200);
    s = await srv();
    const w2 = s.writes.slice(n2), milkReg = Object.keys(s.docs).find(k=>/^lists\/v101\/regulars\//.test(k) && s.docs[k].name==='Milk');
    ok('after it, a new Regular is a record of its own', !!milkReg, JSON.stringify(w2.map(w=>w.path)));
    ok('…and the list record does not grow (its Regulars stay the frozen backup)', !(s.docs['lists/v101'].buyAgain||[]).some(b=>b.name==='Milk'), JSON.stringify(s.docs['lists/v101'].buyAgain));

    /* 3. another phone's Regular */
    await page.evaluate(()=>window.__srv.set('lists/v101/regulars/eggs%7Cdairy', { k:'eggs|dairy', name:'Eggs', cat:'dairy', qty:1, weight:'', sub:'', note:'', where:'', ts:Date.now() }));
    await page.waitForTimeout(800);
    ok('another phone\'s Regular arrives here', ((await cache()).buyAgain||[]).some(b=>b.name==='Eggs'), JSON.stringify(((await cache()).buyAgain||[]).map(b=>b.name)));

    /* 4. forget every price reaches every phone */
    await page.evaluate(()=>{ const b=document.querySelector('#setNav'); if(b) b.click(); }); await page.waitForTimeout(600);
    const had = await page.evaluate(()=>{ const b=document.querySelector('#optPriceClear'); if(b){ b.click(); return true; } return false; });
    await page.waitForTimeout(900);
    s = await srv();
    const c4 = await cache();
    ok('"Forget every price" is written as a time on the list record; the price records stay on the server, unread', had && +((s.docs['lists/v101'].clr||{}).prices)>0 && !!s.docs['lists/v101/prices/milk'] && Object.keys(c4.prices||{}).length===0 && (c4.spend||[]).length===0, JSON.stringify({ had, clr:s.docs['lists/v101'].clr, prices:c4.prices }));
    const docs4 = s.docs;
    await mk({ srv:docs4, cache:false });
    const c5 = await cache();
    ok('…and a phone opening the list afresh does not bring them back', Object.keys(c5.prices||{}).length===0 && (c5.spend||[]).length===0, JSON.stringify({ p:c5.prices, s:c5.spend }));

    /* 5. rules not yet published */
    const S6 = SPLIT();
    await mk({ srv:S6, cache:S6["lists/v101"], refuseParts:true });
    s = await srv();
    ok('with the new records refused (rules not yet published), the list stays v 3, not moved', s.docs['lists/v101'].v===3 && !(s.docs['lists/v101'].parts||[]).includes('regulars'), JSON.stringify({ v:s.docs['lists/v101'].v, parts:s.docs['lists/v101'].parts }));
    const n6 = s.writes.length;
    await page.locator('[data-pill="2"]').click(); await page.waitForTimeout(900);
    s = await srv();
    ok('…and it works as before: a tick writes the item record', s.writes.slice(n6).some(w=>w.path==='lists/v101/items/2' && w.data.checked===true), JSON.stringify(s.writes.slice(n6).map(w=>w.path)));

    /* 6. rules */
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('the rules carry regulars, prices and spend, never deleted, and refuse writing a v4 list back as older', /match \/regulars\/\{rid\}/.test(rules) && /match \/prices\/\{pid\}/.test(rules) && /match \/spend\/\{sid\}/.test(rules) && /get\('v', ?0\) < 4 \|\| request\.resource\.data\.get\('v', ?0\) >= 4/.test(rules) && /'clr'/.test(rules), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
