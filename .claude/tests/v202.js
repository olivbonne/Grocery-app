/* v2.02 — Export list as text, from Settings.

   WHY THIS EXISTS: the household asked for "a text file of all items saved". The file is a record
   they will keep, send or print, so what matters is its CONTENTS: every item on the list, what is in
   the cart and every Regular, grouped by category, with amounts as they were written.

   WHAT THESE CHECKS HAVE TO PROVE:
   - on a device that can share files (an iPhone), the button hands the share sheet ONE .txt file
     named after the list and dated;
   - that file has the three sections with the right counts, the category groups in the list's own
     order, the items sorted by name, and a final "Other" group for an item whose category is gone;
   - an amount is the stored text, NOT the converted display (Metric is on here and "1 lb" must stay
     "1 lb" in the file — the file is a record);
   - on a device that cannot share files it falls back to a download with the same contents;
   - cancelling the share sheet is silent (no fallback download, no toast).

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control. The share API is stubbed because headless Chromium has no share
     sheet; the stub records what the app handed it, which is the thing under test.
   - v1.77: each page's nav carries its own ids.
   - v1.91: assert WHICH value appeared, never merely that something appeared.
   - v2.00: addInitScript re-runs on every navigation, so the seed returns early once seeded. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"meat",label:"Meat",color:"#B5402B",emoji:"🥩",subs:[]},
              {id:"fruit",label:"Fruit",color:"#C98A06",emoji:"🍌",subs:[]},
              {id:"fresh",label:"Fresh",color:"#3B7DD8",emoji:"🥛",subs:[]}];
  const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,weight:w||"",qty:q||1,sub:"",checked:!!ck,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[it("1","milk","fresh",2),it("2","beef mince","meat",1,"1 lb"),it("3","apples","fruit",1,"1 kg"),
           it("4","soap","gone",1,"",true)],
    buyAgain:[{name:"bananas",cat:"fruit",qty:6,weight:"",sub:"",ts:1},{name:"Avocado",cat:"fruit",qty:1,weight:"",sub:"",ts:1},
              {name:"eggs",cat:"fresh",qty:12,weight:"",sub:"",ts:1}],
    baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Our Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Our Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1"); localStorage.setItem("ml_optcoll","[]");
  localStorage.setItem("ml_units","metric");
})()`;
/* canShare/share: "files" = a device that shares files; "none" = one that cannot; "cancel" = the
   person closes the share sheet. The stub reads the File back so the test sees its real contents. */
const SHARE = (mode) => `(() => {
  window.__shared = null;
  if(${JSON.stringify(mode)} === "none"){ try{ Object.defineProperty(navigator,"canShare",{value:undefined,configurable:true}); }catch(e){} return; }
  Object.defineProperty(navigator,"canShare",{value:(d)=>!!(d&&d.files&&d.files.length),configurable:true});
  Object.defineProperty(navigator,"share",{configurable:true,value:async(d)=>{
    if(${JSON.stringify(mode)} === "cancel"){ const e=new Error("cancelled"); e.name="AbortError"; throw e; }
    const f=d.files[0]; window.__shared={ n:d.files.length, name:f.name, type:f.type, text:await f.text() }; }});
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(mode)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, acceptDownloads:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text();
      if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED); await page.addInitScript(SHARE(mode));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
    await page.locator('#setNav, #setNavP, #setNavS').first().click(); await page.waitForTimeout(600);
  };
  const today = () => { const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };

  try{
    /* ── A. an iPhone: the share sheet gets one text file ─────────────── */
    await mk('files');
    const btn = await page.evaluate(()=>{ const b=document.querySelector('#optExport');
      return b ? { txt:b.textContent.trim(), emoji:/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(b.textContent) } : null; });
    ok('Settings has an "Export list as text" button', btn && btn.txt==='Export list as text', JSON.stringify(btn));
    ok('…drawn as chrome, with no emoji', btn && btn.emoji===false, JSON.stringify(btn));
    await page.locator('#optExport').click(); await page.waitForTimeout(700);
    const s = await page.evaluate(()=>window.__shared);
    ok('it hands the share sheet exactly one file', s && s.n===1, JSON.stringify(s && {n:s.n,name:s.name}));
    ok('…a .txt named after the list and dated today', s && s.name===`our-groceries-${today()}.txt` && /^text\/plain/.test(s.type),
       JSON.stringify(s && {name:s.name,type:s.type}));
    const t = (s && s.text) || '';
    ok('…headed with the list name', /^Our Groceries — exported .+\n\n/.test(t), JSON.stringify(t.split('\n')[0]));
    ok('…with each section counted', /\nTO BUY \(3\)\n/.test('\n'+t) && /\nIN THE CART \(1\)\n/.test(t) && /\nREGULARS \(3\)\n/.test(t),
       JSON.stringify(t.split('\n').filter(l=>/^[A-Z ]+\(\d+\)$/.test(l))));
    const toBuy = t.slice(t.indexOf('TO BUY'), t.indexOf('IN THE CART'));
    ok('…groups in the list\'s own category order', toBuy.indexOf('\nMeat\n') < toBuy.indexOf('\nFruit\n') && toBuy.indexOf('\nFruit\n') < toBuy.indexOf('\nFresh\n'),
       JSON.stringify(toBuy));
    ok('…amounts as they were written, NOT converted (Metric is on: 1 lb stays 1 lb)', /\n  - 1 lb Beef mince\n/.test(t) && !/45\d g Beef/.test(t),
       JSON.stringify(toBuy));
    ok('…counts shown as "2×"', /\n  - 2× Milk\n/.test(t), JSON.stringify(toBuy));
    const cart = t.slice(t.indexOf('IN THE CART'), t.indexOf('REGULARS'));
    ok('…an item whose category is gone lands under "Other"', /\nOther\n  - Soap\n/.test(cart), JSON.stringify(cart));
    const regs = t.slice(t.indexOf('REGULARS'));
    ok('…and Regulars are sorted by name, ignoring case', /\nFruit\n  - Avocado\n  - 6× Bananas\n/.test(regs), JSON.stringify(regs));
    ok('…ending in one newline', /[^\n]\n$/.test(t), JSON.stringify(t.slice(-20)));

    /* ── B. cancelling the share sheet is silent ──────────────────────── */
    await mk('cancel');
    let dl=false; page.on('download',()=>{ dl=true; });
    await page.locator('#optExport').click(); await page.waitForTimeout(900);
    const toast = await page.evaluate(()=>{ const x=document.querySelector('.toast, #toast'); return x ? x.textContent.trim() : ''; });
    ok('closing the share sheet does nothing else — no download, no toast', dl===false && !/Saved|Copied|Could not/.test(toast),
       JSON.stringify({dl,toast}));

    /* ── C. a device that cannot share files downloads instead ─────────── */
    await mk('none');
    const [d] = await Promise.all([ page.waitForEvent('download', { timeout:5000 }), page.locator('#optExport').click() ]);
    const fs=require('fs'); const p=await d.path(); const body=p ? fs.readFileSync(p,'utf8') : '';
    ok('without a share sheet it downloads the same file', d.suggestedFilename()===`our-groceries-${today()}.txt`, d.suggestedFilename());
    ok('…with the same contents', /REGULARS \(3\)/.test(body) && /  - 1 lb Beef mince/.test(body), JSON.stringify(body.slice(0,80)));
    if(out) await page.screenshot({ path: out });
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
