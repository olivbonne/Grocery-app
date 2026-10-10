/* v2.12 — the household's batch of 2026-10-10, evening (screenshots of the Sandbox and Groceries lists):
   1. "the + in 99+ is too small and overlap with the 9" — they picked from samples (option B);
   2. bottom bar: "Shop" centred on the cart, the three labels on one line, Plan and Settings the cart's size;
   3. the cart "glued to the top banner … coming down from the top banner when 1st item is checked",
      rounded at the bottom, its tiles moving "only up/down";
   4. "small tile numbers 3x 200g is not placed the same as the big tile";
   5. header: no orange dot; the name in a tile with a bigger chevron in its colour; "N to buy" the name's
      size and colour; the store in the name's font and colour at the size of "Shop" on the bottom bar;
   6. the cart's Finish becomes one "Save to Regulars" button; a bigger triangle in the words' colour.

   WHAT THESE CHECKS HAVE TO PROVE: each of the above, measured in the page — glyph extents for the "+",
   rects for alignment and gaps, computed styles for sizes and colours.

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


const SMALL = n => `localStorage.setItem("ml_displays", JSON.stringify({shop:"small"})); localStorage.setItem("ml_smallcols","${n}"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_store","home");`;
const LIST = [["Frozen raspberries","frozen",2],["Ginger beer no sugar","drinks"],["Beef cubes","meat",1,"800g"],["Beef topside steak","meat",3,"200g"],
  ["Lamb rump or flank","meat"],["Chicken breast","meat",3,"200g"],["Chicken drumsticks","meat",4,"1kg"],["Chicken thigh","meat",8,"500g"],["Avocados","vegetable"]];

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(items, extra)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(items, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };

  try{
    /* ── 1. 99+ : the + clear of the 9s, all of it inside the basket ───── */
    await mk(Array.from({length:120},(_,i)=>it(String(i),"Item "+i,"fresh",1,"",true)));
    const n99 = await page.evaluate(()=>{ const t=document.querySelector('#cartNum'); if(!t) return null;
      const ex=[0,1,2].map(i=>t.getExtentOfChar(i)), bb=t.getBBox(), pl=t.querySelector('.cartplus');
      return { txt:t.textContent, nineR:ex[1].x+ex[1].width, plusL:ex[2].x, left:bb.x, right:bb.x+bb.width, plusX:pl&&pl.getAttribute('x') }; });
    ok('over 99 the "+" starts after the second 9 instead of over it (household, v2.12 item 1, option B)',
       n99 && n99.txt==='99+' && n99.plusX===null && n99.plusL >= n99.nineR - 0.5, JSON.stringify(n99));
    ok('…and "99+" stays between the cart\'s walls (x 28 to 87 of the drawing)', n99 && n99.left >= 28 && n99.right <= 87, JSON.stringify(n99));

    /* ── 2. the bottom bar ─────────────────────────────────────────────── */
    const nav = await page.evaluate(()=>{ const b=[...document.querySelectorAll('#bottomnav .navbtn')]; if(b.length!==3) return null;
      const svg=x=>x.querySelector('svg').getBoundingClientRect(), lab=x=>x.querySelector(':scope > span:last-child').getBoundingClientRect();
      const cs=svg(b[1]); return { h:b.map(x=>Math.round(svg(x).height)), w:b.map(x=>Math.round(svg(x).width)), labTop:b.map(x=>Math.round(lab(x).top*2)/2),
        basket: cs.left + (57.24-10)/80*cs.width, shop:(lab(b[1]).left+lab(b[1]).right)/2 }; });
    ok('Plan and Settings are drawn as tall as the cart (26px), and about as wide', nav && nav.h.every(h=>h===26) && nav.w.every(w=>w>=26&&w<=29), JSON.stringify(nav));
    ok('…so Plan, Shop and Settings sit on one line', nav && new Set(nav.labTop).size===1, JSON.stringify(nav&&nav.labTop));
    ok('"Shop" is centred under the cart\'s basket', nav && Math.abs(nav.basket-nav.shop) <= 0.75, JSON.stringify(nav));

    /* ── 3 + 6. the cart hangs from the header ─────────────────────────── */
    await mk(LIST.map((x,i)=>it(String(i),x[0],x[1],x[2],x[3],i<4)), SMALL(1));
    const cb = await page.evaluate(()=>{ const c=document.querySelector('#checkedbar'), tf=document.querySelector('#topfix'), z=document.querySelector('.zoomwrap');
      const cs=getComputedStyle(c), r=c.getBoundingClientRect(); return { pos:cs.position, gap:Math.round(r.top - tf.getBoundingClientRect().bottom),
        bl:cs.borderBottomLeftRadius, br:cs.borderBottomRightRadius, listBelow:Math.round(z.getBoundingClientRect().top - r.bottom),
        btn:document.querySelector('#sweepBtn').textContent.trim(), tri:(()=>{ const t=c.querySelector('.cbtri'); return t ? { h:t.getBoundingClientRect().height, col:getComputedStyle(t).color } : null; })(),
        ink:getComputedStyle(c.querySelector('.chk-in')).color, arrows:/[▸▾]/.test(c.textContent) }; });
    ok('the cart is fixed to the header\'s bottom edge, with no gap', cb.pos==='fixed' && Math.abs(cb.gap)<=1, JSON.stringify(cb));
    ok('…its bottom corners are rounded', parseFloat(cb.bl)>=12 && parseFloat(cb.br)>=12, JSON.stringify(cb));
    ok('…and the list starts below it', cb.listBelow>=0 && cb.listBelow<=2, JSON.stringify(cb));
    ok('one button, "Save to Regulars" (was Finish)', cb.btn==='Save to Regulars', cb.btn);
    ok('the triangle is drawn, as tall as the "t" in "cart", in the same ink as the words', cb.tri && !cb.arrows && cb.tri.h>=8.5 && cb.tri.h<=10.5 && cb.tri.col===cb.ink, JSON.stringify(cb));
    await shot('cart-shut');
    await tap('#checkedHead');
    const cbo = await page.evaluate(()=>{ const s=document.querySelector('#checkedbar .checkedscroll'), cs=getComputedStyle(s);
      return { ox:cs.overflowX, ta:cs.touchAction, fits:s.scrollWidth<=s.clientWidth, btn:document.querySelector('#sweepBtn').textContent.trim(),
        gap:Math.round(document.querySelector('#checkedbar').getBoundingClientRect().top - document.querySelector('#topfix').getBoundingClientRect().bottom) }; });
    ok('open, the cart\'s tiles move up and down only', cbo.ox==='hidden' && cbo.ta==='pan-y' && cbo.fits, JSON.stringify(cbo));
    ok('…the button still says "Save to Regulars", and the cart is still glued to the header', cbo.btn==='Save to Regulars' && Math.abs(cbo.gap)<=1, JSON.stringify(cbo));
    await shot('cart-open');
    await page.evaluate(()=>window.scrollTo(0,400)); await page.waitForTimeout(300);
    const scrolled = await page.evaluate(()=>Math.round(document.querySelector('#checkedbar').getBoundingClientRect().top - document.querySelector('#topfix').getBoundingClientRect().bottom));
    ok('…and stays under the header when the list scrolls', Math.abs(scrolled)<=1, String(scrolled));

    await mk(LIST.map((x,i)=>it(String(i),x[0],x[1],x[2],x[3])), SMALL(1));
    const before = await page.evaluate(()=>!!document.querySelector('#checkedbar'));
    await tap('#zoomer .pill[data-pill]');
    const drop = await page.evaluate(()=>{ const c=document.querySelector('#checkedbar'); return c && c.classList.contains('drop'); });
    ok('the cart comes down from the header when the first item goes in', !before && drop, JSON.stringify({before,drop}));

    /* ── 4. the amount on small tiles sits where a big tile puts it ────── */
    const meta = async()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].filter(p=>p.querySelector('.pill-meta')).map(p=>{
      const r=p.getBoundingClientRect(), n=p.querySelector('.pname').getBoundingClientRect(), m=p.querySelector('.pill-meta').getBoundingClientRect(), pr=parseFloat(getComputedStyle(p).paddingRight);
      return { n:p.querySelector('.pname').textContent.trim(), sameLine: m.top < n.bottom - 2, right: Math.round(r.right - pr - m.right) }; }));
    await mk(LIST.map((x,i)=>it(String(i),x[0],x[1],x[2],x[3])), SMALL(1));
    const m1 = await meta();
    ok('small tiles, one column: the amount is on the name\'s line, at the right, as on a big tile', m1.length>=5 && m1.every(x=>x.sameLine && Math.abs(x.right)<=1), JSON.stringify(m1));
    await shot('small1');
    await mk(LIST.map((x,i)=>it(String(i),x[0],x[1],x[2],x[3])), SMALL(3));
    const m3 = await meta();
    ok('small tiles, three columns: the amount is at the right too (its own line — no room beside the name)', m3.length>=5 && m3.every(x=>Math.abs(x.right)<=1), JSON.stringify(m3));
    await shot('small3');

    /* ── 5. the header ─────────────────────────────────────────────────── */
    const hd = await page.evaluate(()=>{ const t=document.querySelector('#listSwitch'), c=document.querySelector('.topfix .hcount'), l=document.querySelector('.topfix .locchip'),
      ch=t.querySelector('.lschev svg'), shop=document.querySelectorAll('#bottomnav .navbtn')[1].querySelector(':scope > span:last-child');
      const g=(e,k)=>getComputedStyle(e)[k];
      return { dot:!!t.querySelector('.dot'), tileBg:g(t,'backgroundColor'), radius:g(t,'borderTopLeftRadius'), chevH:ch.getBoundingClientRect().height, chevCol:g(ch,'color'), chevOp:g(t.querySelector('.lschev'),'opacity'),
        tCol:g(t,'color'), tSize:g(t,'fontSize'), cSize:c&&g(c,'fontSize'), cCol:c&&g(c,'color'), lSize:l&&g(l,'fontSize'), lCol:l&&g(l,'color'), lFont:l&&g(l,'fontFamily').split(',')[0]+g(l,'fontWeight'), tFont:g(t,'fontFamily').split(',')[0]+g(t,'fontWeight'), shopSize:g(shop,'fontSize') }; });
    ok('the list name has no orange full stop', !hd.dot, JSON.stringify(hd));
    ok('…and sits in a tile, with its chevron', !/rgba\(0, 0, 0, 0\)|transparent/.test(hd.tileBg) && parseFloat(hd.radius)>0, JSON.stringify(hd));
    ok('…the chevron bigger (17px, was 11) and the name\'s own colour', hd.chevH>=16 && hd.chevCol===hd.tCol && hd.chevOp==='1', JSON.stringify(hd));
    ok('"N to buy" is the name\'s size and colour', hd.cSize===hd.tSize && hd.cCol===hd.tCol, JSON.stringify(hd));
    ok('the store is in the name\'s font and colour, at the size of "Shop" on the bottom bar', hd.lSize===hd.shopSize && hd.lCol===hd.tCol && hd.lFont===hd.tFont, JSON.stringify(hd));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
