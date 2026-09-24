/* v2.00 — the five findings from the design review, checked where they are visible.

   WHY THIS EXISTS: this version changes what the app LOOKS like, and a look is not self-evidently
   right — so what is checked here is not "it is prettier" but the specific claims each change makes,
   every one of which is falsifiable: a control is reachable without scrolling past nine others; the
   list gets the screen back; there is one filled action per sheet; a button does not out-weigh the
   thing it acts on; an icon is a drawn mark rather than a glyph.

   THE ONE THAT COULD BITE: folding sections BY DEFAULT hides controls that five older suites drive.
   They now seed `ml_optcoll` to "[]" — a device with nothing folded — as a precondition. The folding
   itself is therefore checked HERE, by tapping the real headers, or it would be checked nowhere.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the five heavy sections start folded and Sort is reachable without opening any of them;
   - folded is not hidden: tapping a header opens it and the controls inside work;
   - a choice, once made, is remembered — the default applies ONLY to a device that has never chosen;
   - the cart drawer starts closed and its count and action share one row;
   - the Add recipe sheet has exactly one filled commit button;
   - the saved-recipe strip and live results never stack on one screen;
   - the interface icons are drawn marks, not emoji glyphs, while CATEGORY emoji are untouched.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place. The seed here is a
     precondition (which sections are folded), never the thing being asserted.
   - v1.77: each page's nav carries its own ids.
   - v1.86: dismiss whatever is open before opening the next thing.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v1.94: the whole page's text is a haystack — read the one surface being tested. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* Deliberately does NOT write ml_optcoll — this is a device that has never chosen, which is the
   only state the default applies to. */
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"meat",label:"Meat",color:"#B5402B",emoji:"🥩",subs:[]},
              {id:"fresh",label:"Fresh",color:"#3B7DD8",emoji:"🥛",subs:[]}];
  const it=(id,n,c,ck)=>({id,name:n,cat:c,weight:"",qty:1,sub:"",checked:!!ck,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[it("1","beef mince","meat"),it("2","milk","fresh"),it("3","kitchen roll","fresh",true)],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{ days:{}, recipes:[{id:"r1",name:"Chicken curry",emoji:"",ing:[{name:"chicken",cat:"meat",qty:1,weight:"1 kg"}]}] } }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
})()`;

const IDEAS = { source:"model", provider:"", results:[
  { title:"Mushroom pizza", url:"", site:"", note:"Earthy" } ] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async()=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/recipe-search', r => r.fulfill({ status:200, contentType:'application/json',
      body:JSON.stringify(IDEAS) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(650); };
  const sections = ()=>page.evaluate(()=>[...document.querySelectorAll('.optsect')].map(h=>({
    name:h.dataset.sect, folded:h.getAttribute('aria-expanded')==='false' })));

  try{
    /* ── A. Settings opens on settings ─────────────────────────────────── */
    await mk();
    await tap('#setNav, #setNavP');
    const s = await sections();
    const folded = s.filter(x=>x.folded).map(x=>x.name).sort();
    ok('the five heavy sections start folded',
       JSON.stringify(folded)===JSON.stringify(['Bars and overlays','Category headings','Colour','Layout & motion','Tiles']),
       JSON.stringify(folded));
    ok('…and Appearance is not among them, since Theme and Text size are why people come',
       s.some(x=>x.name==='Appearance' && !x.folded), JSON.stringify(s.map(x=>x.name+(x.folded?'*':''))));

    /* The point of the whole change: reach Sort without opening anything. */
    const sortY = await page.evaluate(()=>{
      const h=[...document.querySelectorAll('.optsect')].find(x=>x.dataset.sect==='Sort');
      return h ? Math.round(h.getBoundingClientRect().top + window.scrollY) : null; });
    ok('Sort is reachable without opening a single folded section', sortY!==null && sortY < 1400,
       JSON.stringify({sortY}));

    /* ── B. folded is not hidden ───────────────────────────────────────── */
    const hiddenFirst = await page.evaluate(()=>!!document.querySelector('[data-opt-tilebg]')
      && document.querySelector('[data-opt-tilebg]').getBoundingClientRect().height===0);
    ok('a control inside a folded section is in the DOM but not on screen', hiddenFirst===true, '');
    await page.evaluate(()=>{ const h=[...document.querySelectorAll('.optsect')].find(x=>x.dataset.sect==='Tiles');
      if(h) h.click(); });
    await page.waitForTimeout(500);
    const shown = await page.evaluate(()=>{ const b=document.querySelector('[data-opt-tilebg]');
      return !!b && b.getBoundingClientRect().height>0; });
    ok('…and one tap on its header brings it back', shown===true, '');

    /* A default that overrode a choice would be worse than no default at all. */
    const remembered = await page.evaluate(()=>{ try{ return localStorage.getItem("ml_optcoll"); }catch(e){ return null; } });
    ok('…and the choice is written down, so the default never applies again',
       remembered!==null && !/Tiles/.test(remembered), JSON.stringify(remembered));

    /* ── C. the Shop page gets its screen back ─────────────────────────── */
    await mk();
    const drawer = await page.evaluate(()=>{
      const bar=document.querySelector('#checkedbar'); if(!bar) return null;
      const head=bar.querySelector('#checkedHead'), sweep=bar.querySelector('#sweepBtn');
      const hr=head.getBoundingClientRect(), sr=sweep.getBoundingClientRect();
      return { open:!!bar.querySelector('.checkedscroll'),
               sameRow: Math.abs((hr.top+hr.height/2)-(sr.top+sr.height/2)) < 8,
               h:Math.round(bar.getBoundingClientRect().height),
               label:sweep.textContent.trim() }; });
    ok('the cart drawer starts closed', drawer && drawer.open===false, JSON.stringify(drawer));
    ok('…with the count and the action on one row', drawer && drawer.sameRow===true, JSON.stringify(drawer));
    /* Closed it should be a row, not a panel — the number is what is worth a glance. */
    ok('…and the whole bar is one row tall', drawer && drawer.h < 110, JSON.stringify({h:drawer.h}));
    ok('…labelled for the room it has', drawer && drawer.label==='Finish', JSON.stringify(drawer.label));

    /* ── D. one filled action per sheet ────────────────────────────────── */
    await tap('#planNav, #planNavP'); await tap('.pdmore'); await tap('#pmRecipe');
    const filled = await page.evaluate(()=>{
      const sheet=document.querySelector('#paSheet'); if(!sheet) return null;
      const solid=[...sheet.querySelectorAll('button')].filter(b=>{
        const bg=getComputedStyle(b).backgroundColor;
        const m=bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/); if(!m) return false;
        const [r,g,bl]=[+m[1],+m[2],+m[3]];
        /* the accent, burnt orange — the app's one commit colour */
        return Math.abs(r-226)<40 && Math.abs(g-80)<45 && Math.abs(bl-44)<45; });
      return solid.map(b=>b.textContent.trim().slice(0,24)); });
    ok('the Add recipe sheet has exactly one button in the commit colour',
       filled && filled.length===1 && /Add to/.test(filled[0]), JSON.stringify(filled));

    /* ── E. one picker at a time ───────────────────────────────────────── */
    const before = await page.evaluate(()=>document.querySelectorAll('[data-precipe]').length);
    ok('precondition: the saved-recipe strip is there before a search', before>0, String(before));
    await tap('[data-pimp="search"]');
    await page.fill('#paImpVal','mushroom pizza'); await tap('#paImpGo');
    const after = await page.evaluate(()=>({
      saved:document.querySelectorAll('[data-precipe]').length,
      res:document.querySelectorAll('[data-pres]').length }));
    ok('…and it steps aside once results answer, so two pickers never stack',
       after.saved===0 && after.res>0, JSON.stringify(after));

    /* ── F. icons are drawn marks, emoji stay content ──────────────────── */
    const icons = await page.evaluate(()=>{
      const pick=s=>[...document.querySelectorAll(s)];
      return { chrome: pick('[data-pimp], [data-sscope], .presopen')
                 .map(b=>({ svg:!!b.querySelector('svg'), txt:b.textContent.trim() })),
               /* a category chip is CONTENT and keeps its emoji — the v1.58 line */
               cat: (document.querySelector('.cemoji, .chead .cemoji')||{}).textContent || '' }; });
    ok('every interface control draws its icon rather than spelling it',
       icons.chrome.length>0 && icons.chrome.every(c=>c.svg===true), JSON.stringify(icons.chrome.map(c=>c.svg)));
    ok('…and none of them still carries an emoji glyph',
       icons.chrome.every(c=>!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c.txt)),
       JSON.stringify(icons.chrome.map(c=>c.txt)));

    /* TEST BUG, v2.00: this tapped the nav straight from the open Add-recipe sheet, whose scrim owns
       the screen — the v1.86 note at the top of this file is about exactly this. Dismiss, then move. */
    await page.evaluate(()=>{ const b=document.querySelector('#paBg'); if(b) b.click(); });
    await page.waitForTimeout(600);
    await tap('#cartNavP, #cartNav');
    const catEmoji = await page.evaluate(()=>
      [...document.querySelectorAll('.cemoji')].map(e=>e.textContent.trim()).filter(Boolean));
    ok('…while category emoji are untouched, which is the whole distinction',
       catEmoji.some(e=>/[\u{1F300}-\u{1FAFF}]/u.test(e)), JSON.stringify(catEmoji.slice(0,4)));

    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
