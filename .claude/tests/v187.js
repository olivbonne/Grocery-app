/* v1.87 — the Lists page is gone and the nav is three tabs: Plan · Shop · Settings.
   Everything that page did lives on the list name at the top: v1.81 put the switcher there, v1.83 put
   the full set of options on a press-and-hold of a row. So the page was a second way to do the same
   things, and it goes.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a tab is missing":
   - nothing can still reach the page — no tab, no back arrow, no shortcut tile, no remembered index;
   - the page numbers moved for the SECOND time, so every tab from every page is walked, and a
     remembered page from the old numbering must not land somewhere silently wrong;
   - everything the page did is still doable: see every list, switch, rename, share, reorder, duplicate,
     delete, create. If any of that were only on the deleted page it would be gone for good;
   - a shortcut tile someone already made that pointed at the page still does something sensible;
   - the titles still line up. The shop page's real back arrow became the same empty placeholder the
     Plan page uses, precisely so v1.79's alignment survives losing the button it was measured against.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.80: assert a count AND the identity behind it.
   - v1.81: "the element exists" says nothing about whether it can be SEEN.
   - v1.82: addInitScript re-runs on every navigation, so a seed must be idempotent.
   - v1.83: not every action closes its sheet — dismiss explicitly rather than assuming.
   - v1.85: plan chips are pointer-event driven, so element.click() from page.evaluate fires nothing.
   - v1.86: dismiss whatever is open before opening the next thing. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const SEED = (extra)=>`(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]}];
  const base=(n,pre,name)=>{ const items=[]; for(let i=0;i<n;i++) items.push({id:pre+i,name:pre+i,qty:1,cat:"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
    return { items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name,
             baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[]} }; };
  localStorage.setItem("ml_cache_v101", JSON.stringify(base(3,"grocery","Groceries")));
  localStorage.setItem("ml_cache_v102", JSON.stringify(base(2,"screw","Hardware")));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"},{code:"v102",name:"Hardware"}]));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:[]}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
  ${extra||""}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[]; let promptSeen=null;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(extra)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    page.on('dialog', d=>{ promptSeen=d.message(); d.accept('Renamed here').catch(()=>{}); });
    await page.addInitScript(SEED(extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(850); };
  const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
    await page.mouse.move(b.x+b.width/2, b.y+b.height/2);
    await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
    await page.waitForTimeout(800); };
  const nav = ()=>page.evaluate(()=>[...document.querySelectorAll('.bottomnav .navbtn')].map(b=>({
    label:(b.querySelector('span:not(.cartwrap):not(.cartnum)')||{}).textContent,
    id:b.id, active:b.classList.contains('active') })));
  const where = ()=>page.evaluate(()=>document.querySelector('.optpage') ? 'settings'
    : document.querySelector('.planweek') ? 'plan'
    : document.querySelector('.listgrid') ? 'LISTS-STILL-HERE'
    : document.querySelector('#zoomer') ? 'shop' : 'unknown');

  try{
    /* ── 1. three tabs, and no way back to the page ─────────────────────── */
    await mk();
    let n = await nav();
    ok('the nav is three tabs', n.length===3, JSON.stringify(n.map(b=>b.label)));
    ok('…Plan · Shop · Settings, with Lists gone',
       n.map(b=>b.label).join('|')==='Plan|Shop|Settings', JSON.stringify(n.map(b=>b.label)));
    ok('we start on the shop', (await where())==='shop', await where());
    const gone = await page.evaluate(()=>({
      grid:document.querySelectorAll('.listgrid').length,
      btn:document.querySelectorAll('#listsBtn,#listsBtnL,#listsBtnP,#listsBtnS').length,
      back:document.querySelectorAll('#toLists').length,
      placeholder:!!document.querySelector('.topfix .backbtn') }));
    ok('nothing on the shop page points at the deleted page',
       gone.grid===0 && gone.btn===0 && gone.back===0, JSON.stringify(gone));
    /* SUPERSEDED by v1.90: keeping the space was this version's compromise — v1.90 removed it, so the
       title now starts at the tiles' left edge instead of where the arrow used to leave it. The slot must
       be empty, and the title must line up with the tiles; v179.js measures that across all three pages. */
    ok('…and its space is gone too, not held empty', gone.placeholder===false,
       JSON.stringify({ph:gone.placeholder}));

    /* nothing may be left in that slot at all — not a button, not an inert span */
    const ph = await page.evaluate(()=>{ const b=document.querySelector('.topfix .backbtn');
      return b ? { tag:b.tagName, txt:b.textContent.trim() } : null; });
    ok('…nothing at all is left where it was', ph===null, JSON.stringify(ph));

    /* ── 2. the titles still line up across the pages (v1.79) ───────────── */
    const titleX = async()=>page.evaluate(()=>Math.round(document.querySelector('.topfix .title').getBoundingClientRect().left));
    const shopX = await titleX();
    await tap('#planNav');
    const planX = await titleX();
    ok('the shop and plan titles still start at the same x', Math.abs(shopX-planX)<=1,
       JSON.stringify({shop:shopX, plan:planX}));

    /* ── 3. every tab from every page ───────────────────────────────────── */
    ok('Shop → Plan', (await where())==='plan', await where());
    await tap('#setNavP');
    ok('Plan → Settings', (await where())==='settings', await where());
    await tap('#setBack');
    ok('…and Settings goes back to where it was opened from', (await where())==='plan', await where());
    await tap('#cartNavP');
    ok('Plan → Shop', (await where())==='shop', await where());
    await tap('#setNav');
    ok('Shop → Settings', (await where())==='settings', await where());
    await tap('#setBack');
    ok('…and back to the shop this time', (await where())==='shop', await where());
    await tap('#planNavS, #planNav');
    ok('Settings → Plan is one tap from the nav', (await where())==='plan', await where());

    /* ── 4. the remembered page ─────────────────────────────────────────── */
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    const back = await page.evaluate(()=>({ page:document.querySelector('.planweek')?'plan':'other',
                                            k3:localStorage.getItem('ml_lastview3'),
                                            k2:localStorage.getItem('ml_lastview2') }));
    ok('a relaunch comes back to the page you were on', back.page==='plan', JSON.stringify(back));
    ok('…remembered under a key versioned for the new numbering', back.k3==='0' && back.k2===null, JSON.stringify(back));

    /* A device that updated from v1.86 has ml_lastview2 — under the OLD numbering 0 meant Lists.
       It must be ignored rather than read as the new 0, which is Plan. */
    await mk(`localStorage.setItem("ml_lastview2","0");`);
    const stale = await where();
    ok('a page remembered under the old numbering is ignored, not misread',
       stale==='shop', String(stale));

    /* ── 5. everything the page did is still doable ─────────────────────── */
    await tap('#listSwitch');
    const sh = await page.evaluate(()=>{ const s=document.querySelector('#listsSheetEl'); if(!s) return null;
      return { rows:[...document.querySelectorAll('.listpick')].map(r=>(r.querySelector('.lp-name')||{}).textContent),
               create:!!document.querySelector('#newList') }; });
    ok('every list is still listed, from the title', sh && sh.rows.length===2, JSON.stringify(sh&&sh.rows));
    ok('…and a new one can still be created', sh && sh.create===true, JSON.stringify({c:sh&&sh.create}));
    await hold(page.locator('.listpick[data-list="v102"]'));
    const act = await page.evaluate(()=>{ const s=document.querySelector('#listActSheet'); if(!s) return null;
      return ['laUp','laDown','laRename','laShare','laDup','laDelete'].filter(i=>!!document.getElementById(i)); });
    ok('…and holding one still gives every option the page gave',
       act && act.join('|')==='laUp|laDown|laRename|laShare|laDup|laDelete', JSON.stringify(act));
    await tap('#laRename');
    ok('…and they still work', /rename/i.test(promptSeen||''), String(promptSeen));
    await tap('#listSwitch');
    const renamed = await page.evaluate(()=>[...document.querySelectorAll('.lp-name')].map(x=>x.textContent));
    ok('…all the way through to the list', renamed.includes('Renamed here'), JSON.stringify(renamed));
    await page.evaluate(()=>{ const b=document.querySelector('#listsBg'); if(b) b.click(); });
    await page.waitForTimeout(600);

    /* the switcher is reachable from the Plan page too, which matters more now that it is the only route */
    await tap('#planNav');
    await tap('#listSwitch');
    ok('the switcher is reachable from the Plan page as well',
       (await page.locator('#listsSheetEl').count())===1, String(await page.locator('#listsSheetEl').count()));
    await page.evaluate(()=>{ const b=document.querySelector('#listsBg'); if(b) b.click(); });
    await page.waitForTimeout(600);

    /* ── 6. a shortcut tile that pointed at the page ────────────────────── */
    /* Tiles are made through Settings and stored on the device; one saying act:"lists" is already on
       people's phones. It must not fall through to "open Add" — it should open the thing that replaced
       the page. Seeded here because the control that MADE it no longer offers that page. */
    await mk(`localStorage.setItem("ml_tiles", JSON.stringify([{id:"t1",label:"Lists",emoji:"",act:"lists",cat:"",x:0,y:0,w:0,h:0,r:0,col:"auto",alpha:100,shade:0}]));`);
    ok('precondition: the old tile is on the page', (await page.locator('.utile').count())===1,
       String(await page.locator('.utile').count()));
    await tap('.utile');
    ok('an existing "go to Lists" tile opens the switcher instead',
       (await page.locator('#listsSheetEl').count())===1, String(await page.locator('#listsSheetEl').count()));
    ok('…and did not fall through to the add sheet', (await page.locator('#addSheet').count())===0,
       String(await page.locator('#addSheet').count()));

    ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,3).join(' | '));
    if(out) await page.screenshot({ path: out, fullPage:false });
  }catch(e){ ok('suite ran to completion', false, String(e && e.message).slice(0,200)); }

  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
