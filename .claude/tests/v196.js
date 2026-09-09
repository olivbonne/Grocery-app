/* v1.96 — searching TikTok from the app, and a search backend that does not need a credit card.

   WHY THIS EXISTS: the person using this could not use Brave, whose free tier asks for a card, so
   the backend became pluggable — that half is proved in .claude/tests/api-recipe-search.js, which
   is where a provider can actually be driven. What this suite covers is the half a finger touches:
   the scope toggle, that the choice REACHES the endpoint, and that a TikTok search leads somewhere
   a TikTok video actually is.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the toggle exists, defaults to Web, and switching it is visible;
   - the chosen scope is what the endpoint is actually asked for — a toggle that looks right and
     sends "web" regardless is the failure worth catching here;
   - switching scope clears results from the other scope, so web pages never sit under a TikTok
     heading;
   - a tapped TikTok result is sent to the reader as a URL, which is what makes the search compose
     with the caption reader v1.95 built;
   - with no search key, a TikTok search still gets somewhere: dish ideas, each openly an idea, each
     carrying a link into TikTok's own search — which is what actually puts a video in front of the
     person (SUPERSEDED by v1.98; see section C);
   - every result offers both doors, 🌐 and 🎵, neither of which needs a key, because they are links.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.77: each page's nav carries its own ids.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.90: a Playwright route handler is not a count of what the app did — count in the page.
   - v1.91: assert WHICH value appeared, never merely that something appeared. */
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

/* Counted in the page, not in the route handler — see the v1.90 note above. */
const COUNTER = `(() => { window.__api=[]; const of=window.fetch;
  window.fetch=function(u,o){ try{ if(String(u).indexOf("/api/")>=0)
    window.__api.push({ url:String(u), body:JSON.parse((o&&o.body)||"{}") }); }catch(e){}
    return of.apply(this,arguments); }; })()`;

const WEB_HITS = { source:"web", provider:"tavily", results:[
  { title:"Best Beef Goulash", url:"https://recipes.example.com/goulash", site:"recipes.example.com", note:"A classic" } ] };
const TIKTOK_HITS = { source:"web", provider:"tavily", results:[
  { title:"60-second goulash", url:"https://www.tiktok.com/@cook/video/123", site:"tiktok.com", note:"Quick" } ] };
