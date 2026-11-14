/* v3.19 — shelf prices (the price feed): pin Coles / Woolworths / ALDI products in Edit item › More, priced once a week.

   WHAT THESE CHECKS HAVE TO PROVE:
   - off by default: Settings shows the switch at Off, and Edit item › More has no Shelf prices row;
   - a list that never pins writes NO feedPins / feedAt (the rules before v3.19 refuse unknown fields — sync must not break);
   - switched on: Search shows a busy line (role="status") at once, then the products; a pick is kept only on Save — closing
     without Save leaves nothing — and Save writes feedPins under the item's name;
   - a failure ends in words (not set up yet; the service did not answer as expected);
   - the weekly refresh writes feedAt BEFORE asking for prices, then stores the price as "Coles online" (s feed-coles, f:1),
     replacing that chain's older feed price but keeping the receipt prices; a refresh less than 7 days old asks nothing;
   - a feed price is never counted in What we spend. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const NEWER_V = +fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8').match(/const LIST_V = (\d+);/)[1] + 1;   // v2.78 (lesson 44): "a newer app" is always one past the app's own version, never a literal
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `const S = window.__srv || (window.__srv = { docs:{}, subs:[], writes:[], refuse:false });
S.subs = [];
const J = v => v===undefined ? undefined : JSON.parse(JSON.stringify(v));
export const initializeApp=()=>({}); export const getFirestore=()=>({}); export const initializeFirestore=()=>({});
export const persistentLocalCache=()=>({}); export const persistentMultipleTabManager=()=>({});
export const doc=(db,...p)=>({ kind:'doc', path:p.join('/') });
export const collection=(db,...p)=>({ kind:'col', path:p.join('/') });
const meta = { hasPendingWrites:false, fromCache:false };
function docSnap(p){ const d=S.docs[p]; return { id:p.split('/').pop(), exists:()=>d!==undefined, data:()=>J(d), metadata:meta }; }
function colSnap(p){ return { docs:Object.keys(S.docs).filter(k=>k.indexOf(p+'/')===0 && k.slice(p.length+1).indexOf('/')<0).map(docSnap), metadata:meta }; }
function snapOf(r){ return r.kind==='doc' ? docSnap(r.path) : colSnap(r.path); }
function fire(){ S.subs.slice().forEach(s=>setTimeout(()=>{ if(S.subs.includes(s)) s.cb(snapOf(s.r)); }, 0)); }
S.set = (p, d) => { S.docs[p] = J(d); fire(); };
export function onSnapshot(r, a, b){ const cb = typeof a==='function' ? a : b; const s={ r, cb }; S.subs.push(s);
  setTimeout(()=>{ if(S.subs.includes(s)) cb(snapOf(r)); }, 0); return ()=>{ S.subs = S.subs.filter(x=>x!==s); }; }
const refused = p => (S.refuse && /^lists\\/[^/]+\\/items\\//.test(p)) || (S.refusePhotos && /\\/photos\\//.test(p));
const deny = () => Object.assign(new Error('Missing or insufficient permissions.'), { code:'permission-denied' });
export async function setDoc(r, d){ if(refused(r.path)) throw deny(); S.writes.push({ path:r.path, data:J(d), batch:0 }); S.docs[r.path]=J(d); fire(); }
export function writeBatch(){ const ops=[]; return { set(r,d){ ops.push([r,d]); },
  async commit(){ if(ops.some(([r])=>refused(r.path))) throw deny(); S.batches=(S.batches||0)+1;
    ops.forEach(([r,d])=>{ S.writes.push({ path:r.path, data:J(d), batch:S.batches }); S.docs[r.path]=J(d); }); fire(); } }; }
export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const FAKE = (y,m,d)=>`(()=>{ const T=new Date(${y},${m},${d},10,0,0).getTime(), OFF=T-Date.now(), _D=Date;
  class FD extends _D { constructor(...a){ if(a.length) super(...a); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } }
  FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy"), it("2","Bread","bakery")], itemTomb:{ "x9":500 }, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, v:2 }, o||{});
/* the server's records and this phone's cache, seeded before the app's module runs */
const seed = (o) => { o=o||{}; return `(() => {
  const srv = ${JSON.stringify(o.srv||{ "lists/v101": DOC() })};
  window.__srv = { docs:srv, subs:[], writes:[], refuse:${!!o.refuse} };
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  ${o.cache===false ? '' : `const c=${JSON.stringify(o.cache||DOC())}; localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(c, { mv:2 })));`}
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_onb", JSON.stringify({done:1}));
  ${o.extra||''}
})()`; };


