/* v2.83 — Edit item, from the household (Rows, Choices "variable", row names off):
   - the open row's orange outline was clipped (an outer box-shadow inside .editsec-v's overflow:hidden) and too thin: it is
     an inset ring now (lesson 50);
   - a g / kg / L / Pack counter that holds a value is filled like a chosen chip;
   - the counters are narrower, so Tbsp is no longer alone on its line;
   - Customise the look › Sheets › Layout › "Around choices": the space above and below an open list;
   - only one list open at a time: opening Unit, Category or Where to buy closes the others.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the open row's ring is the accent and inset (nothing can clip it);
   - a counter with a value has the chosen chip's dark fill; the empty ones do not;
   - at 390px, Tbsp shares its line with other choices;
   - with "Around choices" 24, the list is 24px below Unit and 24px above Category (unset: the row gap);
   - opening Category closes Unit, opening Where closes Category, and Unit closes Where;
   - "Around choices" has its French.

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

    await mk({ doc:D(), extra:LAY+'localStorage.setItem("ml_lk_edit_l2gap","24");' });
    await hold(page.locator('.pill[data-pill="1"]').first());
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(500);
    await page.locator('#sheet [data-wstep="edit|g|1"], #sheet [data-wstep^="edit|g|+"]').first().click(); await page.waitForTimeout(400);
    const acc = await page.evaluate(()=>{ const d=document.createElement('i'); d.style.color='var(--accent)'; document.body.appendChild(d); const c=getComputedStyle(d).color; d.remove(); return c; });
    const s = await page.evaluate(()=>{ const q=s=>document.querySelector(s), r=e=>e.getBoundingClientRect();
      const ring=getComputedStyle(q('#sheet [data-w-open] .edval'));
      const cs=[...document.querySelectorAll('#sheet .wgrid > .wcount')].map(c=>({ on:c.classList.contains('on'), bg:getComputedStyle(c.querySelector('.eqty')).backgroundColor }));
      const chip=[...document.querySelectorAll('#sheet .wgrid > :not(.wcount)')]; const tb=chip.find(c=>c.textContent.trim()==='Tbsp');
      const sameLine=[...document.querySelectorAll('#sheet .wgrid > *')].filter(c=>c!==tb && Math.abs(r(c).top-r(tb).top)<3).length;
      const g=q('#sheet .wgrid'), u=q('#sheet [data-w-open]'), cat=q('#ecHead');
      const btn=getComputedStyle(document.querySelector('.btn-dark, #sheet .catchip.on, #sheet .wgrid > .catchip.on') || document.body).backgroundColor;
      const line=Math.max(r(u).bottom, r(q('#sheet .edcell[data-row="qty"] .eqty')).bottom);   // the first line's bottom (the stepper is 2px taller than Unit)
      return { ring:[ring.borderTopColor, ring.boxShadow], cs, sameLine, above:Math.round(r(g).top-line), below:Math.round(r(cat).top-r(g).bottom) }; });
    ok('the open row\'s ring is the accent, inset (nothing can clip it)', s.ring[0]===acc && /inset/.test(s.ring[1]) && s.ring[1].includes(acc), JSON.stringify({ acc, ring:s.ring }));
    const dark = s.cs.filter(c=>c.on).map(c=>c.bg), light = s.cs.filter(c=>!c.on).map(c=>c.bg);
    ok('the g counter holding 100g is filled dark like a chosen chip; empty counters are not', dark.length===1 && light.length===3 && light.every(b=>b!==dark[0]) && /^rgb\((\d{1,2}), (\d{1,2}), (\d{1,2})\)$/.test(dark[0]), JSON.stringify(s.cs));
    ok('Tbsp is not alone on its line at 390px', s.sameLine>=1, JSON.stringify(s));
    ok('"Around choices" 24: the list is 24px below the Quantity/Unit line and 24px above Category', Math.abs(s.above-24)<=1 && Math.abs(s.below-24)<=1, JSON.stringify(s));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-unit.png') });
    const open = ()=>page.evaluate(()=>({ unit:!!document.querySelector('#sheet .edcell[data-row="unit"][data-open="1"]'), cat:!!document.querySelector('#sheet .edcell[data-row="cat"][data-open="1"]'), where:!!document.querySelector('#sheet .edcell[data-row="where"][data-open="1"]') }));
    await page.locator('#ecHead').click(); await page.waitForTimeout(400); const o1 = await open();
    await page.locator('#ewHead').click(); await page.waitForTimeout(400); const o2 = await open();
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(400); const o3 = await open();
    ok('one list at a time: Category closes Unit, Where closes Category, Unit closes Where', o1.cat&&!o1.unit&&!o1.where && o2.where&&!o2.cat&&!o2.unit && o3.unit&&!o3.where&&!o3.cat, JSON.stringify({ o1, o2, o3 }));
    /* unset: the gap is the row gap, as before */
    await mk({ doc:D(), extra:LAY });
    await hold(page.locator('.pill[data-pill="1"]').first());
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(500);
    const d0 = await page.evaluate(()=>{ const r=e=>e.getBoundingClientRect(), g=document.querySelector('#sheet .wgrid'); const line=Math.max(r(document.querySelector('#sheet [data-w-open]')).bottom, r(document.querySelector('#sheet .edcell[data-row="qty"] .eqty')).bottom); return { above:Math.round(r(g).top-line), below:Math.round(r(document.querySelector('#ecHead')).top-r(g).bottom), attr:document.documentElement.getAttribute('data-lk-edit-l2gap') }; });
    ok('unset: no attribute, and the spacing is exactly v2.82\'s (12px above the list, 10px below)', d0.attr===null && d0.above===12 && d0.below===10, JSON.stringify(d0));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('"Around choices" has its French', /"Around choices":\s*"/.test(fr), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
