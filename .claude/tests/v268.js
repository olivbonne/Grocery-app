/* v2.68 — the household's batch: Regulars by note, notes remembered, the note as text + chosen tiles, one pill height,
   no lines, more shape settings, no AI explanation, Theme / Group / Sort in the Shop menu, bigger line under the name.

   WHAT THESE CHECKS HAVE TO PROVE:
   - "Chili · large, red" and "Chili · small, green" are two Regulars (a Regular is its name, category AND note); a Regular
     with no note keeps exactly its old key;
   - a note used before is offered again as a chip for that item; the note shows its chosen options as tiles (always) and
     only the free text in the box;
   - every pill in Edit item is one height, and the rows have no line between them;
   - Customise the look › Edit item: roundness goes to 28, the gap has Across and Down;
   - no "✨ AI order · …" line above the Shop list;
   - the Shop ⋯ menu changes the theme, grouping and sort, and stays open;
   - the line under an item's name is as big as its quantity (13px).

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
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  const lists=${JSON.stringify(o.lists||[{code:"v101",name:"Groceries"}])};
  localStorage.setItem("ml_lists", JSON.stringify(lists));
  const docs=${JSON.stringify(o.docs||{ v101:DOC() })}; Object.entries(docs).forEach(([c,d])=>localStorage.setItem("ml_cache_"+c, JSON.stringify(d)));
  localStorage.setItem("ml_lastlist", ${JSON.stringify(o.last||"v101")}); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };


(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page, api=[];
    const mk = async(o, q)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => { api.push(r.request().url()); r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"milk",qty:1,weight:"",category:"fresh"}] }) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html${q}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const names = (c)=>page.evaluate((c)=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_'+c)).items.map(i=>i.name.toLowerCase()); }catch(e){ return []; } }, c||'v101');

    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));

    /* A. a Regular is its name, category and note */
    await mk({ docs:{ v101:DOC({ items:[it("1","Chili","vegetable",{ note:"small, green" })], buyAgain:[{name:"Chili",cat:"vegetable",qty:1,note:"large, red"}] }) } }, '');
    await hold(page.locator('.pill[data-pill="1"]').first());
    const sel = await page.evaluate(()=>({ chosen:[...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.trim()), free:(document.querySelector('#editNote')||{}).value,
      offered:[...document.querySelectorAll('#sheet .ednotechips .catchip, #sheet .ednotesel .catchip')].map(c=>c.textContent.trim().toLowerCase()) }));
    ok('a note used before is offered again for that item ("large", "red" from the other Chili)', ['large','red'].every(x=>sel.offered.includes(x)), JSON.stringify(sel.offered));
    ok('the note shows its chosen options as tiles and only free text in the box', sel.chosen.length>=1 && !sel.chosen.some(c=>(sel.free||'').includes(c)), JSON.stringify(sel));
    const shape = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); const hs=[...s.querySelectorAll('.flagchip, .eqty, .editsec .edval')].filter(e=>e.offsetParent!==null).map(e=>Math.round(e.getBoundingClientRect().height));
      const lines=[...s.querySelectorAll('.editsec')].map(e=>getComputedStyle(e).borderTopStyle==='none'||getComputedStyle(e).borderTopWidth==='0px');
      return { hs, noLines: lines.every(Boolean) }; });
    ok('every pill in Edit item is one height (Urgent, the quantity, the tiles)', shape.hs.length>=5 && new Set(shape.hs).size===1, JSON.stringify(shape.hs));
    ok('…and no line between the rows', shape.noLines, '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });
    await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    let c = await cache();
    const chilis = c.buyAgain.filter(r=>r.name==='Chili').map(r=>r.note).sort();
    ok('"Chili · large, red" and "Chili · small, green" are two Regulars', JSON.stringify(chilis)==='["large, red","small, green"]', JSON.stringify(c.buyAgain));
    await page.locator('[data-regc="vegetable"]').first().click().catch(()=>{}); await page.waitForTimeout(500);
    const tiles = await page.evaluate(()=>[...document.querySelectorAll('.pill.reg-in, .pill.reg-out')].filter(p=>/Chili/.test(p.textContent)).map(p=>p.textContent.replace(/\s+/g,' ').trim()));
    ok('…both show as tiles, each with its note', tiles.length===2 && tiles.some(t=>/large, red/.test(t)) && tiles.some(t=>/small, green/.test(t)), JSON.stringify(tiles));
    const red = page.locator('.pill.reg-out', { hasText:'large, red' }).first();
    if(await red.count()){ await red.click(); await page.waitForTimeout(500); }
    c = await cache();
    ok('tapping the red one adds a second Chili with its own note (not merged into the green one)', c.items.filter(i=>i.name==='Chili').map(i=>i.note).sort().join('|')==='large, red|small, green', JSON.stringify(c.items));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-regs.png') });

    /* the line under the name */
    const fs13 = await page.evaluate(()=>{ const n=document.querySelector('#zoomer .pill[data-pill] .pnote'), q=document.querySelector('#zoomer .pill .qty'); return { note:n&&getComputedStyle(n).fontSize, qty:q&&getComputedStyle(q).fontSize }; });
    ok('the line under an item\'s name is as big as its quantity (13px)', fs13.note==='13px', JSON.stringify(fs13));

    /* B. shape settings */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('Edit item roundness goes to 28, and its gap has Across and Down', /erad:\s*\{[^}]*max:\s*28/.test(src) && /egapy:\s*\{[^}]*ls:\s*"ml_epgapy"/.test(src), '');

    /* C. no AI explanation */
    await mk({ docs:{ v101:DOC({ items:[it("1","Milk","fresh")] }) }, extra:'localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_sorts", JSON.stringify({flat:"ai",cat:"cat"}));' }, '');
    ok('no "✨ AI order · …" line above the Shop list', !/AI order ·/.test(await page.evaluate(()=>document.body.innerText)), '');

    /* D. the Shop menu */
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const m0 = await page.evaluate(()=>({ theme:document.querySelectorAll('[data-sm-theme]').length, cat:document.querySelectorAll('[data-sm-caton]').length, sort:[...document.querySelectorAll('[data-sm-sort]')].map(b=>b.dataset.smSort) }));
    ok('the ⋯ menu has Theme, Group by category and Sort', m0.theme===2 && m0.cat===2 && m0.sort.includes('cat') && m0.sort.includes('alpha'), JSON.stringify(m0));
    await page.locator('[data-sm-theme="dark"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-sm-caton="1"]').click(); await page.waitForTimeout(300);
    const m1 = await page.evaluate(()=>({ theme:document.documentElement.getAttribute('data-theme'), caton:localStorage.getItem('ml_caton'), open:!!document.querySelector('#shopMenuEl') }));
    ok('…they work, and the menu stays open', m1.theme==='dark' && m1.caton==='1' && m1.open, JSON.stringify(m1));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-menu.png') });
    await page.locator('[data-sm-sort="alpha"]').click(); await page.waitForTimeout(300);
    ok('…Sort too', /alpha/.test(await page.evaluate(()=>localStorage.getItem('ml_sorts')||'')), await page.evaluate(()=>localStorage.getItem('ml_sorts')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
