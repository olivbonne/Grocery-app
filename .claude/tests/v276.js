/* v2.76 — Edit item: Unit counters (pack in twos, grams by 100, kilos and litres by 0.5), the flags fit their text in a
   variable layout, an opened row stays where it is, one text size with the name bigger, the whole shop list; "If on sale";
   a Regular not on the list has Where to buy, Urgent and If on sale, carried onto the list when it is added.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the Unit choices are Unit / cup / tsp / Tbsp, then four counters: Pack 2–12 in twos, g by 100 to 900, kg and L by 0.5; a tap
     sets the amount and the choices stay open; "500g" already on an item shows in the g counter;
   - the flag reads "If on sale";
   - with Rows 2, opening Unit leaves its row where it was (Quantity and Unit stay side by side), the choices below;
   - with Rows "variable", Urgent and If on sale are as wide as their text;
   - the labels, values and buttons share one size; the name is bigger;
   - a Regular not on the list: its Edit item has Where to buy, Urgent and If on sale; Urgent saved there comes onto the list
     with it;
   - the Shop ⋯ menu shows every shop (no clipped box).

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
const now = Date.now();
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[{id:"cdan",name:"Dandenong market",aisles:[]}], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_cache_v101", JSON.stringify(${JSON.stringify(o.doc||DOC())}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const D = (x)=>DOC(Object.assign({ items:[it("1","Yogurt","dairy",{ qty:3, weight:"500g" })] }, x||{}));
    const val = (u)=>page.evaluate(u=>{ const r=[...document.querySelectorAll('#sheet .wcount')].find(r=>r.querySelector('[data-wstep$="|'+u+'|+1"]')); return r ? r.querySelector('.wcount-v').textContent.trim() : null; }, u);

    /* 1. the Unit choices */
    await mk({ doc:D() });
    await hold(page.locator('.pill[data-pill="1"]').first());
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(400);
    const ch = await page.evaluate(()=>({ chips:[...document.querySelectorAll('#sheet .wgrid [data-w-set]')].map(b=>b.textContent.trim()), counters:[...document.querySelectorAll('#sheet .wcount')].map(r=>r.querySelector('.editsec-l').textContent.trim()) }));
    ok('the Unit choices are Unit, cup, tsp, Tbsp, then counters for Pack, g, kg and L', JSON.stringify(ch.chips)==='["Unit","cup","tsp","Tbsp"]' && JSON.stringify(ch.counters)==='["Pack","g","kg","L"]', JSON.stringify(ch));
    ok('…"500g" already on the item shows in the g counter', await val('g')==='500g', await val('g'));
    await page.locator('#sheet [data-wstep="edit|g|+1"]').click(); await page.waitForTimeout(300);
    ok('…+ on g makes it 600g, and the choices stay open', await val('g')==='600g' && await page.locator('#sheet .wgrid').count()===1, await val('g'));
    for(let k=0;k<5;k++){ await page.locator('#sheet [data-wstep="edit|g|+1"]').click(); await page.waitForTimeout(150); }
    ok('…grams stop at 900', await val('g')==='900g', await val('g'));
    await page.locator('#sheet [data-wstep="edit|pack|+1"]').click(); await page.waitForTimeout(300);
    await page.locator('#sheet [data-wstep="edit|pack|+1"]').click(); await page.waitForTimeout(300);
    ok('Pack counts in twos from 2 ("4 pack" after two taps), and the g counter empties', await val('pack')==='4 pack' && await val('g')==='—', (await val('pack'))+' / '+(await val('g')));
    await page.locator('#sheet [data-wstep="edit|kg|+1"]').click(); await page.waitForTimeout(250);
    await page.locator('#sheet [data-wstep="edit|kg|+1"]').click(); await page.waitForTimeout(250);
    await page.locator('#sheet [data-wstep="edit|kg|+1"]').click(); await page.waitForTimeout(250);
    ok('kg goes by 0.5 (1.5kg after three taps)', await val('kg')==='1.5kg', await val('kg'));
    await page.locator('#sheet [data-wstep="edit|L|+1"]').click(); await page.waitForTimeout(250);
    await page.locator('#sheet [data-wstep="edit|L|+1"]').click(); await page.waitForTimeout(250);
    ok('L goes by 0.5 (1L after two taps)', await val('L')==='1L', await val('L'));
    await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    ok('…and Save keeps "1L"', await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')).items[0].weight)==='1L', '');

    /* 2. the flag's name, the font sizes */
    await hold(page.locator('.pill[data-pill="1"]').first());
    const fs1 = await page.evaluate(()=>{ const s=document.querySelector('#sheet'), f=e=>e?getComputedStyle(e).fontSize:null;
      return { flags:[...s.querySelectorAll('.flagchip')].map(b=>b.textContent.trim()), title:f(s.querySelector('.edtitle')),
        rest:[...new Set([f(s.querySelector('.editsec-l')), f(s.querySelector('.edval')), f(s.querySelector('.flagchip')), f(s.querySelector('#saveBtn')), f(s.querySelector('#delBtn')), f(s.querySelector('.eqty span'))])] }; });
    ok('the flag reads "If on sale"', fs1.flags.includes('If on sale') && !fs1.flags.some(x=>/discounted/i.test(x)), JSON.stringify(fs1.flags));
    ok('labels, values, flags and buttons share one size; the name is bigger', fs1.rest.length===1 && parseFloat(fs1.title)>parseFloat(fs1.rest[0]), JSON.stringify(fs1));

    /* 3. rows 2: an opened Unit stays put; variable: flags fit their text */
    await mk({ doc:D(), extra:'localStorage.setItem("ml_lk_edit_rows","2");' });
    await hold(page.locator('.pill[data-pill="1"]').first());
    await page.locator('#sheet [data-w-open]').click(); await page.waitForTimeout(400);
    const g = await page.evaluate(()=>{ const r=s=>document.querySelector('#sheet .edcell[data-row="'+s+'"]'), q=r('qty').getBoundingClientRect(), u=document.querySelector('#sheet [data-w-open]').getBoundingClientRect(), w=document.querySelector('#sheet .wgrid').getBoundingClientRect(), e=document.querySelector('#sheet .edrows').getBoundingClientRect();
      return { sameLine:Math.abs(q.top-u.top)<3, beside:u.left>q.right-1, below:w.top>=u.bottom-1, full:Math.abs(w.width-e.width)<3 }; });
    ok('Rows 2: opening Unit leaves it beside Quantity; its choices go below, full width', g.sameLine && g.beside && g.below && g.full, JSON.stringify(g));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-rows2.png') });
    await mk({ doc:D(), extra:'localStorage.setItem("ml_lk_edit_rows","v");' });
    await hold(page.locator('.pill[data-pill="1"]').first());
    const fl = await page.evaluate(()=>[...document.querySelectorAll('#sheet .flagchip')].map(b=>({ w:b.getBoundingClientRect().width, sw:b.scrollWidth })));
    const rowW = await page.evaluate(()=>document.querySelector('#sheet .edflags').getBoundingClientRect().width);
    ok('Rows variable: Urgent and If on sale are as wide as their text', fl.length===2 && fl.every(f=>f.w < rowW*0.45), JSON.stringify({ fl, rowW }));

    /* 4. a Regular not on the list */
    await mk({ doc:D({ buyAgain:[{ name:"Rice", cat:"bulk", qty:1, weight:"", ts:1 }], stores:[{ id:"cdan", name:"Dandenong market", aisles:[] }] }) });
    await page.locator('[data-regc="bulk"]').click(); await page.waitForTimeout(400);
    await hold(page.locator('.pill[data-reg-add^="Rice|"]').first());
    const rg = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); return s ? { where:!!s.querySelector('#ewHead'), flags:[...s.querySelectorAll('.flagchip')].map(b=>b.textContent.trim()) } : null; });
    ok('a Regular not on the list: Edit item has Where to buy, Urgent and If on sale', rg && rg.where && rg.flags.includes('Urgent') && rg.flags.includes('If on sale'), JSON.stringify(rg));
    await page.locator('#sheet .flagchip', { hasText:'Urgent' }).click(); await page.waitForTimeout(300);
    await page.locator('#ewHead').click(); await page.waitForTimeout(300);
    await page.locator('#sheet [data-ew="cdan"]').click(); await page.waitForTimeout(300);
    await page.locator('#saveBtn').click(); await page.waitForTimeout(500);
    let c = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));
    const rice = (c.buyAgain||[]).find(b=>b.name==='Rice');
    ok('…saved on the Regular: Urgent and the shop', rice && (rice.tags||[]).includes('urgent') && rice.where==='cdan', JSON.stringify(rice));
    await page.locator('.pill[data-reg-add^="Rice|"]').first().click(); await page.waitForTimeout(500);
    c = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')));
    const ri = (c.items||[]).find(i=>i.name==='Rice');
    ok('…and added to the list, it comes Urgent, for that shop', ri && (ri.tags||[]).includes('urgent') && ri.where==='cdan', JSON.stringify(ri));

    /* 5b. a note is centred on its tile */
    await mk({ doc:D({ items:[it("1","Yogurt","dairy",{ note:"greek, high protein" }), it("2","Milk","dairy",{ note:"soy" })] }), extra:'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_largecols","2");' });
    const al = await page.evaluate(()=>[...document.querySelectorAll('.shop .pill .pnote')].map(n=>getComputedStyle(n).textAlign));
    ok('an item\'s note is centred on its tile', al.length>=2 && al.every(a=>a==='center'), JSON.stringify(al));

    /* 5. the ⋯ menu's shop list */
    const many = Array.from({length:16},(_,i)=>({ id:'c'+i, name:'Shop number '+(i+1), aisles:[] }));
    await mk({ doc:D({ stores:many }) });
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const sm = await page.evaluate(()=>{ const b=document.querySelector('.smstores'); return { clip:b.scrollHeight>b.clientHeight+1, n:b.querySelectorAll('[data-sm-store]').length }; });
    ok('the Shop ⋯ menu shows every shop (no clipped box)', !sm.clip && sm.n>=19, JSON.stringify(sm));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
