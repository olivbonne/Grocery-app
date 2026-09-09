/* v1.95 — every search result has a way through to a website, and a TikTok link can be read.

   WHY THIS EXISTS: v1.94 gave a search result a ↗ only when it had a page behind it, which was the
   right rule and a dead end in practice — with no SEARCH_API_KEY set, EVERY result is a model
   suggestion with no url, so the ↗ never appeared at all and a search could not reach a website.
   The user hit exactly that and reasonably read it as the results not working. The rule stays; the
   dead end goes.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a suggestion (no page of its own) still offers a route out, and that route is a SEARCH for the
     dish, not a fabricated page url — inventing a link would be worse than offering none;
   - a real web result still opens ITS page, not a search — the two cases must not collapse into one;
   - both open in a new context without handing the opened page a reference back;
   - what each one promises is readable, because "open the page" and "go looking for one" are
     different promises and the person is choosing between them;
   - a TikTok link is offered as a thing you can paste, and a caption with no recipe in it produces
     the sentence that says so rather than a generic failure. (The reading itself is proved in
     .claude/tests/api-recipe.js, which is where the request shape can actually be driven.)

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.77: each page's nav carries its own ids — Settings' Plan tab is #planNavS.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v1.94: do not assert against document.body.textContent — other UI answers first. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}];
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

/* What the user's own deployment returns today: no SEARCH_API_KEY, so dish names with no pages. */
const SUGGESTED = { source:"model", results:[
  { title:"Classic Wild Mushroom Pizza", url:"", site:"", note:"Chanterelles and porcini" },
  { title:"Truffle and Mushroom White Pizza", url:"", site:"", note:"Garlic cream base" } ] };
const FOUND = { source:"web", results:[
  { title:"Best Mushroom Pizza", url:"https://recipes.example.com/mushroom", site:"recipes.example.com", note:"A classic" } ] };
const NO_CAPTION = { status:502, body:{ error:'That TikTok description has no ingredients in it', code:'no_caption' } };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(search, recipe)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe', r => r.fulfill({ status:(recipe||{}).status||200, contentType:'application/json',
      body:JSON.stringify((recipe||{}).body || { title:"X", servings:2, items:[{name:"flour",qty:1,weight:"",category:"others"}] }) }));
    await ctx.route('**/api/recipe-search', r =>
      r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(search||SUGGESTED) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(700); };
  const openRecipe = async()=>{ await tap('#planNav, #planNavP, #planNavS'); await tap('.pdmore'); await tap('#pmRecipe'); };
  const search = async(q)=>{ await tap('[data-pimp="search"]'); await page.fill('#paImpVal', q); await tap('#paImpGo'); };
  const links = ()=>page.evaluate(()=>[...document.querySelectorAll('.presopen')].map(a=>({
    href:a.getAttribute('href'), target:a.getAttribute('target'), rel:a.getAttribute('rel'),
    label:a.getAttribute('aria-label')||'' })));

  try{
    /* ── A. a suggestion still gets you somewhere ───────────────────────── */
    await mk(SUGGESTED);
    await openRecipe();
    await search('mushroom pizza');
    let n = await page.evaluate(()=>({ res:document.querySelectorAll('[data-pres]').length,
                                       opens:document.querySelectorAll('.presopen').length }));
    /* SUPERSEDED by v1.98: one way out per suggestion became TWO — a globe to the web and a note to
       TikTok — because linking to a search never needed the key that listing results does. The
       guarantee this check protects is unchanged: every suggestion offers a way out. It is the
       count per row that moved, so count per row rather than assuming one. */
    ok('every suggestion now offers a way out, where none did before',
       n.res===2 && n.opens===n.res*2, JSON.stringify(n));

    let ls = await links();
    /* A suggestion has no page. Sending ↗ to a made-up url would be worse than offering nothing —
       it has to go looking, and say that it is going looking. */
    ok('…and it goes to a web SEARCH for the dish, not an invented page',
       ls[0] && /^https:\/\/duckduckgo\.com\/\?q=/.test(ls[0].href)
             && /mushroom/i.test(decodeURIComponent(ls[0].href)), JSON.stringify(ls[0]));
    ok('…searching for it as a recipe, not just the bare words',
       ls[0] && /recipe/i.test(decodeURIComponent(ls[0].href)), JSON.stringify(ls[0] && ls[0].href));
    ok('…and says that is what it will do', ls[0] && /search the web/i.test(ls[0].label), JSON.stringify(ls[0] && ls[0].label));
    ok('…opening it without handing the page a reference back',
       ls.every(l=>l.target==='_blank' && /noopener/.test(l.rel||'') && /noreferrer/.test(l.rel||'')), JSON.stringify(ls));

    const hint = await page.evaluate(()=>{ const p=document.querySelector('.pimpnote'); return p?p.textContent.trim():null; });
    /* SUPERSEDED by v1.98: the wording moved — "no web search is set up" became "no search key is
       set", and the single ↗ became 🌐 / 🎵. What the check is for has not moved: the line must say
       these are IDEAS rather than results, and must point at the way out. Assert the meaning, not
       the sentence, so a future rewording does not read as a regression. */
    ok('…and the line above them explains why they are suggestions',
       hint && /idea|suggestion/i.test(hint) && /🌐|🎵/.test(hint), JSON.stringify(hint));

    /* ── B. a real web result still opens ITS page ──────────────────────── */
    /* The two cases collapsing into one would be a silent regression: a real page turned into a
       search is worse than either, because the page was right there. */
    await mk(FOUND);
    await openRecipe();
    await search('mushroom pizza');
    ls = await links();
    ok('a real web result still opens its own page, not a search',
       ls[0] && ls[0].href==='https://recipes.example.com/mushroom', JSON.stringify(ls[0]));
    ok('…and promises that instead', ls[0] && /^open /i.test(ls[0].label), JSON.stringify(ls[0] && ls[0].label));
    ok('…while tapping the result itself still reads it into the form',
       await page.evaluate(()=>!!document.querySelector('.preswrap [data-pres]')), '');

    /* ── C. TikTok ──────────────────────────────────────────────────────── */
    await mk(SUGGESTED, NO_CAPTION);
    await openRecipe();
    await tap('[data-pimp="link"]');
    const ph = await page.evaluate(()=>{ const i=document.querySelector('#paImpVal'); return i?i.getAttribute('placeholder'):null; });
    ok('the link field says a TikTok is something you can paste', ph && /tiktok/i.test(ph), JSON.stringify(ph));

    await page.fill('#paImpVal', 'https://www.tiktok.com/@cook/video/123');
    await tap('#paImpGo');
    const msg = await page.evaluate(()=>{ const e=document.querySelector('.pimpnote.err'); return e?e.textContent.trim():null; });
    /* The failure mode that matters: the recipe was spoken, not written. Saying "couldn't read that"
       would send someone back to try the same link again. */
    ok('a TikTok whose caption has no recipe says exactly that',
       msg && /tiktok/i.test(msg) && /only in the video/i.test(msg), JSON.stringify(msg));
    /* TEST BUG, v1.95: this was /paste/i, and the sentence says "pasting" — which does not contain
       "paste". The check failed while the app was right, which is the direction that wastes the most
       time, so the pattern matches the word as it is actually written. */
    ok('…and points at what will work instead', msg && /past(e|ing)/i.test(msg), JSON.stringify(msg));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
