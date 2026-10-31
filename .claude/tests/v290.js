/* v2.90 — add another item with the same name and a different note, easily (the household's request):
   Edit item has "+ Another" (keeps this one's edits, adds a new item of the same name with no note, opens it with the note
   field ready); the + sheet shows "+ another <name>" beside a result already on the list. Two items of one name with
   different notes are not offered for merging.

   WHAT THESE CHECKS HAVE TO PROVE:
   - Edit item: "+ Another" saves the open item's edits, adds a second Yogurt (no note, same category), opens it with the
     note field focused; typing "Mango" and Save leaves two Yogurts, "Blueberrie" and "Mango";
   - + sheet: typing "yogurt" shows "+ another Yogurt"; tapping it adds a separate Yogurt and opens its editor with the note
     field focused; typing "Vanilla" there (against v2.58's echoing fake database) keeps the field and saves the note;
   - (the household's screenshot) in the + sheet two Tofus on the list show their notes, one tile each, one "+ another";
   - the duplicates banner does not offer to merge Yogurt (Blueberrie) and Yogurt (Mango); two Milk "Soy" ARE offered, and
     the merge keeps the note, the shop and the flags (it used to drop them).

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
    const D = DOC({ items:[ it2("1","Yogurt","dairy",{ note:"Blueberrie" }), it2("2","Dates","fruit") ] });
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const items = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).filter(i=>/yogurt/i.test(i.name)).map(i=>({ id:i.id, note:i.note||"", cat:i.cat })); });

    /* ── Edit item: + Another ── */
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE });
    const t=page.locator('#zoomer .pill[data-pill="1"]'); const b=await t.boundingBox();
    await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700);
    await page.locator('#edAnother').click(); await page.waitForTimeout(700);
    const a1 = await page.evaluate(()=>({ open:!!document.querySelector('#sheet #editNote'), focused:document.activeElement && document.activeElement.id==='editNote', title:(document.querySelector('#sheet')||{}).textContent||'' }));
    const i1 = await items();
    ok('Edit item "+ Another": a second Yogurt (no note, same category), opened with the note field focused', i1.length===2 && i1.some(x=>x.note==='Blueberrie') && i1.some(x=>x.note==='' && x.cat==='dairy') && a1.open && a1.focused, JSON.stringify({ i1, a1:{ open:a1.open, focused:a1.focused } }));
    await page.keyboard.type('Mango'); await page.locator('#sheet button', { hasText:/^Save$/ }).first().click(); await page.waitForTimeout(700);
    const i2 = await items();
    ok('…typing "Mango" and Save: two Yogurts, "Blueberrie" and "Mango"', i2.length===2 && i2.map(x=>x.note).sort().join('|')==='Blueberrie|Mango', JSON.stringify(i2));
    const dup = await page.evaluate(()=>{ const t=document.body.textContent||''; return /Possible duplicates/.test(t) && /Yogurt, Yogurt/.test(t); });
    ok('the duplicates banner does not offer to merge two Yogurts with different notes', !dup, String(dup));

    /* ── + sheet: + another Yogurt ── */
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.locator('#mainInput').fill('yogurt'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(500);
    const tile = page.locator('#addSheetBody [data-add-another]').first();
    const tt = await tile.count() ? (await tile.textContent()).trim() : null;
    await tile.click(); await page.waitForTimeout(800);
    const a3 = await page.evaluate(()=>{ const a=document.activeElement; return { focused:!!(a && a.matches('[data-ae-note]')) }; });
    for(const ch of 'Vanilla'){ await page.keyboard.type(ch); await page.waitForTimeout(120); }
    await page.evaluate(()=>document.getElementById('mainInput').focus()); await page.waitForTimeout(600);
    const i3 = await items();
    ok('+ sheet: "+ another Yogurt" adds a separate Yogurt and opens it with the note field focused; "Vanilla" is kept', /another/i.test(tt||'') && a3.focused && i3.length===3 && i3.some(x=>/vanilla/i.test(x.note))   /* typed "Vanilla" matches the suggestion "vanilla", whose spelling is kept (v2.70) */, JSON.stringify({ tt, a3, i3 }));
    /* the household's screenshot: two Tofus on the list read the same in the + sheet → each shows its note, one tile per
       list item, one "+ another Tofu" */
    const T = DOC({ items:[ it2("11","Tofu","asian",{ qty:2, note:"Semi-fried" }), it2("12","Tofu","asian",{ qty:2, note:"Soft" }) ],
      buyAgain:[{ name:"Tofu", cat:"asian", note:"Semi-fried" }, { name:"Tofu", cat:"asian", note:"Soft" }] });
    await mk({ srv:{ "lists/v101": T }, cache:T, extra:BASE });
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(600);
    await page.locator('#mainInput').fill('tofu'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(500);
    const tf = await page.evaluate(()=>({ on:[...document.querySelectorAll('#addSheetBody [data-add-inc]')].map(b=>({ id:b.dataset.addInc, note:(b.querySelector('.pnote')||{}).textContent||'' })),
      another:document.querySelectorAll('#addSheetBody [data-add-another]').length }));
    ok('+ sheet: two Tofus on the list show as two tiles with their notes ("Semi-fried", "Soft"), one "+ another Tofu"', tf.on.length===2 && new Set(tf.on.map(x=>x.id)).size===2 && tf.on.map(x=>x.note).sort().join('|')==='Semi-fried|Soft' && tf.another===1, JSON.stringify(tf));
    await page.locator('#addSheetBody').evaluate(()=>{}); if(out) await page.screenshot({ path: out.replace(/\.png$/,'-tofu.png') });

    /* merging two of the same name AND note keeps the note, the shop and the flags (it dropped all three before v2.90) */
    const M = DOC({ items:[ it2("7","Milk","dairy",{ note:"Soy", where:"cdan", tags:["urgent"] }), it2("8","Milk","dairy",{ note:"Soy", qty:2 }) ] });
    await mk({ srv:{ "lists/v101": M }, cache:M, extra:BASE });
    const go = page.locator('[data-merge-go]').first(); const offered = await go.count();
    if(offered){ await go.click(); await page.waitForTimeout(600); }
    const mm = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).filter(i=>/milk/i.test(i.name)).map(i=>({ qty:i.qty, note:i.note, where:i.where, tags:i.tags })); });
    ok('two Milk "Soy" are offered for merging, and the merge keeps the note, the shop and the flag (qty 3)', offered===1 && mm.length===1 && mm[0].note==='Soy' && mm[0].where==='cdan' && (mm[0].tags||[]).includes('urgent') && mm[0].qty===3, JSON.stringify({ offered, mm }));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Another','another'].every(k=>fr.includes(`"${k}"`)));
    if(out) await page.screenshot({ path:out });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
