/* v2.45 — the app in French (the household's item d; architecture review S17). Default English; Français in Settings.

   WHAT THESE CHECKS HAVE TO PROVE:
   - every text wrapped in t("…") / tf("…") in js/app.js has its French in js/i18n.js (a missing one would show English in
     the middle of French), and every French keeps the English's {placeholders};
   - English stays the default, and reads exactly as before (the bottom bar, the count, Settings);
   - choosing Français in Settings turns the bottom bar, the count and Settings' own headings to French at once, keeps
     the choice across a reload, sets the page's language, and English comes back the same way;
   - a list's own names (items, a category the household typed) are never translated;
   - the language is kept in BOTH appearance-slot exclusion lists.

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
  try{
    /* ── the table is complete ───────────────────────────────────────── */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const { pathToFileURL } = require('url');
    const I = await import(pathToFileURL(path.join(ROOT,'js','i18n.js')).href);
    const keys = new Set();
    for(const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) keys.add(Function('return "'+m[1]+'"')());
    for(const m of src.matchAll(/\b(?:sectHR|sect)\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) keys.add(m[1]);   // section titles are translated inside sectHR
    for(const m of src.matchAll(/\btf\(\s*"((?:[^"\\]|\\.)*)"\s*,/g)) keys.add(Function('return "'+m[1]+'"')());
    const missing = [...keys].filter(k=>!Object.prototype.hasOwnProperty.call(I.FR, k));
    ok('every wrapped text has its French ('+keys.size+' of them)', keys.size>=150 && missing.length===0, missing.slice(0,8).join(' | '));
    const ph = s=>(s.match(/\{[a-z]+\}/gi)||[]).sort().join(',');
    const badPh = Object.entries(I.FR).filter(([e,f])=>ph(e)!==ph(f)).map(([e])=>e);
    ok('every French keeps the English\'s {placeholders}', badPh.length===0, badPh.slice(0,5).join(' | '));
    ok('tr/trf: French when chosen, English otherwise, values filled in', I.tr('fr','Settings')!=='Settings' && I.tr('en','Settings')==='Settings' && I.tr('fr','zzz unknown')==='zzz unknown'
      && /3/.test(I.trf('fr','{n} to buy',{ n:3 })||''), '');

    /* ── English is the default, and unchanged ───────────────────────── */
    await mk({ doc:{ cats:undefined } });
    const nav = ()=>page.evaluate(()=>[...document.querySelectorAll('#bottomnav button, #bottomnav a')].map(b=>b.textContent.replace(/\s+/g,' ').trim()).join('|'));
    const n1 = await nav();
    ok('English is the default: Plan, Shop, Settings', /Plan/.test(n1) && /Shop/.test(n1) && /Settings/.test(n1) && await page.evaluate(()=>document.documentElement.lang)==='en', n1);
    ok('…and the count reads "N to buy"', /\d+ to buy/.test(await page.evaluate(()=>document.body.innerText)), '');

    /* ── Français ────────────────────────────────────────────────────── */
    await tap('#setNav');
    await tap('[data-opt-lang="fr"]'); await page.waitForTimeout(400);
    const body = await page.evaluate(()=>document.body.innerText);
    ok('choosing Français turns Settings to French at once', /Réglages/.test(body) && !/\bLists & sharing\b/.test(body), body.slice(0,200));
    await shot('fr-settings');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    await tap('[id^="cartNav"]:visible'); await page.waitForTimeout(400);   // the reload comes back on Settings; the list is on Shop
    const n2 = await nav(), b2 = await page.evaluate(()=>document.body.innerText);
    ok('…kept across a reload: the bottom bar and the count are French, and the page says it is French', /Courses/.test(n2) && /Réglages/.test(n2) && /\d+ à acheter/.test(b2) && await page.evaluate(()=>document.documentElement.lang)==='fr', n2);
    ok('…while the list\'s own names stay as they are', /Salad rocket/.test(b2) && /Frozen raspberries/.test(b2), '');
    await shot('fr-shop');
    await tap('#setNav'); await tap('[data-opt-lang="en"]'); await page.waitForTimeout(400);
    ok('English comes back the same way', /Settings/.test(await nav()) && !/Réglages/.test(await page.evaluate(()=>document.body.innerText)), await nav());

    ok('the language is kept in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_lang\$/.test(x)).length===2, '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
