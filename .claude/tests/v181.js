/* v1.81 — the list switcher: the header title becomes a button carrying the current list's name and a
   chevron, and it opens a bottom sheet that lists every list with its item count and a selection radio,
   plus "Create new list". The sheet itself is not new — listsSheet() has existed since the multi-list
   work — but nothing in the file ever set listsOpen to true, so it was unreachable dead code.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a button appears":
   - the switcher shows the list you are actually in, and opens the sheet;
   - the sheet enumerates EVERY list, not just the current one, with real counts read from each list's
     own cache — a switcher that cannot see the other lists is a label;
   - tapping another list really switches: the header AND the list body both change;
   - selection is single: exactly one radio is on, and it follows the switch;
   - creating a list from the sheet reaches the real new-list flow;
   - the management the sheet gave up (move / rename / delete) is still reachable — it moved to the
     Lists page's press-and-hold, it did not disappear. (v1.83 brought that same press-and-hold to the
     switcher's own rows and dropped the Manage button; the checks that named Manage are superseded
     in place below, and v183.js drives the gesture that replaced it.);
   - the top bar is untouched: the title is still vertically centred in the 61px bar (v1.77) and the
     back arrow still works and still lines up (v1.79). The title changed from a <span> to a <button>,
     which is exactly the kind of swap that quietly moves a baseline.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check — assert the
     precondition too, so a vacuous pass is impossible.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.76: measure an untouched install against the same build, and find a row by the control it
     carries rather than by a label.
   - v1.77: the Lists page's nav carries its own ids (#setNavL, #cartNavL).
   - v1.80: assert a count AND the identity behind it, never a number remembered from an earlier version.
   - v1.81 (this suite): the app title-cases item names on the way to the screen (cap()), so a body check
     written against the seeded lowercase name fails on "Grocery1" — match case-insensitively.
   - v1.81 (this suite): a dismissal step that clicks a scrim which is not there leaves the sheet open,
     and every later tap then hits the scrim instead of the control, so one failure becomes four. Recover
     by driving the real dismissal and asserting it worked.
   - v1.81 (this suite): "the element exists" said nothing about whether it could be SEEN. The chevron was
     in the DOM, sized, visible and opaque — and painted under the absolutely-centred "N to buy" pill, so
     it never appeared on screen at all. Any check for a new mark must ask what is on top of it. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* Two lists, so "switch" has somewhere to go. The second one is seeded only as its cache, which is
   exactly how a list you are not currently in exists on the device — listStats() reads ml_cache_<code>. */
