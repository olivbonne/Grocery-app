/* v2.07 — bigger tile icons; one tap opens a planned recipe; Add recipe starts with the ways in.

   WHY THIS EXISTS: four household requests, from a screenshot of the Add recipe sheet.
   1. "Allow option to increase the size of the drawings in the tiles and adjust text accordingly."
   2. "Remove long tap to edit recipe: update the single tap to show the drinks, entrée, main, dessert
      categories, show where the link comes from, allow ingredient to be edited and saved and sorted by
      category or recipe order."
   3. "After tapping add recipe: show search, link, photo, paste text."
   4. "The selection … is cut off for A–Z and Course."

   WHAT THESE CHECKS HAVE TO PROVE:
   - Settings has Icon size; XL really draws a tile's icon about twice as big as S, and at L the name sits
     UNDER the icon (the text adjusts), with nothing changed at S; the size is a look (not excluded);
   - a hold on a planned recipe no longer opens an editor; one tap opens a sheet with the course (the
     guess selected), the source's own site named and linked, and the ingredients in recipe order;
   - Category groups the ingredients and the choice is remembered — in BOTH exclusion lists;
   - choosing a course SAVES it on the recipe; editing renames, re-amounts, removes and adds, and Save
     writes exactly that while keeping the recipe's link and method (the fixed-shape trap); a renamed
     ingredient drops its old category; Cancel changes nothing;
   - Add recipe shows Search · Link · Photo · Paste text first, on screen, above the saved recipes, even
     with ten recipes grouped by course;
   - the A–Z / Course chips are not inside a clipping container any more.

   TEST-BUG NOTES CARRIED FORWARD: v1.86 dismiss before opening; v1.91 assert WHICH value; v2.00 the seed
   returns early once seeded. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const NAMES=["Chicken in soya sauce with choysum","quesadillas","Pad Thai","onion soup","Vietnamese Chicken Salad",
             "Seafood Spaghetti","Traditional Basque Burnt Cheesecake","mushrooms pizza","40 cloves garlic chicken","Aperol spritz"];
const today = new Date(); const TK = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
const PAD = [{name:"rice noodles",cat:"",qty:1,weight:"200 g"},{name:"prawns",cat:"meat",qty:1,weight:"300 g"},{name:"eggs",cat:"",qty:2,weight:""},
             {name:"bean sprouts",cat:"",qty:1,weight:""},{name:"lime",cat:"fruit",qty:1,weight:""}];
const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const recipes=${JSON.stringify(NAMES)}.map((n,i)=>({id:"r"+i,name:n,emoji:"",servings:4,
    src:i===2?"https://www.recipetineats.com/pad-thai/":"", steps:i===2?["Soak the noodles","Fry"]:[],
    ing:i===2?${JSON.stringify(PAD)}:[{name:"garlic",cat:"vegetable",qty:1,weight:""}]}));
  const it=(id,n,c)=>({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[it("1","Croissant","others"),it("2","Chicken thigh","meat")],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    categories:[{id:"meat",label:"Meat",color:"#B5402B",emoji:"🥩",subs:[]},{id:"fruit",label:"Fruit",color:"#C98A0B",emoji:"🍌",subs:[]},{id:"others",label:"Others",color:"#6B6B6B",emoji:"🛒",subs:[]}],
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{},
    plan:{days:{"${TK}":[{id:"pe1",kind:"recipe",name:"Pad Thai",emoji:"",rid:"r2",slot:"",serves:0}]},recipes,saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_recsort","course");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
  await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
  const page = await ctx.newPage(); page.setDefaultTimeout(9000);
  page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  await page.addInitScript(SEED);
  const load = async()=>{ await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
  await load();
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(550); };
  const has = (sel)=>page.evaluate(s=>!!document.querySelector(s), sel);
  const recipe = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return ((c.plan||{}).recipes||[]).find(r=>r.id==='r2'); });
  const tile = (name)=>page.evaluate(n=>{ const p=[...document.querySelectorAll('.pill')].find(b=>b.textContent.includes(n)); if(!p) return null;
    const e=p.querySelector('.pemoji'), r=e.getBoundingClientRect();
    /* SUPERSEDED by v2.10: the name is in its own <span class="pname"> now (it is clamped and measured), not a
       bare text node. Still protected: at L/XL the name sits UNDER the icon. */
    const pn=p.querySelector('.pname'); const t=pn ? pn.getBoundingClientRect() : null;
    return { icoH:Math.round(r.height), icoBottom:Math.round(r.bottom), textTop:t?Math.round(t.top):null, dir:getComputedStyle(p).flexDirection }; }, name);
  const src = fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
  const rx = (name)=>new RegExp(((src.match(new RegExp('const '+name+' = (\\/.*\\/);'))||[])[1]||'//').slice(1,-1));

  try{
    /* ── A. Icon size ──────────────────────────────────────────────────── */
    const s0 = await tile('Croissant');
    await tap('#setNav, #setNavP, #setNavS');
    ok('Settings has Icon size, S to XL', (await page.locator('[data-opt-icosize]').count())===4, String(await page.locator('[data-opt-icosize]').count()));
    await page.evaluate(()=>document.querySelector('[data-opt-icosize="xl"]').click()); await page.waitForTimeout(500);
    ok('…remembered, and published on the page', await page.evaluate(()=>localStorage.getItem('ml_icosize')+'|'+document.documentElement.dataset.icosize)==='xl|xl', '');
    await load(); await tap('#cartNavP, #cartNav');   // the app reopens on the last page (Settings)
    const sx = await tile('Croissant');
    ok('XL draws a tile\'s icon about twice as big as S', s0 && sx && sx.icoH >= s0.icoH*1.9, JSON.stringify({S:s0&&s0.icoH, XL:sx&&sx.icoH}));
    ok('…and the name moves under the icon, so the text is not squeezed beside it', sx && sx.dir==='column' && sx.textTop>=sx.icoBottom-1, JSON.stringify(sx));
    ok('at S the tile is laid out as before (icon beside the name)', s0 && s0.dir==='row', JSON.stringify(s0));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-xl.png') });
    ok('Icon size is a look: kept OUT of both exclusion lists, so an appearance slot carries it',
       !rx('APP_EXCLUDE_BOOT').test('ml_icosize') && !rx('APP_EXCLUDE').test('ml_icosize'), '');
    await page.evaluate(()=>localStorage.setItem('ml_icosize','s')); await load();

    /* ── B. one tap opens the recipe ───────────────────────────────────── */
    await tap('#planNav, #planNavP, #planNavS');
    const chip = page.locator('.pchip').filter({ hasText:'Pad Thai' }).first();
    const bb = await chip.boundingBox();
    await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(600);
    ok('a press-and-hold no longer opens an editor', !(await has('#paSheet')), '');
    ok('…any press opens the recipe sheet', await has('#ppSheet'), '');
    /* SUPERSEDED by v2.08: the ingredients fold behind their own "Ingredients" button, and the link reads
       "Open link" with the site's name UNDER it. Still protected: course, source and ingredients are all
       one tap from the plan, in order, with amounts. */
    await tap('#ppIng');
    const sh = await page.evaluate(()=>{ const s=document.querySelector('#ppSheet');
      const a=s.querySelector('a.ppsrc');
      return { course:[...s.querySelectorAll('[data-ppcourse]')].map(b=>b.dataset.ppcourse+(b.classList.contains('on')?'*':'')),
        srcText:a?a.textContent.replace(/\s+/g,' ').trim()+' | '+((s.querySelector('.ppsrcname')||{}).textContent||''):null, href:a?a.getAttribute('href'):null,
        ing:[...s.querySelectorAll('.pping .ppingname')].map(x=>x.textContent.trim()),
        amt:[...s.querySelectorAll('.pping')].map(x=>(x.querySelector('.ppingamt')||{textContent:''}).textContent.trim()) }; });
    ok('it shows the four courses, the guess selected', JSON.stringify(sh.course)==='["drinks","entree","main*","dessert"]', JSON.stringify(sh.course));
    ok('it says where the recipe came from, and links there', /^Open link \| recipetineats\.com$/.test(sh.srcText||'') && sh.href==='https://www.recipetineats.com/pad-thai/', JSON.stringify(sh));
    ok('its ingredients are listed in recipe order, with amounts', JSON.stringify(sh.ing)==='["Rice noodles","Prawns","Eggs","Bean sprouts","Lime"]' && sh.amt[0]==='200 g' && sh.amt[2]==='2×',
       JSON.stringify(sh));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sheet.png') });

    await tap('[data-ppingsort="cat"]');
    const grp = await page.evaluate(()=>{ const out={}; let cur='';
      document.querySelectorAll('#ppSheet .recgroup, #ppSheet .pping').forEach(e=>{ if(e.classList.contains('recgroup')) cur=e.textContent.split('·')[0].trim();
        else (out[cur]=out[cur]||[]).push(e.querySelector('.ppingname').textContent.trim()); }); return out; });
    ok('Category groups them under their categories', (grp.Meat||[]).join()==='Prawns' && (grp.Fruit||[]).join()==='Lime' && (grp.Others||[]).length===3, JSON.stringify(grp));
    ok('…and the choice is remembered', await page.evaluate(()=>localStorage.getItem('ml_ingsort'))==='cat', '');
    ok('ml_ingsort is a preference: in BOTH exclusion lists', rx('APP_EXCLUDE_BOOT').test('ml_ingsort') && rx('APP_EXCLUDE').test('ml_ingsort'), '');
    await tap('[data-ppingsort="recipe"]');

    await tap('[data-ppcourse="dessert"]');
    ok('choosing a course saves it on the recipe', (await recipe()).course==='dessert', JSON.stringify((await recipe()).course));

    /* ── C. editing ────────────────────────────────────────────────────── */
    /* SUPERSEDED by v2.08: the household asked for the recipe sheet's Edit to go. A saved recipe is edited
       from Add recipe › Your recipes › Edit instead (the v1.89 editor). Still protected: the save keeps the
       recipe's link, method, servings and course, and the day follows a rename at once. */
    ok('the recipe sheet no longer offers editing', !(await has('#ppEdit')) && (await page.locator('#ppSheet input').count())===0, '');
    await page.evaluate(()=>{ const b=document.querySelector('#ppBg'); if(b) b.click(); }); await page.waitForTimeout(400);
    await tap('.pdmore'); await tap('#pmRecipe'); await tap('#paManage');
    await page.locator('[data-precipe]', { hasText:'Pad Thai' }).first().click(); await page.waitForTimeout(600);
    ok('Your recipes › Edit › tap opens the recipe for editing', /Edit recipe/.test(await page.locator('#paSheet .disp').first().textContent().catch(()=>'')) && (await page.inputValue('#paName'))==='Pad Thai', '');
    await page.fill('#paName', 'Pad Thai for two'); await tap('#paGo');
    const r = await recipe();
    ok('Save writes the name', r.name==='Pad Thai for two', r.name);
    ok('the recipe keeps its link, method, servings and course (nothing dropped by the save)',
       r.src==='https://www.recipetineats.com/pad-thai/' && (r.steps||[]).length===2 && r.servings===4 && r.course==='dessert', JSON.stringify({src:r.src,steps:r.steps,s:r.servings,c:r.course}));
    ok('…and its ingredients', JSON.stringify(r.ing)===JSON.stringify(PAD), JSON.stringify(r.ing));
    ok('the day shows the new name at once', await page.evaluate(()=>[...document.querySelectorAll('.pchip')].some(c=>/Pad Thai for two/.test(c.textContent))), '');

    /* ── D. Add recipe: the ways in first ──────────────────────────────── */
    await page.evaluate(()=>{ const b=document.querySelector('#ppBg'); if(b) b.click(); }); await page.waitForTimeout(400);
    await tap('.pdmore'); await tap('#pmRecipe');
    const ch = await page.evaluate(()=>{ const s=document.querySelector('#paSheet');
      const btns=[...s.querySelectorAll('[data-pimp]')]; const firstRow=s.querySelector('.precrow'), write=s.querySelector('#paWrite');
      const before=(a,b)=>!!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
      return { labels:btns.map(b=>b.textContent.trim()), onScreen:btns.every(b=>b.getBoundingClientRect().bottom<=innerHeight),
        importsFirst: before(btns[btns.length-1], firstRow), writeBeforeList: before(write, firstRow), rows:s.querySelectorAll('.precrow').length }; });
    ok('Add recipe opens on Search · Link · Photo · Paste text', JSON.stringify(ch.labels)==='["Search","Link","Photo","Paste text"]', JSON.stringify(ch.labels));
    ok('…above your saved recipes, and "Write it yourself" too', ch.importsFirst && ch.writeBeforeList && ch.rows===10, JSON.stringify(ch));
    ok('…all four on screen even with ten recipes grouped by course', ch.onScreen, JSON.stringify(ch));

    /* ── E. the sort switch is not clipped ─────────────────────────────── */
    const clip = await page.evaluate(()=>{ const on=document.querySelector('[data-recsort].on'); if(!on) return null;
      const r=on.getBoundingClientRect(); let el=on.parentElement, clipped=false;
      while(el && el.id!=='paSheet'){ const cs=getComputedStyle(el); if(/hidden|clip/.test(cs.overflowX+cs.overflowY)){ const pr=el.getBoundingClientRect();
          if(r.left<pr.left-0.5 || r.right>pr.right+0.5 || r.top<pr.top-0.5 || r.bottom>pr.bottom+0.5) clipped=true; if(el===on.parentElement) clipped=true; } el=el.parentElement; }
      return { clipped, parentClass:on.parentElement.className }; });
    ok('the selected A–Z / Course chip sits in no clipping box', clip && clip.clipped===false && !/\bseg\b/.test(clip.parentClass), JSON.stringify(clip));
    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
