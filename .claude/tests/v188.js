/* v1.88 — the + bar on the shop page can sit hard against either edge of the screen.
   It could always be nudged with "Across", but never actually reach an edge: the wrap holds a 14px
   inset on both sides whatever else is set, and a 2px-per-tap stepper is the wrong instrument for
   crossing a screen. Alignment is one tap; Across still fine-tunes from wherever it lands.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a control exists":
   - "edge" means the EDGE — x=0 on the left and the viewport's width on the right, with the 14px inset
     gone, because 14px short of the edge is the bug this fixes;
   - an aligned bar is a usable thing, not a stripe: with no width set it shrinks to its own +, and it
     still opens the add sheet from where it lands;
   - the controls compose — a width still applies when aligned, and Across still nudges from there;
   - Centre puts everything back exactly as it was. This is the v1.76 rule: anything touching always-on
     chrome must be proved not to move an untouched install, and it is checked by measuring the same
     build before and after rather than by remembering what it used to be;
   - the choice survives a relaunch and never reaches the shared list — it describes this phone.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.76: measure an untouched install against the same build.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent.
   - v1.87: each page's nav carries its own ids — the set is Shop / Plan / Settings. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const items=[]; for(let i=0;i<3;i++) items.push({id:"i"+i,name:"seed"+i,qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]}], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async()=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.click(); await page.waitForTimeout(750); };
  const settings = ()=>tap('#setNav, #setNavP, #setNavS');
  const shop = ()=>tap('#cartNav, #cartNavP, #cartNavS');
  const align = async(k)=>{ await settings(); await tap(`[data-opt-srchalign="${k}"]`); await shop(); };
  const bumpN = async(k,n)=>{ await settings();
    for(let i=0;i<n;i++){ await page.locator(`[data-opt-num="${k}"][data-opt-delta="1"]`).first().scrollIntoViewIfNeeded();
      await page.locator(`[data-opt-num="${k}"][data-opt-delta="1"]`).first().click(); await page.waitForTimeout(250); }
    await shop(); };
  /* Measured on the SHOP page, where the bar actually lives. The wrap is the positioned box; the pill
     is what you see and tap, and the gap between them is the inset this version had to remove. */
  const geo = ()=>page.evaluate(()=>{
    const w=document.querySelector('#shopAddFabWrap'), p=document.querySelector('#shopAddFab');
    if(!w||!p) return null;
    const wr=w.getBoundingClientRect(), pr=p.getBoundingClientRect();
    return { vw:window.innerWidth,
             wrapL:Math.round(wr.left), wrapR:Math.round(wr.right),
             pillL:Math.round(pr.left), pillR:Math.round(pr.right), pillW:Math.round(pr.width),
             pad:getComputedStyle(w).paddingLeft };
  });

  try{
    /* ── 1. the baseline, from this same build ─────────────────────────── */
    await mk();
    const base = await geo();
    ok('precondition: the bar is on the shop page and spans it', base && base.pillW>300, JSON.stringify(base));
    ok('…held off both edges by the inset it has always had',
       base.pillL===14 && base.pillR===base.vw-14, JSON.stringify({l:base.pillL, r:base.pillR, vw:base.vw}));

    await settings();
    const ctl = await page.evaluate(()=>[...document.querySelectorAll('[data-opt-srchalign]')]
      .map(b=>({ k:b.dataset.optSrchalign, label:b.textContent.trim(), on:b.classList.contains('on') })));
    ok('the search bar offers an alignment', ctl.length===3, JSON.stringify(ctl.map(c=>c.label)));
    ok('…Left, Centre and Right', ctl.map(c=>c.k).join('|')==='left|center|right', JSON.stringify(ctl.map(c=>c.k)));
    ok('…starting at Centre, which is where it has always been',
       (ctl.find(c=>c.on)||{}).k==='center', JSON.stringify(ctl.map(c=>({k:c.k,on:c.on}))));
    await shop();

    /* ── 2. the edges ───────────────────────────────────────────────────── */
    await align('left');
    const L = await geo();
    ok('Left puts the bar hard against the left edge', L.pillL===0, JSON.stringify(L));
    ok('…with the 14px inset gone, not merely reduced', L.pad==='0px', JSON.stringify({pad:L.pad}));
    ok('…and it shrinks to its own +, rather than staying a full-width stripe',
       L.pillW>0 && L.pillW < base.pillW/2, JSON.stringify({aligned:L.pillW, base:base.pillW}));
    ok('…and it is still on screen and tappable at that edge', L.pillR>0 && L.pillR<=L.vw, JSON.stringify(L));
    await tap('#shopAddFab');
    ok('…and still opens the add sheet from the edge', (await page.locator('#addSheet').count())===1,
       String(await page.locator('#addSheet').count()));
    await page.locator('#addDone').click(); await page.waitForTimeout(1500);

    await align('right');
    const R = await geo();
    ok('Right puts it hard against the right edge', R.pillR===R.vw, JSON.stringify(R));
    ok('…and nothing hangs off it', R.pillL>=0 && R.pillL<R.vw, JSON.stringify(R));
    ok('…the two edges are genuinely opposite ends of the screen', L.pillL===0 && R.pillR===R.vw && L.pillL!==R.pillL,
       JSON.stringify({left:L.pillL, right:R.pillR, vw:R.vw}));

    /* ── 3. the controls compose ────────────────────────────────────────── */
    await align('left');
    await bumpN('srchw', 5);          // step 10 → a 50px bar
    const LW = await geo();
    ok('a width still applies when aligned', LW.pillL===0 && LW.pillW>=40 && LW.pillW<=70,
       JSON.stringify({l:LW.pillL, w:LW.pillW}));
    await bumpN('srchx', 5);          // step 2 → +10px
    const LX = await geo();
    ok('…and Across still nudges it from where the alignment put it',
       LX.pillL===LW.pillL+10, JSON.stringify({before:LW.pillL, after:LX.pillL}));

    /* ── 4. Centre puts it back exactly ─────────────────────────────────── */
    /* The width and the offset set above are still in force, so this is not "back to the baseline" —
       it is "back to what centre means with those numbers", which is the honest comparison. Then they
       are wound off and the untouched-install geometry has to return to the pixel. */
    await align('center');
    const C = await geo();
    /* Not a symmetry check: a width of 50 and an Across of +10 are still in force, so an off-centre bar
       is the correct answer here. What Centre has to restore is the inset it gave up and the fact that
       the bar is no longer pinned to an edge. Exact symmetry is checked below, once the numbers are
       wound back off. */
    ok('Centre gives the inset back and unpins it from the edge',
       C.pad==='14px' && C.pillL>0 && C.pillR<C.vw, JSON.stringify(C));
    await settings();
    for(let i=0;i<5;i++){ const b=page.locator('[data-opt-num="srchw"][data-opt-delta="-1"]').first();
      await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(250); }
    for(let i=0;i<5;i++){ const b=page.locator('[data-opt-num="srchx"][data-opt-delta="-1"]').first();
      await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(250); }
    await shop();
    const Z = await geo();
    ok('and with the numbers wound back off, an untouched install is unchanged to the pixel',
       Z.pillL===base.pillL && Z.pillR===base.pillR && Z.pillW===base.pillW && Z.pad===base.pad,
       JSON.stringify({now:Z, was:base}));

    /* ── 5. it lasts, and it stays on this phone ────────────────────────── */
    await align('right');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    const after = await geo();
    ok('the choice survives a relaunch', after.pillR===after.vw, JSON.stringify(after));
    const stored = await page.evaluate(()=>({ key:localStorage.getItem('ml_srchalign'),
      inState:JSON.stringify(JSON.parse(localStorage.getItem('ml_cache_v101'))).indexOf('srchalign')>=0 }));
    ok('…kept as an appearance setting on this device', stored.key==='right', JSON.stringify(stored));
    ok('…and never written into the shared list', stored.inState===false, JSON.stringify(stored));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
