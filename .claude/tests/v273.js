/* v2.73 — the household's receipt with two kinds of wipes and two sprays for "2× bathroom wipes" and "2× general cleaner
   spray"; the Edit item name's focus ring drawn inside the field.

   WHAT THESE CHECKS HAVE TO PROVE:
   - reconcile (js/till.js): an item ticked with qty 2 takes two lines by name; qty 1 still takes one; a second line of an
     item is never guessed by order;
   - in the receipt sheet all four lines are paired, and choosing an item for a third line takes it from the oldest;
   - the name field's focus ring is inside it (negative offset), so the sheet cannot clip it.

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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const RECEIPT = { store:"Woolworths Abbotsford", place:"Abbotsford VIC", date:"2026-10-25", total:14.30, discounts:[], items:[
  { raw:"#Strike Pro Antibac Wipes Lemon 100pk", name:"bathroom wipes", note:"", qty:1, weight:"100pk", price:4.00, category:"household" },
  { raw:"#Strike Floral Disinf Wipes 120pk", name:"disinfectant wipes", note:"", qty:1, weight:"120pk", price:3.30, category:"household" },
  { raw:"^Pine O Cleen Mprpse Spray Eucalyts 750ml", name:"general cleaner spray", note:"", qty:1, weight:"750ml", price:3.50, category:"household" },
  { raw:"^Pine O Cleen Mprpse Spray Lmn Lime 750ml", name:"multipurpose spray", note:"", qty:1, weight:"750ml", price:3.50, category:"household" } ] };
const now = Date.now();
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[{id:"cdan",name:"Dandenong market",aisles:[]}], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const CART = [ it("1","bathroom wipes","others",{ qty:2, checked:true, checkedAt:now-60000 }), it("2","general cleaner spray","others",{ qty:2, checked:true, checkedAt:now-30000 }), it("3","Milk","dairy") ];
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_cache_v101", JSON.stringify(${JSON.stringify(o.doc||DOC())}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    /* 1. reconcile */
    const { pathToFileURL } = require('url');
    const T = await import(pathToFileURL(path.join(ROOT,'js','till.js')).href);
    const L = n => ({ name:n, keep:true });
    const sc = (a,b)=>T.nameScore(a,b);
    let r = T.reconcile([L("bathroom wipes"),L("disinfectant wipes"),L("general cleaner spray"),L("multipurpose spray")], [{name:"bathroom wipes",qty:2},{name:"general cleaner spray",qty:2}], sc);
    ok('an item ticked with qty 2 takes two lines by name', JSON.stringify(r.pair)==='[0,0,1,1]' && r.missing.length===0, JSON.stringify(r));
    r = T.reconcile([L("bathroom wipes"),L("disinfectant wipes")], [{name:"bathroom wipes",qty:1}], sc);
    ok('…qty 1 still takes one', JSON.stringify(r.pair)==='[0,null]', JSON.stringify(r.pair));
    r = T.reconcile([L("zzz"),L("yyy")], [{name:"apples",qty:2}], sc);
    ok('…and a second line is never guessed by tick order', JSON.stringify(r.pair)==='[0,null]' && r.how[0]==='order', JSON.stringify(r));

    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEIPT) }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const picks = ()=>page.evaluate(()=>[...document.querySelectorAll('[data-rccart]')].map(x=>x.value));

    /* 2. the receipt sheet */
    await mk({ doc:DOC({ items:CART }) });
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#smRcpt').click()]);
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
    let p = await picks();
    ok('in the receipt sheet all four lines are paired: two wipes, two sprays', JSON.stringify(p)==='["0","0","1","1"]', JSON.stringify(p));
    const opt = await page.evaluate(()=>[...document.querySelectorAll('[data-rccart="0"] option')].map(o=>o.textContent.trim()));
    ok('…and the choices say how many were ticked', opt.includes('1. bathroom wipes · 2×'), JSON.stringify(opt));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-receipt.png') });
    await page.locator('[data-rccart="2"]').selectOption('0'); await page.waitForTimeout(400);
    p = await picks();
    ok('choosing the wipes for a third line takes them from the line that had them longest', JSON.stringify(p)==='["","0","0","1"]', JSON.stringify(p));
    await page.locator('#rcSaveBtn').click(); await page.waitForTimeout(600);
    const c = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));
    ok('…and both chosen lines are saved under bathroom wipes (the unpaired line keeps its own name, also wipes)', ((c.prices||{})['bathroom wipe']||[]).length===3, JSON.stringify(Object.keys(c.prices||{})));

    /* 3. the focus ring */
    await mk({ doc:DOC({ items:[it("1","Yogurt","dairy",{ qty:3 })] }) });
    const ring = await page.evaluate(()=>{ const s=[...document.styleSheets].flatMap(x=>{ try{ return [...x.cssRules]; }catch(e){ return []; } }).find(r=>r.selectorText==='.edtitle:focus-visible'); return s ? s.style.outlineOffset : null; });
    ok('the name field\'s focus ring is drawn inside it, so the sheet cannot clip it', ring==='-2px', ring);
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
