/* v2.74 — Customise the look › Sheets › Layout: the sheet's rows in 1–6 columns or variable (level 1), the choices under a
   row in 1–6 columns or variable (level 2), row names on/off, and the gap between rows.

   WHAT THESE CHECKS HAVE TO PROVE:
   - untouched, Edit item is laid out exactly as before (no layout attribute, the rows a plain block);
   - the look page has Rows, Choices, Row names and Row gap for Edit item, and a tap stores the choice;
   - Rows 2: Category and Where to buy sit side by side; an open row's choices take the whole width;
   - Row names off hides "Quantity", "Unit"…; Choices 3 lays the units out in three columns;
   - the note's suggestions still show only while the note is being typed.

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
    const D = ()=>DOC({ items:[it("1","Yogurt","dairy",{ qty:3, note:"high protein" })] });

    /* 1. untouched */
    await mk({ doc:D() });
    await hold(page.locator('.pill[data-pill="1"]').first());
    const u = await page.evaluate(()=>({ attrs:[...document.documentElement.attributes].map(a=>a.name).filter(n=>/^data-lk-edit-(rows|chcols|names|rgap)/.test(n)), disp:getComputedStyle(document.querySelector('#sheet .edrows')).display,
      cells:[...document.querySelectorAll('#sheet .edcell')].map(c=>c.dataset.row), sug:(()=>{ const s=document.querySelector('#sheet .ednotechips'); return s ? getComputedStyle(s).display : 'none'; })() }));
    ok('untouched, Edit item is laid out as before: no layout attribute, the rows a plain block', u.attrs.length===0 && u.disp==='block', JSON.stringify(u));
    ok('…its rows are cells: note, quantity, unit, category, where to buy', JSON.stringify(u.cells)==='["note","qty","unit","cat","where"]', JSON.stringify(u.cells));

    /* 2. the look page */
    await page.keyboard.press('Escape'); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200);
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optLook').click(); await page.waitForTimeout(600);
    const ctl = await page.evaluate(()=>({ rows:[...document.querySelectorAll('[data-lk-rows^="edit|"]')].map(b=>b.dataset.lkRows.split('|')[1]), ch:document.querySelectorAll('[data-lk-chcols^="edit|"]').length, names:document.querySelectorAll('[data-lk-names^="edit|"]').length,
      gap:!!document.querySelector('[data-num="lk_edit_rgapx"], [data-numkey="lk_edit_rgapx"], #num_lk_edit_rgapx') || /Row gap/.test(document.body.innerText) }));
    ok('the look page has Rows (Default, 1–6, variable), Choices, Row names and Row gap for Edit item', JSON.stringify(ctl.rows)==='["","1","2","3","4","5","6","v"]' && ctl.ch===8 && ctl.names===2 && ctl.gap, JSON.stringify(ctl));
    await page.locator('[data-lk-rows="edit|2"]').click(); await page.waitForTimeout(400);
    ok('…and a tap stores the choice', await page.evaluate(()=>localStorage.getItem('ml_lk_edit_rows'))==='2', '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-look.png') });

    /* 3. rows 2, names off, choices 3 */
    await mk({ doc:D(), extra:'localStorage.setItem("ml_lk_edit_rows","2"); localStorage.setItem("ml_lk_edit_names","0"); localStorage.setItem("ml_lk_edit_chcols","3");' });
    await hold(page.locator('.pill[data-pill="1"]').first());
    let g = await page.evaluate(()=>{ const r=s=>document.querySelector('#sheet .edcell[data-row="'+s+'"]').getBoundingClientRect();
      return { cat:r('cat'), where:r('where'), lab:[...document.querySelectorAll('#sheet .edrows .editsec-l')].filter(l=>l.offsetParent!==null).length }; });
    ok('Rows 2: Category and Where to buy sit side by side', Math.abs(g.cat.top-g.where.top)<2 && g.where.left>g.cat.right-1, JSON.stringify(g));
    ok('Row names off: no row name is shown', g.lab===0, String(g.lab));
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(400);
    g = await page.evaluate(()=>{ const c=document.querySelector('#sheet .edcell[data-row="unit"]'), w=c.querySelector('.wgrid'), s=document.querySelector('#sheet .edrows');
      const cols=getComputedStyle(w).gridTemplateColumns.split(' ').length; return { open:c.dataset.open, cw:w.getBoundingClientRect().width, sw:s.getBoundingClientRect().width, cols }; });
    /* SUPERSEDED by v2.76: the open row stays in its place (display:contents) and only its choices take the whole width. */
    ok('…an open row\'s choices take the whole width', g.open==='1' && Math.abs(g.cw-g.sw)<2, JSON.stringify(g));
    ok('Choices 3: the units are in three columns', g.cols===3, String(g.cols));
    const sg = await page.evaluate(()=>{ const s=document.querySelector('#sheet .ednotechips'); return s ? s.offsetParent!==null : false; });
    ok('…and the note\'s suggestions stay hidden until the note is being typed', !sg, String(sg));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sheet.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
