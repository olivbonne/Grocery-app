/* v1.99 — tapping 🎵 copies the dish, because TikTok will not carry it.

   WHY THIS EXISTS: reported from a real phone. Tapping 🎵 opened TikTok with an EMPTY search box —
   the app drops the query when a tiktok.com/search link hands off to it, whatever the link said.
   No URL shape survives that handoff, and a custom app scheme (snssdk1233://) fails with nothing to
   fall back on when the app is not installed. Copying is the move that works either way: the link
   still opens TikTok, and the dish is already on the clipboard for one paste.

   WHAT THESE CHECKS HAVE TO PROVE:
   - tapping the TikTok SEARCH link puts the dish on the clipboard, and says so;
   - what lands there is the dish, not the whole URL — pasting a link into a search box is useless;
   - a 🎵 that opens a real VIDEO copies nothing, because there is nothing to paste there;
   - the 🌐 link copies nothing either — this is TikTok's problem, not the web's;
   - and the link still works when the clipboard is REFUSED, which is the case that matters most:
     a permission prompt denied must not swallow the navigation as well.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.77: each page's nav carries its own ids.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v1.98: target=_blank opens a new tab in a real browser — a suite must not let it navigate away,
     so the anchors are neutralised AFTER their handler is bound, never before. */
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

/* `fail` makes the clipboard reject, which is a real state on a phone: permission denied. */
const SPY = (fail)=>`(() => { window.__copied=[];
  const cb = { writeText:(t)=>{ window.__copied.push(t);
    return ${fail?'Promise.reject(new Error("denied"))':'Promise.resolve()'}; } };
  try{ Object.defineProperty(navigator, "clipboard", { value: cb, configurable: true }); }catch(e){}
})()`;

const IDEAS = { source:"model", provider:"", results:[
  { title:"Mushroom pizza", url:"", site:"", note:"Earthy" } ] };
const VIDEO = { source:"web", provider:"tavily", results:[
  { title:"60-second goulash", url:"https://www.tiktok.com/@cook/video/123", site:"tiktok.com", note:"Quick" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(answer, failCopy)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe-search', r => r.fulfill({ status:200, contentType:'application/json',
      body:JSON.stringify(answer) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SPY(failCopy));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(700); };
  const search = async(q)=>{ await tap('#planNav, #planNavP, #planNavS'); await tap('.pdmore');
    await tap('#pmRecipe'); await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', q); await tap('#paImpGo'); };
  const copied = ()=>page.evaluate(()=>window.__copied||[]);
  /* The handler is bound at render; neutralising href/target AFTER that leaves the handler intact
     while stopping the suite from actually sailing off to tiktok.com. */
  const defuse = ()=>page.evaluate(()=>[...document.querySelectorAll('.presopen')]
    .forEach(a=>{ a.removeAttribute('target'); a.setAttribute('href','#'); }));

  try{
    /* ── A. a search link copies the dish ──────────────────────────────── */
    await mk(IDEAS);
    await search('mushroom pizza');
    const hasQ = await page.evaluate(()=>{
      const a=[...document.querySelectorAll('.presopen')];
      return { tk:(a[1]||{}).dataset ? a[1].dataset.tkq : null, web:(a[0]||{}).dataset ? a[0].dataset.tkq : null }; });
    ok('the TikTok search link carries the dish to copy', hasQ.tk==='Mushroom pizza recipe', JSON.stringify(hasQ));
    ok('…and the web link carries none, because this is TikTok\'s problem alone',
       hasQ.web===undefined || hasQ.web===null || hasQ.web==='', JSON.stringify(hasQ));

    await defuse();
    await page.evaluate(()=>document.querySelectorAll('.presopen')[1].click());
    await page.waitForTimeout(500);
    let c = await copied();
    ok('tapping 🎵 puts the dish on the clipboard', c.length===1 && c[0]==='Mushroom pizza recipe', JSON.stringify(c));
    /* Pasting a URL into a search box would be useless — it has to be the words. */
    ok('…the words, not the link', !/https?:\/\//.test(c[0]||''), JSON.stringify(c));
    const toast = await page.evaluate(()=>document.body.textContent);
    ok('…and the app says so, so nobody wonders why they are pasting',
       /copied/i.test(toast) && /paste/i.test(toast), (toast.match(/Copied[^"]{0,60}/)||[''])[0]);

    /* ── B. nothing to paste on a real video ───────────────────────────── */
    await mk(VIDEO);
    await search('goulash');
    await defuse();
    await page.evaluate(()=>document.querySelectorAll('.presopen')[1].click());
    await page.waitForTimeout(500);
    ok('a 🎵 that opens the actual video copies nothing', (await copied()).length===0,
       JSON.stringify(await copied()));

    await page.evaluate(()=>document.querySelectorAll('.presopen')[0].click());
    await page.waitForTimeout(500);
    ok('…and neither does the 🌐', (await copied()).length===0, JSON.stringify(await copied()));

    /* ── C. a refused clipboard must not swallow the link ──────────────── */
    /* This is the case that matters most: a denied permission that also broke navigation would be
       strictly worse than never having copied at all. */
    await mk(IDEAS, true);
    await search('mushroom pizza');
    const href = await page.evaluate(()=>document.querySelectorAll('.presopen')[1].getAttribute('href'));
    await defuse();
    await page.evaluate(()=>document.querySelectorAll('.presopen')[1].click());
    await page.waitForTimeout(600);
    ok('a refused clipboard is survivable — the link is still a link',
       /^https:\/\/www\.tiktok\.com\/search\?q=/.test(href||''), JSON.stringify(href));
    ok('…and the refusal does not take the page down with it', errors.length===0, errors.join(' | '));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
