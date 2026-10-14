/* v2.35 — the household's items of 14 October (1, 2, 3, 5, 6, 7, 8, 9; item 4 is a proposal, docs/onboarding-proposal.md).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (9) a receipt is matched by NAME first, word by word and forgiving small spelling differences, and only then by the
     order things were ticked — the household's own receipt (kombucha/Kambucha, heirloom tomatoes/tomatoes big) pairs right;
   - (1) Barcode/Photo is remembered: a swipe to the next card stays on the photo, and so does the next opening;
   - (7) one swipe past the last card is "Add a card": scanning or choosing a photo shows that it is reading, then opens
     the card form with the name and number read, to check and save; a reader that fails says so in words; "Type it in"
     opens an empty form; with no card saved, the Shop menu offers to add one;
   - (5) the card form no longer asks which shop: it is worked out from the name or number;
   - (6, 3) at home no card comes up after a shop; at a Coles the Flybuys card does — even one saved without a shop;
   - (2) an item can be for several shops: it is "here" at any of them, and Edit item ticks several;
   - (8) the aisle number is a paper badge with an "A", legible on any tile colour.

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

  const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const swipe = (dx)=>page.evaluate(dx=>{ const el=document.querySelector('#cardSwipe'), r=el.getBoundingClientRect(), y=r.top+r.height/2, x=r.left+r.width/2;
    const t=(cx)=>new Touch({ identifier:1, target:el, clientX:cx, clientY:y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches:[t(x)], changedTouches:[t(x)], bubbles:true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches:[], changedTouches:[t(x+dx)], bubbles:true })); }, dx);
  const title = ()=>page.evaluate(()=>(document.querySelector('#cardTitle')||{}).textContent||'');
  const cardsLS = c=>`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(c))});`;

  try{
    /* ── 9 the receipt, matched by name first ────────────────────────── */
    const { pathToFileURL } = require('url');
    const T = await import(pathToFileURL(path.join(ROOT,'js','till.js')).href);
    const cart=['tomatoes big','eggs','Deodorant stick','Kambucha pomegranate'].map(n=>({name:n}));
    const L=(raw,name)=>({raw,name,keep:true});
    const lines=[L('*%REMEDY KOMBUCHA 4PK 1LITRE 2 @ $6.90 EACH','remedy kombucha'),L('% BRUT DEODORANT STICK 50GRAM','brut deodorant stick'),L('COLES EGGS FR RANGE 600GRAM','free range eggs'),L('TOMATOES Heirloom Yellow 0.931 kg','heirloom yellow tomatoes')];
    const r=T.reconcile(lines,cart,(a,b,l)=>Math.max(T.nameScore(a,b),T.nameScore(l.raw,b)));
    ok('(9) the household\'s receipt pairs every line by name — not by the order ticked', JSON.stringify(r.pair)==='[3,2,1,0]' && r.how.every(h=>h==='name'), JSON.stringify(r));
    ok('(9) names match word by word, forgiving a plural and a letter or two', T.nameScore('remedy kombucha','Kambucha pomegranate')>0 && T.nameScore('heirloom yellow tomatoes','tomatoes big')>0 && T.nameScore('free range eggs','eggs')===1 && T.nameScore('olive oil','rice')===0, '');
    const r2=T.reconcile([L('X1','zzz'),L('MILK 2L','milk')],[{name:'bread'},{name:'milk'}],(a,b,l)=>Math.max(T.nameScore(a,b),T.nameScore(l.raw,b)));
    ok('(9) …and a name match is taken before the tick order is used for the rest', JSON.stringify(r2.pair)==='[0,1]' && JSON.stringify(r2.how)==='["order","name"]', JSON.stringify(r2));
    ok('(9) the app matches on both the read name and the printed line', /nameScore\(a, b\), nameScore\(L && L\.raw, b\)/.test(fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8')), '');

    /* ── 1 Photo stays Photo ─────────────────────────────────────────── */
    const TWO=[{ id:'c1', name:'Flybuys', chain:'', num:'6008943218616910', photo:TINY }, { id:'w1', name:'Everyday Rewards', chain:'', num:'9355123456789', photo:TINY }];
    await mk({ store:'dand', extra:cardsLS(TWO) });
    await tap('#shopMenu'); await tap('#smCard');
    await tap('[data-card-view="photo"]');
    await swipe(-120); await page.waitForTimeout(300);
    const v1 = await page.evaluate(()=>({ t:document.querySelector('#cardTitle').textContent, img:!!document.querySelector('#cardSwipe img'), bar:!!document.querySelector('#cardSwipe .bc128') }));
    ok('(1) on Photo, a swipe to the next card stays on its photo', /Everyday Rewards/.test(v1.t) && v1.img && !v1.bar, JSON.stringify(v1));
    await tap('#cardClose'); await tap('#shopMenu'); await tap('#smCard');
    ok('(1) …and the next time the card is shown, still the photo', await page.evaluate(()=>!!document.querySelector('#cardSwipe img')) && (await ls('ml_cardview'))==='photo', '');
    ok('(6) at a Coles the Flybuys card comes first, though it was saved without a shop', /Flybuys/.test(await title()), await title());

    /* ── 7 add a card, one swipe past the last ───────────────────────── */
    await swipe(-120); await page.waitForTimeout(250); await swipe(-120); await page.waitForTimeout(300);
    const ap = await page.evaluate(()=>({ t:document.querySelector('#cardTitle').textContent, scan:!!document.querySelector('#cardScanGo'), photo:!!document.querySelector('#cardPhotoGo'), type:!!document.querySelector('#cardTypeGo'), plus:!!document.querySelector('.carddot-add.on') }));
    ok('(7) one swipe past the last card is "Add a card": scan, choose a photo, or type it in', ap.t==='Add a card' && ap.scan && ap.photo && ap.type && ap.plus, JSON.stringify(ap));
    await shot('addpanel');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#cardPhotoGo').click()]);
    await fc.setFiles({ name:'card.png', mimeType:'image/png', buffer:Buffer.from(TINY.split(',')[1],'base64') });
    await page.waitForTimeout(250);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#cardSheet .rcbusy[role=status]'); return s ? s.textContent : ''; });
    ok('(7) …reading the photo shows at once that it is working', /Reading the card|Preparing/.test(busy), busy);
    await page.waitForTimeout(900);
    const cf = await page.evaluate(()=>({ t:(document.querySelector('#ceTitle')||{}).textContent, n:(document.querySelector('#ceName')||{}).value, num:(document.querySelector('#ceNum')||{}).value, chips:document.querySelectorAll('[data-ce-chain]').length }));
    ok('(7) …then the card form opens with the name and number read, to check', cf.t==='Check the card' && cf.n==='Flybuys' && cf.num==='6008943218616910', JSON.stringify(cf));
    ok('(5) the form does not ask which shop', cf.chips===0, String(cf.chips));
    await tap('#ceCancel');

    CARDREPLY = { status:500, body:{ error:'x', code:'not_configured' }, delay:0 };
    await mk({ store:'home' });
    await tap('#shopMenu');
    ok('(7) with no card saved, the Shop menu offers to add one', /Add a membership card/.test(await page.evaluate(()=>document.querySelector('#smCard').textContent)), '');
    await tap('#smCard');
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#cardPhotoGo').click()]);
    await fc2.setFiles({ name:'card.png', mimeType:'image/png', buffer:Buffer.from(TINY.split(',')[1],'base64') });
    await page.waitForTimeout(900);
    const er = await page.evaluate(()=>({ e:(document.querySelector('#cardSheet .rpterr')||{}).textContent||'', busy:!!document.querySelector('#cardSheet .rcbusy') }));
    ok('(7) a reader that is not set up says so, in words, and the wait ends', /isn't set up/.test(er.e) && !er.busy, JSON.stringify(er));
    await tap('#cardTypeGo');
    await page.locator('#ceName').fill('Everyday Rewards'); await page.locator('#ceNum').fill('9355123456789'); await tap('#ceSave');
    const saved = JSON.parse(await ls('ml_cards')||'[]');
    ok('(5) "Type it in" saves a card, its shop worked out from the name', saved.length===1 && saved[0].chain==='woolworths', JSON.stringify(saved));

    /* ── 6 never at home ─────────────────────────────────────────────── */
    CARDREPLY = { status:200, body:{ name:'Flybuys', number:'6008943218616910' }, delay:500 };
    const FB=[{ id:'c1', name:'Flybuys', chain:'', num:'6008943218616910', photo:'' }];
    await mk({ store:'home', extra:cardsLS(FB) });
    await pill('1').click(); await page.waitForTimeout(250); await tap('#sweepBtn');
    ok('(6) after a shop at home, no card comes up', await page.evaluate(()=>!document.querySelector('#cardNudge .bc128')), '');
    await mk({ store:'dand', extra:cardsLS(FB) });
    await pill('1').click(); await page.waitForTimeout(250); await tap('#sweepBtn');
    ok('(3) after a shop at a Coles, the Flybuys card comes up by itself', await page.evaluate(()=>!!document.querySelector('#cardNudge .bc128') && /Flybuys/.test(document.querySelector('#cardNudge').textContent)), '');

    /* ── 2 several shops ─────────────────────────────────────────────── */
    const W=[Object.assign(it('w1','Fish sauce','asian'),{ where:'asri,trade' }), it('w2','Milk','fresh')];
    for(const [st, here] of [['asri',true],['trade',true],['dand',false]]){
      await mk({ store:st, items:W });
      const s = await page.evaluate(()=>({ else:!!document.querySelector('.elsewhere'), tile:!![...document.querySelectorAll('#zoomer .pill[data-pill="w1"]')].find(p=>p.offsetParent && !p.closest('.elsewhere')) }));
      ok(`(2) an item for Asian Richmond or Coles Traders is ${here?'on the list':'under "For other shops"'} at ${st}`, here ? (s.tile && !s.else) : s.else, JSON.stringify(s));
    }
    await mk({ store:'home', items:W });
    const nl = await page.evaluate(()=>(document.querySelector('#zoomer .pill[data-pill="w1"] .pnote')||{}).textContent||'');
    ok('(2) …and its tile names both shops', /Asian Richmond or Coles Traders/.test(nl), nl);
    const p2 = pill('w2'); await p2.dispatchEvent('pointerdown'); await page.waitForTimeout(650); await p2.dispatchEvent('pointerup'); await page.waitForTimeout(500);
    await tap('#ewHead'); await tap('[data-ew="dand"]'); await tap('[data-ew="rich"]');
    const ew = await page.evaluate(()=>({ on:[...document.querySelectorAll('[data-ew][aria-pressed="true"]')].map(b=>b.dataset.ew), v:(document.querySelector('#ewHead .editsec-v')||{}).textContent||'' }));
    ok('(2) Edit item ticks several shops', JSON.stringify(ew.on)==='["dand","rich"]' && /Coles Dandenong, Coles Vic Garden/.test(ew.v), JSON.stringify(ew));
    await tap('#saveBtn');
    const wh = await page.evaluate(()=>(JSON.parse(localStorage.getItem('ml_cache_v101')).items.find(i=>i.id==='w2')||{}).where);
    ok('(2) …and saves them', wh==='dand,rich', wh);

    /* ── 8 the aisle badge ───────────────────────────────────────────── */
    await mk({ store:'dand', items:[it('a1','Bread','fresh')], extra:'localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_sorts", JSON.stringify({shop:"location"}));' });
    const bd = await page.evaluate(()=>{ const b=document.querySelector('#zoomer .paisle'); if(!b) return null; const cs=getComputedStyle(b); return { t:b.textContent, bg:cs.backgroundColor, h:Math.round(b.getBoundingClientRect().height) }; });
    ok('(8) the aisle number is a paper badge reading "A1"', bd && bd.t==='A1' && bd.bg!=='rgba(0, 0, 0, 0)' && bd.h>=18, JSON.stringify(bd));
    await shot('aisle');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