const SEED = (solo,nm)=>`(() => {
  const mk=(n,pre,cat)=>{ const a=[]; for(let i=0;i<n;i++) a.push({id:pre+i,name:pre+i,qty:1,cat:cat,weight:"",sub:"",checked:false,tags:[],starred:false}); return a; };
  const cats=[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]},{id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}];
  const base=(items,name)=>({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"],
    categories:cats, name, baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{} });
  const a=mk(8,"grocery","fruit"); a[0].checked=true;
  localStorage.setItem("ml_cache_v101", JSON.stringify(base(a,"${nm||"Groceries"}")));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  ${'' /* the solo run is the untouched-install baseline: one list, nothing else on the device */}
  if(!${solo?'true':'false'}){
    localStorage.setItem("ml_cache_v102", JSON.stringify(base(mk(3,"screw","meat"),"Hardware")));
    localStorage.setItem("ml_collapse_v102", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
    localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"${nm||"Groceries"}"},{code:"v102",name:"Hardware"}]));
  } else {
    localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"${nm||"Groceries"}"}]));
  }
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(solo,nm)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED(solo,nm));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(900); };
  const sheet = ()=>page.evaluate(()=>{
    const el=document.querySelector('#listsSheetEl');
    if(!el) return { open:false };
    const rows=[...document.querySelectorAll('.listpick')].map(r=>({
      name:(r.querySelector('.lp-name')||{}).textContent,
      sub:(r.querySelector('.lp-sub')||{}).textContent,
      code:r.dataset.list,
      on:!!r.querySelector('.lp-radio.on'),
      cur:r.getAttribute('aria-current')==='true' }));
    return { open:true, rows, newList:!!document.querySelector('#newList'),
             newLabel:(document.querySelector('#newList')||{}).textContent,
             manage:!!document.querySelector('#manageLists') };
  });
  const header = ()=>page.evaluate(()=>{
    const b=document.querySelector('#listSwitch');
    const tf=document.querySelector('.topfix');
    const back=document.querySelector('.topfix .backbtn');
    if(!b||!tf) return { has:!!b };
    const r=b.getBoundingClientRect(), t=tf.getBoundingClientRect();
    const br=back?back.getBoundingClientRect():null;
    return { has:true, tag:b.tagName, text:b.textContent.trim(),
             chev:!!b.querySelector('.lschev'), pop:b.getAttribute('aria-haspopup'),
             expanded:b.getAttribute('aria-expanded'),
             titleClass:b.classList.contains('title')&&b.classList.contains('disp'),
             x:Math.round(r.left), afterBack: br ? r.left>=br.right-1 : null,
             leftHalf: r.left < window.innerWidth/2,
             barH:Math.round(t.height),
             /* v1.77 put the title in the vertical middle of the bar; a <span>→<button> swap is
                exactly what silently moves it, so measure the offset rather than trusting it. */
             offCentre: Math.round(((r.top+r.height/2) - (t.top+t.height/2))*100)/100 };
  });
  const bodyNames = ()=>page.evaluate(()=>
    [...document.querySelectorAll('#zoomer .pill')].map(p=>p.textContent.replace(/[✓▾×]/g,'').trim()).filter(Boolean));

  try{
    /* ── 1. the switcher itself ─────────────────────────────────────────── */
    await mk(false);
    let h = await header();
    ok('header carries a #listSwitch button', h.has && h.tag==='BUTTON', JSON.stringify({has:h.has,tag:h.tag}));
    ok('…showing the current list name', /^Groceries/.test(h.text||''), h.text);
    ok('…with a chevron', h.chev===true, JSON.stringify({chev:h.chev}));
    /* The chevron IS the "arrow down to select another list", so it has to be painted, not merely
       present: it was covered by the centred count pill on its first build. */
    let cv = await page.evaluate(()=>{
      const c=document.querySelector('.lschev'); if(!c) return null;
      const r=c.getBoundingClientRect();
      const top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
      return { w:Math.round(r.width), h:Math.round(r.height),
               mine: !!(top && (top===c || c.contains(top))),
               covered: top && !(top===c || c.contains(top)) ? (top.className.baseVal||top.className||top.tagName) : null };
    });
    ok('…that is actually painted, not buried under the count pill',
       cv && cv.w>0 && cv.h>0 && cv.mine===true, JSON.stringify(cv));
    ok('…announced as opening a dialog', h.pop==='dialog' && h.expanded==='false', JSON.stringify({pop:h.pop,exp:h.expanded}));
    ok('…still classed title+disp (v1.77/v1.79 typography)', h.titleClass===true, JSON.stringify({cls:h.titleClass}));
    ok('…top LEFT, after the back arrow', h.leftHalf===true && h.afterBack===true, JSON.stringify({x:h.x,afterBack:h.afterBack}));
    ok('…and still vertically centred in the bar', Math.abs(h.offCentre)<=1.5, JSON.stringify({bar:h.barH,off:h.offCentre}));

    /* The pill keeps its v1.37 dead-centre position whenever the title leaves room for it, and only
       slides when it would otherwise overlap — so prove both halves, not just the one that was broken. */
    const pill = await page.evaluate(()=>{
      const c=document.querySelector('.hcount-mid'); const row=c&&c.parentElement;
      if(!c||!row) return null;
      const rr=row.getBoundingClientRect(), cr=c.getBoundingClientRect();
      const t=document.querySelector('.topfix .title').getBoundingClientRect();
      return { off:+(((cr.left+cr.width/2)-(rr.left+rr.width/2))).toFixed(1), clearsTitle: cr.left >= t.right };
    });
    ok('the count pill was pushed clear of the title rather than over it',
       pill && pill.clearsTitle===true, JSON.stringify(pill));
    await mk(false, 'Co');   // a short title leaves the pill its room — a fresh boot, not a reload:
                             // addInitScript re-runs on every navigation and would undo a page-side edit
    const pill2 = await page.evaluate(()=>{
      const c=document.querySelector('.hcount-mid'); const row=c&&c.parentElement;
      if(!c||!row) return null;
      const rr=row.getBoundingClientRect(), cr=c.getBoundingClientRect();
      return { off:+(((cr.left+cr.width/2)-(rr.left+rr.width/2))).toFixed(1) };
    });
    ok('…and stays dead-centre when the title leaves it room (v1.37 unchanged)',
       pill2 && Math.abs(pill2.off)<=1, JSON.stringify(pill2));
    await mk(false);   // back to the two-list fixture for the rest

    /* ── 2. the sheet enumerates every list ─────────────────────────────── */
    let s = await sheet();
    ok('sheet is closed until the switcher is tapped', s.open===false, JSON.stringify(s));
    await tap('#listSwitch');
    s = await sheet();
    ok('tapping the switcher opens the sheet', s.open===true, JSON.stringify({open:s.open}));
    ok('…listing BOTH lists, by name', s.open && s.rows.length===2 &&
       s.rows.map(r=>r.name).join('|')==='Groceries|Hardware', JSON.stringify(s.rows&&s.rows.map(r=>r.name)));
    ok('…with the current list counted from live state', s.open && /^8 items/.test(s.rows[0].sub||''), s.open&&s.rows[0].sub);
    ok('…and its cart total alongside', s.open && /1 in cart/.test(s.rows[0].sub||''), s.open&&s.rows[0].sub);
    ok('…and the OTHER list counted from its own cache', s.open && s.rows[1].sub==='3 items', s.open&&s.rows[1].sub);
    ok('…exactly one row selected, and it is the current list',
       s.open && s.rows.filter(r=>r.on).length===1 && s.rows[0].on===true && s.rows[0].cur===true,
       JSON.stringify(s.open&&s.rows.map(r=>({n:r.name,on:r.on}))));
    /* SUPERSEDED by v1.83: the sheet offered a "Manage" button that navigated to the Lists page for
       rename/reorder/delete. v1.83 removed it and put those options on a press-and-hold of the row
       itself, so the assertion is inverted: Manage must be GONE, and the gesture that replaced it must
       be named on the sheet — a hidden gesture is an unavailable feature. v183.js drives the gesture. */
    ok('…offering create, and no Manage detour (v1.83)', s.open && s.newList===true && s.manage===false,
       JSON.stringify({n:s.newList,m:s.manage}));
    ok('…and the create button says what it does', s.open && /create new list/i.test(s.newLabel||''), s.newLabel);

    /* ── 3. switching actually switches ─────────────────────────────────── */
    const before = await bodyNames();
    ok('precondition: the Groceries body is on screen', before.length>0 && before.every(n=>/^grocery/i.test(n)),
       JSON.stringify(before.slice(0,3)));
    await tap('.listpick[data-list="v102"]');
    s = await sheet();
    h = await header();
    const after = await bodyNames();
    ok('picking another list closes the sheet', s.open===false, JSON.stringify({open:s.open}));
    ok('…and the header follows it', /^Hardware/.test(h.text||''), h.text);
    ok('…and so does the list body', after.length>0 && after.every(n=>/^screw/i.test(n)), JSON.stringify(after.slice(0,3)));
    await tap('#listSwitch');
    s = await sheet();
    ok('…and the selection moved with it', s.open && s.rows.filter(r=>r.on).length===1 && s.rows[1].on===true,
       JSON.stringify(s.open&&s.rows.map(r=>({n:r.name,on:r.on}))));

    /* ── 4. the ways out ────────────────────────────────────────────────── */
    await page.mouse.click(195, 60); await page.waitForTimeout(700);   // the scrim, well above the sheet
    s = await sheet(); h = await header();
    ok('tapping the scrim closes it without switching', s.open===false && /^Hardware/.test(h.text||''),
       JSON.stringify({open:s.open,title:h.text}));

    /* The create button is reachable from the Shop page now, so the sheet it opens has to be rendered
       there too — it used to exist only on the Lists page, which made this button a dead end (found by
       this check on its first run). Drive it all the way to a created list rather than stopping at
       "a sheet appeared". */
    await tap('#listSwitch'); await tap('#newList');
    const nl = await page.evaluate(()=>({ sheet:!!document.querySelector('#newListSheet'),
                                          input:!!document.querySelector('#newListName'),
                                          switcher:!!document.querySelector('#listsSheetEl') }));
    ok('"Create new list" reaches the real new-list flow', nl.sheet===true && nl.input===true, JSON.stringify(nl));
    ok('…and closes the switcher behind it, so two scrims never stack', nl.switcher===false, JSON.stringify({s:nl.switcher}));
    await page.locator('#newListName').fill('Pharmacy');
    await tap('#newListCreate');
    h = await header();
    ok('…and creating one switches straight into it', /^Pharmacy/.test(h.text||''), h.text);
    await tap('#listSwitch');
    s = await sheet();
    ok('…and it joins the switcher, selected', s.open && s.rows.length===3 &&
       s.rows.filter(r=>r.on).length===1 && (s.rows.find(r=>r.on)||{}).name==='Pharmacy',
       JSON.stringify(s.open&&s.rows.map(r=>({n:r.name,on:r.on}))));

    /* SUPERSEDED by v1.83: this used to tap "Manage" to reach the Lists page. That button is gone, so
       the route is the nav — but what the pair was really guarding still holds and is still checked:
       the sheet can be left, and the Lists page carries no switcher of its own because it IS the list
       of lists. */
    await page.evaluate(()=>{ const b=document.querySelector('#listsBg'); if(b) b.click(); });
    await page.waitForTimeout(700);
    await tap('#listsBtn, #listsBtnL, #listsBtnP, #listsBtnS');
    const onLists = await page.evaluate(()=>({ grid:!!document.querySelector('.listgrid'),
                                               sheet:!!document.querySelector('#listsSheetEl'),
                                               sw:!!document.querySelector('#listSwitch') }));
    ok('the sheet can be dismissed and the Lists page reached (v1.83: via the nav, not Manage)',
       onLists.grid===true && onLists.sheet===false, JSON.stringify(onLists));
    ok('…where there is no switcher, because that page IS the list of lists', onLists.sw===false, JSON.stringify({sw:onLists.sw}));

    /* ── 5. the management the sheet gave up is still reachable ─────────── */
    const bub = page.locator('.listbubble[data-open="v101"]').first();
    await bub.scrollIntoViewIfNeeded();
    const box = await bub.boundingBox();
    await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
    await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();   // 450ms long-press + slack
    await page.waitForTimeout(700);
    const act = await page.evaluate(()=>({ up:!!document.querySelector('#laUp'), rn:!!document.querySelector('#laRename'),
                                           del:!!document.querySelector('#laDelete'), dup:!!document.querySelector('#laDup') }));
    ok('press-and-hold on the Lists page still gives move/rename/delete', act.up&&act.rn&&act.del&&act.dup, JSON.stringify(act));
    await page.evaluate(()=>{ const b=document.querySelector('#listActBg'); if(b) b.click(); });
    await page.waitForTimeout(600);

    /* ── 6. the rest of the top bar is untouched ────────────────────────── */
    await tap('#cartNavL'); await page.waitForTimeout(400);
    const backWorks = await page.evaluate(async()=>{
      const b=document.querySelector('#toLists'); if(!b) return 'no back button';
      b.click(); await new Promise(r=>setTimeout(r,900));
      return document.querySelector('.listgrid') ? 'lists' : 'elsewhere';
    });
    ok('the ‹ back arrow still goes to Lists', backWorks==='lists', String(backWorks));
    await tap('#cartNavL');
    const settingsSw = await page.evaluate(async()=>{
      const s=document.querySelector('#setNav'); if(!s) return null;
      s.click(); await new Promise(r=>setTimeout(r,900));
      return { opt:!!document.querySelector('.optpage'), sw:!!document.querySelector('#listSwitch') };
    });
    ok('Settings has no switcher either', settingsSw && settingsSw.opt===true && settingsSw.sw===false, JSON.stringify(settingsSw));

    /* ── 7. one-list install: the baseline ──────────────────────────────── */
    await mk(true);
    h = await header();
    ok('one-list install still has the switcher', h.has===true && /^Groceries/.test(h.text||''), h.text);
    await tap('#listSwitch');
    s = await sheet();
    ok('…and its sheet shows exactly that one list, selected',
       s.open && s.rows.length===1 && s.rows[0].name==='Groceries' && s.rows[0].on===true,
       JSON.stringify(s.rows));
    ok('…with create still offered', s.open && s.newList===true, JSON.stringify({n:s.newList}));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
