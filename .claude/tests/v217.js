/* v2.17 — receipts pay off, from the app review of 11 October: R9 the receipt asked for at the till (after a shop
   is finished) instead of found at the bottom of Settings, and R10 a running total in the cart from the prices
   the household's receipts have taught the app.

   WHAT THESE CHECKS HAVE TO PROVE: the card appears after Save to Regulars, survives a reload, goes with "Not
   now" for good and with a saved receipt; it never appears when switched off, when today's free receipts are
   used, or three hours after the shop; the total is unit price × list quantity, prefers the store you are in,
   says how many items it priced when not all, and shows nothing when nothing is priced; and it sits on
   its own line, so "4 in cart" never wraps (it did, in the first build of this version). And an item or a Regular
   whose category is gone shows under Others (the list, and Regulars under it) without its stored category being touched.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.07 the app reopens on the
   last page; v2.10 a fresh profile runs the v1.63 slot migration and reloads — seed ml_appmig163. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (items, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(items)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  ${extra||''}
})()`;
const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[]});
const GRID4 = 'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","4"); localStorage.setItem("ml_fill","full"); localStorage.setItem("ml_caton","0");';


const SMALL0 = n => `localStorage.setItem("ml_displays", JSON.stringify({shop:"small"})); localStorage.setItem("ml_smallcols","${n}"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_store","home");`;
const LIST = [["Frozen raspberries","frozen",2],["Ginger beer no sugar","drinks"],["Beef cubes","meat",1,"800g"],["Beef topside steak","meat",3,"200g"],
  ["Lamb rump or flank","meat"],["Chicken breast","meat",3,"200g"],["Chicken drumsticks","meat",4,"1kg"],["Chicken thigh","meat",8,"500g"],["Avocados","vegetable"]];

const SMALL = n => SMALL0(n);




const L17 = [["Milk","fresh",2],["Bananas","fruit",6],["Rice","bulk",1],["Shampoo","health"],["Eggs","fresh",12]].map((x,i)=>it(String(i),x[0],x[1],x[2],x[3]));
const PRICES = { milk:[{p:4.5,q:1,s:"dand",sn:"Coles Dandenong",d:"2026-10-01",w:"",t:1}],
  banana:[{p:3,q:6,s:"dand",sn:"Coles Dandenong",d:"2026-10-01",w:"",t:1}],
  rice:[{p:10,q:1,s:"dand",sn:"Coles Dandenong",d:"2026-09-20",w:"",t:1},{p:12,q:1,s:"other1",sn:"Other shop",d:"2026-10-02",w:"",t:2}] };
const withPrices = `(()=>{ const c=JSON.parse(localStorage.getItem("ml_cache_v101")); c.prices=${JSON.stringify(PRICES)}; localStorage.setItem("ml_cache_v101", JSON.stringify(c)); })();`;
const today = ()=>{ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(items, extra, route)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    if(route) await ctx.route('**/api/receipt', route);
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(items, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const card = ()=>page.evaluate(()=>{ const c=document.querySelector('#rcNudge'); return c ? c.textContent.replace(/\s+/g,' ').trim() : null; });
  const checked = L17.map((x,i)=>Object.assign({},x,{checked:i<4}));

  try{
    /* ── R9. the receipt, at the till ──────────────────────────────────── */
    await mk(checked);
    ok('no receipt card before a shop is finished', (await card())===null, '');
    await tap('#sweepBtn');
    const c1 = await card();
    ok('finishing a shop (Save to Regulars) asks for the receipt', c1 && /Got the receipt\?/.test(c1) && /Read receipt/.test(c1) && /Not now/.test(c1), c1);
    await shot('nudge');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200);
    ok('…and still asks after the app is closed and opened again', (await card())!==null, '');
    await tap('#rcNudgeNo');
    ok('"Not now" puts it away', (await card())===null, '');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200);
    ok('…for good', (await card())===null, '');

    let release=null;
    await mk(checked, '', async r=>{ r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ store:'', date:today(), total:4.5, items:[{raw:'MILK 2L',name:'milk',qty:1,weight:'',price:4.5,category:'fresh'}] }) }); });
    await tap('#sweepBtn');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#rcNudgeGo').click()]);
    ok('"Read receipt" opens the photo picker straight away', !!fc, '');
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64') });
    await page.waitForTimeout(1500);
    await tap('#rcSaveBtn');
    ok('…and once the receipt is saved, the card is gone', (await card())===null && (await page.evaluate(()=>localStorage.getItem('ml_rcptnudge')))===null, '');

    await mk(checked, 'localStorage.setItem("ml_rcptask","0"); localStorage.setItem("ml_optcoll","[]");');
    await tap('#sweepBtn');
    ok('Settings › Prices › Ask after a shop, Off: no card', (await card())===null, '');
    await tap('#setNav');
    ok('…and the setting is there', await page.evaluate(()=>!!document.querySelector('[data-opt-rcptask="0"].on')), '');
    /* SUPERSEDED by v2.29: at the day's limit the card still shows and SAYS so (the household found it silently missing),
       and the limit is 30. Still protects: no "Read receipt" button is offered past the limit. */
    await mk(checked, `localStorage.setItem("ml_rcptday", "${today()}|30");`);
    await tap('#sweepBtn');
    const capTxt = await page.evaluate(()=>(document.querySelector('#rcNudge')||{}).textContent||'');
    ok('at today\'s receipt limit the card says so, with no Read button', /30 receipts read on this phone today/.test(capTxt) && !(await page.evaluate(()=>!!document.querySelector('#rcNudgeGo'))), capTxt.replace(/\s+/g,' ').slice(0,160));
    await mk(L17, `localStorage.setItem("ml_rcptnudge", String(Date.now()-4*3600*1000));`);
    ok('no card more than three hours after the shop', (await card())===null, '');

    /* ── R10. a running total in the cart ──────────────────────────────── */
    const headOf = ()=>page.evaluate(()=>{ const h=document.querySelector('#checkedHead'), n=h.querySelector('.chk-n'), e=h.querySelector('.cartest');
      const nr=n&&n.getBoundingClientRect(), er=e&&e.getBoundingClientRect();
      return { n:n?n.textContent.trim():'', est:e?e.textContent.trim():null,
        nLines: n ? Math.round(nr.height/parseFloat(getComputedStyle(n).lineHeight)) : 0,
        estBelow: !!(e && er.top >= nr.bottom-1), estCut: !!(e && e.scrollWidth > e.clientWidth+1),
        row: document.querySelector('.checkedfoot').getBoundingClientRect().height }; });
    await mk(checked, withPrices+'localStorage.setItem("ml_store","dand");');
    const h1 = await headOf();
    ok('the cart shows what it is likely to cost: unit price × quantity, at the store you are in, and how many items were priced',
       h1.n==='4 in cart' && h1.est==='about $22.00 for 3 of 4', JSON.stringify(h1));
    ok('"4 in cart" stays on one line, the total sits on its own line under it, uncut, and the row is no taller than the button',
       h1.nLines===1 && h1.estBelow && !h1.estCut && h1.row<=40, JSON.stringify(h1));
    await shot('carttotal');
    await mk(checked.map(x=>x.name==='Shampoo'?Object.assign({},x,{checked:false}):x), withPrices+'localStorage.setItem("ml_store","dand");');
    const h2 = await headOf();
    ok('…with every item priced, just the total', h2.n==='3 in cart' && h2.est==='about $22.00', JSON.stringify(h2));
    await mk(checked.map(x=>x.name==='Shampoo'?Object.assign({},x,{checked:false}):x), withPrices+'localStorage.setItem("ml_store","other1");');
    const h3 = await headOf();
    ok('…and at another store, that store\'s price wins (rice $12 there, $10 at Coles)', h3.n==='3 in cart' && h3.est==='about $24.00', JSON.stringify(h3));
    await mk(checked);
    const h4 = await headOf();
    ok('no prices remembered: no total, nothing invented', h4.n==='4 in cart' && h4.est===null, JSON.stringify(h4));

    /* ── an item whose category is gone still shows ───────────────────── */
    const ORPH = [it("o1","Frozen raspberries","frozen",2), it("o2","Milk","fresh",1)];
    const orphReg = `(()=>{ const c=JSON.parse(localStorage.getItem("ml_cache_v101")); c.buyAgain=[{name:"Ginger beer no sugar",cat:"drinks",qty:1,weight:"",sub:"",ts:Date.now()}]; localStorage.setItem("ml_cache_v101", JSON.stringify(c)); })();`;
    await mk(ORPH, orphReg);
    const o1 = await page.evaluate(()=>{ const t=[...document.querySelectorAll('#zoomer .pill[data-pill]')].find(p=>/Frozen raspberries/i.test(p.textContent));
      const sec=t && t.closest('section'), head=sec && sec.querySelector('[data-cat]');
      return { shown:!!t, under:head ? head.dataset.cat : null, headTxt:head ? head.textContent.replace(/\s+/g,' ').trim() : '', tiles:document.querySelectorAll('#zoomer .pill[data-pill]').length }; });
    ok('an item whose category is gone shows on the list, under Others, and its header counts it', o1.shown && o1.under==='others' && /0\/1/.test(o1.headTxt) && o1.tiles===2, JSON.stringify(o1));
    await page.locator('#zoomer [data-cat="others"]').first().dispatchEvent('pointerdown'); await page.locator('#zoomer [data-cat="others"]').first().dispatchEvent('pointerup'); await page.waitForTimeout(400);
    ok('…and that Others header still folds on a tap', await page.evaluate(()=>![...document.querySelectorAll('#zoomer .pill[data-pill]')].some(p=>/Frozen raspberries/i.test(p.textContent))), '');
    const showAll = page.locator('[data-reg-showall][aria-expanded="false"]'); if(await showAll.count()) { await showAll.first().click(); await page.waitForTimeout(400); }
    const o3 = await page.evaluate(()=>{ const b=document.querySelector('[data-regc="others"]'); return b ? b.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('a Regular whose category is gone is listed under Others in Regulars', o3 && /Others\s*1/.test(o3), o3);
    const stored = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')); return { item:(c.items.find(i=>i.id==='o1')||{}).cat, reg:(c.buyAgain[0]||{}).cat }; });
    ok('…and nothing is rewritten: the stored categories are untouched (display only)', stored.item==='frozen' && stored.reg==='drinks', JSON.stringify(stored));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
