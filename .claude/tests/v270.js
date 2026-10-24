/* v2.70 — sheet transparency; Edit item: tile-shaped Save/Delete with a bin, the price beside the name, the flags above the
   buttons, the note as one line of removable tiles with a small pencil entry; the same item with different notes stays
   separate (Smart add keeps the note, typing never folds into a noted item).

   WHAT THESE CHECKS HAVE TO PROVE:
   - an Opacity set for "Other sheets" makes such a sheet see-through, and an untouched sheet is unchanged;
   - Delete has a drawn bin and both buttons have the tiles' roundness; the last price sits in the title row; Urgent and If
     discounted come just before the buttons;
   - typed note text becomes a tile on a comma, the tile is removed by a tap, and the note follows;
   - Smart add's "yogurt · calcium, mango" and "yogurt · calcium, blueberry" become two items; typing "yogurt" adds a plain
     one rather than folding into a noted yogurt.

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
      await ctx.route('**/api/**', r => { api.push(r.request().url()); r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"yogurt",qty:1,weight:"",category:"fresh",note:"calcium, mango"},{name:"yogurt",qty:1,weight:"",category:"fresh",note:"calcium, blueberry"}] }) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html${q}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const names = (c)=>page.evaluate((c)=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_'+c)).items.map(i=>i.name.toLowerCase()); }catch(e){ return []; } }, c||'v101');

    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));

    /* 1. opacity */
    await mk({ docs:{ v101:DOC({ items:[it("1","Yogurt","fresh")] }) } }, '');
    await page.locator('#listSwitch').click(); await page.waitForTimeout(500);
    const plain = await page.evaluate(()=>({ attr:document.documentElement.hasAttribute('data-lka-other'), bg:getComputedStyle([...document.querySelectorAll('.sheet')].find(x=>!x.dataset.look)).backgroundColor }));
    await mk({ docs:{ v101:DOC({ items:[it("1","Yogurt","fresh")] }) }, extra:'localStorage.setItem("ml_lk_other_bg","#2A6041"); localStorage.setItem("ml_lk_other_alpha","60");' }, '');
    await page.locator('#listSwitch').click(); await page.waitForTimeout(500);
    const see = await page.evaluate(()=>getComputedStyle([...document.querySelectorAll('.sheet')].find(x=>!x.dataset.look)).backgroundColor);
    ok('an Opacity of 60% for Other sheets makes such a sheet see-through', /rgba?\([^)]*,\s*0\.6\d*\)|color\(srgb[^)]*\/\s*0\.6/.test(see), see);
    ok('…and an untouched sheet is unchanged (no opacity attribute)', !plain.attr, JSON.stringify(plain));

    /* 2. Edit item */
    await mk({ docs:{ v101:DOC({ items:[it("1","Yogurt","fresh")], prices:{ yogurt:[{ p:4.5, sn:"Coles", d:"2026-10-20", t:Date.now()-86400000, q:1 }] } }) } }, '');
    await hold(page.locator('.pill[data-pill="1"]').first());
    const ed = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); const del=s.querySelector('#delBtn'), sv=s.querySelector('#saveBtn'), fl=s.querySelector('.flagchip');
      const where=[...s.querySelectorAll('.editsec-l')].find(l=>/Where to buy/.test(l.textContent));
      return { bin:!!del.querySelector('svg'), rads:[del,sv,fl].map(e=>getComputedStyle(e).borderTopLeftRadius), price:(s.querySelector('.edtitlerow .pricemem-c')||{}).textContent||'',
        flagsLate: !!(where && fl && (where.compareDocumentPosition(fl) & Node.DOCUMENT_POSITION_FOLLOWING)) && !!(fl.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
    ok('Delete has a drawn bin, and Save/Delete have the tiles\' roundness', ed.bin && new Set(ed.rads).size===1, JSON.stringify(ed.rads));
    ok('the last price paid sits in the title row, beside the name', /\$4\.50/.test(ed.price) && /Coles/.test(ed.price), ed.price);
    ok('Urgent and If discounted come just before the buttons', ed.flagsLate, '');
    await page.locator('#editNote').click(); await page.locator('#editNote').type('organic, '); await page.waitForTimeout(300);
    let tiles = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()));
    ok('typed note text becomes a tile on a comma', tiles.includes('organic') && (await page.locator('#editNote').inputValue()).trim()==='', JSON.stringify(tiles));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });
    await page.locator('#sheet .ednotesel .catchip', { hasText:'organic' }).click(); await page.waitForTimeout(300);
    tiles = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()));
    ok('…and a tap removes it', !tiles.includes('organic'), JSON.stringify(tiles));
    await page.locator('#editNote').type('greek'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    ok('the note saved is the tiles', ((await cache()).items[0].note||'').toLowerCase()==='greek', (await cache()).items[0].note);

    /* 3. separate items */
    await mk({ docs:{ v101:DOC({ items:[] }) } }, '');
    await page.locator('#emptyAdd').click(); await page.waitForTimeout(400);
    await page.locator('#mainInput').fill('yogurt calcium mango and yogurt calcium blueberry'); await page.waitForTimeout(200);
    const sm = page.locator('[data-smart-typed], #smartTyped, button:has-text("Smart add")').first();
    if(await sm.count()){ await sm.click(); await page.waitForTimeout(900); }
    if(await page.locator('#smartConfirm').count()){ await page.locator('#smartConfirm').click(); await page.waitForTimeout(600); }
    let c = await cache();
    const ys = c.items.filter(i=>i.name.toLowerCase()==='yogurt').map(i=>i.note).sort();
    ok('Smart add keeps "yogurt · calcium, mango" and "yogurt · calcium, blueberry" as two items', JSON.stringify(ys)==='["calcium, blueberry","calcium, mango"]', JSON.stringify(c.items.map(i=>i.name+':'+(i.note||''))));
    await page.evaluate(()=>{ const b=document.querySelector('#addBg'); if(b) b.click(); });
    await page.waitForTimeout(300);
    await page.locator('#shopAddFab, #emptyAdd').first().click().catch(()=>{}); await page.waitForTimeout(400);
    await page.locator('#mainInput').fill('yogurt'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    c = await cache();
    ok('typing "yogurt" adds a plain one rather than folding into a noted yogurt', c.items.filter(i=>i.name.toLowerCase()==='yogurt').length===3, JSON.stringify(c.items.map(i=>i.name+':'+(i.note||''))));
    const parse = fs.readFileSync(path.join(ROOT,'api','parse.js'),'utf8');
    ok('Smart add\'s reader is asked for the note, and the reply keeps it', /"note": string/.test(parse) && /note/.test(parse.slice(parse.indexOf('function clampItem'))), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
