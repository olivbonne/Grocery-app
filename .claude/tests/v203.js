/* v2.03 — Add recipe is two steps: choose, then the recipe. No keyboard until a box is tapped.

   WHY THIS EXISTS: the household's screenshots showed the Add recipe sheet opening with the keyboard
   already up over it (the name field took focus on open), under a screen of eleven things: four
   start buttons, a search, nine saved-recipe chips each with its own ×, four meal slots, a name,
   servings, an ingredient box and the commit. The fix is a claim about what is on screen at each
   moment, so each check reads what is actually there.

   WHAT THESE CHECKS HAVE TO PROVE:
   - opening the sheet focuses nothing — no keyboard;
   - the first step is a choice: saved recipes as rows (six, then "Show all"), the new-recipe starts,
     and nothing from the form (no name box, no meal slots, no commit);
   - the choice step has no commit-coloured button; the form has exactly one;
   - deleting is behind "Edit", not a × on every recipe;
   - picking a recipe lands on the form, filled, still with no focused field;
   - Back returns to the choice without losing what was typed; "Write it yourself" opens an empty form;
   - a search replaces the recipe list rather than stacking under it, and has its own way back;
   - adding still puts the recipe on the day;
   - Add food is untouched: its name box still takes focus, because typing is all it asks for.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.77: each page's nav carries its own ids.  v1.86: dismiss before opening the next thing.
   - v1.91: assert WHICH value appeared.  v2.00: the seed returns early once seeded. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const NAMES=["Chicken in soya sauce with choysum","quesadillas","Pad Thai","onion soup","Vietnamese Chicken Salad",
             "Seafood Spaghetti","Traditional Basque Burnt Cheesecake","mushrooms pizza","40 cloves garlic chicken"];
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const recipes=${JSON.stringify(NAMES)}.map((n,i)=>({id:"r"+i,name:n,emoji:"",servings:4,src:i===2?"https://example.com/pad-thai":"",steps:[],
    ing:[{name:"garlic",cat:"vegetable",qty:1,weight:""},{name:"chicken",cat:"meat",qty:1,weight:"1 kg"}]}));
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"],
    categories:[{id:"meat",label:"Meat",color:"#B5402B",emoji:"🥩",subs:[]},{id:"vegetable",label:"Vegetable",color:"#3E7C3A",emoji:"🥦",subs:[]}],
    name:"Sandbox", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes,saved:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]");
})()`;
const IDEAS = { source:"model", provider:"", results:[{ title:"Mushroom pizza", url:"", site:"", note:"Earthy" }] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
  await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
  await ctx.route('**/api/recipe-search', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(IDEAS) }));
  const page = await ctx.newPage(); page.setDefaultTimeout(9000);
  page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  await page.addInitScript(SEED);
  await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1600);
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(550); };
  const focusedField = ()=>page.evaluate(()=>{ const a=document.activeElement; return (a && /INPUT|TEXTAREA/.test(a.tagName)) ? (a.id||a.tagName) : null; });
  const accentButtons = ()=>page.evaluate(()=>{ const s=document.querySelector('#paSheet'); if(!s) return null;
    return [...s.querySelectorAll('button')].filter(b=>{ const m=getComputedStyle(b).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      return m && Math.abs(+m[1]-226)<40 && Math.abs(+m[2]-80)<45 && Math.abs(+m[3]-44)<45; }).map(b=>b.id||b.textContent.trim().slice(0,20)); });
  const has = (sel)=>page.evaluate(s=>!!document.querySelector(s), sel);

  try{
    await tap('#planNav, #planNavP'); await tap('.pdmore'); await tap('#pmRecipe');

    /* ── A. opening: a choice, no keyboard ─────────────────────────────── */
    ok('opening Add recipe focuses nothing, so no keyboard comes up', (await focusedField())===null, String(await focusedField()));
    const rows = await page.evaluate(()=>[...document.querySelectorAll('.precrow')].map(b=>b.textContent.trim()));
    /* SUPERSEDED by v2.05: recipes are now listed A–Z by default (the household asked for A–Z or by
       course), so the first row is the alphabetically first, not the first saved. Still protected: rows,
       and six before "Show all". */
    ok('saved recipes are rows, six at first, A–Z', rows.length===6 && rows[0]==="40 cloves garlic chicken", JSON.stringify(rows));
    ok('…with a way to see the rest', /Show all 9 recipes/.test(await page.locator('#paAllRec').textContent().catch(()=>'')), '');
    ok('the choice step has no form in it — no name box, no meal slots, no commit',
       !(await has('#paName')) && !(await has('.slotseg')) && !(await has('#paGo')), '');
    ok('…and no button in the commit colour', JSON.stringify(await accentButtons())==='[]', JSON.stringify(await accentButtons()));
    ok('no recipe carries a delete × until Edit is tapped', !(await has('[data-precdel]')), '');
    const fits = await page.evaluate(()=>{ const w=document.querySelector('#paWrite'); if(!w) return null;
      const r=w.getBoundingClientRect(); return { bottom:Math.round(r.bottom), vh:innerHeight }; });
    ok('the whole choice fits on one iPhone screen, down to "Write it yourself"', fits && fits.bottom<=fits.vh, JSON.stringify(fits));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-choose.png') });

    await tap('#paAllRec');
    ok('"Show all" shows all nine', (await page.locator('.precrow').count())===9, String(await page.locator('.precrow').count()));
    await tap('#paManage');
    ok('Edit reveals a delete on each recipe', (await page.locator('[data-precdel]').count())===9, String(await page.locator('[data-precdel]').count()));
    await tap('#paManage');
    ok('…and Done hides them again', !(await has('[data-precdel]')), '');

    /* ── B. a search replaces the list and has its own way back ──────── */
    await tap('[data-pimp="search"]');
    ok('Search replaces the recipe list rather than stacking under it', !(await has('.precrow')) && (await has('#paImpVal')), '');
    await page.fill('#paImpVal','mushroom pizza'); await tap('#paImpGo');
    ok('…results arrive', (await page.locator('[data-pres]').count())>0, '');
    await tap('#paBackChoose');
    ok('"Back to your recipes" brings the list back', (await page.locator('.precrow').count())>0 && !(await has('#paImpVal')), '');

    /* ── C. pick a recipe → the form, filled, still no keyboard ───────── */
    await page.locator('.precrow', { hasText:'Pad Thai' }).click(); await page.waitForTimeout(600);
    ok('picking a recipe opens the form with its name', (await page.inputValue('#paName'))==='Pad Thai', await page.inputValue('#paName').catch(()=>''));
    ok('…still with no field focused', (await focusedField())===null, String(await focusedField()));
    ok('…with its ingredients', (await page.locator('#paDyn .pchip').count())===2, String(await page.locator('#paDyn .pchip').count()));
    ok('…and the choice is gone from this step', !(await has('.precrow')) && !(await has('[data-pimp]')), '');
    ok('the form has exactly one commit-coloured button, and it is Add', JSON.stringify(await accentButtons())==='["paGo"]', JSON.stringify(await accentButtons()));
    const from = await page.evaluate(()=>{ const s=document.querySelector('#paSheet'); return s ? s.textContent : ''; });
    ok('…and says where the recipe came from', /From example\.com/.test(from), '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-form.png') });

    await page.fill('#paName','Pad Thai for six');
    await tap('#paBack');
    ok('Back returns to the choice', (await page.locator('.precrow').count())>0 && !(await has('#paName')), '');
    await tap('#paWrite');
    ok('…without losing what was typed', (await page.inputValue('#paName'))==='Pad Thai for six', await page.inputValue('#paName'));
    ok('"Write it yourself" opens the form without raising the keyboard', (await focusedField())===null, String(await focusedField()));

    await tap('#paGo');
    const day = await page.evaluate(()=>[...document.querySelectorAll('[data-pchip]')].map(b=>b.textContent.trim()));
    ok('Add puts it on the day and closes the sheet', !(await has('#paSheet')) && day.some(t=>/Pad Thai for six/i.test(t)), JSON.stringify(day));

    /* ── D. Add food is untouched ─────────────────────────────────────── */
    await tap('.pdmore'); await tap('#pmFood');
    ok('Add food still focuses its name box — typing is all it asks for', (await focusedField())==='paName', String(await focusedField()));
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
