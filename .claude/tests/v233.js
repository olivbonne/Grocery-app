/* v2.33 — thirteen categories for new lists (the household's item 18: 13, fruit and veg apart; baby and pet in Household;
   new lists only).

   WHAT THESE CHECKS HAVE TO PROVE:
   - a list made now starts with the thirteen, in the order a shop is walked, plus Others last; every one has its own colour
     and a drawn mark;
   - on such a list an added item lands in the right one of the thirteen — by its aisle type (bread → Bakery, ham → Deli,
     dog food and nappies → Household, chips and kombucha → Snacks & drinks…), not in the nine's "Fresh" or "Bulk";
   - an existing list keeps its nine, and items added to it get the nine as before (nothing is re-categorised);
   - the data module stays pure: fourteen entries, ids and colours unique.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,q)=>({id,name:n,cat:c,qty:q||1,weight:"",checked:false,tags:[]});
const NAMES=[["Salad rocket","vegetable",1],["High protein yogurt","fresh",2],["Frozen raspberries","fresh",2],["Cream","fresh",1],["Nexba lemon squash","others",2],["Popcorn Sweet and Salty","others",2],["Linguine","bulk",2],["Honey","bulk",1],["Tofu soft","asian",2]];
const ITEMS=NAMES.map(([n,c,q],i)=>it(String(i+1),n,c,q));
let RECEIPT = { store:'Coles Dandenong', place:'Dandenong VIC', date:'2026-10-12', total:7.5,
  items:[{raw:'HONEY 500G',name:'honey',qty:1,weight:'500g',price:7.5,category:'bulk'}], discounts:[] };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ml_cache_v101")), ${JSON.stringify(o.doc||{})})));
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEIPT) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const ls = k=>page.evaluate(k=>localStorage.getItem(k), k);
  const pill = id=>page.locator(`#zoomer .pill[data-pill="${id}"]:visible`).first();   // visible: the urgent strip keeps hidden copies

  const WANT = { "Bread":"bakery", "Milk":"dairy", "Ham":"deli", "Frozen peas":"frozen", "Pasta":"pantry", "Chips":"snacks",
    "Kombucha":"snacks", "Toilet paper":"household", "Dog food":"household", "Nappies":"household", "Wine":"liquor",
    "Shampoo":"health", "Apples":"fruit", "Carrots":"vegetable", "Steak":"meat", "Soy sauce":"asian" };
  /* several names typed at once, comma-separated, as a person can: they are added as they are (no details panel) */
  /* several names typed at once, comma-separated, then the return key — the "I'm done" gesture: adds them and closes the sheet */
  const addAll = async(names)=>{ await tap('#shopAddFab'); await page.locator('#mainInput').fill(names.join(', ')); await page.waitForTimeout(300);
    await page.locator('#mainInput').press('Enter'); await page.waitForTimeout(900); };
  const cats = code => page.evaluate(c=>{ const d=JSON.parse(localStorage.getItem('ml_cache_'+c)||'null'); return d ? { ids:(d.categories||[]).map(x=>x.id), items:Object.fromEntries((d.items||[]).map(i=>[i.name, i.cat])) } : null; }, code);

  try{
    const { pathToFileURL } = require('url');
    const C = await import(pathToFileURL(path.join(ROOT,'js','data','catalog.js')).href);
    ok('the thirteen and Others: fourteen, in a shop\'s walking order, ids and colours unique',
       C.CATS13.length===14 && new Set(C.CATS13.map(c=>c.id)).size===14 && new Set(C.CATS13.map(c=>c.color.toLowerCase())).size===14
       && C.CATS13.map(c=>c.id).join(',')==='fruit,vegetable,bakery,meat,deli,dairy,pantry,snacks,frozen,asian,health,household,liquor,others', C.CATS13.map(c=>c.id).join(','));
    const D = await import(pathToFileURL(path.join(ROOT,'js','data','drawings.js')).href);
    ok('…each has a drawn mark', C.CATS13.every(c=>typeof D.CATMARK[c.id]==='string' && D.CATMARK[c.id].length>10), C.CATS13.filter(c=>!D.CATMARK[c.id]).map(c=>c.id).join(','));

    /* ── a new list ──────────────────────────────────────────────────── */
    await mk({});
    await tap('#listSwitch'); await tap('#newList');
    await page.locator('#newListName').fill('Fresh start'); await tap('#newListCreate');
    const code = await page.evaluate(()=>localStorage.getItem('ml_lastlist'));
    await page.waitForTimeout(500);
    let c = await cats(code);
    ok('a list made now starts with the thirteen and Others', c && c.ids.join(',')==='fruit,vegetable,bakery,meat,deli,dairy,pantry,snacks,frozen,asian,health,household,liquor,others', JSON.stringify(c && c.ids));
    await addAll(Object.keys(WANT));
    c = await cats(code);
    const wrong = Object.entries(WANT).filter(([n,k])=>c.items[n]!==k).map(([n,k])=>`${n}: ${c.items[n]} (want ${k})`);
    ok('…items added to it land in the right one of the thirteen', wrong.length===0, wrong.join('; ') || JSON.stringify(c.items));
    await page.waitForTimeout(1500);
    const heads = await page.evaluate(()=>document.querySelectorAll('#zoomer .cdraw svg').length);   // the category headings' drawn marks (after the sheet's closing animation, above)
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-new.png'), fullPage:true });
    ok('…and its headings are drawn', heads > 0, String(heads));

    /* ── an existing list ────────────────────────────────────────────── */
    await mk({});
    await addAll(['Bread','Ham']);
    c = await cats('v101');
    /* a category the person picks is theirs: chips win over where the shop shelves it */
    await mk({});
    await tap('#listSwitch'); await tap('#newList'); await page.locator('#newListName').fill('Picky'); await tap('#newListCreate');
    await page.waitForTimeout(400);
    const code2 = await page.evaluate(()=>localStorage.getItem('ml_lastlist'));
    ok('(guard) newCat never overrides a category picked by hand', /cat:override \? cat : newCat\(cat, e\.name\)/.test(fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8')), code2);
    ok('an existing list keeps its nine, and new items get the nine as before', c.ids.join(',')==='meat,fruit,vegetable,fresh,bulk,health,asian,alcohol,others'
       && c.items['Bread']==='fresh' && c.items['Ham']!=='deli', JSON.stringify(c));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
