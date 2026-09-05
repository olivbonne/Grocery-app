/* v1.84 — the Plan tab's add flow: the day's button is a +, the add sheet sits on top of the keyboard,
   what you type is matched against the app's own items, picking a saved recipe fills the form instead of
   adding and closing, and a press-and-hold on a recipe opens it for editing.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a control exists":
   - the sheet is ABOVE the keyboard. Headless Chromium has no keyboard, so visualViewport is replaced
     with a controllable double installed before the app boots — the app's own pinning code runs for
     real against it. Testing this by eye on a phone is the only alternative, and it does not regress-test;
   - typing offers the app's real items, and picking one carries its CATEGORY through to the day and on
     to the shopping list — "uses the regular items" means the item, not the word;
   - picking a saved recipe fills the name AND shows the ingredients, and stays put: the whole point is
     to read and change what is about to be added before it is added;
   - a press-and-hold on a recipe edits the recipe itself, and the new name follows it onto EVERY day it
     is on — that is why entries render through recipeById() rather than their own stored name;
   - a press-and-hold on a food does what a tap does, because food has nothing behind it to edit;
   - recipes written before this version (ingredients as plain strings) still open, still edit, still add.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent.
   - v1.83: not every action closes its sheet — dismiss explicitly rather than assuming.
   - v1.85 put a review sheet between "add the ingredients" and the list; the check below confirms it
     and then commits. See the SUPERSEDED note there. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* A controllable visualViewport, installed before the module runs so the app registers its real
   resize/scroll listeners against it. window.__kb(px) shrinks the visible strip and fires resize,
   which is exactly what an opening keyboard does. */
const FAKE_VV = `(() => {
  const ls={};
  const vv={ get width(){ return window.innerWidth; }, height: window.innerHeight, offsetTop:0, offsetLeft:0, scale:1,
    addEventListener:(t,f)=>{ (ls[t]=ls[t]||[]).push(f); },
    removeEventListener:(t,f)=>{ ls[t]=(ls[t]||[]).filter(x=>x!==f); } };
  try{ Object.defineProperty(window,"visualViewport",{ value:vv, configurable:true }); }catch(e){}
  window.__kb=(px)=>{ vv.height = window.innerHeight - (px||0); (ls.resize||[]).forEach(f=>{ try{ f(); }catch(e){} }); return vv.height; };
})()`;

