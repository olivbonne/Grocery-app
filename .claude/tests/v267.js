/* v2.67 — the Smart add review without explanation text, its item editor like Edit item, the right category on a thirteen
   list, and the dictation box showing the keyboard's own microphone.

   WHAT THESE CHECKS HAVE TO PROVE:
   - on a list with the thirteen categories, Smart add puts milk in Dairy (the AI answers in the nine — it fell to Others);
   - the review shows no explanation line and no "Items to add" label, only Select all / Deselect all;
   - an opened item has Edit item's rows: the name as a title, Quantity with − n +, Measure as a tile ("unit"), Category as a
     tile; no Subcategory; typing the name updates its row at once; a category picked by hand is kept when added;
   - the dictation box shows the keyboard's microphone mark and no explanation text.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  const lists=${JSON.stringify(o.lists||[{code:"v101",name:"Groceries"}])};
  localStorage.setItem("ml_lists", JSON.stringify(lists));
  const docs=${JSON.stringify(o.docs||{ v101:DOC() })}; Object.entries(docs).forEach(([c,d])=>localStorage.setItem("ml_cache_"+c, JSON.stringify(d)));
  localStorage.setItem("ml_lastlist", ${JSON.stringify(o.last||"v101")}); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };



const CATS13 = [
  { id:"fruit",     label:"Fruit",                 emoji:"🍌", color:"#C98A06" },
  { id:"vegetable", label:"Vegetables",            emoji:"🥦", color:"#3E7C3A" },
  { id:"bakery",    label:"Bakery",                emoji:"🍞", color:"#9C6B30" },
  { id:"meat",      label:"Meat & seafood",        emoji:"🥩", color:"#B5402B" },
  { id:"deli",      label:"Deli",                  emoji:"🫒", color:"#7C8A2E" },
  { id:"dairy",     label:"Dairy, eggs & fridge",  emoji:"🥛", color:"#2E5FA3" },
  { id:"pantry",    label:"Pantry",                emoji:"🥫", color:"#6B5CA5" },
  { id:"snacks",    label:"Snacks & drinks",       emoji:"🍿", color:"#D2691E" },
  { id:"frozen",    label:"Frozen",                emoji:"🧊", color:"#1F8FB3" },
  { id:"asian",     label:"Asian & international", emoji:"🍜", color:"#C73B5B" },
  { id:"health",    label:"Health & beauty",       emoji:"💊", color:"#2E8C7F" },
  { id:"household", label:"Household",             emoji:"🧻", color:"#5B6770" },
  { id:"liquor",    label:"Liquor",                emoji:"🍷", color:"#8E2C5E" },
  { id:"others",    label:"Others",                emoji:"🛒", color:"#8A8178" },
];
(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const mk = async(o, ua)=>{ o=o||{}; if(ctx) await ctx.close();
      ctx = await browser.newContext(Object.assign({ viewport:{width:390,height:844}, deviceScaleFactor:2 }, ua?{ userAgent:ua }:{}));
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"milk",qty:2,weight:"",category:"fresh"},{name:"butter",qty:1,weight:"",category:"fresh"},{name:"6x",qty:6,weight:"",category:"others"}] }) }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(Object.assign({ docs:{ v101:DOC({ items:[], categories:CATS13.map(c=>Object.assign({ subs:[] }, c)) }) } }, o)));
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));

    await mk({}, IPHONE);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(400);
    const d = await page.evaluate(()=>{ const s=document.querySelector('.dictsheet'); return { mark:!!s.querySelector('.dictmark svg'), text:s.innerText.replace(/\s+/g,' ').trim() }; });
    ok('the dictation box shows the keyboard\'s microphone mark and no explanation text', d.mark && !/Tap|Your iPhone|only the text/i.test(d.text), d.text);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-dict.png') });
    await page.locator('#dictBox').fill('two milk, butter and six eggs'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);

    const rv = await page.evaluate(()=>{ const s=document.querySelector('#smartSheetEl'); return { text:s.innerText,
      cats:[...s.querySelectorAll('.smartchip-cat')].map(x=>x.textContent.trim()) }; });
    ok('on a thirteen-category list, milk and butter land in Dairy, not Others', /Dairy/.test(rv.cats[0]||'') && /Dairy/.test(rv.cats[1]||''), JSON.stringify(rv.cats));
    ok('no explanation text in the review: no subtitle, no "Items to add"', !/Tap an item|Items to add|Review what|Turn off anything/.test(rv.text) && /Deselect all|Select all/.test(rv.text), rv.text.slice(0,160));
    await page.locator('[data-smart-edit="2"]').click(); await page.waitForTimeout(400);
    const ed = await page.evaluate(()=>{ const s=document.querySelector('.smartchip.open'); const labs=[...s.querySelectorAll('.editsec-l')].map(l=>l.textContent.trim());
      return { title:!!s.querySelector('input.edtitle[data-smart-name]'), labs, stepper:!!s.querySelector('.eqty [data-smart-q]'), measure:(s.querySelector('[data-smart-wopen] .edval')||{}).textContent, cat:!!s.querySelector('[data-smart-copen] .edval'), sub:/Subcategory/.test(s.innerText) }; });
    /* SUPERSEDED by v2.71: "Measure" is called "Unit", and the empty tile reads "Unit". Still protected: the rows and their order. */
    ok('an opened item looks like Edit item: name as a title, Quantity, Unit ("Unit"), Category; no Subcategory', ed.title && JSON.stringify(ed.labs)==='["Quantity","Unit","Category"]' && ed.stepper && /^Unit/.test((ed.measure||'').trim()) && ed.cat && !ed.sub, JSON.stringify(ed));
    await page.locator('.smartchip.open input.edtitle').fill('Eggs'); await page.waitForTimeout(200);
    ok('typing the name updates its row at once ("6× Eggs", not "6× 6x")', /6×\s*Eggs/.test(await page.locator('.smartchip.open .smartchip-name').innerText()), await page.locator('.smartchip.open .smartchip-name').innerText());
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-review.png') });
    await page.locator('[data-smart-copen="2"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-smart-cat="2|frozen"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-smart-wopen="2"]').click(); await page.waitForTimeout(300);
    const wch = await page.evaluate(()=>[...document.querySelectorAll('[data-smart-wt]')].map(b=>b.textContent.trim()));
    /* SUPERSEDED by v2.71: the empty choice reads "Unit". */
    ok('Unit opens the same choices as Edit item (6 pack among them)', wch.includes('6 pack') && wch.includes('Unit'), JSON.stringify(wch));
    await page.locator('#smartConfirm').click(); await page.waitForTimeout(600);
    const c = await cache();
    const by = n=>(c.items.find(i=>i.name.toLowerCase()===n)||{}).cat;
    ok('added: milk in Dairy, and the category picked by hand (Eggs → Frozen) is kept', by('milk')==='dairy' && by('eggs')==='frozen', JSON.stringify(c.items.map(i=>i.name+':'+i.cat)));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
