/* v2.42 — the household's items of 19 October.

   WHAT THESE CHECKS HAVE TO PROVE:
   - (1) what typing finds in "+ Add items" is laid out as the list itself is: in a grid layout, the same columns, so every
     result tile is as wide as a list tile, and none is shorter than the list's usual tile — a long name no longer makes a
     wide tile, a short one a narrow tile;
   - (1) adding a Regular — from "Add from your regulars" or picked in the add sheet — no longer opens the Edit item panel:
     it goes on the list, once, and the sheet stays on the results.

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
let CARDREPLY = { status:200, body:{ name:'Flybuys', number:'6008943218616910' }, delay:500 };
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
    await ctx.route('**/api/card', async r => { await new Promise(z=>setTimeout(z, CARDREPLY.delay||0)); r.fulfill({ status:CARDREPLY.status, contentType:'application/json', body:JSON.stringify(CARDREPLY.body) }); });
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

  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const tiles = sel=>page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(p=>p.offsetParent!==null).map(p=>{ const r=p.getBoundingClientRect(); return { w:Math.round(r.width), h:Math.round(r.height) }; }), sel);
  try{
    /* the household's layout: large tiles, four columns */
    await mk({ doc:{ buyAgain:[{ name:'Beer', cat:'alcohol', qty:1, ts:1 }] }, extra:`localStorage.setItem("ml_displays", JSON.stringify({ shop:"grid4", plan:"grid4" }));` });
    const list = await tiles('#zoomer .pill[data-pill]');
    await tap('#shopAddFab'); await page.locator('#mainInput').fill('be'); await page.waitForTimeout(600);
    const res = await tiles('#addSheet .addgrid > .pill');
    const lw = list[0] && list[0].w, lh = Math.min(...list.map(t=>t.h));
    /* the sheet's own side margins are a few pixels wider than the page's, so a column is up to ~5% narrower than on the list */
    ok('(1) the results sit in the list\'s own grid: four to a row, each as wide as a list tile', res.length>=5 && res.every(t=>t.w===res[0].w) && Math.abs(res[0].w-lw)<=6 && await page.evaluate(()=>getComputedStyle(document.querySelector('#addSheet .addgrid')).display==='grid'), JSON.stringify({ lw, res:res.slice(0,8) }));
    ok('(1) …and none is shorter than the list\'s usual tile', res.every(t=>t.h>=lh-2), JSON.stringify({ lh, h:res.map(t=>t.h) }));
    await shot('results');
    await page.locator('#addSheet [data-add-ba^="Beer|"]').first().click(); await page.waitForTimeout(600);
    const a1 = await page.evaluate(()=>({ panel:!!document.querySelector('[data-ae-name]'), results:document.querySelectorAll('#addSheet .addgrid > .pill').length, on:JSON.parse(localStorage.getItem('ml_cache_v101')).items.filter(i=>i.name==='Beer' && !i.checked).length }));
    ok('(1) a Regular picked in the add sheet goes on the list without the Edit item panel; the results stay', !a1.panel && a1.results>=5 && a1.on===1, JSON.stringify(a1));
    await page.locator('#addSheet [data-add-dict], #addSheet [data-add-typed]').first().click(); await page.waitForTimeout(600);
    ok('(1) …while a new item from the dictionary still opens its details', await page.evaluate(()=>!!document.querySelector('[data-ae-name]')), '');
    await page.locator('#addDone').click({ force:true }); await page.waitForTimeout(1600);

    await mk({ doc:{ buyAgain:[{ name:'Sourdough', cat:'fresh', qty:2, ts:1 }] } });
    await tap('[data-regc="fresh"]'); await tap('[data-reg-add^="Sourdough|"]'); await page.waitForTimeout(500);
    const a2 = await page.evaluate(()=>({ sheet:!!document.querySelector('#addSheet'), panel:!!document.querySelector('[data-ae-name]'), it:JSON.parse(localStorage.getItem('ml_cache_v101')).items.filter(i=>i.name==='Sourdough') }));
    ok('(1) a Regular tapped under "Add from your regulars" goes on the list with its amount — no sheet, no Edit item panel', !a2.sheet && !a2.panel && a2.it.length===1 && a2.it[0].qty===2, JSON.stringify(a2));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
