/* v2.85 — Customise the look › Count and unit (the household approved the canvas board "Count and unit settings"):
   As now (the "5× 500g" line) · Disc + unit (a coloured count disc in a corner, the unit as a pill at the middle of an edge
   or in the note) · One pill ("5 × 500g" at a corner or an edge middle), each on the border or inside, each with its colour;
   and the note above or below the name.

   WHAT THESE CHECKS HAVE TO PROVE:
   - untouched: no data-cu-* on <html>, no disc or pill, the amount line as before;
   - Disc + unit (defaults): a disc only on items counted above 1, centred near the tile's top-right corner (on the border),
     without "×"; the unit pill centred on the bottom edge; no amount line in column tiles;
   - Inside + bottom-left: the disc lies wholly inside the tile, in its bottom-left quarter;
   - unit "In the note": the note reads "900g · Organic, white", and the stored note is unchanged;
   - One pill, top-right inside: "6 × 900g" and "3"; a count of 1 with no unit shows nothing;
   - on the border at 3 lines: nothing clips the disc (tile and every ancestor up to the list let it show);
   - note above: the note sits above the name;
   - one-line layouts keep the amount line (no disc);
   - the Settings controls set the keys and the attributes; dark mode: an Ink disc's text differs from its background;
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
    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const LAY = 'localStorage.setItem("ml_lk_edit_rows","v"); localStorage.setItem("ml_lk_edit_names","0"); localStorage.setItem("ml_lk_edit_chcols","v");';
    const D = ()=>DOC({ items:[it("1","chilli","vegetable",{ qty:2, note:"Large, Green" })] });
    const top = (sel)=>page.evaluate(s=>{ const e=document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }, sel);

    const TD = DOC({ items:[it("1","Milk","dairy",{qty:3}),it("2","Ginger","vegetable"),it("3","Wombok cabbage","vegetable",{qty:6,weight:"900g",note:"Organic, white"})] });
    const TX = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const cu = (o)=>Object.entries(o).map(([k,v])=>`localStorage.setItem("ml_cu_${k}","${v}");`).join("");
    const parts = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const r=p.getBoundingClientRect(), q=s=>{ const e=p.querySelector(s); if(!e||getComputedStyle(e).display==='none') return null; const b=e.getBoundingClientRect(); return { t:e.textContent.trim(), cx:b.left+b.width/2-r.left, cy:b.top+b.height/2-r.top, l:b.left-r.left, t0:b.top-r.top, rr:r.right-b.right, bb:r.bottom-b.bottom }; };
      return { id:p.dataset.pill, w:r.width, h:r.height, disc:q('.cudisc'), unit:q('.cupill-u'), tog:q('.cupill-t'), meta:q('.pill-meta'), note:q('.pnote'), name:q('.pname') }; }));
    const attrs = ()=>page.evaluate(()=>[...document.documentElement.attributes].map(a=>a.name).filter(n=>/^data-cu-/.test(n)));

    await mk({ doc:TD, extra:TX });
    let P = await parts();
    /* SUPERSEDED by v2.86: <html> now carries the EFFECTIVE places — at the default 8px gap "On the border" is inside, so
       data-cu-de / data-cu-ue appear on an untouched install; still protects: no style attribute, no disc or pill, the amount line */
    ok('untouched: no data-cu-style, no disc or pill, the amount line as before', !(await attrs()).includes('data-cu-style') && P.every(p=>!p.disc&&!p.unit&&!p.tog) && P.find(p=>p.id==='1').meta && /3×/.test(P.find(p=>p.id==='1').meta.t), JSON.stringify(P.map(p=>[p.id,p.meta&&p.meta.t])));

    await mk({ doc:TD, extra:TX+cu({ style:'sep' }) });
    P = await parts(); const milk=P.find(p=>p.id==='1'), gin=P.find(p=>p.id==='2'), wom=P.find(p=>p.id==='3');
    /* SUPERSEDED by v2.86: at the default 8px gap the border places go inside (rule 5, 13px needed), at the margin M=8 from
       the inner edge; still protects: a disc on counted items only, top-right, no "×"; the unit pill centred at the bottom */
    ok('Disc + unit: a disc on counted items only, inside the top-right corner, without "×"', milk.disc && milk.disc.t==='3' && wom.disc.t==='6' && !gin.disc && milk.disc.rr>=8 && milk.disc.rr<=12 && milk.disc.t0>=8 && milk.disc.t0<=12, JSON.stringify({ milk, gin:gin.disc }));
    ok('…the unit pill is centred inside the bottom edge; no amount line in column tiles', wom.unit && wom.unit.t==='900g' && Math.abs(wom.unit.cx-wom.w/2)<3 && wom.unit.bb>=8 && wom.unit.bb<=13 && !wom.meta && !milk.meta, JSON.stringify(wom));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sep.png') });

    await mk({ doc:TD, extra:TX+cu({ style:'sep', dp:'bl', de:'inside' }) });
    P = await parts(); const m2=P.find(p=>p.id==='1');
    ok('Inside + bottom-left: the disc lies wholly inside, in the bottom-left quarter', m2.disc.l>=0 && m2.disc.bb>=0 && m2.disc.cx<m2.w/2 && m2.disc.cy>m2.h/2, JSON.stringify(m2.disc));

    await mk({ doc:TD, extra:TX+cu({ style:'sep', uw:'note' }) });
    P = await parts(); const w3=P.find(p=>p.id==='3');
    const stored = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.find(i=>i.id==='3').note);
    ok('unit in the note: "900g · Organic, white", and the stored note is unchanged', w3.note && w3.note.t==='900g · Organic, white' && !w3.unit && stored==='Organic, white', JSON.stringify({ note:w3.note, stored }));

    await mk({ doc:TD, extra:TX+cu({ style:'tog' }) });
    P = await parts();
    ok('One pill (top-right, inside): "6 × 900g" and "3"; nothing for a count of 1 with no unit', P.find(p=>p.id==='3').tog.t==='6 × 900g' && P.find(p=>p.id==='1').tog.t==='3' && !P.find(p=>p.id==='2').tog && P.find(p=>p.id==='3').tog.rr>=0, JSON.stringify(P.map(p=>[p.id,p.tog])));

    await mk({ doc:TD, extra:TX+cu({ style:'sep' })+'localStorage.setItem("ml_tilelines","3");' });
    const clip = await page.evaluate(()=>{ const d=document.querySelector('#zoomer .pill[data-pill="1"] .cudisc'), r=d.getBoundingClientRect(); const bad=[]; let e=d.parentElement;
      while(e && e!==document.body){ const cs=getComputedStyle(e); if(cs.overflow!=='visible' || cs.overflowX!=='visible' || cs.overflowY!=='visible'){ const b=e.getBoundingClientRect(); if(r.top<b.top-0.5||r.right>b.right+0.5||r.left<b.left-0.5||r.bottom>b.bottom+0.5) bad.push((e.id||e.className)+' '+cs.overflow); } e=e.parentElement; } return bad; });
    ok('on the border at 3 lines: nothing clips the disc', clip.length===0, JSON.stringify(clip));

    await mk({ doc:TD, extra:TX+cu({ np:'above' }) });
    P = await parts(); const w4=P.find(p=>p.id==='3');
    ok('note above: the note sits above the name', w4.note && w4.note.t0 < w4.name.t0, JSON.stringify({ note:w4.note, name:w4.name }));

    await mk({ doc:TD, extra:'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","1");'+cu({ style:'sep' }) });
    P = await parts(); const l1=P.find(p=>p.id==='1');
    const alt = await page.evaluate(()=>{ const a=document.querySelector('#zoomer .pill[data-pill="1"] .cu-alt, #zoomer .pill[data-pill="1"] .pill-meta'); return a && getComputedStyle(a).display!=='none' ? a.textContent.trim() : null; });
    /* SUPERSEDED by v2.89: the one-line layouts follow the chosen style (the household: "the single line doesn't follow the
       pill selection") — with Disc + unit the row shows the disc, not the text; still protects: the count "3" shows in the row */
    ok('one-line layout: the count shows, as the chosen disc', l1.disc && l1.disc.t==='3' && !alt, JSON.stringify({ disc:l1.disc, alt }));

    await mk({ doc:TD, extra:TX });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optLook').click(); await page.waitForTimeout(600);
    await page.locator('[data-cu="style|tog"]').first().click(); await page.waitForTimeout(400);
    await page.locator('[data-cu="tc|ink"]').first().click(); await page.waitForTimeout(400);
    const st = await page.evaluate(()=>({ style:localStorage.getItem('ml_cu_style'), tc:localStorage.getItem('ml_cu_tc'), a:document.documentElement.getAttribute('data-cu-style'), b:document.documentElement.getAttribute('data-cu-tc') }));
    ok('Settings: "One pill" and Ink set the keys and the attributes', st.style==='tog' && st.tc==='ink' && st.a==='tog' && st.b==='ink', JSON.stringify(st));

    await mk({ doc:TD, extra:TX+cu({ style:'sep', dc:'ink' })+'localStorage.setItem("ml_theme","dark");' });
    const dk = await page.evaluate(()=>{ const d=document.querySelector('#zoomer .cudisc'), cs=getComputedStyle(d); return { fg:cs.color, bg:cs.backgroundColor }; });
    ok('dark mode: an Ink disc\'s text differs from its background', dk.fg!==dk.bg, JSON.stringify(dk));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Count and unit','As now','Disc + unit','One pill','Above the name','On the border','In the note'].every(k=>fr.includes(`"${k}"`)));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
