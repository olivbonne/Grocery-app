/* v1.85 — the shop page's floating bar is a +, and a planned recipe's ingredients go through a review
   sheet you can deselect from before anything is written to the list.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a control exists":
   - the pill is a + and nothing else, and it still opens the add sheet — the id four other suites click
     has to survive, and so does the pill's shape, because every v1.78 geometry setting hangs off it;
   - the review sheet is a SELECTION, not a removal: a row can be turned off AND back on, "Deselect all"
     flips to "Select all", and the button counts what is actually selected rather than what was parsed;
   - only the selected rows reach the list — the whole point is the things already in the cupboard;
   - the sheet is rendered on the PLAN page, not only on the shop page. smartSheet() was rendered by
     renderMain() alone; v1.81 and v1.83 both shipped a control whose sheet was not rendered where it
     was opened from, so this is checked on the page that opens it;
   - a single planned food still goes straight on: one item does not need a review;
   - Smart add's own flow still works through the same sheet, with the API stubbed, because the checkbox
     replaced a button that flow depended on.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent.
   - v1.83: not every action closes its sheet — dismiss explicitly rather than assuming.
   - v1.84: headless has no keyboard and no backend; fake the platform, drive the app.
   - v1.85 (this suite): plan chips are driven by pointerdown/pointerup (v1.84 gave them a press-and-hold),
     so an element.click() from inside page.evaluate fires nothing at all. Drive them through a real
     Playwright click, which dispatches the pointer events. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* One list with a recipe already planned on Monday, so the review path has something real to review. */
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7));
  const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const items=[]; for(let n=0;n<2;n++) items.push({id:"i"+n,name:"seed"+n,qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:null, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{ days:{ [k]:[ {id:"pe1",kind:"recipe",name:"Goulash",emoji:"",rid:"pr1"},
                        {id:"pe2",kind:"food",name:"Leftovers",emoji:"",cat:"others"} ] },
           recipes:[ {id:"pr1",name:"Goulash",emoji:"",
                      ing:[{name:"ground beef",cat:"meat"},{name:"onion",cat:"vegetable"},
                           {name:"tomato sauce",cat:"others"},{name:"paprika",cat:"others"}]} ] } }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

const PARSE_STUB = JSON.stringify({ items:[
  { name:"oat milk", qty:2, category:"fresh" },
  { name:"free range eggs", qty:12, category:"fresh" },
  { name:"sourdough", qty:1, category:"bulk" } ] });

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async()=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    /* There is no backend in this environment, so Smart add's endpoint is stubbed. The app's own
       request, response handling, review sheet and commit all run for real against it. */
    await ctx.route('**/api/parse', r => r.fulfill({ status:200, contentType:'application/json', body: PARSE_STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(850); };
  const review = ()=>page.evaluate(()=>{
    const s=document.querySelector('#smartSheetEl'); if(!s) return { open:false };
    return { open:true,
      title:(s.querySelector('.disp')||{}).textContent,
      hd:(s.querySelector('.smarthd .lbl')||{}).textContent,
      sub:(s.querySelectorAll('.disp')[0] && s.children[1]) ? s.children[1].textContent : "",
      servings:!!s.querySelector('.servrow'),
      toggle:(document.querySelector('#smartToggleAll')||{}).textContent,
      confirm:(document.querySelector('#smartConfirm')||{}).textContent,
      disabled:!!(document.querySelector('#smartConfirm')||{}).disabled,
      rows:[...s.querySelectorAll('.smartchip')].map(c=>({
        name:(c.querySelector('.smartchip-name')||{}).textContent,
        on:!!(c.querySelector('.smartcheck.on')),
        dim:c.classList.contains('off') })),
      oldRemove:s.querySelectorAll('[data-smart-rm]').length };
  });
  const listNames = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.map(i=>i.name.toLowerCase()));

  try{
    /* ── 1. the pill is a + ─────────────────────────────────────────────── */
    await mk();
    const pill = await page.evaluate(()=>{
      const b=document.querySelector('#shopAddFab'); if(!b) return null;
      const r=b.getBoundingClientRect();
      return { text:b.textContent.trim(), svg:b.querySelectorAll('svg').length,
               ph:b.querySelectorAll('.addpill-ph').length, cls:b.className,
               w:Math.round(r.width), h:Math.round(r.height) };
    });
    ok('the floating bar is a +', pill && pill.text==='+', JSON.stringify(pill));
    ok('…with the magnifier and the words gone', pill && pill.svg===0 && pill.ph===0, JSON.stringify(pill));
    ok('…still the same pill, so its size/position/colour settings still apply',
       pill && /\baddpill\b/.test(pill.cls) && pill.w>200 && pill.h>=40, JSON.stringify(pill));
    await tap('#shopAddFab');
    ok('…and it still opens the add sheet', (await page.locator('#addSheet').count())===1,
       String(await page.locator('#addSheet').count()));

    /* ── 2. Smart add still works through the shared sheet ──────────────── */
    await page.locator('#mainInput').fill('milk, eggs, bread');
    await tap('#smartBtn');
    await page.waitForTimeout(1200);
    let r = await review();
    ok('Smart add opens the review sheet', r.open===true, JSON.stringify({open:r.open}));
    ok('…with a row per parsed item, all selected', r.rows.length===3 && r.rows.every(x=>x.on),
       JSON.stringify(r.rows.map(x=>({n:x.name,on:x.on}))));
    ok('…and the per-row × is gone, replaced by the checkbox', r.oldRemove===0, String(r.oldRemove));
    ok('…and the button counts them', /Add 3 items/.test(r.confirm||''), r.confirm);

    /* ── 3. selection is a toggle, both ways ────────────────────────────── */
    await tap('[data-smart-sel]');
    r = await review();
    ok('unchecking a row dims it and drops the count',
       r.rows[0].on===false && r.rows[0].dim===true && /Add 2 items/.test(r.confirm||''),
       JSON.stringify({row0:r.rows[0], confirm:r.confirm}));
    await tap('[data-smart-sel]');
    r = await review();
    ok('…and checking it again brings it back', r.rows[0].on===true && /Add 3 items/.test(r.confirm||''),
       JSON.stringify({row0:r.rows[0], confirm:r.confirm}));
    await tap('#smartToggleAll');
    r = await review();
    ok('"Deselect all" turns every row off', r.rows.every(x=>x.on===false), JSON.stringify(r.rows.map(x=>x.on)));
    ok('…the button says nothing will be added, and cannot be pressed',
       /Add 0 items/.test(r.confirm||'') && r.disabled===true, JSON.stringify({c:r.confirm, d:r.disabled}));
    ok('…and it offers the way back', /Select all/i.test(r.toggle||''), r.toggle);
    await tap('#smartToggleAll');
    r = await review();
    ok('"Select all" turns them back on', r.rows.every(x=>x.on===true) && /Deselect all/i.test(r.toggle||''),
       JSON.stringify({rows:r.rows.map(x=>x.on), toggle:r.toggle}));

    /* ── 4. only the selected rows are written ──────────────────────────── */
    const before = await listNames();
    await tap('[data-smart-sel]');                       // drop the first one
    r = await review();
    ok('precondition: exactly one row is deselected', r.rows.filter(x=>!x.on).length===1,
       JSON.stringify(r.rows.map(x=>x.on)));
    const dropped = (r.rows[0].name||'').toLowerCase();
    await tap('#smartConfirm');
    const after = await listNames();
    ok('confirming adds only what was selected', after.length===before.length+2,
       JSON.stringify({before:before.length, after}));
    ok('…and the deselected one is not on the list',
       !after.some(n=>dropped.includes(n) && n.length>3), JSON.stringify({dropped, after}));

    /* ── 5. a planned recipe goes to review, from the Plan page ─────────── */
    await mk();
    await tap('#planNav');
    await page.locator('.pchip').filter({ hasText:'Goulash' }).first().click();
    await page.waitForTimeout(800);
    const btn = await page.evaluate(()=>{ const s=document.querySelector('#ppSheet');
      return s ? [...s.querySelectorAll('.optaction')].map(b=>b.textContent.trim()) : null; });
    ok('precondition: a planned recipe offers its ingredients', !!btn, JSON.stringify(btn));
    ok('…and the button says it is a review, not an add', /Review 4 ingredients/.test((btn||[])[0]||''),
       JSON.stringify(btn));
    await tap('#ppList');
    r = await review();
    ok('the review sheet opens ON THE PLAN PAGE', r.open===true && (await page.locator('.planweek').count())===1,
       JSON.stringify({open:r.open, plan:await page.locator('.planweek').count()}));
    ok('…titled with the recipe', /Goulash/.test(r.title||''), r.title);
    ok('…one row per ingredient, all selected', r.rows.length===4 && r.rows.every(x=>x.on),
       JSON.stringify(r.rows.map(x=>x.name)));
    ok('…and it says what the list is for', /Items to add/i.test(r.hd||''), r.hd);
    /* The servings scaler belongs to Smart add's recipe parse, which knows how many a recipe serves.
       A recipe out of the plan's own book does not, so the sheet must not offer to "set servings". */
    ok('…and does not promise a servings control it is not showing',
       r.servings===false && !/set servings/i.test(r.sub||''), JSON.stringify({servings:r.servings, sub:r.sub}));

    const b2 = await listNames();
    await tap('[data-smart-sel]');                       // "already have the beef"
    await tap('#smartConfirm');
    const a2 = await listNames();
    ok('only the ingredients left checked are written', a2.length===b2.length+3,
       JSON.stringify({before:b2.length, after:a2}));
    ok('…and the one turned off is not among them', !a2.includes('ground beef'), JSON.stringify(a2));

    /* ── 6. a single planned food needs no review ───────────────────────── */
    const b3 = await listNames();
    await page.locator('.pchip').filter({ hasText:'Leftovers' }).first().click();
    await page.waitForTimeout(800);
    const foodBtn = await page.evaluate(()=>{ const s=document.querySelector('#ppSheet');
      return s ? [...s.querySelectorAll('.optaction')].map(b=>b.textContent.trim()) : null; });
    ok('precondition: the food entry offers its actions', !!foodBtn, JSON.stringify(foodBtn));
    ok('…phrased as an add, since there is nothing to review', /Add to the shopping list/i.test((foodBtn||[])[0]||''),
       JSON.stringify(foodBtn));
    await tap('#ppList');
    const a3 = await listNames();
    ok('a single planned food goes straight onto the list', a3.length===b3.length+1, JSON.stringify({b3:b3.length, a3}));
    ok('…without a review sheet', (await page.locator('#smartSheetEl').count())===0,
       String(await page.locator('#smartSheetEl').count()));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
