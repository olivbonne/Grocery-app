/* v2.05 — Your recipes: folded away, A–Z or by course; one search instead of Web / TikTok.

   WHY THIS EXISTS: two household requests. "Remove web and TikTok option as both are presented as
   result anyway" — every result already carries a web button and a TikTok button. "Allow your recipes
   to be collapsed and organised by alphabetical order or categories: drinks, entrée, main, dessert."
   Courses are new DATA (recipe.course), so this also checks the normaliser trap: a course chosen in
   the form must survive being saved.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the search has no scope switch and only ever asks for the web scope;
   - A–Z is the default, really alphabetical, and keeps its six-then-"Show all";
   - Course groups in Drinks · Entrée · Main · Dessert order, with older recipes placed by a guess
     from their name (cheesecake → Dessert, soup and salad → Entrée, spritz → Drinks), and no cap;
   - the sort and the fold are remembered on the device, across closing the sheet;
   - neither control is drawn in the commit colour (the choose step has none — v2.03);
   - the form offers the course, pre-selected; a changed course is SAVED on the recipe and moves it;
   - both new keys are kept out of appearance slots (APP_EXCLUDE_BOOT and APP_EXCLUDE — CLAUDE.md).

   TEST-BUG NOTES CARRIED FORWARD: v1.86 dismiss before opening; v1.91 assert WHICH value; v2.00 the
   seed returns early once seeded. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const NAMES=["Chicken in soya sauce with choysum","quesadillas","Pad Thai","onion soup","Vietnamese Chicken Salad",
             "Seafood Spaghetti","Traditional Basque Burnt Cheesecake","mushrooms pizza","40 cloves garlic chicken","Aperol spritz"];
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const recipes=${JSON.stringify(NAMES)}.map((n,i)=>({id:"r"+i,name:n,emoji:"",servings:4,src:"",steps:[],
    ing:[{name:"garlic",cat:"vegetable",qty:1,weight:""}]}));
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"],
    name:"Sandbox", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes,saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]");
})()`;
const IDEAS = { source:"model", provider:"", results:[{ title:"Mushroom pizza", url:"", site:"", note:"Earthy" }] };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[], calls=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
  await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
  await ctx.route('**/api/recipe-search', r => { try{ calls.push(JSON.parse(r.request().postData()||'{}')); }catch(e){}
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(IDEAS) }); });
  const page = await ctx.newPage(); page.setDefaultTimeout(9000);
  page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  await page.addInitScript(SEED);
  await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1600);
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(550); };
  const open = async()=>{ await page.evaluate(()=>{ const b=document.querySelector('#paBg'); if(b) b.click(); }); await page.waitForTimeout(400);
    await tap('.pdmore'); await tap('#pmRecipe'); };
  const rows = ()=>page.evaluate(()=>[...document.querySelectorAll('.precrow')].map(b=>b.textContent.trim()));
  const groups = ()=>page.evaluate(()=>[...document.querySelectorAll('.recgroup')].map(g=>g.textContent.trim()));
  const has = (sel)=>page.evaluate(s=>!!document.querySelector(s), sel);
  const accent = ()=>page.evaluate(()=>{ const s=document.querySelector('#paSheet'); if(!s) return null;
    return [...s.querySelectorAll('button')].filter(b=>{ const m=getComputedStyle(b).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      return m && Math.abs(+m[1]-226)<40 && Math.abs(+m[2]-80)<45 && Math.abs(+m[3]-44)<45; }).map(b=>b.id||b.textContent.trim().slice(0,16)); });

  try{
    await tap('#planNav, #planNavP'); await open();

    /* ── A. one search ─────────────────────────────────────────────────── */
    await tap('[data-pimp="search"]');
    ok('the search has no Web / TikTok switch', !(await has('[data-sscope]')), '');
    await page.fill('#paImpVal','pizza'); await tap('#paImpGo');
    ok('…and asks for the web scope', calls.length===1 && calls[0].scope==='web', JSON.stringify(calls));
    const doors = await page.evaluate(()=>[...document.querySelectorAll('.presopen')].map(a=>a.dataset.icon));
    ok('…while every result still has both a web and a TikTok button', doors.join()==='web,tiktok', JSON.stringify(doors));
    await tap('#paBackChoose');

    /* ── B. A–Z by default ─────────────────────────────────────────────── */
    const az = await rows();
    const sorted = NAMES.slice().sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
    ok('A–Z is the default, and really alphabetical', JSON.stringify(az)===JSON.stringify(sorted.slice(0,6)), JSON.stringify(az));
    ok('…keeping six then "Show all"', await has('#paAllRec'), '');
    const hdr = await page.evaluate(()=>{ const t=document.querySelector('#paRecToggle'); return t ? { exp:t.getAttribute('aria-expanded'), txt:t.textContent.replace(/\s+/g,' ').trim() } : null; });
    ok('the heading is a toggle that says how many there are', hdr && hdr.exp==='true' && /Your recipes/.test(hdr.txt) && /10/.test(hdr.txt), JSON.stringify(hdr));
    ok('the sort control is not in the commit colour', JSON.stringify(await accent())==='[]', JSON.stringify(await accent()));

    /* ── C. by course ──────────────────────────────────────────────────── */
    await tap('[data-recsort="course"]');
    const g = await groups();
    ok('Course groups in Drinks · Entrée · Main · Dessert order', g.map(x=>x.split('·')[0].trim()).join('|')==='Drinks|Entrée|Main|Dessert', JSON.stringify(g));
    const placed = await page.evaluate(()=>{ const out={}; let cur='';
      document.querySelectorAll('.recgroup, .precrow').forEach(e=>{ if(e.classList.contains('recgroup')) cur=e.textContent.split('·')[0].trim(); else (out[cur]=out[cur]||[]).push(e.textContent.trim()); });
      return out; });
    ok('older recipes are placed by a guess from their name',
       (placed.Dessert||[]).includes('Traditional Basque Burnt Cheesecake') && (placed['Entrée']||[]).includes('onion soup')
       && (placed['Entrée']||[]).includes('Vietnamese Chicken Salad') && (placed.Drinks||[]).includes('Aperol spritz')
       && (placed.Main||[]).includes('Pad Thai'), JSON.stringify(placed));
    ok('…every recipe is shown when grouped, with no "Show all"', (await rows()).length===10 && !(await has('#paAllRec')), String((await rows()).length));
    ok('the choice is remembered', await page.evaluate(()=>localStorage.getItem('ml_recsort'))==='course', '');
    await open();
    ok('…and still grouped when the sheet opens again', (await groups()).length===4, JSON.stringify(await groups()));

    /* ── D. folding ────────────────────────────────────────────────────── */
    await tap('#paRecToggle');
    ok('folding hides the recipes, the sort and Edit', (await rows()).length===0 && !(await has('[data-recsort]')) && !(await has('#paManage')), '');
    ok('…says so to a screen reader', await page.getAttribute('#paRecToggle','aria-expanded')==='false', '');
    await open();
    ok('…and stays folded next time', (await rows()).length===0 && await page.evaluate(()=>localStorage.getItem('ml_recopen'))==='0', '');
    await tap('#paRecToggle');
    ok('unfolding brings them back', (await rows()).length===10, String((await rows()).length));
    if(out) await page.screenshot({ path: out });

    /* ── E. the course, set in the form and saved ──────────────────────── */
    await page.locator('.precrow', { hasText:'Pad Thai' }).click(); await page.waitForTimeout(600);
    const pre = await page.evaluate(()=>[...document.querySelectorAll('[data-pacourse].on')].map(b=>b.dataset.pacourse));
    ok('the form offers the course, with the guess selected', JSON.stringify(pre)==='["main"]', JSON.stringify(pre));
    ok('…drawn as a state, not a commit button', JSON.stringify(await accent())==='["paGo"]', JSON.stringify(await accent()));
    await tap('[data-pacourse="dessert"]');
    await tap('#paGo');
    const saved = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}');
      return ((c.plan||{}).recipes||[]).filter(r=>r.name==='Pad Thai').map(r=>r.course); });
    ok('the chosen course is saved on the recipe', JSON.stringify(saved)==='["dessert"]', JSON.stringify(saved));
    await open();
    const moved = await page.evaluate(()=>{ let cur='', where='';
      document.querySelectorAll('.recgroup, .precrow').forEach(e=>{ if(e.classList.contains('recgroup')) cur=e.textContent.split('·')[0].trim(); else if(e.textContent.trim()==='Pad Thai') where=cur; });
      return where; });
    ok('…and the recipe moves to that course', moved==='Dessert', moved);

    /* ── F. kept out of appearance slots ───────────────────────────────── */
    const src = fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
    const boot = (src.match(/const APP_EXCLUDE_BOOT = (\/.*\/);/)||[])[1]||'', main = (src.match(/const APP_EXCLUDE = (\/.*\/);/)||[])[1]||'';
    ok('ml_recopen and ml_recsort are in BOTH exclusion lists', ['ml_recopen','ml_recsort'].every(k=>new RegExp(boot.slice(1,-1)).test(k) && new RegExp(main.slice(1,-1)).test(k)),
       JSON.stringify({boot:boot.slice(-60), main:main.slice(-60)}));
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
