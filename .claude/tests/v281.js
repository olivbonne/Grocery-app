/* v2.81 — from the household's reference screenshot (another list app): the line under the name is 0.65 of the name
   (measured: cap height 36px for "Apples", 23–24px for "3 lb · Pink Lady · Granny Smith"). Here the note was a fixed 13px
   (bigger than the name at 5 columns), the amount 0.8 of the name in columns and as big as the name in the one-line layouts.
   And the variable-height button is the width's ↔ turned upright (the ↕ glyph looked unlike it).

   WHAT THESE CHECKS HAVE TO PROVE:
   - in 2 and 3 columns, 1 per row and variable width, and at icon size XL: note = amount = its quantity = 0.65 × name (±0.2px);
   - at 5 columns the ratio gives way to a 10px floor (never unreadably small), and the note is never bigger than the name;
   - Settings' variable-height button holds ↔ turned 90°.

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
const now = Date.now();
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[{id:"cdan",name:"Dandenong market",aisles:[]}], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
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
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const LAY = 'localStorage.setItem("ml_lk_edit_rows","v"); localStorage.setItem("ml_lk_edit_names","0"); localStorage.setItem("ml_lk_edit_chcols","v");';
    const D = ()=>DOC({ items:[it("1","chilli","vegetable",{ qty:2, note:"Large, Green" })] });
    const top = (sel)=>page.evaluate(s=>{ const e=document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }, sel);

    const TD = DOC({ items:[it("1","Wombok cabbage","vegetable",{qty:6,weight:"900g",note:"Organic, white"}),it("2","Apple","fruit",{qty:5,note:"Pink Lady"}),it("3","Date","fruit")] });
    const TX = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");';
    const sizes = ()=>page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="1"]'); const f=s=>{ const e=p.querySelector(s); return e?parseFloat(getComputedStyle(e).fontSize):null; };
      return { name:f('.pname'), note:f('.pnote'), meta:f('.pill-meta'), qty:f('.pill-meta .qty'), z:document.querySelector('#zoomer').className }; });
    for (const [extra,label] of [['localStorage.setItem("ml_largecols","3");','3 columns'],['localStorage.setItem("ml_largecols","2");','2 columns'],
        ['localStorage.setItem("ml_largecols","1");','1 per row'],['localStorage.setItem("ml_largecols","0");','variable width'],
        ['localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_icosize","xl");','3 columns, icons XL']]) {
      await mk({ doc:TD, extra:TX+extra });
      const s = await sizes(), want = s.name*0.65, near = v=>v!==null && Math.abs(v-Math.max(10,want))<=0.2;
      ok(`${label}: note, amount and quantity are 0.65 of the name`, near(s.note) && near(s.meta) && near(s.qty), JSON.stringify({ ...s, want:+want.toFixed(2) }));
      if(out && label==='3 columns') await page.screenshot({ path: out.replace(/\.png$/,'-3cols.png') });
    }
    await mk({ doc:TD, extra:TX+'localStorage.setItem("ml_largecols","5");' });
    const s5 = await sizes();
    ok('5 columns: never under 10px, and the note never bigger than the name', s5.note===10 && s5.meta===10 && s5.note<=s5.name, JSON.stringify(s5));
    await page.locator('#setNav').click(); await page.waitForTimeout(600);
    /* SUPERSEDED by v2.82: both arrows are the same drawn mark (iOS drew ↕ as an emoji box); height turns it 90°. */
    const vb = await page.evaluate(()=>{ const s=document.querySelector('[data-opt-lines=""] svg.arrowmk.up'), w=document.querySelector('[data-opt-cols="0"] svg.arrowmk:not(.up)');
      return s && w ? { same:s.innerHTML===w.innerHTML, tr:getComputedStyle(s).transform } : null; });
    ok('Settings: the variable-height button is the width\'s arrow turned 90°', vb && vb.same && /^matrix\([^,]+, 1, -1,/.test(vb.tr), JSON.stringify(vb));
    if(out){ await page.evaluate(()=>document.querySelector('[data-opt-lines=""]').scrollIntoView({block:'center'})); await page.screenshot({ path: out.replace(/\.png$/,'-btn.png') }); }
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
