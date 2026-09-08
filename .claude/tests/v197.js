/* v1.97 — spoons are never converted, and a week can be saved, applied or cleared.

   WHY THIS EXISTS: two traps sit under the week-plan feature, and both destroy data quietly rather
   than failing loudly, which is the kind that reaches a phone.
     1. `writePlan` REBUILDS state.plan from a fixed shape instead of merging, so a field it does not
        name is wiped by the next write. Saved plans would have vanished the first time a meal was
        added — not when saving, which is what makes it nasty.
     2. Entry ids are minted from Date.now(), and applying a week writes seven of them in the same
        millisecond. Sharing one id means removing a single chip removes the whole week, because
        planRemoveEntry filters by id.
   Neither is visible in a screenshot, so both are checked here by doing the thing that would break.

   WHAT THESE CHECKS HAVE TO PROVE:
   - tsp and tbsp survive BOTH directions untouched, and nothing is ever converted INTO a spoon —
     the second half is what stops the same problem coming back facing the other way;
   - the other conversions still work, so this did not turn the feature off;
   - a saved plan survives a later edit to the plan (trap 1);
   - an applied week's meals can be removed one at a time (trap 2);
   - a plan saved on one week lands on the matching WEEKDAYS of another;
   - clearing empties the week on screen and NOT the neighbouring ones;
   - applying replaces rather than merges, so the same plan applied twice is not doubled.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.77: each page's nav carries its own ids.
   - v1.85: plan chips are pointer-event driven; element.click() from page.evaluate fires nothing.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v1.94: prompt()/confirm() block the page — a dialog handler must be armed BEFORE the tap. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* A meal on Monday and Wednesday of THIS week, with a weight on the recipe so the spoon rule can be
   read off a real chip rather than only from the helper. */
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7));
  const k=x=>{ const y=new Date(d.getTime()+x*86400000);
    return y.getFullYear()+"-"+String(y.getMonth()+1).padStart(2,"0")+"-"+String(y.getDate()).padStart(2,"0"); };
  const cats=[{id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}];
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{ days:{ [k(0)]:[{id:"peA",kind:"food",name:"Bolognese",emoji:"",cat:"meat"}],
                  [k(2)]:[{id:"peB",kind:"food",name:"Fish pie",emoji:"",cat:"meat"}] },
           recipes:[{ id:"r1", name:"Goulash", emoji:"",
                      ing:[{name:"butter",cat:"meat",qty:1,weight:"2 tbsp"},
                           {name:"beef",cat:"meat",qty:1,weight:"2 lb"}] }] } }));
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
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
    await tap('#planNav, #planNavP, #planNavS');
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(650); };
  /* prompt()/confirm() block until answered, so arm the handler BEFORE the tap that raises it. */
  const answering = (reply)=>{ const h=d=>{ if(reply===false) d.dismiss(); else d.accept(typeof reply==='string'?reply:''); };
    page.once('dialog', h); };
  const week = ()=>page.evaluate(()=>[...document.querySelectorAll('.planday')].map(d=>({
    day:(d.querySelector('.pdname')||{}).textContent||'',
    meals:[...d.querySelectorAll('.pchip')].map(c=>(c.querySelector('.pcname')||c).textContent.trim()) })));
  const mealsOf = async()=>(await week()).flatMap(d=>d.meals);
  const openSheet = async()=>{ await tap('#pwMore'); };
  const closeSheet = async()=>{ await page.evaluate(()=>{ const b=document.querySelector('#pwBg'); if(b) b.click(); });
    await page.waitForTimeout(500); };
  const setUnits = async(mode)=>{ await tap('#setNav, #setNavP, #setNavS');
    await tap(`[data-opt-units="${mode}"]`); await page.waitForTimeout(350);
    await tap('#planNavS, #planNavP, #planNav'); };

  try{
    await mk();

    /* ── A. spoons, both directions ─────────────────────────────────────── */
    /* Read off the real recipe chips, not the helper — a rule that holds in a unit test and not in
       the sheet the person is looking at has not actually been applied. */
    const ingAmts = async()=>{ await tap('.pdmore'); await tap('#pmRecipe');
      await page.evaluate(()=>{ const b=document.querySelector('[data-precipe]'); if(b) b.click(); });
      await page.waitForTimeout(500);
      const a=await page.evaluate(()=>[...document.querySelectorAll('#paSheet .pchip')]
        .map(c=>((c.querySelector('.pcamt')||{}).textContent||'').trim()));
      await page.evaluate(()=>{ const b=document.querySelector('#paBg'); if(b) b.click(); });
      await page.waitForTimeout(500); return a; };

    await setUnits('metric');
    let amts = await ingAmts();
    ok('under Metric a tablespoon is left exactly as the recipe wrote it',
       amts.includes('2 tbsp'), JSON.stringify(amts));
    ok('…while a pound is still converted, so the feature is not simply off',
       amts.some(a=>/905 g/.test(a)), JSON.stringify(amts));

    await setUnits('imperial');
    amts = await ingAmts();
    ok('under Imperial a tablespoon is still left alone', amts.includes('2 tbsp'), JSON.stringify(amts));
    ok('…and nothing is converted INTO a spoon', !amts.some(a=>/tbsp|tsp/.test(a) && !/^2 tbsp$/.test(a)),
       JSON.stringify(amts));
    await setUnits('off');

    /* ── B. save the week, and survive a later edit (trap 1) ───────────── */
    await openSheet();
    const before = await page.evaluate(()=>({
      save:!!document.querySelector('#pwSave'), clear:!!document.querySelector('#pwClear'),
      saveOff:(document.querySelector('#pwSave')||{}).disabled }));
    ok('the week offers save and clear, enabled when there is something to act on',
       before.save && before.clear && before.saveOff===false, JSON.stringify(before));
    answering('My usual week');
    await tap('#pwSave');
    await page.waitForTimeout(500);
    /* TEST BUG, v1.97: this asserted the list without reopening. Saving CLOSES the sheet — the
       action is finished, so leaving it up would be the odd choice — and the app was right while
       the check was wrong, which is the direction that wastes the most time. Reopen, then look. */
    await openSheet();
    ok('…and the saved plan is listed by name',
       (await page.evaluate(()=>[...document.querySelectorAll('[data-pwapply]')].map(b=>b.textContent.trim())))
         .includes('My usual week'), '');
    await closeSheet();

    /* THE TRAP: writePlan rebuilds state.plan, so a later edit is what would destroy `saved` —
       not the save itself. Add a meal, then look again. */
    await tap('.planday .pdmore');
    await page.evaluate(()=>{ const b=document.querySelector('#pmFood'); if(b) b.click(); });
    await page.waitForTimeout(500);
    await page.fill('#paName, #paIngIn, input', 'Tacos');
    await page.evaluate(()=>{ const g=document.querySelector('#paGo'); if(g) g.click(); });
    await page.waitForTimeout(700);
    await openSheet();
    const stillThere = await page.evaluate(()=>[...document.querySelectorAll('[data-pwapply]')].map(b=>b.textContent.trim()));
    ok('a saved plan survives the next edit to the plan (writePlan carries it)',
       stillThere.includes('My usual week'), JSON.stringify(stillThere));
    await closeSheet();

    /* ── C. apply to another week, on the matching weekdays ────────────── */
    await tap('#pwNext');
    ok('next week starts empty', (await mealsOf()).length===0, JSON.stringify(await mealsOf()));
    await openSheet();
    await page.evaluate(()=>{ const b=document.querySelector('[data-pwapply]'); if(b) b.click(); });
    await page.waitForTimeout(800);
    const applied = await week();
    ok('applying puts the meals on the matching weekdays of the week on screen',
       /Monday/i.test(applied[0].day) && applied[0].meals.some(m=>/Bolognese/i.test(m))
       && applied[2].meals.some(m=>/Fish pie/i.test(m)),
       JSON.stringify(applied.map(d=>({d:d.day,m:d.meals}))));

    /* THE SECOND TRAP: seven entries minted in one millisecond. If they share an id, removing one
       chip removes the lot — so remove one and count what is left. */
    const beforeRm = (await mealsOf()).length;
    await tap('.planday .pchip');
    await page.evaluate(()=>{ const b=document.querySelector('#ppDel'); if(b) b.click(); });
    await page.waitForTimeout(800);
    const afterRm = (await mealsOf()).length;
    ok('removing one meal from an applied week removes exactly one (ids are unique)',
       afterRm===beforeRm-1 && afterRm>0, JSON.stringify({before:beforeRm, after:afterRm}));

    /* Applying REPLACES: the same plan twice must not double the week. */
    await openSheet();
    answering(true);
    await page.evaluate(()=>{ const b=document.querySelector('[data-pwapply]'); if(b) b.click(); });
    await page.waitForTimeout(900);
    ok('applying the same plan again replaces rather than doubles it',
       (await mealsOf()).length===beforeRm, JSON.stringify(await mealsOf()));

    /* ── D. clearing takes this week only ──────────────────────────────── */
    await openSheet();
    answering(true);
    await tap('#pwClear');
    await page.waitForTimeout(800);
    ok('clearing empties the week on screen', (await mealsOf()).length===0, JSON.stringify(await mealsOf()));
    await tap('#pwPrev');
    ok('…and leaves the neighbouring week alone', (await mealsOf()).length>0, JSON.stringify(await mealsOf()));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
