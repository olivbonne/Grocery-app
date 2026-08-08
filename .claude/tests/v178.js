/* v1.78 — the top bar, the bottom bar and the search bar become "overlay tiles" with a position, a
   size, a roundness, and (for the search bar, new here) a colour and a transparency.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "the steppers exist":
   - every number defaults to LEAVE IT ALONE. This version touches the three pieces of chrome that are
     on screen at all times, so the only unacceptable outcome is a build where someone who never opens
     the new rows sees anything move. Every geometry check is measured against a baseline captured from
     the same build with nothing set;
   - a tile wider than the screen is deliberate — but it must not turn the page into something you can
     scroll sideways, which is the obvious way for that feature to go wrong;
   - moving the top bar DOWN takes the list with it, rather than sliding the list underneath it;
   - the search bar's transparency lands in the colour, not as an opacity that would fade its own text.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: after a page change, wait for the transition — a second tap during one is swallowed.
   - v1.76: find a row by the control it carries, not by a label that may not be unique.
   - v1.77: the Lists page's nav has its own ids; and Playwright scrolls a control into view before
     clicking it, so take any scroll baseline AFTER bringing the target into view. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const SEED = (extra)=>`(() => {
  const items=[];
  for(let n=0;n<10;n++) items.push({id:"i"+n,name:"item"+n,qty:1,cat:n%2?"meat":"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
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
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(900); };
  const settings = ()=>tap('#setNav, #setNavL');
  const shop = ()=>tap('#cartNav, #cartNavL');
  /* every stepper is driven by its real button, N times */
  const bump = async(key, n)=>{ const d=n<0?-1:1;
    for(let i=0;i<Math.abs(n);i++){
      await page.locator(`[data-opt-num="${key}"][data-opt-delta="${d}"]`).first().click();
      await page.waitForTimeout(220);
    } };
  const geo = ()=>page.evaluate(()=>{
    const r=e=>{ if(!e) return null; const b=e.getBoundingClientRect();
      const s=getComputedStyle(e);
      return { x:Math.round(b.left), y:Math.round(b.top), w:Math.round(b.width), h:Math.round(b.height),
               bot:Math.round(b.bottom), rad:s.borderTopLeftRadius }; };
    const zw=(document.getElementById('zoomer')||{}).parentElement;
    return { top:r(document.querySelector('.topfix')), nav:r(document.querySelector('.bottomnav')),
             srch:r(document.querySelector('.addpill-wrap')), pill:r(document.querySelector('.addpill')),
             marginTop: zw?Math.round(parseFloat(getComputedStyle(zw).marginTop)):null,
             sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });

  // ═══════════════════════════════════════════════════════════════════
  // THE BASELINE — an untouched install must not move
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  const base = await geo();
  /* TEST BUG (fixed): "no token at all" was the wrong bar. The offsets are written as 0px, which is a
     no-op translate — what must NOT be written is the four that would take over a value the stylesheet
     owns (the widths and the two roundnesses), because those have no neutral number. So: the `off`
     ones absent, and every offset that IS written sitting at zero. */
  const vars = await page.evaluate(()=>{ const s=getComputedStyle(document.body);
    const g=k=>s.getPropertyValue(k).trim();
    return { off:['--topw','--topr','--navw','--navr','--srchw','--srchr','--srchbar-bg','--srchbar-text'].map(g),
             zero:['--topx','--topy','--navx','--navy','--srchx','--srchy','--srchh'].map(g) }; });
  ok('an untouched install takes over nothing the stylesheet owns',
     vars.off.every(v=>v===''), JSON.stringify(vars.off));
  ok('…and every offset it does write is zero', vars.zero.every(v=>v===''||parseFloat(v)===0), JSON.stringify(vars.zero));
  ok('…and all three tiles are really on screen (the checks below would be hollow otherwise)',
     base.top && base.nav && base.srch && base.top.h>40 && base.nav.h>40 && base.srch.h>20,
     JSON.stringify({top:base.top.h, nav:base.nav.h, srch:base.srch.h}));
  ok('…and the page does not scroll sideways to begin with', base.sideways<=0, String(base.sideways));

  // ═══════════════════════════════════════════════════════════════════
  // POSITION
  // ═══════════════════════════════════════════════════════════════════
  await settings();
  await bump('topx', 5);          // 5 × 2px
  await shop();
  const movedX = await geo();
  ok('Across moves the top bar sideways', movedX.top.x === base.top.x + 10,
     JSON.stringify({was:base.top.x, now:movedX.top.x}));
  ok('…and leaves the other two where they were',
     movedX.nav.x===base.nav.x && movedX.srch.x===base.srch.x,
     JSON.stringify({nav:[base.nav.x,movedX.nav.x], srch:[base.srch.x,movedX.srch.x]}));

  await mk();
  await settings();
  await bump('topy', 10);         // +20px
  await shop();
  const movedY = await geo();
  ok('Down moves the top bar down', movedY.top.y === base.top.y + 20,
     JSON.stringify({was:base.top.y, now:movedY.top.y}));
  ok('…and the list comes down with it rather than sliding underneath',
     movedY.marginTop >= base.marginTop + 19,
     JSON.stringify({was:base.marginTop, now:movedY.marginTop}));

  /* TEST BUG (fixed): moving BOTH in one run measured them as one. The search bar is positioned above
     the nav by syncZoomHeight, so raising the nav raises the search bar with it — which is correct and
     worth its own check — and the two offsets then add up. Drive them separately. */
  await mk();
  await settings();
  await bump('navy', -10);        // -20px → the nav rises
  await shop();
  const movedNavOnly = await geo();
  ok('the bottom bar moves on its own axis', movedNavOnly.nav.y === base.nav.y - 20,
     JSON.stringify({was:base.nav.y, now:movedNavOnly.nav.y}));
  ok('…and the search bar rides above it, as it always has',
     movedNavOnly.srch.y === base.srch.y - 20,
     JSON.stringify({was:base.srch.y, now:movedNavOnly.srch.y}));

  await mk();
  await settings();
  await bump('srchy', -5);        // -10px, with the nav left alone
  await shop();
  const movedSrch = await geo();
  ok('the search bar has an offset of its own on top of that',
     movedSrch.srch.y === base.srch.y - 10 && movedSrch.nav.y === base.nav.y,
     JSON.stringify({srch:[base.srch.y,movedSrch.srch.y], nav:[base.nav.y,movedSrch.nav.y]}));

  // ═══════════════════════════════════════════════════════════════════
  // SIZE — including wider than the screen
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await settings();
  await bump('navw', 50);         // 0 → 500px, wider than the 390 viewport
  await shop();
  const wide = await geo();
  ok('a tile can be made wider than the screen', wide.nav.w >= 480 && wide.nav.w > 390,
     JSON.stringify({was:base.nav.w, now:wide.nav.w}));
  ok('…it stays centred, running past both edges', Math.abs((wide.nav.x + wide.nav.w/2) - 195) <= 2,
     JSON.stringify({x:wide.nav.x, w:wide.nav.w}));
  ok('…and the page still does not scroll sideways', wide.sideways<=0, String(wide.sideways));

  await mk();
  await settings();
  await bump('srchh', 5);         // +10px of padding each end
  await shop();
  const tallSrch = await geo();
  ok('the search bar can be made taller', tallSrch.pill.h >= base.pill.h + 18,
     JSON.stringify({was:base.pill.h, now:tallSrch.pill.h}));

  await mk();
  await settings();
  await bump('barT', 4);          // the top bar's Height, from v1.76
  await shop();
  const tallTop = await geo();
  ok('the top bar height still works from its own tile group', tallTop.top.h >= base.top.h + 14,
     JSON.stringify({was:base.top.h, now:tallTop.top.h}));

  // ═══════════════════════════════════════════════════════════════════
  // ROUNDNESS — and the "0 means leave it alone" rule
  // ═══════════════════════════════════════════════════════════════════
  ok('with Roundness at zero the bottom bar keeps the shape the stylesheet gives it',
     parseFloat(base.nav.rad) > 100, base.nav.rad);
  await mk();
  await settings();
  await bump('navr', 6);          // 12px
  await shop();
  const rounded = await geo();
  ok('…and setting it takes over', Math.round(parseFloat(rounded.nav.rad))===12,
     JSON.stringify({was:base.nav.rad, now:rounded.nav.rad}));
  await settings();
  await bump('topr', 8);          // 16px on a bar that has none by default
  await shop();
  const roundTop = await geo();
  ok('the top bar can be rounded too, which is what makes it a tile',
     Math.round(parseFloat(roundTop.top.rad))===16,
     JSON.stringify({was:base.top.rad, now:roundTop.top.rad}));

  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
  const kept = await geo();
  ok('the geometry survives a relaunch',
     Math.round(parseFloat(kept.nav.rad))===12 && Math.round(parseFloat(kept.top.rad))===16,
     JSON.stringify({nav:kept.nav.rad, top:kept.top.rad}));

  // ═══════════════════════════════════════════════════════════════════
  // THE SEARCH BAR'S COLOUR AND TRANSPARENCY
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  const pillBase = await page.evaluate(()=>getComputedStyle(document.querySelector('.addpill')).backgroundColor);
  await settings();
  await page.locator('[data-opt-srchbar="blue"]').click(); await page.waitForTimeout(600);
  await shop();
  const painted = await page.evaluate(()=>{ const p=document.querySelector('.addpill'); const s=getComputedStyle(p);
    return { bg:s.backgroundColor, col:s.color, op:s.opacity }; });
  ok('a chosen search-bar colour paints it', painted.bg==='rgb(30, 111, 217)',
     JSON.stringify({was:pillBase, now:painted.bg}));
  ok('…with text that reads on it', painted.col==='rgb(255, 255, 255)', painted.col);

  await settings();
  await page.locator('[data-opt-bara="srch|-1"]').click(); await page.waitForTimeout(400);
  await shop();
  const faded = await page.evaluate(()=>{ const s=getComputedStyle(document.querySelector('.addpill'));
    return { bg:s.backgroundColor, op:s.opacity }; });
  ok('the transparency lands in the colour', /rgba\(30, 111, 217, 0\.95\)/.test(faded.bg), JSON.stringify(faded));
  ok('…and not as an opacity that would fade its own text', faded.op==='1', faded.op);

  // ═══════════════════════════════════════════════════════════════════
  // THE SETTINGS SECTION
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await settings();
  const sec = await page.evaluate(()=>{
    const names=[...document.querySelectorAll('.optsect')].map(s=>s.dataset.sect);
    const h=[...document.querySelectorAll('.optsect')].find(s=>s.dataset.sect==='Bars and overlays');
    const body=h&&h.nextElementSibling;
    const subs=body?[...body.querySelectorAll('.optsub')].map(s=>s.textContent.trim()):[];
    const nums=body?[...body.querySelectorAll('[data-opt-num]')].map(b=>b.dataset.optNum):[];
    const cols=body?[...body.querySelectorAll('[data-opt-topbar],[data-opt-navbar],[data-opt-srchbar]')]
      .map(b=>[...b.attributes].map(a=>a.name).find(n=>/^data-opt-/.test(n))):[];
    return { names, subs, nums:[...new Set(nums)], cols:[...new Set(cols)],
             alpha:body?body.querySelectorAll('[data-opt-bara]').length:0 };
  });
  ok('the section is named for what it now holds',
     sec.names.includes('Bars and overlays') && !sec.names.includes('Top and bottom bars'),
     JSON.stringify(sec.names));
  /* SUPERSEDED by v1.80: the section gained a "My tiles" block for tiles of your own. The claim that
     survives is about the three BUILT-IN tiles — one subhead each, in that order, before anything the
     user has added. */
  ok('…with one subhead per built-in tile, in order',
     sec.subs.slice(0,3).join(',')==='Top bar,Bottom bar,Search bar', JSON.stringify(sec.subs));
  ok('…a colour row for each', sec.cols.length===3, JSON.stringify(sec.cols));
  ok('…a transparency for each', sec.alpha===6, String(sec.alpha));
  ok('…and every geometry number present exactly once',
     ['topx','topy','topw','barT','topr','navx','navy','navw','barB','navr','srchx','srchy','srchw','srchh','srchr']
       .every(k=>sec.nums.includes(k)) && sec.nums.length===15, JSON.stringify(sec.nums));

  // ═══════════════════════════════════════════════════════════════════
  // NOT CHANGED
  // ═══════════════════════════════════════════════════════════════════
  ok('the sections still fold (v1.77)', await (async()=>{
    await page.locator('.optsect[data-sect="Tiles"]').click(); await page.waitForTimeout(400);
    return page.evaluate(()=>{ const h=[...document.querySelectorAll('.optsect')].find(s=>s.dataset.sect==='Tiles');
      return getComputedStyle(h.nextElementSibling).display==='none'; }); })(), '');
  await mk();
  ok('the shop list still renders', (await page.locator('.pill').count())>0, '');
  await page.locator('#shopAddFab').click(); await page.waitForTimeout(2200);
  ok('the add sheet still opens over the chrome', (await page.locator('#addSheet').count())>0, '');
  await page.locator('#addDone').click(); await page.waitForTimeout(1500);
  ok('…and closes', (await page.locator('#addSheet').count())===0, '');
  await page.screenshot({ path: __dirname+'/v178-shop.png' });
  await settings();
  await page.evaluate(()=>{ const h=[...document.querySelectorAll('.optsect')].find(s=>s.dataset.sect==='Bars and overlays');
    if(h) h.scrollIntoView(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname+'/v178-settings.png' });

  ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,4).join(' | '));
  await page.screenshot({ path: out || (__dirname+'/v178.png') });
  await browser.close();
  let pass=0, fail=0;
  results.forEach(([n,c,x])=>{ if(c){pass++; console.log('PASS  '+n+(x?'   ['+x+']':''));} else {fail++; console.log('FAIL  '+n+(x?'   ['+x+']':''));} });
  console.log(`\n${pass}/${pass+fail} passed`);
})().catch(e=>{ console.log('HARNESS CRASH', e.message); process.exit(1); });