(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page, calls = [], reply = null;
    const mk = async(o)=>{ if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      calls = [];
      await ctx.route('**/api/prices', async r => { const b = JSON.parse(r.request().postData()||'{}');
        const srvW = await r.request().frame().page().evaluate(()=>JSON.parse(JSON.stringify((window.__srv.writes||[]).filter(w=>w.path==='lists/v101'))));
        calls.push({ b, listWritesBefore:srvW });
        const x = reply(b); await new Promise(z=>setTimeout(z, x.delay||0));
        r.fulfill({ status:x.status||200, contentType:'application/json', body:JSON.stringify(x.body) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800); };
    const SP = out ? out.replace(/\.png$/,'') : '';
    const hold = async sel => { const t = page.locator(sel).first(); await t.dispatchEvent('pointerdown'); await page.waitForTimeout(700); await t.dispatchEvent('pointerup'); await page.waitForTimeout(700); };
    const tap = async sel => { await page.locator(sel).first().click(); await page.waitForTimeout(450); };
    const listW = () => page.evaluate(()=>JSON.parse(JSON.stringify((window.__srv.writes||[]).filter(w=>w.path==='lists/v101'))));
    const srvDoc = () => page.evaluate(()=>JSON.parse(JSON.stringify(window.__srv.docs['lists/v101']||{})));
    const feedRow = () => page.evaluate(()=>{ const r=document.querySelector('#sheet [data-row="feed"]'); return r ? r.textContent.replace(/\s+/g,' ').trim() : null; });
    const status = c => page.evaluate(c=>{ const g=document.querySelector(`[data-feed-chain="${c}"] [role="status"]`); return g ? g.textContent.replace(/\s+/g,' ').trim() : ''; }, c);
    const openMore = async () => { await hold('#zoomer .pill[data-pill="1"]');   /* the same item reopened keeps More as it was (v3.10) */
      if(await page.getAttribute('#edMore','aria-expanded')!=='true'){ await page.click('#edMore'); await page.waitForTimeout(400); } };
    const BASE = 'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const ON = BASE + 'localStorage.setItem("ml_feed","1");';
    const PRODS = [{ id:"111", name:"Coles Full Cream Milk", size:"2L", price:3.1 }, { id:"222", name:"Dairy Farmers Milk", size:"2L", price:4.2 }];
    reply = b => b.mode==='search' ? { delay:700, body:{ products:PRODS } } : { body:{ prices:[], missing:[] } };

    /* 1. off by default */
    await mk({ extra:BASE });
    await tap('#setNav'); const sw = await page.evaluate(()=>{ const b=document.querySelector('[data-opt-feed="0"]'); return b ? b.classList.contains('on') : null; });
    ok('off by default: Settings has the Shelf prices switch, set to Off', sw===true, sw);
    await tap('#listNav').catch(()=>{}); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await mk({ extra:BASE }); await openMore();
    ok('…and Edit item › More has no Shelf prices row', (await feedRow())===null, await feedRow());
    await page.fill('#editName', 'Milk'); await page.click('#saveBtn'); await page.waitForTimeout(900);
    const w0 = await listW();
    ok('a list that never pins writes no feedPins and no feedAt (sync works before the rules are published)', w0.length>0 && w0.every(w=>!('feedPins' in w.data) && !('feedAt' in w.data)), JSON.stringify(w0.map(w=>Object.keys(w.data).filter(k=>/feed/.test(k)))));
    ok('…and switched off, nothing asks for prices', calls.length===0, calls.length);

    /* 2. switched on: search, busy, pick, cancel, save */
    await mk({ extra:ON }); await openMore();
    const r0 = await feedRow();
    ok('switched on: More has Shelf prices, None pinned', r0 && /Shelf prices/.test(r0) && /None/.test(r0), r0);
    await tap('#efHead'); await page.locator('[data-feed-search="coles"]').click(); await page.waitForTimeout(150);
    const busy = await status('coles');
    if(SP) await page.screenshot({ path: SP + '-busy.png' });
    ok('Search shows at once that it started (role="status": Searching Coles…)', /Searching Coles/.test(busy), busy);
    await page.waitForTimeout(1000);
    const chips = await page.evaluate(()=>[...document.querySelectorAll('[data-feed-chain="coles"] [data-feed-pick]')].map(b=>b.textContent.trim()));
    if(SP) await page.screenshot({ path: SP + '-results.png' });
    ok('…then the products: name, size and price', chips.length===2 && /Coles Full Cream Milk · 2L · \$3\.10/.test(chips[0]), JSON.stringify(chips));
    ok('…asked as a search for this item at Coles', calls[0] && calls[0].b.mode==='search' && calls[0].b.chain==='coles' && calls[0].b.q==='Milk', JSON.stringify(calls[0] && calls[0].b));
    await page.locator('[data-feed-chain="coles"] [data-feed-pick]').first().click(); await page.waitForTimeout(300);
    const pressed = await page.evaluate(()=>document.querySelector('[data-feed-chain="coles"] [data-feed-pick]').getAttribute('aria-pressed'));
    ok('a tap pins the product (shown pressed)', pressed==='true', pressed);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    const d1 = await srvDoc();
    ok('closing without Save leaves no pin', !d1.feedPins, JSON.stringify(d1.feedPins));
    await openMore(); await tap('#efHead'); await page.locator('[data-feed-search="coles"]').click(); await page.waitForTimeout(1100);
    await page.locator('[data-feed-chain="coles"] [data-feed-pick]').first().click(); await page.waitForTimeout(300);
    await page.click('#saveBtn'); await page.waitForTimeout(900);
    const d2 = await srvDoc(); const pin = d2.feedPins && d2.feedPins.milk && d2.feedPins.milk.coles;
    ok('Save writes the pin to the list, under the item\'s name', pin && pin.id==='111' && pin.size==='2L', JSON.stringify(d2.feedPins));
    await openMore(); const r1 = await feedRow();
    ok('…and the row then says which chains are pinned', r1 && /Coles/.test(r1) && !/None/.test(r1), r1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    /* 3. failures end in words */
    reply = b => ({ status:500, body:{ error:'x', code:'not_configured' } });
    await mk({ extra:ON }); await openMore(); await tap('#efHead'); await page.locator('[data-feed-search="aldi"]').click(); await page.waitForTimeout(800);
    const e1 = await status('aldi');
    ok('not set up yet: said in words', /not set up yet/.test(e1), e1);
    reply = b => ({ status:502, body:{ error:'x', code:'feed_shape' } });
    await page.locator('[data-feed-search="woolworths"]').click(); await page.waitForTimeout(800);
    const e2 = await status('woolworths');
    if(SP) await page.screenshot({ path: SP + '-error.png' });
    ok('the service answering wrongly: said in words', /did not answer as expected/.test(e2), e2);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    /* 4. the weekly refresh */
    const OLD = { p:2.9, q:1, s:"feed-coles", sn:"Coles online", d:"2026-11-01", w:"2L", t:1000, f:1 }, RC = { p:3.5, q:1, s:"c9", sn:"Coles Dandenong", d:"2026-10-20", t:900 };
    const D = DOC({ feedPins:{ milk:{ coles:{ id:"111", name:"Coles Full Cream Milk", size:"2L" } } }, feedAt:1, prices:{ milk:[RC, OLD] } });
    reply = b => b.mode==='refresh' ? { body:{ prices:[{ chain:"coles", id:"111", name:"Coles Full Cream Milk", size:"2L", price:3.1 }], missing:[] } } : { body:{ products:[] } };
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:ON }); await page.waitForTimeout(5500);
    const rc = calls.filter(c=>c.b.mode==='refresh');
    ok('a week old: one refresh asks for every pin', rc.length===1 && JSON.stringify(rc[0].b.pins)==='[{"chain":"coles","id":"111"}]', JSON.stringify(rc.map(c=>c.b)));
    ok('…after feedAt was written (so a second phone opening now does not refresh too)', rc[0] && rc[0].listWritesBefore.some(w=>+w.data.feedAt > 1e12), JSON.stringify(rc[0] && rc[0].listWritesBefore.map(w=>w.data.feedAt)));
    /* the app moves this v2 list's prices into records of their own on open (v2.58), so this also covers the refresh waiting for them */
    const d3 = await page.evaluate(()=>JSON.parse(JSON.stringify(window.__srv.docs['lists/v101/prices/milk']||null)));
    const pm = (d3 && d3.recs) || [];
    const fr = pm.filter(r=>r.s==='feed-coles');
    ok('the price is stored as "Coles online", from the feed', fr.length===1 && fr[0].p===3.1 && fr[0].sn==='Coles online' && fr[0].f===1, JSON.stringify(pm));
    ok('…replacing that chain\'s older feed price, and keeping the receipt price', pm.some(r=>r.s==='c9' && r.p===3.5) && !pm.some(r=>r.p===2.9), JSON.stringify(pm));
    await tap('#setNav'); await tap('#optSpend');
    const sp = await page.evaluate(()=>{ const s=document.querySelector('#spendSheet'); return s ? s.textContent.replace(/\s+/g,' ') : null; });
    ok('a feed price is never counted in What we spend', sp!==null && !/Coles online/.test(sp) && /Coles Dandenong/.test(sp), sp && sp.slice(0,200));

    const D2 = DOC({ feedPins:D.feedPins, feedAt:Date.now()-3600000 });
    await mk({ srv:{ "lists/v101": D2 }, cache:D2, extra:ON }); await page.waitForTimeout(5500);
    ok('refreshed an hour ago: nothing is asked', calls.length===0, calls.length);
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
