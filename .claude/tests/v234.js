/* v2.34 — the household's eight items (14 October 2026).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (1) "Show my card" brings the card down from the top of the screen, barcode first (a phone is scanned by its top end);
   - (2) it opens on the card for the shop you are at, and a swipe left/right moves between cards;
   - (3) a card shows its photo as its logo, or a badge with its initial;
   - (4) singular and plural names get the same drawing ("nail" / "nails");
   - (5) every category in Regulars ends with a "+" tile that adds a Regular straight into it;
   - (6) Help › Location diagnostics shows where the phone is and, per shop, its pin, its aisle order and the AI route;
   - (7) in Edit item the unit box is as tall as the amount and the name (46px);
   - (8) sorting by Location at a shop, tiles show their aisle number top right — from the shop's own map or its built-in
     layout; counters show none; another sort shows none.

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
let RECEIPT = {};
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

  const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const CARDS = [{ id:'w1', name:'Everyday Rewards', chain:'woolworths', num:'9355123456789', photo:'' }, { id:'c1', name:'Flybuys', chain:'coles', num:'6008943218616910', photo:'' }];
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const swipe = (dx)=>page.evaluate(dx=>{ const el=document.querySelector('#cardSwipe'), r=el.getBoundingClientRect(), y=r.top+r.height/2, x=r.left+r.width/2;
    const t=(cx)=>new Touch({ identifier:1, target:el, clientX:cx, clientY:y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches:[t(x)], changedTouches:[t(x)], bubbles:true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches:[], changedTouches:[t(x+dx)], bubbles:true })); }, dx);
  const title = ()=>page.evaluate(()=>(document.querySelector('#cardTitle')||{}).textContent||'');

  try{
    /* ── 1–3 the card ────────────────────────────────────────────────── */
    await mk({ store:'dand', extra:`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(CARDS))});` });
    await tap('#shopMenu'); await tap('#smCard');
    const g = await page.evaluate(()=>{ const bg=document.querySelector('#cardBg'), sh=document.querySelector('#cardSheet'), f=sh.firstElementChild;
      return { top:bg.classList.contains('sheettop'), y:Math.round(sh.getBoundingClientRect().top), first:f && f.id, bar:!!f.querySelector('.bc128'), dots:document.querySelectorAll('.carddot').length }; });
    ok('(1) "Show my card" comes down from the top, barcode first', g.top && g.y<=2 && g.first==='cardSwipe' && g.bar, JSON.stringify(g));
    ok('(2) at a Coles it opens on the Flybuys card (not the first saved), with a dot per card', /Flybuys/.test(await title()) && g.dots===2, await title());
    const lg = await page.evaluate(()=>{ const l=document.querySelector('#cardSheet .cardlogo'); return l ? { badge:l.classList.contains('cardlogo-t'), t:l.textContent, bg:getComputedStyle(l).backgroundColor } : null; });
    ok('(3) a card without a photo shows a badge with its initial, in the chain\'s colour', lg && lg.badge && lg.t==='F' && lg.bg==='rgb(224, 26, 34)', JSON.stringify(lg));
    await shot('card');
    await swipe(-120); await page.waitForTimeout(300);
    const t2 = await title();
    await swipe(120); await page.waitForTimeout(300);
    ok('(2) a swipe left moves to the other card, a swipe right comes back', /Everyday Rewards/.test(t2) && /Flybuys/.test(await title()), t2);
    await swipe(-20); await page.waitForTimeout(300);
    ok('(2) …a small drag is not a swipe', /Flybuys/.test(await title()), '');
    await tap('#cardClose');
    await mk({ store:'dand', extra:`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify([Object.assign({}, CARDS[1], { photo:TINY })]))});` });
    await tap('#shopMenu'); await tap('#smCard');
    ok('(3) a card with a photo shows the photo as its logo', await page.evaluate(()=>!!document.querySelector('#cardSheet img.cardlogo')), '');
    await tap('#cardClose');

    /* ── 4 singular and plural ───────────────────────────────────────── */
    const PAIRS = [['Nail','Nails'],['Apricot','Apricots'],['Parsnip','Parsnips'],['Chocolate chip','Chocolate chips'],['Tomato','Tomatoes']];
    await mk({ items: PAIRS.flat().map((n,i)=>it('d'+i, n, 'others')) });
    const dr = await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>[p.querySelector('.pname').textContent, ((p.querySelector('svg.ill .if')||{}).getAttribute||(()=>null)).call(p.querySelector('svg.ill .if')||{}, 'd')])));
    const bad = PAIRS.filter(([a,b])=>!dr[a] || dr[a]!==dr[b]).map(([a,b])=>a+'/'+b);
    ok('(4) a singular and its plural get the same drawing', bad.length===0, bad.join(', ') || '');

    /* ── 7 the unit box ──────────────────────────────────────────────── */
    await mk({});
    const p1 = pill('1'); await p1.dispatchEvent('pointerdown'); await page.waitForTimeout(650); await p1.dispatchEvent('pointerup'); await page.waitForTimeout(500);
    const hs = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); if(!s) return null; const h=e=>e?Math.round(e.getBoundingClientRect().height):0;
      return { unit:h(s.querySelector('.wbtn')), name:h(s.querySelector('#editName')), qty:h(s.querySelector('.qstep')) }; });
    ok('(7) in Edit item the unit box, the amount and the name are one height', hs && hs.unit===hs.name && hs.unit===hs.qty, JSON.stringify(hs));
    await page.keyboard.press('Escape');

    /* ── 5 Regulars ──────────────────────────────────────────────────── */
    await mk({ doc:{ buyAgain:[{ name:'Cream', cat:'fresh', qty:1, ts:1 }] } });
    const rc = await page.evaluate(()=>[...document.querySelectorAll('.regcat .regcatlbl')].map(b=>b.dataset.regc));
    ok('(5) "Add from your regulars" lists every category, even those with no Regulars yet', rc.length===9 && rc.includes('bulk') && rc.includes('fresh'), JSON.stringify(rc));
    await tap('[data-regc="fresh"]');
    ok('(5) …an opened category ends with a "+" tile after its Regulars', await page.evaluate(()=>{ const r=[...document.querySelectorAll('.regcat')].find(x=>x.querySelector('[data-regc="fresh"]')); const t=r && [...r.querySelectorAll('.pills > *')]; return !!(t && t.length===2 && t[1].matches('[data-ba-new="fresh"]')); }), '');
    await tap('[data-regc="bulk"]');
    await shot('regulars');
    await tap('[data-ba-new="bulk"]');
    ok('(5) …tapping one asks for a name, for that category', /New Regular in Bulk/.test(await page.evaluate(()=>(document.querySelector('#bnTitle')||{}).textContent||'')), '');
    await page.locator('#bnName').fill('basmati rice'); await page.locator('#bnName').press('Enter'); await page.waitForTimeout(500);
    const reg = await page.evaluate(()=>(JSON.parse(localStorage.getItem('ml_cache_v101')).buyAgain||[]).map(e=>e.name+'|'+e.cat));
    ok('(5) …and adds it to Regulars in that category', reg.includes('Basmati rice|bulk'), JSON.stringify(reg));

    /* ── 6 location diagnostics ──────────────────────────────────────── */
    await mk({ store:'dand', doc:{ aislemap:{ dand:{ aisles:[{ n:'5', t:'Bread & bakery' }, { n:'6', t:'Snacks' }] } } } });
    await tap('#setNav'); await tap('#optLocDiag');
    const ld = await page.evaluate(()=>{ const s=document.querySelector('#ldSheet'); if(!s) return null;
      const row=[...s.querySelectorAll('.pdrow')].map(r=>({ n:r.querySelector('.pd-n').textContent, s:r.querySelector('.pd-s').textContent, t:r.textContent.replace(/\s+/g,' ') }));
      return { now:s.querySelector('.ldrec').textContent, row }; });
    const dand = ld && ld.row.find(r=>r.n==='Coles Dandenong'), rich = ld && ld.row.find(r=>r.n==='Coles Vic Garden');
    ok('(6) Location diagnostics: per shop, its pin and its aisle order — its own map, with the signs, or the built-in layout', dand && /can be detected/.test(dand.s) && /Its own aisle map · 2 aisles/.test(dand.t) && /5 Bread & bakery/.test(dand.t)
       && rich && /Built-in layout · 10 aisles/.test(rich.t), JSON.stringify(ld).slice(0,300));
    await shot('locdiag');
    await tap('#ldClose');

    /* ── 8 aisle numbers on tiles ────────────────────────────────────── */
    const AI = [it('a1','Bread','fresh'), it('a2','Chocolate','others'), it('a3','Steak','meat'), it('a4','Cordial','others')];
    const tags = ()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#zoomer .pill[data-pill]')].filter(p=>p.offsetParent).map(p=>[p.querySelector('.pname').textContent, (p.querySelector('.paisle')||{}).textContent||''])));
    const LOC = 'localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_sorts", JSON.stringify({shop:"location"}));';
    await mk({ store:'dand', items:AI, extra:LOC });
    let tg = await tags();
    ok('(8) by Location at Coles Dandenong, tiles show their aisle from the built-in layout; meat (a counter) none', tg['Bread']==='1' && tg['Chocolate']==='2' && tg['Cordial']==='2' && tg['Steak']==='', JSON.stringify(tg));
    await shot('aisles');
    await mk({ store:'dand', items:AI, extra:LOC, doc:{ aislemap:{ dand:{ aisles:[{ n:'5', t:'Bread & bakery' }, { n:'9B', t:'Snacks & confectionery' }] } } } });
    tg = await tags();
    ok('(8) …with the shop\'s own aisle map, the numbers come from its signs', tg['Bread']==='5' && tg['Chocolate']==='9B', JSON.stringify(tg));
    await mk({ store:'dand', items:AI, extra:'localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_sorts", JSON.stringify({shop:"alpha"}));' });
    tg = await tags();
    ok('(8) …and another sort shows no aisle numbers', Object.values(tg).every(v=>v===''), JSON.stringify(tg));
    await mk({ store:'home', items:AI, extra:LOC });
    tg = await tags();
    ok('(8) …nor does Location away from a shop', Object.values(tg).every(v=>v===''), JSON.stringify(tg));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
