/* v2.21 — which store is cheaper for this list (item 6 of the published plan), from the household's own receipts.
   The logic is its own pure module, js/compare.js; the app shows it as a sheet (from Settings › Prices, or the card)
   and, before a shop, as a card when one store is worth it.

   WHAT THESE CHECKS HAVE TO PROVE — the module, in Node: the latest price per store, per unit, inside the age limit,
   one store per saved id (or per name when the receipt's store was not a saved one); stores compared ONLY on the
   items both have prices for, so the one with fewer known prices never looks cheaper for that reason; a store with
   too few items in common is not compared; "worth saying" means $2 and 5%. In the app: the sheet's headline and one
   row per store ("N of M priced", the total), a member chain's unused 10% shown on its row, the distance from home
   when both places are known; the card only before a shop (nothing in the cart), only when worth it, "Compare" opens
   the sheet and "Not today" puts it away until tomorrow (in both exclude lists); too few prices says so.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.20 the clock
   is moved with a Date subclass installed before the app loads, so the 60-day window is a fixed one. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const C = (p,d)=>({p, q:1, s:'dand', sn:'Coles Dandenong', d, w:'', t:1});
const A = (p,d)=>({p, q:1, s:'', sn:'Asian Richmond', d, w:'', t:1});
const PRICES = { milk:[C(4,'2026-10-10'), A(3.5,'2026-10-12')], rice:[C(20,'2026-10-10'), A(15,'2026-10-12')],
  'soy sauce':[C(5,'2026-10-10'), A(4,'2026-10-12')], tofu:[A(2,'2026-10-12')] };
const it=(id,n,c,q,ck)=>({id,name:n,cat:c,qty:q||1,weight:"",checked:!!ck,tags:[]});
const ITEMS = [it('1','Milk','fresh',2), it('2','Rice','bulk'), it('3','Soy sauce','asian'), it('4','Tofu','asian'), it('5','Bananas','fruit',6)];
const FAKE = (y,m,d)=>`(()=>{ const T=new Date(${y},${m},${d},10,0,0).getTime(), OFF=T-Date.now(), _D=Date;
  class FD extends _D { constructor(...a){ if(a.length) super(...a); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } }
  FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`;
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, prices:${JSON.stringify(o.prices||PRICES)}, memb:${JSON.stringify(o.memb||{})},
    plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","home");
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  try{
    /* ── the module, in Node ───────────────────────────────────────────── */
    const M = await import(pathToFileURL(path.join(ROOT,'js','compare.js')).href);
    const now = Date.parse('2026-10-20T12:00:00');
    const by = M.latestByStore([C(4,'2026-10-01'), C(5,'2026-10-09'), {p:6,q:2,s:'',sn:' asian richmond ',d:'2026-10-05'}, {p:9,q:1,s:'',sn:'Asian Richmond',d:'2026-06-01'},
      {p:0,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-15'}, {p:3,q:1,s:'',sn:'',d:'2026-10-15'}], now, 60);
    ok('the latest price per store, per unit (6 for 2 = 3), one store per id or per name; zero, nameless and too-old prices ignored',
       Object.keys(by).sort().join()==='id:dand,name:asian richmond' && by['id:dand'].unit===5 && by['name:asian richmond'].unit===3, JSON.stringify(by));
    const lookup = n => PRICES[n.toLowerCase()] || [];
    const r = M.compareStores({ items:ITEMS.map(i=>({name:i.name, qty:i.qty})), lookup, now, maxAgeDays:60, minItems:3 });
    const st = Object.fromEntries(r.stores.map(s=>[s.name,s]));
    ok('each store\'s total is what it has prices for: Coles 3 of 5 ($33), Asian Richmond 4 of 5 ($28 with the tofu)',
       r.of===5 && st['Coles Dandenong'].n===3 && st['Coles Dandenong'].total===33 && st['Asian Richmond'].n===4 && st['Asian Richmond'].total===28, JSON.stringify(r.stores));
    ok('…but they are compared only on the 3 both have: Asian Richmond $7 cheaper ($26 against $33), the tofu left out',
       r.best && r.best.cheaper==='Asian Richmond' && r.best.dearer==='Coles Dandenong' && r.best.n===3 && r.best.lo===26 && r.best.hi===33 && r.best.diff===7, JSON.stringify(r.best));
    const r2 = M.compareStores({ items:[{name:'milk'},{name:'tofu'}], lookup, now, minItems:3 });
    ok('a store with too few things in common is not compared at all', r2.best===null && r2.stores.length===2, JSON.stringify(r2));
    const r3 = M.compareStores({ items:ITEMS.map(i=>({name:i.name, qty:i.qty})), lookup, now:Date.parse('2027-03-01T12:00:00'), maxAgeDays:60 });
    ok('prices older than the limit age out (a special does not last for ever)', r3.stores.length===0 && r3.best===null, JSON.stringify(r3));
    ok('"worth saying": $2 and 5% — $7 on $33 yes, $1 on $30 no, $2.50 on $100 no',
       M.worthIt(r.best) && !M.worthIt({diff:1,hi:30}) && !M.worthIt({diff:2.5,hi:100}) && !M.worthIt(null), '');

    /* ── the app ───────────────────────────────────────────────────────── */
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(FAKE(2026,9,20));
      await page.addInitScript(seed(o));
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
      await page.waitForTimeout(1500); };
    const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
    const card = ()=>page.evaluate(()=>{ const c=document.querySelector('#cmpCard'); return c ? c.textContent.replace(/\s+/g,' ').trim() : null; });
    const sheet = ()=>page.evaluate(()=>{ const s=document.querySelector('#cmpSheet'); if(!s) return null;
      return { best:(s.querySelector('.cmpbest')||{}).textContent.replace(/\s+/g,' ').trim(), rows:[...s.querySelectorAll('.cmprow')].map(x=>x.textContent.replace(/\s+/g,' ').trim()) }; });

    const HOME = 'localStorage.setItem("ml_storelocs", JSON.stringify({ home:{lat:-37.9700,lng:145.2140} }));';
    await mk({ memb:{ coles:{ on:true, pct:10, cap:50, day:1, used:{} } }, extra:HOME });
    const c1 = await card();
    ok('before a shop, the Shop page says where it is cheaper', c1 && /Cheaper at Asian Richmond/.test(c1) && /About \$7\.00 less than Coles Dandenong for 3 of the 5 things/.test(c1), c1);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-card.png') });
    await tap('#cmpCardGo');
    let s = await sheet();
    ok('"Compare" opens the sheet, headline first', s && /Asian Richmond is about \$7\.00 cheaper than Coles Dandenong on the 3 things both have prices for \(\$26\.00 against \$33\.00\)/.test(s.best), JSON.stringify(s));
    ok('…then a row per store: how many of the list it has prices for, and their total', s && s.rows.some(x=>/^Asian Richmond.*4 of 5 priced.*\$28\.00$/.test(x)) && s.rows.some(x=>/^Coles Dandenong.*3 of 5 priced.*\$33\.00$/.test(x)), JSON.stringify(s&&s.rows));
    ok('…Coles\'s row knows the household\'s unused 10% (about $29.70 with it), and how far it is from home',
       s && s.rows.some(x=>/^Coles Dandenong/.test(x) && /10% off with your Coles shop: about \$29\.70/.test(x) && /2\.0 km from home/.test(x)), JSON.stringify(s&&s.rows));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-sheet.png') });
    await tap('#cmpClose');
    ok('Close puts it away', (await sheet())===null, '');
    await tap('#cmpCardHide');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    ok('"Not today" puts the card away for the day, across a relaunch', (await card())===null && await page.evaluate(()=>localStorage.getItem('ml_cmphide'))==='2026-10-20', await page.evaluate(()=>localStorage.getItem('ml_cmphide')));
    await mk({ items:ITEMS.map((x,i)=>i===4?Object.assign({},x,{checked:true}):x) });
    ok('no card once the shop has started (something in the cart)', (await card())===null, '');
    const EVEN = { milk:[C(4,'2026-10-10'), A(3.9,'2026-10-12')], rice:[C(20,'2026-10-10'), A(19.8,'2026-10-12')], 'soy sauce':[C(5,'2026-10-10'), A(5,'2026-10-12')] };
    await mk({ prices:EVEN });
    ok('no card when the difference is not worth it ($0.40 on $33)', (await card())===null, '');
    await mk({ prices:{ milk:[C(4,'2026-10-10')] } });
    await tap('#setNav');
    await tap('#optCompare');
    s = await sheet();
    ok('Settings › Prices opens it too — and with too few prices it says so', s && /Not enough prices yet to compare two stores on the same things/.test(s.best), JSON.stringify(s));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const ex = (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]);
    ok('"Not today" survives applying an appearance slot (in both exclude lists)', ex.length===2 && ex.every(x=>/ml_cmphide\$/.test(x)), '');
    await browser.close();
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
