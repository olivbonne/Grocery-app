/* v2.26 — your look on your other phones (the published plan's item 7).

   WHAT THESE CHECKS HAVE TO PROVE: "Send this look to my other phones" (on the look page) keeps this phone's look in the
   list under your name — the look only (what an appearance slot holds), never data or preferences — and the phone that
   sent it is not offered it back; a phone where you are that name offers it once on the Shop page; "Use it" applies it
   (the page reloads with it) and the offer is gone; "Not now" puts it away until a newer one is sent; someone else's look
   is never offered to you, nor one this phone already has; the look travels in backups; the opt-in record survives
   applying an appearance slot (both exclude lists); the sync's rebuild names the field.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded (here a non-ml_ flag, since "Use it" reloads
   and applying a look rewrites ml_ keys); v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const seed = (looks, extra) => `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[{id:"1",name:"Milk",cat:"fresh",qty:1,weight:"",checked:false,tags:[]}], buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O","Sam"], name:"Sandbox", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, looks:${looks||'{}'} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home");
  ${extra||''}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(looks, extra)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, acceptDownloads:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(looks, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  const card = ()=>page.evaluate(()=>!!document.querySelector('#lookCard'));
  /* the offer is on the Shop page: go there, and say whether we are there, so "no card" is never true by being elsewhere */
  const toShop = async()=>{ const c=page.locator('#cartNav'); if(!(await page.evaluate(()=>!!document.querySelector('#zoomer'))) && await c.count()){ await c.first().click(); await page.waitForTimeout(500); } return page.evaluate(()=>!!document.querySelector('#zoomer')); };
  const ls = (k)=>page.evaluate(k=>localStorage.getItem(k), k);
  const T = Date.now();

  try{
    /* sending */
    await mk('{}', 'localStorage.setItem("ml_theme","dark"); localStorage.setItem("ml_icosize","l");');
    await tap('#setNav'); await tap('#optLook');
    ok('the look page offers "Send this look to my other phones"', await page.locator('#optLookSend').count()===1, '');
    await tap('#optLookSend');
    const L = ((await cache()).looks||{}).O;
    ok('…which keeps this phone\'s look in the list under your name', L && L.at>0 && L.keys && L.keys.ml_theme==='dark' && L.keys.ml_icosize==='l', JSON.stringify(L));
    ok('…the look only: no list, name, history or preference keys', L && !Object.keys(L.keys).some(k=>/^ml_(cache_|hist_|lists|lastlist|me$|shop$|store|purch|sayshop|lookseen|optcoll|appmig)/.test(k)), JSON.stringify(Object.keys((L||{}).keys||{})));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200);
    ok('…and the phone that sent it is not offered it back', (await toShop()) && !(await card()), '');

    /* another phone of yours */
    const LOOK = `{ O:{ at:${T}, keys:{ ml_theme:"dark", ml_icosize:"xl" } } }`;
    await mk(LOOK);
    ok('a phone where you are that name offers your look on the Shop page', await card(), '');
    if(out) await page.screenshot({ path: out });
    await Promise.all([page.waitForNavigation({ timeout:9000 }).catch(()=>{}), page.locator('#lookUse').click()]);
    await page.waitForTimeout(1500);
    ok('"Use it" applies it — the page comes back with that look', await ls('ml_theme')==='dark' && await ls('ml_icosize')==='xl' && await page.evaluate(()=>document.documentElement.getAttribute('data-icosize'))==='xl', JSON.stringify({ t:await ls('ml_theme'), i:await ls('ml_icosize') }));
    ok('…and the offer is gone, remembered on the phone', (await toShop()) && !(await card()) && +(await ls('ml_lookseen'))===T, await ls('ml_lookseen'));

    await mk(LOOK);
    await tap('#lookNo');
    ok('"Not now" puts it away', (await toShop()) && !(await card()) && +(await ls('ml_lookseen'))===T, '');
    await page.evaluate((t)=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')); c.looks.O.at=t+1000; localStorage.setItem('ml_cache_v101', JSON.stringify(c)); }, T);
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    ok('…until a newer one is sent', (await toShop()) && await card(), '');

    await mk(`{ Sam:{ at:${T}, keys:{ ml_theme:"dark" } } }`);
    ok('someone else\'s look is never offered to you', (await toShop()) && !(await card()), '');
    /* a look identical to this phone's: send it, forget that it was sent here, and come back */
    await mk('{}', 'localStorage.setItem("ml_theme","dark");');
    await tap('#setNav'); await tap('#optLook'); await tap('#optLookSend');
    await page.evaluate(()=>localStorage.removeItem('ml_lookseen'));
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    ok('…nor a look this phone already has', (await toShop()) && !(await card()), '');

    /* it travels, and its record survives */
    await mk(LOOK);
    await tap('#setNav');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#optBackup').click()]);
    const bk = JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    ok('a backup carries the looks', bk.list && bk.list.looks && bk.list.looks.O && bk.list.looks.O.keys.ml_icosize==='xl', JSON.stringify(bk.list && bk.list.looks));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const ex = (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]);
    ok('the offer record survives applying an appearance slot (in both exclude lists)', ex.length===2 && ex.every(x=>/ml_lookseen\$/.test(x)), '');
    ok('the sync\'s rebuild, the two literals, the backup and the restore name the field', /looks: \(d\.looks/.test(src) && /looks:\(s\.looks/.test(src) && /state\.looks = list\.looks/.test(src) && (src.match(/spend:\[\], looks:\{\}[,} ]/g)||[]).length===2   /* SUPERSEDED by v2.27: the literals go on past looks:{} (aislemap); still protects that both name it */, '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
