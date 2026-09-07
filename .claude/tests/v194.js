/* v1.94 — amounts travel with an ingredient, and can be converted for display.

   WHY THIS EXISTS: `planIngNorm` flattened every ingredient to {name, cat}, so the quantity and
   weight the recipe reader had already worked out were thrown away at the door and the shopping
   list got bare names. Three of this version's four parts hang off that one line, which makes the
   end-to-end path — reader → recipe → plan → list — the thing that has to be proved, not the
   normaliser in isolation.

   WHAT THESE CHECKS HAVE TO PROVE:
   - an imported ingredient KEEPS its qty and weight, and they survive all the way onto the review
     sheet where the shopping list is actually written;
   - an ingredient can be typed WITH its amount, by Enter and by the new button, and a leading count
     ("3 onions") is told apart from a leading weight ("2 lb beef");
   - the Measurements setting converts what is SHOWN and never what is STORED — turning it off must
     bring the recipe's own wording back exactly, and the editor controls must keep showing literals
     or they lie about what they will save;
   - something the converter cannot read is left alone rather than guessed at;
   - a web result offers a way to open its page, and a model suggestion — which has no page — does
     not pretend to.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.77: each page's nav carries its own ids.
   - v1.84: names are title-cased by cap() before display.
   - v1.85: plan chips are pointer-event driven; element.click() from page.evaluate fires nothing.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH value appeared, never merely that something appeared. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]},{id:"vegetable",label:"Veg",color:"#2F9E44",emoji:"",subs:[]}];
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

/* The reader's answer, with amounts on it — which is the whole point. */
const IMPORTED = { title:"Beef Goulash", servings:4, items:[
  { name:"ground beef", qty:1, weight:"2 lb", category:"meat" },
  { name:"onion", qty:3, weight:"", category:"vegetable" } ] };
const FOUND = { source:"web", results:[
  { title:"Best Beef Goulash", url:"https://recipes.example.com/goulash", site:"recipes.example.com", note:"A classic" } ] };
