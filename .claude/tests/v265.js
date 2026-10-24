/* v2.65 — Edit item: values as tiles, the note always a field, one Save for the list and the Regulars.

   WHAT THESE CHECKS HAVE TO PROVE:
   - Measure ("unit" when empty — not "None"), Category and Where to buy show their value as a tile with the arrow inside;
   - the Note is always a field with a grey example in it; its suggestions show while it has focus, and tapping one fills
     the field WITHOUT a re-render (so the keyboard stays up);
   - there is no "Add to Regulars" / "Add to list" button: only Delete and Save;
   - Save on an item on the list saves it there AND as a Regular (renaming moves the Regular, it does not duplicate it);
   - Save on a Regular that is on the list updates that list item too; on a Regular not on the list, only the Regular.

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

    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));

    /* the sheet */
    await mk({ docs:{ v101:DOC({ items:[it("1","Yogurt","fresh")], buyAgain:[] }) } }, '');
    await hold(page.locator('.pill', { hasText:'Yogurt' }).first());
    const sh = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); const rows={};
      s.querySelectorAll('.editsec').forEach(r=>{ const l=r.querySelector('.editsec-l'); if(l) rows[l.textContent.trim()] = { tile:!!r.querySelector('.edval'), text:(r.querySelector('.edval')||{}).textContent||'', arrowIn:!!r.querySelector('.edval .editsec-ch') }; });
      const note=s.querySelector('input#editNote');
      return { rows, note: note && { ph:note.placeholder, val:note.value }, btns:[...s.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(x=>/Regulars|Add to list|Save|Delete/.test(x)) }; });
    ok('Measure, Category and Where to buy show their value as a tile with the arrow inside', ['Measure','Category','Where to buy'].every(k=>sh.rows[k] && sh.rows[k].tile && sh.rows[k].arrowIn), JSON.stringify(sh.rows));
    ok('…an empty Measure reads "unit", not "None"', /^unit/.test((sh.rows.Measure||{}).text.trim()), (sh.rows.Measure||{}).text);
    /* SUPERSEDED by v2.70: the free note is a small pencil tile ("Add note"); the chosen options are tiles in line with it.
       Still protected: the note entry is always there and starts empty. */
    ok('the Note is always a field (a small pencil tile, "Add note")', sh.note && sh.note.val==='' && await page.locator('#sheet .ednotefree svg').count()===1, JSON.stringify(sh.note));
    ok('only Delete and Save — no "Add to Regulars" / "Add to list"', JSON.stringify(sh.btns)==='["Delete","Save"]', JSON.stringify(sh.btns));
    const hidden = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotechips .catchip')].filter(c=>c.offsetParent!==null).length);
    await page.locator('#editNote').click(); await page.waitForTimeout(300);
    const shown = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotechips .catchip')].filter(c=>c.offsetParent!==null).map(c=>c.textContent.replace('×','').trim()));   // v2.70: a chip carries a (hidden) × span
    ok('its suggestions show only while it has focus', hidden===0 && shown.length>0, JSON.stringify(shown));
    await page.evaluate(()=>{ window.__sameSheet = document.querySelector('#sheet'); });
    await page.locator('#sheet .ednotechips .catchip').first().click(); await page.waitForTimeout(300);
    /* SUPERSEDED by v2.68: a tapped suggestion becomes a chosen TILE (.ednotesel), and the box keeps only the free text. Still
       protected: no re-render, the field keeps focus, and the choice is in the note. */
    const after = await page.evaluate(()=>({ same: window.__sameSheet===document.querySelector('#sheet'), focus: document.activeElement && document.activeElement.id,
      val: [...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.replace('×','').trim()).join(', ') }));
    ok('tapping a suggestion makes it a chosen tile without a re-render, and the field keeps focus (keyboard stays up)', after.same && after.focus==='editNote' && after.val===shown[0], JSON.stringify(after));
    const onBg = await page.evaluate(()=>{ const c=document.querySelector('#sheet .ednotesel .catchip.on'); const o=document.querySelector('#sheet .ednotechips .catchip:not(.on)'); return c&&o ? [getComputedStyle(c).backgroundColor, getComputedStyle(o).backgroundColor] : null; });
    ok('…and the chosen suggestion shows as chosen', onBg && onBg[0]!==onBg[1], JSON.stringify(onBg));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sheet.png') });
    await page.locator('#editName').fill('Greek yogurt');
    await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    let c = await cache();
    ok('Save on an item on the list saves it there AND as a Regular, with its note', c.items[0].name==='Greek yogurt' && c.buyAgain.some(r=>r.name==='Greek yogurt' && r.note===shown[0]), JSON.stringify({ items:c.items.map(i=>i.name), regs:c.buyAgain.map(r=>r.name+':'+(r.note||'')) }));
    ok('…and says so', /also in Regulars/.test(await page.evaluate(()=>document.body.innerText)), '');

    /* renaming moves the Regular, it does not duplicate it */
    await mk({ docs:{ v101:DOC({ items:[it("1","Tea","others",{where:"s1"})], buyAgain:[{name:"Tea",cat:"others",qty:1,where:"s1"}] }) } }, '');
    await hold(page.locator('.pill', { hasText:'Tea' }).first());
    await page.locator('#editName').fill('Green tea'); await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    c = await cache();
    ok('renaming an item renames its Regular (no duplicate), keeping where to buy', c.buyAgain.length===1 && c.buyAgain[0].name==='Green tea' && c.buyAgain[0].where==='s1', JSON.stringify(c.buyAgain));

    /* a Regular on the list, edited from Regulars */
    await mk({ docs:{ v101:DOC({ items:[it("1","Rice","bulk",{qty:1})], buyAgain:[{name:"Rice",cat:"bulk",qty:1},{name:"Oats",cat:"bulk",qty:1}] }) } }, '');
    await page.locator('[data-regc="bulk"]').first().click(); await page.waitForTimeout(500);
    await hold(page.locator('.pill.reg-in, .pill.reg-out', { hasText:'Rice' }).first());
    const isReg = await page.locator('#sheet #editName').count();
    if(isReg){ await page.locator('#qPlus').click(); await page.waitForTimeout(200); await page.locator('#saveBtn').click(); await page.waitForTimeout(500); }
    c = await cache();
    ok('Save on a Regular that is on the list updates the list item too', isReg && c.items.find(i=>i.name==='Rice').qty===2 && c.buyAgain.find(r=>r.name==='Rice').qty===2, JSON.stringify({ items:c.items, regs:c.buyAgain }));
    await hold(page.locator('.pill.reg-in, .pill.reg-out', { hasText:'Oats' }).first());
    if(await page.locator('#sheet #editName').count()){ await page.locator('#qPlus').click(); await page.waitForTimeout(200); await page.locator('#saveBtn').click(); await page.waitForTimeout(500); }
    c = await cache();
    ok('…and on a Regular not on the list, only the Regular', c.buyAgain.find(r=>r.name==='Oats').qty===2 && !c.items.some(i=>i.name==='Oats'), JSON.stringify({ regs:c.buyAgain, items:c.items.map(i=>i.name) }));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-regs.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
