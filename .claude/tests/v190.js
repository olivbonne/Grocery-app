/* v1.90 — a recipe page shared in from the phone; a week that fits one screen; and the title starting
   where the tiles start.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a shared page is READ, not just received: the app lands on the plan with the importer running and
     the ingredients in the form;
   - the link is taken out of the address bar, and a reload does NOT import the same page twice — that
     is the difference between a share target and a trap;
   - what arrives from a share sheet is untrusted text. A "text" share is a sentence with a link in it,
     and something that is not an http(s) URL at all must be ignored rather than handed onward;
   - the week FITS. Measured, not eyeballed: with a meal on every day the document must not be taller
     than the window, and every one of the seven days must sit between the top bar and the floating nav;
   - the chips are beside the day rather than under it, which is where the height was going;
   - the title's left edge equals the tiles' left edge — the thing actually asked for, measured against
     the tiles rather than against a remembered number.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.77: each page's nav carries its own ids.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent — which is exactly
     what makes the "a reload does not re-import" check meaningful here.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.90 (this suite): a Playwright route handler is NOT a count of what the app did. Measured here,
     one fetch() from the page arrived as two route invocations and two request events, which read as
     "the app imported twice" when it had imported once. What the app did is counted in the page. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* `meals` = how many entries to put on every day of the week. */
