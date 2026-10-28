/* v2.79 — from the household's screenshots (Edit item with Rows and Choices "variable", row names off), and Settings › Tiles.
   Edit item: Quantity and Unit on the first line, Category and Where to buy on the next; Unit's list opens between the two
   lines, Category's and Where's under the second; closing a list lets the sheet shrink back (v2.77 held its tallest height
   for as long as it was open, so after closing every list it stayed tall, and with the keyboard up it was mostly empty).
   Tiles: heights 1 and 2 lines, and a preview of display × height in Settings.

   WHAT THESE CHECKS HAVE TO PROVE:
   - closed: Unit on Quantity's line, Where on Category's line, that second line below the first by exactly one row gap
     (the line break adds no gap of its own);
   - Unit open: its list sits below the first line and above Category; Quantity and Unit do not move;
   - Category open: its list sits below Category and Where, and they do not move; both open: Unit's list, then Category,
     then Category's list;
   - a pick keeps the sheet still (v2.77); closing the last list brings the sheet back to its closed height;
   - tile heights 1 and 2: equal heights, whole lines, nothing spills; at 1 the name only (no note), at 2 the name and a
     1-line note; the amount a corner badge that touches neither (bottom-right ran into the text before it moved);
   - the ⋯ menu offers 1–8; the Settings preview draws the chosen columns × height.

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
    await hold(page.locator('.pill[data-pill="1"]').first());
    /* measured from the sheet's top: the sheet grows upward when a list opens */
    const box = (sel)=>page.evaluate(s=>{ const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(), o=document.querySelector('#sheet').getBoundingClientRect().top; return { t:Math.round(r.top-o), b:Math.round(r.bottom-o) }; }, sel);
    const Q='#sheet .edcell[data-row="qty"] .eqty', U='#sheet [data-w-open]', C='#ecHead', W='#ewHead';
    const sheetH = ()=>page.evaluate(()=>Math.round(document.querySelector('#sheet').getBoundingClientRect().height));
    const c0 = { q:await box(Q), u:await box(U), c:await box(C), w:await box(W) }; const h0 = await sheetH();
    ok('closed: Unit on Quantity\'s line, Where to buy on Category\'s line', Math.abs(c0.q.t-c0.u.t)<4 && Math.abs(c0.c.t-c0.w.t)<4, JSON.stringify(c0));
    const gap = c0.c.t - Math.max(c0.q.b, c0.u.b);
    ok('…Category\'s line is under the first, one row gap below (the break adds no gap)', gap>=8 && gap<=12, 'gap '+gap);
    await page.locator(U).click(); await page.waitForTimeout(500);
    const u1 = { q:await box(Q), u:await box(U), c:await box(C), l:await box('#sheet .wgrid') };
    ok('Unit open: its list sits between the first line and Category', u1.l && u1.l.t>=u1.u.b && u1.l.b<=u1.c.t, JSON.stringify(u1));
    ok('…and Quantity and Unit do not move', u1.q.t===c0.q.t && u1.u.t===c0.u.t, JSON.stringify({ c0, u1 }));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-unit.png') });
    const t0 = await top('#sheet');
    await page.locator('#sheet [data-w-set="edit|cup"]').click(); await page.waitForTimeout(500);
    ok('a pick keeps the list open and the sheet still', await page.locator('#sheet .wgrid').count()===1 && await top('#sheet')===t0, '');
    await page.locator('#ecHead').click(); await page.waitForTimeout(500);
    /* SUPERSEDED by v2.83: only one list is open at a time (the household), so opening Category closes Unit. Still protected:
       Category's list sits under Category and Where, neither moves, and closing the last list brings the sheet back. */
    const b1 = { u:await box(U), l:await box('#sheet .wgrid'), q:await box(Q), c:await box(C), w:await box(W), cl:await box('#sheet .edcell[data-row="cat"] .edchips') };
    ok('opening Category closes Unit; its list sits under Category and Where', !b1.l && b1.cl && b1.cl.t>=Math.max(b1.c.b,b1.w.b) && Math.abs(b1.c.t-b1.w.t)<4 && b1.c.t-b1.q.t===c0.c.t-c0.q.t, JSON.stringify({ c0, b1 }));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-cat.png'), fullPage:true });
    const hc = await sheetH();
    await page.locator('#ecHead').click(); await page.waitForTimeout(500);
    const h3 = await sheetH();
    ok('closing the last list brings the sheet back to its closed height', h3<hc && Math.abs(h3-h0)<=2, JSON.stringify({ h0, withCat:hc, h3 }));
    /* ── tile heights 1 and 2, and the Settings preview ── */
    const TD = DOC({ items:[it("1","Milk","dairy",{qty:3,note:"Soy, high protein, VitaSoy"}),it("2","Yogurt","dairy"),it("3","Wombok cabbage","vegetable",{qty:6,weight:"900g",note:"Organic, white"}),it("4","Ginger","vegetable")] });
    const TX = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_caton","0");';
    const tiles = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const r=p.getBoundingClientRect(), n=p.querySelector('.pname'), nr=n.getBoundingClientRect(), lh=parseFloat(getComputedStyle(n).lineHeight)||nr.height;
      const note=p.querySelector('.pnote'), m=p.querySelector('.pill-meta');
      const vis=e=>e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().height>0;
      const inside=[...p.children].filter(vis).every(k=>{ const b=k.getBoundingClientRect(); return b.top>=r.top-1 && b.bottom<=r.bottom+1; });
      const mr=vis(m)?m.getBoundingClientRect():null;
      const hitsText = mr ? [n, vis(note)?note:null].filter(Boolean).some(e=>{ const b=e.getBoundingClientRect(); return !(mr.right<=b.left||mr.left>=b.right||mr.bottom<=b.top||mr.top>=b.bottom); }) : false;
      return { id:p.dataset.pill, h:Math.round(r.height), lines:+(nr.height/lh).toFixed(2), note:vis(note), badge:!!mr, hitsText, inside }; }));
    const H = {};
    for (const n of ['1','2','3']) {
      await mk({ doc:TD, extra:TX+`localStorage.setItem("ml_tilelines","${n}");` });
      const tt = await tiles(); H[n]=tt[0].h;
      ok(`${n} line(s): every tile the same height, whole lines, nothing spills out`, tt.every(x=>x.h===tt[0].h && x.inside && Math.abs(x.lines-Math.round(x.lines))<=0.08 && x.lines>=0.9), JSON.stringify(tt));
      if (n!=='3') {
        const milk=tt.find(x=>x.id==='1'), wom=tt.find(x=>x.id==='3');
        ok(`${n} line(s): the name has ${n==='1'?'1 line and no note':'1 line beside a 1-line note'}, the amount a corner badge clear of the text`,
          milk.badge && wom.badge && !milk.hitsText && !wom.hitsText && Math.round(milk.lines)===1 && (n==='1' ? !milk.note : milk.note), JSON.stringify({ milk, wom }));
        if(out) await page.screenshot({ path: out.replace(/\.png$/,`-h${n}.png`) });
      }
    }
    ok('1 < 2 < 3 lines', H['1']<H['2'] && H['2']<H['3'], JSON.stringify(H));
    await page.locator('#shopMenuBtn, [aria-label="More"]').first().click(); await page.waitForTimeout(400);
    const mb = await page.evaluate(()=>[...document.querySelectorAll('[data-sm-lines]')].map(b=>b.dataset.smLines||'v'));
    ok('the ⋯ menu offers 1–8, variable and square', mb.join()==='1,2,3,4,5,6,7,8,v,sq', JSON.stringify(mb));
    /* the preview in Settings: as many mini tiles per row as columns, as many bars as lines */
    const prev = async(extra)=>{ await mk({ doc:TD, extra:TX+extra }); await page.locator('#bottomnav').getByText(/Settings/).click(); await page.waitForTimeout(700);
      return page.evaluate(()=>{ const b=document.querySelector('.tlprev'); if(!b) return null; const ts=[...b.querySelectorAll('.tlptile')];
        const r0=ts.length?Math.round(ts[0].getBoundingClientRect().top):0;
        return { n:ts.length, perRow:ts.filter(t=>Math.round(t.getBoundingClientRect().top)===r0).length, bars:ts.map(t=>t.querySelectorAll('i').length),
          hs:ts.map(t=>Math.round(t.getBoundingClientRect().height)), ws:ts.map(t=>Math.round(t.getBoundingClientRect().width)), label:b.querySelector('[role="img"]')?.getAttribute('aria-label')||b.getAttribute('aria-label') }; }); };
    const p4 = await prev('localStorage.setItem("ml_tilelines","4");');
    ok('Settings preview, 3 columns × 4 lines: rows of 3 mini tiles, 4 bars each, all one height', p4 && p4.perRow===3 && p4.bars.every(b=>b===4) && p4.hs.every(h=>h===p4.hs[0]), JSON.stringify(p4));
    const pq = await prev('localStorage.setItem("ml_tilelines","sq"); localStorage.setItem("ml_largecols","5");');
    ok('…5 columns × square: rows of 5, each as tall as wide', pq && pq.perRow===5 && pq.hs.every((h,i)=>Math.abs(h-pq.ws[i])<=1), JSON.stringify(pq));
    const pv = await prev('');
    ok('…variable: tiles with different numbers of bars', pv && new Set(pv.bars).size>1, JSON.stringify(pv));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-preview.png') });
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
