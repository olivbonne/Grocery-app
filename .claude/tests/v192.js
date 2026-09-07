/* v1.92 — the app runs on a Gemini key as well as a Groq one, and says so.

   WHY THIS EXISTS: v1.91 fixed the endpoints but every sentence the app shows when AI is unavailable
   named GROQ_API_KEY / GROQ_MODEL. Someone who set up a Gemini key would read a message telling them
   to go and configure a provider they are not using — which is the same failure v1.91 was about,
   dressed differently: a confident message pointing at the wrong thing. The endpoint half of this
   version is checked in .claude/tests/api-recipe.js and api-recipe-search.js, which is where a
   provider choice can actually be driven; this suite is the sentences a person reads.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the "not set up" and "model is gone" messages name GEMINI first, on all three routes that can
     show them — the recipe importer, the recipe search, and Smart add;
   - they still name GROQ too, because both providers work and a Groq install must not be told it is
     misconfigured;
   - and the generic messages are untouched, so a failure that really is the input still says so.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.77: each page's nav carries its own ids.
   - v1.85: plan chips are pointer-event driven; element.click() from page.evaluate fires nothing.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH message appeared, never merely that an error appeared. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]}];
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[{id:"i1",name:"milk",qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false}],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

/* The two failures a misconfigured install actually hits. */
const NO_KEY = { status:500, body:{ error:'Server not configured', code:'not_configured' } };
const NO_MODEL = { status:502, body:{ error:'The recipe reader\'s model is no longer available', code:'model' } };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(api)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/**', r =>
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
  const impErr = ()=>page.evaluate(()=>{ const e=document.querySelector('.pimpnote.err');
    return e ? e.textContent.trim() : null; });
  const smartText = ()=>page.evaluate(()=>{ const s=document.querySelector('#smartBg');
    return s ? s.textContent : ''; });
  /* Both halves matter: Gemini named, and Groq still named. A message that dropped Groq would tell a
     working Groq install to go and configure something it does not use. */
  const namesBoth = (s, a, b)=> !!s && s.indexOf(a)>=0 && s.indexOf(b)>=0 && s.indexOf(a) < s.indexOf(b);

  /* Reaching the recipe importer: Plan → a day's + → Add recipe → the chosen route. */
  const openImporter = async(route)=>{
    await tap('#planNav'); await tap('.pdmore'); await tap('#pmRecipe'); await tap(`[data-pimp="${route}"]`);
  };

  try{
    /* ── A. no key at all ───────────────────────────────────────────────── */
    await mk(NO_KEY);
    await openImporter('link');
    await page.fill('#paImpVal', 'https://recipes.example.com/goulash');
    await tap('#paImpGo');
    let m = await impErr();
    ok('with no key set, the importer names GEMINI_API_KEY first and GROQ_API_KEY after',
       namesBoth(m, 'GEMINI_API_KEY', 'GROQ_API_KEY'), JSON.stringify(m));

    await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', 'beef goulash');
    await tap('#paImpGo');
    m = await impErr();
    ok('…and so does the recipe search', namesBoth(m, 'GEMINI_API_KEY', 'GROQ_API_KEY'), JSON.stringify(m));

    await mk(NO_KEY);
    await tap('#shopAddFab');
    await page.fill('#mainInput', 'milk, eggs');
    await tap('#smartBtn');
    await page.waitForTimeout(600);
    let s = await smartText();
    ok('…and so does Smart add', namesBoth(s, 'GEMINI_API_KEY', 'GROQ_API_KEY'), s.slice(0,140));

    /* ── B. a key that works, pointed at a model that is gone ───────────── */
    await mk(NO_MODEL);
    await openImporter('link');
    await page.fill('#paImpVal', 'https://recipes.example.com/goulash');
    await tap('#paImpGo');
    m = await impErr();
    ok('a model that is gone names GEMINI_MODEL first and GROQ_MODEL after',
       namesBoth(m, 'GEMINI_MODEL', 'GROQ_MODEL'), JSON.stringify(m));
    /* The v1.91 trap, still worth holding: this must not send someone to paste the text instead. */
    ok('…and still does not blame the input', m && !/pasting the recipe text/i.test(m), JSON.stringify(m));

    await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', 'beef goulash');
    await tap('#paImpGo');
    m = await impErr();
    ok('…on the recipe search too', namesBoth(m, 'GEMINI_MODEL', 'GROQ_MODEL'), JSON.stringify(m));

    await mk(NO_MODEL);
    await tap('#shopAddFab');
    await page.fill('#mainInput', 'milk, eggs');
    await tap('#smartBtn');
    await page.waitForTimeout(600);
    s = await smartText();
    ok('…and in Smart add', namesBoth(s, 'GEMINI_MODEL', 'GROQ_MODEL'), s.slice(0,160));

    /* ── C. NOT CHANGED: an ordinary failure is still an ordinary failure ─ */
    await mk({ status:502, body:{ error:'Parse failed', code:'upstream' } });
    await tap('#shopAddFab');
    await page.fill('#mainInput', 'qqqq');
    await tap('#smartBtn');
    await page.waitForTimeout(600);
    s = await smartText();
    ok('a plain upstream failure still gets the ordinary message', /try rephrasing/i.test(s), s.slice(0,140));
    ok('…and names no provider setting at all', !/GEMINI|GROQ/.test(s), s.slice(0,140));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
