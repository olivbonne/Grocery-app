/* v1.83 — everything you can do to a list is a press-and-hold away, and "Manage" is gone. The switcher
   sheet's rows now take the same press-and-hold the Lists page's bubbles take, opening the same
   listActSheet (move up/down, rename, share, duplicate, delete). Manage was a detour to reach exactly
   those options, so it goes.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a sheet opens":
   - Manage is really gone, and the gesture that replaces it is VISIBLE — a hidden gesture is an
     unavailable feature, which is the whole reason the sheet says what it is;
   - a press-and-hold offers every option the Lists page offers, for the row you held, not the current list;
   - a short tap still switches — adding press handling to a control is exactly how a tap gets swallowed;
   - it works from EVERY page the switcher opens from, not just the one it was built on. listActSheet()
     used to be rendered only by renderListsPage(), and v1.81 shipped a dead "Create new list" button by
     making precisely this mistake — so each page is checked, not assumed;
   - the actions do their thing (rename, reorder) rather than merely appearing;
   - the Lists page's own press-and-hold still works.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.77: each page's nav carries its own ids, so address them as a group.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN; and a dismissal that clicks a
     scrim which is not there leaves the sheet open, turning one failure into four.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent or no persistence
     check means anything.
   - v1.83 (this suite): renameListCode() goes through window.prompt, which halts the page until something
     answers it — register a dialog handler before driving that action or the run hangs to timeout.
   - v1.83 (this suite): the actions do NOT all close the sheet. moveList deliberately leaves it open so
     you can move a list several places in a row; a step that assumes every action dismisses it leaves a
     scrim over the next control. Dismiss explicitly, and let that be a check of its own. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;   // idempotent: a reload must not overwrite what the app saved
  const cats=[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]}];
  const base=(n,pre,name)=>{ const items=[]; for(let i=0;i<n;i++) items.push({id:pre+i,name:pre+i,qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
    return { items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name,
             baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }; };
  localStorage.setItem("ml_cache_v101", JSON.stringify(base(4,"grocery","Groceries")));
  localStorage.setItem("ml_cache_v102", JSON.stringify(base(2,"screw","Hardware")));
  localStorage.setItem("ml_cache_v103", JSON.stringify(base(1,"pill","Pharmacy")));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"},{code:"v102",name:"Hardware"},{code:"v103",name:"Pharmacy"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[]; let promptSeen=null, promptAnswer="Weekly shop";
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async()=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    /* renameListCode uses window.prompt — without this the page blocks and every later step times out. */
    page.on('dialog', d=>{ promptSeen=d.message(); d.accept(promptAnswer).catch(()=>{}); });
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(900); };
  const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded();
    const b=await loc.boundingBox();
    await page.mouse.move(b.x+b.width/2, b.y+b.height/2);
    await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();   // 450ms threshold + slack
    await page.waitForTimeout(800); };
  const openSwitcher = ()=>tap('#listSwitch');
  const sheet = ()=>page.evaluate(()=>{
    const el=document.querySelector('#listsSheetEl');
    if(!el) return { open:false };
    return { open:true,
             manage:!!document.querySelector('#manageLists'),
             hint:(el.querySelector('.hint')||{}).textContent,
             rows:[...document.querySelectorAll('.listpick')].map(r=>({ name:(r.querySelector('.lp-name')||{}).textContent, code:r.dataset.list })) };
  });
  const act = ()=>page.evaluate(()=>{
    const s=document.querySelector('#listActSheet'); if(!s) return { open:false };
    return { open:true, head:(s.querySelector('.disp')||{}).textContent,
             ids:['laUp','laDown','laRename','laShare','laDup','laDelete'].filter(i=>!!document.getElementById(i)) };
  });
  const title = ()=>page.evaluate(()=>(document.querySelector('#listSwitch')||{}).textContent);

  try{
    /* ── 1. Manage is gone, the gesture is announced ────────────────────── */
    await mk();
    await openSwitcher();
    let s = await sheet();
    ok('precondition: the switcher opens with all three lists', s.open===true && s.rows.length===3,
       JSON.stringify(s.rows && s.rows.map(r=>r.name)));
    ok('the Manage button is gone', s.manage===false, JSON.stringify({manage:s.manage}));
    ok('…and the sheet says what replaces it', /press\s*&?\s*hold/i.test(s.hint||''), s.hint);

    /* ── 2. the press-and-hold offers everything the Lists page offers ──── */
    await hold(page.locator('.listpick[data-list="v102"]'));
    let a = await act();
    ok('holding a row opens the list-action sheet', a.open===true, JSON.stringify(a));
    ok('…with every option the Lists page has',
       a.open && a.ids.join('|')==='laUp|laDown|laRename|laShare|laDup|laDelete', JSON.stringify(a.ids));
    ok('…for the list you HELD, not the one you are in', /Hardware/.test(a.head||''), a.head);
    ok('…and the switcher stepped aside rather than stacking scrims',
       (await page.locator('#listsSheetEl').count())===0, String(await page.locator('#listsSheetEl').count()));
    await page.evaluate(()=>{ const b=document.querySelector('#listActBg'); if(b) b.click(); });
    await page.waitForTimeout(700);
    ok('…and its scrim closes it', (await page.locator('#listActSheet').count())===0);

    /* ── 3. a short tap still switches ──────────────────────────────────── */
    await openSwitcher();
    await tap('.listpick[data-list="v103"]');
    ok('a short tap still switches list, unswallowed by the hold handling',
       /^Pharmacy/.test(await title()), await title());

    /* ── 4. the actions actually act ────────────────────────────────────── */
    await openSwitcher();
    await hold(page.locator('.listpick[data-list="v103"]'));
    await tap('#laRename');
    ok('Rename asks, through the app\'s own prompt', /rename/i.test(promptSeen||''), String(promptSeen));
    ok('…and the new name reaches the header', /^Weekly shop/.test(await title()), await title());
    await openSwitcher();
    s = await sheet();
    ok('…and the switcher row', (s.rows||[]).some(r=>r.name==='Weekly shop'), JSON.stringify(s.rows&&s.rows.map(r=>r.name)));

    const orderBefore = (await sheet()).rows.map(r=>r.code).join(',');
    await hold(page.locator('.listpick[data-list="v103"]'));
    await tap('#laUp');
    ok('Move up leaves the sheet open, so a list can be moved several places in a row',
       (await act()).open===true, JSON.stringify(await act()));
    await page.evaluate(()=>{ const b=document.querySelector('#listActBg'); if(b) b.click(); });
    await page.waitForTimeout(700);
    await openSwitcher();
    const orderAfter = (await sheet()).rows.map(r=>r.code).join(',');
    ok('precondition: Pharmacy was not already first', orderBefore.indexOf('v103')>0, orderBefore);
    ok('Move up reorders the switcher itself', orderAfter!==orderBefore &&
       orderAfter.split(',').indexOf('v103') === orderBefore.split(',').indexOf('v103')-1,
       JSON.stringify({before:orderBefore, after:orderAfter}));
    await page.evaluate(()=>{ const b=document.querySelector('#listsBg'); if(b) b.click(); });
    await page.waitForTimeout(700);

    /* ── 5. it works from every page the switcher opens from ────────────── */
    /* listActSheet() used to be rendered only by the Lists page. This is the check that would have
       caught v1.81's dead "Create new list" button, so it is done per page rather than assumed. */
    for(const [where, nav] of [['the Shop page','#cartNav, #cartNavL, #cartNavP, #cartNavS'],
                               ['the Plan page','#planNav, #planNavL, #planNavP, #planNavS']]){
      await tap(nav);
      await openSwitcher();
      ok(`precondition: the switcher opens from ${where}`, (await sheet()).open===true, where);
      await hold(page.locator('.listpick').first());
      const aa = await act();
      ok(`…and the hold opens the action sheet from ${where}`, aa.open===true && aa.ids.length===6,
         JSON.stringify({where, open:aa.open, ids:aa.ids.length}));
      await page.evaluate(()=>{ const b=document.querySelector('#listActBg'); if(b) b.click(); });
      await page.waitForTimeout(700);
    }
    await tap('#setNav, #setNavL, #setNavP, #setNavS');
    ok('precondition: Settings is open', (await page.locator('.optpage').count())===1);
    ok('…and Settings has no switcher of its own to hold', (await page.locator('#listSwitch').count())===0);

    /* ── 6. the hold is now the ONLY route to these options ─────────────── */
    /* SUPERSEDED by v1.87: this checked that the Lists page's own press-and-hold still worked alongside
       the switcher's. That page is gone, so the switcher's row is the only way to reach rename, share,
       reorder, duplicate and delete — which makes it worth proving that it still is, from the shop page
       and after a relaunch, rather than only in the run above. */
    await mk();
    await openSwitcher();
    await hold(page.locator('.listpick[data-list="v102"]'));
    const la = await act();
    ok('a hold on a switcher row is the only route to the options, and it works', la.open===true && la.ids.length===6, JSON.stringify(la.ids));
    ok('…for the row held', /Hardware/.test(la.head||''), la.head);
    ok('…and no Lists page exists any more', (await page.locator('.listgrid').count())===0,
       String(await page.locator('.listgrid').count()));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