const SEED = (meals)=>`(() => {
  if(localStorage.getItem("ml_me")) return;
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7));
  const k=x=>{ const y=new Date(d.getTime()+x*86400000);
    return y.getFullYear()+"-"+String(y.getMonth()+1).padStart(2,"0")+"-"+String(y.getDate()).padStart(2,"0"); };
  const names=["Bolognese","Fish pie","Roast chicken","Chicken curry","Tacos","Mushroom risotto","Leek soup"];
  const days={};
  for(let i=0;i<7;i++){ const es=[];
    for(let m=0;m<${meals}; m++) es.push({id:"pe"+i+"_"+m, kind:"food", name:names[(i+m)%7], emoji:"", cat:"others"});
    if(es.length) days[k(i)]=es; }
  const items=[]; for(let i=0;i<4;i++) items.push({id:"i"+i,name:["milk","eggs","bread","apples"][i],qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:null, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{ days, recipes:[] } }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

/* Counted in the page, not in the route handler — see the v1.90 note above. */
const COUNTER = `(() => { window.__api=[]; const of=window.fetch;
  window.fetch=function(u,o){ try{ if(String(u).indexOf("/api/")>=0)
    window.__api.push(JSON.parse((o&&o.body)||"{}")); }catch(e){}
    return of.apply(this,arguments); }; })()`;

const IMPORTED = { title:"Beef Goulash", servings:6, items:[
  { name:"ground beef", qty:2, weight:"2 pounds", category:"meat" },
  { name:"yellow onion", qty:2, weight:"", category:"vegetable" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(meals, query)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe', r =>
      r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(IMPORTED) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(COUNTER);
    await page.addInitScript(SEED(meals===undefined?1:meals));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101${query||""}`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1800);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(800); };
  const apiCalls = ()=>page.evaluate(()=>window.__api||[]);
  const planFit = ()=>page.evaluate(()=>{
    const ds=[...document.querySelectorAll('.planday')];
    const nav=document.querySelector('.bottomnav'), tf=document.querySelector('.topfix');
    const navTop=nav.getBoundingClientRect().top, barBot=tf.getBoundingClientRect().bottom;
    return { days:ds.length,
             docH:Math.round(document.body.scrollHeight), vh:window.innerHeight,
             scrolls: document.body.scrollHeight > window.innerHeight + 2,
             rowH:ds.map(x=>Math.round(x.getBoundingClientRect().height)),
             lastBottom:Math.round(ds[ds.length-1].getBoundingClientRect().bottom),
             navTop:Math.round(navTop), barBot:Math.round(barBot),
             allBetween: ds.every(x=>{ const r=x.getBoundingClientRect(); return r.top>=barBot-1 && r.bottom<=navTop+1; }) };
  });

  try{
    /* ── A. a page shared in ────────────────────────────────────────────── */
    await mk(1, "&import=" + encodeURIComponent("https://recipes.example.com/goulash"));
    let calls = await apiCalls();
    ok('a shared link asks for that page to be read, once',
       calls.length===1 && calls[0] && calls[0].url==='https://recipes.example.com/goulash',
       JSON.stringify(calls));
    let st = await page.evaluate(()=>({
      plan:!!document.querySelector('.planweek'),
      sheet:!!document.querySelector('#paSheet'),
      name:(document.querySelector('#paName')||{}).value,
      ing:[...document.querySelectorAll('[data-pingrm]')].length,
      search:location.search }));
    ok('…and the app lands on the plan with the recipe open', st.plan===true && st.sheet===true, JSON.stringify(st));
    ok('…already filled in from the page', st.name==='Beef Goulash' && st.ing===2, JSON.stringify({n:st.name,i:st.ing}));
    ok('…with the link taken out of the address bar',
       !/import=|[?&]url=|text=/.test(st.search), st.search);

    /* The seed is idempotent, so a reload is a real relaunch of the same device — which is exactly the
       state in which a share target must not fire again. */
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
    calls = await apiCalls();
    ok('a reload does not import the same page again', calls.length===0, JSON.stringify(calls));

    await mk(1, "&url=" + encodeURIComponent("https://cooking.example.org/pie"));
    calls = await apiCalls();
    ok('a share sheet handing over ?url= works the same way',
       calls.length===1 && calls[0].url==='https://cooking.example.org/pie', JSON.stringify(calls));

    await mk(1, "&text=" + encodeURIComponent("Look at this https://recipes.example.com/stew it's lovely"));
    calls = await apiCalls();
    ok('a shared sentence has its link pulled out of it',
       calls.length===1 && calls[0].url==='https://recipes.example.com/stew', JSON.stringify(calls));

    /* What arrives from a share sheet is not to be trusted. */
    await mk(1, "&import=" + encodeURIComponent("javascript:alert(1)"));
    ok('something that is not a web link is ignored', (await apiCalls()).length===0, JSON.stringify(await apiCalls()));
    ok('…and the app opens normally rather than breaking',
       (await page.evaluate(()=>!!document.querySelector('#zoomer') || !!document.querySelector('.planweek'))), '');

    await mk(1, "");
    ok('an ordinary launch imports nothing and opens no sheet',
       (await apiCalls()).length===0 && (await page.locator('#paSheet').count())===0, JSON.stringify(await apiCalls()));

    /* ── B. a week with a meal every day fits ───────────────────────────── */
    await tap('#planNav');
    let f = await planFit();
    ok('precondition: there is a meal on every day', f.days===7, JSON.stringify(f.rowH));
    ok('a week with a meal every day does not scroll', f.scrolls===false,
       JSON.stringify({doc:f.docH, win:f.vh}));
    ok('…and every day sits between the top bar and the nav', f.allBetween===true,
       JSON.stringify({last:f.lastBottom, navTop:f.navTop, barBot:f.barBot}));
    ok('…which took the row height down from the 108px it was', Math.max(...f.rowH) < 90,
       JSON.stringify(f.rowH));

    const row = await page.evaluate(()=>{
      const d=document.querySelector('.planday');
      const n=d.querySelector('.pdname'), c=d.querySelector('.pchip');
      if(!n||!c) return null;
      const nr=n.getBoundingClientRect(), cr=c.getBoundingClientRect();
      return { nameMid:Math.round(nr.top+nr.height/2), chipMid:Math.round(cr.top+cr.height/2),
               chipLeft:Math.round(cr.left), nameRight:Math.round(nr.right) };
    });
    ok('what is planned sits beside the day, not under it',
       row && Math.abs(row.nameMid-row.chipMid)<=6 && row.chipLeft>row.nameRight, JSON.stringify(row));

    /* two meals a day is more than was asked for, but it should degrade by wrapping, not by breaking */
    await mk(2, "");
    await tap('#planNav');
    f = await planFit();
    ok('two meals a day still shows every day between the bars', f.days===7 && f.allBetween===true,
       JSON.stringify({rows:f.rowH, allBetween:f.allBetween}));

    await mk(0, "");
    await tap('#planNav');
    const empty = await page.evaluate(()=>({
      empties:document.querySelectorAll('.pdempty').length,
      inHead:!!document.querySelector('.pdhead > .pdempty') }));
    ok('an empty week still says so on each day', empty.empties===7, JSON.stringify(empty));
    ok('…on the day\'s own line', empty.inHead===true, JSON.stringify(empty));

    /* ── C. the title starts where the tiles start ──────────────────────── */
    await mk(1, "");
    const shop = await page.evaluate(()=>{
      const t=document.querySelector('.topfix .title');
      const tile=document.querySelector('#zoomer .pill'), head=document.querySelector('#zoomer .chead');
      return { titleL:Math.round(t.getBoundingClientRect().left),
               tileL:tile?Math.round(tile.getBoundingClientRect().left):null,
               headL:head?Math.round(head.getBoundingClientRect().left):null,
               placeholders:document.querySelectorAll('.topfix span.backbtn').length };
    });
    ok('on the shop page the title starts where the tiles start',
       shop.titleL===shop.tileL, JSON.stringify(shop));
    ok('…and where the category headings start too', shop.titleL===shop.headL, JSON.stringify(shop));
    ok('…with no space held for an arrow that is not there', shop.placeholders===0, String(shop.placeholders));

    await tap('#planNav');
    const plan = await page.evaluate(()=>{
      const t=document.querySelector('.topfix .title');
      const d=document.querySelector('.planday'), w=document.querySelector('.planweek');
      return { titleL:Math.round(t.getBoundingClientRect().left),
               dayL:Math.round(d.getBoundingClientRect().left),
               weekL:Math.round(w.getBoundingClientRect().left),
               placeholders:document.querySelectorAll('.topfix span.backbtn').length };
    });
    ok('the plan title lines up with its rows the same way',
       plan.titleL===plan.dayL && plan.titleL===plan.weekL, JSON.stringify(plan));
    ok('…and holds no space either', plan.placeholders===0, String(plan.placeholders));

    /* Settings HAS somewhere to go back to, so its arrow — and the offset it causes — stays. */
    await tap('#setNav, #setNavP, #setNavS');
    const set = await page.evaluate(()=>{
      const t=document.querySelector('.topfix .title'), b=document.querySelector('#setBack');
      return { titleL:Math.round(t.getBoundingClientRect().left), back:!!b,
               backW:b?Math.round(b.getBoundingClientRect().width):0 };
    });
    ok('Settings keeps its real back arrow', set.back===true && set.backW>=40, JSON.stringify(set));
    ok('…so its title is still offset by it, which is correct', set.titleL>plan.titleL, JSON.stringify(set));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
