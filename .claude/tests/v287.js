/* v2.87 — Count and unit, round 2 (the household's screenshots of v2.86):
   - a one pill in a corner showed "0 × 0.5k" (v2.86 capped every corner badge at half the row and the pill centres its text)
     → a corner one pill owns its whole row, the marks move to the other row;
   - "As now" became "Text below the note", in the note's colour and weight; a new style "In the note" ("5 × 1kg · Pink Lady");
   - the disc and the unit may share a row: the unit sits beside the disc in the disc's corner (centred, they collide);
   - background, text and border colours for the disc, the unit pill and the one pill;
   - (v2.87b) the weight (Regular / Bold) and size (S–XL) of the name, the note and the amount, each its own control;
   - Icon size "Fill" (the new default): the drawing is 40% of the tile's inner width, the same on every tile.

   WHAT THESE CHECKS HAVE TO PROVE:
   - in every style × height × 3 and 4 across, every tile that has a count above 1 or a unit SHOWS it, whole (no badge or
     line narrower than its text), and still nothing overlaps or comes nearer the edge than the margin (the v2.86 rules, pair
     included);
   - "10 × 0.5kg" in each of the four corners reads in full; the urgent mark is then in the other row;
   - the pair: the unit left of a top-right disc, same row, apart;
   - text below the note: the amount below the note, same colour and weight as the note; in the note: "6 × 900g · Organic, white";
   - the colours set what they say; Fill is the default and makes the drawing bigger than S, within 60% of the tile;
   - Settings: four styles with their new names, no disabled unit place; the new words have their French.

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
    /* the v2.86 measure, with the pair as one part, plus: what each tile shows of its amount, and whether any of it is cut */
    const measure = ()=>page.evaluate(()=>{
      const R=e=>e.getBoundingClientRect(), vis=e=>e && getComputedStyle(e).display!=='none' && getComputedStyle(e).visibility!=='hidden' && R(e).width>0;
      const out={ tiles:[], bad:[], cut:[] };
      document.querySelectorAll('#zoomer .pills > .pill[data-pill]').forEach(p=>{
        if(!vis(p)) return;
        const r=R(p), cs=getComputedStyle(p), inner={ l:r.left+parseFloat(cs.borderLeftWidth), t:r.top+parseFloat(cs.borderTopWidth), r:r.right-parseFloat(cs.borderRightWidth), b:r.bottom-parseFloat(cs.borderBottomWidth) };
        const M=parseFloat(cs.getPropertyValue('--tm'))||0, id=p.dataset.pill, parts=[];
        p.querySelectorAll(':scope > .pemoji, :scope > .pname, :scope > .pnote, :scope > .pill-meta, :scope > .cudisc, :scope > .cupill, :scope > .cupair, :scope > .pmarks, :scope > .paisle').forEach(e=>{
          if(!vis(e)) return; let b=R(e);
          if(e.matches('.pname,.pnote,.pill-meta')){ const rg=document.createRange(); rg.selectNodeContents(e); const eb=R(e);
            const sh=[...rg.getClientRects()].filter(x=>x.width>0).map(x=>({ left:Math.max(x.left,eb.left), top:Math.max(x.top,eb.top), right:Math.min(x.right,eb.right), bottom:Math.min(x.bottom,eb.bottom) })).filter(x=>x.right>x.left && x.bottom>x.top);
            if(sh.length) b={ left:Math.min(...sh.map(x=>x.left)), top:Math.min(...sh.map(x=>x.top)), right:Math.max(...sh.map(x=>x.right)), bottom:Math.max(...sh.map(x=>x.bottom)) }; }
          parts.push({ k:e.className.split(' ')[0], bd:e.classList.contains('cu-bd')||e.classList.contains('paisle'), b:{ l:b.left, t:b.top, r:b.right, b:b.bottom } }); });
        for(let i=0;i<parts.length;i++) for(let j=i+1;j<parts.length;j++){ const a=parts[i].b, c=parts[j].b;
          const w=Math.min(a.r,c.r)-Math.max(a.l,c.l), h=Math.min(a.b,c.b)-Math.max(a.t,c.t);
          if(w>0.5 && h>0.5) out.bad.push(`${id}: ${parts[i].k}×${parts[j].k} ${w.toFixed(1)}×${h.toFixed(1)}`); }
        parts.filter(x=>!x.bd).forEach(x=>{ const g=Math.min(x.b.l-inner.l, x.b.t-inner.t, inner.r-x.b.r, inner.b-x.b.b);
          if(g < M-0.6) out.bad.push(`${id}: ${x.k} ${g.toFixed(1)}px from the edge (M ${M})`); });
        /* the amount as shown: badges, the amount line, the unit in the note — and none of it cut */
        const am=[...p.querySelectorAll('.cudisc, .cupill, :scope > .pill-meta, .cu-nu')].filter(vis);
        am.forEach(e=>{ if(e.scrollWidth > e.clientWidth+1) out.cut.push(`${id}: "${e.textContent.trim()}" ${e.clientWidth}/${e.scrollWidth}`); });
        out.tiles.push({ id, shown:am.map(e=>e.textContent.trim()).join(' | '), w:r.width }); });
      return out; });
    const TD = DOC({ items:[
      it("1","Milk","dairy",{ qty:3, tags:["urgent"], starred:true }),
      it("2","Ginger","vegetable",{ tags:["discount"] }),
      it("3","Wombok cabbage","vegetable",{ qty:6, weight:"900g", note:"Organic, white" }),
      it("4","Coriander","vegetable",{ qty:2, weight:"1 bunch", tags:["urgent","discount"], starred:true, note:"Fresh" }),
      it("5","Eggs","dairy",{ qty:6, weight:"12 pack" }),
      it("6","Chicken thigh","meat",{ qty:10, weight:"0.5kg", note:"thigh" }),
      it("7","Beef mince","meat",{ weight:"500g" }) ] });
    const WANT = { "1":["3"], "2":[], "3":["6","900g"], "4":["2","1 bunch"], "5":["6","12 pack"], "6":["10","0.5kg"], "7":["500g"] };
    const BASE = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");';
    await mk({ doc:TD, extra:BASE });
    const set = async(o)=>{ await page.evaluate(o=>{ Object.keys(localStorage).filter(k=>/^ml_cu_|^ml_tilelines$|^ml_largecols$|^ml_gapx$|^ml_gapy$|^ml_icosize$/.test(k)).forEach(k=>localStorage.removeItem(k));
        Object.entries(o).forEach(([k,v])=>localStorage.setItem(k,v)); }, o);
      await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForFunction(()=>document.querySelectorAll('#zoomer .pill[data-pill]').length>=7); await page.waitForTimeout(350); };
    const cfgO = (c)=>Object.fromEntries(Object.entries(c).map(([k,v])=>['ml_cu_'+k, v]));

    /* every style × height × 3 and 4 across: the amount shows, whole; the v2.86 rules hold */
    const CFG = [ {}, { style:'note' }, { style:'sep' }, { style:'sep', uw:'top' }, { style:'sep', dp:'bl' }, { style:'sep', dp:'tl', uw:'top' }, { style:'sep', uw:'note' },
      { style:'tog' }, { style:'tog', tp:'tl' }, { style:'tog', tp:'bl' }, { style:'tog', tp:'br' }, { style:'tog', tp:'top' }, { style:'tog', tp:'bottom' },
      /* v2.87b: the biggest text everywhere, with the weights swapped */
      { ns:'xl', ts:'xl', ps:'xl', nw:'regular', tw:'bold', aw:'regular' }, { style:'sep', uw:'top', ns:'xl', ts:'xl', ps:'xl' }, { style:'tog', tp:'tl', ns:'xl', ts:'xl', ps:'xl', tw:'bold' }, { style:'note', ns:'s', ts:'xl' } ];
    const fails=[], cuts=[], miss=[]; let runs=0;
    for(const cols of ['3','4']) for(const ht of ['', '1', '2', '3', 'sq']) for(const c of CFG){
      if(cols==='4' && !(ht==='' || ht==='3')) continue;
      const o=Object.assign({ ml_largecols:cols }, cfgO(c)); if(ht) o.ml_tilelines=ht;
      await set(o); const m=await measure(); runs++; const tag=`${cols}/${ht||'var'}/${JSON.stringify(c)}`;
      if(m.bad.length) fails.push(`${tag}: ${m.bad.slice(0,2).join('; ')}`);
      if(m.cut.length) cuts.push(`${tag}: ${m.cut.slice(0,2).join('; ')}`);
      m.tiles.forEach(t=>{ const w=WANT[t.id]||[]; if(!w.every(s=>t.shown.includes(s))) miss.push(`${tag}: tile ${t.id} shows "${t.shown}", wants ${w.join(' + ')}`); });
    }
    ok(`${runs} combinations: every tile with a count or a unit shows it`, miss.length===0, miss.slice(0,5).join(' | '));
    ok('…and none of it is cut (no badge or amount line narrower than its text) at 3 and 4 across', cuts.length===0, cuts.slice(0,5).join(' | '));
    ok('…and the v2.86 rules hold: no overlap, nothing nearer the edge than the margin', fails.length===0, fails.slice(0,5).join(' | '));

    /* the household's tile: "10 × 0.5kg" in each corner reads in full; the marks go to the other row */
    const corners={};
    for(const tp of ['tl','tr','bl','br']){ await set(Object.assign({ ml_largecols:'3' }, cfgO({ style:'tog', tp })));
      corners[tp] = await page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="6"] .cupill-t'), q=document.querySelector('#zoomer .pill[data-pill="4"]'), pr=q.getBoundingClientRect(),
        a=q.querySelector('.cupill-t').getBoundingClientRect(), mk=q.querySelector('.pmarks').getBoundingClientRect();
        return { t:p.textContent, whole:p.scrollWidth<=p.clientWidth+1, otherRow:((a.top-pr.top) < pr.height/2) !== ((mk.top-pr.top) < pr.height/2) }; }); }
    ok('"10 × 0.5kg" reads in full in all four corners; the urgent mark is in the other row', Object.values(corners).every(c=>c.t==='10 × 0.5kg' && c.whole && c.otherRow), JSON.stringify(corners));

    /* the pair */
    await set(Object.assign({ ml_largecols:'3' }, cfgO({ style:'sep', uw:'top' })));
    const pr = await page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="3"]'), d=p.querySelector('.cupair .cudisc').getBoundingClientRect(), u=p.querySelector('.cupair .cupill-u').getBoundingClientRect();
      return { sameRow:Math.abs((d.top+d.bottom)/2-(u.top+u.bottom)/2)<2, unitLeft:u.right<=d.left-2, topRow:d.top-p.getBoundingClientRect().top < 30 }; });
    ok('disc and unit in one row: the unit sits beside the top-right disc, apart', pr.sameRow && pr.unitLeft && pr.topRow, JSON.stringify(pr));

    /* text below the note / in the note */
    await set({ ml_largecols:'3' });
    const tb = await page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="3"]'), n=p.querySelector('.pnote'), m=p.querySelector('.pill-meta'), q=m.querySelector('.qty'), cn=getComputedStyle(n), cq=getComputedStyle(q), cm=getComputedStyle(m);
      return { below:m.getBoundingClientRect().top>=n.getBoundingClientRect().bottom-1, col:cq.color===cn.color, w:cq.fontWeight===cn.fontWeight, op:cm.opacity===cn.opacity, c:[cq.color,cn.color,cq.fontWeight,cn.fontWeight,cm.opacity,cn.opacity] }; });
    ok('Text below the note: the amount under the note, in the note\'s colour, weight and strength', tb.below && tb.col && tb.w && tb.op, JSON.stringify(tb));
    await set(Object.assign({ ml_largecols:'3' }, cfgO({ style:'note' })));
    const nt = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill="3"] .pnote, #zoomer .pill[data-pill="1"] .pnote')].map(e=>e.textContent.trim()));
    ok('In the note: "6 × 900g · Organic, white", and "3×" alone', nt.includes('6 × 900g · Organic, white') && nt.includes('3×'), JSON.stringify(nt));

    /* colours */
    await set(Object.assign({ ml_largecols:'3' }, cfgO({ style:'sep', dc:'ink', dx:'white', dk:'accent', uc:'light', ux:'accent', uk:'ink' })));
    const co = await page.evaluate(()=>{ const d=getComputedStyle(document.querySelector('#zoomer .cudisc')), u=getComputedStyle(document.querySelector('#zoomer .cupill-u')), acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      return { dfg:d.color, dsh:d.boxShadow, ufg:u.color, ush:u.boxShadow, acc }; });
    ok('colours: the disc\'s text white and border accent; the unit\'s text accent and border ink', co.dfg==='rgb(255, 255, 255)' && /inset/.test(co.dsh) && co.ufg!==co.dfg && /inset/.test(co.ush), JSON.stringify(co));

    /* Fill */
    await set({ ml_largecols:'3', ml_tilelines:'sq' });
    const fi = await page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="7"]'), i=p.querySelector('.pemoji .ill, .pemoji .cmark'), r=i.getBoundingClientRect();
      return { def:document.documentElement.getAttribute('data-icosize'), h:Math.round(r.height), max:Math.round(p.getBoundingClientRect().width*0.6) }; });
    ok('Icon size Fill is the default: the drawing is bigger than S (24px), about a third of the tile', fi.def==='fill' && fi.h>30 && fi.h<=fi.max+1, JSON.stringify(fi));
    const fs2 = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill] .pemoji :is(.ill,.cmark)')].map(e=>Math.round(e.getBoundingClientRect().height)));
    ok('…the same size on every tile', fs2.length>=6 && fs2.every(h=>h===fs2[0]), JSON.stringify(fs2));
    const m0 = await measure();
    ok('…and still nothing overlaps', m0.bad.length===0, m0.bad.slice(0,3).join('; '));

    /* v2.87b: weight and size of the name, the note and the amount */
    const look = async(o)=>{ await set(Object.assign({ ml_largecols:'3' }, cfgO(o)));
      return page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="3"]'), g=s=>{ const e=p.querySelector(s); if(!e) return null; const c=getComputedStyle(e); return [parseFloat(c.fontSize), +c.fontWeight]; };
        return { name:g('.pname'), note:g('.pnote'), meta:g('.pill-meta .qty'), pill:g('.cupill'), disc:g('.cudisc') }; }); };
    const L0=await look({ style:'sep' }), L1=await look({ style:'sep', nw:'regular', aw:'regular', tw:'bold', ns:'xl', ts:'xl', ps:'xl' }), L2=await look({ tw:'bold', ts:'l' }), L3=await look({});
    ok('weights: name Regular, note Bold, pills and disc Regular — each set by its own control', L1.name[1]<L0.name[1] && L1.note[1]>L0.note[1] && L1.pill[1]<L0.pill[1] && L1.disc[1]<L0.disc[1], JSON.stringify({ L0, L1 }));
    ok('sizes: XL makes the name, the note and the pills bigger (×1.3)', Math.abs(L1.name[0]/L0.name[0]-1.3)<0.03 && L1.note[0]>L0.note[0] && Math.abs(L1.pill[0]/L0.pill[0]-1.3)<0.03, JSON.stringify({ L0:[L0.name,L0.note,L0.pill], L1:[L1.name,L1.note,L1.pill] }));
    ok('the amount written as text follows the note\'s weight and size', L2.meta && L2.meta[1]===L2.note[1] && L2.meta[0]===L2.note[0] && L2.note[1]>L3.note[1] && L2.note[0]>L3.note[0], JSON.stringify({ L2, L3 }));

    /* Settings */
    await set({ ml_largecols:'3', ml_cu_style:'sep', ml_cu_uw:'top' });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optLook').click(); await page.waitForTimeout(600);
    const s1 = await page.evaluate(()=>{ const b=v=>document.querySelector(`[data-cu="${v}"]`);
      return { styles:[...document.querySelectorAll('[data-cu^="style|"]')].map(x=>x.textContent.trim()), uwDis:['note','top','bottom'].filter(v=>b('uw|'+v) && b('uw|'+v).disabled),
        rows:['dx|white','dk|none','ux|auto','uk|ink'].every(v=>!!b(v)) }; });
    ok('Settings: four styles, renamed; no unit place disabled; Text and Border rows for the disc and the unit', JSON.stringify(s1.styles)===JSON.stringify(['Text below the note','In the note','Disc + unit','One pill']) && s1.uwDis.length===0 && s1.rows, JSON.stringify(s1));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Regular','Bold','Amount: the pills and the disc; L and XL from 3 tiles across or fewer. Written as text, the amount follows the note.','Text below the note','In the count disc\'s row, the unit sits beside the disc.','At 1 or 2 lines tall, the amount shows as one pill.','Fill','White'].every(k=>fr.includes(`"${k}"`)));
    if(out){ await mk({ doc:TD, extra:BASE+'localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_cu_style","tog");' }); await page.screenshot({ path:out }); }
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
