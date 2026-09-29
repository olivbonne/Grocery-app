/* v2.08 — the recipe sheet, rearranged; review sorting; a line weight for the drawings.

   WHY THIS EXISTS: household requests, 2026-09-29.
   - "Show open link and below that the name of link; show ingredients below 'method' with a button
     'ingredients' (remove the edit option but keep sorting options): it wraps all ingredients in there;
     below that rename 'review ingredients' to 'add to shopping list'; in that tab allow to sort by recipe
     order / category but otherwise all remain the same."
   - "The drawings look to be drawn in bold line instead of normal width line; allow option to change
     thickness of line." (Cause: v2.07's icon zoom multiplied the stroke too.)

   WHAT THESE CHECKS HAVE TO PROVE:
   - the sheet reads, top to bottom: Open link, the site's name under it, Method, Ingredients, Add to
     shopping list, Remove — and there is no Edit and no input in it;
   - the ingredients start folded, open under their button, and keep the order choice inside the fold;
   - "Add to shopping list" opens the review, which offers Recipe order / Category; grouped, it shows the
     categories in order, and a row's tick still acts on THAT row (display order ≠ index) — proved by what
     actually lands on the list;
   - Line weight: four steps, published on <html>, a look (not excluded); Fine really draws thinner; and
     at XL a line is drawn at the same weight as at S (the stroke is divided by the zoom);
   - editing a recipe lives in Your recipes › Edit, and the rows say so.

   TEST-BUG NOTES CARRIED FORWARD: v1.86 dismiss before opening; v1.91 assert WHICH value; v2.00 the seed
   returns early once seeded; v2.07 the app reopens on the last page. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const today = new Date(); const TK = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
const PAD = [{name:"rice noodles",cat:"asian",qty:1,weight:"200 g"},{name:"prawns",cat:"meat",qty:1,weight:"300 g"},{name:"eggs",cat:"fresh",qty:2,weight:""},
             {name:"bean sprouts",cat:"vegetable",qty:1,weight:""},{name:"lime",cat:"fruit",qty:1,weight:""}];
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const recipes=[{id:"r2",name:"Pad Thai",emoji:"",servings:4,src:"https://www.recipetineats.com/pad-thai/",steps:["Soak the noodles","Fry"],ing:${JSON.stringify(PAD)}},
                 {id:"r3",name:"Onion soup",emoji:"",servings:4,src:"",steps:[],ing:[{name:"onion",cat:"vegetable",qty:3,weight:""}]}];
  const it=(id,n,c)=>({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[it("1","Croissant","others")],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{days:{"${TK}":[{id:"pe1",kind:"recipe",name:"Pad Thai",emoji:"",rid:"r2",slot:"",serves:0}]},recipes,saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
  await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
  const page = await ctx.newPage(); page.setDefaultTimeout(9000);
  page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  await page.addInitScript(SEED);
  const load = async()=>{ await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
  await load();
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(550); };
  const has = (sel)=>page.evaluate(s=>!!document.querySelector(s), sel);
  const src = fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
  const rx = (name)=>new RegExp(((src.match(new RegExp('const '+name+' = (\\/.*\\/);'))||[])[1]||'//').slice(1,-1));
  const stroke = ()=>page.evaluate(()=>{ const p=[...document.querySelectorAll('.pill')].find(b=>/Croissant/.test(b.textContent));
    const path=p && p.querySelector('svg.ill path'); const e=p && p.querySelector('.pemoji');
    return path ? { w:parseFloat(getComputedStyle(path).strokeWidth), zoom:parseFloat(getComputedStyle(e).zoom||'1') } : null; });

  try{
    /* ── A. the sheet, top to bottom ──────────────────────────────────── */
    await tap('#planNav, #planNavP, #planNavS');
    await page.locator('.pchip').filter({ hasText:'Pad Thai' }).first().click(); await page.waitForTimeout(600);
    const seq = await page.evaluate(()=>{ const s=document.querySelector('#ppSheet');
      return [...s.querySelectorAll('a.ppsrc, .ppsrcname, #ppMethod, #ppIng, #ppList, #ppDel')].map(e=>e.matches('a.ppsrc')?'link:'+e.textContent.trim()
        : e.matches('.ppsrcname')?'name:'+e.textContent.trim() : e.id+':'+e.textContent.trim()); });
    ok('top to bottom: Open link, the site under it, Method, Ingredients, Add to shopping list, Remove',
       JSON.stringify(seq)===JSON.stringify(["link:Open link","name:recipetineats.com","ppMethod:Method · 2 steps","ppIng:Ingredients · 5","ppList:Add to shopping list","ppDel:Remove from this day"]),
       JSON.stringify(seq));
    ok('…Open link goes to the recipe', await page.getAttribute('a.ppsrc','href')==='https://www.recipetineats.com/pad-thai/', '');
    ok('there is no Edit and no input in the sheet', !(await has('#ppEdit')) && (await page.locator('#ppSheet input').count())===0, '');
    ok('the ingredients start folded', (await page.locator('#ppSheet .pping').count())===0 && await page.getAttribute('#ppIng','aria-expanded')==='false', '');
    await tap('#ppIng');
    const ing = await page.evaluate(()=>[...document.querySelectorAll('#ppSheet .ppingpanel .pping .ppingname')].map(x=>x.textContent.trim()));
    ok('…and open under their button, in recipe order', JSON.stringify(ing)==='["Rice noodles","Prawns","Eggs","Bean sprouts","Lime"]' && await page.getAttribute('#ppIng','aria-expanded')==='true', JSON.stringify(ing));
    ok('…with the order choice inside the fold', (await page.locator('#ppSheet .ppingpanel [data-ppingsort]').count())===2, '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sheet.png') });

    /* ── B. the review, sortable ───────────────────────────────────────── */
    await tap('#ppList');
    ok('"Add to shopping list" opens the review', await has('#smartSheetEl'), '');
    ok('…which offers Recipe order and Category', (await page.locator('[data-smartsort]').count())===2, '');
    const rowNames = ()=>page.evaluate(()=>[...document.querySelectorAll('#smartSheetEl .smartchip-name')].map(x=>x.textContent.replace(/^[\d.,]+\s*(g|×)?\s*/,'').replace(/^\d+\s*g\s*/,'').trim()));
    ok('recipe order is the recipe as written', JSON.stringify(await rowNames())==='["Rice noodles","Prawns","Eggs","Bean sprouts","Lime"]', JSON.stringify(await rowNames()));
    await tap('[data-smartsort="cat"]');
    const groups = await page.evaluate(()=>[...document.querySelectorAll('#smartSheetEl .recgroup')].map(g=>g.textContent.split('·')[0].trim()));
    ok('Category groups the rows under their categories, in the app\'s category order', JSON.stringify(groups)==='["Meat","Fruit","Vegetable","Fresh","Asian"]', JSON.stringify(groups));
    ok('…the same choice as the recipe sheet (one preference)', await page.evaluate(()=>localStorage.getItem('ml_ingsort'))==='cat', '');
    /* the trap: rows are drawn in a new order, so a tick must still find ITS item */
    const limeCheck = page.locator('#smartSheetEl .smartchip', { hasText:'Lime' }).locator('[data-smart-sel]');
    await limeCheck.click(); await page.waitForTimeout(400);
    ok('ticking Lime off in the grouped view turns off Lime, not another row',
       await page.evaluate(()=>[...document.querySelectorAll('#smartSheetEl .smartchip.off .smartchip-name')].map(x=>x.textContent.trim()).join())==='Lime', '');
    await tap('#smartConfirm');
    const names = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.map(i=>i.name.toLowerCase()));
    ok('…and what lands on the list is exactly the other four', ['rice noodles','prawns','eggs','bean sprouts'].every(n=>names.includes(n)) && !names.includes('lime'), JSON.stringify(names));

    /* ── C. editing lives in Your recipes › Edit ───────────────────────── */
    await tap('.pdmore'); await tap('#pmRecipe'); await tap('#paManage');
    const labels = await page.evaluate(()=>[...document.querySelectorAll('[data-precipe] .precedit')].map(x=>x.textContent.trim()));
    ok('in Edit, each saved recipe says it opens for editing', labels.length===2 && labels.every(l=>l==='Edit'), JSON.stringify(labels));
    await page.locator('[data-precipe]', { hasText:'Onion soup' }).first().click(); await page.waitForTimeout(600);
    ok('…and a tap opens that recipe in the editor', /Edit recipe/.test(await page.locator('#paSheet .disp').first().textContent().catch(()=>'')) && (await page.inputValue('#paName'))==='Onion soup', '');
    await page.evaluate(()=>{ const b=document.querySelector('#paBg'); if(b) b.click(); }); await page.waitForTimeout(400);

    /* ── D. line weight ────────────────────────────────────────────────── */
    await tap('#cartNavP, #cartNav');
    const s0 = await stroke();
    ok('at S, Regular draws the v2.04 line (1.4px)', s0 && Math.abs(s0.w-1.4)<0.01, JSON.stringify(s0));
    await tap('#setNav, #setNavP, #setNavS');
    ok('Settings has Line weight, Fine to Bold', (await page.locator('[data-opt-linew]').count())===4, '');
    await page.evaluate(()=>document.querySelector('[data-opt-linew="fine"]').click()); await page.waitForTimeout(400);
    ok('…remembered, and published on the page', await page.evaluate(()=>localStorage.getItem('ml_linew')+'|'+document.documentElement.dataset.linew)==='fine|fine', '');
    ok('Line weight is a look: kept OUT of both exclusion lists', !rx('APP_EXCLUDE_BOOT').test('ml_linew') && !rx('APP_EXCLUDE').test('ml_linew'), '');
    await tap('#cartNavP, #cartNav');
    const sf = await stroke();
    ok('Fine really draws thinner', sf && s0 && sf.w < s0.w*0.7, JSON.stringify({regular:s0, fine:sf}));
    await page.evaluate(()=>{ localStorage.setItem('ml_linew','regular'); localStorage.setItem('ml_icosize','xl'); }); await load(); await tap('#cartNavP, #cartNav');
    const sx = await stroke();
    ok('at XL the line is drawn at the same weight as at S — no longer bolder (stroke × zoom = 1.4px)',
       sx && Math.abs(sx.zoom-2.2)<0.01 && Math.abs(sx.w*sx.zoom-1.4)<0.02, JSON.stringify(sx));
    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
