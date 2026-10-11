/* v2.27 — an aisle order you actually walk: detailed aisle types, a shop's own aisle map, and the last six drawings.

   WHAT THESE CHECKS HAVE TO PROVE: the logic (js/aisles.js, pure, tested here in Node) gives a name its aisle type by the
   longest word that STARTS a word in it — so peanut butter is a spread, toilet paper and foil are paper goods, eggplant is
   produce, hot dog buns are bakery — reads a sign line ("Aisle 5 — Pasta, rice & sauces"), and places an item at the first
   aisle naming its type, then a word of its name, then its broad category's usual aisle, else nowhere. In the app: at a shop
   with a map, Location sort walks the map (unplaced things last); AI sort starts from it before it has learned; Settings ›
   Sort has the editor for the chosen shop, which saves one aisle per line for everyone and says how much of the list it
   places; the map travels in backups. Every catalogue name now has a drawing (v206 guards the rest).

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c)=>({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]});
const ITEMS=[it('1','Spaghetti','bulk'), it('2','Toilet paper','bulk'), it('3','Mystery widget','others'), it('4','Peanut butter','bulk'), it('5','Bananas','fruit')];
const MAP={ dand:{ at:1, by:"O", aisles:[{n:"12",t:"Toilet paper, cleaning"},{n:"1",t:"Fruit & veg"},{n:"2",t:"Bread, spreads & cereal"},{n:"5",t:"Pasta, rice & sauces"}] } };   // paper first: an order the built-in walk would never give, so the map is what is seen
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, aislemap:${JSON.stringify(o.map===undefined?MAP:o.map)} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'dand'}"); localStorage.setItem("ml_caton","0");
  localStorage.setItem("ml_sorts", JSON.stringify({ shop:"${o.sort||'location'}", list:"${o.sort||'location'}" }));
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];

  /* ── the logic, in Node ───────────────────────────────────────────────── */
  try{
    const A = await import(pathToFileURL(path.join(ROOT,'js','aisles.js')).href);
    const ty = n => A.aisleTypeOf(n);
    ok('a name\'s aisle type is its longest word that starts a word — no short stem hiding inside a longer one',
       ty('Peanut butter')==='spreads' && ty('Toilet paper')==='paper' && ty('Foil')==='paper' && ty('Eggplant')==='produce' && ty('Eggs')==='dairy'
       && ty('Hot dog buns')==='bakery' && ty('Rice crackers')==='snacks' && ty('Basmati rice')==='pasta' && ty('Coconut milk')==='world' && ty('Bell pepper')==='produce' && ty('Mystery widget')==='',
       ['Peanut butter','Toilet paper','Foil','Eggplant','Eggs','Hot dog buns','Rice crackers','Basmati rice','Coconut milk','Bell pepper','Mystery widget'].map(n=>n+'→'+ty(n)).join(', '));
    const L = ['Aisle 5 — Pasta, rice & sauces','12: Toilet paper','Meat','','  '].map(A.parseAisleLine);
    ok('a sign line reads as its number and what it says (no number is fine; a blank is nothing)',
       L[0].n==='5' && L[0].t==='Pasta, rice & sauces' && L[1].n==='12' && L[1].t==='Toilet paper' && L[2].n==='' && L[2].t==='Meat' && L[3]===null && L[4]===null, JSON.stringify(L));
    const m = A.mapAisles(MAP.dand.aisles);
    ok('an aisle knows every type its sign names', m[2].types.has('bakery') && m[2].types.has('spreads') && m[2].types.has('breakfast') && m[3].types.has('pasta') && m[3].types.has('sauces'), JSON.stringify(m.map(a=>[...a.types])));
    ok('an item goes to the first aisle naming its type, then a word of its name, then its category\'s usual aisle — or nowhere',
       A.mapRank(m,'Spaghetti','bulk')===3 && A.mapRank(m,'Peanut butter','bulk')===2 && A.mapRank(m,'Bananas','fruit')===1 && A.mapRank(m,'Toilet paper','bulk')===0
       && A.mapRank(m,'Kangkung','asian')===1 && A.mapRank(m,'Mystery widget','others')===-1, '');
  } catch(e){ ok('the module loads and runs in Node', false, e.message.slice(0,300)); }

  /* ── the app ──────────────────────────────────────────────────────────── */
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, acceptDownloads:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    page.on('dialog', d=>d.accept());
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const order = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].filter(p=>p.offsetParent!==null).map(p=>(p.querySelector('.pname')||{}).textContent));
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));

  try{
    await mk();
    let o = await order();
    ok('at a shop with a map, Location sort walks the map — paper, fruit, spreads, pasta — and what it cannot place comes last',
       JSON.stringify(o)==='["Toilet paper","Bananas","Peanut butter","Spaghetti","Mystery widget"]', JSON.stringify(o));
    if(out) await page.screenshot({ path: out });
    await mk({ map:{} });
    o = await order();
    ok('…and without one, the usual order (the map is what changes it)', JSON.stringify(o)!=='["Toilet paper","Bananas","Peanut butter","Spaghetti","Mystery widget"]', JSON.stringify(o));
    await mk({ sort:'ai' });
    o = await order();
    ok('AI sort, before it has learned anything, starts from the map', JSON.stringify(o)==='["Toilet paper","Bananas","Peanut butter","Spaghetti","Mystery widget"]', JSON.stringify(o));

    /* the editor */
    await mk({ map:{} });
    await tap('#setNav');
    const b = await page.evaluate(()=>(document.querySelector('#optAisleMap')||{}).textContent||'');
    ok('Settings › Sort offers the chosen shop\'s aisle map', /Aisle map for Coles Dandenong/.test(b), b);
    await tap('#optAisleMap');
    await page.locator('#amText').fill('1 Fruit & veg\nAisle 3 — Bread, spreads & cereal\n\n7 Pasta, rice & sauces\n14 Toilet paper');
    await tap('#amSave');
    const am = ((await cache()).aislemap||{}).dand;
    const toast = await page.evaluate(()=>(document.querySelector('#toast')||{}).textContent||'');
    ok('the editor saves one aisle per line, in order, for everyone (in the list), skipping blanks',
       am && am.aisles.length===4 && am.aisles[1].n==='3' && am.aisles[1].t==='Bread, spreads & cereal' && am.by==='O', JSON.stringify(am));
    ok('…and says how much of the list it places', /Saved 4 aisles · places 4 of 5 on the list/.test(toast), toast);
    ok('…and the button then says how many aisles', /· 4 aisles/.test(await page.evaluate(()=>(document.querySelector('#optAisleMap')||{}).textContent||'')), '');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#optBackup').click()]);
    const bk = JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    ok('a backup carries the aisle maps', bk.list && bk.list.aislemap && bk.list.aislemap.dand && bk.list.aislemap.dand.aisles.length===4, '');
    await tap('#optAisleMap'); await tap('#amClear');
    ok('Clear removes the map', !((await cache()).aislemap||{}).dand, '');

    /* the drawings and the plumbing */
    const D = await import(pathToFileURL(path.join(ROOT,'js','data','drawings.js')).href);
    ok('the last six catalogue names have drawings', ['costume','hole punch','reflectors','table bomb','toner','snow chains'].every(n=>D.DRAW_EXACT[n] && D.DRAWN[D.DRAW_EXACT[n]] && D.DRAWN[D.DRAW_EXACT[n]].front), '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    ok('the sync\'s rebuild, both literals, the backup and the restore name the map (the fixed-shape trap)',
       /aislemap: \(d\.aislemap/.test(src) && /aislemap:\(s\.aislemap/.test(src) && /state\.aislemap = list\.aislemap/.test(src) && (src.match(/aislemap:\{\}[,} ]/g)||[]).length===2, '');
    ok('js/aisles.js is imported versioned and precached', /from "\.\/aisles\.js\?v=[\d.]+"/.test(src) && /"\/js\/aisles\.js\?v=[\d.]+"/.test(sw), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
