/* v2.24 — What we spend (the app review's R20): a month's spending by store and by category, from the receipts.

   WHAT THESE CHECKS HAVE TO PROVE: the logic (js/spend.js, a pure module, tested here in Node) takes what was paid from
   the receipt's own total when it agrees with the lines and from the lines less discounts when it does not, keeps one
   entry per receipt, rebuilds the receipts read before v2.24 from the price memory (one receipt = one save time) and marks
   them as estimates. In the app: Settings › Prices › "What we spend" opens on the latest month, with its total ("about"
   when any of it is an estimate), the receipts, the month before, a row per store and per category; another month is a
   tap away; a receipt read now is logged once — never counted again from the prices it saved; a category that is gone
   counts under Others; a backup carries the log; clearing the price memory clears the spending too.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.20 the clock is
   moved with a Date subclass installed before the app loads (FAKE), so "this month" is October 2026, not today. */
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c)=>({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]});
/* two receipts read before v2.24, as the price memory holds them: Coles in September, Asian Richmond in October */
const PRICES = {
  milk:[{p:4.5,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-09-20',w:'',t:1001}],
  banana:[{p:3.2,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-09-20',w:'',t:1001}],
  tofu:[{p:2.5,q:1,s:'asri',sn:'Asian Richmond',d:'2026-10-03',w:'',t:2002}],
  'soy sauce':[{p:6,q:1,s:'asri',sn:'Asian Richmond',d:'2026-10-03',w:'',t:2002}] };
const FAKE = (y,m,d)=>`(()=>{ const T=new Date(${y},${m},${d},10,0,0).getTime(), OFF=T-Date.now(), _D=Date;
  class FD extends _D { constructor(...a){ if(a.length) super(...a); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } }
  FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`;
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify([it('1','Milk','fresh'), it('2','Chicken thigh','meat')])}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], name:"Sandbox", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]},
    prices:${JSON.stringify(o.prices===undefined?PRICES:o.prices)}, spend:${JSON.stringify(o.spend||[])} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","home");
  ${o.extra||''}
})()`; };
const RC = { store:'Coles Dandenong', date:'2026-10-09', total:23.5,
  items:[{raw:'MILK 2L',name:'milk',qty:1,weight:'',price:4.5,category:'fresh'},{raw:'CHICKEN THIGH',name:'chicken thigh',qty:1,weight:'',price:20,category:'meat'}],
  discounts:[{raw:'PLUS SAVER', amount:1}] };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];

  /* ── the logic, in Node ───────────────────────────────────────────────── */
  try{
    const S = await import(pathToFileURL(path.join(ROOT,'js','spend.js')).href);
    const lines = [{price:30,cat:'meat'},{price:25,cat:'fresh'},{price:0,cat:'fresh'}];
    const e1 = S.spendEntry({ t:5, d:'2026-10-09', s:'dand', sn:'Coles Dandenong', total:50, lines, discounts:[{amount:5}] });
    ok('a receipt\'s entry: what it says was paid, its lines by category, its discounts', e1.tot===50 && e1.c.meat===30 && e1.c.fresh===25 && e1.n===2 && e1.disc===5 && e1.sn==='Coles Dandenong' && e1.d==='2026-10-09', JSON.stringify(e1));
    const e2 = S.spendEntry({ t:6, d:'2026-10-09', total:0, lines, discounts:[{amount:5}] });
    const e3 = S.spendEntry({ t:7, d:'2026-10-09', total:5000, lines, discounts:[] });
    ok('…and the lines less the discounts when it read no total, or one that cannot be right', e2.tot===50 && e3.tot===55, JSON.stringify([e2.tot, e3.tot]));
    let log = S.spendLog([], e1, 3); log = S.spendLog(log, Object.assign({}, e1, { tot:51 }), 3);
    ok('one entry per receipt — saving it again replaces it', log.length===1 && log[0].tot===51, JSON.stringify(log.map(e=>e.tot)));
    for(const t of [9, 8, 10, 11]) log = S.spendLog(log, Object.assign({}, e1, { t }), 3);
    ok('…oldest first, and at most the cap (the oldest go)', JSON.stringify(log.map(e=>e.t))==='[9,10,11]', JSON.stringify(log.map(e=>e.t)));
    const catOf = k => ({ milk:'fresh', banana:'fruit', tofu:'asian', 'soy sauce':'asian' })[k];
    const rb = S.spendFromPrices(PRICES, [{ t:2002 }], catOf);
    ok('receipts read before the log are rebuilt from the price memory, one per save time, as estimates — not one the log has',
       rb.length===1 && rb[0].t===1001 && rb[0].tot===7.7 && rb[0].c.fresh===4.5 && rb[0].c.fruit===3.2 && rb[0].est===1 && rb[0].sn==='Coles Dandenong', JSON.stringify(rb));
    const all = S.spendFromPrices(PRICES, [], catOf).concat([e1]);
    const m = S.spendMonth(all, '2026-10');
    ok('a month: its total, receipts, stores (largest first), categories, and whether any of it is an estimate',
       m.tot===58.5 && m.n===2 && m.est===true && m.stores[0].sn==='Coles Dandenong' && m.stores[0].tot===50 && m.stores[1].tot===8.5 && m.cats[0].cat==='meat' && m.cats.find(x=>x.cat==='asian').tot===8.5, JSON.stringify(m));
    ok('the months, newest first; the month before January is last December', JSON.stringify(S.spendMonths(all))==='["2026-10","2026-09"]' && S.prevMonth('2026-01')==='2025-12' && S.prevMonth('2026-10')==='2026-09', JSON.stringify(S.spendMonths(all)));
  } catch(e){ ok('the module loads and runs in Node', false, e.message.slice(0,300)); }

  /* ── the app ──────────────────────────────────────────────────────────── */
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, acceptDownloads:true, colorScheme:o.dark?'dark':'light' });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RC) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    page.on('dialog', d=>d.accept());
    await page.addInitScript(FAKE(2026,9,11));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  const sheet = ()=>page.evaluate(()=>{ const s=document.querySelector('#spendSheet'); if(!s) return null;
    const txt = e => e ? e.textContent.replace(/\s+/g,' ').trim() : null;
    /* a row's name and its sub-line are separate blocks, so their text runs together ("Coles Dandenong1 receipt") */
    const rows = h => { const out=[]; let el=[...s.querySelectorAll('.elsehd')].find(x=>x.textContent===h); el = el && el.nextElementSibling;
      if(el) for(const r of el.querySelectorAll('.sprow')) out.push([txt(r.querySelector('.sp-n')), txt(r.querySelector('.sp-p')), r.dataset.spcat||null]); return out; };
    return { tot:txt(s.querySelector('.sptot')), months:[...s.querySelectorAll('[data-spend-m]')].map(b=>[b.dataset.spendM, b.classList.contains('on')]),
      stores:rows('By store'), cats:rows('By category'), hint:txt(s.querySelector('.hint')) }; });
  const openSpend = async()=>{ await tap('#setNav'); await tap('#optSpend'); };

  try{
    /* before any receipt is logged: the price memory's two receipts, as estimates */
    await mk();
    await openSpend();
    let s = await sheet();
    ok('Settings › Prices › "What we spend" opens on the latest month, as an estimate', s && /^about \$8\.50 in October 2026 · 1 receipt · \$0\.80 more than September$/.test(s.tot), JSON.stringify(s));
    ok('…with the months to choose from, newest first, this one chosen', s && JSON.stringify(s.months)==='[["2026-10",true],["2026-09",false]]', JSON.stringify(s && s.months));
    ok('…a row per store and per category', s && JSON.stringify(s.stores)==='[["Asian Richmond1 receipt","$8.50",null]]' && JSON.stringify(s.cats.map(c=>[c[2],c[1]]))==='[["asian","$8.50"]]', JSON.stringify(s));
    ok('…and says the estimate is one', s && /estimated from the price memory/.test(s.hint), s && s.hint);
    await tap('[data-spend-m="2026-09"]');
    s = await sheet();
    ok('another month is a tap away', s && /^about \$7\.70 in September 2026 · 1 receipt$/.test(s.tot) && JSON.stringify(s.cats.map(c=>[c[2],c[1]]))==='[["fresh","$4.50"],["fruit","$3.20"]]', JSON.stringify(s));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sept.png') });
    await tap('#spendClose');

    /* a receipt read now is logged, once */
    await tap('#setNav');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG });
    await page.waitForTimeout(1500);
    await tap('#rcSaveBtn');
    const c = await cache(), e = (c.spend||[])[0]||{};
    const pt = ((c.prices||{}).milk||[]).slice(-1)[0]||{};
    ok('a receipt read now is logged: the total it says, the store, the day, its lines by category', (c.spend||[]).length===1 && e.tot===23.5 && e.sn==='Coles Dandenong' && e.d==='2026-10-09' && e.c.meat===20 && e.c.fresh===4.5 && e.disc===1, JSON.stringify(c.spend));
    ok('…under the same time its prices were saved with', e.t && pt.t===e.t, JSON.stringify({ log:e.t, price:pt.t }));
    await openSpend();
    s = await sheet();
    ok('October now adds it once — $8.50 + $23.50, never its prices again — and says how it compares with September',
       s && /^about \$32\.00 in October 2026 · 2 receipts · \$24\.30 more than September$/.test(s.tot), JSON.stringify(s && s.tot));
    ok('…Coles first among the stores', s && s.stores.length===2 && /^Coles Dandenong1 receipt$/.test(s.stores[0][0]) && s.stores[0][1]==='$23.50', JSON.stringify(s && s.stores));
    if(out) await page.screenshot({ path: out });

    /* a month of logged receipts only is not "about" */
    await mk({ prices:{}, spend:[{ t:3003, d:'2026-10-05', s:'dand', sn:'Coles Dandenong', tot:40, c:{ meat:25, gone:5, others:10 }, n:3 }] });
    await openSpend();
    s = await sheet();
    ok('a month of logged receipts only is not an estimate', s && /^\$40\.00 in October 2026 · 1 receipt$/.test(s.tot) && !/estimated/.test(s.hint||''), JSON.stringify(s));
    ok('…and a category that is gone counts under Others, in one row', s && JSON.stringify(s.cats.map(c=>[c[2],c[1]]))==='[["meat","$25.00"],["others","$15.00"]]', JSON.stringify(s && s.cats));
    ok('…with no month chips when there is only one month', s && s.months.length===0, JSON.stringify(s && s.months));
    await tap('#spendClose');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#optBackup').click()]);
    const bk = JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    ok('a backup carries the log', bk.list && Array.isArray(bk.list.spend) && bk.list.spend.length===1 && bk.list.spend[0].t===3003, JSON.stringify(bk.list && bk.list.spend));
    ok('"Clear prices and spending" is offered while there is spending, even with no prices', /Clear prices and spending/.test(await page.evaluate(()=>(document.querySelector('#optPriceClear')||{}).textContent||'')), '');

    /* clearing */
    await mk();
    await tap('#setNav');
    await tap('#optPriceClear');
    const cc = await cache();
    ok('clearing the price memory clears the spending too', Object.keys(cc.prices||{}).length===0 && (cc.spend||[]).length===0, JSON.stringify({ p:Object.keys(cc.prices||{}), s:cc.spend }));
    await tap('#optSpend');
    s = await sheet();
    ok('…and the sheet then says how it fills', s && !s.tot && /Read a receipt after a shop/.test(s.hint||''), JSON.stringify(s));

    /* dark */
    if(out){ await mk({ dark:true, extra:'localStorage.setItem("ml_theme","dark");' }); await openSpend(); await page.screenshot({ path: out.replace(/\.png$/,'-dark.png') }); }

    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    ok('the sync\'s rebuild, the backup and the restore all name the log (the fixed-shape trap)',
       /* SUPERSEDED by v2.75: the rebuild reads d.spend only when spending has not moved to records */ /spend:\s*(moved\("spend"\)[\s\S]{0,90}?\()?Array\.isArray\(d\.spend\)/.test(src) && /spend:\s*Array\.isArray\(s\.spend\)/.test(src) && /state\.spend\s*=\s*list\.spend/.test(src) && (src.match(/templates:\[\], spend:\[\][,} ]/g)||[]).length===2   /* SUPERSEDED by v2.26: the literals go on past spend:[] (looks, …); still protects that both name it */, '');
    ok('js/spend.js is imported versioned and precached', /from "\.\/spend\.js\?v=[\d.]+"/.test(src) && /"\/js\/spend\.js\?v=[\d.]+"/.test(sw), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
