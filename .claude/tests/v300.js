/* v3.00 — one add flow (U4) and Edit item redrawing only its sheet (H4).

   WHAT THESE CHECKS HAVE TO PROVE:
   - H4: a tap on + in Edit item while the note is being typed (dispatched as the phone does it: the button does not take the
     focus) keeps the SAME note field with its letters, the SAME sheet element, and does not rebuild the page behind (a list
     tile is the same element); opening Category does not rebuild the page either; Save still stores count and note;
   - U4, the same rule from every door: typed "2 yogurt" adds to the plain Yogurt's count and never to "Yogurt · Greek"; typed
     "yogurt" with only a noted one on the list adds a plain one; Smart add folds by name + note the same way; an occasion's
     "Yogurt · Greek" is a second item beside a plain Yogurt and keeps its note; nothing is pushed onto the list outside
     putItem (source check);
   - every item made carries the full shape (note, where, sub, weight present). */
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
    const all = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).filter(i=>!i.checked).map(i=>i.name.toLowerCase()+'|'+(i.note||'')+'|'+i.qty).sort(); });
    const raw = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return c.items||[]; });
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');

    /* ── H4 ── */
    const DC = DOC({ items:[ it("1","Cider","liquor",{ note:"Dry" }), it("2","Dates","fruit") ] });
    await mk({ srv:{ "lists/v101": DC }, cache:DC, extra:BASE });
    const tl=page.locator('#zoomer .pill[data-pill="1"]'); const bb=await tl.boundingBox();
    await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700);
    await page.locator('#editNote').click(); await page.keyboard.type('Sw'); await page.waitForTimeout(150);
    await page.evaluate(()=>{ window.__note=document.activeElement; window.__sheet=document.getElementById('sheet'); window.__tile=document.querySelector('#zoomer .pill[data-pill="2"]'); });
    await page.evaluate(()=>document.getElementById('qPlus').click()); await page.waitForTimeout(300);   // as the phone: the button does not take the focus
    const h1 = await page.evaluate(()=>{ const a=document.activeElement; return { id:a&&a.id, v:a&&a.value, sameNote:a===window.__note, sameSheet:document.getElementById('sheet')===window.__sheet,
      sameTile:document.querySelector('#zoomer .pill[data-pill="2"]')===window.__tile && window.__tile.isConnected, qty:(document.querySelector('#sheet .qstep2 span, #sheet #qVal')||{}).textContent||document.getElementById('sheet').textContent.match(/\b2\b/)&&'2' }; });
    ok('Edit item: + while typing a note keeps the same field and its letters, the same sheet, and does not rebuild the page behind',
      h1.id==='editNote' && h1.v==='Sw' && h1.sameNote && h1.sameSheet && h1.sameTile, JSON.stringify(h1));
    await page.keyboard.type('eet'); await page.waitForTimeout(100);
    const h1b = await page.evaluate(()=>({ v:document.activeElement.value, same:document.activeElement===window.__note }));
    ok('…and typing goes on in it', h1b.v==='Sweet' && h1b.same, JSON.stringify(h1b));
    await page.evaluate(()=>document.getElementById('ecHead').click()); await page.waitForTimeout(300);
    const h2 = await page.evaluate(()=>({ open:!!document.querySelector('#sheet .edcell[data-open="1"]'), sameTile:document.querySelector('#zoomer .pill[data-pill="2"]')===window.__tile, sameSheet:document.getElementById('sheet')===window.__sheet }));
    ok('…opening Category opens its list without rebuilding the page or the sheet element', h2.open && h2.sameTile && h2.sameSheet, JSON.stringify(h2));
    /* a tapped button takes the focus in the test browser (and on a computer): it must be redrawn, not kept as it was */
    /* SUPERSEDED by v3.10 (U5): the flags sit under Edit item's More — open it (in place, renderSheet) first. Still protects the flag redraw. */
    await page.evaluate(()=>{ const m=document.querySelector('#edMore'); if(m && m.getAttribute('aria-expanded')!=='true') m.click(); }); await page.waitForTimeout(400);
    await page.locator('#sheet [data-flag]').first().click(); await page.waitForTimeout(250);
    const fl = await page.evaluate(()=>{ const b=document.querySelector('#sheet [data-flag]'); return { cls:b.className, pressed:b.getAttribute('aria-pressed'), style:b.getAttribute('style')||'' }; });
    await page.locator('#sheet [data-flag]').first().click(); await page.waitForTimeout(250);
    const fl2 = await page.evaluate(()=>{ const b=document.querySelector('#sheet [data-flag]'); return { cls:b.className, pressed:b.getAttribute('aria-pressed'), style:b.getAttribute('style')||'' }; });
    ok('…a flag that was tapped (and so has the focus) shows its new state, on and off again', JSON.stringify(fl)!==JSON.stringify(fl2), JSON.stringify({ fl, fl2 }));
    await page.locator('#saveBtn').click(); await page.waitForTimeout(800);
    const c1 = (await raw()).find(i=>i.id==="1");
    ok('…Save stores the count (2) and the note (Dry + Sweet)', c1 && c1.qty===2 && /dry/i.test(c1.note) && /sweet/i.test(c1.note), JSON.stringify(c1));
    const tileNow = await page.evaluate(()=>document.querySelector('#zoomer .pill[data-pill="2"]')!==window.__tile);
    ok('…and Save does redraw the page (the tile is a new element)', tileNow);

    /* ── U4: typed ── */
    const DY = DOC({ items:[ it("1","Yogurt","dairy"), it("2","Yogurt","dairy",{ note:"Greek" }) ] });
    await mk({ srv:{ "lists/v101": DY }, cache:DY, extra:BASE });
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.keyboard.type('2 yogurt'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
    const t1 = await all();
    ok('typed "2 yogurt": the plain Yogurt goes to 3, "Yogurt · Greek" is untouched, no third item', t1.join(' ; ')==='yogurt|Greek|1 ; yogurt||3', JSON.stringify(t1));
    const DG = DOC({ items:[ it("2","Yogurt","dairy",{ note:"Greek" }) ] });
    await mk({ srv:{ "lists/v101": DG }, cache:DG, extra:BASE });
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.keyboard.type('yogurt'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
    const t2 = await all(), r2 = (await raw()).find(i=>/yogurt/i.test(i.name) && !i.note);
    ok('typed "yogurt" beside only a noted one: a plain Yogurt is added', t2.join(' ; ')==='yogurt|Greek|1 ; yogurt||1', JSON.stringify(t2));
    ok('…and it has the whole shape (note, where, sub, weight, by)', r2 && ['note','where','sub','weight','by'].every(k=>k in r2), JSON.stringify(r2));

    /* ── U4: Smart add ── */
    await mk({ srv:{ "lists/v101": DY }, cache:DY, extra:BASE });
    await ctx.route('**/api/parse', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[
      { name:"Yogurt", qty:2, category:"dairy", weight:"", note:"Greek" }, { name:"Yogurt", qty:1, category:"dairy", weight:"", note:"Mango" }, { name:"Leeks", qty:1, category:"vegetable", weight:"" } ] }) }));
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.locator('#mainInput').fill('greek yogurt x2, mango yogurt, leeks'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(400);
    await page.locator('[data-add-smart]').first().click(); await page.waitForTimeout(1200);
    await page.locator('#smartConfirm').click(); await page.waitForTimeout(900);
    const s1 = await all();
    ok('Smart add: "Yogurt · Greek" ×2 adds to the Greek one, "Yogurt · Mango" is new, the plain Yogurt is untouched',
      s1.join(' ; ')==='leeks||1 ; yogurt|Greek|3 ; yogurt|Mango|1 ; yogurt||1', JSON.stringify(s1));

    /* ── U4: an occasion ── */
    const OCC = [{ id:'t1', name:'Camping', at:1, items:[{name:'Yogurt',cat:'dairy',qty:4,weight:'',note:'Greek',where:''},{name:'Dates',cat:'fruit',qty:3,weight:'',note:'',where:''}] }];
    const DO = DOC({ items:[ it("1","Yogurt","dairy"), it("2","Dates","fruit") ], templates:OCC });
    await mk({ srv:{ "lists/v101": DO }, cache:DO, extra:BASE });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optOccAdd').click(); await page.waitForTimeout(400);
    await page.locator('[data-occadd="t1"]').click(); await page.waitForTimeout(800);
    const o1 = await all();
    ok('an occasion: "Yogurt · Greek" ×4 sits beside the plain Yogurt with its note; Dates takes the larger count (3)',
      o1.join(' ; ')==='dates||3 ; yogurt|Greek|4 ; yogurt||1', JSON.stringify(o1));

    /* ── source ── */
    const pushes = (src.match(/state\.items\.push\(/g)||[]).length;
    ok('items are pushed onto the list in two places only: putItem and the duplicates merge', pushes===2 && /function putItem\(/.test(src) && /function itemTwin\(/.test(src), String(pushes));
    ok('Edit item\'s picks redraw through renderSheet', /function renderSheet\(/.test(src) && /function patchKeepFocus\(/.test(src) && /#qPlus"\); if\(qp\) qp\.onclick=\(\)=>\{[^}]*renderSheet\(\)/.test(src));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
