/* v2.72 — receipts know what was bought (the note), prices per kilo / per item, a shop named on a receipt joins the
   shops unpinned, "No card at this shop", the shop chosen from the Shop page's ⋯ menu, the cart stays folded.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the receipt's "Which ticked item" choices tell two beef items apart by weight and note;
   - saving keeps $3.00/kg and $32.99/kg (not the line totals) with each cart item's note, the toast counts the prices,
     and the cart estimate uses weight × price per kilo: 0.8 kg × $3.00 + 0.6 kg × $32.99 = $22.19 (not $324.88);
   - a shop named on the receipt that the list does not have is added, with no pin, and the shop chosen is unchanged;
   - "No card at this shop" stops the card question at that shop only;
   - ⋯ › Store picks a shop, and a new one can be added there; the menu stays open;
   - a tap on the cart's head right after a tick does not unfold it.

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
const RECEIPT = { store:"ISMAIL HALAL MEATS", place:"Dandenong VIC", date:"2026-10-25", total:90.75, discounts:[], items:[
  { raw:"BEEF BONES 3.180 3.00 9.54", name:"beef", note:"bones", qty:1, weight:"3.180 kg", price:9.54, unit_price:3.00, per:"kg", category:"meat" },
  { raw:"TOPSIDE STEAK 2.462 32.99 81.22", name:"beef", note:"topside steak", qty:1, weight:"2.462 kg", price:81.22, unit_price:32.99, per:"kg", category:"meat" } ] };
const now = Date.now();
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[{id:"cdan",name:"Dandenong market",aisles:[]}], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const BEEF = [ it("1","Beef","meat",{ weight:"800g", note:"Cubes", checked:true, checkedAt:now-60000 }), it("2","Beef","meat",{ qty:3, weight:"200g", note:"Topside steak", checked:true, checkedAt:now-30000 }), it("3","Milk","dairy") ];
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
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEIPT) }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));
    const menu = async()=>{ await page.locator('#shopMenu').click(); await page.waitForTimeout(400); };

    /* 1–4. the receipt */
    await mk({ doc:DOC({ items:BEEF }) });
    await menu();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#smRcpt').click()]);
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
    const rv = await page.evaluate(()=>({ opts:[...document.querySelectorAll('[data-rccart="0"] option')].map(o=>o.textContent.trim()), raw:[...document.querySelectorAll('.rcraw')].map(r=>r.textContent), picks:[...document.querySelectorAll('[data-rccart]')].map(x=>x.value), how:[...document.querySelectorAll('[data-rccart]')].map(x=>x.classList.contains('guess')) }));
    ok('the receipt\'s choices tell the two beef items apart by weight and note', rv.opts.includes('1. Beef · 800g · Cubes') && rv.opts.includes('2. Beef · 3× 200g · Topside steak'), JSON.stringify(rv.opts));
    ok('…and each line shows its note and its price per kilo', /\$3\.00\/kg/.test(rv.raw[0]||'') && /\$32\.99\/kg/.test(rv.raw[1]||''), JSON.stringify(rv.raw));
    ok('…and "TOPSIDE STEAK" is paired with "Beef · Topside steak" by its note, not by tick order', rv.picks[1]==='1' && rv.how[1]===false, JSON.stringify(rv));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-receipt.png') });
    await page.locator('#rcSaveBtn').click(); await page.waitForTimeout(300);
    const toast = await page.evaluate(()=>(document.querySelector('#toast, .toast')||{}).textContent||'');
    await page.waitForTimeout(500);
    let c = await cache();
    const recs = (c.prices||{}).beef || [];
    ok('the prices are kept per kilo, with each cart item\'s note', recs.some(r=>r.per==='kg' && Math.abs(r.u-3)<0.01) && recs.some(r=>r.n==='topside steak' && r.per==='kg' && Math.abs(r.u-32.99)<0.01), JSON.stringify(recs));
    ok('the toast counts the prices saved', /Saved 2 prices/.test(toast), toast);
    const shop = (c.stores||[]).find(s=>/ismail/i.test(s.name));
    ok('the shop named on the receipt joins the shops, with no pin', !!shop && !shop.lat && !shop.geo && !((c.storeMeta||{})[shop.id]||{}).lat, JSON.stringify(c.stores));
    ok('…and the shop chosen on the phone is unchanged', await page.evaluate(()=>localStorage.getItem('ml_store'))==='home', '');
    const est = await page.evaluate(()=>(document.querySelector('.cartest')||{}).textContent||'');
    ok('the cart estimate is weight × price per kilo ($22.19), not the line totals × quantity', /\$22\.19/.test(est), est);

    /* 5. no card at this shop */
    await mk({ doc:DOC(), store:"cdan", extra:'localStorage.setItem("ml_cardnudge", String(Date.now()));' });
    const had = await page.locator('#cardNudgeNone').count();
    if(had) await page.locator('#cardNudgeNone').click(); await page.waitForTimeout(300);
    const nc = await page.evaluate(()=>({ list:JSON.parse(localStorage.getItem('ml_nocard')||'[]'), ask:localStorage.getItem('ml_cardask') }));
    await page.evaluate(()=>localStorage.setItem("ml_cardnudge", String(Date.now()))); await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    ok('"No card at this shop" stops the question at that shop only', had===1 && nc.list.includes('cdan') && nc.ask!=='0' && await page.locator('#cardNudge').count()===0, JSON.stringify(nc));

    /* 6. ⋯ › Store */
    await mk({ doc:DOC() });
    await menu();
    await page.locator('[data-sm-store="cdan"]').click(); await page.waitForTimeout(400);
    const m1 = await page.evaluate(()=>({ sel:localStorage.getItem('ml_store'), open:!!document.querySelector('#shopMenuEl'), on:!!document.querySelector('[data-sm-store="cdan"].on') }));
    ok('⋯ › Store picks a shop, and the menu stays open', m1.sel==='cdan' && m1.open && m1.on, JSON.stringify(m1));
    await page.locator('[data-sm-storeadd]').click(); await page.waitForTimeout(300);
    await page.locator('#smStoreName').fill('Corner deli'); await page.locator('#smStoreName').press('Enter'); await page.waitForTimeout(500);
    c = await cache(); const deli=(c.stores||[]).find(s=>s.name==='Corner deli');
    ok('…and a new shop can be added there, and is chosen', !!deli && await page.evaluate(()=>localStorage.getItem('ml_store'))===deli.id, JSON.stringify(c.stores));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-menu.png') });

    /* the version under the ⋯ */
    const ver = await page.evaluate(()=>{ const v=document.querySelector('#appVer'), b=document.querySelector('#shopMenu'); if(!v||!b) return null;
      const r=v.getBoundingClientRect(), q=b.getBoundingClientRect(); return { txt:v.textContent, below:r.top>=q.bottom-2, centred:Math.abs((r.left+r.right)/2-(q.left+q.right)/2)<3, src:(document.querySelector('script[src*="app.js"]')||{}).src||'' }; });
    ok('the app\'s version shows under the Shop page\'s ⋯', ver && /^v\d+\.\d\d$/.test(ver.txt) && ver.below && ver.centred, JSON.stringify(ver));

    /* 7. the cart stays folded */
    await mk({ doc:DOC({ items:[it("1","Milk","dairy"), it("2","Bread","bulk"), it("3","Eggs","dairy")] }) });
    await page.locator('.pill[data-pill="1"]').first().click(); await page.waitForTimeout(150);
    await page.locator('#checkedHead').click(); await page.waitForTimeout(400);
    ok('a tap on the cart\'s head right after a tick does not unfold it', await page.locator('.checkedscroll').count()===0, '');
    await page.waitForTimeout(800); await page.locator('#checkedHead').click(); await page.waitForTimeout(400);
    ok('…a deliberate tap later still does', await page.locator('.checkedscroll').count()===1, '');

    const app = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('ml_nocard is in both exclusion lists', (app.match(/ml_nocard\$/g)||[]).length===2, '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
