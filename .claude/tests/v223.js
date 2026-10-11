/* v2.23 — who is shopping now (the app review's R19) and lists for occasions (R21).

   WHAT THESE CHECKS HAVE TO PROVE: another member's recent shop shows above the list ("Sam is shopping at Coles
   Dandenong · 12 min ago"), never your own, never an old one; ticking at a shop writes your name and the shop's — and
   only when you opted in, only at a real shop — and finishing the shop takes it away, as does turning it off; it is
   presence, so a backup never carries it. Occasions: what is still to buy saves under a name (and replaces an older one
   of the same name), drops back into a list (an item already there gets the larger quantity, not a second tile), can
   be deleted with Undo, and travels in backups. Both opt-in keys survive applying an appearance slot.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,q,o)=>Object.assign({id,name:n,cat:c,qty:q||1,weight:"",checked:false,tags:[]}, o||{});
const ITEMS = [it('1','Sausages','meat',2), it('2','Bread rolls','fresh',12), it('3','Ice','others',2, {note:'2 bags'})];
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("ml_me")) return;
  const T=Date.now();
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O","Sam"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]},
    shopping:${o.shopping||'{}'}, templates:${JSON.stringify(o.templates||[])} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
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
  const mk = async(o)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, acceptDownloads:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  const banner = ()=>page.evaluate(()=>{ const b=document.querySelector('.shopnow'); return b ? b.textContent.replace(/\s+/g,' ').trim() : null; });

  try{
    /* ── R19 who is shopping now ────────────────────────────────────────── */
    await mk({ shopping:'{ Sam:{ store:"Coles Dandenong", at:T-12*60000 } }' });
    ok('another member\'s shop shows above the list, with the shop\'s name and how long ago', (await banner())==='Sam is shopping at Coles Dandenong · 12 min ago', await banner());
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-shopping.png') });
    await mk({ shopping:'{ Sam:{ store:"Coles Dandenong", at:T-3*3600000 } }' });
    ok('…but not one from three hours ago', (await banner())===null, await banner());
    await mk({ shopping:'{ O:{ store:"Coles Dandenong", at:T-60000 } }' });
    ok('…and never your own', (await banner())===null, await banner());

    await mk({ store:'dand' });
    await page.locator('#zoomer .pill[data-pill="1"]').click(); await page.waitForTimeout(500);
    ok('without the opt-in, ticking at a shop tells nobody', !((await cache()).shopping||{}).O, JSON.stringify((await cache()).shopping));
    await mk({ store:'dand', extra:'localStorage.setItem("ml_sayshop","1");' });
    await page.locator('#zoomer .pill[data-pill="1"]').click(); await page.waitForTimeout(500);
    const mine = ((await cache()).shopping||{}).O;
    ok('with it, ticking at Coles writes your name and the shop\'s — nothing else', mine && mine.store==='Coles Dandenong' && Math.abs(Date.now()-mine.at)<60000 && Object.keys(mine).sort().join()==='at,store', JSON.stringify(mine));
    await tap('#sweepBtn');
    ok('finishing the shop (Save to Regulars) takes it away', !((await cache()).shopping||{}).O, JSON.stringify((await cache()).shopping));
    await mk({ store:'home', extra:'localStorage.setItem("ml_sayshop","1");' });
    await page.locator('#zoomer .pill[data-pill="1"]').click(); await page.waitForTimeout(500);
    ok('…and at home, ticking says nothing (not a shop)', !((await cache()).shopping||{}).O, JSON.stringify((await cache()).shopping));
    await mk({ store:'dand', shopping:'{ O:{ store:"Coles Dandenong", at:T-60000 } }', extra:'localStorage.setItem("ml_sayshop","1");' });
    await tap('#setNav');
    ok('Settings › Users has the switch, on', await page.evaluate(()=>!!document.querySelector('[data-opt-sayshop="1"].on')), '');
    await tap('[data-opt-sayshop="0"]');
    ok('turning it off takes your name away at once', !((await cache()).shopping||{}).O && await page.evaluate(()=>localStorage.getItem('ml_sayshop'))==='0', JSON.stringify((await cache()).shopping));

    /* ── R21 lists for occasions ────────────────────────────────────────── */
    await mk({ shopping:'{ Sam:{ store:"Coles Dandenong", at:T-60000 } }' });
    await tap('#setNav');
    await tap('#optOccSave');
    await page.locator('#occName').fill('BBQ');
    await tap('#occSaveGo');
    let ts = (await cache()).templates||[];
    ok('what is still to buy saves as an occasion, under its name', ts.length===1 && ts[0].name==='BBQ' && ts[0].items.length===3 && ts[0].items.find(x=>x.name==='Ice').note==='2 bags', JSON.stringify(ts));
    await tap('#optOccSave'); await page.locator('#occName').fill('bbq'); await tap('#occSaveGo');
    ts = (await cache()).templates||[];
    ok('…saving the same name again replaces it, not a second one', ts.length===1 && ts[0].name==='bbq', JSON.stringify(ts.map(t=>t.name)));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#optBackup').click()]);
    const bk = JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    ok('a backup carries the occasions — and not who is shopping (presence, not data)', bk.list && Array.isArray(bk.list.templates) && bk.list.templates.length===1 && !('shopping' in bk.list), JSON.stringify(Object.keys(bk.list||{})));

    const OCC = [{ id:'t1', name:'Camping', at:1, items:[{name:'Sausages',cat:'meat',qty:6,weight:'',note:'',where:''},{name:'Marshmallows',cat:'others',qty:1,weight:'',note:'big bag',where:''}] }];
    await mk({ items:[it('1','Sausages','meat',2)], templates:OCC });
    await tap('#setNav');
    ok('"Add an occasion" says how many there are', /Add an occasion to the list \(1\)/.test(await page.evaluate(()=>(document.querySelector('#optOccAdd')||{}).textContent||'')), '');
    await tap('#optOccAdd');
    await tap('[data-occadd="t1"]');
    const items = (await cache()).items;
    ok('adding Camping puts its things on the list — Sausages raised to 6, not a second tile; Marshmallows new, with its note',
       items.filter(i=>i.name==='Sausages').length===1 && items.find(i=>i.name==='Sausages').qty===6 && (items.find(i=>i.name==='Marshmallows')||{}).note==='big bag', JSON.stringify(items.map(i=>i.name+'×'+i.qty)));
    const toast = await page.evaluate(()=>(document.querySelector('#toast')||{}).textContent||'');
    ok('…and says what it did', /Added 1 from “Camping” · 1 already on the list/.test(toast), toast);
    await tap('#undoBtn');
    const undone = (await cache()).items;
    ok('…and a whole occasion comes off again with one Undo', undone.length===1 && undone[0].name==='Sausages' && undone[0].qty===2, JSON.stringify(undone.map(i=>i.name+'×'+i.qty)));
    await tap('#optOccAdd');
    await tap('[data-occdel="t1"]');
    ok('an occasion can be deleted, with Undo', ((await cache()).templates||[]).length===0 && /deleted/.test(await page.evaluate(()=>(document.querySelector('#toast')||{}).textContent||'')), '');
    await tap('#undoBtn');
    ok('…and Undo brings it back', ((await cache()).templates||[]).length===1, JSON.stringify((await cache()).templates));

    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the sync\'s rebuild of the list names both new fields (the fixed-shape trap)', /shopping:\s*d\.shopping\s*\|\|\s*\{\}/.test(src) && /templates:\s*Array\.isArray\(d\.templates\)/.test(src), '');
    const ex = (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]);
    ok('the opt-in survives applying an appearance slot (in both exclude lists)', ex.length===2 && ex.every(x=>/ml_sayshop\$/.test(x)), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
