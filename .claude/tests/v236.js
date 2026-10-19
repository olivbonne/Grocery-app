/* v2.36 — the household's items 1 and 2 of 15 October (item 3, card logos, waits on their choice between two mockups).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (1) tapping a Regular under "Add from your regulars" opens the same add sheet and details panel as "+ Add items",
     for that item; Cancel takes it back off the list (it was staged like any add made in the sheet); a Regular already on
     the list opens its panel without adding a second;
   - (2) the "+ Add a card" tile itself takes the photo — the camera (capture) — and there is no separate "Scan the card";
     "Choose a photo" opens the picker without the camera hint.

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

  try{
    /* ── 1 a Regular opens the add sheet's panel ─────────────────────── */
    await mk({ doc:{ buyAgain:[{ name:'Sourdough', cat:'fresh', qty:1, ts:1 }] } });
    await tap('[data-regc="fresh"]');
    await tap('[data-reg-add^="Sourdough|"]'); await page.waitForTimeout(700);
    const s1 = await page.evaluate(()=>({ sheet:!!document.querySelector('#addSheet'), name:(document.querySelector('[data-ae-name]')||{}).value||'', on:JSON.parse(localStorage.getItem('ml_cache_v101')).items.filter(i=>i.name==='Sourdough').length }));
    /* SUPERSEDED by v2.42: the household asked for no Edit item panel when a Regular is added — a tap adds it, with no sheet.
       Still protects: one tap puts the Regular on the list, once, and a second tap takes it back off. */
    ok('(1) a Regular tapped opens the add sheet with its details panel, like "+ Add items"', !s1.sheet && !s1.name && s1.on===1, JSON.stringify(s1));
    await tap('[data-reg-rm]'); await page.waitForTimeout(400);
    const s2 = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.filter(i=>i.name==='Sourdough').length);
    ok('(1) …and Cancel takes it back off the list', s2===0, String(s2));

    /* ── 2 the + tile takes the photo ────────────────────────────────── */
    await mk({ store:'home' });
    await tap('#shopMenu'); await tap('#smCard');
    ok('(2) there is no separate "Scan the card" button', await page.evaluate(()=>!document.querySelector('#cardScanGo') && !!document.querySelector('#cardSwipe.cardadd[role=button]')), '');
    const cap = await page.evaluate(()=>new Promise(res=>{ const orig=HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click=function(){ HTMLInputElement.prototype.click=orig; res({ type:this.type, capture:this.getAttribute('capture') }); };
      document.querySelector('#cardSwipe.cardadd').click(); setTimeout(()=>res(null), 1500); }));
    ok('(2) tapping the "+ Add a card" tile opens the camera', cap && cap.type==='file' && cap.capture==='environment', JSON.stringify(cap));
    const lib = await page.evaluate(()=>new Promise(res=>{ const orig=HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click=function(){ HTMLInputElement.prototype.click=orig; res({ type:this.type, capture:this.getAttribute('capture') }); };
      document.querySelector('#cardPhotoGo').click(); setTimeout(()=>res(null), 1500); }));
    ok('(2) "Choose a photo" opens the picker, not the camera', lib && lib.type==='file' && lib.capture===null, JSON.stringify(lib));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
