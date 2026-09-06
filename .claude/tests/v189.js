/* v1.89 — four things: search for a recipe from inside the app; delete a saved recipe; editing a recipe
   offers the same ways in as adding one; and the + can be moved without hunting through Settings.

   The two endpoints are tested separately and without a browser — `node .claude/tests/api-recipe.js`
   and `node .claude/tests/api-recipe-search.js`. This suite is the app's half.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a web result and a model suggestion are DIFFERENT things and the app treats them differently: one
     is a page to read ({url}), the other a dish to write out ({dish}), and the user is told which they
     are looking at. Passing suggestions off as search results would be a lie the code could tell easily;
   - deleting a recipe asks first, and a day already carrying it keeps something readable — a plan full
     of blank chips would be a worse outcome than not deleting at all;
   - editing offers the same four ways in, and an import while editing does not quietly turn the edit
     into a new recipe (that is one `rid=""` away, so it is measured through to what gets saved);
   - the + moves from a press-and-hold on the + itself. v1.88 shipped this setting ~1,820px down the
     Settings page, which is why it needed doing twice: the mechanism was right and unreachable. So the
     check is that the gesture works AND that a plain tap still adds an item.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent.
   - v1.83: not every action closes its sheet, and window.confirm/prompt halt the page — handle dialogs.
   - v1.85: pointer-driven controls ignore element.click() from page.evaluate.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.89 (this suite): mk() leaves the app on the Plan page, where the Shop tab is #cartNavP — the
     v1.77 note about per-page nav ids applies to the SETUP as much as to the checks. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* A recipe already saved AND already on a day, so deleting it has something to leave behind. */
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7));
  const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:null, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{ days:{ [k]:[ {id:"pe1",kind:"recipe",name:"Old Stew",emoji:"",rid:"pr1"} ] },
           recipes:[ {id:"pr1",name:"Old Stew",emoji:"",ing:[{name:"onion",cat:"vegetable"},{name:"beef",cat:"meat"}]} ] } }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

const WEB = { source:"web", results:[
  { title:"The Best American Beef Goulash", url:"https://recipes.example.com/goulash", site:"recipes.example.com", note:"A classic one-pot stew" },
  { title:"Quick Goulash", url:"https://cooking.example.org/quick", site:"cooking.example.org", note:"Weeknight version" } ] };
const IDEAS = { source:"model", results:[
  { title:"Classic beef goulash", url:"", site:"", note:"Paprika-heavy, slow cooked" },
  { title:"Quick weeknight goulash", url:"", site:"", note:"Under an hour" } ] };