const SUGGESTED = { source:"model", provider:"", results:[
  { title:"Classic beef goulash", url:"", site:"", note:"Paprika-heavy" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  /* `answer` is a function of the scope the app asked for, so one context serves a whole walk. */
  const mk = async(answer)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe-search', r => {
      let scope='web';
      try{ scope=(JSON.parse(r.request().postData()||'{}').scope)||'web'; }catch(e){}
      const a=answer(scope);
      r.fulfill({ status:a.status||200, contentType:'application/json', body:JSON.stringify(a.body||a) });
    });
    await ctx.route('**/api/recipe', r => r.fulfill({ status:200, contentType:'application/json',
      body:JSON.stringify({ title:"Goulash", servings:4, items:[{name:"beef",qty:1,weight:"2 lb",category:"meat"}] }) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(COUNTER);
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(700); };
  const calls = ()=>page.evaluate(()=>window.__api||[]);
  const openSearch = async()=>{ await tap('#planNav, #planNavP, #planNavS'); await tap('.pdmore');
    await tap('#pmRecipe'); await tap('[data-pimp="search"]'); };
  const find = async(q)=>{ await page.fill('#paImpVal', q); await tap('#paImpGo'); };
  const titles = ()=>page.evaluate(()=>[...document.querySelectorAll('.pres-t')].map(t=>t.textContent.trim()));

  try{
    /* ── A. the toggle, and what it actually sends ──────────────────────── */
    await mk(scope => scope==='tiktok' ? TIKTOK_HITS : WEB_HITS);
    await openSearch();
    const toggle = await page.evaluate(()=>[...document.querySelectorAll('[data-sscope]')]
      .map(b=>({ v:b.dataset.sscope, on:b.classList.contains('on') })));
    ok('the search offers a Web / TikTok choice', toggle.length===2
       && toggle.map(t=>t.v).join('|')==='web|tiktok', JSON.stringify(toggle));
    ok('…starting on Web, which is what it did before this version',
       toggle[0].on===true && toggle[1].on===false, JSON.stringify(toggle));

    await find('beef goulash');
    let c = await calls();
    ok('a Web search asks the endpoint for the web scope',
       c.length===1 && c[0].body.scope==='web' && c[0].body.q==='beef goulash', JSON.stringify(c));

    /* The toggle looking right while sending "web" regardless is the bug worth catching. */
    await tap('[data-sscope="tiktok"]');
    ok('switching to TikTok clears the web results rather than leaving them under it',
       (await titles()).length===0, JSON.stringify(await titles()));
    await find('beef goulash');
    c = await calls();
    ok('…and the next search really is asked for the tiktok scope',
       c.length===2 && c[1].body.scope==='tiktok', JSON.stringify(c.map(x=>x.body)));
    ok('…coming back with a video, not a page', (await titles()).join()==='60-second goulash',
       JSON.stringify(await titles()));

    /* ── B. the search composes with the caption reader from v1.95 ─────── */
    await tap('[data-pres="0"]');
    c = await calls();
    const read = c.filter(x=>/\/api\/recipe$/.test(x.url));
    ok('tapping a TikTok result sends that video to the reader, by url',
       read.length===1 && read[0].body.url==='https://www.tiktok.com/@cook/video/123',
       JSON.stringify(read.map(x=>x.body)));

    /* ── C. no search key: ideas, plus a real way through to TikTok ─────
       SUPERSEDED by v1.98: v1.96 asserted a TikTok search with no key showed a message naming
       TAVILY_API_KEY and NO results, on the reasoning that an invented title is not a video. That was
       right about the danger and wrong about the remedy. Refusing left the person with nothing; and
       the danger — passing an idea off as a video — is gone now that every result carries its own 🎵
       to TikTok's real search. Same concern, better answer: show the ideas, label them as ideas, and
       hand each one a tap that lands on actual TikTok videos. */
    await mk(scope => SUGGESTED);
    await openSearch();
    await tap('[data-sscope="tiktok"]');
    await find('beef goulash');
    ok('a TikTok search with no key offers dish ideas rather than a dead end',
       (await titles()).join()==='Classic beef goulash', JSON.stringify(await titles()));
    const msg = await page.evaluate(()=>{ const e=document.querySelector('.pimpnote');
      return e ? e.textContent.trim() : null; });
    ok('…and says plainly that they are ideas, not search results',
       msg && /idea/i.test(msg), JSON.stringify(msg));
    let hrefs = await page.evaluate(()=>[...document.querySelectorAll('.presopen')].map(a=>a.getAttribute('href')));
    ok('…each carrying a tap through to TikTok\'s own search, no key needed',
       hrefs.length===2 && /^https:\/\/www\.tiktok\.com\/search\?q=/.test(hrefs[1]||'')
       && /goulash/i.test(decodeURIComponent(hrefs[1]||'')), JSON.stringify(hrefs));

    /* ── D. both doors, on both scopes ──────────────────────────────────── */
    await tap('[data-sscope="web"]');
    await find('beef goulash');
    hrefs = await page.evaluate(()=>[...document.querySelectorAll('.presopen')].map(a=>a.getAttribute('href')));
    ok('with no key, a Web suggestion still offers a web search and a TikTok search',
       hrefs.length===2 && /duckduckgo/.test(hrefs[0]||'')
       && /^https:\/\/www\.tiktok\.com\/search\?q=/.test(hrefs[1]||''), JSON.stringify(hrefs));

    await mk(scope => scope==='tiktok' ? TIKTOK_HITS : WEB_HITS);
    await openSearch();
    await tap('[data-sscope="tiktok"]');
    await find('beef goulash');
    hrefs = await page.evaluate(()=>[...document.querySelectorAll('.presopen')].map(a=>a.getAttribute('href')));
    ok('a real TikTok result points its 🎵 at the video itself',
       hrefs.length===2 && hrefs[1]==='https://www.tiktok.com/@cook/video/123', JSON.stringify(hrefs));
    ok('…and its 🌐 searches the web rather than claiming the tiktok url is a page',
       /^https:\/\/duckduckgo\.com\/\?q=/.test(hrefs[0]||''), JSON.stringify(hrefs));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
