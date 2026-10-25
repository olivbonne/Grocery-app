/* v2.77 — Edit item, from the household's screenshots (Rows and Choices "variable", row names off): the counters show their
   unit when empty; the Unit choices run Unit, g, kg, L, Pack, cup, tsp, Tbsp; with Choices "variable" the counters flow on
   the chips' lines; an open row's tile never moves (its list comes after every row tile); a list stays open after a pick;
   the sheet keeps still when something is picked (no slide-in replay, no scroll reset, no shrinking).

   WHAT THESE CHECKS HAVE TO PROVE:
   - the order, and an empty counter reading its unit ("g", "Pack");
   - Choices "variable": the g counter is on the Unit chip's line;
   - opening Unit or Category moves no row tile (Unit stays beside Quantity, Category and Where where they were);
   - picking cup keeps the list open and Unit beside Quantity; picking a category keeps its list open;
   - the sheet's top edge does not move when something is picked, and a re-drawn sheet does not replay its animation.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const now = Date.now();
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[{id:"cdan",name:"Dandenong market",aisles:[]}], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_cache_v101", JSON.stringify(${JSON.stringify(o.doc||DOC())}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const LAY = 'localStorage.setItem("ml_lk_edit_rows","v"); localStorage.setItem("ml_lk_edit_names","0"); localStorage.setItem("ml_lk_edit_chcols","v");';
    const D = ()=>DOC({ items:[it("1","chilli","vegetable",{ qty:2, note:"Large, Green" })] });
    const top = (sel)=>page.evaluate(s=>{ const e=document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }, sel);

    await mk({ doc:D(), extra:LAY });
    await hold(page.locator('.pill[data-pill="1"]').first());
    const closed = { qty:await top('#sheet .edcell[data-row="qty"]'), unit:await top('#sheet [data-w-open]'), cat:await top('#ecHead'), where:await top('#ewHead') };
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(500);
    const seq = await page.evaluate(()=>[...document.querySelectorAll('#sheet .wgrid > *')].map(e=>e.classList.contains('wcount') ? e.querySelector('.wcount-v').textContent.trim() : e.textContent.trim()));
    ok('the Unit choices run Unit, g, kg, L, Pack, cup, tsp, Tbsp; an empty counter reads its unit', JSON.stringify(seq)==='["Unit","g","kg","L","Pack","cup","tsp","Tbsp"]', JSON.stringify(seq));
    const line = await page.evaluate(()=>{ const a=document.querySelector('#sheet .wgrid > .catchip').getBoundingClientRect(), b=document.querySelector('#sheet .wgrid > .wcount').getBoundingClientRect(); return Math.abs(a.top-b.top) < 6; });
    ok('Choices "variable": the counters flow on the chips\' line', line, '');
    const rel = async()=>{ const q=await top('#sheet .edcell[data-row="qty"]'); return { unit:(await top('#sheet [data-w-open]'))-q, cat:(await top('#ecHead'))-q, where:(await top('#ewHead'))-q }; };
    const cRel = { unit:closed.unit-closed.qty, cat:closed.cat-closed.qty, where:closed.where-closed.qty };
    let r1 = await rel();
    ok('opening Unit moves no row tile (Unit stays beside Quantity)', JSON.stringify(r1)===JSON.stringify(cRel) && r1.unit===0, JSON.stringify({ cRel, r1 }));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-unit.png') });
    const t0 = await top('#sheet');
    await page.locator('#sheet [data-w-set="edit|cup"]').click(); await page.waitForTimeout(500);
    const after = { open:await page.locator('#sheet .wgrid').count(), unit:await top('#sheet [data-w-open]'), sheet:await top('#sheet'), anim:await page.evaluate(()=>getComputedStyle(document.querySelector('#sheet')).animationName) };
    r1 = await rel();
    ok('picking cup keeps the list open, and no row tile moves', after.open===1 && JSON.stringify(r1)===JSON.stringify(cRel), JSON.stringify({ after, r1 }));
    ok('…the sheet keeps still: its top does not move, and it does not slide in again', after.sheet===t0 && after.anim==='none', JSON.stringify({ t0, after }));
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(400);
    await page.locator('#ecHead').click(); await page.waitForTimeout(500);
    const c1 = await rel();
    ok('opening Category moves no row tile (Category and Where to buy stay where they were)', JSON.stringify(c1)===JSON.stringify(cRel), JSON.stringify({ cRel, c1 }));
    const t1 = await top('#sheet');
    await page.locator('#sheet [data-ec="fruit"]').click(); await page.waitForTimeout(500);
    ok('picking a category keeps its list open, and the sheet still', await page.locator('#sheet [data-ec]').count()>3 && await top('#sheet')===t1, '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-cat.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
