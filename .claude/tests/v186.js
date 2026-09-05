/* v1.86 — a recipe can start from a link, a photo, or pasted text. Whichever is used, the ingredients
   come back into the SAME form the plan already had, with the name filled in, for checking before
   anything is added.

   The endpoint itself is tested separately and without a browser — `node .claude/tests/api-recipe.js`
   covers the URL guards, the JSON-LD extraction, the vision path and the coercion of the model's
   answer. This suite is the other half: what the app sends, and what it does with what comes back.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "three buttons exist":
   - each way in sends the RIGHT request — a link sends {url}, a paste sends {text}, a photo sends an
     {image} that has been re-encoded on the phone (a camera picture does not fit in the request);
   - what comes back fills the form and stops there: nothing reaches the day or the shopping list by
     importing, because the point is to check it first;
   - ingredients keep the category the parse gave them, so they land in the right aisle later;
   - a failure says what to do about it. The endpoint returns a code precisely so that "photo reading
     is not set up" and "that site blocks us" are different sentences, and both are checked;
   - importing is offered when adding a recipe and not when editing one.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent.
   - v1.83: not every action closes its sheet — dismiss explicitly rather than assuming.
   - v1.85: plan chips are pointer-event driven, so element.click() from page.evaluate fires nothing.
   - v1.86 (this suite): a step that opens the next day while the previous sheet is still up hits that
     sheet's scrim, not the day. The helper that opens a recipe dismisses whatever is open first, so a
     forgotten teardown cannot turn into a timeout ten checks later. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], categories:null, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{ days:{}, recipes:[] } }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

/* A 1×1 PNG. The app re-encodes whatever it is given to a downscaled JPEG before sending, which is the
   thing being checked — the pixels themselves do not matter. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const GOOD = { title:"Beef Goulash", servings:6, items:[
  { name:"ground beef", qty:2, weight:"2 pounds", category:"meat" },
  { name:"yellow onion", qty:2, weight:"", category:"vegetable" },
  { name:"tomato sauce", qty:1, weight:"3 cups", category:"others" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  let sent=null, reply={ status:200, body:GOOD };
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async()=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    /* The endpoint is exercised for real by api-recipe.js. Here it is stubbed so the CLIENT's half —
       what it sends and what it does with the answer — can be driven without a backend. */
    await ctx.route('**/api/recipe', r => {
      try{ sent = r.request().postDataJSON(); }catch(e){ sent = null; }
      r.fulfill({ status:reply.status, contentType:'application/json', body:JSON.stringify(reply.body) });
    });
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    /* Section 6 stubs 500s and 502s on purpose to check the messages they produce, and Chromium logs a
       "Failed to load resource" line for each. That is the browser reporting the status, not the app
       failing — the app's own handling of those statuses is what is being asserted. Everything else,
       including any error the app itself logs, still counts. */
    page.on('console',m=>{ if(m.type()!=='error') return;
      const t=m.text();
      if(/Failed to load resource/i.test(t)) return;
      errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
    await page.locator('#planNav').click(); await page.waitForTimeout(900);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(850); };
  const openRecipe = async(i)=>{
    await page.evaluate(()=>{ ['#paBg','#pmBg','#ppBg','#smartBg'].forEach(sel=>{ const b=document.querySelector(sel); if(b) b.click(); }); });
    await page.waitForTimeout(500);
    await page.locator('.planday').nth(i||0).locator('[data-pd]').click();
    await page.waitForTimeout(650); await tap('#pmRecipe'); };
  const sheet = ()=>page.evaluate(()=>{
    const s=document.querySelector('#paSheet'); if(!s) return { open:false };
    return { open:true,
      name:(document.querySelector('#paName')||{}).value,
      imports:[...s.querySelectorAll('[data-pimp]')].map(b=>b.textContent.trim()),
      panel:!!document.querySelector('#paImpVal'),
      panelTag:(document.querySelector('#paImpVal')||{}).tagName,
      note:(s.querySelector('.pimpnote')||{}).textContent,
      err:!!s.querySelector('.pimpnote.err'),
      ing:[...s.querySelectorAll('[data-pingrm]')].map(b=>b.textContent.replace(/×/g,'').trim()) };
  });
  const dayChips = (i)=>page.evaluate(n=>{ const d=[...document.querySelectorAll('.planday')][n];
    return d ? [...d.querySelectorAll('.pchip')].map(c=>c.textContent.trim()) : null; }, i||0);
  const listLen = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.length);

  try{
    /* ── 1. three ways in ───────────────────────────────────────────────── */
    await mk();
    await openRecipe(0);
    let s = await sheet();
    ok('the recipe sheet offers three ways to start', s.open===true && s.imports.length===3, JSON.stringify(s.imports));
    ok('…a link, a photo and pasted text',
       /link/i.test(s.imports[0]) && /photo/i.test(s.imports[1]) && /paste/i.test(s.imports[2]),
       JSON.stringify(s.imports));
    ok('…and none of them is open until asked', s.panel===false, JSON.stringify({panel:s.panel}));

    /* ── 2. a link ──────────────────────────────────────────────────────── */
    await tap('[data-pimp="link"]');
    s = await sheet();
    ok('"A link" opens a field for one', s.panel===true && s.panelTag==='INPUT', JSON.stringify({p:s.panel,t:s.panelTag}));
    await tap('[data-pimp="link"]');
    ok('…and tapping it again puts it away', (await sheet()).panel===false);
    await tap('[data-pimp="link"]');
    sent=null; reply={ status:200, body:GOOD };
    await page.locator('#paImpVal').fill('https://example.com/goulash');
    await tap('#paImpGo');
    await page.waitForTimeout(600);
    ok('reading a link sends the link, and nothing else', sent && sent.url==='https://example.com/goulash'
       && !sent.text && !sent.image, JSON.stringify(sent));
    s = await sheet();
    ok('…and the answer fills the recipe name', s.name==='Beef Goulash', JSON.stringify({name:s.name}));
    ok('…and its ingredients', s.ing.length===3 && /beef/i.test(s.ing.join('|')), JSON.stringify(s.ing));
    ok('…and the panel closes, having done its job', s.panel===false, JSON.stringify({panel:s.panel}));
    ok('…while the sheet stays open, so it can be checked first', s.open===true);
    ok('nothing was added to the day by importing', ((await dayChips(0))||[]).length===0, JSON.stringify(await dayChips(0)));
    ok('…and nothing to the shopping list', (await listLen())===0, String(await listLen()));

    /* ── 3. the imported ingredients keep their category ────────────────── */
    await tap('#paGo');
    const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).plan.recipes[0]);
    ok('adding it saves the recipe with its ingredients', saved && saved.ing.length===3, JSON.stringify(saved));
    ok('…each keeping the category the parse gave it',
       saved.ing.map(x=>x.cat).join(',')==='meat,vegetable,others', JSON.stringify(saved.ing));
    ok('…and only now is it on the day', ((await dayChips(0))||[]).some(c=>/Goulash/.test(c)),
       JSON.stringify(await dayChips(0)));

    /* ── 4. pasted text ─────────────────────────────────────────────────── */
    await openRecipe(1);
    await tap('[data-pimp="paste"]');
    s = await sheet();
    ok('"Paste text" opens a box to paste into', s.panel===true && s.panelTag==='TEXTAREA',
       JSON.stringify({p:s.panel,t:s.panelTag}));
    sent=null;
    await page.locator('#paImpVal').fill('Goulash\n2 lb beef\n2 onions');
    await tap('#paImpGo');
    await page.waitForTimeout(600);
    ok('reading a paste sends the text, and nothing else', sent && /beef/.test(sent.text||'')
       && !sent.url && !sent.image, JSON.stringify(sent));
    ok('…and it fills the same form', (await sheet()).ing.length===3, JSON.stringify((await sheet()).ing));

    /* ── 5. a photo ─────────────────────────────────────────────────────── */
    await openRecipe(2);
    sent=null;
    await page.locator('#paPhoto').setInputFiles({ name:'recipe.png', mimeType:'image/png', buffer:PNG_1PX });
    await page.waitForTimeout(1600);
    ok('a photo is sent as an image', sent && typeof sent.image==='string' && !sent.url && !sent.text,
       JSON.stringify({ keys:sent&&Object.keys(sent), head:sent&&String(sent.image).slice(0,24) }));
    ok('…re-encoded on the phone rather than sent as it came off the camera',
       sent && /^data:image\/jpeg;base64,/.test(sent.image), sent && String(sent.image).slice(0,32));
    ok('…and it fills the form too', (await sheet()).name==='Beef Goulash', JSON.stringify((await sheet()).name));

    /* ── 6. failures say what to do ─────────────────────────────────────── */
    await openRecipe(3);
    reply={ status:502, body:{ error:"x", code:"vision_model" } };
    await page.locator('#paPhoto').setInputFiles({ name:'r.png', mimeType:'image/png', buffer:PNG_1PX });
    await page.waitForTimeout(1600);
    s = await sheet();
    ok('a missing vision model says so, and says a link still works',
       s.err===true && /vision model/i.test(s.note||'') && /link|text/i.test(s.note||''), s.note);

    reply={ status:502, body:{ error:"x", code:"fetch_failed" } };
    await tap('[data-pimp="link"]');
    await page.locator('#paImpVal').fill('https://example.com/blocked');
    await tap('#paImpGo');
    await page.waitForTimeout(600);
    s = await sheet();
    ok('a site that blocks us says that, and suggests pasting instead',
       s.err===true && /block/i.test(s.note||'') && /past/i.test(s.note||''), s.note);

    reply={ status:500, body:{ error:"x", code:"not_configured" } };
    await tap('#paImpGo');
    await page.waitForTimeout(600);
    s = await sheet();
    ok('an unconfigured server names the key to set', s.err===true && /GROQ_API_KEY/.test(s.note||''), s.note);

    reply={ status:200, body:{ title:"", servings:4, items:[] } };
    await tap('#paImpGo');
    await page.waitForTimeout(600);
    s = await sheet();
    ok('a page with no ingredients in it says so rather than filling nothing in',
       s.err===true && /no ingredients/i.test(s.note||''), s.note);
    ok('…and the form is left alone', s.ing.length===0, JSON.stringify(s.ing));

    /* ── 7. not offered while editing ───────────────────────────────────── */
    reply={ status:200, body:GOOD };
    await page.evaluate(()=>{ const b=document.querySelector('#paBg'); if(b) b.click(); });
    await page.waitForTimeout(600);
    const chip = page.locator('.pchip').filter({ hasText:'Goulash' }).first();
    await chip.scrollIntoViewIfNeeded();
    const bb = await chip.boundingBox();
    await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2);
    await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
    await page.waitForTimeout(800);
    s = await sheet();
    ok('precondition: holding a recipe opens it for editing', s.open===true && s.ing.length===3, JSON.stringify(s.ing));
    ok('…where importing is not offered, because the recipe already exists', s.imports.length===0,
       JSON.stringify(s.imports));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