const IMPORTED = { title:"Beef Goulash", servings:6, items:[
  { name:"ground beef", qty:2, weight:"2 pounds", category:"meat" },
  { name:"yellow onion", qty:2, weight:"", category:"vegetable" },
  { name:"paprika", qty:1, weight:"1 tbsp", category:"others" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  let searchSent=null, importSent=null;
  let searchReply={ status:200, body:WEB }, importReply={ status:200, body:IMPORTED };
  let confirmAnswer=true, confirmSeen=null;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async()=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe-search', r => {
      try{ searchSent = r.request().postDataJSON(); }catch(e){ searchSent=null; }
      r.fulfill({ status:searchReply.status, contentType:'application/json', body:JSON.stringify(searchReply.body) }); });
    await ctx.route('**/api/recipe', r => {
      try{ importSent = r.request().postDataJSON(); }catch(e){ importSent=null; }
      r.fulfill({ status:importReply.status, contentType:'application/json', body:JSON.stringify(importReply.body) }); });
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    /* Deliberate non-2xx stubs make Chromium log the status; that is the browser, not the app. */
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    page.on('dialog', d=>{ confirmSeen=d.message(); (confirmAnswer?d.accept():d.dismiss()).catch(()=>{}); });
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
    await page.locator('#planNav').click(); await page.waitForTimeout(900);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(800); };
  const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
    await page.mouse.move(b.x+b.width/2, b.y+b.height/2);
    await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
    await page.waitForTimeout(800); };
  const dismissAll = ()=>page.evaluate(()=>{ ['#paBg','#pmBg','#ppBg','#smartBg','#fabMoveBg'].forEach(s=>{
    const b=document.querySelector(s); if(b) b.click(); }); });
  const openRecipe = async(i)=>{ await dismissAll(); await page.waitForTimeout(450);
    await page.locator('.planday').nth(i||0).locator('[data-pd]').click();
    await page.waitForTimeout(600); await tap('#pmRecipe'); };
  const sheet = ()=>page.evaluate(()=>{
    const s=document.querySelector('#paSheet'); if(!s) return { open:false };
    return { open:true,
      head:(s.querySelector('.disp')||{}).textContent,
      name:(document.querySelector('#paName')||{}).value,
      imports:[...s.querySelectorAll('[data-pimp]')].map(b=>b.textContent.trim()),
      picks:[...s.querySelectorAll('[data-precipe]')].map(b=>b.textContent.trim()),
      dels:s.querySelectorAll('[data-precdel]').length,
      note:(s.querySelector('.pimpnote')||{}).textContent,
      res:[...s.querySelectorAll('[data-pres]')].map(b=>({
        t:(b.querySelector('.pres-t')||{}).textContent, s:(b.querySelector('.pres-s')||{}).textContent })),
      ing:[...s.querySelectorAll('[data-pingrm]')].map(b=>b.textContent.replace(/×/g,'').trim()) };
  });
  const recipes = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).plan.recipes);
  const dayChips = ()=>page.evaluate(()=>{ const d=document.querySelector('.planday');
    return d ? [...d.querySelectorAll('.pchip')].map(c=>c.textContent.trim()) : null; });

  try{
    /* ── A. search ──────────────────────────────────────────────────────── */
    await mk();
    await openRecipe(1);
    let s = await sheet();
    ok('the recipe sheet offers four ways to start', s.imports.length===4, JSON.stringify(s.imports));
    ok('…with Search among them', /search/i.test(s.imports.join('|')), JSON.stringify(s.imports));
    await tap('[data-pimp="search"]');
    ok('Search opens a field to type a dish into',
       (await page.locator('#paImpVal').count())===1 && (await page.locator('#paImpGo').count())===1);

    searchSent=null; searchReply={ status:200, body:WEB };
    await page.locator('#paImpVal').fill('beef goulash');
    await tap('#paImpGo');
    await page.waitForTimeout(500);
    ok('Find sends the dish to the search', searchSent && searchSent.q==='beef goulash', JSON.stringify(searchSent));
    s = await sheet();
    ok('…and the results come back to choose from', s.res.length===2, JSON.stringify(s.res.map(r=>r.t)));
    ok('…each naming the site it came from', s.res[0].s==='recipes.example.com', JSON.stringify(s.res[0]));
    ok('…and the app says these came from the web', /from the web/i.test(s.note||''), s.note);

    importSent=null; importReply={ status:200, body:IMPORTED };
    await tap('[data-pres]');
    await page.waitForTimeout(500);
    ok('picking a web result asks for THAT PAGE to be read',
       importSent && importSent.url==='https://recipes.example.com/goulash' && !importSent.dish,
       JSON.stringify(importSent));
    s = await sheet();
    ok('…and it fills the form', s.name==='Beef Goulash' && s.ing.length===3, JSON.stringify({n:s.name, i:s.ing}));
    ok('…with the search cleared away, having done its job', s.res.length===0, JSON.stringify(s.res));

    /* a suggestion is not a search result, and must not be treated as one */
    await openRecipe(2);
    await tap('[data-pimp="search"]');
    searchReply={ status:200, body:IDEAS }; importSent=null;
    await page.locator('#paImpVal').fill('goulash');
    await tap('#paImpGo');
    await page.waitForTimeout(500);
    s = await sheet();
    ok('with no web search set up, the app says the results are suggestions',
       /suggestion/i.test(s.note||'') && !/from the web/i.test(s.note||''), s.note);
    ok('…and they carry no site, because there is no page', s.res.every(r=>!r.s), JSON.stringify(s.res));
    await tap('[data-pres]');
    await page.waitForTimeout(500);
    ok('picking one asks for that DISH to be written out, not for a page',
       importSent && importSent.dish==='Classic beef goulash' && !importSent.url, JSON.stringify(importSent));
    ok('…and it fills the same form', (await sheet()).ing.length===3, JSON.stringify((await sheet()).ing));

    await openRecipe(3);
    await tap('[data-pimp="search"]');
    searchReply={ status:502, body:{ error:'x', code:'search_key' } };
    await page.locator('#paImpVal').fill('goulash');
    await tap('#paImpGo');
    await page.waitForTimeout(500);
    ok('a refused search key names the key to set', /SEARCH_API_KEY/.test((await sheet()).note||''), (await sheet()).note);
    searchReply={ status:404, body:{ error:'x', code:'no_results' } };
    await tap('#paImpGo');
    await page.waitForTimeout(500);
    ok('…and nothing found says so plainly', /nothing found/i.test((await sheet()).note||''), (await sheet()).note);

    /* ── B. deleting a saved recipe ─────────────────────────────────────── */
    await openRecipe(4);
    s = await sheet();
    ok('precondition: a saved recipe is offered', s.picks.some(p=>/Old Stew/.test(p)), JSON.stringify(s.picks));
    ok('…and every saved recipe has a delete beside it', s.dels===s.picks.length && s.dels>0,
       JSON.stringify({dels:s.dels, picks:s.picks.length}));

    confirmAnswer=false; confirmSeen=null;
    await tap('[data-precdel]');
    ok('deleting asks first', /delete/i.test(confirmSeen||''), String(confirmSeen));
    ok('…and saying no keeps it', (await recipes()).some(r=>r.name==='Old Stew'),
       JSON.stringify((await recipes()).map(r=>r.name)));

    confirmAnswer=true;
    await tap('[data-precdel]');
    ok('…and saying yes removes it', !(await recipes()).some(r=>r.name==='Old Stew'),
       JSON.stringify((await recipes()).map(r=>r.name)));
    await dismissAll(); await page.waitForTimeout(500);
    ok('a day already carrying it still reads properly', (await dayChips()||[]).some(c=>/Old Stew/.test(c)),
       JSON.stringify(await dayChips()));

    /* ── C. editing offers the same ways in ─────────────────────────────── */
    await mk();
    await hold(page.locator('.pchip').filter({ hasText:'Old Stew' }).first());
    s = await sheet();
    ok('precondition: holding a recipe opens it for editing', /Edit recipe/.test(s.head||''), s.head);
    ok('editing offers the same four ways in', s.imports.length===4, JSON.stringify(s.imports));
    ok('…but not the picker for a different recipe, which would change what you are saving over',
       s.picks.length===0, JSON.stringify(s.picks));

    const ridBefore = (await recipes())[0].id;
    const nBefore = (await recipes()).length;
    await tap('[data-pimp="paste"]');
    importSent=null; importReply={ status:200, body:IMPORTED };
    await page.locator('#paImpVal').fill('some recipe text');
    await tap('#paImpGo');
    await page.waitForTimeout(500);
    s = await sheet();
    ok('an import while editing keeps the name being edited', s.name==='Old Stew', JSON.stringify({n:s.name}));
    ok('…and adds its ingredients to the ones already there', s.ing.length===5, JSON.stringify(s.ing));
    await tap('#paGo');
    const after = await recipes();
    ok('…and saving updates that same recipe rather than making a second',
       after.length===nBefore && after[0].id===ridBefore, JSON.stringify({before:nBefore, after:after.length, id:after[0].id}));
    ok('…with the imported ingredients on it', after[0].ing.length===5, JSON.stringify(after[0].ing.map(x=>x.name)));

    /* ── D. moving the + without hunting ────────────────────────────────── */
    await mk();
    await tap('#cartNav, #cartNavP, #cartNavS');   // v1.77: each page's nav carries its own ids
    const base = await page.evaluate(()=>{ const p=document.querySelector('#shopAddFab');
      const r=p.getBoundingClientRect(); return { vw:window.innerWidth, l:Math.round(r.left), r:Math.round(r.right) }; });
    ok('precondition: the + starts inset from both edges', base.l>0 && base.r<base.vw, JSON.stringify(base));

    await tap('#shopAddFab');
    ok('a tap still opens the add sheet', (await page.locator('#addSheet').count())===1,
       String(await page.locator('#addSheet').count()));
    await page.locator('#addDone').click(); await page.waitForTimeout(1500);

    await hold(page.locator('#shopAddFab'));
    const mv = await page.evaluate(()=>{ const s=document.querySelector('#fabMoveSheet'); if(!s) return null;
      return { head:(s.querySelector('.disp')||{}).textContent,
               opts:[...s.querySelectorAll('[data-fabalign]')].map(b=>({k:b.dataset.fabalign, on:b.classList.contains('on')})) }; });
    ok('a press-and-hold on the + asks where it should sit', !!mv, JSON.stringify(mv));
    ok('…offering left, centre and right', mv && mv.opts.map(o=>o.k).join('|')==='left|center|right',
       JSON.stringify(mv && mv.opts));
    ok('…with the one it is on marked', mv && (mv.opts.find(o=>o.on)||{}).k==='center', JSON.stringify(mv && mv.opts));

    await tap('[data-fabalign="right"]');
    const moved = await page.evaluate(()=>{ const p=document.querySelector('#shopAddFab');
      const r=p.getBoundingClientRect();
      return { vw:window.innerWidth, r:Math.round(r.right), sheet:!!document.querySelector('#fabMoveSheet'),
               stored:localStorage.getItem('ml_srchalign') }; });
    ok('choosing Right puts the + on the right edge', moved.r===moved.vw, JSON.stringify(moved));
    ok('…closes the sheet', moved.sheet===false, JSON.stringify({s:moved.sheet}));
    ok('…and it is the same setting Settings holds', moved.stored==='right', String(moved.stored));

    await hold(page.locator('#shopAddFab'));
    await tap('[data-fabalign="left"]');
    const left = await page.evaluate(()=>Math.round(document.querySelector('#shopAddFab').getBoundingClientRect().left));
    ok('…and Left puts it on the other one', left===0, String(left));
    await hold(page.locator('#shopAddFab'));
    await tap('[data-fabalign="center"]');
    const back = await page.evaluate(()=>{ const r=document.querySelector('#shopAddFab').getBoundingClientRect();
      return { vw:window.innerWidth, l:Math.round(r.left), r:Math.round(r.right) }; });
    ok('…and Centre gives back exactly what it started as',
       back.l===base.l && back.r===base.r, JSON.stringify({base, back}));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
