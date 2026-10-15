/* v2.37 — the household's five items of 15 October (second batch).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (1) "Type it in" shows the name and number in the same drop-down as the card (no sheet from the bottom); Cancel goes
     back to "Add a card"; Save keeps the card and shows it;
   - (2) the "+" for adding a card is the FIRST dot, left of the cards', and a swipe right from the first card reaches it;
   - (3) option A: a band in the programme's own colour with its name sits above the barcode — on the card, in Photo view
     and on the card at the top of the page; a name the app does not know gets a steady colour of its own; no logo images;
   - (4) the "+" tile at the end of a Regulars category opens the same add sheet as "+ Add items"; what is typed there goes
     on the list in that category and is kept as a Regular; Cancel leaves no Regular behind;
   - (5) with the keyboard up the add bar keeps a gap above the keyboard's own bar.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,q)=>({id,name:n,cat:c,qty:q||1,weight:"",checked:false,tags:[]});
const NAMES=[["Salad rocket","vegetable",1],["High protein yogurt","fresh",2],["Frozen raspberries","fresh",2],["Cream","fresh",1],["Nexba lemon squash","others",2],["Popcorn Sweet and Salty","others",2],["Linguine","bulk",2],["Honey","bulk",1],["Tofu soft","asian",2]];
const ITEMS=NAMES.map(([n,c,q],i)=>it(String(i+1),n,c,q));
let CARDREPLY = { status:200, body:{ name:'Flybuys', number:'6008943218616910' }, delay:500 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ml_cache_v101")), ${JSON.stringify(o.doc||{})})));
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/card', async r => { await new Promise(z=>setTimeout(z, CARDREPLY.delay||0)); r.fulfill({ status:CARDREPLY.status, contentType:'application/json', body:JSON.stringify(CARDREPLY.body) }); });
    await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEIPT) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const ls = k=>page.evaluate(k=>localStorage.getItem(k), k);
  const pill = id=>page.locator(`#zoomer .pill[data-pill="${id}"]:visible`).first();   // visible: the urgent strip keeps hidden copies

  const TINY = 'data:image/png;base64,'+PNG.toString('base64');
  const CARDS = [{ id:'c1', name:'Flybuys', chain:'', num:'6008943218616910', photo:'' }, { id:'w1', name:'Everyday Rewards', chain:'', num:'9355123456789', photo:'' }];
  const cardsLS = c=>`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(c))});`;
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const swipe = (dx)=>page.evaluate(dx=>{ const el=document.querySelector('#cardSwipe'), r=el.getBoundingClientRect(), y=r.top+r.height/2, x=r.left+r.width/2;
    const t=(cx)=>new Touch({ identifier:1, target:el, clientX:cx, clientY:y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches:[t(x)], changedTouches:[t(x)], bubbles:true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches:[], changedTouches:[t(x+dx)], bubbles:true })); }, dx);
  const title = ()=>page.evaluate(()=>(document.querySelector('#cardTitle')||{}).textContent||'');
  const rgb = h=>{ const n=parseInt(h.slice(1),16); return `rgb(${n>>16}, ${(n>>8)&255}, ${n&255})`; };

  try{
    /* ── 3 the band, as a pure function ──────────────────────────────── */
    const { pathToFileURL } = require('url');
    const T = await import(pathToFileURL(path.join(ROOT,'js','till.js')).href);
    const fb=T.cardBrand('Flybuys',''), er=T.cardBrand('Everyday Rewards',''), wm=T.cardBrand('Walmart Rewards',''), ch=T.cardBrand('My card','coles'),
      u1=T.cardBrand('Corner Deli club',''), u2=T.cardBrand('Corner Deli club',''), sg=T.cardBrand('Sigarette shop','');
    ok('(3) each programme has its own colour: Flybuys, Everyday Rewards, Walmart, and a Coles card by its chain', fb.bg==='#0A2D8C' && er.bg==='#FF6A13' && wm.bg==='#0071CE' && ch.bg===fb.bg, JSON.stringify([fb,er,wm,ch]));
    ok('(3) a name it does not know gets a steady colour of its own; a short name is not found inside a longer word', u1.bg===u2.bg && /^#[0-9A-F]{6}$/i.test(u1.bg) && sg.bg!==T.cardBrand('IGA','').bg, JSON.stringify([u1,sg]));

    /* ── 2, 3 the card sheet ─────────────────────────────────────────── */
    await mk({ store:'dand', extra:cardsLS(CARDS) });
    await tap('#shopMenu'); await tap('#smCard');
    const b = await page.evaluate(()=>{ const f=document.querySelector('#cardSwipe'), band=f && f.firstElementChild, svg=f && f.querySelector('.bc128');
      return { cls:band && band.className, t:band && band.textContent, bg:band && getComputedStyle(band).backgroundColor, above:!!(band && svg && band.getBoundingClientRect().bottom<=svg.getBoundingClientRect().top+1),
        img:!!document.querySelector('#cardSheet img:not(.bc128)') }; });
    ok('(3) the card has a band in its colour with its name, above the barcode', b.cls==='cardband' && /Flybuys/.test(b.t) && b.bg===rgb('#0A2D8C') && b.above, JSON.stringify(b));
    ok('(3) …and no logo picture', !b.img, '');
    await shot('band');
    const d = await page.evaluate(()=>[...document.querySelectorAll('.carddots .carddot')].map(x=>x.classList.contains('carddot-add') ? '+' : x.classList.contains('on') ? 'on' : 'o'));
    ok('(2) the "+" is the first dot, left of the cards\'', d[0]==='+' && d.length===3, JSON.stringify(d));
    await swipe(120); await page.waitForTimeout(300);
    /* SUPERSEDED by v2.38: the panel is titled "Add card". Still protects where the swipe lands. */
    ok('(2) a swipe right from the first card reaches "Add a card"', /^Add (a )?card$/.test(await title()) && await page.evaluate(()=>!!document.querySelector('.carddot-add.on')), await title());
    await swipe(-120); await page.waitForTimeout(300);
    ok('(2) …and a swipe left comes back to the first card', /Flybuys/.test(await title()), await title());
    await tap('#cardClose');

    await mk({ store:'dand', extra:cardsLS([Object.assign({}, CARDS[0], { photo:TINY })]) });
    await tap('#shopMenu'); await tap('#smCard'); await tap('[data-card-view="photo"]');
    ok('(3) the band stays above the card\'s photo in Photo view', await page.evaluate(()=>{ const f=document.querySelector('#cardSwipe'); return !!(f && f.firstElementChild.classList.contains('cardband') && f.querySelector('img')); }), '');
    await tap('#cardClose');

    await mk({ store:'dand', extra:cardsLS([CARDS[0]]) });
    await pill('1').click(); await page.waitForTimeout(250); await tap('#sweepBtn');
    const nb = await page.evaluate(()=>{ const band=document.querySelector('#cardNudge .cardband'), svg=document.querySelector('#cardNudge .bc128');
      return { t:band && band.textContent, above:!!(band && svg && band.getBoundingClientRect().bottom<=svg.getBoundingClientRect().top+1) }; });
    ok('(3) the card at the top of the page after a shop has the band too', nb.t && /Flybuys/.test(nb.t) && nb.above, JSON.stringify(nb));
    await shot('nudge');

    /* ── 1 Type it in, in the same drop-down ─────────────────────────── */
    await mk({ store:'home' });
    await tap('#shopMenu'); await tap('#smCard'); await tap('#cardTypeGo');
    const ty = await page.evaluate(()=>({ inSheet:!!document.querySelector('#cardSheet #ceName') && !!document.querySelector('#cardSheet #ceNum'), bottom:!!document.querySelector('#ceBg'), focus:document.activeElement && document.activeElement.id }));
    ok('(1) "Type it in" shows the name and number in the card\'s own drop-down, not a sheet from the bottom', ty.inSheet && !ty.bottom, JSON.stringify(ty));
    ok('(1) …with the name field ready to type in', ty.focus==='ceName', ty.focus);
    await shot('type');
    await tap('#ceCancel');
    /* SUPERSEDED by v2.38: the panel is titled "Add card". Still protects what Cancel does. */
    ok('(1) Cancel goes back to "Add a card"', /^Add (a )?card$/.test(await title()) && await page.evaluate(()=>!document.querySelector('#ceName')), await title());
    await tap('#cardTypeGo');
    await page.locator('#ceName').fill('Corner Deli club'); await page.locator('#ceNum').fill('12345678'); await tap('#ceSave');
    const sv = await page.evaluate(()=>({ cards:JSON.parse(localStorage.getItem('ml_cards')||'[]').map(c=>c.name), t:(document.querySelector('#cardTitle')||{}).textContent, band:!!document.querySelector('#cardSwipe .cardband'), bar:!!document.querySelector('#cardSwipe .bc128') }));
    ok('(1) Save keeps the card and shows it, with its band and barcode', sv.cards.length===1 && /Corner Deli/.test(sv.t||'') && sv.band && sv.bar, JSON.stringify(sv));
    await tap('#cardClose');

    /* ── 4 the Regulars "+" tile ─────────────────────────────────────── */
    await mk({ doc:{ buyAgain:[{ name:'Cream', cat:'fresh', qty:1, ts:1 }] } });
    await tap('[data-regc="bulk"]');
    await tap('[data-ba-new="bulk"]'); await page.waitForTimeout(700);
    const t4 = await page.evaluate(()=>({ sheet:!!document.querySelector('#addSheet'), main:!!document.querySelector('#mainInput'), old:!!document.querySelector('#bnTitle'), ph:(document.querySelector('#mainInput')||{}).placeholder||'' }));
    ok('(4) the "+" tile opens the same add sheet as "+ Add items", not the little "New Regular" sheet', t4.sheet && t4.main && !t4.old, JSON.stringify(t4));
    ok('(4) …saying which category it adds to', /Bulk/.test(t4.ph), t4.ph);
    await shot('plus');
    await page.locator('#mainInput').fill('basmati rice'); await page.locator('#mainInput').press('Enter'); await page.waitForTimeout(1600);
    const d4 = await page.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('ml_cache_v101')); return { items:s.items.filter(i=>/basmati/i.test(i.name)).map(i=>i.name+'|'+i.cat), regs:s.buyAgain.map(e=>e.name+'|'+e.cat) }; });
    ok('(4) what is typed goes on the list in that category', d4.items.length===1 && /\|bulk$/.test(d4.items[0]), JSON.stringify(d4.items));
    ok('(4) …and is kept as a Regular there', d4.regs.some(r=>/^basmati rice\|bulk$/i.test(r)), JSON.stringify(d4.regs));
    await tap('[data-ba-new="bulk"]'); await page.waitForTimeout(700);
    await page.locator('#mainInput').fill('quinoa');
    await page.locator('[data-add-typed]').first().click(); await page.waitForTimeout(500);
    const pre4 = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items.filter(i=>/quinoa/i.test(i.name)).length);
    await page.locator('#addDone').click({ force:true }); await page.waitForTimeout(1600);
    const c4 = await page.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('ml_cache_v101')); return { on:s.items.filter(i=>/quinoa/i.test(i.name)).length, reg:s.buyAgain.filter(e=>/quinoa/i.test(e.name)).length }; });
    ok('(4) Cancel leaves neither the item nor a Regular behind', pre4===1 && c4.on===0 && c4.reg===0, JSON.stringify(Object.assign({ pre4 }, c4)));
    await tap('#shopAddFab'); await page.waitForTimeout(700);
    const ph2 = await page.evaluate(()=>(document.querySelector('#mainInput')||{}).placeholder||'');
    ok('(4) "+ Add items" afterwards is the ordinary sheet again', !/Bulk/.test(ph2), ph2);

    /* ── 5 a gap above the keyboard ──────────────────────────────────── */
    const pb = await page.evaluate(()=>{ const s=document.querySelector('#addSheet'); if(!s) return null; s.classList.add('kbup'); const v=parseFloat(getComputedStyle(s).paddingBottom); s.classList.remove('kbup'); return v; });
    const pin = /as\.style\.paddingBottom = bot > 0 \? "12px"/.test(fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'));   // the pin writes it inline while the keyboard is up
    ok('(5) with the keyboard up the add bar keeps a gap above it', pb!==null && pb>=8 && pin, JSON.stringify({ pb, pin }));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
