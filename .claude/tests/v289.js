/* v2.89 — three household items (screenshots 31 Oct):
   1. Edit item: the SUGGESTED notes (the unchosen tiles) can be removed (their ×) and put in order (hold and drag), like the
      chosen ones; remembered per item name on this phone (ml_notesg — not shared: a household-wide version would need a new
      list field and new Firestore rules);
   2. the on-sale mark was cut off (★ + tag at 4 across, capped at half a row it had to itself) → the marks keep to half
      their row only when another badge shares it, and are smaller at 4 across;
   3. one per row / variable width: the count and unit follow the chosen style (disc, pills, in the note) instead of always
      the "3×" text.

   WHAT THESE CHECKS HAVE TO PROVE:
   - (1) in Edit item, tapping a suggestion's × removes it, and it stays gone when Edit item opens again; holding and dragging
     a suggestion puts it first, and that order is kept on reopening; tapping a suggestion still chooses it; the key is in both
     exclusion lists (an appearance slot never wipes it);
   - (2) at 3, 4, 5 and 6 across, with ★ + tag on tiles with and without a badge in the same row, no mark is cut and nothing
     overlaps;
   - (3) at 1 per row: One pill shows the pill in the row and not the "3×" text; Disc + unit the disc and the unit pill;
     In the note "3 × 1kg · …" in the note; Text below the note keeps the "3×" text and no pill.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. The fake database is
   v2.58's. */
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
    const D = DOC({ items:[ it2("1","Yogurt","dairy",{ qty:3, weight:"1kg", note:"Blueberrie, Protein", tags:["urgent","discount"], starred:true }),
      it2("2","Yogurt","dairy",{ note:"Mango, calcium, Pouch" }), it2("3","Kiwi","fruit",{ note:"green" }), it2("4","Dates","fruit"),
      it2("5","Watermelon","fruit",{ tags:["urgent","discount"], starred:true }), it2("6","Bak choy","vegetable") ] });
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");';
    const open = async(id)=>{ const t=page.locator(`#zoomer .pill[data-pill="${id}"]`); await t.scrollIntoViewIfNeeded(); const b=await t.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const focusNote = async()=>{ await page.locator('#sheet .ednotein').first().click(); await page.waitForTimeout(300); };   // the suggestions show while the field has focus (v2.70)
    const sgs = ()=>page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotechips .catchip')].map(c=>c.textContent.replace('×','').trim()));
    const close = async()=>{ await page.locator('#sheet button', { hasText:/^Save$/ }).first().click(); await page.waitForTimeout(600); };

    /* ── 1. the suggestions ── */
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE+'localStorage.setItem("ml_largecols","3");' });
    await open("1"); await focusNote();
    const s0 = await sgs();
    const cal = page.locator('#sheet .ednotechips .catchip').filter({ hasText:'calcium' }).first();
    await cal.locator('.ednotex').click(); await page.waitForTimeout(400);
    const s1 = await sgs();
    const kept = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()));
    ok('Edit item: a suggestion\'s × removes it (the chosen tags untouched)', s0.includes('calcium') && !s1.includes('calcium') && JSON.stringify(kept)==='["Blueberrie","Protein"]', JSON.stringify({ s0, s1, kept }));
    /* drag "Pouch" first among the suggestions */
    const pa=page.locator('#sheet .ednotechips .catchip').filter({ hasText:'Pouch' }).first(), first=page.locator('#sheet .ednotechips .catchip').first();
    const ba=await pa.boundingBox(), bf=await first.boundingBox();
    await page.mouse.move(ba.x+ba.width/2, ba.y+ba.height/2); await page.mouse.down(); await page.waitForTimeout(600);
    await page.mouse.move(ba.x+ba.width/2-10, ba.y+ba.height/2, { steps:3 }); await page.mouse.move(bf.x+2, bf.y+bf.height/2, { steps:8 }); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(500);
    const s2 = await sgs();
    await close(); await open("1"); await focusNote();
    const s3 = await sgs();
    ok('…holding and dragging puts "Pouch" first; removed and reordered both kept when Edit item opens again', s2[0]==='Pouch' && s3[0]==='Pouch' && !s3.includes('calcium'), JSON.stringify({ s2, s3 }));
    await page.locator('#sheet .ednotechips .catchip').filter({ hasText:'Mango' }).first().click(); await page.waitForTimeout(300);
    const kept2 = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()));
    ok('…a tap on a suggestion still chooses it', kept2.includes('Mango'), JSON.stringify(kept2));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const ex = ['APP_EXCLUDE_BOOT','APP_EXCLUDE'].map(n=>{ const m=src.match(new RegExp('const '+n+' = (/.*/);')); return m && m[1].includes('ml_notesg'); });
    ok('ml_notesg is in both APP_EXCLUDE_BOOT and APP_EXCLUDE', ex.every(Boolean), JSON.stringify(ex));

    /* ── 2. the marks, never cut ── */
    const mk2=[];
    for(const cols of ['3','4','5','6']) for(const st of ['', 'tog', 'sep']){
      await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE+`localStorage.setItem("ml_largecols","${cols}");`+(st?`localStorage.setItem("ml_cu_style","${st}");`:'') });
      const r = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill] > .pmarks')].map(m=>{ const p=m.closest('.pill'), pr=p.getBoundingClientRect(), r=m.getBoundingClientRect();
        const others=[...p.querySelectorAll(':scope > .cudisc, :scope > .cupill, :scope > .cupair, :scope > .pemoji, :scope > .pname')].filter(e=>e.getBoundingClientRect().width).some(e=>{ const b=e.getBoundingClientRect(); return Math.min(b.right,r.right)-Math.max(b.left,r.left)>0.5 && Math.min(b.bottom,r.bottom)-Math.max(b.top,r.top)>0.5; });
        return { id:p.dataset.pill, cut:m.scrollWidth>m.clientWidth+1 || m.scrollHeight>m.clientHeight+1, out:r.right>pr.right+0.5 || r.left<pr.left-0.5, overlap:others }; }));
      r.forEach(x=>{ if(x.cut||x.out||x.overlap) mk2.push(`${cols}/${st||'text'}/${x.id}: ${JSON.stringify(x)}`); });
    }
    ok('★ + on-sale tag: never cut, never outside the tile, never over another part (3–6 across, each style)', mk2.length===0, mk2.slice(0,4).join(' | '));

    /* ── 3. one per row follows the style ── */
    const row = async(st)=>{ await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE+'localStorage.setItem("ml_largecols","1");'+(st?`localStorage.setItem("ml_cu_style","${st}");`:'') });
      return page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="1"]'), v=s=>{ const e=p.querySelector(s); return e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().width>0 ? e.textContent.trim() : null; };
        const pr=p.getBoundingClientRect(), pill=p.querySelector('.cupill-t'), pb=pill && pill.getBoundingClientRect();
        return { tog:v('.cupill-t'), disc:v('.cudisc'), unit:v('.cupill-u'), alt:v('.cu-alt'), meta:v('.pill-meta'), note:v('.pnote'), inRow: pb ? (pb.top>=pr.top && pb.bottom<=pr.bottom) : null }; }); };
    const R1=await row('tog'), R2=await row('sep'), R3=await row('note'), R4=await row('');
    ok('1 per row, One pill: "3 × 1kg" as a pill inside the row, no "3×" text', R1.tog==='3 × 1kg' && R1.inRow && !R1.alt, JSON.stringify(R1));
    ok('1 per row, Disc + unit: the disc "3" and the "1kg" pill, no text', (R2.disc==='3') && (R2.unit==='1kg' || /1kg/.test(R2.note||'')) && !R2.alt, JSON.stringify(R2));
    ok('1 per row, In the note: "3 × 1kg · Blueberrie, Protein"', /^3 × 1kg · Blueberrie, Protein/.test(R3.note||'') && !R3.alt && !R3.tog, JSON.stringify(R3));
    ok('1 per row, Text below the note: the "3×" text as before, no pill', !R4.tog && !R4.disc && /3×/.test(R4.meta||R4.alt||''), JSON.stringify(R4));
    if(out){ await row('tog'); await page.screenshot({ path:out }); }
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
