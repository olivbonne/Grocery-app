/* v2.84 — Customise the look › Sheets › Layout, from the household:
   - "Around choices" was cut off ("Around ch…"): a number cell's name now wraps instead of ending in "…";
   - the page "keeps scrolling back" after a + or −: Settings redraws its whole page on each tap, Chromium's scroll anchoring
     hid the jump but iOS Safari has none, so the page moved under the finger (lesson 51). The tapped control now stays
     where it was on screen.

   WHAT THESE CHECKS HAVE TO PROVE:
   - with scroll anchoring off (Safari played), three taps on "Around choices" + leave its button at the same height on
     screen; before the fix it moved 68px per tap;
   - the same for a tap on a Layout button (Choices 3) and the Corner + of the Sheets section;
   - the "Around choices" name shows in full (no clipping across or down), and no number-cell name breaks inside a word
     ("Transparency" did with the first fix, which let every name break anywhere at a fixed 52px).

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

    await mk({ doc:D(), extra:LAY });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optLook').click(); await page.waitForTimeout(600);
    await page.addStyleTag({ content:'* { overflow-anchor:none !important; }' });   // play iOS Safari: no scroll anchoring
    const vtop = (sel)=>page.evaluate(s=>Math.round(document.querySelector(s).getBoundingClientRect().top), sel);
    const tapStays = async(sel, n)=>{ await page.evaluate(s=>document.querySelector(s).scrollIntoView({block:'center'}), sel); await page.waitForTimeout(250);
      const t0 = await vtop(sel); const tops=[]; for(let i=0;i<n;i++){ await page.locator(sel).first().click(); await page.waitForTimeout(300); tops.push(await vtop(sel)); } return { t0, tops }; };
    const a = await tapStays('[data-opt-num="lk_edit_l2gap"][data-opt-delta="1"]', 3);
    ok('Safari played: "Around choices" + stays where it was, tap after tap', a.tops.every(t=>Math.abs(t-a.t0)<=1), JSON.stringify(a));
    const b = await tapStays('[data-lk-chcols="edit|3"]', 1);
    ok('…a Layout button (Choices 3) too', b.tops.every(t=>Math.abs(t-b.t0)<=1), JSON.stringify(b));
    const c = await tapStays('[data-opt-num="erad"][data-opt-delta="1"]', 2);
    ok('…and the Corner + above it', c.tops.every(t=>Math.abs(t-c.t0)<=1), JSON.stringify(c));
    const lab = await page.evaluate(()=>{ const s=document.querySelector('[data-opt-num="lk_edit_l2gap"]').closest('.numcell').querySelector('span'); return { t:s.textContent, w:s.scrollWidth<=s.clientWidth+1, h:s.scrollHeight<=s.clientHeight+1, ov:getComputedStyle(s).textOverflow }; });
    ok('"Around choices" shows in full (no clipping, no ellipsis)', lab.t==='Around choices' && lab.w && lab.h && lab.ov!=='ellipsis', JSON.stringify(lab));
    /* a one-word name never breaks inside the word ("Transpar / ency" with the first fix) */
    const words = await page.evaluate(()=>[...document.querySelectorAll('.numcell > span')].filter(s=>s.offsetParent).map(s=>{ const r=document.createRange(); r.selectNodeContents(s); const lines=new Set([...r.getClientRects()].map(x=>Math.round(x.top))); return { t:s.textContent, lines:lines.size, words:s.textContent.trim().split(/\s+/).length, clip:s.scrollWidth>s.clientWidth+1 }; }));
    const broken = words.filter(w=>w.lines>w.words || w.clip);
    ok('no number-cell name breaks inside a word or is cut off', words.length>5 && broken.length===0, JSON.stringify(broken.length?broken:words.slice(0,6)));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-layout.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
