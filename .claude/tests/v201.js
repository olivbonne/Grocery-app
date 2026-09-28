/* v2.01 — the planner learns to shop: a whole week onto the list, a pantry that says what you
   probably have, a recipe's link and method, meal slots, and servings that scale. Cups stay cups.

   WHY THIS EXISTS: every one of these changes a NUMBER the household will buy by — a merged amount,
   a scaled amount, a row left unticked. A wrong number here is not cosmetic: it is too much chicken
   or no milk. So each check reads the one row it is about and asserts the exact value on it.

   WHAT THESE CHECKS HAVE TO PROVE:
   - "Add this week to the list" appears only for a week with meals, and merges duplicates the way a
     person would write them: 1 kg + 500 g of chicken is ONE line of 1.5 kg (not "2× 1.5 kg"),
     2 cups + 1 cup of rice is 3 cups;
   - something bought yesterday arrives unticked and says "probably have"; something never bought
     arrives ticked (unknown means buy it);
   - the pick sheet links only an http(s) source, opens it in a new tab without an opener, and shows
     the method on request;
   - servings chosen on a planned recipe scale its review AND the whole-week list;
   - meal slots order a day and label its chips, default to Dinner for a new meal, and a Settings
     switch removes them entirely;
   - with Metric on, pounds convert and cups do not — the user's explicit instruction for this batch;
   - a half-typed ingredient survives a tap on a slot (the executor caught that it did not).

   FOUND BY THIS SUITE: scaling multiplied both the count and the amount, so 1 kg of chicken at
   double servings read "2× 2 kg" — four kilos. Latent since v1.94 put amounts on review rows; now
   an amount scales and the count stays, and only a row without an amount scales its count.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control. ml_units is seeded as a precondition only; the meal-slot switch
     is driven through Settings.
   - v1.77: each page's nav carries its own ids.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v1.94: the whole page's text is a haystack — read the one row being tested.
   - v2.00: addInitScript re-runs on every navigation, so the seed returns early once seeded. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const seed = (units) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  const DAY=86400000, now=Date.now();
  /* the app's own week arithmetic: weeks run Monday to Sunday */
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7));
  const key=x=>x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");
  const mon=key(d); const w=new Date(d.getTime()+2*DAY+3600000); const wed=key(w);
  const cats=[{id:"meat",label:"Meat",color:"#B5402B",emoji:"🥩",subs:[]},
              {id:"fresh",label:"Fresh",color:"#3B7DD8",emoji:"🥛",subs:[]},
              {id:"others",label:"Others",color:"#888888",emoji:"🧺",subs:[]}];
  const purch={ "milk|fresh":{name:"milk",cat:"fresh",qty:1,weight:"",sub:"",ts:[now-DAY]},
                "rice|others":{name:"rice",cat:"others",qty:1,weight:"",sub:"",ts:[now-40*DAY]} };
  const recipes=[
    {id:"r1",name:"Chicken curry",emoji:"",servings:4,src:"https://example.com/curry",
     steps:["Brown the chicken.","Add the sauce.","Simmer for 20 minutes."],
     ing:[{name:"chicken",cat:"meat",qty:1,weight:"1 kg"},{name:"rice",cat:"others",qty:1,weight:"2 cups"},
          {name:"milk",cat:"fresh",qty:1,weight:""},{name:"beef",cat:"meat",qty:1,weight:"1 lb"}]},
    {id:"r2",name:"Chicken rice",emoji:"",servings:2,src:"javascript:alert(1)",steps:[],
     ing:[{name:"Chicken",cat:"meat",qty:1,weight:"500 g"},{name:"rice",cat:"others",qty:1,weight:"1 cup"}]}];
  const days={}; days[mon]=[{id:"e1",kind:"recipe",name:"Chicken curry",emoji:"",cat:"",rid:"r1",slot:"dinner",serves:4},
                            {id:"e3",kind:"food",name:"porridge",emoji:"",cat:"others",rid:"",slot:"breakfast",serves:0}];
  days[wed]=(days[wed]||[]).concat([{id:"e2",kind:"recipe",name:"Chicken rice",emoji:"",cat:"",rid:"r2",slot:"lunch",serves:2}]);
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[{id:"1",name:"kitchen roll",cat:"others",weight:"",qty:1,sub:"",checked:false,tags:[],starred:false}],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch,
    plan:{ days, recipes, saved:[] } }));
  localStorage.setItem("ml_purch", JSON.stringify(purch));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
  localStorage.setItem("ml_optcoll","[]");
  ${units ? `localStorage.setItem("ml_units","${units}");` : ''}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(units)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(units));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(600); };
  const dismiss = async()=>{ await page.evaluate(()=>{ for(const id of ['#smartCancel','#ppBg','#paBg','#pwBg']){
      const b=document.querySelector(id); if(b){ b.click(); return; } } }); await page.waitForTimeout(500); };
  /* the review sheet's rows, read row by row — never the page's text */
  const rows = ()=>page.evaluate(()=>[...document.querySelectorAll('.smartchip')].map(c=>({
    name:(c.querySelector('.smartchip-name')||{}).textContent.trim().replace(/\s+/g,' '),
    on:(c.querySelector('.smartcheck')||{getAttribute:()=>''}).getAttribute('aria-checked')==='true',
    tags:[...c.querySelectorAll('.smartchip-have')].map(t=>t.textContent.trim()) })));
  const row = (rs, word)=>rs.find(r=>new RegExp('\\b'+word+'$','i').test(r.name));
  const mondayChips = ()=>page.evaluate(()=>{
    const all=[...document.querySelectorAll('[data-pchip]')];
    const k=(all.find(b=>/\|e1$/.test(b.dataset.pchip))||{dataset:{pchip:''}}).dataset.pchip.split('|')[0];
    return all.filter(b=>b.dataset.pchip.split('|')[0]===k).map(b=>({ id:b.dataset.pchip.split('|')[1],
      slot:(b.querySelector('.pcslot')||{textContent:''}).textContent.trim() })); });

  try{
    /* ── A. the week, onto the list ────────────────────────────────────── */
    await mk();
    await tap('#planNav, #planNavP');
    const chips = await mondayChips();
    ok('a day is ordered by meal slot, not by when things were added',
       chips.map(c=>c.id).join(',')==='e3,e1', JSON.stringify(chips));
    ok('…and each chip says which meal it is', chips.map(c=>c.slot.toLowerCase()).join(',')==='breakfast,dinner', JSON.stringify(chips));
    ok('"Add this week to the list" is offered for a week with meals', await page.locator('#pwToList').count()===1, '');

    await tap('#pwToList');
    const title = await page.evaluate(()=>{ const s=document.querySelector('#smartSheet, .smartsheet, #smartBg');
      return s ? s.textContent : ''; });
    ok('…and opens the review titled for the week', /This week — 3 meals/.test(title), title.slice(0,80));
    let rs = await rows();
    const chicken=row(rs,'chicken'), rice=row(rs,'rice'), milk=row(rs,'milk'), beef=row(rs,'beef'), porr=row(rs,'porridge');
    ok('1 kg + 500 g of chicken (spelt two ways) is one line of 1.5 kg',
       rs.filter(r=>/chicken$/i.test(r.name)).length===1 && chicken && chicken.name==='1.5 kg Chicken', JSON.stringify(chicken));
    ok('2 cups + 1 cup of rice is 3 cups', rice && rice.name==='3 cups Rice', JSON.stringify(rice));
    ok('a food with no recipe arrives as itself', porr && porr.on===true, JSON.stringify(porr));
    ok('milk, bought yesterday, arrives unticked and says why',
       milk && milk.on===false && milk.tags.includes('probably have'), JSON.stringify(milk));
    ok('rice, last bought 40 days ago, is still ticked', rice && rice.on===true && !rice.tags.includes('probably have'), JSON.stringify(rice));
    ok('beef, never bought, is ticked — unknown means buy it', beef && beef.on===true, JSON.stringify(beef));
    ok('with conversion off, pounds stay pounds', beef && beef.name==='1 lb Beef', JSON.stringify(beef));
    await dismiss();

    await tap('#pwNext');
    ok('an empty week offers nothing to add', await page.locator('#pwToList').count()===0, '');
    await tap('#pwPrev');

    /* ── B. the pick sheet: link, method, slot, servings ───────────────── */
    await tap('[data-pchip$="|e1"]');
    const link = await page.evaluate(()=>{ const a=document.querySelector('#ppSheet a[href]');
      return a ? { href:a.getAttribute('href'), target:a.target, rel:a.rel, text:a.textContent.trim(), svg:!!a.querySelector('svg') } : null; });
    ok('a planned recipe links back to where it came from', link && link.href==='https://example.com/curry', JSON.stringify(link));
    ok('…in a new tab with no opener', link && link.target==='_blank' && /noopener/.test(link.rel), JSON.stringify(link));
    ok('…with a drawn icon, not an emoji', link && link.svg && !/[\u{1F300}-\u{1FAFF}]/u.test(link.text), JSON.stringify(link));
    ok('the method is folded until asked for', await page.locator('.ppsteps').count()===0, '');
    await tap('#ppMethod');
    const steps = await page.evaluate(()=>[...document.querySelectorAll('.ppsteps li')].map(l=>l.textContent));
    ok('…and shows every step, in order', steps.length===3 && steps[2]==='Simmer for 20 minutes.', JSON.stringify(steps));
    const slotOn = await page.evaluate(()=>[...document.querySelectorAll('[data-ppslot].on')].map(b=>b.dataset.ppslot));
    ok('the slot picker shows the meal it is planned for', JSON.stringify(slotOn)==='["dinner"]', JSON.stringify(slotOn));
    const pickFilled = await page.evaluate(()=>[...document.querySelectorAll('#ppSheet button')].filter(b=>{
      const m=getComputedStyle(b).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/); if(!m) return false;
      return Math.abs(+m[1]-226)<40 && Math.abs(+m[2]-80)<45 && Math.abs(+m[3]-44)<45; }).length);
    ok('…drawn as a state, never in the commit colour', pickFilled===0, String(pickFilled));

    for(let i=0;i<4;i++) await tap('[data-ppserv="1"]');
    const serves = await page.evaluate(()=>document.querySelector('[data-ppserv="1"]').parentElement.querySelector('span').textContent);
    ok('servings step up on the planned meal', serves==='8', serves);
    await tap('#ppList');
    rs = await rows();
    ok('…and its review is scaled from 4 to 8: 1 kg of chicken becomes 2 kg',
       row(rs,'chicken') && row(rs,'chicken').name==='2 kg Chicken', JSON.stringify(row(rs,'chicken')));
    ok('…and 2 cups of rice become 4 cups', row(rs,'rice') && row(rs,'rice').name==='4 cups Rice', JSON.stringify(row(rs,'rice')));
    await dismiss();
    await tap('#pwToList');
    rs = await rows();
    ok('the whole-week list uses the same servings: 2 kg + 500 g is 2.5 kg',
       row(rs,'chicken') && row(rs,'chicken').name==='2.5 kg Chicken', JSON.stringify(row(rs,'chicken')));
    await dismiss();

    await tap('[data-pchip$="|e1"]');
    await tap('[data-ppslot="breakfast"]');
    await dismiss();
    const moved = await mondayChips();
    ok('changing the slot relabels the chip and it stays put', moved.find(c=>c.id==='e1').slot.toLowerCase()==='breakfast', JSON.stringify(moved));

    /* a source that is not http(s) is never a link */
    await tap('[data-pchip$="|e2"]');
    ok('a javascript: source is never rendered as a link', await page.locator('#ppSheet a[href]').count()===0, '');
    ok('…and a recipe with no steps offers no method', await page.locator('#ppMethod').count()===0, '');
    await dismiss();

    /* ── C. the add sheet ──────────────────────────────────────────────── */
    await tap('.pdmore'); await tap('#pmRecipe');
    await tap('#paWrite');   // v2.03: the form is one step past the choice
    const addSlot = await page.evaluate(()=>[...document.querySelectorAll('[data-paslot].on')].map(b=>b.dataset.paslot));
    ok('a new meal starts as Dinner', JSON.stringify(addSlot)==='["dinner"]', JSON.stringify(addSlot));
    ok('a new recipe asks how many it serves', await page.locator('[data-paserv="1"]').count()===1, '');
    await page.fill('#paIngIn','2 lb beef');
    await tap('[data-paslot="lunch"]');
    const kept = await page.evaluate(()=>({ v:(document.querySelector('#paIngIn')||{}).value,
      on:[...document.querySelectorAll('[data-paslot].on')].map(b=>b.dataset.paslot) }));
    ok('a half-typed ingredient survives a tap on a slot', kept.v==='2 lb beef' && kept.on.join()==='lunch', JSON.stringify(kept));
    await dismiss();

    /* ── D. meal slots can be switched off ─────────────────────────────── */
    await tap('#setNav, #setNavP, #setNavS');
    ok('Settings has a Plan section', await page.evaluate(()=>[...document.querySelectorAll('.optsect')].some(h=>h.dataset.sect==='Plan')), '');
    await tap('[data-opt-mealslots="0"]');
    ok('…whose switch is remembered on this device', await page.evaluate(()=>localStorage.getItem('ml_mealslots'))==='0', '');
    await tap('#planNavS, #planNav, #planNavP');
    const bare = await page.evaluate(()=>document.querySelectorAll('.pcslot').length);
    ok('with slots off, no chip carries a meal label', bare===0, String(bare));
    await tap('[data-pchip$="|e1"]');
    ok('…and the pick sheet has no slot picker', await page.locator('.slotseg').count()===0, '');
    await dismiss();

    /* ── E. Metric: pounds convert, cups never do ──────────────────────── */
    await mk('metric');
    await tap('#planNav, #planNavP');
    await tap('#pwToList');
    rs = await rows();
    ok('with Metric on, 1 lb of beef reads in grams', row(rs,'beef') && /^45\d g Beef$/.test(row(rs,'beef').name), JSON.stringify(row(rs,'beef')));
    ok('…and 3 cups of rice stays 3 cups — cups are never converted', row(rs,'rice') && row(rs,'rice').name==='3 cups Rice', JSON.stringify(row(rs,'rice')));
    if(out) await page.screenshot({ path: out });
    await dismiss();
    await mk('imperial');
    await tap('#planNav, #planNavP');
    await tap('#pwToList');
    rs = await rows();
    ok('…and with Imperial on, still 3 cups', row(rs,'rice') && row(rs,'rice').name==='3 cups Rice', JSON.stringify(row(rs,'rice')));
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
