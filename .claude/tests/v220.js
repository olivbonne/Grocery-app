/* v2.20 — the 10% shop (item 3 of the published plan). Coles Plus and Woolworths Everyday Extra each take a
   percentage off one shop a month, up to a cap. The household says which they have; the app builds the month's
   stock-up list from what they rebuy, warns in the month's last week if it is unused, and marks the month used when a
   receipt shows the member discount. The logic is its own module, js/tenpct.js — the first feature to land in one.

   WHAT THESE CHECKS HAVE TO PROVE — the module, in Node: a month that starts on another day is still a month; store
   names map to their chain; a discount line is recognised by the programme's name or a percentage, and nothing else
   is; the normaliser keeps every field and clamps the numbers; the stock-up list leaves out what will not keep, asks
   about meat, prices per unit for a month's worth, ticks in order of how often a thing is bought until the shop earns
   the whole discount, never counts what has no price, and caps the saving. In the app: Settings › Memberships turns
   one on, edits its rules and says how the month stands; the list opens from there, unticking changes the total, and
   "Add" puts the ticked things on the list (raising a quantity instead of doubling an item); the Shop card appears in
   the month's last week or at that chain's store and not otherwise, goes for the month with "Not this month" and
   with "Used it"; a receipt with the member discount marks the month used, one without does not; and the
   memberships travel in the list (sync, backups), shared by every phone.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. v2.20: a row is
   found by a name anchored at the start — Playwright's hasText ignores case, and "no pRICE yet" contains "rice". The clock is
   moved with a Date subclass installed before the app loads (FAKE), so "the last week" is a fixed day, not today. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const DAY = 86400000;
const T0 = new Date(2026, 8, 1).getTime();                  // purchase history starts 1 Sept 2026
const every = (days, n) => Array.from({length:n}, (_,i)=>T0 + i*days*DAY);
const PURCH = {
  'rice|bulk':            { name:'Rice', cat:'bulk', qty:1, weight:'', ts:every(14,3) },
  'toilet paper|bulk':    { name:'Toilet paper', cat:'bulk', qty:1, weight:'', ts:every(30,2) },
  'milk|fresh':           { name:'Milk', cat:'fresh', qty:2, weight:'', ts:every(4,5) },
  'chicken thigh|meat':   { name:'Chicken thigh', cat:'meat', qty:1, weight:'500g', ts:every(7,4) },
  'shampoo|health':       { name:'Shampoo', cat:'health', qty:1, weight:'', ts:every(60,2) },
  'once|bulk':            { name:'Once', cat:'bulk', qty:1, weight:'', ts:[T0] },
};
const PRICES = { rice:[{p:10,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}],
  'toilet paper':[{p:12,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}],
  'chicken thigh':[{p:8,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}],
  milk:[{p:4.5,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}] };
const it=(id,n,c,q,w)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:false,tags:[]});
const ITEMS = [it('1','Bananas','fruit',6), it('2','Toilet paper','bulk',1)];
const FAKE = (y,m,d)=>`(()=>{ const T=new Date(${y},${m},${d},10,0,0).getTime(), OFF=T-Date.now(), _D=Date;
  class FD extends _D { constructor(...a){ if(a.length) super(...a); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } }
  FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`;
const seed = (memb, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:${JSON.stringify(PURCH)}, prices:${JSON.stringify(PRICES)}, memb:${JSON.stringify(memb||{})},
    plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","home");
  ${extra||''}
})()`;
const COLES_ON = { coles:{ on:true, pct:10, cap:50, day:1, used:{} } };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  try{
    /* ── the module, in Node ───────────────────────────────────────────── */
    const T = await import(pathToFileURL(path.join(ROOT,'js','tenpct.js')).href);
    const p1 = T.periodOf(new Date(2026,9,10), 1), p14 = T.periodOf(new Date(2026,9,10), 14), pj = T.periodOf(new Date(2026,0,5), 14);
    ok('a month from the 1st: 10 Oct is October, 22 days left', p1.key==='2026-10' && p1.daysLeft===22, JSON.stringify(p1));
    ok('…a month from the 14th: 10 Oct is still September\'s (it ends on the 13th), 4 days left; and 5 Jan is December\'s', p14.key==='2026-09' && p14.daysLeft===4 && pj.key==='2025-12', JSON.stringify({p14,pj}));
    ok('store names map to their chain, and others to none', T.chainOfStore('Coles Dandenong')==='coles' && T.chainOfStore('Woolworths Metro')==='woolworths' && T.chainOfStore('Asian Richmond')==='', '');
    ok('a discount line is recognised by the programme\'s name or a percentage — and a points line is not',
       T.discountSeen([{raw:'PLUS SAVER DISCOUNT',amount:47.2}],'coles') && T.discountSeen([{raw:'10% MEMBER DISC',amount:9}],'coles')
       && !T.discountSeen([{raw:'FLYBUYS POINTS EARNED',amount:0}],'coles') && !T.discountSeen([],'coles') && !T.discountSeen(undefined,'coles'), '');
    const n = T.membNorm({ coles:{ on:1, pct:500, cap:-3, day:31, used:{'2026-10':5}, junk:1 }, woolworths:'x' });
    ok('the normaliser names every field, keeps the marks, clamps the numbers', n.coles.on===true && n.coles.pct===50 && n.coles.cap>=1 && n.coles.day===28 && n.coles.used['2026-10']===5
       && !('junk' in n.coles) && n.woolworths.on===false && n.woolworths.pct===10 && n.woolworths.cap===50, JSON.stringify(n));
    const price = {rice:{unit:10,sn:'Coles Dandenong'}, 'toilet paper':{unit:12,sn:'Coles Dandenong'}, 'chicken thigh':{unit:8,sn:'Coles Dandenong'}, milk:{unit:4.5,sn:'Coles'}};
    const s = T.stockUp({ purch:PURCH, priceOf:nm=>price[nm.toLowerCase()]||null, pct:10, cap:50 });
    const by = Object.fromEntries(s.rows.map(r=>[r.name,r]));
    ok('it leaves out what will not keep (milk) and what has no rhythm yet (bought once)', !by.Milk && !by.Once, JSON.stringify(s.rows.map(r=>r.name)));
    ok('a month\'s worth, priced per unit: rice every 14 days → 2 for $20, toilet paper monthly → 1 for $12',
       by.Rice && by.Rice.qty===2 && by.Rice.total===20 && by['Toilet paper'].qty===1 && by['Toilet paper'].total===12, JSON.stringify([by.Rice, by['Toilet paper']]));
    ok('meat is listed but left for you to tick (it keeps if frozen); no price yet is listed and never counted',
       by['Chicken thigh'] && by['Chicken thigh'].ask && !by['Chicken thigh'].sel && by.Shampoo && !by.Shampoo.priced && !by.Shampoo.sel, JSON.stringify([by['Chicken thigh'], by.Shampoo]));
    ok('…so the shop is $32 and saves $3.20 toward a $500 base', s.total===32 && s.saving===3.2 && s.base===500, JSON.stringify({t:s.total,sv:s.saving,b:s.base}));
    const BIG = { a:{name:'A',cat:'bulk',qty:1,ts:every(10,3)}, b:{name:'B',cat:'bulk',qty:1,ts:every(14,3)}, c:{name:'C',cat:'bulk',qty:1,ts:every(20,3)} };
    const sb = T.stockUp({ purch:BIG, priceOf:nm=>({A:{unit:100},B:{unit:150},C:{unit:10}})[nm], pct:10, cap:50 });
    ok('ticked in order of how often it is bought until the shop earns the whole discount; the saving stops at the cap',
       sb.rows.map(r=>r.name+(r.sel?'+':'-')).join(',')==='A+,B+,C-' && sb.total===600 && sb.saving===50, JSON.stringify({rows:sb.rows.map(r=>[r.name,r.total,r.sel]), t:sb.total, s:sb.saving}));
    const st = T.stockTotal(sb.rows.map(r=>Object.assign({},r,{sel:r.name==='C'})), 10, 50);
    ok('unticking and ticking recomputes the total', st.total===20 && st.saving===2, JSON.stringify(st));

    /* ── the app ───────────────────────────────────────────────────────── */
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let ctx, page, rcReply=null;
    const mk = async(memb, opt)=>{ opt=opt||{}; if(ctx) await ctx.close();
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, acceptDownloads:true });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
      await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(rcReply) }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(FAKE(...(opt.date||[2026,9,10])));
      await page.addInitScript(seed(memb, opt.extra));
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
      await page.waitForTimeout(1500); };
    const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
    const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
    const card = ()=>page.evaluate(()=>{ const c=document.querySelector('#tenCard'); return c ? c.textContent.replace(/\s+/g,' ').trim() : null; });
    const sheet = ()=>page.evaluate(()=>{ const s=document.querySelector('#tenSheet'); if(!s) return null;
      return { title:(s.querySelector('#tenTitle')||{}).textContent, rows:[...s.querySelectorAll('.tenrow')].map(r=>({ t:r.textContent.replace(/\s+/g,' ').trim(), on:r.querySelector('input').checked, dis:r.querySelector('input').disabled })),
        sum:(s.querySelector('.tensum')||{}).textContent, add:(s.querySelector('#tenAdd')||{}).textContent }; });

    await mk({});
    await tap('#setNav');
    const order = await page.evaluate(()=>[...document.querySelectorAll('.optpage .optsect')].filter(h=>h.offsetParent!==null).map(h=>h.dataset.sect));
    /* SUPERSEDED by v2.30: Settings was regrouped (Sort+Sound → Shopping, Predictions/Prices/Memberships → Smart features, Plan → Plan & recipes, Users → People, Other → Lists & sharing + Help). Memberships is a subhead of Smart features, after Receipts and prices. Still protects: memberships are in everyday Settings, next to prices. */
    const subs = await page.evaluate(()=>{ const h=[...document.querySelectorAll('.optsect')].find(x=>x.dataset.sect==='Smart features'), b=h&&h.nextElementSibling; return b ? [...b.querySelectorAll('.optsub')].map(e=>e.textContent.trim()) : []; });
    ok('Settings has Memberships, everyday, between Prices and Predictions', order.includes('Smart features') && subs.indexOf('Memberships')===subs.indexOf('Receipts and prices')+1, JSON.stringify({order,subs}));
    ok('…both programmes, off until you say', await page.evaluate(()=>!!document.querySelector('[data-memb-on="coles|0"].on') && !!document.querySelector('[data-memb-on="woolworths|0"].on')), '');
    await tap('[data-memb-on="coles|1"]');
    const stat = await page.evaluate(()=>{ const s=document.querySelector('[data-memb-stat="coles"]'); return s ? s.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('turning Coles Plus on shows its rules (10%, up to $50, month starts on the 1st) and how October stands',
       await page.evaluate(()=>[...document.querySelectorAll('.numval')].map(e=>e.textContent).join(',')).then(t=>/10%/.test(t) && /\$50/.test(t)) && /October: unused · 22 days left/.test(stat||''), stat);
    ok('…and it is saved in the list, shared by every phone', ((await cache()).memb||{}).coles && (await cache()).memb.coles.on===true, JSON.stringify((await cache()).memb));
    await tap('[data-memb-num="coles|pct|1"]'); await tap('[data-memb-num="coles|day|1"]');
    const c2 = (await cache()).memb.coles;
    ok('the rules are settings, because the chains change them (11%, month from the 2nd)', c2.pct===11 && c2.day===2, JSON.stringify(c2));
    await tap('[data-memb-num="coles|pct|-1"]'); await tap('[data-memb-num="coles|day|-1"]');
    await tap('[data-memb-list="coles"]');
    let sh = await sheet();
    ok('the stock-up list opens from Settings, titled for the chain and the month', sh && /Coles 10% shop · October/.test(sh.title), JSON.stringify(sh&&sh.title));
    ok('…rice and toilet paper ticked, chicken unticked ("keeps if frozen"), shampoo with no price yet and no box to tick',
       sh && sh.rows.find(r=>/^Rice/.test(r.t)).on && sh.rows.find(r=>/^Toilet paper/.test(r.t)).on && !sh.rows.find(r=>/^Chicken thigh/.test(r.t)).on
       && /keeps if frozen/.test(sh.rows.find(r=>/^Chicken thigh/.test(r.t)).t) && sh.rows.find(r=>/^Shampoo/.test(r.t)).dis && /no price yet/.test(sh.rows.find(r=>/^Shampoo/.test(r.t)).t), JSON.stringify(sh&&sh.rows));
    ok('…and the total says what it saves', sh && /2 ticked · \$32\.00 · saves \$3\.20/.test(sh.sum), sh&&sh.sum);
    /* SUPERSEDED by v2.92: the row's second line now starts "usually 1 every 14 days" (was "2× · every 14 days"), so the name match allows it; still protects unticking and ticking a row by hand. */
    await page.locator('.tenrow').filter({ has: page.locator('.tr-n', { hasText:/^Rice(usually|[^a-z])/i }) }).locator('input').click(); await page.waitForTimeout(300);
    sh = await sheet();
    ok('unticking rice changes the total and the button', sh && /1 ticked · \$12\.00 · saves \$1\.20/.test(sh.sum) && /Add 1 to the list/.test(sh.add), JSON.stringify(sh&&[sh.sum,sh.add]));
    await page.locator('.tenrow').filter({ has: page.locator('.tr-n', { hasText:/^Rice(usually|[^a-z])/i }) }).locator('input').click(); await page.waitForTimeout(300);
    await tap('#tenAdd');
    const items = (await cache()).items;
    ok('"Add" puts the ticked things on the list — rice ×2 new, toilet paper already there, not doubled',
       items.filter(i=>/^rice$/i.test(i.name)).length===1 && items.find(i=>/^rice$/i.test(i.name)).qty===2 && items.filter(i=>/^toilet paper$/i.test(i.name)).length===1, JSON.stringify(items.map(i=>i.name+'×'+i.qty)));

    /* the Shop card */
    await mk(COLES_ON, { date:[2026,9,10] });
    ok('no card on 10 October: three weeks left and not at a Coles', (await card())===null, '');
    await mk(COLES_ON, { date:[2026,9,10], extra:'localStorage.setItem("ml_store","dand");' });
    const atStore = await card();
    ok('…but at a Coles it asks, any day of the month', atStore && /You're at Coles: your 10% is unused/.test(atStore), atStore);
    await mk(COLES_ON, { date:[2026,9,27] });
    const late = await card();
    ok('in the month\'s last week it warns: "5 days left", with what stocking up would save', late && /Coles 10% is unused — 5 days left/.test(late) && /save about \$3\.20/.test(late) && /See the list/.test(late), late);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-card.png') });
    await tap('#tenCardHide');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    ok('"Later" (SUPERSEDED by v2.92: was "Not this month"; on the 27th the next reminder is 2 days before the end) puts it away, across a relaunch', (await card())===null, '');
    await mk(COLES_ON, { date:[2026,9,27] });
    await tap('#tenCardUsed');
    ok('"Used it" marks October used, for the household', (await card())===null && !!(((await cache()).memb||{}).coles||{}).used['2026-10'], JSON.stringify((await cache()).memb));
    await mk({ coles:{ on:true, pct:10, cap:50, day:1, used:{'2026-10':1} } }, { date:[2026,9,27] });
    await tap('#setNav');
    const st2 = await page.evaluate(()=>(document.querySelector('[data-memb-stat="coles"]')||{}).textContent||'');
    ok('Settings says so, and "Not used yet" undoes it', /October: used on/.test(st2), st2);
    await tap('[data-memb-used="coles|0"]');
    ok('…which it does', !(((await cache()).memb||{}).coles||{}).used['2026-10'], JSON.stringify((await cache()).memb));

    /* the receipt */
    const RC = disc => ({ store:'Coles Dandenong', date:'2026-10-26', total:42, items:[{raw:'RICE 5KG',name:'rice',qty:1,weight:'',price:10,category:'bulk'}], discounts:disc });
    for(const [disc, used, label] of [[[{raw:'PLUS SAVER DISCOUNT', amount:4.7}], true, 'with the member discount marks October used'], [[], false, 'without it does not']]){
      rcReply = RC(disc);
      await mk(COLES_ON, { date:[2026,9,27] });
      await tap('#setNav');
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
      await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64') });
      await page.waitForTimeout(1500);
      await tap('#rcSaveBtn');
      const u = !!((((await cache()).memb||{}).coles||{}).used||{})['2026-10'];
      const toast = await page.evaluate(()=>(document.querySelector('#toast')||{}).textContent||'');
      ok('a Coles receipt '+label, u===used && (used ? /Coles 10% used for October/.test(toast) : !/10% used/.test(toast)), JSON.stringify({u,toast}));
    }

    /* it travels in the list */
    await mk(COLES_ON);
    await tap('#setNav');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#optBackup').click()]);
    const bk = JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    ok('a backup carries the memberships (they are in the list, like its prices)', bk && bk.list && bk.list.memb && bk.list.memb.coles && bk.list.memb.coles.on===true, JSON.stringify(bk && bk.list && bk.list.memb));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the sync\'s rebuild of the list names memb (the fixed-shape trap)', /memb:\s*d\.memb\s*\|\|\s*\{\}/.test(src), '');
    const ex = (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]);
    ok('the card\'s "Not this month" survives applying an appearance slot (in both exclude lists)', ex.length===2 && ex.every(r=>/ml_tenhide\$/.test(r)), '');
    await browser.close();
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
