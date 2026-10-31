/* v2.91 — the household: (1) one item per row: the note on the name's line (same baseline), and the count and unit at the
   right-hand end, in every count-and-unit style; (2) Item icons On/Off in the Shop ⋯ menu.

   WHAT THESE CHECKS HAVE TO PROVE:
   - at 1 per row, for Text below the note, Disc + unit, One pill: the amount's right edge is at the row's right edge (within
     the row's padding) and starts after the note ends; for In the note the amount stays in the note;
   - the note's baseline is the name's baseline (±1px), the name is centred in its row, and a long note shortens with "…";
   - the ⋯ menu has Item icons On/Off: Off hides every item drawing, the menu stays open, Settings agrees; On brings them back.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
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
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800); };
    const it2=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
    const D = DOC({ items:[ it2("1","Yogurt","dairy",{ qty:3, weight:"1kg", note:"Blueberrie, Protein" }), it2("2","Kiwi","fruit",{ note:"green" }), it2("3","Dates","fruit",{ qty:2 }) ] });
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");';
    const geo = ()=>page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="1"]'), pr=p.getBoundingClientRect(), cs=getComputedStyle(p);
      const vis=e=>e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().width>0;
      const base=e=>{ const s=document.createElement('span'); s.style.cssText='display:inline-block;width:0;height:0'; e.appendChild(s); const b=s.getBoundingClientRect().bottom; s.remove(); return b; };
      const am=[...p.querySelectorAll(':scope > :is(.pill-meta,.cu-alt,.cudisc,.cupill,.cupair)')].filter(vis), n=p.querySelector('.pname'), no=p.querySelector('.pnote');
      const ar=am.length ? Math.max(...am.map(e=>e.getBoundingClientRect().right)) : null, al=am.length ? Math.min(...am.map(e=>e.getBoundingClientRect().left)) : null;
      const ic=p.querySelector('.pemoji'), nr=n.getBoundingClientRect(), irr=ic?ic.getBoundingClientRect():null;
      const midDiff = irr ? Math.abs((nr.top+nr.bottom)/2-(irr.top+irr.bottom)/2) : 0;
      return { mid:midDiff, rowMid:Math.abs((nr.top+nr.bottom)/2-(pr.top+pr.bottom)/2), rowR:pr.right-parseFloat(cs.paddingRight)-parseFloat(cs.borderRightWidth), ar, al, noteR:vis(no)?no.getBoundingClientRect().right:null, noteT:vis(no)?no.textContent:null, dBase:vis(no)?Math.abs(base(n)-base(no)):null }; });
    const res={};
    for(const st of ['', 'sep', 'tog', 'note']){
      await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE+'localStorage.setItem("ml_largecols","1");'+(st?`localStorage.setItem("ml_cu_style","${st}");`:'') });
      res[st||'text']=await geo();
    }
    const right = ['text','sep','tog'].every(k=>{ const g=res[k]; return g.ar!==null && Math.abs(g.ar-g.rowR)<=2 && g.al>g.noteR; });
    ok('1 per row: the count and unit sit at the right-hand end, after the note (Text below the note, Disc + unit, One pill)', right, JSON.stringify(res));
    ok('…In the note keeps the amount in the note', /^3 × 1kg · /.test(res.note.noteT||''), JSON.stringify(res.note));
    ok('the note sits on the name\'s baseline (every style)', Object.values(res).every(g=>g.dBase!==null && g.dBase<=1), JSON.stringify(Object.fromEntries(Object.entries(res).map(([k,g])=>[k,g.dBase]))));
    ok('…and the name stays in the middle of its row, level with the drawing (not pinned to the top)', Object.values(res).every(g=>g.rowMid<=4 && g.mid<=4), JSON.stringify(Object.fromEntries(Object.entries(res).map(([k,g])=>[k,[g.rowMid,g.mid]]))));
    const longN = DOC({ items:[ it2("1","Yogurt","dairy",{ qty:3, weight:"1kg", note:"Blueberrie, Protein, Pouch, low fat, Greek, vanilla, family size" }) ] });
    await mk({ srv:{ "lists/v101": longN }, cache:longN, extra:BASE+'localStorage.setItem("ml_largecols","1");localStorage.setItem("ml_cu_style","tog");' });
    const lg = await geo();
    ok('…a long note shortens with "…" rather than pushing the amount off the row or onto a second line', Math.abs(lg.ar-lg.rowR)<=2 && lg.al>lg.noteR-1 && lg.rowMid<=4, JSON.stringify(lg));
    if(out) await page.screenshot({ path:out });

    /* the ⋯ menu: Item icons */
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE+'localStorage.setItem("ml_largecols","3");' });
    const ico = ()=>page.evaluate(()=>document.querySelectorAll('#zoomer .pill[data-pill] .pemoji').length);
    const i0 = await ico();
    await page.locator('#shopMenuBtn, [aria-label="More"]').first().click(); await page.waitForTimeout(400);
    await page.locator('[data-sm-itememoji="0"]').click(); await page.waitForTimeout(400);
    const i1 = await ico(), open1 = await page.locator('[data-sm-itememoji]').count();
    const stored = await page.evaluate(()=>localStorage.getItem('ml_emoji_item'));
    await page.locator('[data-sm-itememoji="1"]').click(); await page.waitForTimeout(400);
    const i2 = await ico();
    ok('⋯ menu › Item icons: Off hides every drawing (the menu stays open, the setting is saved), On brings them back', i0===3 && i1===0 && open1===2 && stored==='0' && i2===3, JSON.stringify({ i0, i1, open1, stored, i2 }));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
