/* v2.82 — from the household's iPhone screenshot of Settings › Tiles:
   - the Preview, set to square, showed tiny collapsed tiles: the same Safari rule as v2.80's tiles (an aspect-ratio box is
     not stretched across its grid column), missed in the preview's own mini tiles (lesson 49);
   - the variable-height button showed as a blue emoji box: iOS draws some arrow characters as emoji. The width and height
     arrows are now one drawn mark (arrowSVG), the height one turned 90°.

   WHAT THESE CHECKS HAVE TO PROVE:
   - with Safari's justify-self:start played in Chromium, square preview tiles are each a column wide and square, at 3 and 5;
   - no arrow CHARACTER is left on a Tiles button (Settings and the ⋯ menu): each arrow is an svg.arrowmk, height's turned;
   - every Tiles and Height button in the ⋯ menu sits inside it (the square button ran off the edge after v2.79 added 1 and 2).

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

    const TD = DOC({ items:[it("1","Apple","fruit"),it("2","Date","fruit")] });
    const TX = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");';
    for (const cols of ['3','5']) {
      await mk({ doc:TD, extra:TX+`localStorage.setItem("ml_largecols","${cols}"); localStorage.setItem("ml_tilelines","sq");` });
      await page.locator('#setNav').click(); await page.waitForTimeout(600);
      await page.addStyleTag({ content:'.tlprev .tlptile { justify-self:start; }' }); await page.waitForTimeout(200);   // play Safari (lesson 48)
      const pv = await page.evaluate((n)=>{ const g=document.querySelector('.tlprev .tlpgrid, .tlprev [role="img"]') || document.querySelector('.tlprev'); const ts=[...document.querySelectorAll('.tlprev .tlptile')];
        const par=ts[0].parentElement, cs=getComputedStyle(par), gap=parseFloat(cs.columnGap)||0, col=(par.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-gap*(n-1))/n;
        return { col:+col.toFixed(1), t:ts.map(t=>{ const r=t.getBoundingClientRect(); return [+r.width.toFixed(1), +r.height.toFixed(1)]; }) }; }, +cols);
      ok(`Settings preview, square × ${cols} (Safari played): every mini tile a column wide and square`, pv.t.length && pv.t.every(([w,h])=>Math.abs(w-pv.col)<=1 && Math.abs(w-h)<=1), JSON.stringify(pv));
      if(out && cols==='3'){ await page.evaluate(()=>document.querySelector('.tlprev').scrollIntoView({block:'center'})); await page.screenshot({ path: out.replace(/\.png$/,'-preview.png') }); }
    }
    const btn = await page.evaluate(()=>[...document.querySelectorAll('[data-opt-cols], [data-opt-lines]')].map(b=>({ t:b.textContent.trim(), svg:!!b.querySelector('svg.arrowmk'), up:!!b.querySelector('svg.arrowmk.up') })));
    ok('Settings: no arrow characters; width ↔ and height are drawn marks, height turned', btn.every(b=>!/[↔↕⬍⇕]/.test(b.t)) && btn.filter(b=>b.svg).length===2 && btn.filter(b=>b.up).length===1, JSON.stringify(btn.filter(b=>b.svg||!/^\d$/.test(b.t))));
    await mk({ doc:TD, extra:TX+'localStorage.setItem("ml_largecols","3");' });
    await page.locator('#shopMenuBtn, [aria-label="More"]').first().click(); await page.waitForTimeout(400);
    const mb = await page.evaluate(()=>[...document.querySelectorAll('[data-sm-cols], [data-sm-lines]')].map(b=>({ t:b.textContent.trim(), svg:!!b.querySelector('svg.arrowmk') })));
    ok('the ⋯ menu: no arrow characters either, two drawn arrows', mb.every(b=>!/[↔↕⬍⇕]/.test(b.t)) && mb.filter(b=>b.svg).length===2, JSON.stringify(mb.filter(b=>b.svg)));
    const clip = await page.evaluate(()=>{ const m=document.querySelector('#shopMenuEl').getBoundingClientRect(); return [...document.querySelectorAll('[data-sm-cols], [data-sm-lines]')].filter(b=>{ const r=b.getBoundingClientRect(); return r.right>m.right-2 || r.left<m.left; }).map(b=>b.dataset.smLines ?? b.dataset.smCols); });
    ok('the ⋯ menu: every Tiles and Height button sits inside the menu (square was cut off since v2.79)', clip.length===0, JSON.stringify(clip));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-menu.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
