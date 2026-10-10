/* v2.10 — tiles one size, size word last, the cart under the header (folded, and finishing itself at a
   different store), share the list from Shop, Settings that always scroll to the bottom, Settings › Other.

   WHY THIS EXISTS: a household batch of nine. Six are built here (1, 2, 3, 5, 8, 9); 4, 6 and 7 are logged
   on the plan page as future improvements.

   WHAT THESE CHECKS HAVE TO PROVE:
   - "small can corn kernel" reads "Can corn kernel small" on its tile, while the stored name is unchanged;
   - in each layout every tile on the list is the same height (measured, three layouts), and in fixed-column
     small tiles every icon stays on the left of its name;
   - the cart sits between the header and the first category, starts folded even when it was left open,
     unfolds on a tap, and does not clip the bottom of the page;
   - arriving at a DIFFERENT saved store finishes the cart (ticked items saved to Regulars, with Undo), and
     arriving at the SAME store does nothing;
   - the share button hands another app the list still to buy, not the cart;
   - Settings: content that grows after layout is never clipped (the stale-height bug), and Share link,
     Export and AI diagnostics sit under "Other".

   TEST-BUG NOTES CARRIED FORWARD: v1.60 drive the real control; v1.91 assert WHICH value; v2.00 the seed
   returns early once seeded; v2.07 the app reopens on the last page. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const DAND = { latitude:-37.9881, longitude:145.2140 }, RICH = { latitude:-37.8158, longitude:144.9996 };
const seed = (extra, checkedStore) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[],checkedAt:ck?Date.now()-60000:0,checkedStore:ck?"${checkedStore||''}":""});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[it("1","small can corn kernel","bulk",4),it("2","Eggs","fresh"),it("3","Chicken thigh","meat",1,"1 kg"),
      it("4","Kangkung","vegetable"),it("5","Sparkling water","bulk",6),it("6","Toilet paper","bulk"),it("7","Milk","fresh",1,"",true),it("8","Bread","fresh",1,"",true)],
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]");
  /* a fresh profile runs the one-time v1.63 slot migration, which reloads the page; a location fix that lands
     before that reload finishes the cart and the reload then discards its Undo toast. A real phone migrated
     long ago, so the seed says so too. (This was the v2.10 "flaky toast".) */
  localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,checked:true}));   // left OPEN last time
  ${extra||''}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(extra, opts)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext(Object.assign({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true }, opts||{}));
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(`window.__toasts=[]; new MutationObserver(()=>{ const t=document.getElementById("toast"); if(t){ const x=t.textContent.replace(/\\s+/g," ").trim(); if(window.__toasts[window.__toasts.length-1]!==x) window.__toasts.push(x); } }).observe(document,{subtree:true,childList:true,characterData:true}); window.__shared=null; navigator.share = async (d)=>{ window.__shared=d; };`);
    await page.addInitScript(seed(extra && extra.ls, extra && extra.checkedStore));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(550); };
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  const heights = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>Math.round(p.getBoundingClientRect().height)));

  try{
    /* ── A. size word last ─────────────────────────────────────────────── */
    await mk();
    const corn = await page.evaluate(()=>{ const p=[...document.querySelectorAll('#zoomer .pill')].find(x=>/corn/i.test(x.textContent)); return p ? p.querySelector('.pname').textContent.trim() : null; });
    ok('"small can corn kernel" reads "Can corn kernel small" on its tile', corn==='Can corn kernel small', corn);
    ok('…while the stored name is unchanged', (await cache()).items.some(i=>i.name==='small can corn kernel'), '');

    /* ── B. one height per layout ──────────────────────────────────────── */
    let h = await heights();
    ok('small tiles (the default): every tile the same height', h.length===6 && new Set(h).size===1, JSON.stringify(h));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-default.png') });
    await mk({ ls:'localStorage.setItem("ml_smallcols","3");' });
    h = await heights();
    ok('small tiles in 3 columns: every tile the same height', new Set(h).size===1, JSON.stringify(h));
    const iconsLeft = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].every(p=>{ const e=p.querySelector('.pemoji'), n=p.querySelector('.pname');
      if(!e||!n) return true; return e.getBoundingClientRect().right <= n.getBoundingClientRect().left + 1; }));
    ok('…and every icon stays to the LEFT of its name (none flips on top)', iconsLeft, '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-small3.png') });
    await mk({ ls:'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","3");' });
    h = await heights();
    ok('large tiles in 3 columns: every tile the same height', new Set(h).size===1, JSON.stringify(h));
    /* the household's Sandbox: large tiles, 4 columns, Full colour, no category groups. A bare 1fr column
       cannot shrink below its longest word, so "Coriander/cilantro leaf" widened its whole column. */
    await mk({ ls:'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","4"); localStorage.setItem("ml_fill","full"); localStorage.setItem("ml_caton","0");'
      + 'const c=JSON.parse(localStorage.getItem("ml_cache_v101")); c.items.push({id:"20",name:"Coriander/cilantro leaf",cat:"fresh",qty:1,weight:"1 cup",checked:false,tags:[]},{id:"21",name:"Flat-leaf italian parsley",cat:"fresh",qty:1,weight:"",checked:false,tags:[]}); localStorage.setItem("ml_cache_v101", JSON.stringify(c));' });
    const wh = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const r=p.getBoundingClientRect(), n=p.querySelector('.pname').getBoundingClientRect();
      return { w:Math.round(r.width), h:Math.round(r.height), inside: n.left>=r.left-1 && n.right<=r.right+1 }; }));
    ok('large tiles in 4 columns (the Sandbox): every tile the same width AND height', new Set(wh.map(x=>x.w+'x'+x.h)).size===1, JSON.stringify([...new Set(wh.map(x=>x.w+'x'+x.h))]));
    ok('…and a long name stays inside its tile', wh.every(x=>x.inside), JSON.stringify(wh.filter(x=>!x.inside)));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-large4.png') });

    /* ── C. the cart under the header ──────────────────────────────────── */
    await mk();
    const pos = await page.evaluate(()=>{ const cb=document.querySelector('#checkedbar'), tf=document.querySelector('#topfix'), h1=document.querySelector('#zoomer .chead, #zoomer section');
      return cb ? { cbTop:Math.round(cb.getBoundingClientRect().top), cbBottom:Math.round(cb.getBoundingClientRect().bottom), tfBottom:Math.round(tf.getBoundingClientRect().bottom), firstTop:h1?Math.round(h1.getBoundingClientRect().top):null,
        open:!!document.querySelector('.checkedscroll') } : null; });
    ok('the cart sits under the header and above the first category', pos && pos.cbTop>=pos.tfBottom-1 && pos.firstTop!==null && pos.cbBottom<=pos.firstTop+1, JSON.stringify(pos));
    ok('…folded on load, even though it was left open last time', pos && pos.open===false, JSON.stringify(pos));
    await tap('#checkedHead');
    ok('a tap unfolds it', await page.evaluate(()=>document.querySelectorAll('.checkedscroll .pill').length)===2, '');
    const clip = await page.evaluate(()=>{ const z=document.getElementById('zoomer'), zw=z.parentElement; return { wrap:Math.round(zw.getBoundingClientRect().bottom), zoomer:Math.round(z.getBoundingClientRect().bottom) }; });
    ok('…and the page below it is not clipped (the wrap reaches the list\'s bottom edge)', clip.wrap>=clip.zoomer-1, JSON.stringify(clip));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-cart.png') });

    /* ── D. the cart finishes itself at a different store ─────────────── */
    const locOpts = (where)=>({ geolocation:where, permissions:['geolocation'] });
    await mk({ checkedStore:'rich', ls:'localStorage.setItem("ml_store","auto"); localStorage.setItem("ml_useloc","1");' }, locOpts(DAND));
    /* the toast lives five seconds: wait for it rather than for a fixed time */
    await page.waitForFunction(()=>(window.__toasts||[]).some(t=>/Finished/.test(t)), null, { timeout:8000 }).catch(()=>{});
    let c = await cache();
    /* every toast is recorded as it appears (an observer set up before the app boots), so the check
       cannot miss a five-second toast on a slow run */
    const toast = (await page.evaluate(()=>window.__toasts||[])).join(' | ');
    ok('at a DIFFERENT saved store, the cart finishes itself', !c.items.some(i=>i.checked) && c.items.length===6, JSON.stringify(c.items.map(i=>i.name+(i.checked?'✓':''))));
    ok('…saving the ticked items to Regulars, as Finish does', ['Milk','Bread'].every(n=>(c.buyAgain||[]).some(b=>b.name===n)), JSON.stringify((c.buyAgain||[]).map(b=>b.name)));
    ok('…and says so, with Undo', /Finished your Coles Vic Garden shop/.test(toast) && /Undo/.test(toast), toast);
    await mk({ checkedStore:'dand', ls:'localStorage.setItem("ml_store","auto"); localStorage.setItem("ml_useloc","1");' }, locOpts(DAND));
    await page.waitForTimeout(1200);
    c = await cache();
    ok('at the SAME store, nothing happens', c.items.filter(i=>i.checked).length===2, JSON.stringify(c.items.filter(i=>i.checked).map(i=>i.name)));
    await mk({ checkedStore:'', ls:'localStorage.setItem("ml_store","auto"); localStorage.setItem("ml_useloc","1");' }, locOpts(DAND));
    await page.waitForTimeout(1200);
    c = await cache();
    ok('a cart ticked with no store known is never finished for you', c.items.filter(i=>i.checked).length===2, '');

    /* ── E. share the list ─────────────────────────────────────────────── */
    await tap('#shopShare');
    const sh = await page.evaluate(()=>window.__shared);
    ok('the Shop page shares the list with another app', sh && /^Sandbox — 6 to buy/.test(sh.text||''), JSON.stringify(sh && sh.text && sh.text.slice(0,60)));
    ok('…what is still to buy, grouped, with amounts — not the cart', sh && /• 4× Small can corn kernel/.test(sh.text) && /• 1 kg Chicken thigh/.test(sh.text) && !/Milk|Bread/.test(sh.text), JSON.stringify(sh && sh.text));

    /* ── F. Settings ───────────────────────────────────────────────────── */
    await tap('#setNav, #setNavP, #setNavS');
    const grown = await page.evaluate(async ()=>{ const z=document.getElementById('zoomer'), zw=z.parentElement;
      const before=zw.getBoundingClientRect().height; const d=document.createElement('div'); d.style.height='900px'; z.appendChild(d);
      await new Promise(r=>setTimeout(r,250)); return { before:Math.round(before), after:Math.round(zw.getBoundingClientRect().height), zoomerBottom:Math.round(z.getBoundingClientRect().bottom), wrapBottom:Math.round(zw.getBoundingClientRect().bottom) }; });
    ok('content that grows after layout is never clipped (Settings could not scroll to the bottom)', grown.after>=grown.before+850 && grown.wrapBottom>=grown.zoomerBottom-1, JSON.stringify(grown));
    const other = await page.evaluate(()=>{ const h=[...document.querySelectorAll('.optsect')].find(x=>/Other/.test(x.textContent)); if(!h) return null;
      const body=h.nextElementSibling; return body ? ['#optShare','#optExport','#optDiag'].map(s=>!!body.querySelector(s)) : null; });
    ok('Settings › Other holds Share link, Export and AI diagnostics', JSON.stringify(other)==='[true,true,true]', JSON.stringify(other));
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
