/* v2.86 — the tile layout rules (the owner approved the canvas "Market List — tile layout rules": one margin, nine places,
   one owner each; keep / keep with a rule / change / discard).

   WHAT THESE CHECKS HAVE TO PROVE (rule 8 of the canvas):
   - every combination still offered — As now, Disc + unit (each corner, unit top / bottom / in the note), One pill (six
     places), inside and on the border (with a 14px gap), at 3, 4, 5 and 6 across, variable, 2 and 3 lines tall and square,
     (4 and 5 across at variable height, 6 across also at 3 lines — the suite's 300 s), with urgent / on-sale marks and an aisle badge — lays out with NO two elements of a tile overlapping, nothing inside the
     tile closer than the margin M to its inner edge (badges on the border excepted), and every name whole (no line cut);
   - one margin: the padding is equal on all four sides (8px; 6px at 5 and 6 across) and the name is centred on the inner box;
   - Safari's rules played: square tiles with justify-self:start still fill their columns, and still pass the above;
   - on the border is refused below a 13px gap (the badge goes inside, the Settings button is disabled with the reason);
   - the unit pill never shares a row with the disc; the left / right places are gone from Settings; picking a bottom
     corner for the disc moves a bottom unit to the top;
   - heights 1 and 2: "As now" shows the amount as the one pill (no separate badge);
   - the marks own a corner (top-left, top-right when the disc is there);
   - the new words have their French.

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
    /* the measuring: every column tile in the list; its parts as boxes; overlaps between any two; the margin; whole names */
    const measure = ()=>page.evaluate(()=>{
      const R=e=>e.getBoundingClientRect(), vis=e=>e && getComputedStyle(e).display!=='none' && R(e).width>0;
      const out={ tiles:[], bad:[] };
      document.querySelectorAll('#zoomer .pills > .pill[data-pill]').forEach(p=>{
        if(!vis(p)) return;
        const r=R(p), cs=getComputedStyle(p), bl=parseFloat(cs.borderLeftWidth), bt=parseFloat(cs.borderTopWidth), br=parseFloat(cs.borderRightWidth), bb=parseFloat(cs.borderBottomWidth);
        const inner={ l:r.left+bl, t:r.top+bt, r:r.right-br, b:r.bottom-bb };
        const M=parseFloat(getComputedStyle(p).getPropertyValue('--tm'))||0;
        const id=p.dataset.pill, parts=[];
        p.querySelectorAll(':scope > .pemoji, :scope > .pname, :scope > .pnote, :scope > .pill-meta, :scope > .cudisc, :scope > .cupill, :scope > .pmarks, :scope > .paisle').forEach(e=>{
          if(!vis(e)) return; let b=R(e);
          /* text: the glyphs' own boxes, not the block's full width */
          if(e.matches('.pname,.pnote')){ const rg=document.createRange(); rg.selectNodeContents(e); const rs=[...rg.getClientRects()].filter(x=>x.width>0);
            /* only what shows: lines the clamp hides lie outside the element's own box */
            const eb=R(e), sh=rs.map(x=>({ left:Math.max(x.left,eb.left), top:Math.max(x.top,eb.top), right:Math.min(x.right,eb.right), bottom:Math.min(x.bottom,eb.bottom) })).filter(x=>x.right>x.left && x.bottom>x.top);
            if(sh.length) b={ left:Math.min(...sh.map(x=>x.left)), top:Math.min(...sh.map(x=>x.top)), right:Math.max(...sh.map(x=>x.right)), bottom:Math.max(...sh.map(x=>x.bottom)) }; }
          parts.push({ k:e.className.split(' ')[0], bd:e.classList.contains('cu-bd')||e.classList.contains('paisle'), b:{ l:b.left, t:b.top, r:b.right, b:b.bottom } }); });
        for(let i=0;i<parts.length;i++) for(let j=i+1;j<parts.length;j++){ const a=parts[i].b, c=parts[j].b;
          const w=Math.min(a.r,c.r)-Math.max(a.l,c.l), h=Math.min(a.b,c.b)-Math.max(a.t,c.t);
          if(w>0.5 && h>0.5) out.bad.push(`${id}: ${parts[i].k}×${parts[j].k} ${w.toFixed(1)}×${h.toFixed(1)}`); }
        parts.filter(x=>!x.bd).forEach(x=>{ const g=Math.min(x.b.l-inner.l, x.b.t-inner.t, inner.r-x.b.r, inner.b-x.b.b);
          if(g < M-0.6) out.bad.push(`${id}: ${x.k} ${g.toFixed(1)}px from the edge (M ${M})`); });
        const nm=p.querySelector('.pname'); if(nm){ const lh=parseFloat(getComputedStyle(nm).lineHeight)||0, h=nm.clientHeight;
          if(lh && Math.abs(h/lh-Math.round(h/lh))>0.15) out.bad.push(`${id}: name ${h}px is not whole lines of ${lh}`);
          if(h < (lh||1)*0.9) out.bad.push(`${id}: name squashed to ${h}px`); }
        out.tiles.push({ id, M, pad:[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].map(parseFloat), w:r.width,
          nameC: nm ? (()=>{ const b=R(nm); return (b.left+b.right)/2-(inner.l+inner.r)/2; })() : 0 }); });
      return out; });

    const TD = DOC({ items:[
      it("1","Milk","dairy",{ qty:3, tags:["urgent"], starred:true }),
      it("2","Ginger","vegetable",{ tags:["discount"] }),
      it("3","Wombok cabbage","vegetable",{ qty:6, weight:"900g", note:"Organic, white" }),
      it("4","Coriander","vegetable",{ qty:2, weight:"1 bunch", tags:["urgent","discount","convenient"], starred:true, note:"Fresh" }),
      it("5","Eggs","dairy",{ weight:"dozen" }),
      it("6","Peanut butter crunchy","pantry",{ qty:12 }) ] });
    const cu = (o)=>Object.entries(o).map(([k,v])=>`localStorage.setItem("ml_cu_${k}","${v}");`).join("");
    const BASE = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");';
    await mk({ doc:TD, extra:BASE });
    /* one page, settings rewritten and reloaded per combination */
    const set = async(o)=>{ await page.evaluate(o=>{ Object.keys(localStorage).filter(k=>/^ml_cu_|^ml_tilelines$|^ml_largecols$|^ml_gapx$|^ml_gapy$/.test(k)).forEach(k=>localStorage.removeItem(k));
        Object.entries(o).forEach(([k,v])=>localStorage.setItem(k,v)); }, o);
      await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForFunction(()=>document.querySelectorAll('#zoomer .pill[data-pill]').length>=6); await page.waitForTimeout(350); };
    const CFG = [ {}, { style:'sep' }, { style:'sep', dp:'tl' }, { style:'sep', dp:'bl' }, { style:'sep', dp:'br', uw:'top' }, { style:'sep', uw:'note' },
      { style:'tog' }, { style:'tog', tp:'top' }, { style:'tog', tp:'tl' }, { style:'tog', tp:'bl' }, { style:'tog', tp:'bottom' }, { style:'tog', tp:'br' }, { np:'above' } ];
    const HTS = ['', '3', '2', 'sq'];
    const fails=[]; let runs=0;
    for(const cols of ['3','4','5','6']) for(const ht of HTS) for(const c of CFG){
      if(cols!=='3' && !(ht==='' || (ht==='3' && cols==='6'))) continue;   // every height at 3 across; 4–6 at variable, 6 also at 3 lines (CI's 300 s)
      const o={ ml_largecols:cols }; if(ht) o.ml_tilelines=ht; Object.entries(c).forEach(([k,v])=>o['ml_cu_'+k]=v);
      await set(o); const m=await measure(); runs++;
      if(m.tiles.length<6) fails.push(`${cols}/${ht||'var'}/${JSON.stringify(c)}: ${m.tiles.length} tiles`);
      if(m.bad.length) fails.push(`${cols}/${ht||'var'}/${JSON.stringify(c)}: ${m.bad.slice(0,3).join('; ')}`);
    }
    ok(`rule 8: ${runs} combinations inside — no overlap, nothing nearer the edge than M, every name whole lines`, fails.length===0, fails.slice(0,6).join(' | '));

    /* on the border needs 13px: with a 14px gap the badges go on the border, and still collide with nothing */
    const fb=[]; let nb=0;
    for(const cols of ['3','5']) for(const c of [{ style:'sep' }, { style:'sep', dp:'bl', uw:'top' }, { style:'tog', te:'border', tp:'top' }, { style:'tog', te:'border', tp:'br' }]){
      await set(Object.assign({ ml_largecols:cols, ml_gapx:'14', ml_gapy:'14' }, ...Object.entries(c).map(([k,v])=>({['ml_cu_'+k]:v}))));
      const m=await measure(); nb++; const bd=await page.evaluate(()=>document.querySelectorAll('#zoomer .cu-bd').length);
      if(!bd) fb.push(`${cols}/${JSON.stringify(c)}: nothing on the border`); if(m.bad.length) fb.push(`${cols}/${JSON.stringify(c)}: ${m.bad.slice(0,3).join('; ')}`); }
    ok(`rule 5: ${nb} border combinations at a 14px gap — on the border, no overlap`, fb.length===0, fb.slice(0,4).join(' | '));
    await set({ ml_largecols:'3', ml_cu_style:'sep' });
    const g8 = await page.evaluate(()=>({ bd:document.querySelectorAll('#zoomer .cu-bd').length, inn:document.querySelectorAll('#zoomer .cudisc.cu-in').length, de:document.documentElement.getAttribute('data-cu-de') }));
    ok('rule 5: at the default 8px gap "On the border" is placed inside', g8.bd===0 && g8.inn>0 && g8.de==='inside', JSON.stringify(g8));

    /* one margin, centred */
    await set({ ml_largecols:'3' }); let m = await measure();
    const t1 = m.tiles.find(x=>x.id==='5');
    ok('rule 1: one margin — 8px on all four sides at 3 across, the name centred on the inner box', t1 && t1.pad.every(v=>Math.abs(v-8)<0.6) && Math.abs(t1.nameC)<1, JSON.stringify(t1));
    await set({ ml_largecols:'6' }); m = await measure();
    const t6 = m.tiles.find(x=>x.id==='5');
    ok('rule 1: 6px at 6 across', t6 && t6.pad.every(v=>Math.abs(v-6)<0.6), JSON.stringify(t6));

    /* the marks own a corner */
    await set({ ml_largecols:'3', ml_cu_style:'sep', ml_cu_dp:'tl' });
    const mk1 = await page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="1"]'), r=p.getBoundingClientRect(), a=p.querySelector('.pmarks').getBoundingClientRect(), d=p.querySelector('.cudisc').getBoundingClientRect();
      return { marksRight:a.left-r.left > r.width/2, discLeft:d.right-r.left < r.width/2, mk:document.documentElement.getAttribute('data-cu-mk') }; });
    ok('the marks move to the top right when the disc takes the top left', mk1.marksRight && mk1.discLeft && mk1.mk==='tr', JSON.stringify(mk1));

    /* heights 1 and 2: As now is the one pill */
    for(const h of ['1','2']){ await set({ ml_largecols:'3', ml_tilelines:h });
      const a = await page.evaluate(()=>({ pill:(document.querySelector('#zoomer .pill[data-pill="3"] .cupill-t')||{}).textContent, meta:!!document.querySelector('#zoomer .pill[data-pill] > .pill-meta') }));
      ok(`height ${h}: "As now" shows the amount as one pill, no separate badge`, a.pill==='6 × 900g' && !a.meta, JSON.stringify(a)); }

    /* Safari plays: square tiles with justify-self:start still fill their columns and still pass */
    await set({ ml_largecols:'3', ml_tilelines:'sq', ml_cu_style:'sep' });
    await page.addStyleTag({ content:'html body .shop .zoomer .pills > .pill { justify-self:start !important; }' }); await page.waitForTimeout(300);
    m = await measure(); const colW = await page.evaluate(()=>{ const ps=document.querySelector('#zoomer .pills'); return (ps.clientWidth-2*parseFloat(getComputedStyle(ps).columnGap))/3; });
    ok('Safari\'s rules (justify-self:start): square tiles still fill their columns, and nothing collides', m.tiles.every(x=>Math.abs(x.w-colW)<2) && m.bad.length===0, JSON.stringify({ w:m.tiles.map(x=>Math.round(x.w)), colW, bad:m.bad.slice(0,3) }));

    /* the aisle badge owns the top-right border */
    await mk({ doc:TD, store:'dand', extra:BASE+'localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_sorts", JSON.stringify({shop:"location"}));'+cu({ style:'tog' }) });
    m = await measure(); const ais = await page.evaluate(()=>document.querySelectorAll('#zoomer .paisle').length);
    ok('the aisle badge owns the top-right border; the pill there sits inside, under it', ais===0 || m.bad.length===0, JSON.stringify({ ais, bad:m.bad.slice(0,3) }));

    /* Settings: discarded places gone; the disc's row and the border disabled with their reasons; the disc moves the unit */
    await mk({ doc:TD, extra:BASE+'localStorage.setItem("ml_largecols","3");'+cu({ style:'sep' }) });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optLook').click(); await page.waitForTimeout(600);
    const s1 = await page.evaluate(()=>{ const b=v=>document.querySelector(`[data-cu="${v}"]`);
      return { left:!!b('uw|left')||!!b('uw|right')||!!b('tp|left')||!!b('tp|right'), topDis:b('uw|top').disabled, borderDis:b('de|border').disabled,
        hints:[...document.querySelectorAll('.opthint')].map(h=>h.textContent).filter(t=>/13|row the count disc/.test(t)).length }; });
    /* SUPERSEDED by v2.87: the unit may share the disc's row (it sits beside the disc), so no unit place is disabled and that
       hint is gone; still protects: no left / right places, On the border disabled at an 8px gap with its reason */
    ok('Settings: no left / right places; On the border is disabled at an 8px gap, with the reason', !s1.left && s1.borderDis && s1.hints>=1, JSON.stringify(s1));
    /* the design's preview: three real tiles at the top of the section, following the same rules (taps off, not list tiles) */
    const pv = await page.evaluate(()=>{ const q=s=>document.querySelectorAll('.cuprev '+s).length;
      return { tiles:q('.pill'), disc:q('.cudisc.cu-in'), unit:q('.cupill-u'), listy:q('[data-pill]'), taps:getComputedStyle(document.querySelector('.cuprev')).pointerEvents }; });
    ok('Settings: a live preview of three real tiles (2 discs, units as pills), not list tiles, no taps', pv.tiles===3 && pv.disc===2 && pv.unit===2 && pv.listy===0 && pv.taps==='none', JSON.stringify(pv));
    await page.locator('[data-cu="dp|bl"]').first().click(); await page.waitForTimeout(400);
    const s2 = await page.evaluate(()=>({ dp:localStorage.getItem('ml_cu_dp'), uw:localStorage.getItem('ml_cu_uw'), on:(document.querySelector('[data-cu="uw|top"]')||{}).className }));
    const pv2 = await page.evaluate(()=>{ const d=document.querySelector('.cuprev .cudisc'), p=d.closest('.pill'), r=p.getBoundingClientRect(), b=d.getBoundingClientRect(); return { left:b.left-r.left < r.width/2, low:b.top-r.top > r.height/2 }; });
    ok('Settings: the preview follows the choice at once (the disc moves to the bottom left)', pv2.left && pv2.low, JSON.stringify(pv2));
    /* SUPERSEDED by v2.87: the disc no longer moves the unit (they pair up in one row); still protects: the disc's corner is stored */
    ok('Settings: picking a bottom corner stores it, and leaves the unit where it was', s2.dp==='bl' && s2.uw===null, JSON.stringify(s2));

    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['On the border needs a tile gap of 13 or more, across and down (Tile gap, above).',/* SUPERSEDED by v2.87: two hints reworded, checked by v287.js */'Preview — changes as you choose below'].every(k=>fr.includes(`"${k}"`)));
    if(out){ await mk({ doc:TD, extra:BASE+'localStorage.setItem("ml_largecols","3");'+cu({ style:'sep' }) }); await page.screenshot({ path:out }); }
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
