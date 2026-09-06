/* v1.82 — the Plan tab: a fourth bottom-nav tab, left of Shop, showing a week at a time. Each day
   carries what you mean to eat and a ⋯ that offers "Add recipe" or "Add food"; a recipe keeps its
   ingredients and is saved so it can go on another day without retyping; what you planned can be put
   on the shopping list or taken off the day. The plan is per-list and rides on the synced state.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a tab appears":
   - the nav really is four tabs in the right ORDER, and Plan is left of Shop as asked;
   - the seven rows are this Monday-to-Sunday week, in order, with today marked — a planner that shows
     the wrong dates is worse than none;
   - "next week" moves the dates by exactly seven days, and the way back exists;
   - the ⋯ offers exactly the two things the user asked for, and adding lands on THAT day and no other;
   - a recipe is saved once and re-usable on another day, which is the whole reason recipes are a
     separate kind from food;
   - what is planned can reach the shopping list, and can be taken off the day again;
   - the plan survives a relaunch, and the page you were on survives a relaunch — the page indexes all
     shifted by one when Plan was inserted, and a stale remembered index would land you on the wrong page;
   - an install with no plan is the app as it was: seven empty days, no errors, the shop untouched.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check — assert the
     precondition too, so a vacuous pass is impossible.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.76: measure an untouched install against the same build.
   - v1.77: each page's nav carries its own ids, so address them as a group.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN, and addInitScript re-runs on
     every navigation, so a fixture change made from inside the page is undone by a reload.
   - v1.82 (this suite): the same re-run defeats any PERSISTENCE check — the seed rewrote the cache on
     reload, so "did the plan survive a relaunch" was really asking "did the seed run again". The seed
     is idempotent now: it writes only into a device that has never been set up, which is what a seed
     is meant to describe. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = (extra)=>`(() => {
  if(localStorage.getItem("ml_me")) return;   // idempotent: a reload must NOT overwrite what the app saved
  const items=[];
  for(let n=0;n<4;n++) items.push({id:"i"+n,name:"item"+n,qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]},
                               {id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}],
    name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
  ${extra||""}
})()`;

/* The same Monday-start arithmetic the app uses, computed independently here so the suite is checking
   the app's dates against a calendar rather than against its own helper. */
