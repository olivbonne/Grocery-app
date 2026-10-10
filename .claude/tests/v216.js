/* v2.16 — the polish batch from the app review of 11 October (the household: "Do all of the fixes as said in the
   order suggested"): R6 readable greys, R7 faster taps, R8 a labelled add bar, R11 keep the screen on while
   shopping, R13 structure for VoiceOver, R14 Plan says what it is for, R15 the learned shop order is shared.

   WHAT THESE CHECKS HAVE TO PROVE: contrast measured on the rendered text against its real background (counts,
   coloured amounts, Plan dates, Settings section names; the other themes' grey tokens); that a tap no longer
   reads every tile's height (offsetHeight is counted during a redraw) while rows stay even, and tiles in every
   category (and in the cart) still share one height; the bar's words,
   and their absence when the bar is narrow; the wake lock requested and released with the cart, and never
   when switched off; one main landmark and the right headings per page; the empty-week hint and where its
   button goes; another phone's learned order adopted on load, and this phone's written back on finishing.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.07 the app reopens on the
   last page; v2.10 a fresh profile runs the v1.63 slot migration and reloads — seed ml_appmig163. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (items, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(items)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  ${extra||''}
})()`;
const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[]});
const GRID4 = 'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","4"); localStorage.setItem("ml_fill","full"); localStorage.setItem("ml_caton","0");';


const SMALL0 = n => `localStorage.setItem("ml_displays", JSON.stringify({shop:"small"})); localStorage.setItem("ml_smallcols","${n}"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_store","home");`;
const LIST = [["Frozen raspberries","frozen",2],["Ginger beer no sugar","drinks"],["Beef cubes","meat",1,"800g"],["Beef topside steak","meat",3,"200g"],
  ["Lamb rump or flank","meat"],["Chicken breast","meat",3,"200g"],["Chicken drumsticks","meat",4,"1kg"],["Chicken thigh","meat",8,"500g"],["Avocados","vegetable"]];

const SMALL = n => SMALL0(n);



const L16 = [["Frozen raspberries","frozen",2],["Bananas","fruit",6],["Dates","fruit",1,"500g"],["Chicken thigh","meat",8,"500g"],["Beef steak","meat",6],
  ["Milk","fresh",2],["Eggs","fresh",12],["Rice","bulk",1,"5kg"],["Shampoo","health"],["Kecap manis","asian"]].map((x,i)=>it(String(i),x[0],x[1],x[2],x[3]));
const wakeInit = `(()=>{ window.__wl={req:0,rel:0}; Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{ request:async(t)=>{ window.__wl.req++;
  const l=new EventTarget(); l.release=async()=>{ window.__wl.rel++; l.dispatchEvent(new Event('release')); }; return l; } }}); })()`;
function lum(rgb){ const m=rgb.match(/\d+(\.\d+)?/g).map(Number).slice(0,3).map(v=>v/255).map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)); return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2]; }
function cr(a,b){ const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(items, extra, init)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    if(init) await page.addInitScript(init);
    await page.addInitScript(seed(items, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  /* the effective background of an element: the first ancestor with a non-transparent background */
  const contrastOf = (sel)=>page.evaluate((sel)=>[...document.querySelectorAll(sel)].filter(e=>e.offsetParent!==null && e.textContent.trim()).slice(0,12).map(e=>{
    let b=e, bg='rgba(0, 0, 0, 0)'; while(b && (bg==='rgba(0, 0, 0, 0)' || bg==='transparent')){ bg=getComputedStyle(b).backgroundColor; b=b.parentElement; }
    if(bg==='rgba(0, 0, 0, 0)') bg=getComputedStyle(document.body).backgroundColor;
    return { t:e.textContent.trim().slice(0,14), fg:getComputedStyle(e).color, bg }; }), sel);

  try{
    /* ── R6. readable greys, and readable coloured amounts ─────────────── */
    await mk(L16, 'localStorage.setItem("ml_displays", JSON.stringify({shop:"small"})); localStorage.setItem("ml_smallcols","0");');
    const counts = await contrastOf('.cnum, .chead .count, .cat .cnum');
    const amts = await contrastOf('#zoomer .pill .qty');
    const worst = a=>a.length ? Math.min(...a.map(x=>cr(x.fg,x.bg))) : 0;
    ok('category counts read at 4.5:1 or better (were 2.4:1)', counts.length>0 && worst(counts)>=4.5, JSON.stringify({n:counts.length, worst:worst(counts).toFixed(2)}));
    ok('amounts printed in a category\'s colour read at 4.5:1 or better on their tile (yellow fruit was 2.9:1)', amts.length>=5 && worst(amts)>=4.5, JSON.stringify({n:amts.length, worst:worst(amts).toFixed(2), sample:amts.slice(0,3)}));
    const icoTrue = await page.evaluate(()=>{ const p=[...document.querySelectorAll('#zoomer .pill')].find(x=>/Bananas/.test(x.textContent)); if(!p) return null;
      const ic=p.querySelector('.pemoji'), q=p.querySelector('.qty'); return { ic:ic&&getComputedStyle(ic).color, q:q&&getComputedStyle(q).color }; });
    ok('…while the icon keeps the category\'s true colour (only the text moves)', icoTrue && icoTrue.ic && icoTrue.q && icoTrue.ic!==icoTrue.q, JSON.stringify(icoTrue));
    await tap('#planNav');
    const plan = await contrastOf('.pddate, .pdempty');
    ok('Plan\'s dates and "Nothing planned" read at 4.5:1 or better', plan.length>=7 && worst(plan)>=4.5, JSON.stringify({n:plan.length, worst:worst(plan).toFixed(2)}));
    await tap('#setNavP');
    const sect = await contrastOf('.optsect');
    ok('Settings\' section names read at 4.5:1 or better', sect.length>=5 && worst(sect)>=4.5, JSON.stringify({n:sect.length, worst:worst(sect).toFixed(2)}));
    for(const th of ['dark','ink','noir']){
      await mk(L16, `localStorage.setItem("ml_theme","${th}");`);
      const t = await page.evaluate(()=>{ const s=getComputedStyle(document.body); return { m:s.getPropertyValue('--muted').trim(), m2:s.getPropertyValue('--muted2').trim(), paper:s.getPropertyValue('--paper').trim(), card:s.getPropertyValue('--card').trim() }; });
      const hex2rgb=h=>{ h=h.replace('#',''); return `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`; };
      const r=[cr(hex2rgb(t.m),hex2rgb(t.paper)),cr(hex2rgb(t.m2),hex2rgb(t.paper)),cr(hex2rgb(t.m),hex2rgb(t.card)),cr(hex2rgb(t.m2),hex2rgb(t.card))];
      ok(`${th} theme: both greys read at 4.5:1 or better on the page and on cards`, Math.min(...r)>=4.5, JSON.stringify({t, r:r.map(x=>x.toFixed(2))}));
    }

    /* ── R7. faster taps: no per-tile measuring on a tap ───────────────── */
    await mk(L16, 'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","4"); localStorage.setItem("ml_caton","1");');
    const probe = await page.evaluate(async()=>{
      const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetHeight'); let reads=0;
      Object.defineProperty(HTMLElement.prototype,'offsetHeight',{ configurable:true, get(){ reads++; return d.get.call(this); } });
      const el=document.querySelector('#zoomer button[data-cat]');
      el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1})); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
      await new Promise(r=>setTimeout(r,50));
      Object.defineProperty(HTMLElement.prototype,'offsetHeight',d);
      return { reads, tiles:document.querySelectorAll('#zoomer .pill').length, tileh:getComputedStyle(document.documentElement).getPropertyValue('--tileh').trim(),
        inline:[...document.querySelectorAll('#zoomer .pill')].filter(p=>p.style.minHeight).length }; });
    ok('a tap no longer measures every tile (v2.11 read each tile\'s height on every redraw)', probe.reads <= 4, JSON.stringify(probe));
    ok('…the usual tile height is one value, --tileh, and no tile carries its own min-height', /^\d+px$/.test(probe.tileh) && parseInt(probe.tileh)>40 && probe.inline===0, JSON.stringify(probe));
    const rows = await page.evaluate(()=>{ const m={}; [...document.querySelectorAll('#zoomer .pills')].forEach((g,gi)=>[...g.querySelectorAll(':scope > .pill')].forEach(p=>{ const r=p.getBoundingClientRect(); const k=gi+':'+Math.round(r.top); (m[k]=m[k]||[]).push(Math.round(r.height)); })); return Object.values(m); });
    ok('…and every row is still even: each tile as tall as the tallest in its row', rows.length>=3 && rows.every(r=>new Set(r).size===1), JSON.stringify(rows));
    /* The first build took the usual height from one stand-in tile ("Milk 2×"). In three small columns most names
       take two lines, so the stand-in was shorter than the usual tile, its 44px lost to the small-tile rule anyway,
       and categories came out at different heights (CI caught it, in v210). The floor is the list's own usual
       height again, and the cart keeps its own. */
    await mk(L16.map((x,i)=>Object.assign({},x,{checked:i>=5})), SMALL0(3)+'localStorage.setItem("ml_caton","1");');
    const across = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>Math.round(p.getBoundingClientRect().height)));
    ok('small tiles in three columns: one height across every category', across.length>=4 && new Set(across).size===1, JSON.stringify(across));
    await page.locator('#checkedHead').click(); await page.waitForTimeout(500);
    const cartT = await page.evaluate(()=>({ hs:[...document.querySelectorAll('#checkedbar .pill[data-pill]')].map(p=>Math.round(p.getBoundingClientRect().height)),
      v:document.documentElement.style.getPropertyValue('--tileh-cart') }));
    ok('…and the cart, opened, one height over both its rows, from its own usual tile', cartT.hs.length===5 && new Set(cartT.hs).size===1 && cartT.hs[0]===parseInt(cartT.v), JSON.stringify(cartT));

    /* ── R8. the add bar says what it does ─────────────────────────────── */
    await mk(L16);
    const bar = await page.evaluate(()=>{ const l=document.querySelector('#shopAddFab .addpill-lbl'); return l ? { t:l.textContent, shown:getComputedStyle(l).display!=='none' } : null; });
    ok('the floating add bar reads "+ Add items"', bar && bar.t==='Add items' && bar.shown, JSON.stringify(bar));
    await shot('addbar');
    await mk(L16, 'localStorage.setItem("ml_srchw","120");');
    const narrow = await page.evaluate(()=>{ const l=document.querySelector('#shopAddFab .addpill-lbl'), w=document.querySelector('#shopAddFab').getBoundingClientRect().width; return { w:Math.round(w), shown:l && getComputedStyle(l).display!=='none' }; });
    ok('…and just "+" when the bar is set narrow in Settings', narrow.w<=150 && narrow.shown===false, JSON.stringify(narrow));
    await mk([]);
    ok('the empty list\'s hint names the same words', /Tap Add items below/.test(await page.evaluate(()=>document.querySelector('.empty-sub').textContent)), '');

    /* ── R11. keep the screen on while shopping ────────────────────────── */
    await mk(L16.map((x,i)=>Object.assign({},x,{checked:i<2})), '', wakeInit);
    await page.waitForTimeout(300);
    const w1 = await page.evaluate(()=>window.__wl);
    ok('with something in the cart, the app asks the phone to keep the screen on', w1.req>=1, JSON.stringify(w1));
    await tap('#sweepBtn'); await page.waitForTimeout(300);
    const w2 = await page.evaluate(()=>window.__wl);
    ok('…and lets it go once the cart is empty', w2.rel>=1, JSON.stringify(w2));
    await mk(L16.map((x,i)=>Object.assign({},x,{checked:i<2})), 'localStorage.setItem("ml_wakelock","0"); localStorage.setItem("ml_optcoll","[]");', wakeInit);
    ok('Settings › Keep screen on, Off: it never asks', (await page.evaluate(()=>window.__wl.req))===0, '');
    await tap('#setNav');
    ok('…and the setting is there, under Sound', await page.evaluate(()=>!!document.querySelector('[data-opt-wake="1"]') && !!document.querySelector('[data-opt-wake="0"].on')), '');

    /* ── R13. built for VoiceOver ──────────────────────────────────────── */
    await mk(L16);
    const ax = await page.evaluate(()=>({ main:document.querySelectorAll('[role=main]').length, h1:[...document.querySelectorAll('[role=heading][aria-level="1"]')].map(e=>e.textContent.trim()),
      h2:document.querySelectorAll('[role=heading][aria-level="2"]').length, cats:document.querySelectorAll('#zoomer .chead').length }));
    ok('the Shop page has one main landmark, the list name as its heading, and a heading per category', ax.main===1 && ax.h1.length===1 && /Groceries|Sandbox/.test(ax.h1[0]) && ax.h2>=ax.cats && ax.cats>=5, JSON.stringify(ax));
    await tap('#planNav');
    const axp = await page.evaluate(()=>({ main:document.querySelectorAll('[role=main]').length, h1:document.querySelectorAll('[role=heading][aria-level="1"]').length }));
    await tap('#setNavP');
    const axs = await page.evaluate(()=>({ main:document.querySelectorAll('[role=main]').length, h1:[...document.querySelectorAll('[role=heading][aria-level="1"]')].map(e=>e.textContent.trim()) }));
    ok('…and so do Plan and Settings', axp.main===1 && axp.h1===1 && axs.main===1 && axs.h1.join()==='Settings', JSON.stringify({axp, axs}));

    /* ── R14. Plan says what it is for ─────────────────────────────────── */
    await mk(L16);
    await tap('#planNav');
    const hint = await page.evaluate(()=>{ const h=document.querySelector('.planhint'); return h ? h.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('an empty week says what Plan is for, with a button to start', hint && /add every ingredient/.test(hint) && /Plan today/.test(hint), hint);
    await shot('planhint');
    await tap('#pwHint');
    ok('…which opens today\'s "Add recipe / Add food" menu', /Add recipe/.test(await page.evaluate(()=>document.body.innerText)) && /Add food/.test(await page.evaluate(()=>document.body.innerText)), '');

    /* ── R15. the learned shop order travels with the list ─────────────── */
    const now=Date.now();
    await mk(L16.map((x,i)=>Object.assign({},x,{checked:i===5})), `localStorage.setItem("ml_store","dand"); localStorage.setItem("ml_cache_v101", (()=>{ const c=JSON.parse(localStorage.getItem("ml_cache_v101")); c.aisle={ dand:{ items:{"rice|bulk":0,"milk|fresh":1}, cats:{bulk:0,fresh:1}, ts:${now} } }; return JSON.stringify(c); })());`);
    const ad = await page.evaluate(()=>({ items:JSON.parse(localStorage.getItem('ml_aiitems_v101')||'{}'), seen:JSON.parse(localStorage.getItem('ml_aiseen_v101')||'{}') }));
    ok('another phone\'s learned order for this store is taken in on load', ad.items.dand && ad.items.dand['rice|bulk']===0 && ad.items.dand['milk|fresh']===1 && ad.seen.dand===now, JSON.stringify(ad));
    await tap('#sweepBtn'); await page.waitForTimeout(300);
    const pub = await page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return c.aisle && c.aisle.dand; });
    ok('finishing a shop writes this phone\'s learned order back into the list, newer', pub && pub.items && pub.items['rice|bulk']===0 && pub.ts>now, JSON.stringify(pub && {ts:pub.ts, n:Object.keys(pub.items||{}).length}));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
