/* v1.91 — switching lists leaves you on the page you were on, and a retired model says so.

   WHY THIS EXISTS: both halves are failures the app could not report on itself. Switching a list from
   the Plan page silently threw you onto Shop, and when Groq shut down llama-3.1-8b-instant on
   2026-08-16 every AI feature answered "couldn't read that — try rephrasing", which is advice that
   could never have worked. A wrong message is worse than no message: it sends someone to fix the
   wrong thing. So what is checked here is not "an error appeared" but WHICH error appeared.

   WHAT THESE CHECKS HAVE TO PROVE:
   - switching lists from the Plan page LEAVES YOU ON PLAN — and really switched, which means the name
     in the bar AND the plan under it both belong to the new list, not just one of them;
   - it did not break the other direction: from Shop you still land on Shop;
   - picking the list you are already on is the early-return path, and it must hold there too;
   - a `model` code from the server produces the sentence naming GROQ_MODEL — on the recipe importer,
     on the recipe search, and in Smart add;
   - and Smart add's generic "try rephrasing" is still there for failures that really are the input.
     Replacing every message with the new one would be the same bug pointing the other way.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.77: each page's nav carries its own ids — on the Plan page the Shop tab is #cartNavP.
   - v1.80: assert a count AND the identity behind it.
   - v1.85: plan chips are pointer-event driven; element.click() from page.evaluate fires nothing.
   - v1.86: dismiss whatever is open before opening the next thing. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* Two lists, each with a meal of its own on Monday, so "did it really switch" can be answered from
   the plan body and not only from the title. */
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7));
  const mon=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const cats=[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]}];
  const base=(name,meal,pre)=>({ items:[{id:pre+"1",name:pre+" thing",qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false}],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name,
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{ days:{ [mon]:[{id:"pe_"+pre, kind:"food", name:meal, emoji:"", cat:"others"}] }, recipes:[] } });
  localStorage.setItem("ml_cache_v101", JSON.stringify(base("Groceries","Bolognese","gro")));
  localStorage.setItem("ml_cache_v102", JSON.stringify(base("Hardware","Fish pie","hrd")));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_collapse_v102", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"},{code:"v102",name:"Hardware"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

const MODEL_ERR = { status:502, body:{ error:'The recipe reader\'s model is no longer available', code:'model' } };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  /* `api` decides what every /api/* call answers, so one seed serves both halves of the suite. */
  const mk = async(api)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    if(api) await ctx.route('**/api/**', r =>
      r.fulfill({ status:api.status, contentType:'application/json', body:JSON.stringify(api.body) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(700); };
  const where = ()=>page.evaluate(()=>
    document.querySelector('.optpage') ? 'settings'
    : document.querySelector('.planweek') ? 'plan'
    : document.querySelector('#zoomer') ? 'shop' : 'unknown');
  const title = ()=>page.evaluate(()=>{ const t=document.querySelector('.topfix .title');
    return t ? t.textContent.trim() : null; });
  const meals = ()=>page.evaluate(()=>[...document.querySelectorAll('.pchip')].map(c=>c.textContent.trim()));
  /* The switcher is a real sheet over a real button — open it the way a finger does. */
  const pick = async(code)=>{ await tap('#listSwitch'); await tap(`[data-list="${code}"]`); };

  try{
    /* ── A. switching a list leaves you where it found you ──────────────── */
    await mk();
    await tap('#planNav');
    ok('precondition: we are on the Plan page, showing this list\'s meal',
       (await where())==='plan' && (await meals()).some(m=>/Bolognese/i.test(m)),
       JSON.stringify({page:await where(), meals:await meals()}));

    await pick('v102');
    ok('picking another list from the Plan page stays on Plan', (await where())==='plan', await where());
    ok('…and it really switched — the name in the bar is the new list\'s',
       /Hardware/.test(await title()), await title());
    /* The title alone would pass if the switch half-happened, so the body has to agree with it. */
    ok('…and the plan under it is the new list\'s, not the old one\'s',
       (await meals()).some(m=>/Fish pie/i.test(m)) && !(await meals()).some(m=>/Bolognese/i.test(m)),
       JSON.stringify(await meals()));
    ok('…and the switcher closed behind it',
       await page.evaluate(()=>!document.querySelector('#listsBg')), '');

    /* Picking the list you are already on returns early, before any of the page-restoring code —
       so it is its own path and has to be checked as one. */
    await pick('v102');
    ok('picking the list you are already on also stays on Plan', (await where())==='plan', await where());

    /* NOT CHANGED: this must not have become "always stay on Plan". */
    await tap('#cartNavP');
    ok('precondition: back on the Shop page', (await where())==='shop', await where());
    await pick('v101');
    ok('switching from the Shop page still leaves you on Shop', (await where())==='shop', await where());
    ok('…having switched there too', /Groceries/.test(await title()), await title());

    /* ── B. a retired model names itself ────────────────────────────────── */
    /* The recipe importer. */
    await mk(MODEL_ERR);
    await tap('#planNav');
    await tap('.pdmore');
    await tap('#pmRecipe');
    await tap('[data-pimp="link"]');
    await page.fill('#paImpVal', 'https://recipes.example.com/goulash');
    await tap('#paImpGo');
    let msg = await page.evaluate(()=>{ const e=document.querySelector('.pimpnote.err');
      return e ? e.textContent.trim() : null; });
    ok('a retired model is named on the recipe importer, with the setting that fixes it',
       msg && /GROQ_MODEL/.test(msg) && /no longer available/i.test(msg), JSON.stringify(msg));
    ok('…and it does NOT tell you to paste the text instead, which would not have helped',
       msg && !/pasting the recipe text/i.test(msg), JSON.stringify(msg));

    /* The search, which is the other thing that was reported broken. */
    await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', 'beef goulash');
    await tap('#paImpGo');
    msg = await page.evaluate(()=>{ const e=document.querySelector('.pimpnote.err');
      return e ? e.textContent.trim() : null; });
    ok('…and on the recipe search as well', msg && /GROQ_MODEL/.test(msg), JSON.stringify(msg));

    /* Smart add, which had no code-reading at all before this version. */
    await mk(MODEL_ERR);
    await tap('#shopAddFab');
    await page.fill('#mainInput', 'milk, eggs, bread');
    await tap('#smartBtn');
    await page.waitForTimeout(600);
    let smart = await page.evaluate(()=>{ const s=document.querySelector('.sheet-bg#smartBg, #smartBg');
      return s ? s.textContent : ''; });
    ok('Smart add names the retired model too', /GROQ_MODEL/.test(smart), smart.slice(0,120));
    ok('…instead of telling you to rephrase perfectly good input',
       !/try rephrasing/i.test(smart), smart.slice(0,120));

    /* NOT CHANGED: a failure that really is the input still says so. Making every failure the new
       message would be this same bug, pointed the other way. */
    await mk({ status:502, body:{ error:'Parse failed', code:'upstream' } });
    await tap('#shopAddFab');
    await page.fill('#mainInput', 'qqqq');
    await tap('#smartBtn');
    await page.waitForTimeout(600);
    smart = await page.evaluate(()=>{ const s=document.querySelector('.sheet-bg#smartBg, #smartBg');
      return s ? s.textContent : ''; });
    ok('an ordinary failure still gets the ordinary message', /try rephrasing/i.test(smart), smart.slice(0,120));
    ok('…and does not blame a model that is fine', !/GROQ_MODEL/.test(smart), smart.slice(0,120));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
