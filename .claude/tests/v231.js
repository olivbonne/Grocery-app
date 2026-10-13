/* v2.31 — at the till: a membership card on screen (household item 5) and the receipt matched with the cart (item 6).

   WHAT THESE CHECKS HAVE TO PROVE:
   - the barcode is real Code 128: its bars equal an independent encoder's (python-barcode 0.16.1, recorded below) for a
     16-digit Flybuys-style number, a 13-digit one (odd: set C then B) and text; and what cannot be encoded gives nothing;
   - the pairing (js/till.js reconcile): by name first, then in tick order between the named lines, never crossing; what
     was ticked and is missing from the receipt is reported;
   - a card is added in Settings › Smart features (number required unless there is a photo), kept on this phone only
     (ml_cards — in both appearance-slot exclusion lists), and comes up by itself when a shop is finished at a store of
     its chain — not at another chain's store — and from the Shop menu;
   - finishing a shop keeps the cart in tick order (ml_lastcart); a receipt read afterwards is paired with it: lines
     renamed to the cart's names, guesses marked, the missing listed; changing a line's pick moves the item; saving
     records prices under the cart's names and forgets the cart.

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
let RECEIPT = { store:'Coles Dandenong', date:'2026-10-12', total:20,
  items:[{raw:'SALAD ROCKET 120G',name:'salad rocket',qty:1,weight:'120g',price:3,category:'vegetable'},
         {raw:'HP YOG 1KG',name:'hp yog',qty:1,weight:'1kg',price:6,category:'fresh'},
         {raw:'THKN CRM 300',name:'thkn crm',qty:1,weight:'',price:4,category:'fresh'},
         {raw:'LINGUINE 500G',name:'linguine',qty:1,weight:'500g',price:2,category:'bulk'}], discounts:[] };
const REF = { // python-barcode 0.16.1, Code128(t).build()[0]
  '6008943218616910':'110100111001110111101010001100100100010111101100011011011001110010110010000101011001000011001000100100101100001100011101011',
  '9355123456789':'110100111001010001111011101000110101100111001000101100011100010110110000101001011110111011100101100100001001101100011101011',
  'Hello-42':'110100100001100010100010110010000110010100001100101000010001111010100110111001100100111011001110010111001001101100011101011' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}");
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

  const CARD = { id:'c1', name:'Flybuys', chain:'coles', num:'6008943218616910', photo:'' };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };

  try{
    /* ── the module, in Node ─────────────────────────────────────────── */
    const { pathToFileURL } = require('url');
    const T = await import(pathToFileURL(path.join(ROOT,'js','till.js')).href);
    for(const [t,m] of Object.entries(REF)) ok(`Code 128 for "${t}" is bar for bar what an independent encoder makes`, T.code128Modules(t)===m, T.code128Modules(t).length+' vs '+m.length);
    ok('…a number with characters a barcode cannot carry gives no barcode', T.code128SVG('12€4')==='' && T.code128SVG('')==='', '');
    ok('…the SVG keeps a quiet zone each side and draws black on white', /viewBox="0 0 143 /.test(T.code128SVG('6008943218616910')) && /fill="#fff"/.test(T.code128SVG('6008943218616910')), T.code128SVG('6008943218616910').slice(0,90));
    const same=(a,b)=>a.toLowerCase().includes(b.toLowerCase())||b.toLowerCase().includes(a.toLowerCase());
    const L=n=>({name:n,keep:true}), cart=['Salad rocket','Yogurt','Cream','Linguine','Honey','Tofu'].map(n=>({name:n}));
    let r = T.reconcile([L('salad rocket 120g'),L('YOG HP'),L('THKN CRM'),L('linguine'),L('HNY'),L('TF'),L('CHOC')], cart, same);
    ok('pairing: named lines by name, the others in tick order between them, an extra line left alone',
       JSON.stringify(r.pair)==='[0,1,2,3,4,5,null]' && JSON.stringify(r.how)==='["name","order","order","name","order","order",""]' && r.missing.length===0, JSON.stringify(r));
    r = T.reconcile([L('honey'),L('X'),L('salad rocket'),{name:'off',keep:false}], cart, same);
    ok('…a named pair that runs backwards is kept but never crosses the order pairing; a line left out is never paired; the rest are missing',
       JSON.stringify(r.pair)==='[4,5,0,null]' && JSON.stringify(r.missing)==='[1,2,3]', JSON.stringify(r));

    /* ── a card in Settings ──────────────────────────────────────────── */
    await mk({ store:'dand' });
    await tap('#setNav');
    await tap('[data-card-add]');
    await tap('#ceSave');
    ok('adding a card: saving with nothing asks for a name', /name/.test(await page.evaluate(()=>(document.querySelector('#ceSheet .rpterr')||{}).textContent||'')), '');
    await tap('[data-ce-chain="coles"]');
    ok('…picking Coles names it Flybuys', await page.evaluate(()=>document.querySelector('#ceName').value)==='Flybuys', '');
    await tap('#ceSave');
    ok('…a card with no number and no photo is refused, saying why', /number, or a photo/.test(await page.evaluate(()=>(document.querySelector('#ceSheet .rpterr')||{}).textContent||'')), '');
    await page.locator('#ceNum').fill('6008 9432 1861 6910');
    await tap('#ceSave');
    const saved = JSON.parse(await ls('ml_cards')||'[]');
    ok('…with its number it is saved on this phone (spaces dropped)', saved.length===1 && saved[0].num==='6008943218616910' && saved[0].chain==='coles', JSON.stringify(saved));
    ok('…and listed under Smart features › Cards at the till', await page.evaluate(()=>{ const h=[...document.querySelectorAll('.optsect')].find(x=>x.dataset.sect==='Smart features'), b=h&&h.nextElementSibling;
      return !!(b && [...b.querySelectorAll('.optsub')].some(e=>/Cards at the till/.test(e.textContent)) && b.querySelector('[data-card-open]')); }), '');
    await tap('[data-card-open]');
    const face = await page.evaluate(()=>({ svg:!!document.querySelector('#cardSheet .cardface svg.bc128'), num:(document.querySelector('#cardSheet .cardnum')||{}).textContent, bg:getComputedStyle(document.querySelector('.cardface')).backgroundColor }));
    ok('…Show puts the barcode on white with the number under it', face.svg && face.num==='6008 9432 1861 6910' && face.bg==='rgb(255, 255, 255)', JSON.stringify(face));
    await shot('card');
    await tap('#cardClose');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('ml_cards and ml_lastcart are in both appearance-slot exclusion lists', (src.match(/ml_cards\$\|ml_lastcart\$/g)||[]).length===2, '');
    ok('privacy page says the cards and the last cart stay on this phone', /membership cards you add/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');

    /* ── the card at the till ────────────────────────────────────────── */
    await mk({ store:'dand', extra:`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify([CARD]))});` });
    for(const id of ['3','1','4','7']){ await pill(id).click(); await page.waitForTimeout(250); }
    await tap('#sweepBtn');
    ok('finishing the shop at a Coles brings up the Flybuys card', await page.evaluate(()=>!!document.querySelector('#cardSheet .bc128') && /Flybuys/.test(document.querySelector('#cardTitle').textContent)), '');
    await shot('till');
    const lc = JSON.parse(await ls('ml_lastcart')||'null');
    ok('…and the cart is kept on this phone in the order it was ticked', lc && lc.code==='v101' && JSON.stringify(lc.items.map(i=>i.name))==='["Frozen raspberries","Salad rocket","Cream","Linguine"]', JSON.stringify(lc));
    await tap('#cardClose');
    await tap('#shopMenu');
    ok('the Shop menu has Show my card, first', await page.evaluate(()=>(document.querySelector('.smenu .smitem')||{}).id)==='smCard', '');
    await tap('#smCard');
    ok('…and it shows the card', await page.evaluate(()=>!!document.querySelector('#cardSheet')), '');
    await tap('#cardClose');

    await mk({ store:'home', extra:`localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify([CARD]))});` });
    await pill('1').click(); await page.waitForTimeout(250);
    await tap('#sweepBtn');
    ok('away from a Coles, finishing does not bring the card up', await page.evaluate(()=>!document.querySelector('#cardSheet')), '');

    /* ── the receipt, matched with the cart ──────────────────────────── */
    await mk({ store:'dand' });
    for(const id of ['1','2','5','7']){ await pill(id).click(); await page.waitForTimeout(250); }   // rocket, yogurt, nexba, linguine
    await tap('#sweepBtn');
    await tap('#setNav');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
    const rs = () => page.evaluate(()=>({ sum:(document.querySelector('.rccartsum')||{}).textContent||'',
      rows:[...document.querySelectorAll('.rcrow')].map(r=>({ name:r.querySelector('.rcname').value, pick:(r.querySelector('[data-rccart]')||{}).value, guess:!!r.querySelector('.rccart.guess') })) }));
    let s = await rs();
    ok('the receipt is paired with the cart: "found" count and the guessed ones flagged (every ticked item placed — the missing case is below)',
       /4 of 4 ticked items found on the receipt/.test(s.sum) && /2 matched by the order/.test(s.sum) && !/Ticked but not/.test(s.sum), s.sum.replace(/\s+/g,' '));
    ok('…lines take the cart\'s names: rocket and linguine by name, the yogurt by order; the cream (not in the cart) is a guess too',
       JSON.stringify(s.rows.map(r=>r.name))==='["Salad rocket","High protein yogurt","Nexba lemon squash","Linguine"]' && s.rows[1].guess && s.rows[2].guess && !s.rows[0].guess, JSON.stringify(s.rows));
    await shot('receipt');
    await page.locator('[data-rccart="2"]').selectOption(''); await page.waitForTimeout(400);
    s = await rs();
    ok('…choosing "Not from the cart" gives the line back its read name, and the item is listed as ticked but not on the receipt', s.rows[2].name==='thkn crm' && s.rows[2].pick==='' && /3 of 4/.test(s.sum) && /Ticked but not on the receipt: Nexba lemon squash/.test(s.sum), JSON.stringify({r:s.rows[2], sum:s.sum.slice(0,120)}));
    await page.locator('[data-rccart="2"]').selectOption('1'); await page.waitForTimeout(400);
    s = await rs();
    ok('…picking an item another line had moves it: that line goes back to its own name', s.rows[2].name==='High protein yogurt' && s.rows[1].name==='hp yog' && s.rows[1].pick==='' && !s.rows[2].guess, JSON.stringify(s.rows));
    await tap('#rcSaveBtn');
    const pr = await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('ml_cache_v101')).prices||{}));
    ok('saving records the prices under the list\'s own names', pr.includes('salad rocket') && pr.includes('high protein yogurt') && pr.includes('linguine'), JSON.stringify(pr));
    ok('…and forgets the cart', (await ls('ml_lastcart'))===null, '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
