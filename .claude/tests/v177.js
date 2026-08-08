/* v1.77 — the flag group stays on one line inside a large tile; one top-bar height on every page with
   the title centred in it; the Settings sections fold.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "it looks right":
   - the flags are on ONE line specifically in the layout that broke them (the column tile), and the
     row layouts are unchanged — a fix that only worked in one mode would be worse than none;
   - the two bars are the same height AND the title is at the same offset within each, measured, not
     eyeballed — "same height" alone would pass with the text still sitting high in both;
   - a folded section actually hides its rows and nothing else's, survives a relaunch, and — the part
     that is easy to get wrong — does NOT rebuild the page, because a rebuild would throw away the
     scroll position v1.75 went to the trouble of remembering.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: after a page change, wait for the transition to finish before tapping again.
   - v1.76: find a row by the control it carries, not by a label that may not be unique. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
/* "apple" carries BOTH flags — the item the request is about. "steak" carries one, "pear" none, so a
   fix that simply hid the extra flags could not pass. */
const SEED = (extra)=>`(() => {
  const items=[
    {id:"i0",name:"apple",qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:["urgent","discount"],starred:true},
    {id:"i1",name:"pear",qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false},
    {id:"i2",name:"steak",qty:2,cat:"meat",weight:"500g",sub:"",checked:false,tags:["discount"],starred:false},
    {id:"i3",name:"bacon",qty:1,cat:"meat",weight:"",sub:"",checked:false,tags:["urgent","discount","convenient"],starred:true}];
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items,
    buyAgain:[{name:"kiwi",cat:"fruit",qty:1,weight:"",sub:"",ts:9}],
    baTomb:{}, stores:[], storeMeta:{}, members:["O"],
    categories:[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]},
                {id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}],
    name:"Grocery", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0 }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:["fruit"]}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Grocery"}]));
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
  ${extra||""}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(extra)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED(extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  /* TEST BUG (fixed): the Lists page's nav carries its own ids (#setNavL / #cartNavL), so a bare
     '#setNav' hung the moment a check navigated away from Lists. Take whichever exists. */
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(900); };
  const settings = ()=>tap('#setNav, #setNavL');
  const shop = ()=>tap('#cartNav, #cartNavL');
  const lists = ()=>tap('#listsBtn');
  /* drive the real Tile display control rather than seeding ml_displays (v1.60). */
  const setLarge = async(cols)=>{ await settings();
    await page.locator('[data-tiledisp="large"]').click(); await page.waitForTimeout(500);
    await settings();
    await page.locator(`[data-opt-cols="${cols}"]`).click(); await page.waitForTimeout(500);
    await shop(); };
  /* the flags of the tile whose item carries two of them, and the rows they occupy */
  const flagRows = ()=>page.evaluate(()=>{
    const pill=[...document.querySelectorAll('.pill')].find(p=>/apple/i.test(p.textContent));
    if(!pill) return null;
    const marks=[...pill.querySelectorAll('.pmark')];
    const tops=[...new Set(marks.map(m=>Math.round(m.getBoundingClientRect().top)))];
    const grp=pill.querySelector('.pmarks');
    return { n:marks.length, rows:tops.length, tops,
             grouped:!!grp, dir:getComputedStyle(pill).flexDirection,
             pillH:Math.round(pill.getBoundingClientRect().height) };
  });

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 1 — two flags, one line, on a large tile
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await setLarge(2);
  const big = await flagRows();
  ok('the large-tile layout really is a column (the check would be hollow otherwise)',
     big && big.dir==='column', JSON.stringify(big));
  ok('an item that is urgent AND discounted shows both flags', big && big.n===2, JSON.stringify(big));
  ok('…on ONE line', big && big.rows===1, JSON.stringify(big));

  /* three flags is the worst case and the one that cost two rows of the tile */
  const three = await page.evaluate(()=>{
    const pill=[...document.querySelectorAll('.pill')].find(p=>/bacon/i.test(p.textContent));
    if(!pill) return null;
    const tops=[...new Set([...pill.querySelectorAll('.pmark')].map(m=>Math.round(m.getBoundingClientRect().top)))];
    return { n:pill.querySelectorAll('.pmark').length, rows:tops.length }; });
  ok('…and three flags are still one line', three && three.n===3 && three.rows===1, JSON.stringify(three));

  /* variable-width large tiles are a separate column layout and had the same problem */
  await setLarge(0);
  const vari = await flagRows();
  ok('variable-width large tiles keep them on one line too',
     vari && vari.dir==='column' && vari.rows===1, JSON.stringify(vari));

  /* the row layouts must be untouched */
  await setLarge(1);
  const row = await flagRows();
  ok('NOT CHANGED: a list row still lays its flags out in a row', row && row.rows===1, JSON.stringify(row));
  ok('…and an item with no flags has no group box at all',
     await page.evaluate(()=>{ const p=[...document.querySelectorAll('.pill')].find(x=>/pear/i.test(x.textContent));
       return !!p && !p.querySelector('.pmarks'); }), '');

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 2 — one bar height, title centred
  // ═══════════════════════════════════════════════════════════════════
  const bar = ()=>page.evaluate(()=>{
    const tf=document.querySelector('.topfix'), t=tf&&tf.querySelector('.title');
    if(!tf||!t) return null;
    const f=tf.getBoundingClientRect(), r=t.getBoundingClientRect();
    return { h:Math.round(f.height), titleTop:Math.round(r.top-f.top),
             gapTop:Math.round(r.top-f.top), gapBot:Math.round(f.bottom-r.bottom) };
  });
  await mk();
  const shopBar = await bar();
  await lists();
  const listBar = await bar();
  ok('the Lists bar is the same height as every other page', shopBar && listBar && shopBar.h===listBar.h,
     JSON.stringify({shop:shopBar, lists:listBar}));
  ok('…and its title sits in the same place', shopBar.titleTop===listBar.titleTop,
     JSON.stringify({shop:shopBar.titleTop, lists:listBar.titleTop}));
  ok('the title is centred in the bar rather than sitting high in it',
     Math.abs(shopBar.gapTop - shopBar.gapBot) <= 2,
     JSON.stringify({above:shopBar.gapTop, below:shopBar.gapBot}));
  await settings();
  const setBar = await bar();
  ok('…on Settings too', setBar.h===shopBar.h && Math.abs(setBar.gapTop-setBar.gapBot)<=2, JSON.stringify(setBar));

  /* the page must still start below the bar, whatever the bar now measures */
  await shop();
  const clears = await page.evaluate(()=>{ const tf=document.querySelector('.topfix'), z=document.getElementById('zoomer');
    const zw=z?z.parentElement:null; if(!tf||!zw) return null;
    return Math.round(parseFloat(getComputedStyle(zw).marginTop)) >= Math.round(tf.getBoundingClientRect().height)-1; });
  ok('the list still starts below the bar rather than under it', clears===true, String(clears));

  /* the 8px under the header is still there when something follows it */
  const withChip = await page.evaluate(()=>{
    const tf=document.querySelector('.topfix'), h=tf&&tf.querySelector('header');
    return h ? { last:h===tf.lastElementChild, mb:getComputedStyle(h).marginBottom } : null; });
  ok('the gap under the header is dropped only when the header is the last thing in the bar',
     withChip && (withChip.last ? withChip.mb==='0px' : withChip.mb!=='0px'), JSON.stringify(withChip));

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 3 — the Settings sections fold
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await settings();
  const secs = await page.evaluate(()=>[...document.querySelectorAll('.optsect')].map(s=>s.dataset.sect));
  ok('every section header is a control', secs.length>=8, JSON.stringify(secs));
  ok('…and each one owns a body of rows',
     await page.evaluate(()=>[...document.querySelectorAll('.optsect')]
       .every(s=>s.nextElementSibling && s.nextElementSibling.classList.contains('optgrpbody'))), '');
  ok('everything starts open — the fold does not decide for you what you never use',
     await page.evaluate(()=>[...document.querySelectorAll('.optgrpbody')].every(b=>!b.classList.contains('coll'))), '');

  const rowsIn = n => page.evaluate(name=>{ const h=[...document.querySelectorAll('.optsect')].find(s=>s.dataset.sect===name);
    const b=h&&h.nextElementSibling; if(!b) return null;
    return { vis:getComputedStyle(b).display!=='none', rows:b.querySelectorAll('.optrow').length }; }, n);

  const tilesBefore = await rowsIn('Tiles');
  const colourBefore = await rowsIn('Colour');
  await page.locator('.optsect[data-sect="Tiles"]').click(); await page.waitForTimeout(400);
  const tilesAfter = await rowsIn('Tiles');
  const colourAfter = await rowsIn('Colour');
  ok('folding a section hides its rows',
     tilesBefore.vis===true && tilesAfter.vis===false && tilesAfter.rows===tilesBefore.rows,
     JSON.stringify({before:tilesBefore, after:tilesAfter}));
  ok('…and only its own', colourAfter.vis===true && colourAfter.rows===colourBefore.rows,
     JSON.stringify({before:colourBefore, after:colourAfter}));
  ok('…the caret says which way it is', await page.evaluate(()=>{
     const h=document.querySelector('.optsect[data-sect="Tiles"]');
     return h.classList.contains('coll') && h.getAttribute('aria-expanded')==='false'; }), '');

  /* the part that is easy to get wrong: folding must not rebuild the page */
  /* TEST BUG (fixed): reading the offset before the click measured PLAYWRIGHT's scroll, not the app's
     — it scrolls a control into view before clicking it, so a header far down the page moved the
     window itself and the check blamed the app. Bring it into view first, THEN take the baseline. */
  const soundHdr = page.locator('.optsect[data-sect="Sound"]');
  await soundHdr.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const yBefore = await page.evaluate(()=>window.scrollY);
  ok('settings is long enough to scroll (the check would be hollow otherwise)', yBefore>200, String(yBefore));
  await page.evaluate(()=>{ const h=document.querySelector('.optsect[data-sect="Sound"]'); h.dataset.probe="1"; });
  await soundHdr.click(); await page.waitForTimeout(400);
  const survived = await page.evaluate(()=>({
    y:window.scrollY, sameNode:(document.querySelector('.optsect[data-sect="Sound"]')||{}).dataset?.probe==='1' }));
  ok('folding does not rebuild the page — the marked header is the same element afterwards',
     survived.sameNode===true, JSON.stringify(survived));
  ok('…so the scroll position is not thrown away', Math.abs(survived.y-yBefore)<=40,
     JSON.stringify({was:yBefore, now:survived.y}));

  await page.locator('.optsect[data-sect="Tiles"]').click(); await page.waitForTimeout(400);
  ok('unfolding brings the rows back', (await rowsIn('Tiles')).vis===true, '');

  await page.locator('.optsect[data-sect="Colour"]').click(); await page.waitForTimeout(400);
  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
  await settings();
  const afterReload = await rowsIn('Colour');
  ok('a folded section is still folded after a relaunch', afterReload.vis===false, JSON.stringify(afterReload));
  ok('…and the ones you left open are still open', (await rowsIn('Tiles')).vis===true, '');

  /* the rows inside a folded-then-opened section must still work */
  await page.locator('.optsect[data-sect="Colour"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-opt-accent="blue"]').click(); await page.waitForTimeout(600);
  ok('a control still works after its section has been folded and opened',
     await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--accent').trim().toLowerCase()==='#1e6fd9'),
     await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--accent')));

  // ═══════════════════════════════════════════════════════════════════
  // NOT CHANGED
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  ok('the shop list still renders', (await page.locator('.pill').count())>0, '');
  await page.locator('#shopAddFab').click(); await page.waitForTimeout(2200);
  ok('the add sheet still opens', (await page.locator('#addSheet').count())>0, '');
  await page.locator('#addDone').click(); await page.waitForTimeout(1500);
  ok('…and closes', (await page.locator('#addSheet').count())===0, '');
  await page.screenshot({ path: __dirname+'/v177-shop.png' });
  await settings();
  await page.screenshot({ path: __dirname+'/v177-settings.png' });

  ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,4).join(' | '));
  await page.screenshot({ path: out || (__dirname+'/v177.png') });
  await browser.close();
  let pass=0, fail=0;
  results.forEach(([n,c,x])=>{ if(c){pass++; console.log('PASS  '+n+(x?'   ['+x+']':''));} else {fail++; console.log('FAIL  '+n+(x?'   ['+x+']':''));} });
  console.log(`\n${pass}/${pass+fail} passed`);
})().catch(e=>{ console.log('HARNESS CRASH', e.message); process.exit(1); });
