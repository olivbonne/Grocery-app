/* v1.98 — two doors on every search result, neither of which needs a key.

   WHY THIS EXISTS: a search key was being treated as the price of getting to TikTok, and it never
   was. The ↗ is a LINK a finger follows — the browser does the work — so a key is only needed to
   LIST results inside the app, never to send someone to a search. v1.96 got this wrong in the other
   direction and made a keyless TikTok search REFUSE; the right answer was two links, always.

   WHAT THESE CHECKS HAVE TO PROVE:
   - every result carries both 🌐 and 🎵, whatever kind of result it is;
   - each door goes where it says: a real page opens itself and a real video plays itself, while a
     result with neither gets a SEARCH for its title rather than a fabricated url;
   - a TikTok result's 🌐 does not simply repeat the TikTok url — the two buttons must differ, or
     one of them is decoration;
   - a host that merely LOOKS like TikTok is not treated as one, matching the server-side guard —
     this is the check that would catch a loose regex letting tiktok.com.evil.example through;
   - with no key at all, the TikTok scope still gets somewhere: ideas, openly labelled as ideas,
     each one tap from TikTok's own search;
   - both links open away from the app without handing the opened page a reference back.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.77: each page's nav carries its own ids.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.90: a Playwright route handler is not a count of what the app did — count in the page.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v1.94: the whole page's text is a haystack — read the one surface being tested. */
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

/* One of each kind, plus the two host-spoof shapes the server-side guard also has to reject. */
const MIXED = { source:"web", provider:"tavily", results:[
  { title:"Best Beef Goulash", url:"https://recipes.example.com/goulash", site:"recipes.example.com", note:"A classic" },
  { title:"60-second goulash", url:"https://www.tiktok.com/@cook/video/123", site:"tiktok.com", note:"Quick" },
  { title:"Short link goulash", url:"https://vm.tiktok.com/ZM123/", site:"vm.tiktok.com", note:"Shared" },
  { title:"Lookalike goulash", url:"https://tiktok.com.evil.example/x", site:"tiktok.com.evil.example", note:"Not TikTok" },
  { title:"Hyphen goulash", url:"https://evil-tiktok.com/x", site:"evil-tiktok.com", note:"Also not" } ] };
const IDEAS = { source:"model", provider:"", results:[
  { title:"Classic beef goulash", url:"", site:"", note:"Paprika-heavy" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(answer)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe-search', r => r.fulfill({ status:200, contentType:'application/json',
      body:JSON.stringify(answer) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(700); };
  const search = async(q)=>{ await tap('#planNav, #planNavP, #planNavS'); await tap('.pdmore');
    await tap('#pmRecipe'); await tap('[data-pimp="search"]');
    await page.fill('#paImpVal', q); await tap('#paImpGo'); };
  /* Read the rows themselves, not the page text — v1.94's lesson. */
  const rows = ()=>page.evaluate(()=>[...document.querySelectorAll('.preswrap')].map(w=>({
    title:(w.querySelector('.pres-t')||{}).textContent||'',
    links:[...w.querySelectorAll('.presopen')].map(a=>({
      icon:a.textContent.trim(), href:a.getAttribute('href'),
      target:a.getAttribute('target'), rel:a.getAttribute('rel') })) })));

  try{
    await mk(MIXED);
    await search('beef goulash');
    const r = await rows();
    ok('every result carries both doors', r.length===5 && r.every(x=>x.links.length===2),
       JSON.stringify(r.map(x=>({t:x.title,n:x.links.length}))));
    ok('…the first a globe, the second a TikTok note, in that order',
       r.every(x=>x.links[0].icon==='🌐' && x.links[1].icon==='🎵'),
       JSON.stringify(r[0].links.map(l=>l.icon)));

    const byTitle = t => r.find(x=>x.title===t);
    const page1 = byTitle('Best Beef Goulash');
    ok('a real page opens itself under the globe',
       page1.links[0].href==='https://recipes.example.com/goulash', JSON.stringify(page1.links[0]));
    ok('…while its TikTok door goes looking on TikTok rather than nowhere',
       /^https:\/\/www\.tiktok\.com\/search\?q=/.test(page1.links[1].href), JSON.stringify(page1.links[1]));

    const vid = byTitle('60-second goulash');
    ok('a real video plays itself under the TikTok door',
       vid.links[1].href==='https://www.tiktok.com/@cook/video/123', JSON.stringify(vid.links[1]));
    /* If the globe just repeated the TikTok url, one of the two buttons would be decoration. */
    ok('…and its globe is a web search, not the same TikTok link again',
       /duckduckgo/.test(vid.links[0].href) && vid.links[0].href!==vid.links[1].href,
       JSON.stringify(vid.links[0]));

    const short = byTitle('Short link goulash');
    ok('a vm.tiktok.com share link counts as TikTok',
       short.links[1].href==='https://vm.tiktok.com/ZM123/', JSON.stringify(short.links[1]));

    /* The guard that matters: a host that merely looks like TikTok is not one. */
    const fake1 = byTitle('Lookalike goulash'), fake2 = byTitle('Hyphen goulash');
    ok('tiktok.com.evil.example is NOT treated as TikTok',
       !/evil\.example/.test(fake1.links[1].href)
       && /^https:\/\/www\.tiktok\.com\/search\?q=/.test(fake1.links[1].href), JSON.stringify(fake1.links[1]));
    ok('…and neither is evil-tiktok.com',
       !/evil-tiktok/.test(fake2.links[1].href)
       && /^https:\/\/www\.tiktok\.com\/search\?q=/.test(fake2.links[1].href), JSON.stringify(fake2.links[1]));

    ok('both doors open away from the app without handing it a reference back',
       r.every(x=>x.links.every(l=>l.target==='_blank' && /noopener/.test(l.rel||'') && /noreferrer/.test(l.rel||''))),
       JSON.stringify(r[0].links.map(l=>l.rel)));

    /* ── no key at all: ideas, and a way through to TikTok ─────────────── */
    await mk(IDEAS);
    await search('beef goulash');
    const idea = (await rows())[0];
    ok('with no key an idea still offers both doors', idea && idea.links.length===2,
       JSON.stringify(idea));
    ok('…neither of which claims to be a page it does not have',
       /^https:\/\/duckduckgo\.com\/\?q=/.test(idea.links[0].href)
       && /^https:\/\/www\.tiktok\.com\/search\?q=/.test(idea.links[1].href), JSON.stringify(idea.links));
    ok('…and the TikTok door carries the dish, so the search lands on something',
       /goulash/i.test(decodeURIComponent(idea.links[1].href)), JSON.stringify(idea.links[1].href));
    /* v1.96 refused here. Saying "these are ideas" is what makes showing them honest. */
    const note = await page.evaluate(()=>{ const p=document.querySelector('.pimpnote');
      return p ? p.textContent.trim() : null; });
    ok('…and the app says these are ideas rather than passing them off as results',
       note && /idea/i.test(note), JSON.stringify(note));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
