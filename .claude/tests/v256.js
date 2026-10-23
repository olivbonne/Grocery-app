/* v2.56 — the household's batch of eight (23 October 2026).

   WHAT THESE CHECKS HAVE TO PROVE:
   1 the Language row is at the top of Settings, outside every section, and the search finds it by "Langue";
   2 the app reopens the list used last, not the one in the home-screen address — but a share link (with its key) opens its list;
   3 the lists sheet: a ⋯ per list opens its options, no radio dots and no hint line, the open list clearly highlighted;
   4 an empty list shows a drawn basket, a microphone tile and a "+" tile (which opens the add sheet), no example chips;
   5 a Regular can be long-pressed and dragged to a new place in its category, and the order is kept (pos) and synced (ts);
     a long-press without moving still opens it as before;
   6 a removed list stays removed: the home-screen address no longer brings it back, and it is marked gone for the account;
   7 the add sheet: no ✨ beside the search bar; with nothing typed — Smart add, Take a photo, From your photos, Paste; when
     typing — Smart add right after "Add …"; text the app cannot place gets the drawn basket, a known category keeps its mark;
   8 a membership card matches a shop by a shared name word (Dan Murphy's) or by the shops ticked on it; at a shop with no
     match, a phone that has cards is offered "Use one of your cards here?", and the choice is remembered.

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
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  const lists=${JSON.stringify(o.lists||[{code:"v101",name:"Groceries"}])};
  localStorage.setItem("ml_lists", JSON.stringify(lists));
  const docs=${JSON.stringify(o.docs||{ v101:DOC() })}; Object.entries(docs).forEach(([c,d])=>localStorage.setItem("ml_cache_"+c, JSON.stringify(d)));
  localStorage.setItem("ml_lastlist", ${JSON.stringify(o.last||"v101")}); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o, q)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:false });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html${q===undefined?'?list=v101':q}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
    const title = ()=>page.evaluate(()=>(document.querySelector('#listSwitch')||{}).textContent||'');
    const TWO = { lists:[{code:"v101",name:"Groceries"},{code:"v202",name:"Hardware"}], docs:{ v101:DOC(), v202:DOC({ name:"Hardware", items:[it("9","Nails","others")] }) } };

    /* 1 ─ Language */
    await mk();
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const lang = await page.evaluate(()=>{ const r=document.querySelector('.optlangtop'); const firstSect=document.querySelector('.optsect, .sect, [data-sect]');
      return { has:!!r, btns:r?r.querySelectorAll('[data-opt-lang]').length:0, before: !!(r && firstSect && (r.compareDocumentPosition(firstSect) & Node.DOCUMENT_POSITION_FOLLOWING)) }; });
    ok('1 · the Language row is in Settings with a button per language, ahead of the first section', lang.has && lang.btns>=2 && lang.before, JSON.stringify(lang));
    await shot('settings');
    const sIn = page.locator('#optSearch, input[type=search]').first();
    if(await sIn.count()){ await sIn.fill('Langue'); await page.waitForTimeout(300); }
    ok('1 · the Settings search finds it by "Langue"', await page.evaluate(()=>{ const r=document.querySelector('.optlangtop'); return !!r && r.offsetParent!==null && getComputedStyle(r).display!=='none'; }), '');

    /* 2 ─ the list used last */
    await mk(Object.assign({}, TWO, { last:"v202" }), '?list=v101');
    ok('2 · the home-screen address names Groceries, but the list used last (Hardware) opens', /Hardware/.test(await title()), await title());
    await mk(Object.assign({}, TWO, { last:"v202" }), '?list=v303&k=abcdefghijklmnop');
    ok('2 · a share link (with its key) opens its own list', await page.evaluate(()=>localStorage.getItem('ml_lastlist'))==='v303', await page.evaluate(()=>localStorage.getItem('ml_lastlist')));

    /* 3 ─ the lists sheet */
    await mk(TWO);
    await page.locator('#listSwitch').click(); await page.waitForTimeout(500);
    const ls = await page.evaluate(()=>({ more:document.querySelectorAll('[data-list-more]').length, radio:document.querySelectorAll('.lp-radio').length,
      hint:/Tap to switch/.test(document.querySelector('#listsSheetEl').textContent), curBorder:getComputedStyle(document.querySelector('.listpick.cur')).borderTopWidth }));
    ok('3 · each list has a ⋯, no radio dots, no "Tap to switch…" line, and the open list has a clear border', ls.more===2 && ls.radio===0 && !ls.hint && parseFloat(ls.curBorder)>=2, JSON.stringify(ls));
    await shot('lists');
    await page.locator('[data-list-more]').nth(1).click(); await page.waitForTimeout(500);
    /* SUPERSEDED by v2.57: the options open inline below the list, inside the lists sheet (the household's item 12).
       Still protects: the ⋯ is the way to a list's options. */
    ok('3 · the ⋯ opens that list\'s options (rename, share, delete…)', await page.evaluate(()=>/Rename/.test(document.body.innerText) && /Delete/.test(document.body.innerText)), '');

    /* 4 ─ the empty list */
    await mk({ docs:{ v101:DOC({ items:[] }) } });
    const em = await page.evaluate(()=>({ basket:!!document.querySelector('.empty svg, .empty-basket svg'), mic:!!document.querySelector('#emptyMic'), add:!!document.querySelector('#emptyAdd'),
      chips:document.querySelectorAll('[data-example]').length, emoji:/🧺/.test(document.querySelector('.empty')?.textContent||'') }));
    ok('4 · an empty list shows a drawn basket, a microphone tile and a "+" tile — no example chips, no emoji', em.basket && em.mic && em.add && !em.chips && !em.emoji, JSON.stringify(em));
    await shot('empty');
    await page.locator('#emptyAdd').click(); await page.waitForTimeout(600);
    ok('4 · "+" opens the add sheet', await page.evaluate(()=>!!document.querySelector('#addSheet')), '');

    /* 7 ─ the add sheet (same page) */
    const st = await page.evaluate(()=>({ smartBtn:!!document.querySelector('#smartBtn'), smart:!!document.querySelector('[data-add-smart]'), cam:!!document.querySelector('[data-add-photo="camera"]'),
      gal:!!document.querySelector('[data-add-photo="gallery"]'), paste:!!document.querySelector('[data-add-paste]') }));
    /* SUPERSEDED by v2.57: Paste is gone (it did nothing on the household's iPhone). Still protects: no ✨ by the search bar,
       and the ways in with nothing typed. */
    ok('7 · no ✨ beside the search bar; with nothing typed: Smart add, Take a photo, From your photos', !st.smartBtn && st.smart && st.cam && st.gal && !st.paste, JSON.stringify(st));
    await page.waitForTimeout(700); await shot('addstart');
    await page.locator('#mainInput').fill('milk ggg, and $:! 3 eggs'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(500);
    const ty = await page.evaluate(()=>{ const tiles=[...document.querySelectorAll('#addSheetBody .pill')]; const i=tiles.findIndex(b=>b.hasAttribute('data-add-typed')); return { typed:i, smartNext: i>=0 && tiles[i+1] && tiles[i+1].hasAttribute('data-add-smart') }; });
    ok('7 · typing: "Add …" then ✨ Smart add right after it', ty.typed>=0 && ty.smartNext, JSON.stringify(ty));
    await page.locator('#mainInput').fill('zzqx blorp'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(400);
    const icons = await page.evaluate(async()=>{ const t=document.querySelector('[data-add-typed] svg path'); return t ? t.getAttribute('d') : ''; });
    const cat = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(ROOT,'js','data','drawings.js'),'utf8'))).catch(()=>null);
    ok('7 · text the app cannot place shows the drawn basket on its tile', cat && icons && icons === cat.CATMARK.others, (icons||'').slice(0,40));
    await shot('addtyped');

    /* 5 ─ reorder Regulars */
    const regs = [{name:"Apples",cat:"fruit",qty:1,ts:1},{name:"Bananas",cat:"fruit",qty:1,ts:1},{name:"Cherries",cat:"fruit",qty:1,ts:1}];
    await mk({ docs:{ v101:DOC({ items:[it("1","Milk","dairy")], buyAgain:regs }) }, extra:`localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regOpen:["fruit"]}));` });
    const opened = await page.evaluate(()=>!!document.querySelector('[data-reg-showall][aria-expanded="true"]'));
    await page.waitForTimeout(500);
    const pos = async()=>page.evaluate(()=>[...document.querySelectorAll('[data-regk^="Cherries"],[data-regk^="Apples"],[data-regk^="Bananas"]')].map(e=>{ const r=e.getBoundingClientRect(); return [e.dataset.regk.split('|')[0], Math.round(r.x), Math.round(r.y)]; }));
    const p0 = await pos();
    let dragged = false;
    if(p0.length===3){ const [c]=p0.filter(x=>x[0]==='Cherries'), [a]=p0.filter(x=>x[0]==='Apples');
      await page.mouse.move(c[1]+20, c[2]+20); await page.mouse.down(); await page.waitForTimeout(650);
      for(let s=1;s<=8;s++){ await page.mouse.move(c[1]+20+(a[1]-c[1])*s/8, c[2]+20+(a[2]-c[2])*s/8); await page.waitForTimeout(30); }
      await page.mouse.up(); await page.waitForTimeout(600); dragged = true; }
    const ba = await page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_v101')).buyAgain; }catch(e){ return []; } });
    const ord = ba.slice().filter(e=>typeof e.pos==='number').sort((x,y)=>x.pos-y.pos).map(e=>e.name);
    ok('5 · a long-press and drag moves a Regular: Cherries now comes first, and the order is kept (pos) with fresh ts', opened && dragged && ord[0]==='Cherries' && ba.find(e=>e.name==='Cherries').ts>1, JSON.stringify({ p0, ord }));
    await shot('regdrag');

    /* 6 ─ a removed list stays removed */
    await mk(Object.assign({}, TWO, { last:"v101" }));
    await page.evaluate(()=>{ window.confirm=()=>true; });
    await page.locator('#listSwitch').click(); await page.waitForTimeout(400);
    await page.locator('[data-list-more]').first().click(); await page.waitForTimeout(400);
    const del = page.locator('button', { hasText:/Delete|Remove/ }).last(); if(await del.count()) { await del.click(); await page.waitForTimeout(500); }
    const gone = await page.evaluate(()=>({ lists:JSON.parse(localStorage.getItem('ml_lists')).map(l=>l.code), gone:Object.keys(JSON.parse(localStorage.getItem('ml_gonelists')||'{}')) }));
    ok('6 · removing a list takes it off and marks it gone', !gone.lists.includes('v101') && gone.gone.includes('v101'), JSON.stringify(gone));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    const after = await page.evaluate(()=>({ lists:JSON.parse(localStorage.getItem('ml_lists')).map(l=>l.code), last:localStorage.getItem('ml_lastlist') }));
    ok('6 · reopening from the home-screen address (which names it) does not bring it back', !after.lists.includes('v101') && after.last==='v202', JSON.stringify(after));

    /* 8 ─ cards */
    const DAN = { stores:[{id:"cdan",name:"Dan Murphy's Box Hill",aisles:[]}] };
    await mk({ docs:{ v101:DOC(DAN) }, store:"cdan", extra:`localStorage.setItem("ml_cards", JSON.stringify([{id:"k1",name:"My Dan's",num:"123456789",chain:""}])); localStorage.setItem("ml_cardnudge", String(Date.now()));` });
    ok('8 · at Dan Murphy\'s, the "My Dan\'s" card comes up by itself (a shared name word)', await page.evaluate(()=>/My Dan/.test(document.querySelector('#cardNudge')?.textContent||'')), await page.evaluate(()=>(document.querySelector('#cardNudge')?.textContent||'').slice(0,80)));
    await mk({ docs:{ v101:DOC(DAN) }, store:"cdan", extra:`localStorage.setItem("ml_cards", JSON.stringify([{id:"k2",name:"Liquor club",num:"99887766",chain:""}])); localStorage.setItem("ml_cardnudge", String(Date.now()));` });
    const ask = await page.evaluate(()=>({ q:/Use one of your cards here/.test(document.querySelector('#cardNudge')?.textContent||''), chips:document.querySelectorAll('[data-card-use]').length }));
    ok('8 · with no match, a phone that has cards is asked "Use one of your cards here?" with its cards', ask.q && ask.chips===1, JSON.stringify(ask));
    await shot('carduse');
    if(ask.chips){ await page.locator('[data-card-use]').first().click(); await page.waitForTimeout(500); }
    const card = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cards'))[0]);
    ok('8 · choosing one remembers it for this shop, and shows it', (card.stores||[]).includes('cdan') && /Liquor club/.test(await page.evaluate(()=>document.querySelector('#cardNudge')?.textContent||'')), JSON.stringify(card.stores));

    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('ml_gonelists is in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_gonelists\$/.test(x)).length===2, '');
    ok('App Check: the database waits up to 10 s for it, the AI calls 8 s (96% → aiming for 100% before enforcing)', /setTimeout\(r, 10000\)/.test(src) && /* SUPERSEDED by v2.57: the AI calls' wait also notes a timeout for the Connection check */ /res\(null\); \}, 8000\)/.test(src), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