const DAY_MS = 86400000;
function mondayOf(off){ const d=new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7) + off*7); return d; }
const fmtDay  = d => d.toLocaleDateString(undefined,{weekday:"long"});
const fmtDate = d => d.toLocaleDateString(undefined,{day:"numeric",month:"short"});

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
  const plan = ()=>tap('#planNav, #planNavL, #planNavP, #planNavS');
  const shop = ()=>tap('#cartNav, #cartNavL, #cartNavP, #cartNavS');
  const nav = ()=>page.evaluate(()=>[...document.querySelectorAll('.bottomnav .navbtn')].map(b=>({
    label:(b.querySelector('span:not(.cartwrap):not(.cartnum)')||{}).textContent,
    id:b.id, active:b.classList.contains('active'), x:Math.round(b.getBoundingClientRect().left) })));
  const week = ()=>page.evaluate(()=>({
    label:(document.querySelector('#pwNow')||{}).textContent,
    days:[...document.querySelectorAll('.planday')].map(s=>({
      name:(s.querySelector('.pdname')||{}).textContent,
      date:(s.querySelector('.pddate')||{}).textContent,
      today:s.classList.contains('today'),
      more:!!s.querySelector('[data-pd]'),
      key:(s.querySelector('[data-pd]')||{dataset:{}}).dataset.pd,
      chips:[...s.querySelectorAll('.pchip')].map(c=>c.textContent.trim()) })) }));
  /* SUPERSEDED by v1.84: ingredients used to be one free-text #paIng textarea, filled in one go. They
     are entered one at a time now through #paIngIn, each matched against the app's own items, so the
     helper types them individually. What the checks below assert — that a recipe lands on its day with
     its ingredients — is unchanged; only the way they are typed is. v184.js drives the new field's
     suggestions and its chips. */
  const addTo = async(dayIdx, kind, name, ing)=>{
    const more = page.locator('.planday').nth(dayIdx).locator('[data-pd]');
    await more.click(); await page.waitForTimeout(700);
    await tap(kind==='recipe' ? '#pmRecipe' : '#pmFood');
    await page.locator('#paName').fill(name);
    if(ing!==undefined){
      for(const one of String(ing).split(/[\n,]/).map(x=>x.trim()).filter(Boolean)){
        await page.locator('#paIngIn').fill(one);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(350);
      }
    }
    await tap('#paGo');
  };

  try{
    /* ── 1. the tab ─────────────────────────────────────────────────────── */
    await mk();
    let n = await nav();
    /* SUPERSEDED by v1.87: the Lists tab is gone, so the nav is three. Plan being to the LEFT of Shop —
       what this version was actually asked for — is unchanged and still checked. */
    ok('the nav has three tabs (v1.87: was four, Lists went)', n.length===3, JSON.stringify(n.map(b=>b.label)));
    ok('…in the order Plan · Shop · Settings',
       n.map(b=>b.label).join('|')==='Plan|Shop|Settings', JSON.stringify(n.map(b=>b.label)));
    ok('…with Plan to the LEFT of Shop, as asked', n[0].x < n[1].x, JSON.stringify({plan:n[0].x, shop:n[1].x}));
    ok('…and Shop is the tab we are on', n[1].active===true && n[0].active===false,
       JSON.stringify(n.map(b=>({l:b.label,a:b.active}))));

    await plan();
    n = await nav();
    const w = await week();
    ok('tapping Plan opens the Plan page', (await page.locator('.planweek').count())===1 && w.days.length===7,
       JSON.stringify({weekbar:await page.locator('.planweek').count(), days:w.days.length}));
    ok('…and marks Plan as the current tab', n[0].active===true && n[1].active===false,
       JSON.stringify(n.map(b=>({l:b.label,a:b.active}))));

    /* ── 2. the week is a real week ─────────────────────────────────────── */
    const mon = mondayOf(0);
    const expect = [...Array(7)].map((_,i)=>{ const d=new Date(mon.getTime()+i*DAY_MS);
      return { name:fmtDay(d), date:fmtDate(d) }; });
    ok('it opens on this week', w.label==='This week', w.label);
    ok('…showing Monday to Sunday of it, in order',
       w.days.map(d=>d.name+' '+d.date).join(' | ')===expect.map(d=>d.name+' '+d.date).join(' | '),
       JSON.stringify({got:w.days.map(d=>d.name+' '+d.date), want:expect.map(d=>d.name+' '+d.date)}));
    const todayIdx = (new Date().getDay()+6)%7;
    ok('…with today marked, and only today',
       w.days.filter(d=>d.today).length===1 && w.days[todayIdx].today===true,
       JSON.stringify({marked:w.days.map(d=>d.today), todayIdx}));
    ok('…and every day offering the ⋯', w.days.every(d=>d.more===true), JSON.stringify(w.days.map(d=>d.more)));

    await tap('#pwNext');
    const w2 = await week();
    const mon2 = mondayOf(1);
    ok('"next" moves on by exactly seven days', w2.days[0].date===fmtDate(mon2), JSON.stringify({got:w2.days[0].date, want:fmtDate(mon2)}));
    ok('…and says so', w2.label==='Next week', w2.label);
    ok('…and nothing is marked today next week', w2.days.every(d=>d.today===false), JSON.stringify(w2.days.map(d=>d.today)));
    await tap('#pwNext');
    const w3 = await week();
    ok('…and further out it names the dates rather than counting weeks',
       /–/.test(w3.label||'') && w3.label!=='Next week', w3.label);
    await tap('#pwNow');
    ok('tapping the label comes back to this week', (await week()).label==='This week');
    await tap('#pwPrev');
    ok('…and "previous" goes the other way', (await week()).label==='Last week');
    await tap('#pwNow');

    /* ── 3. the ⋯ offers exactly the two things asked for ───────────────── */
    await page.locator('.planday').nth(2).locator('[data-pd]').click();
    await page.waitForTimeout(700);
    const menu = await page.evaluate(()=>{
      const s=document.querySelector('#pmSheet'); if(!s) return null;
      return { open:true, actions:[...s.querySelectorAll('.optaction')].map(b=>b.textContent.trim()),
               head:(s.querySelector('.disp')||{}).textContent };
    });
    ok('the ⋯ opens a menu for that day', menu && menu.open===true, JSON.stringify(menu));
    ok('…offering exactly "Add recipe" and "Add food"',
       menu && menu.actions.join('|')==='Add recipe|Add food', JSON.stringify(menu&&menu.actions));
    ok('…and naming the day it will add to',
       menu && new RegExp(fmtDay(new Date(mon.getTime()+2*DAY_MS)),'i').test(menu.head||''), menu&&menu.head);
    await page.evaluate(()=>{ const b=document.querySelector('#pmBg'); if(b) b.click(); });
    await page.waitForTimeout(600);

    /* ── 4. adding food ─────────────────────────────────────────────────── */
    await addTo(2, 'food', 'Fish pie');
    let w4 = await week();
    ok('adding food puts it on that day', (w4.days[2].chips||[]).some(c=>/Fish pie/.test(c)), JSON.stringify(w4.days[2].chips));
    ok('…and on no other day', w4.days.filter((d,i)=>i!==2 && (d.chips||[]).length).length===0,
       JSON.stringify(w4.days.map(d=>d.chips)));

    /* ── 5. adding a recipe, and re-using it ────────────────────────────── */
    await addTo(4, 'recipe', 'Bolognese', 'mince\ntomatoes\nspaghetti');
    w4 = await week();
    ok('adding a recipe puts it on its day', (w4.days[4].chips||[]).some(c=>/Bolognese/.test(c)), JSON.stringify(w4.days[4].chips));
    await page.locator('.planday').nth(6).locator('[data-pd]').click(); await page.waitForTimeout(700);
    await tap('#pmRecipe');
    const saved = await page.evaluate(()=>[...document.querySelectorAll('[data-precipe]')].map(b=>b.textContent.trim()));
    ok('…and it is offered again on another day, without retyping', saved.includes('Bolognese'), JSON.stringify(saved));
    /* SUPERSEDED by v1.84: picking a saved recipe used to add it to the day and close the sheet. It now
       FILLS the form — name and ingredients — and stays put, so what is about to be added can be read and
       changed first; the day only gets it when Add is pressed. Both halves are checked here. */
    await tap('[data-precipe]');
    ok('…and picking it fills the form rather than closing (v1.84)',
       await page.evaluate(()=>!!document.querySelector('#paSheet') && (document.querySelector('#paName')||{}).value==='Bolognese'),
       JSON.stringify(await page.evaluate(()=>({ open:!!document.querySelector('#paSheet'),
                                                 name:(document.querySelector('#paName')||{}).value }))));
    await tap('#paGo');
    w4 = await week();
    ok('…and then it is on the second day too',
       (w4.days[6].chips||[]).some(c=>/Bolognese/.test(c)) && (w4.days[4].chips||[]).some(c=>/Bolognese/.test(c)),
       JSON.stringify({thu:w4.days[4].chips, sun:w4.days[6].chips}));

    /* ── 6. what is planned can reach the list, and can leave the day ───── */
    const before = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.length);
    await page.locator('.planday').nth(4).locator('.pchip').first().click(); await page.waitForTimeout(700);
    const pick = await page.evaluate(()=>{
      const s=document.querySelector('#ppSheet'); if(!s) return null;
      return { actions:[...s.querySelectorAll('.optaction')].map(b=>b.textContent.trim()) }; });
    ok('tapping what you planned offers the list and the day',
       pick && pick.actions.length===2 && /ingredient/i.test(pick.actions[0]) && /Remove/i.test(pick.actions[1]),
       JSON.stringify(pick));
    /* SUPERSEDED by v1.85: this used to write the ingredients straight to the list. They now go through
       the review sheet first, where each one can be turned off — some of a recipe is usually already in
       the cupboard. What this check guards is unchanged (all three ingredients reach the list); it just
       confirms the review on the way. v185.js drives the deselection itself. */
    await tap('#ppList');
    ok('…and that opens the review sheet rather than writing straight away (v1.85)',
       (await page.locator('#smartSheetEl').count())===1, String(await page.locator('#smartSheetEl').count()));
    await tap('#smartConfirm');
    const after = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.map(i=>i.name.toLowerCase()));
    ok('…and the recipe\'s ingredients land on the shopping list',
       after.length===before+3 && ['mince','tomatoes','spaghetti'].every(x=>after.includes(x)),
       JSON.stringify({before, after:after.slice(-4)}));

    await page.locator('.planday').nth(2).locator('.pchip').first().click(); await page.waitForTimeout(700);
    await tap('#ppDel');
    w4 = await week();
    ok('…and removing takes it off that day only',
       (w4.days[2].chips||[]).length===0 && (w4.days[4].chips||[]).length===1,
       JSON.stringify({wed:w4.days[2].chips, fri:w4.days[4].chips}));

    /* ── 7. it all survives a relaunch, and so does the page you were on ── */
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    /* SUPERSEDED by v1.87: the page numbers moved again when Lists went, so the key is ml_lastview3 and
       Plan is index 0. The guarantee — the page you were on survives a relaunch, under a key versioned
       for the numbering that wrote it — is unchanged. */
    const back = await page.evaluate(()=>({ onPlan:!!document.querySelector('.planweek'),
                                            key:localStorage.getItem('ml_lastview3'),
                                            old:localStorage.getItem('ml_lastview2') }));
    ok('a relaunch comes back to the Plan tab', back.onPlan===true, JSON.stringify(back));
    ok('…remembered under a versioned key, the older ones gone', back.key==='0' && back.old===null, JSON.stringify(back));
    const kept = await week();
    ok('…with the plan still on it', (kept.days[4].chips||[]).some(c=>/Bolognese/.test(c)), JSON.stringify(kept.days[4].chips));

    /* ── 8. every tab reaches every page ────────────────────────────────── */
    await shop();
    ok('Plan → Shop works', (await page.locator('#zoomer .pill').count())>0 && (await page.locator('.planweek').count())===0);
    /* SUPERSEDED by v1.87: there is no Lists page to pass through, so the walk is Shop → Plan direct. */
    await plan();
    ok('Shop → Plan works', (await page.locator('.planweek').count())===1);
    await tap('#setNavP');
    ok('Plan → Settings works', (await page.locator('.optpage').count())===1);
    await tap('#setBack');
    ok('…and Settings\' back returns to Plan, where it was opened from', (await page.locator('.planweek').count())===1);

    /* ── 9. a stale pre-v1.82 remembered page cannot mislead ────────────── */
    await mk(`localStorage.setItem("ml_lastview","2");`);   // a key from two numberings ago
    const stale = await page.evaluate(()=>({ opt:!!document.querySelector('.optpage'),
                                             plan:!!document.querySelector('.planweek'),
                                             shop:(document.querySelectorAll('#zoomer .pill').length>0) }));
    ok('an old remembered page is ignored rather than mis-read', stale.opt===false, JSON.stringify(stale));

    /* ── 10. an install with no plan is the app as it was ───────────────── */
    await mk();
    const shopBase = await page.evaluate(()=>({ items:document.querySelectorAll('#zoomer .pill').length,
                                                bar:Math.round(document.querySelector('.topfix').getBoundingClientRect().height) }));
    ok('precondition: the shop page still has its items and its 61px bar',
       shopBase.items>0 && shopBase.bar===61, JSON.stringify(shopBase));
    await plan();
    const empty = await week();
    ok('a plan nobody has touched is seven empty days',
       empty.days.length===7 && empty.days.every(d=>(d.chips||[]).length===0), JSON.stringify(empty.days.map(d=>d.chips)));
    ok('…that say so rather than showing nothing',
       (await page.locator('.pdempty').count())===7, String(await page.locator('.pdempty').count()));

    /* The nav floats over the page, so the last day has to be reachable rather than parked under it —
       the same guarantee v1.78 and v1.80 had to prove for the chrome they added. */
    await plan();
    await page.evaluate(()=>window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    const clear = await page.evaluate(()=>{
      const ds=[...document.querySelectorAll('.planday')], last=ds[ds.length-1];
      const nav=document.querySelector('.bottomnav');
      return { last:Math.round(last.getBoundingClientRect().bottom), nav:Math.round(nav.getBoundingClientRect().top),
               clears: last.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top }; });
    ok('scrolled to the end, Sunday clears the floating nav', clear.clears===true, JSON.stringify(clear));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
