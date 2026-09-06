/* v1.80 — tiles of your own: a label, an optional emoji, and one thing the tile does, with the same
   geometry and colour controls the three built-in tiles got in v1.78.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a button appears":
   - a tile is made through the real control and lands somewhere you can see and reach;
   - each of the six actions actually DOES its thing, from more than one page — a shortcut that only
     works on the page it was made on is not a shortcut;
   - the tiles survive a relaunch, and deleting one leaves the others alone;
   - an install with no tiles is byte-for-byte the app without this feature — no strip, no clearance
     taken from the list, nothing floating over the add sheet;
   - the shared colRow machinery is untouched: the sixteen fixed colour rows still work.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.76: find a row by the control it carries, not by a label that may not be unique.
   - v1.77: the Lists page's nav carries its own ids; Playwright scrolls a control into view before
     clicking, so take any scroll baseline after that. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const SEED = (extra)=>`(() => {
  const items=[];
  for(let n=0;n<8;n++) items.push({id:"i"+n,name:"item"+n,qty:1,cat:n%2?"meat":"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  items[0].checked=true;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items,
    buyAgain:[{name:"kiwi",cat:"fruit",qty:1,weight:"",sub:"",ts:9}],
    baTomb:{}, stores:[], storeMeta:{}, members:["O"],
    categories:[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]},
                {id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}],
    name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0 }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:["fruit"]}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
  ${extra||""}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(extra)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED(extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(900); };
  /* v1.87: each page's nav carries its own ids (the v1.77 note above) — with the Lists page gone the
     set is Shop / Plan / Settings, so the helpers name all three variants rather than the old L pair. */
  const settings = ()=>tap('#setNav, #setNavP, #setNavS');
  const shop = ()=>tap('#cartNav, #cartNavP, #cartNavS');
  const openTiles = async()=>{ await settings();
    const h=page.locator('.optsect[data-sect="Bars and overlays"]');
    await h.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const btn=page.locator('#addUserTile');
    await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); };
  const makeTile = async()=>{ await openTiles();
    await page.locator('#addUserTile').click(); await page.waitForTimeout(600); };
  const tileGeo = ()=>page.evaluate(()=>{
    const strip=document.querySelector('#utiles'); const t=document.querySelector('.utile');
    const vw=window.innerWidth, vh=window.innerHeight;
    if(!t) return { n:0, strip:!!strip };
    const r=t.getBoundingClientRect();
    return { n:document.querySelectorAll('.utile').length, strip:!!strip,
             x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height),
             onScreen: r.top>=0 && r.bottom<=vh && r.left>=0 && r.right<=vw,
             label:t.textContent.trim(), rad:getComputedStyle(t).borderTopLeftRadius,
             bg:getComputedStyle(t).backgroundColor };
  });

  // ═══════════════════════════════════════════════════════════════════
  // NOTHING UNTIL YOU MAKE ONE
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  const bare = await page.evaluate(()=>({
    strip: !!document.querySelector('#utiles'),
    tiles: document.querySelectorAll('.utile').length,
    padb: (()=>{ const z=document.getElementById('zoomer'); const zw=z&&z.parentElement;
      return zw?Math.round(parseFloat(getComputedStyle(zw).paddingBottom||'0')):null; })() }));
  ok('an install with no tiles has no strip at all', bare.strip===false && bare.tiles===0, JSON.stringify(bare));

  // ═══════════════════════════════════════════════════════════════════
  // MAKING ONE
  // ═══════════════════════════════════════════════════════════════════
  await makeTile();
  await shop();
  const first = await tileGeo();
  ok('the ＋ button makes a tile', first.n===1, JSON.stringify(first));
  ok('…and it lands somewhere you can actually see and reach', first.onScreen===true, JSON.stringify(first));
  ok('…on the right, where a thumb is', first.x > 195, JSON.stringify({x:first.x, w:first.w}));

  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
  ok('…and it survives a relaunch', (await tileGeo()).n===1, '');

  // ═══════════════════════════════════════════════════════════════════
  // IT SHOWS EVERYWHERE, AND HIDES WITH THE ADD SHEET
  // ═══════════════════════════════════════════════════════════════════
  await settings();
  ok('the tile is there on Settings too', (await page.locator('.utile').count())===1, '');
  /* SUPERSEDED by v1.87: "every page" was Settings, Lists and Shop; the Lists page is gone, so the
     third page is Plan. What is being proved — a tile shows on every page, not just the one it was
     made on — is unchanged. */
  await tap('#planNav, #planNavP, #planNavS');
  ok('…and on Plan (v1.87: was Lists)', (await page.locator('.utile').count())===1, '');
  await shop();
  await page.locator('#shopAddFab').click(); await page.waitForTimeout(2200);
  const overSheet = await page.evaluate(()=>{ const s=document.querySelector('#utiles');
    return { present:!!s, shown: s ? getComputedStyle(s).display!=='none' : false }; });
  ok('…but nothing floats over an open add sheet', overSheet.shown===false, JSON.stringify(overSheet));
  await page.locator('#addDone').click(); await page.waitForTimeout(1600);
  ok('…and it comes back when the sheet closes', (await page.locator('.utile').count())===1, '');

  // ═══════════════════════════════════════════════════════════════════
  // WHAT IT DOES — every action, driven from a page that is not its target
  // ═══════════════════════════════════════════════════════════════════
  const setAct = async(act)=>{ await settings();
    const b=page.locator(`[data-tile-act$="|${act}"]`).first();
    await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(600); };
  const pageNow = ()=>page.evaluate(()=>document.querySelector('.optpage') ? 'settings'
    : document.querySelector('.planweek') ? 'plan'
    : document.querySelector('#zoomer') ? 'shop' : 'unknown');

  /* SUPERSEDED by v1.87: the "lists" action pointed at a page that no longer exists. Tiles carrying it
     are already on people's phones, so it was repointed at the switcher rather than orphaned into the
     default case — and that is what this now proves. */
  await setAct('lists');
  await shop();
  await page.locator('.utile').click(); await page.waitForTimeout(1000);
  ok('the Lists shortcut opens the list switcher, from the Shop page (v1.87)',
     (await page.locator('#listsSheetEl').count())===1, String(await page.locator('#listsSheetEl').count()));
  await page.evaluate(()=>{ const b=document.querySelector('#listsBg'); if(b) b.click(); });
  await page.waitForTimeout(700);

  await setAct('shop');
  await tap('#planNav, #planNavP, #planNavS');   // v1.87: driven from Plan, since Lists is gone
  await page.locator('.utile').click(); await page.waitForTimeout(1000);
  ok('the Shop shortcut goes to Shop, from the Plan page (v1.87)', (await pageNow())==='shop', await pageNow());

  await setAct('settings');
  await shop();
  await page.locator('.utile').click(); await page.waitForTimeout(1000);
  ok('the Settings shortcut goes to Settings', (await pageNow())==='settings', await pageNow());

  await setAct('add');
  await shop();
  await page.locator('.utile').click(); await page.waitForTimeout(2200);
  ok('the Add shortcut opens the add sheet', (await page.locator('#addSheet').count())>0, '');
  await page.locator('#addDone').click(); await page.waitForTimeout(1600);

  await setAct('finish');
  await shop();
  await page.locator('.utile').click(); await page.waitForTimeout(1200);
  ok('the Finish shortcut reaches the finish flow (there is a checked item to finish)',
     await page.evaluate(()=>!!document.querySelector('#finishSave, .finishsheet, [id*="finish" i]')), '');
  await page.keyboard.press('Escape').catch(()=>{});
  await mk('localStorage.setItem("ml_tiles", localStorage.getItem("ml_tiles")||"[]");');

  // the category jump needs a category chosen as well as the action
  await makeTile();
  await settings();
  await page.locator('[data-tile-act$="|cat"]').first().click(); await page.waitForTimeout(600);
  const catChip = page.locator('[data-tile-cat$="|meat"]').first();
  ok('choosing the category action reveals a category picker', await catChip.count()>0, '');
  await catChip.scrollIntoViewIfNeeded(); await catChip.click(); await page.waitForTimeout(600);
  await shop();
  await page.locator('.utile').click(); await page.waitForTimeout(1200);
  ok('the category shortcut opens that category to add into',
     await page.evaluate(()=>{ const i=document.querySelector('#catInput');
       return !!i && /meat/i.test(i.getAttribute('placeholder')||''); }),
     await page.evaluate(()=>{ const i=document.querySelector('#catInput'); return i?i.getAttribute('placeholder'):'no box'; }));

  // ═══════════════════════════════════════════════════════════════════
  // THE SAME CONTROLS THE BUILT-IN TILES HAVE
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await makeTile();
  await shop();
  const before = await tileGeo();
  await settings();
  const bumpT = async(k,d,n)=>{ for(let i=0;i<n;i++){
    const b=page.locator(`[data-tile-num$="|${k}|${d}"]`).first();
    await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(220); } };
  await bumpT('y','-1',5);     // 5 × 4px up
  await shop();
  const movedUp = await tileGeo();
  ok('Down moves a tile of your own', movedUp.y === before.y - 20,
     JSON.stringify({was:before.y, now:movedUp.y}));

  await settings();
  await bumpT('r','1',4);      // 8px
  await shop();
  ok('Corner shapes it', Math.round(parseFloat((await tileGeo()).rad))===8, (await tileGeo()).rad);

  await settings();
  const colBtn = page.locator('[data-tile-col$="|blue"]').first();
  await colBtn.scrollIntoViewIfNeeded(); await colBtn.click(); await page.waitForTimeout(600);
  await shop();
  ok('and it takes a colour', (await tileGeo()).bg==='rgb(30, 111, 217)', (await tileGeo()).bg);

  await settings();
  const alphaBtn = page.locator('[data-tile-alpha$="|-1"]').first();
  await alphaBtn.scrollIntoViewIfNeeded(); await alphaBtn.click(); await page.waitForTimeout(600);
  await shop();
  ok('…with the transparency in the colour, as everywhere else',
     /rgba\(30, 111, 217, 0\.95\)/.test((await tileGeo()).bg), (await tileGeo()).bg);

  // ═══════════════════════════════════════════════════════════════════
  // TWO TILES, AND DELETING ONE
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await makeTile();
  await makeTile();
  await shop();
  ok('a second tile stacks above the first', (await page.locator('.utile').count())===2, '');
  await settings();
  const del = page.locator('[data-tile-del]').first();
  await del.scrollIntoViewIfNeeded(); await del.click(); await page.waitForTimeout(700);
  await shop();
  ok('deleting one leaves the other', (await page.locator('.utile').count())===1, '');

  // ═══════════════════════════════════════════════════════════════════
  // NOT CHANGED — the sixteen shared colour rows are untouched
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await settings();
  /* TEST BUG (fixed): I wrote sixteen from memory of v1.76. v1.78 added the search bar's own row, so
     the fixed set is seventeen — and the number is only worth asserting alongside WHICH they are,
     which is what would actually catch a tile row leaking into the shared count. */
  const fixed = await page.evaluate(()=>[...document.querySelectorAll('.optrow-col')].map(r=>{
    const sw=r.querySelector('[data-opt-accent],[data-opt-textcol],[data-opt-cattext],[data-opt-topbar],[data-opt-navbar],[data-opt-srchbar],[data-opt-cathdbg],[data-opt-cathdbrd],[data-opt-reghdtext],[data-opt-reghdbg],[data-opt-reghdbrd],[data-opt-tilebg],[data-opt-tilebrd],[data-opt-tiletext],[data-opt-utilebg],[data-opt-utilebrd],[data-opt-utiletext],[data-tile-col]');
    return sw?[...sw.attributes].map(a=>a.name).find(n=>/^data-/.test(n)):'??'; }));
  ok('the seventeen fixed colour rows are still there, and only those',
     fixed.length===17 && new Set(fixed).size===17 && !fixed.includes('data-tile-col') && !fixed.includes('??'),
     JSON.stringify(fixed));
  await page.locator('[data-opt-accent="blue"]').first().click(); await page.waitForTimeout(600);
  ok('…and one of them still works',
     await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--accent').trim().toLowerCase()==='#1e6fd9'), '');
  await shop();
  ok('the shop list still renders', (await page.locator('.pill').count())>0, '');
  ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,4).join(' | '));
  if(out) await page.screenshot({ path: out });
  await browser.close();
  let pass=0, fail=0;
  results.forEach(([n,c,x])=>{ if(c){pass++; console.log('PASS  '+n+(x?'   ['+x+']':''));} else {fail++; console.log('FAIL  '+n+(x?'   ['+x+']':''));} });
  console.log(`\n${pass}/${pass+fail} passed`);
})().catch(e=>{ console.log('HARNESS CRASH', e.message); process.exit(1); });