const SUGGESTED = { source:"model", results:[
  { title:"Classic beef goulash", url:"", site:"", note:"Paprika-heavy" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(search)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe', r =>
      r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(IMPORTED) }));
    await ctx.route('**/api/recipe-search', r =>
      r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(search||FOUND) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(700); };
  const chips = ()=>page.evaluate(()=>[...document.querySelectorAll('#paSheet .pchip')].map(c=>({
    amt:(c.querySelector('.pcamt')||{}).textContent||'', name:(c.querySelector('.pcname')||{}).textContent||'' })));
  /* Drive the real setting, from the real Settings page — never write ml_units directly. */
  /* TEST BUG, v1.94: this first went back with '#planNav', which does not exist on the Settings
     page — its Plan tab is #planNavS (the v1.77 note at the top of this file is about exactly this,
     which is why it is written down). Every id the walk touches is listed, not assumed. */
  const setUnits = async(mode)=>{ await tap('#setNav, #setNavP, #setNavS'); await tap(`[data-opt-units="${mode}"]`);
    await page.waitForTimeout(400); await tap('#planNavS, #planNavP, #planNav'); };
  const openRecipe = async()=>{ await tap('#planNav, #planNavP, #planNavS'); await tap('.pdmore'); await tap('#pmRecipe'); };

  try{
    /* ── A. the amount survives the import ─────────────────────────────── */
    await mk();
    await openRecipe();
    await tap('[data-pimp="link"]');
    await page.fill('#paImpVal', 'https://recipes.example.com/goulash');
    await tap('#paImpGo');
    let cs = await chips();
    ok('an imported ingredient keeps the weight the reader found',
       cs.some(c=>/2 lb/.test(c.amt) && /Beef/i.test(c.name)), JSON.stringify(cs));
    ok('…and a count is kept as a count, not flattened to one',
       cs.some(c=>/3×/.test(c.amt) && /Onion/i.test(c.name)), JSON.stringify(cs));

    /* ── B. typing an ingredient, with an amount ───────────────────────── */
    await page.fill('#paIngIn', '500 g flour');
    await tap('#paIngAdd');
    cs = await chips();
    ok('the Add button adds what was typed, with its amount',
       cs.some(c=>/500 g/.test(c.amt) && /Flour/i.test(c.name)), JSON.stringify(cs));

    await page.fill('#paIngIn', '3 carrots');
    await page.press('#paIngIn', 'Enter');
    await page.waitForTimeout(500);
    cs = await chips();
    ok('…and Enter still works, reading a bare number as a count',
       cs.some(c=>/3×/.test(c.amt) && /Carrot/i.test(c.name)), JSON.stringify(cs));

    /* A word it cannot read an amount from must stay a name — a wrong name is visible, a wrong
       amount is not, so that is the safe direction to fail in. */
    await page.fill('#paIngIn', 'a pinch of saffron');
    await tap('#paIngAdd');
    cs = await chips();
    ok('something with no readable amount keeps its whole text as the name',
       cs.some(c=>c.amt==='' && /pinch of saffron/i.test(c.name)), JSON.stringify(cs));

    /* ── C. the amount reaches the shopping list (item 3) ───────────────── */
    await tap('#paGo');
    await page.waitForTimeout(700);
    await tap('.pchip.recipe, .planday .pchip');
    await page.waitForTimeout(500);
    const toList = await page.evaluate(()=>{
      const b=[...document.querySelectorAll('button,.optaction')].find(x=>/ingredient|shopping list|add to list/i.test(x.textContent||''));
      if(b){ b.click(); return true; } return false; });
    await page.waitForTimeout(900);
    const review = await page.evaluate(()=>[...document.querySelectorAll('.smartchip-name')].map(n=>n.textContent.trim()));
    ok('the review sheet carries the amounts through from the recipe',
       review.some(t=>/2 lb/.test(t) && /Beef/i.test(t)) && review.some(t=>/3×/.test(t) && /Onion/i.test(t)),
       JSON.stringify({ opened:toList, review }));

    /* ── D. the Measurements setting converts what is SHOWN ────────────── */
    /* TEST BUG, v1.94: this first scraped document.body.textContent and asserted "905 g" appeared
       somewhere in it. The weight PICKER lists 100g…900g of its own, so the haystack answered yes
       before the feature did. Read the one surface the person is actually looking at instead. */
    const toReview = async()=>{
      await tap('.planday .pchip');
      await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,.optaction')]
        .find(x=>/ingredient|shopping list|add to list/i.test(x.textContent||'')); if(b) b.click(); });
      await page.waitForTimeout(900);
      return page.evaluate(()=>[...document.querySelectorAll('.smartchip-name')].map(n=>n.textContent.trim()));
    };
    const closeReview = async()=>{ await page.evaluate(()=>{ const c=document.querySelector('#smartCancel'); if(c) c.click(); });
      await page.waitForTimeout(600); };

    await mk();
    await openRecipe();
    await tap('[data-pimp="link"]');
    await page.fill('#paImpVal', 'https://recipes.example.com/goulash');
    await tap('#paImpGo');
    await tap('#paGo');
    await page.waitForTimeout(700);

    await setUnits('metric');
    let rows = await toReview();
    ok('with Metric on, a recipe written in pounds is shown in grams',
       rows.some(t=>/905 g/.test(t) && /Beef/i.test(t)) && !rows.some(t=>/2 lb/.test(t)), JSON.stringify(rows));
    /* A count is not a measurement — converting it would be nonsense. */
    ok('…and a plain count is left alone by the conversion',
       rows.some(t=>/3×/.test(t) && /Onion/i.test(t)), JSON.stringify(rows));

    /* ── E. the editor must not lie about what it will save ────────────── */
    const picker = await page.evaluate(()=>{
      const h=document.querySelector('.smartchip-head'); if(h) h.click();
      return null; });
    await page.waitForTimeout(500);
    const swt = await page.evaluate(()=>[...document.querySelectorAll('.swt')].map(b=>b.textContent.trim()));
    ok('the weight picker still offers its own literal values, not converted ones',
       swt.length>0 && swt.some(t=>/^\d+g$/.test(t)) && !swt.some(t=>/(oz|lb)$/.test(t)),
       JSON.stringify({ picker, swt:swt.slice(0,8) }));

    await closeReview();
    await setUnits('off');
    rows = await toReview();
    /* The point of converting only the display: the recipe's own wording has to come back. */
    ok('…and turning it Off brings the recipe\'s own wording back exactly',
       rows.some(t=>/2 lb/.test(t) && /Beef/i.test(t)) && !rows.some(t=>/905 g/.test(t)), JSON.stringify(rows));
    await closeReview();

    /* ── F. opening a search result's page (item 1) ─────────────────────── */
    await mk();
    await openRecipe();
    await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', 'beef goulash');
    await tap('#paImpGo');
    const link = await page.evaluate(()=>{
      const a=document.querySelector('.presopen');
      return a ? { href:a.getAttribute('href'), target:a.getAttribute('target'), rel:a.getAttribute('rel') } : null; });
    ok('a web result offers a way to open the page itself',
       link && link.href==='https://recipes.example.com/goulash', JSON.stringify(link));
    /* rel=noopener is not decoration: without it the opened page can reach back through window.opener. */
    ok('…in a new context, and without handing it a reference back',
       link && link.target==='_blank' && /noopener/.test(link.rel||'') && /noreferrer/.test(link.rel||''),
       JSON.stringify(link));
    ok('…while the result itself still reads the recipe into the form',
       await page.evaluate(()=>!!document.querySelector('.preswrap [data-pres]')), '');

    /* A suggestion has no page behind it, so it must not offer one. */
    await mk(SUGGESTED);
    await openRecipe();
    await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', 'beef goulash');
    await tap('#paImpGo');
    const none = await page.evaluate(()=>({
      results:document.querySelectorAll('[data-pres]').length,
      opens:document.querySelectorAll('.presopen').length }));
    ok('a suggestion with no page behind it does not pretend to have one',
       none.results===1 && none.opens===0, JSON.stringify(none));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