const SEED = (extra)=>`(() => {
  if(localStorage.getItem("ml_me")) return;   // idempotent: a reload must not overwrite what the app saved
  const items=[];
  for(let n=0;n<3;n++) items.push({id:"i"+n,name:"seed"+n,qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:null, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
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
    await page.addInitScript(FAKE_VV);
    await page.addInitScript(SEED(extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
    await page.locator('#planNav').click(); await page.waitForTimeout(900);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(800); };
  const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
    await page.mouse.move(b.x+b.width/2, b.y+b.height/2);
    await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
    await page.waitForTimeout(800); };
  const openDay = async(i, which)=>{ await page.locator('.planday').nth(i).locator('[data-pd]').click();
    await page.waitForTimeout(700); await tap(which==='recipe' ? '#pmRecipe' : '#pmFood'); };
  const dayChips = (i)=>page.evaluate(n=>[...document.querySelectorAll('.planday')][n]
    ? [...[...document.querySelectorAll('.planday')][n].querySelectorAll('.pchip')].map(c=>c.textContent.trim()) : null, i);
  const addSheet = ()=>page.evaluate(()=>{
    const s=document.querySelector('#paSheet'); if(!s) return { open:false };
    return { open:true, head:(s.querySelector('.disp')||{}).textContent,
             name:(document.querySelector('#paName')||{}).value,
             hasIng:!!document.querySelector('#paIngIn'),
             go:(document.querySelector('#paGo')||{}).textContent,
             picks:[...s.querySelectorAll('[data-precipe]')].map(b=>b.textContent.trim()),
             sug:[...s.querySelectorAll('[data-psug]')].map(b=>b.textContent.trim()),
             ing:[...s.querySelectorAll('[data-pingrm]')].map(b=>b.textContent.replace(/×/g,'').trim()) };
  });

  try{
    /* ── 1. the + ───────────────────────────────────────────────────────── */
    await mk();
    const more = await page.evaluate(()=>{
      const b=document.querySelector('.pdmore');
      return b ? { text:b.textContent.trim(), svg:b.querySelectorAll('svg').length,
                   w:Math.round(b.getBoundingClientRect().width) } : null; });
    ok('the day\'s button is a +, not three dots', more && more.text==='+' && more.svg===0, JSON.stringify(more));
    ok('…and it is still a real target', more && more.w>=36, JSON.stringify({w:more&&more.w}));

    /* ── 2. the sheet sits on top of the keyboard ───────────────────────── */
    await openDay(1,'food');
    let s = await addSheet();
    ok('precondition: the Add food sheet is open', s.open===true && /Add food/.test(s.head||''), s.head);
    const before = await page.evaluate(()=>Math.round(document.querySelector('#paSheet').getBoundingClientRect().bottom));
    await page.locator('#paName').focus();
    await page.waitForTimeout(300);
    const kb = await page.evaluate(()=>window.__kb(336));      // a keyboard opens over the bottom 336px
    await page.waitForTimeout(500);
    const after = await page.evaluate(()=>{
      const el=document.querySelector('#paSheet'); const r=el.getBoundingClientRect();
      return { bottom:Math.round(r.bottom), top:Math.round(r.top), visible:window.innerHeight-336 }; });
    ok('precondition: the sheet sat at the bottom of the screen before the keyboard', before>=800, String(before));
    ok('the sheet lifts to sit ON TOP of the keyboard, not behind it',
       after.bottom <= after.visible+2, JSON.stringify({...after, vvHeight:kb}));
    ok('…and its top is still on screen, so it is not pushed off', after.top>=0, JSON.stringify(after));
    await page.evaluate(()=>window.__kb(0));
    await page.waitForTimeout(400);
    const back = await page.evaluate(()=>Math.round(document.querySelector('#paSheet').getBoundingClientRect().bottom));
    ok('…and it settles back when the keyboard goes away', Math.abs(back-before)<=2, JSON.stringify({before, back}));

    /* ── 3. food is matched against the app's own items ─────────────────── */
    await page.locator('#paName').fill('mil');
    await page.waitForTimeout(500);
    s = await addSheet();
    ok('typing a food offers the app\'s regular items', s.sug.length>0, JSON.stringify(s.sug.slice(0,4)));
    const picked = (s.sug[0]||'').replace(/^[^A-Za-z]+/,'').trim();
    ok('precondition: a suggestion has a name to pick', picked.length>0, JSON.stringify(s.sug[0]));
    await tap('[data-psug]');
    let chips = await dayChips(1);
    ok('picking one puts it on the day', (chips||[]).length===1, JSON.stringify(chips));
    ok('…under its real name', new RegExp(picked,'i').test((chips||[])[0]||''), JSON.stringify({chips, picked}));
    /* Names picked from the app's dictionary arrive lowercase ("milk"); every other item label in the
       app is title-cased, and a chip reading "milk" beside "Leftovers" looks like a bug because it is one. */
    ok('…and title-cased like every other item label', /[A-Z]/.test(((chips||[])[0]||'').replace(/[^A-Za-z]/g,'').charAt(0)),
       JSON.stringify(chips));
    const carried = await page.evaluate(()=>{
      const p=JSON.parse(localStorage.getItem('ml_cache_v101')).plan;
      const k=Object.keys(p.days)[0]; return p.days[k][0]; });
    ok('…carrying the item\'s category, not just its text', !!carried.cat, JSON.stringify(carried));

    /* ── 4. typed free text still works ─────────────────────────────────── */
    await openDay(2,'food');
    await page.locator('#paName').fill('Leftovers');
    await tap('#paGo');
    chips = await dayChips(2);
    ok('a name the app does not know is still addable', (chips||[]).some(c=>/Leftovers/.test(c)), JSON.stringify(chips));

    /* ── 5. a recipe, built out of regular items ────────────────────────── */
    await openDay(3,'recipe');
    s = await addSheet();
    ok('the recipe sheet has a name field and an ingredient field', s.hasIng===true && /Add recipe/.test(s.head||''), s.head);
    await page.locator('#paName').fill('Bolognese');
    await page.locator('#paIngIn').fill('mil');
    await page.waitForTimeout(500);
    s = await addSheet();
    ok('typing an ingredient offers the app\'s regular items too', s.sug.length>0, JSON.stringify(s.sug.slice(0,3)));
    await tap('[data-psug]');
    s = await addSheet();
    ok('picking one becomes an ingredient of the recipe', s.ing.length===1, JSON.stringify(s.ing));
    ok('…and the sheet stays open, with the name kept', s.open===true && s.name==='Bolognese', JSON.stringify({open:s.open,name:s.name}));
    await page.locator('#paIngIn').fill('Oregano');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    s = await addSheet();
    ok('…and so does a typed one', s.ing.length===2 && /Oregano/i.test(s.ing.join('|')), JSON.stringify(s.ing));
    await tap('[data-pingrm]');
    s = await addSheet();
    ok('…and an ingredient can be taken back off', s.ing.length===1, JSON.stringify(s.ing));
    await page.locator('#paIngIn').fill('Beef mince');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await tap('#paGo');
    chips = await dayChips(3);
    ok('adding puts the recipe on the day', (chips||[]).some(c=>/Bolognese/.test(c)), JSON.stringify(chips));

    /* ── 6. picking a saved recipe FILLS the form, and stays ────────────── */
    await openDay(5,'recipe');
    s = await addSheet();
    ok('a saved recipe is offered on another day', s.picks.some(p=>/Bolognese/.test(p)), JSON.stringify(s.picks));
    await tap('[data-precipe]');
    s = await addSheet();
    ok('picking it does NOT return to the plan', s.open===true, JSON.stringify({open:s.open}));
    ok('…it fills the name', s.name==='Bolognese', JSON.stringify({name:s.name}));
    ok('…and shows the ingredients it will add', s.ing.length===2, JSON.stringify(s.ing));
    ok('precondition: it has not been added to the day yet', ((await dayChips(5))||[]).length===0,
       JSON.stringify(await dayChips(5)));
    await tap('#paGo');
    ok('…and only then does it land on the day', ((await dayChips(5))||[]).some(c=>/Bolognese/.test(c)),
       JSON.stringify(await dayChips(5)));

    /* ── 7. press-and-hold edits the recipe ─────────────────────────────── */
    await hold(page.locator('.planday').nth(3).locator('.pchip').first());
    s = await addSheet();
    ok('holding a recipe opens the recipe itself', s.open===true && /Edit recipe/.test(s.head||''), s.head);
    ok('…prefilled with its name and ingredients', s.name==='Bolognese' && s.ing.length===2, JSON.stringify({n:s.name,i:s.ing}));
    ok('…and the button saves rather than adds', /Save/i.test(s.go||''), s.go);
    ok('…and it does not offer to pick a different recipe while editing one', s.picks.length===0, JSON.stringify(s.picks));
    await page.locator('#paName').fill('Spag bol');
    await tap('#paGo');
    const d3 = await dayChips(3), d5 = await dayChips(5);
    ok('renaming the recipe renames it on EVERY day it is on',
       (d3||[]).some(c=>/Spag bol/.test(c)) && (d5||[]).some(c=>/Spag bol/.test(c)), JSON.stringify({d3,d5}));
    ok('…without adding a second copy anywhere', (d3||[]).length===1 && (d5||[]).length===1, JSON.stringify({d3,d5}));

    /* ── 8. holding a FOOD offers its actions, since there is nothing to edit ── */
    await hold(page.locator('.planday').nth(2).locator('.pchip').first());
    const pick = await page.evaluate(()=>{ const s=document.querySelector('#ppSheet');
      return s ? { open:true, actions:[...s.querySelectorAll('.optaction')].map(b=>b.textContent.trim()) } : { open:false }; });
    ok('holding a food opens its actions, not an editor', pick.open===true && pick.actions.length===2, JSON.stringify(pick));
    ok('…and no recipe editor came up', (await page.locator('#paSheet').count())===0);

    /* ── 9. ingredients reach the list as real items ────────────────────── */
    await tap('#ppBg');   // dismiss, then act on the recipe instead
    await page.waitForTimeout(400);
    const itemsBefore = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.length);
    await page.locator('.planday').nth(3).locator('.pchip').first().click();
    await page.waitForTimeout(700);
    /* SUPERSEDED by v1.85: "add the ingredients" opens a review sheet now, where any of them can be
       turned off before anything is written. The category check below is the point of this pair and is
       unchanged — it just has to press through the review to get there. */
    await tap('#ppList');
    ok('…by way of the review sheet, not straight onto the list (v1.85)',
       (await page.locator('#smartSheetEl').count())===1, String(await page.locator('#smartSheetEl').count()));
    await tap('#smartConfirm');
    const added = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.slice(-2));
    ok('a recipe\'s ingredients go onto the shopping list',
       (await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.length))===itemsBefore+2,
       JSON.stringify({before:itemsBefore, added:added.map(i=>i.name)}));
    ok('…each with a category, so it lands in the right aisle',
       added.every(i=>!!i.cat), JSON.stringify(added.map(i=>({n:i.name,c:i.cat}))));

    /* ── 10. a recipe written before v1.84 still works ──────────────────── */
    /* v1.82/v1.83 stored ingredients as plain strings. Those documents are on real devices. */
    await mk(`(()=>{ const c=JSON.parse(localStorage.getItem("ml_cache_v101"));
      c.plan={ days:{}, recipes:[{id:"old1",name:"Old stew",emoji:"",ing:["onion","stock"]}] };
      localStorage.setItem("ml_cache_v101", JSON.stringify(c)); })();`);
    await openDay(0,'recipe');
    await tap('[data-precipe]');
    s = await addSheet();
    ok('a recipe saved with plain-string ingredients still opens', s.name==='Old stew' && s.ing.length===2, JSON.stringify(s));
    await tap('#paGo');
    ok('…and still adds', ((await dayChips(0))||[]).some(c=>/Old stew/.test(c)), JSON.stringify(await dayChips(0)));
    await hold(page.locator('.planday').nth(0).locator('.pchip').first());
    s = await addSheet();
    ok('…and still edits', /Edit recipe/.test(s.head||'') && s.ing.length===2, JSON.stringify({h:s.head,i:s.ing}));
    await page.evaluate(()=>{ const b=document.querySelector('#paBg'); if(b) b.click(); });
    await page.waitForTimeout(500);

    /* ── 11. the page itself is unchanged ───────────────────────────────── */
    ok('the week is still seven days', (await page.locator('.planday').count())===7,
       String(await page.locator('.planday').count()));
    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
