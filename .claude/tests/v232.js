/* v2.32 — the household's list (their items 2, 3, 4, 5, 6, 7, 10, 11, 12, 13).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (2) an explanation under a setting is folded behind an (i) beside the setting's name, opens and closes in place
     (no redraw), Smart add and Sort now have one, and the sort button says "Category" (it never sorted by aisle);
   - (3) the sheets where a name is typed (new list, occasion) follow the keyboard;
   - (4) removing the list that is open opens the first one left (the name at the top changes), and Undo brings it back;
   - (5) the Occasions sheet says what an occasion is and can save one itself;
   - (6) Report a problem offers three kinds — no "complaint";
   - (7) a receipt's suburb is kept with each price, and Price diagnostics shows the shop and the suburb;
   - (10) the edit menus say "Add to Regulars" / "Edit Regular", not "Buy again";
   - (11) the 10% sheet's two buttons are one height;
   - (12) a "+" left out of place is put back on the next touch and logged, and the log can be sent with a report;
   - (13) after Save to Regulars the card sits above "Got the receipt?" — or, with no card at a Coles, an offer to add
     one, which then shows the card; "don't ask again" is kept; there is no pop-up sheet any more.

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
let RECEIPT = { store:'Coles Dandenong', place:'Dandenong VIC', date:'2026-10-12', total:7.5,
  items:[{raw:'HONEY 500G',name:'honey',qty:1,weight:'500g',price:7.5,category:'bulk'}], discounts:[] };
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

  const CARD = { id:'c1', name:'Flybuys', chain:'coles', num:'6008943218616910', photo:'' };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const T0 = Date.UTC(2026,9,1);
  const PRICES = { honey:[{p:7.5,s:'dand',sn:'Coles Dandenong',l:'Dandenong VIC',d:'2026-10-12',q:1,w:'500g',t:T0}] };

  try{
    /* ── (2) the (i)s ─────────────────────────────────────────────────── */
    await mk({ store:'dand' });
    await tap('#setNav');
    const ib = await page.evaluate(()=>{ const rowOf=t=>[...document.querySelectorAll('.optpage .optrow')].find(r=>{ const l=r.querySelector(':scope > .optlabel'); return l && l.firstChild && l.firstChild.textContent.trim()===t; });
      const sa=rowOf('Smart add'), so=rowOf('Sort');
      return { smart:!!(sa && sa.querySelector('.infobtn')), sort:!!(so && so.querySelector('.infobtn')), n:document.querySelectorAll('.optpage .infobtn').length,
        open:[...document.querySelectorAll('.optpage .opthint')].filter(h=>h.offsetParent!==null).map(h=>h.textContent.slice(0,40)),
        cat:[...document.querySelectorAll('[data-opt-sort="cat"]')].map(b=>b.textContent) }; });
    ok('(2) Smart add and Sort each have an (i), and the explanations start folded', ib.smart && ib.sort && ib.n>=4 && ib.open.length===0, JSON.stringify(ib));
    ok('(2) the sort button says Category', JSON.stringify(ib.cat)==='["Category"]', JSON.stringify(ib.cat));
    await page.evaluate(()=>{ document.querySelector('.optpage').dataset.probe='1'; });
    const sm = page.locator('.optpage .optrow', { has: page.locator('.optlabel', { hasText:'Smart add' }) }).locator('.infobtn').first();
    await sm.click(); await page.waitForTimeout(250);
    const opened = await page.evaluate(()=>({ txt:[...document.querySelectorAll('.optpage .opthint')].filter(h=>h.offsetParent!==null).map(h=>h.textContent).join('|'), same:document.querySelector('.optpage').dataset.probe==='1' }));
    ok('(2) tapping it opens the explanation in place, without redrawing the page', /add bar/.test(opened.txt) && opened.same, JSON.stringify(opened).slice(0,200));
    await shot('info');
    await sm.click(); await page.waitForTimeout(250);
    ok('(2) …and a second tap folds it again', await page.evaluate(()=>[...document.querySelectorAll('.optpage .opthint')].every(h=>h.offsetParent===null)), '');

    /* ── (6) three kinds ─────────────────────────────────────────────── */
    await tap('#cartNav, #shopNav, #navShop');
    await tap('#shopMenu'); await tap('#smReport');
    const kinds = await page.evaluate(()=>[...document.querySelectorAll('[data-rptkind]')].map(b=>b.dataset.rptkind));
    ok('(6) Report a problem offers three kinds, none of them "complaint"', JSON.stringify(kinds)==='["broken","looks","idea"]', JSON.stringify(kinds));
    await tap('#rptCancel');

    /* ── (5) occasions ───────────────────────────────────────────────── */
    await tap('#shopMenu');
    ok('(5) the menu item says what it is', /Occasions/.test(await page.evaluate(()=>document.querySelector('#smOcc').textContent)), '');
    await tap('#smOcc');
    const oc = await page.evaluate(()=>({ intro:(document.querySelector('#occSheet .hint')||{}).textContent||'', save:!!document.querySelector('#occToSave'), kb:document.querySelector('#occBg').classList.contains('kbpin') }));
    ok('(5) with none saved, the sheet explains occasions and offers to save one', /set of things you buy together/.test(oc.intro) && oc.save, JSON.stringify(oc));
    ok('(3) the occasion sheet follows the keyboard', oc.kb, '');
    await tap('#occToSave');
    await page.locator('#occName').fill('BBQ'); await tap('#occSaveGo');
    await tap('#shopMenu'); await tap('#smOcc');
    ok('(5) …saving from there puts it in the list of occasions, ready to Add', await page.evaluate(()=>[...document.querySelectorAll('.occ-n')].some(e=>/BBQ/.test(e.textContent)) && !!document.querySelector('[data-occadd]')), '');
    await tap('#occClose');

    /* ── (10) Add to Regulars ────────────────────────────────────────── */
    await tap('#shopAddFab');
    await page.locator('#mainInput').fill('Zzyzx tea'); await page.waitForTimeout(400);
    await page.locator('[data-add-typed]').first().click(); await page.waitForTimeout(600);
    ok('(10) the edit panel says "Add to Regulars"', (await page.evaluate(()=>(document.querySelector('[data-ae-again]')||{}).textContent||''))==='Add to Regulars', '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('(10) …and the Regular\'s own editor is "Edit Regular", its button "Add to Regulars"', /isItem\?"Edit item":"Edit Regular"/.test(src) && /secLabel = isItem \? "Add to Regulars"/.test(src), '');

    /* ── (4) removing the open list ──────────────────────────────────── */
    await mk({ extra:`localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"},{code:"v202",name:"Party"}]));
      localStorage.setItem("ml_cache_v202", JSON.stringify({ items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Party", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));` });
    await tap('#listSwitch');
    ok('(3) the new-list sheet follows the keyboard', /kbpin" id="newListBg"/.test(src), '');
    const li = page.locator('[data-list="v101"]').first();
    await li.dispatchEvent('pointerdown'); await page.waitForTimeout(700); await li.dispatchEvent('pointerup'); await page.waitForTimeout(500);
    await tap('#laDelete');
    const after = await page.evaluate(()=>({ title:(document.querySelector('#listSwitch')||{}).textContent||'', last:localStorage.getItem('ml_lastlist'), lists:JSON.parse(localStorage.getItem('ml_lists')).map(l=>l.code) }));
    ok('(4) removing the list that is open opens the first one left — its name is at the top', /Party/.test(after.title) && after.last==='v202' && JSON.stringify(after.lists)==='["v202"]', JSON.stringify(after));
    await tap('#undoBtn');
    const back = await page.evaluate(()=>({ title:(document.querySelector('#listSwitch')||{}).textContent||'', lists:JSON.parse(localStorage.getItem('ml_lists')).map(l=>l.code) }));
    ok('(4) …Undo brings it back and opens it again', /Groceries/.test(back.title) && back.lists.includes('v101'), JSON.stringify(back));

    /* ── (11) the 10% sheet ──────────────────────────────────────────── */
    await mk({ doc:{ memb:{ coles:{ on:true } }, prices:PRICES } });
    await tap('#setNav');
    await tap('[data-memb-list="coles"]');
    const hb = await page.evaluate(()=>{ const a=document.querySelector('#tenAdd'), c=document.querySelector('#tenClose'); return a && c ? [Math.round(a.getBoundingClientRect().height), Math.round(c.getBoundingClientRect().height), Math.round(a.getBoundingClientRect().top), Math.round(c.getBoundingClientRect().top)] : null; });
    ok('(11) the 10% sheet\'s Add and Close buttons are the same height, side by side', hb && Math.abs(hb[0]-hb[1])<=1 && hb[2]===hb[3], JSON.stringify(hb));
    await tap('#tenClose');

    /* ── (7) price diagnostics ───────────────────────────────────────── */
    await tap('#optPriceDiag');
    const pd = await page.evaluate(()=>({ s:(document.querySelector('.pdrow .pd-s')||{}).textContent||'' }));
    await page.locator('.pdrow summary').first().click(); await page.waitForTimeout(250);
    const pl = await page.evaluate(()=>(document.querySelector('.pdrec .pd-l')||{}).textContent||'');
    ok('(7) Price diagnostics shows the latest price with its shop, and each record its suburb', /\$7\.50 · Coles Dandenong/.test(pd.s) && pl==='Dandenong VIC', JSON.stringify({pd, pl}));
    await tap('#pdClose');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
    await tap('#rcSaveBtn');
    const rec = await page.evaluate(()=>{ const h=(JSON.parse(localStorage.getItem('ml_cache_v101')).prices||{}).honey||[]; return h[h.length-1]; });
    ok('(7) a receipt read now keeps the suburb with each price', rec && rec.l==='Dandenong VIC' && rec.d==='2026-10-12', JSON.stringify(rec));

    /* ── (12) the "+" put back, and logged ───────────────────────────── */
    await mk({ store:'home' });
    await page.evaluate(()=>{ document.getElementById('shopAddFabWrap').style.bottom='420px'; });
    await page.evaluate(()=>document.dispatchEvent(new TouchEvent('touchstart', { bubbles:true })));
    await page.waitForTimeout(300);
    const st = await page.evaluate(()=>{ const f=document.getElementById('shopAddFabWrap').getBoundingClientRect(), b=document.getElementById('bottomnav').getBoundingClientRect();
      return { gap:Math.round(b.top-f.bottom), log:JSON.parse(localStorage.getItem('ml_stucklog')||'[]') }; });
    ok('(12) a "+" out of place is put back on the next touch', st.gap>=0 && st.gap<=40, JSON.stringify({gap:st.gap}));
    ok('(12) …and written down, with how far out it was and what led up to it', st.log.length===1 && st.log[0].gap>300 && Array.isArray(st.log[0].trail) && st.log[0].src==='check', JSON.stringify(st.log[0]).slice(0,240));
    await tap('#setNav');
    await tap('#optStuck');
    ok('(12) Settings › Help › Screen log lists it', await page.evaluate(()=>document.querySelectorAll('#stSheet .strow').length===1), '');
    await tap('#stSend');
    const rt = await page.evaluate(()=>(document.querySelector('#rptText')||{}).value||'');
    ok('(12) …and "Report it" opens Report a problem with the log in it', /The \+ got stuck/.test(rt) && /"gap":/.test(rt), rt.slice(0,120));
    await tap('#rptCancel');

    /* ── (13) the card above "Got the receipt?" ──────────────────────── */
    await mk({ store:'dand' });
    await pill('1').click(); await page.waitForTimeout(250);
    await tap('#sweepBtn');
    const n1 = await page.evaluate(()=>{ const c=document.querySelector('#cardNudge'), r=document.querySelector('#rcNudge');
      return { c:c&&c.textContent.replace(/\s+/g,' ').trim().slice(0,60), above: !!(c && r && (c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) && c.getBoundingClientRect().bottom <= r.getBoundingClientRect().top), sheet:!!document.querySelector('#cardSheet') }; });
    ok('(13) at a Coles with no card saved, the top of the page offers to add one, above "Got the receipt?"', /Got a Flybuys card\?/.test(n1.c||'') && n1.above && !n1.sheet, JSON.stringify(n1));
    await shot('offer');
    await tap('#cardNudgeAdd');
    /* SUPERSEDED by v2.35: the form has no shop to pick — it is worked out from the name. Still protects: "Add the card" at a Coles opens the form named Flybuys. */
    ok('(13) …"Add the card" opens the card form, already for Coles, named Flybuys', await page.evaluate(()=>document.querySelector('#ceName').value==='Flybuys'), '');
    await page.locator('#ceNum').fill('6008943218616910'); await tap('#ceSave');
    const n2 = await page.evaluate(()=>({ bc:!!document.querySelector('#cardNudge .bc128'), num:(document.querySelector('#cardNudge .cardnum')||{}).textContent }));
    ok('(13) …and once saved, the card itself is there to scan', n2.bc && n2.num==='6008 9432 1861 6910', JSON.stringify(n2));
    await shot('card');
    await tap('#cardNudgeBig');
    ok('(13) tapping it shows it bigger', await page.evaluate(()=>!!document.querySelector('#cardSheet .bc128')), '');
    await tap('#cardClose'); await tap('#cardNudgeDone');
    ok('(13) Done puts it away', await page.evaluate(()=>!document.querySelector('#cardNudge')), '');

    await mk({ store:'dand' });
    await pill('1').click(); await page.waitForTimeout(250); await tap('#sweepBtn');
    await tap('#cardNudgeNever');
    await pill('2').click(); await page.waitForTimeout(250); await tap('#sweepBtn');
    ok('(13) "No card — don\'t ask again" is kept: the next shop does not ask', (await ls('ml_cardask'))==='0' && await page.evaluate(()=>!document.querySelector('#cardNudge')), '');
    ok('ml_cardnudge, ml_cardask and ml_stucklog are in both appearance-slot exclusion lists', (src.match(/ml_cardnudge\$\|ml_cardask\$\|ml_stucklog\$/g)||[]).length===2, '');
    ok('privacy page names the suburb and the screen log', /the shop and its suburb/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')) && /screen got stuck/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
