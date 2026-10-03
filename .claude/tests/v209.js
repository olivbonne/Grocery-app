/* v2.09 — free receipt reading, with price memory.

   WHY THIS EXISTS: item 2 of the plan. A photo of the receipt after a shop: the person checks the names
   and the store, the app remembers what was paid for each thing at that store, and ticks off what was on
   the list. It is the start of real price data, so the data has to be right — the right store, the right
   date, only the lines the person kept, under names that will match the list next time — and it must
   survive the sync, which rebuilds the list document from a fixed shape (the trap CLAUDE.md names).

   WHAT THESE CHECKS HAVE TO PROVE:
   - Settings › Prices reads a receipt; the photo is sent to /api/receipt as an image, shrunk on the phone;
   - the review shows the store matched to a SAVED store, the receipt's date, every line with its price,
     and which lines are on the list;
   - a corrected name is saved under the correction; a line left out is not saved at all;
   - Save records price, store, date per item, and ticks off exactly the list items the lines name;
   - an item's own sheet then says what was last paid, and where;
   - the prices survive a reload, and the sync's state rebuild carries them;
   - the daily cap stops the eleventh receipt before any request; a server error is said plainly;
   - the cap's counter is kept out of appearance slots (both exclusion lists).

   TEST-BUG NOTES CARRIED FORWARD: v1.60 drive the real control; v1.91 assert WHICH value; v2.00 the seed
   returns early once seeded, and the cart drawer starts closed; v2.07 the app reopens on the last page. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
/* a real 1×1 PNG: planShrinkImage decodes the file, so it has to be an image */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const RECEIPT = { store:'COLES DANDENONG', date:'2026-10-02', total:12.1, items:[
  { raw:'WW FR RANGE EGGS 12PK', name:'free range eggs', qty:1, weight:'', price:5.5, category:'fresh' },
  { raw:'MILK FULL CRM 2L', name:'full cream milk', qty:1, weight:'2 L', price:3.1, category:'fresh' },
  { raw:'TIM TAM ORIG', name:'tim tam', qty:1, weight:'', price:3.5, category:'others' } ] };
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const it=(id,n,c)=>({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[it("1","Eggs","fresh"),it("2","Milk","fresh"),it("3","Bread","fresh")],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[], sent=[]; let replyStatus=200, replyBody=RECEIPT;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
  await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
  await ctx.route('**/api/receipt', r => { try{ sent.push(JSON.parse(r.request().postData()||'{}')); }catch(e){ sent.push({}); }
    r.fulfill({ status:replyStatus, contentType:'application/json', body:JSON.stringify(replyBody) }); });
  const page = await ctx.newPage(); page.setDefaultTimeout(9000);
  page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  await page.addInitScript(SEED);
  const load = async()=>{ await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
  await load();
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(550); };
  const has = (sel)=>page.evaluate(s=>!!document.querySelector(s), sel);
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  const readReceipt = async(sel)=>{ const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator(sel).first().click()]);
    await fc.setFiles({ name:'receipt.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1200); };
  const src = fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
  const rx = (name)=>new RegExp(((src.match(new RegExp('const '+name+' = (\\/.*\\/);'))||[])[1]||'//').slice(1,-1));

  try{
    /* ── A. reading ────────────────────────────────────────────────────── */
    await tap('#setNav, #setNavP, #setNavS');
    ok('Settings › Prices offers "Read a receipt"', await has('#optRcpt'), '');
    await readReceipt('#optRcpt');
    ok('the photo goes to /api/receipt, as an image the phone has already shrunk', sent.length===1 && /^data:image\/jpeg;base64,/.test(sent[0].image||''), JSON.stringify(sent.map(s=>String(s.image||'').slice(0,30))));
    const rv = await page.evaluate(()=>{ const s=document.querySelector('#rcSheet'); if(!s) return null;
      return { store:[...s.querySelectorAll('[data-rcstore].on')].map(b=>b.textContent.trim()),
        date:(s.querySelector('#rcDate')||{}).value,
        names:[...s.querySelectorAll('[data-rcname]')].map(i=>i.value),
        prices:[...s.querySelectorAll('.rcprice')].map(x=>x.textContent.trim()),
        onList:[...s.querySelectorAll('.rcrow')].map(r=>/on your list/.test(r.textContent)) }; });
    ok('the review opens', !!rv, '');
    ok('…with the store matched to the SAVED store, not the receipt\'s capitals', rv && rv.store.length===1 && rv.store[0]==='Coles Dandenong', JSON.stringify(rv && rv.store));
    ok('…the receipt\'s date', rv && rv.date==='2026-10-02', rv && rv.date);
    ok('…every line with its price', rv && JSON.stringify(rv.names)==='["free range eggs","full cream milk","tim tam"]' && JSON.stringify(rv.prices)==='["$5.50","$3.10","$3.50"]', JSON.stringify(rv));
    ok('…and which lines are on the list (eggs, milk — not the biscuits)', rv && JSON.stringify(rv.onList)==='[true,true,false]', JSON.stringify(rv && rv.onList));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-review.png') });

    /* ── B. correcting, leaving out, saving ───────────────────────────── */
    await page.fill('[data-rcname="1"]', 'milk');
    await tap('[data-rckeep="2"]');
    ok('a line can be left out', await page.getAttribute('[data-rckeep="2"]','aria-checked')==='false', '');
    await tap('#rcSaveBtn');
    const c = await cache();
    const P = c.prices||{};
    ok('Save records each kept line under its (corrected) name', JSON.stringify(Object.keys(P).sort())==='["free range egg","milk"]', JSON.stringify(Object.keys(P)));
    ok('…with price, store and date', P['milk'] && P['milk'][0].p===3.1 && P['milk'][0].sn==='Coles Dandenong' && P['milk'][0].d==='2026-10-02' && !!P['milk'][0].s, JSON.stringify(P['milk']));
    ok('…and the line left out is not saved at all', !Object.keys(P).some(k=>/tim/.test(k)), JSON.stringify(Object.keys(P)));
    const ticked = (c.items||[]).filter(i=>i.checked).map(i=>i.name).sort();
    ok('it ticks off exactly the list items the receipt names (Eggs, Milk — not Bread)', JSON.stringify(ticked)==='["Eggs","Milk"]', JSON.stringify(ticked));
    ok('the sheet closes', !(await has('#rcSheet')), '');

    /* ── C. price memory where an item is opened ──────────────────────── */
    await page.evaluate(()=>{ localStorage.setItem('ml_cache_v101', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('ml_cache_v101')), {
      items:[{id:"9",name:"Milk",cat:"fresh",qty:1,weight:"",checked:false,tags:[]}] }))); });
    await load(); await tap('#cartNavP, #cartNav');
    const pill = page.locator('.pill', { hasText:'Milk' }).first(); const bb = await pill.boundingBox();
    await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(600);
    const mem = await page.evaluate(()=>{ const m=document.querySelector('#sheet .pricemem'); return m ? m.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('the item\'s sheet says what was last paid, and where', /^Last paid \$3\.10 at Coles Dandenong · /.test(mem||''), mem);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-item.png') });
    await page.evaluate(()=>{ const b=document.querySelector('#sheetBg'); if(b) b.click(); }); await page.waitForTimeout(300);
    ok('the prices survive a reload', Object.keys((await cache()).prices||{}).length===2, '');
    ok('the sync\'s state rebuild carries prices (the fixed-shape trap)', /prices:\s*d\.prices\s*\|\|\s*\{\}/.test(src), '');

    /* ── D. the cap, and a server that says no ────────────────────────── */
    await tap('#setNav, #setNavP, #setNavS');
    await page.evaluate(()=>{ const d=new Date(); const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); localStorage.setItem('ml_rcptday', k+'|10'); });
    const before = sent.length;
    await readReceipt('#optRcpt');
    const capMsg = await page.evaluate(()=>{ const s=document.querySelector('#rcSheet'); return s ? s.textContent.replace(/\s+/g,' ') : ''; });
    ok('the 11th receipt of the day is stopped before any request', sent.length===before && /10 receipts today/.test(capMsg), capMsg.slice(0,120));
    await tap('#rcOk');
    await page.evaluate(()=>localStorage.removeItem('ml_rcptday'));
    replyStatus=500; replyBody={ error:'Server not configured', code:'not_configured' };
    await readReceipt('#optRcpt');
    const errMsg = await page.evaluate(()=>{ const s=document.querySelector('#rcSheet'); return s ? s.textContent.replace(/\s+/g,' ') : ''; });
    ok('a server that is not set up says so plainly', /isn't set up/.test(errMsg), errMsg.slice(0,120));
    await tap('#rcOk');
    ok('ml_rcptday is in BOTH exclusion lists', rx('APP_EXCLUDE_BOOT').test('ml_rcptday') && rx('APP_EXCLUDE').test('ml_rcptday'), '');
    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
