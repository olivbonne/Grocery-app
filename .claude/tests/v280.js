/* v2.80 — from the household's screenshots (square tiles of every size, filled tiles in the one-line layouts, Settings › Tiles).
   - Square tiles are one column wide, whatever they hold: a box with an aspect ratio is not stretched across its grid
     column, so v2.78's squares were sized to their own text ("Date" small and round, "Asparagus" wide).
   - The "variable height" button shows ↕ (↔ is the width's).
   - Edit item: the row whose list is open (Unit, Category, Where to buy) is outlined in orange.
   - In 1 per row and variable width the note takes the tile's text colour, as in columns (it was grey, unreadable on a filled tile).
   - Settings › Tiles: "Tiles across" with the numbers only; the "Tile display" box is gone.

   WHAT THESE CHECKS HAVE TO PROVE:
   - square, icons off, short and long names, 3 and 4 columns, Safari's stretch played in Chromium: every tile the column's
     width (row width less the gaps, over the columns) and as tall as wide;
   - the ⋯ menu's and Settings' variable-height button reads ↕;
   - Unit open → its value tile's border is the accent; Category's (closed) is not; Category open → the other way round;
   - the note's colour equals the name's in 1 per row and variable width, on filled tiles;
   - Settings: "Tiles across", no [data-tiledisp] box, and its 2 still sets two columns.

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

    const TD = DOC({ items:[it("1","Apple","fruit",{qty:5,note:"red"}),it("2","Date","fruit"),it("3","Asparagus","vegetable"),it("4","Wombok cabbage and more","vegetable",{qty:6,weight:"900g",note:"Organic, white"}),it("5","Milk","dairy"),it("6","Can","bulk",{weight:"300g",note:"corn"})] });
    const TX = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_emoji_item","0");';
    for (const cols of ['3','4']) {
      await mk({ doc:TD, extra:TX+`localStorage.setItem("ml_largecols","${cols}"); localStorage.setItem("ml_tilelines","sq");` });
      /* iOS Safari does not stretch a box with an aspect ratio across its grid column (the spec's "normal" acts as "start"
         for it); Chromium does, so v2.78's squares looked right here and wrong on the phone. Play Safari: a weak start rule
         that only an explicit stretch on the tile overrides. */
      await page.addStyleTag({ content:'.zoomer .pills > .pill { justify-self:start; }' }); await page.waitForTimeout(200);
      const sq = await page.evaluate((n)=>{ const g=document.querySelector('#zoomer .pills'); const cs=getComputedStyle(g); const gap=parseFloat(cs.columnGap)||0;
        const col=(g.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0)-gap*(n-1))/n;
        return { col:Math.round(col), t:[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const r=p.getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height)]; }) }; }, +cols);
      ok(`square, ${cols} columns, icons off: every tile a column wide and as tall as wide`, sq.t.length===6 && sq.t.every(([w,h])=>Math.abs(w-sq.col)<=1 && Math.abs(h-w)<=1), JSON.stringify(sq));
      if(out && cols==='3') await page.screenshot({ path: out.replace(/\.png$/,'-square.png') });
    }
    await page.locator('#shopMenuBtn, [aria-label="More"]').first().click(); await page.waitForTimeout(400);
    ok('the ⋯ menu\'s variable-height button reads ↕', (await page.locator('[data-sm-lines=""]').textContent()).trim()==='↕', '');
    await page.evaluate(()=>{ const b=document.querySelector('#smBg'); if(b) b.click(); }); await page.waitForTimeout(300);

    /* the note in the one-line layouts, filled tiles */
    for (const [cols,name] of [['1','1 per row'],['0','variable width']]) {
      await mk({ doc:TD, extra:TX+`localStorage.setItem("ml_largecols","${cols}"); localStorage.setItem("ml_fill","accent");` });
      const c = await page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="1"]'); const s=e=>getComputedStyle(e).color;
        return { name:s(p.querySelector('.pname')), note:s(p.querySelector('.pnote')), op:getComputedStyle(p.querySelector('.pnote')).opacity, z:document.querySelector('#zoomer').className }; });
      ok(`${name}: the note takes the tile's text colour, as in columns`, c.name===c.note, JSON.stringify(c));
    }
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-var.png') });

    /* Edit item: the open row is outlined */
    await mk({ doc:DOC({ items:[it("1","chilli","vegetable",{ qty:2 })] }), extra:'localStorage.setItem("ml_lk_edit_rows","v"); localStorage.setItem("ml_lk_edit_names","0");' });
    await hold(page.locator('.pill[data-pill="1"]').first());
    const acc = await page.evaluate(()=>{ const d=document.createElement('i'); d.style.color='var(--accent)'; document.body.appendChild(d); const c=getComputedStyle(d).color; d.remove(); return c; });
    const brd = ()=>page.evaluate(()=>({ unit:getComputedStyle(document.querySelector('#sheet [data-w-open] .edval')).borderTopColor, cat:getComputedStyle(document.querySelector('#ecHead .edval')).borderTopColor }));
    const b0 = await brd();
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(400);
    const b1 = await brd();
    ok('Edit item: Unit open is outlined in orange, Category (closed) is not', b0.unit!==acc && b1.unit===acc && b1.cat!==acc, JSON.stringify({ acc, b0, b1 }));
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(300);
    await page.locator('#ecHead').click(); await page.waitForTimeout(400);
    const b2 = await brd();
    ok('…Category open is outlined, Unit (closed) is not any more', b2.cat===acc && b2.unit!==acc, JSON.stringify(b2));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });

    /* Settings › Tiles */
    await mk({ doc:TD, extra:TX+'localStorage.setItem("ml_largecols","3");' });
    await page.locator('#setNav').click(); await page.waitForTimeout(600);
    const st = await page.evaluate(()=>({ across:/Tiles across/.test(document.body.textContent), old:/Tile display/.test(document.body.textContent), box:document.querySelectorAll('[data-tiledisp], .tdopt').length,
      varh:(document.querySelector('[data-opt-lines=""]')||{}).textContent }));
    ok('Settings: "Tiles across", no "Tile display" box', st.across && !st.old && st.box===0, JSON.stringify(st));
    ok('…the variable-height button reads ↕', (st.varh||'').trim()==='↕', JSON.stringify(st));
    await page.locator('[data-opt-cols="2"]').click(); await page.waitForTimeout(500);
    ok('…and its 2 sets two columns', await page.evaluate(()=>localStorage.getItem('ml_largecols'))==='2', '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-settings.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
