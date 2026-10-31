/* v2.88 — three household bugs (screenshots 30–31 Oct):
   1. Square tiles were different sizes (a tile with a row of badges grew, a plain one stayed square) and a plain square
      tile's note hung below it → every square tile is the same size: as tall as wide, or the tallest tile's content;
   2. a note cut to one line on the list, whole on the Regulars → in Square the note has two lines, and a Regular follows
      the list's note rules (it carries .hasnote);
   3. in the + sheet's item editor, one letter in the note dropped the keyboard and became a tag: each keystroke saves, the
      database echoed it back, and the remote redraw rebuilt the sheet under the field → a remote redraw never rebuilds a
      sheet while one of its fields is being typed in; it waits for the field to be left.

   WHAT THESE CHECKS HAVE TO PROVE:
   - (3) with a fake database that ECHOES every write to its listeners (as Firestore does on the phone — the plain stub
     never fires, which is why no suite saw it): typing "Semi" in the + sheet's note keeps the field focused, the text in the
     field, no tag made, the writes really echoed; leaving the field then makes "Semi" a tag and the sheet redraws;
   - (1) Square at 3 and 4 across, with badges and notes: every tile the same height, at least as tall as wide, every part of
     every tile inside it;
   - (2) in Square a list item's two-line note shows both lines, like the same note on its Regular.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. The fake database is
   v2.58's (writes echo with fire()). */
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

    /* ── 3. the note in the + sheet, against a database that echoes ── */
    await mk({ extra:'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");' });
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.locator('#mainInput').fill('tofu'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(500);
    await page.locator('#addSheetBody [data-add-dict]').filter({ hasText:/tofu/i }).first().click(); await page.waitForTimeout(800);
    const note = page.locator('#addSheetBody [data-ae-note]').first();
    await note.click(); await page.waitForTimeout(200);
    const w0 = await page.evaluate(()=>window.__srv.writes.length);
    for(const ch of 'Semi'){ await page.keyboard.type(ch); await page.waitForTimeout(250); }
    await page.waitForTimeout(400);
    const n1 = await page.evaluate(()=>{ const a=document.activeElement; return { focused:!!(a && a.matches('[data-ae-note]')), val:a && a.value, chips:[...document.querySelectorAll('#addSheetBody .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()), writes:window.__srv.writes.length }; });
    ok('+ sheet note: typing "Semi" while the database echoes each save keeps the field focused, the text in it, no tag made', n1.focused && n1.val==='Semi' && n1.chips.length===0 && n1.writes>w0, JSON.stringify(Object.assign(n1, { w0 })));
    await page.evaluate(()=>document.getElementById('mainInput').focus()); await page.waitForTimeout(500);
    const n2 = await page.evaluate(()=>[...document.querySelectorAll('#addSheetBody .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()));
    ok('…leaving the field makes "Semi" a tag (the sheet redraws then)', n2.includes('Semi'), JSON.stringify(n2));

    /* ── 1 and 2. Square ── */
    const it2=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
    const SQ = DOC({ items:[ it2("1","Tomatoes","vegetable",{ note:"Small" }), it2("2","Tomatoes big","vegetable",{ qty:4 }), it2("3","Eggs","dairy",{ qty:3, weight:"12 pack" }),
      it2("4","Yogurt","dairy",{ qty:3, note:"Mango, Protein, Pouch" }), it2("5","Kitchen towel","others"), it2("6","Frozen","frozen",{ qty:3, note:"Raspberries, Mango" }),
      it2("7","Tofu","asian",{ qty:2, note:"Semi-fried" }), it2("8","Taugeh","vegetable"), it2("9","Parsley","vegetable") ],
      buyAgain:[{ name:"Yogurt", cat:"dairy", note:"Mango, Protein, Pouch" }] });
    const sq = []; let clampTwo=null;
    for(const [cols, st] of [['3','sep'], ['4','sep'], ['3','tog'], ['4','']]){
      await mk({ srv:{ "lists/v101": SQ }, cache:SQ, extra:`localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","${cols}"); localStorage.setItem("ml_tilelines","sq");${st?`localStorage.setItem("ml_cu_style","${st}");`:''}` });
      const r = await page.evaluate(()=>{ const ts=[...document.querySelectorAll('#zoomer .pills > .pill[data-pill]')].filter(p=>p.offsetParent);
        const hs=ts.map(p=>Math.round(p.getBoundingClientRect().height)), ws=ts.map(p=>Math.round(p.getBoundingClientRect().width));
        const spill=ts.filter(p=>{ const r=p.getBoundingClientRect(); return [...p.querySelectorAll(':scope > .pemoji, :scope > .pname, :scope > .pnote, :scope > .pill-meta')].some(e=>{ const b=e.getBoundingClientRect(); return b.height && (b.bottom>r.bottom+0.5 || b.top<r.top-0.5); }); }).map(p=>p.dataset.pill);
        const y=ts.find(p=>p.dataset.pill==='4'), yn=y && y.querySelector('.pnote'), lh=yn ? parseFloat(getComputedStyle(yn).lineHeight) : 0;
        return { hs, ws, spill, yLines: yn ? Math.round(yn.getBoundingClientRect().height/lh) : 0, yCut: yn ? yn.scrollHeight>yn.clientHeight+1 : null }; });
      sq.push({ cols, st, same:new Set(r.hs).size===1, square:r.hs.every((h,i)=>h>=r.ws[i]-1), spill:r.spill, hs:[...new Set(r.hs)] });
      if(cols==='3' && st==='sep') clampTwo = r;
      if(out && cols==='4') await page.screenshot({ path: out.replace(/\.png$/,`-sq${cols}${st}.png`) });
    }
    ok('Square: every tile the same height, at least as tall as wide, nothing hanging out (3 and 4 across, each style)', sq.every(x=>x.same && x.square && !x.spill.length), JSON.stringify(sq));
    ok('Square: a two-line note shows both lines, uncut ("Mango, Protein, Pouch")', clampTwo && clampTwo.yLines===2 && clampTwo.yCut===false, JSON.stringify(clampTwo && { lines:clampTwo.yLines, cut:clampTwo.yCut }));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), rp = src.slice(src.indexOf('function regPill('), src.indexOf('function regSortCmp('));
    ok('a Regular with a note carries .hasnote (both tile kinds), so it follows the list\'s note rules', (rp.match(/noteS\?" hasnote":""/g)||[]).length===2, '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
