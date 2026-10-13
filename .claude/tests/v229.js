/* v2.29 — the household's bug list (their items 1, 2, 3, 4, 7, 8, 9, 10, 11, 16).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (10) in small tiles with L or XL icons, an amount ("2×") no longer pushes the icon and the name out of the top of the
     tile — every tile's contents sit inside it (it overflowed by ~30px top and bottom: the amount's 100% basis was the
     tile's HEIGHT in a column tile);
   - (2) a tick teaches the AI shop order nothing until the shop is finished, and then only what is still ticked, in the
     order it was ticked — a wrong tap, untapped, is never learned;
   - (3) a new name typed in the add bar opens its details, like a Regular;
   - (4) after Save to Regulars the Undo message sits below the "Got the receipt?" card, not on it;
   - (8) the receipt sheet always shows the receipt's total;
   - (9) a page lock that outlived the add sheet is undone at the next touch and after every render (a source check);
   - (11) at the day's receipt limit the prompt still shows, and says so; the limit is 30;
   - (1) the cart's number pops around its own centre (a source check — iOS behaviour cannot be run here);
   - (7) the four edit sheets follow the keyboard (source check), (16) Export says it is the full list.

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
    await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ store:'Coles Dandenong', date:'2026-10-12', total:42.5,
      items:[{raw:'HONEY 500G',name:'honey',qty:1,weight:'',price:7.5,category:'bulk'}], discounts:[] }) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const ls = k=>page.evaluate(k=>localStorage.getItem(k), k);
  const pill = id=>page.locator(`#zoomer .pill[data-pill="${id}"]:visible`).first();   // visible: the urgent strip keeps hidden copies

  try{
    /* (10) tiles */
    for(const [tag, ls2] of [['small, 3 columns, L icons','localStorage.setItem("ml_smallcols","3");localStorage.setItem("ml_icosize","l");'],
                             ['small, 4 columns, XL icons','localStorage.setItem("ml_smallcols","4");localStorage.setItem("ml_icosize","xl");']]){
      await mk({ extra:`localStorage.setItem("ml_displays",JSON.stringify({shop:"small"})); localStorage.setItem("ml_caton","0"); ${ls2}` });
      const bad = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(t=>{ const r=t.getBoundingClientRect(), k=[...t.children].filter(c=>c.getBoundingClientRect().height);
        return { n:(t.querySelector('.pname')||{}).textContent, top:Math.round(Math.min(...k.map(c=>c.getBoundingClientRect().top))-r.top), bot:Math.round(r.bottom-Math.max(...k.map(c=>c.getBoundingClientRect().bottom))) }; }).filter(x=>x.top<0||x.bot<0));
      ok(`(10) ${tag}: every tile's icon, name and amount sit inside it`, bad.length===0, JSON.stringify(bad));
      if(out && tag.startsWith('small, 3')) await page.screenshot({ path: out.replace(/\.png$/,'-tiles.png') });
    }

    /* (2) the AI order learns at the finish, from what is still ticked */
    await mk({ store:'dand', extra:'localStorage.setItem("ml_sorts", JSON.stringify({shop:"ai"}));' });
    await pill('1').click(); await page.waitForTimeout(500);
    /* a wrong tap, untapped: the tile is in the cart now, which opens folded */
    await page.locator('#checkedHead').click(); await page.waitForTimeout(400);
    await page.locator('#checkedbar .pill[data-pill="1"]:visible').first().click(); await page.waitForTimeout(500);
    await pill('4').click(); await page.waitForTimeout(300);
    await pill('8').click(); await page.waitForTimeout(300);
    const mid = JSON.parse(await ls('ml_aiitems_v101')||'{}');
    ok('(2) ticking teaches the shop order nothing yet', !Object.keys(mid.dand||{}).length, JSON.stringify(mid));
    await tap('#sweepBtn');
    const fin = (JSON.parse(await ls('ml_aiitems_v101')||'{}').dand)||{};
    ok('(2) finishing teaches it what was still ticked, in the order it was ticked — not the wrong tap',
       fin['cream|fresh']!==undefined && fin['honey|bulk']!==undefined && fin['cream|fresh'] < fin['honey|bulk'] && fin['salad rocket|vegetable']===undefined, JSON.stringify(fin));

    /* (3) a new name opens its details */
    await mk();
    await tap('#shopAddFab');
    await page.locator('#mainInput').fill('Zzyzx tea');
    await page.waitForTimeout(400);
    await page.locator('[data-add-typed]').first().click(); await page.waitForTimeout(600);
    const panel = await page.evaluate(()=>{ const n=document.querySelector('[data-ae-name]'); return n ? (n.value||n.textContent||'') : null; });
    ok('(3) a new name from the add bar opens its details, like a Regular', panel!==null && /Zzyzx tea/i.test(panel), JSON.stringify(panel));

    /* (4) Undo below the receipt card, and (11) the card at the limit */
    await mk({ store:'dand' });
    await pill('1').click(); await page.waitForTimeout(300);
    await tap('#sweepBtn'); await page.waitForTimeout(300);
    const geo = await page.evaluate(()=>{ const t=document.querySelector('#toast'), c=document.querySelector('#rcNudge'); if(!t||!c) return { t:!!t, c:!!c };
      const a=t.getBoundingClientRect(), b=c.getBoundingClientRect(); return { overlap: !(a.bottom<=b.top || a.top>=b.bottom), tTop:Math.round(a.top), cBot:Math.round(b.bottom) }; });
    ok('(4) after Save to Regulars the Undo message does not sit on the "Got the receipt?" card', geo.overlap===false, JSON.stringify(geo));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-undo.png') });
    const today = new Date(), dk = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    await mk({ store:'dand', extra:`localStorage.setItem("ml_rcptday","${dk}|30");` });
    await pill('1').click(); await page.waitForTimeout(300);
    await tap('#sweepBtn'); await page.waitForTimeout(300);
    const capCard = await page.evaluate(()=>(document.querySelector('#rcNudge')||{}).textContent||'');
    ok('(11) at the day\'s limit the receipt prompt still shows, and says so (the limit is 30)', /30 receipts read on this phone today/.test(capCard) && !/Read receipt/.test(capCard), capCard.replace(/\s+/g,' ').slice(0,200));

    /* (8) the receipt's total */
    await mk({ store:'dand' });
    await tap('#setNav');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRcpt').click()]);
    await fc.setFiles({ name:'r.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
    const sum = await page.evaluate(()=>(document.querySelector('.rcsum')||{}).textContent||'');
    ok('(8) the receipt sheet shows the total on the receipt, and what the lines read add up to', /Total on the receipt: \$42\.50/.test(sum) && /1 item kept · \$7\.50/.test(sum) && /\$35\.00 not in the lines read/.test(sum), sum);

    /* source checks */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), css = fs.readFileSync(path.join(ROOT,'app.css'),'utf8');
    ok('(1) the cart number pops around its own centre in the cart\'s units, not fill-box (which iOS ignores on SVG text)', /\.cartnum \{[^}]*transform-box:view-box; transform-origin:57\.24px 30px;/.test(css), '');
    ok('(7) the four edit sheets follow the keyboard', (src.match(/sheet-bg kbpin" id="sheetBg"/g)||[]).length===4 && /_kbSheetBot/.test(src), '');
    ok('(9) a page lock or keyboard offset that outlived its sheet is undone on the next touch and after every render (source: the stuck state cannot be made from outside the app)',
       /function healStuck\(\)\{/.test(src) && /if\(_locked && !addOpen && !_addClosing\)/.test(src) && /addEventListener\("touchstart", \(\) => \{ try\{ healStuck\(\); \}/.test(src) && /queueMicrotask\(\(\)=>\{ try\{ healStuck\(\); \}/.test(src), '');
    ok('(16) Export says it is the full list', /Export the full list — to buy and Regulars/.test(src), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
