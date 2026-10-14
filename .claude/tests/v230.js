/* v2.30 — Settings tidied, the Shop page's menu, price diagnostics, when backups happen (the household's items 12–17, 19).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (15) everyday Settings is in plain groups, in this order: Appearance, Tiles, Shopping, Smart features, Plan & recipes,
     People, Lists & sharing, History, Help, Your data — no "Sort", "Sound", "Predictions", "Other";
   - (14) Keep screen on sits under Shopping (Sound is gone as a heading);
   - (19) section names are in sentence case (no uppercase transform) at 18px in the text colour, row labels 15px,
     hints at least 12.5px;
   - (17) the Shop page's top-right button opens a menu: read a receipt, which store is cheaper, what we spend, the aisle
     map (only at a real store), send the list, add an occasion, Report a problem — and each opens what it says;
   - (12) Help › Price diagnostics lists every item's recorded prices, newest first, and the find box filters in place
     (the field keeps focus — no redraw);
   - (13) Settings says when backups are taken, and when the newest was.

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
// const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
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
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const T0 = Date.UTC(2026,9,1);
  const PRICES = { honey:[{p:6.9,s:'dand',sn:'Coles Dandenong',d:'2026-09-20',q:1,w:'500g',t:T0},{p:7.5,s:'dand',sn:'Coles Dandenong',d:'2026-10-12',q:1,w:'500g',t:T0+9e8}],
                   linguine:[{p:2.2,s:'aldi',sn:'Aldi',d:'2026-10-02',q:2,w:'',t:T0+2e8}] };
  const STORES = [{id:'dand',name:'Coles Dandenong',emoji:'',order:[]}];

  try{
    /* ── Settings ─────────────────────────────────────────────────────── */
    await mk({ doc:{ prices:PRICES } });
    await tap('#setNav');
    const S = await page.evaluate(()=>{ const vis=e=>!!e && e.offsetParent!==null;
      const secs=[...document.querySelectorAll('.optpage .optsect')].filter(vis);
      const shop=secs.find(h=>h.dataset.sect==='Shopping'), b=shop && shop.nextElementSibling;
      const cs=e=>e?getComputedStyle(e):{}, h=cs(secs[0]), l=cs(document.querySelector('.optpage .optlabel'));
      return { names:secs.map(h=>h.dataset.sect), wake:!!(b && [...b.querySelectorAll('.optlabel')].some(x=>/Keep screen on/.test(x.textContent))),
        tt:h.textTransform, fs:h.fontSize, col:h.color, text:getComputedStyle(document.body).color, lab:l.fontSize,
        hints:[...document.querySelectorAll('.optpage .hint')].filter(vis).map(e=>parseFloat(getComputedStyle(e).fontSize)) }; });
    ok('(15) everyday Settings, in order: Appearance, Tiles, Shopping, Smart features, Plan & recipes, People, Lists & sharing, History, Help, Your data',
       JSON.stringify(S.names)===JSON.stringify(["Appearance","Tiles","Shopping","Smart features","Plan & recipes","People","Lists & sharing","History","Help","Your data"]), JSON.stringify(S.names));
    ok('(14) Keep screen on is under Shopping', S.wake, '');
    ok('(19) section names: no uppercase, 18px, the text colour', S.tt==='none' && S.fs==='18px' && S.col===S.text, JSON.stringify({tt:S.tt,fs:S.fs,col:S.col,text:S.text}));
    ok('(19) row labels are 15px and no hint is under 12.5px', S.lab==='15px' && S.hints.length>0 && Math.min(...S.hints)>=12.5, JSON.stringify({lab:S.lab, min:Math.min(...S.hints)}));
    await shot('settings');

    /* (13) backups */
    const bk = await page.evaluate(()=>[...document.querySelectorAll('.snapnote')].map(e=>e.textContent).join(' | '));
    ok('(13) Settings says when backups are taken (once a day, on leaving the app, the last seven days)', /one a day/.test(bk) && /leave the app/.test(bk) && /seven days/.test(bk), bk);

    /* (12) price diagnostics */
    await tap('#optPriceDiag');
    const pd = await page.evaluate(()=>({ rows:[...document.querySelectorAll('.pdrow .pd-n')].map(e=>e.textContent), head:(document.querySelector('#pdSheet .hint')||{}).textContent||'' }));
    ok('(12) Help › Price diagnostics lists each item, the most recently priced first', JSON.stringify(pd.rows)==='["Honey","Linguine"]' && /2 items, 3 prices/.test(pd.head), JSON.stringify(pd));
    await page.locator('.pdrow summary').first().click(); await page.waitForTimeout(250);
    const recs = await page.evaluate(()=>[...document.querySelectorAll('.pdrow')[0].querySelectorAll('.pdrec')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
    ok('…opening an item shows each record — date, store, size and price — newest first', recs.length===2 && /2026-10-12/.test(recs[0]) && /Coles Dandenong/.test(recs[0]) && /7\.50/.test(recs[0]) && /6\.90/.test(recs[1]), JSON.stringify(recs));
    await page.evaluate(()=>{ document.querySelector('#pdQ').dataset.probe='1'; });
    await page.locator('#pdQ').pressSequentially('ling', { delay:30 }); await page.waitForTimeout(200);
    const f = await page.evaluate(()=>({ shown:[...document.querySelectorAll('.pdrow')].filter(r=>r.offsetParent!==null).map(r=>r.querySelector('.pd-n').textContent),
      same:(document.querySelector('#pdQ')||{}).dataset?.probe==='1', focus:document.activeElement===document.querySelector('#pdQ') }));
    ok('…the find box filters in place, keeping its focus', JSON.stringify(f.shown)==='["Linguine"]' && f.same && f.focus, JSON.stringify(f));
    await shot('pricediag');
    await tap('#pdClose');
    ok('…and Close closes it', await page.evaluate(()=>!document.querySelector('#pdSheet')), '');

    /* ── (17) the Shop page's menu ────────────────────────────────────── */
    await mk({ store:'dand', doc:{ prices:PRICES, stores:STORES } });
    ok('(17) the Shop page has a menu button top right, and no separate Report button', await page.evaluate(()=>!!document.querySelector('#shopMenu') && !document.querySelector('#shopReport')), '');
    await tap('#shopMenu');
    const m = await page.evaluate(()=>[...document.querySelectorAll('.smenu .smitem')].map(b=>b.id));
    ok('…it lists read a receipt, cheaper store, spending, this shop\'s aisle map, send, occasion and Report a problem (last)',
       JSON.stringify(m)==='["smCard","smRcpt","smCompare","smSpend","smAisle","smSend","smOcc","smReport"]', JSON.stringify(m));   // SUPERSEDED by v2.35: the card item is always there ("Add a membership card" when none). Still protects: the menu's items and Report last
    await shot('menu');
    await page.mouse.click(20, 820); await page.waitForTimeout(400);
    ok('…a tap outside closes it', await page.evaluate(()=>!document.querySelector('.smenu')), '');
    const opens = async(id, sel)=>{ await tap('#shopMenu'); await tap('#'+id); const r = await page.evaluate(s=>!!document.querySelector(s) && !document.querySelector('.smenu'), sel); return r; };
    ok('…Report a problem opens the report sheet', await opens('smReport', '#rptSheet'), ''); await tap('#rptCancel');
    ok('…Which store is cheaper opens its sheet', await opens('smCompare', '#cmpBg, .cmpbg, [id^=cmp]'), '');
    await mk({ store:'dand', doc:{ prices:PRICES, stores:STORES } });
    ok('…What we spend opens its sheet', await opens('smSpend', '[id^=spend]'), '');
    await mk({ store:'dand', doc:{ prices:PRICES, stores:STORES } });
    ok('…the aisle map opens for this shop', await opens('smAisle', '#amBg'), '');
    await mk({ store:'dand', doc:{ prices:PRICES, stores:STORES } });
    ok('…Add an occasion opens the occasions sheet', await opens('smOcc', '[id^=occ]'), '');
    await mk({ store:'home' });
    await tap('#shopMenu');
    const m2 = await page.evaluate(()=>[...document.querySelectorAll('.smenu .smitem')].map(b=>b.id));
    ok('…away from a real store there is no aisle map in it', !m2.includes('smAisle') && m2.includes('smReport'), JSON.stringify(m2));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
