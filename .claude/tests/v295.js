/* v2.95 — "Edit this page" (the page builder, step 1): the Shop and Plan pages are columns of blocks that can be moved,
   hidden and narrowed, saved on this phone with the look.

   WHAT THESE CHECKS HAVE TO PROVE:
   - out of edit mode nothing changes: the Shop page shows Your list before Regulars, no outlines, a tap ticks an item;
   - ⋯ › Edit this page: every block is outlined and named, a bar says "Editing this page", and a tap inside a block does NOT
     tick an item;
   - ↑ on Regulars puts it above Your list; ½ on Your list makes it half wide with fewer tile columns (3 → 2), side by side;
     hiding a block keeps it (dimmed) while editing and removes it after Done; all of it survives a relaunch;
   - the Plan page's week menu has Edit this page too; hiding the Tip there hides it;
   - Reset (after its question) puts the page back; the setting is a look (not in either exclude list), and has its French. */
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



    const DP = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery"), it("3","Eggs","dairy") ], buyAgain:[{ name:"Rice", cat:"bulk", qty:1, weight:"", sub:"", note:"", where:"", ts:2000 }] });
    const order = ()=>page.evaluate(()=>[...document.querySelectorAll('.pblocks[data-page="shop"] > .pblock')].map(b=>b.dataset.pb+(b.classList.contains('pbhidden')?'(h)':'')));
    await mk({ srv:{ "lists/v101": DP }, cache:DP, extra:BASE+'localStorage.setItem("ml_largecols","3");' });
    const o0 = await order();
    const outl0 = await page.evaluate(()=>!!document.querySelector('.pblocks.editing, .pblbl, #pageEditBar'));
    ok('out of edit mode: Your list before Regulars, no outlines or toolbars', o0.indexOf('shop.list')>=0 && o0.indexOf('shop.list') < o0.indexOf('shop.regulars') && !outl0, JSON.stringify(o0));
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    await page.locator('#smEditPage').click(); await page.waitForTimeout(500);
    const ed = await page.evaluate(()=>({ bar:(document.getElementById('pageEditBar')||{}).textContent||'', labels:[...document.querySelectorAll('.pblocks.editing .pblbl')].map(x=>x.textContent) }));
    await page.locator('#zoomer .pill[data-pill="1"]').click({ force:true }); await page.waitForTimeout(500);
    const ticked = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).some(i=>i.checked); });
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });
    ok('⋯ › Edit this page: the blocks are named ("Your list", "Regulars"), a bar says "Editing this page", and a tap on a tile does not tick it',
      /Editing this page/.test(ed.bar) && ed.labels.includes('Your list') && ed.labels.includes('Regulars') && !ticked, JSON.stringify({ ed, ticked }));
    await page.locator('.pblock[data-pb="shop.regulars"] [data-pbmove="-1"]').click(); await page.waitForTimeout(400);
    const o1 = await order();
    await page.locator('.pblock[data-pb="shop.list"] [data-pbwidth]').click(); await page.waitForTimeout(600);
    const geo = await page.evaluate(()=>{ const l=document.querySelector('.pblock[data-pb="shop.list"]'), r=document.querySelector('.pblock[data-pb="shop.regulars"]'), box=document.querySelector('.pblocks');
      const p=l.querySelector('.pills'); return { lw:Math.round(l.getBoundingClientRect().width), bw:Math.round(box.getBoundingClientRect().width), cols:p ? getComputedStyle(p).gridTemplateColumns.split(' ').length : 0 }; });
    ok('↑ on Regulars puts it above Your list; ½ makes Your list half wide, with 2 tile columns instead of 3',
      o1.indexOf('shop.regulars') < o1.indexOf('shop.list') && Math.abs(geo.lw - geo.bw/2) < 16 && geo.cols===2, JSON.stringify({ o1, geo }));
    await page.locator('.pblock[data-pb="shop.regulars"] [data-pbhide]').click(); await page.waitForTimeout(400);
    const o2 = await order();
    await page.locator('#peDone').click(); await page.waitForTimeout(400);
    const o3 = await order();
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1600);
    const o4 = await order(); const lay = await page.evaluate(()=>localStorage.getItem('ml_pagelay'));
    ok('hiding Regulars keeps it, dimmed, while editing, and removes it after Done — and the layout survives a relaunch',
      o2.includes('shop.regulars(h)') && !o3.some(x=>/regulars/.test(x)) && !o4.some(x=>/regulars/.test(x)) && /half/.test(lay||''), JSON.stringify({ o2, o3, o4, lay }));
    await page.locator('#zoomer .pill[data-pill="2"]').click(); await page.waitForTimeout(600);
    const t2 = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).find(i=>i.id==='2').checked; });
    ok('…out of edit mode a tap ticks again', t2===true, String(t2));
    /* Plan */
    await page.locator('#bottomnav .navbtn').nth(0).click(); await page.waitForTimeout(900);
    const tip0 = await page.evaluate(()=>!!document.querySelector('.pblock[data-pb="plan.hint"]'));
    await page.locator('#pwMore').click(); await page.waitForTimeout(500);
    await page.locator('#pwEdit').click(); await page.waitForTimeout(500);
    await page.locator('.pblock[data-pb="plan.hint"] [data-pbhide]').click(); await page.waitForTimeout(300);
    await page.locator('#peDone').click(); await page.waitForTimeout(400);
    const tip1 = await page.evaluate(()=>!!document.querySelector('.pblock[data-pb="plan.hint"]'));
    ok('the Plan page: its week menu has Edit this page; hiding the Tip hides it', tip0 && !tip1, JSON.stringify({ tip0, tip1 }));
    /* Reset */
    await page.locator('#bottomnav .navbtn').nth(1).click(); await page.waitForTimeout(900);
    page.once('dialog', d=>d.accept());
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smEditPage').click(); await page.waitForTimeout(400);
    await page.locator('#peReset').click(); await page.waitForTimeout(500);
    const o5 = await order(); const lay2 = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_pagelay')||'{}'));
    ok('Reset puts the Shop page back (Your list before Regulars, nothing hidden or narrowed) and leaves the Plan page\'s choice', o5.indexOf('shop.list') < o5.indexOf('shop.regulars') && !o5.some(x=>/\(h\)/.test(x)) && !lay2.shop && !!lay2.plan, JSON.stringify({ o5, lay2 }));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the layout is a look: in neither exclude list; the new words have their French', ['APP_EXCLUDE_BOOT','APP_EXCLUDE'].every(n=>{ const m=src.match(new RegExp('const '+n+' = (/.*/);')); return m && !m[1].includes('pagelay'); })
      && ['Edit this page','Editing this page','Your list','Put this page back as it was?','Page layout'].every(k=>fr.includes(`"${k}"`)));
    if(out) await page.screenshot({ path:out });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
