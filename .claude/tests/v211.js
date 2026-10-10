/* v2.11 — short day names, the cart count where the household drew it, per-row tile heights, cart tiles
   the width of list tiles, and receipt reading that always shows what it is doing.

   WHY THIS EXISTS: the household's batch of 2026-10-10 (screenshots of Plan and Shop):
   1. "on plan page make the days only 3 letters";
   2. "the number in the cart is still not in the middle, see examples" — the HTML label positioned by
      percentages landed elsewhere on the phone than in their drawing;
   3. "when adding wombok cabbage the height increase for all tile, I only want height to increase for that line";
   4. "the items in the cart are not the same width than on the main page";
   5. "when receipt is being read there is no indication that something is happening or failed".

   WHAT THESE CHECKS HAVE TO PROVE:
   - the plan's day names are three letters;
   - the count is SVG text at the drawing's own coordinates (x 57.24, baseline 42, 35 units), and over 99
     reads "99+" with the + at (77, 29) in 20 units — the household's third example;
   - one tall tile grows only its own row; every other row keeps the usual height;
   - a cart tile is exactly as wide as a list tile, in the same layout;
   - choosing a photo opens the receipt sheet at once, with a spinner and the step it is on; a picker
     attached to the page (iOS); and a request that fails ends in a message, never a silent nothing.

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

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(items, extra, routeFn)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    if(routeFn) await ctx.route('**/api/receipt', routeFn);
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(items, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };

  try{
    /* ── 1. three-letter day names ─────────────────────────────────────── */
    await mk([it("1","Eggs","fresh")]);
    await tap('#planNav, #planNavP');
    const days = await page.evaluate(()=>[...document.querySelectorAll('.pdname')].map(x=>x.textContent.trim()));
    ok('the plan\'s day names are three letters', days.length===7 && days.every(d=>/^[A-Za-z]{3}$/.test(d)), JSON.stringify(days));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-plan.png') });

    /* ── 2. the cart count, as drawn ───────────────────────────────────── */
    await mk(Array.from({length:8},(_,i)=>it(String(i),"Item "+i,"fresh",1,"",true)).concat([it("x","Eggs","fresh")]));
    const c8 = await page.evaluate(()=>{ const t=document.querySelector('#cartNum'); return t ? { tag:t.tagName.toLowerCase(), x:t.getAttribute('x'), y:t.getAttribute('y'), anchor:t.getAttribute('text-anchor'),
      size:getComputedStyle(t).fontSize, inSvg:!!t.closest('svg'), txt:t.textContent } : null; });
    ok('the count is SVG text at the drawing\'s coordinates (x 57.24, baseline 42, 35 units)',
       c8 && c8.tag==='text' && c8.inSvg && c8.x==='57.24' && c8.y==='42' && c8.anchor==='middle' && c8.size==='35px' && c8.txt==='8', JSON.stringify(c8));
    await mk(Array.from({length:120},(_,i)=>it(String(i),"Item "+i,"fresh",1,"",true)));
    const c120 = await page.evaluate(()=>{ const t=document.querySelector('#cartNum'), p=t && t.querySelector('.cartplus');
      return t ? { txt:t.textContent, px:p&&p.getAttribute('x'), py:p&&p.getAttribute('y'), ps:p&&getComputedStyle(p).fontSize } : null; });
    /* SUPERSEDED by v2.12: the + at (77,29) landed on the second 9 in the app's font; the household chose
       option A — "99" still 35 units and centred, a raised 26-unit + after it (v212.js measures the glyphs).
       Still protects that past 99 the count reads "99+" with the + as its own, separately sized tspan. */
    ok('over 99 it reads "99+", the + its own smaller, raised piece', c120 && c120.txt==='99+' && c120.px===null && c120.ps==='26px', JSON.stringify(c120));

    /* ── 3. a tall tile grows only its row ─────────────────────────────── */
    const list = [["Chicken","meat",8,"500g"],["Shrimp","meat"],["Scallop","meat"],["Dragonfruit","fruit"],["Lemon","fruit",1,"1/2"],["Chilli","vegetable",2,"large"],
      ["Cucumber","vegetable",2],["Garlic","vegetable",9,"cloves"],["Ginger","vegetable"],["Green bean","vegetable"],["Mint","vegetable"],["Mushroom","vegetable",2,"225 g"],
      ["Shallot","vegetable"],["Tomato","vegetable"],["Wombok cabbage","vegetable",6,"heaped cups"],["Baguette","fresh"]].map((x,i)=>it(String(i),x[0],x[1],x[2],x[3]));
    await mk(list, GRID4);
    const rows = await page.evaluate(()=>{ const m={}; [...document.querySelectorAll('#zoomer .pill[data-pill]')].forEach(p=>{ const r=p.getBoundingClientRect(); const k=Math.round(r.top);
      (m[k]=m[k]||[]).push({ n:p.querySelector('.pname').textContent.trim(), h:Math.round(r.height) }); }); return Object.values(m); });
    const womRow = rows.find(r=>r.some(x=>/Wombok/.test(x.n)));
    const others = rows.filter(r=>r!==womRow);
    const oh = [...new Set(others.flat().map(x=>x.h))];
    ok('the row with Wombok cabbage is taller, and every tile in it matches', womRow && new Set(womRow.map(x=>x.h)).size===1 && womRow[0].h > Math.max(...oh), JSON.stringify({wom:womRow, others:oh}));
    ok('…while every other row keeps one, usual height', oh.length===1, JSON.stringify(oh));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-rows.png') });

    /* ── 4. cart tiles as wide as list tiles ───────────────────────────── */
    await mk(list.map((x,i)=>i<6?Object.assign({},x,{checked:true}):x), GRID4);
    await tap('#checkedHead');
    const wd = await page.evaluate(()=>({ cart:[...new Set([...document.querySelectorAll('#checkedbar .pill')].map(p=>Math.round(p.getBoundingClientRect().width)))],
      list:[...new Set([...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>Math.round(p.getBoundingClientRect().width)))],
      cartLeft:Math.round(document.querySelector('#checkedbar .pill').getBoundingClientRect().left), listLeft:Math.round(document.querySelector('#zoomer .pill[data-pill]').getBoundingClientRect().left) }));
    ok('a cart tile is exactly as wide as a list tile, and lines up with it', wd.cart.length===1 && wd.list.length===1 && wd.cart[0]===wd.list[0] && wd.cartLeft===wd.listLeft, JSON.stringify(wd));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-cart.png') });

    /* ── 5. receipt reading always shows what it is doing ──────────────── */
    let release; const held = new Promise(r=>{ release=r; });
    await mk([it("1","Eggs","fresh")], '', async r=>{ await held; r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ store:'', date:'', total:0, items:[{raw:'EGGS',name:'eggs',qty:1,weight:'',price:5,category:'fresh'}] }) }); });
    await tap('#setNav, #setNavP, #setNavS');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
    const attached = await page.evaluate(()=>!!document.querySelector('body > input[type=file]'));
    ok('the photo picker is attached to the page while it is open (iOS skips "change" on a detached one)', attached, '');
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(500);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#rcSheet'); return s ? { spin:!!s.querySelector('.spin'), status:!!s.querySelector('[role=status]'), txt:s.textContent.replace(/\s+/g,' ').trim() } : null; });
    ok('the moment a photo is chosen, the sheet shows a spinner and the step it is on', busy && busy.spin && busy.status && /Reading the receipt…|Preparing the photo…/.test(busy.txt), JSON.stringify(busy));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-busy.png') });
    release(); await page.waitForTimeout(800);
    ok('…and then the review', await page.evaluate(()=>!!document.querySelector('[data-rcname]')), '');
    await mk([it("1","Eggs","fresh")], '', r=>r.abort('failed'));
    await tap('#setNav, #setNavP, #setNavS');
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
    await fc2.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1200);
    const fail = await page.evaluate(()=>{ const s=document.querySelector('#rcSheet'); return s ? s.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('a request that fails ends in a message, never a silent nothing', /Couldn't read that receipt|No connection/.test(fail||''), fail);
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
