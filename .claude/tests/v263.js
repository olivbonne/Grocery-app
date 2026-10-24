/* v2.63 — the household's batch: Ink and Noir gone, Regulars over a wallpaper, Text size in the Shop menu, Edit item redesign.

   WHAT THESE CHECKS HAVE TO PROVE:
   - Settings offers Light and Dark only; a phone on Ink opens on Light, a phone on Noir on Dark;
   - over a wallpaper, a Regular that is not on the list draws its icon unfilled (no dark/pale blob), in Full fill too;
   - the Shop page's ⋯ menu changes the text size and stays open;
   - Edit item: the title IS the name and edits it; no "If convenient", no Subcategory; Quantity with − n + on the right;
     Measure on the right opens the choices, which include 4/6/12 pack; the pills share one shape (round like Urgent);
   - Customise the look has an "Edit item" section whose colour and roundness reach the pills.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.56 an object
   literal at the start of a statement in a seed is a block — assign it first. */
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

    const D = ()=>({ v101:DOC({ items:[it("1","Beef steak","meat",{qty:7})], buyAgain:[{name:"Beef",cat:"meat",qty:1},{name:"Chicken",cat:"meat",qty:1}] }) });
    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };

    /* themes */
    await mk({ docs:D(), extra:'localStorage.setItem("ml_theme","ink");' }, '');
    ok('a phone on Ink opens on Light', await page.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='light', await page.evaluate(()=>document.documentElement.getAttribute('data-theme')));
    await mk({ docs:D(), extra:'localStorage.setItem("ml_theme","noir");' }, '');
    ok('a phone on Noir opens on Dark', await page.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='dark', '');
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const th = await page.evaluate(()=>[...document.querySelectorAll('[data-opt-theme]')].map(b=>b.dataset.optTheme));
    ok('Settings offers Light and Dark only', JSON.stringify(th.sort())==='["dark","light"]', JSON.stringify(th));

    /* Regulars over a wallpaper */
    for(const [thm, fill] of [["dark","accent"],["light","full"]]){
      await mk({ docs:D(), extra:`localStorage.setItem("ml_theme","${thm}"); localStorage.setItem("ml_wall","wall-1"); localStorage.setItem("ml_fill","${fill}"); localStorage.setItem("ml_fill_v141","1");` }, '');
      await page.locator('[data-regc="meat"]').first().click(); await page.waitForTimeout(600);
      const f = await page.evaluate(()=>{ const p=[...document.querySelectorAll('.pill.reg-out')].find(x=>/Chicken/.test(x.textContent)); const s=p&&p.querySelector('.if'); return s ? getComputedStyle(s).fill : 'none-found'; });
      ok(`…(${thm}) the Regular is there to check`, f!=='none-found', f);
      ok(`over a wallpaper (${thm}, ${fill} fill) a Regular not on the list draws its icon unfilled`, /rgba\(0, 0, 0, 0\)|transparent|^none$/.test(f), f);
      if(out) await page.screenshot({ path: out.replace(/\.png$/,`-regs-${thm}.png`) });
    }

    /* Text size in the Shop menu */
    await mk({ docs:D() }, '');
    const z0 = await page.evaluate(()=>localStorage.getItem('ml_density')||'');
    await page.locator('#shopMenu').click(); await page.waitForTimeout(500);
    const pct0 = await page.locator('#shopMenuEl .smzpct').innerText().catch(()=>'');
    await page.locator('#shopMenuEl [data-sm-zoom="1"]').click(); await page.waitForTimeout(500);
    const pct1 = await page.locator('#shopMenuEl .smzpct').innerText().catch(()=>'');
    ok('the ⋯ menu has Text size; + makes the text bigger and the menu stays open', !!pct0 && parseInt(pct1)>parseInt(pct0), pct0+' → '+pct1);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-menu.png') });

    /* Edit item */
    await mk({ docs:D() }, '');
    await hold(page.locator('.pill', { hasText:'Beef steak' }).first());
    const ed = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); if(!s) return null; const t=s.innerText;
      const ti=s.querySelector('input#editName'); const first=s.querySelector('input,button');
      return { title: ti && ti.value, titleFirst: first===ti, conv:/If convenient/.test(t), sub:/Subcategory/.test(t), qty:/Quantity/.test(t) && !!s.querySelector('.edrow .eqty #qPlus'), measure:!!s.querySelector('button.editsec[data-w-open]'),
        rad:[...s.querySelectorAll('.flagchip, .eqty')].map(e=>getComputedStyle(e).borderTopLeftRadius) }; });
    ok('Edit item\'s title is the item\'s name, as the first thing in the sheet', ed && ed.title==='Beef steak' && ed.titleFirst, JSON.stringify(ed));
    ok('…no "If convenient", no Subcategory', ed && !ed.conv && !ed.sub, '');
    ok('…Quantity is a row with − n + on the right, and Measure a row like Category', ed && ed.qty && ed.measure, '');
    ok('…the pills share one round shape (Urgent, If discounted, the quantity)', ed && ed.rad.length>=3 && new Set(ed.rad).size===1, JSON.stringify(ed && ed.rad));
    await page.locator('#qPlus').click(); await page.waitForTimeout(250);
    await page.locator('#sheet button.editsec[data-w-open]').click(); await page.waitForTimeout(400);
    const ch = await page.evaluate(()=>[...document.querySelectorAll('#sheet .wgrid button')].map(b=>b.textContent.trim()));
    ok('Measure opens the choices, with 4, 6 and 12 pack', ['4 pack','6 pack','12 pack'].every(x=>ch.includes(x)), JSON.stringify(ch));
    await page.locator('#sheet .wgrid button', { hasText:/^6 pack$/ }).click(); await page.waitForTimeout(300);
    await page.locator('#editName').fill('Rib steak');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });
    await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    const saved = await page.evaluate(()=>{ const i=JSON.parse(localStorage.getItem('ml_cache_v101')).items.find(x=>x.id==="1"); return i && { n:i.name, q:i.qty, w:i.weight }; });
    ok('editing the title renames the item, and the quantity and the 6 pack are kept', saved && saved.n==='Rib steak' && saved.q===8 && saved.w==='6 pack', JSON.stringify(saved));

    /* the look section */
    await mk({ docs:D(), extra:'localStorage.setItem("ml_epillbg","#FFE08A"); localStorage.setItem("ml_eprad","4");' }, '');
    await hold(page.locator('.pill', { hasText:'Beef steak' }).first());
    const lk = await page.evaluate(()=>{ const u=document.querySelector('#sheet .flagchip'); const c=getComputedStyle(u); return { bg:c.backgroundColor, r:c.borderTopLeftRadius }; });
    ok('Customise the look › Edit item: its background and roundness reach the pills', lk.bg==='rgb(255, 224, 138)' && lk.r==='4px', JSON.stringify(lk));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    /* SUPERSEDED by v2.69: the section is "Sheets" now, with Edit item as its first choice. */
    ok('…and "Sheets" (with Edit item) is a section of the look page', /LOOK_SECTS = new Set\([^)]*"Sheets"/.test(src) && /data-lk-sheet/.test(src), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
