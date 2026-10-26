/* v2.18 — Settings in two layers, with search (the app review of 11 October, R12: "Settings has outgrown one
   page"). Everyday settings first; the look — layout, colours, bars, headings, the tiles' colours and shape — on a
   page of its own behind "Customise the look"; and a search across both.

   WHAT THESE CHECKS HAVE TO PROVE: Settings opens on the everyday sections only, in order, with the search box on
   top; everyday Tiles holds what a tile shows (display, grouping, icons, Category icons, Icon style) and none of
   its colours; the look page shows exactly its five sections, titled, with a way back (‹ and the Settings tab),
   folded as an index on a new phone, and its controls still work; the search shows only matching rows (a word in
   a row, a section's name, a subhead), reaches the look page and says so on the header, spells colour either
   way, opens folded sections, says when nothing matches, comes back whole when cleared, survives a setting
   changed from the results, never rebuilds the page while typing, and is gone after leaving Settings; a header
   tap while searching folds nothing.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.07 the app reopens on the
   last page; v2.10 a fresh profile runs the v1.63 slot migration and reloads — seed ml_appmig163. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[]});
const L18 = [["Milk","fresh",2],["Bananas","fruit",6],["Rice","bulk",1]].map((x,i)=>it(String(i),x[0],x[1],x[2],x[3]));
/* coll: undefined = a new phone (no ml_optcoll at all); otherwise the folded section names */
const seed = (coll, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(L18)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_appmig163","1");
  ${coll===undefined ? '' : `localStorage.setItem("ml_optcoll", ${JSON.stringify(JSON.stringify(coll))});`}
  ${extra||''}
})()`;
/* SUPERSEDED by v2.20: everyday Settings gained "Memberships" (the 10% shop), between Prices and Predictions. Still
   protects: the everyday sections, in order, and none of the look page's. */
/* SUPERSEDED by v2.25: "Your data" (privacy page, leave, empty, forget — the review's R26) is a new everyday section, last.
   This still protects the order of the everyday sections and that no look section appears among them. */
/* SUPERSEDED by v2.30: Settings was regrouped (Sort+Sound → Shopping, Predictions/Prices/Memberships → Smart features, Plan → Plan & recipes, Users → People, Other → Lists & sharing + Help). */
const EVERYDAY = ["Appearance","Tiles","Shopping","Smart features","Plan & recipes","People","Lists & sharing","History","Help","Your data"];
/* SUPERSEDED by v2.63: the look page has a sixth section, "Edit item" (the editor's pill colours and shape). Still protected:
   exactly the look sections, in order, folded as an index. */
/* SUPERSEDED by v2.69: v2.63's "Edit item" look section became "Sheets" (every sliding sheet, chosen at its top). */
const LOOK = ["Layout & motion","Colour","Bars and overlays","Category headings","Tile colours and shape","Sheets"];

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(coll, extra)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(coll, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1400);
    await page.locator('#setNav').click(); await page.waitForTimeout(700); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  /* what is on screen: the section headers shown, and the rows shown under each */
  const view = ()=>page.evaluate(()=>{ const vis=e=>!!e && e.offsetParent!==null;
    const secs=[...document.querySelectorAll('.optpage .optsect')].filter(vis).map(h=>{ const b=h.nextElementSibling;
      const rows=b && vis(b) ? [...b.children].filter(vis).map(k=>{ const l=k.querySelector && k.querySelector(':scope > .optlabel'); return (l?l.textContent:k.textContent).replace(/\s+/g,' ').trim().slice(0,40); }) : [];
      return { name:h.dataset.sect, open:!!b && vis(b), tag:vis(h.querySelector('.optlayertag')), rows }; });
    const t=document.querySelector('.topfix .title'), s=document.querySelector('#optSearch'), n=document.querySelector('#optNoMatch');
    return { title:t?t.textContent.trim():'', back:!!document.querySelector('#lookBack'), search:vis(s), q:s?s.value:null,
      none:vis(n) ? n.textContent.trim() : '', secs, names:secs.map(x=>x.name) }; });
  const search = async(q)=>{ await page.locator('#optSearch').fill(q); await page.waitForTimeout(250); return view(); };

  try{
    /* ── layer 1: everyday ───────────────────────────────────────────── */
    await mk([]);
    let v = await view();
    ok('Settings opens on the everyday sections, in order, and none of the look ones', JSON.stringify(v.names)===JSON.stringify(EVERYDAY), JSON.stringify(v.names));
    ok('…with the search box at the top', v.search && await page.evaluate(()=>{ const s=document.querySelector('.optsearch'), h=document.querySelector('.optpage .optsect');
      return s.getBoundingClientRect().bottom <= h.getBoundingClientRect().top; }), '');
    const tiles = v.secs.find(x=>x.name==='Tiles')||{rows:[]};
    /* SUPERSEDED by v2.80: the display row is called "Tiles across". Still protected: everyday Tiles holds what a tile shows. */
    ok('everyday Tiles holds what a tile shows — display, grouping, icons, Category icons, Icon style', ['Tiles across','Group by category','Item icons','Category icons','Icon style'].every(l=>tiles.rows.some(r=>r.startsWith(l))), JSON.stringify(tiles.rows));
    ok('…and none of the tiles\' colours or shape', !tiles.rows.some(r=>/^(Tile appearance|Selected tiles|Unselected tiles|Tile roundness|Tile gap)/.test(r)), JSON.stringify(tiles.rows));
    ok('Appearance ends with "Customise the look"', ((v.secs.find(x=>x.name==='Appearance')||{rows:[]}).rows.slice(-1)[0]||'').startsWith('Customise the look'), JSON.stringify((v.secs[0]||{}).rows));
    await shot('everyday');

    /* ── layer 2: the look page ─────────────────────────────────────── */
    await tap('#optLook');
    v = await view();
    ok('"Customise the look" opens its own page, titled so, with ‹ back', v.title==='Customise the look' && v.back, JSON.stringify({t:v.title,b:v.back}));
    ok('…showing exactly the look sections, and no search box', JSON.stringify(v.names)===JSON.stringify(LOOK) && !v.search, JSON.stringify(v.names));
    const heads = v.secs.find(x=>x.name==='Category headings')||{rows:[]};
    ok('Category headings is colours only now', !heads.rows.some(r=>/^(Category icons|Icon style)/.test(r)) && heads.rows.length>=6, JSON.stringify(heads.rows));
    await shot('look');
    const rad0 = await page.evaluate(()=>{ const b=document.querySelector('[data-opt-num="rad"][data-opt-delta="1"]'); return b ? b.parentElement.querySelector('.numval').textContent : null; });
    await tap('[data-opt-num="rad"][data-opt-delta="1"]');
    const rad1 = await page.evaluate(()=>{ const b=document.querySelector('[data-opt-num="rad"][data-opt-delta="1"]'); return b ? b.parentElement.querySelector('.numval').textContent : null; });
    v = await view();
    ok('a look control still works there (Tile roundness +), and the page stays the look page', rad0!==null && rad1!==rad0 && v.title==='Customise the look', JSON.stringify({rad0,rad1,t:v.title}));
    await tap('#lookBack');
    v = await view();
    ok('‹ goes back to Settings', v.title==='Settings' && JSON.stringify(v.names)===JSON.stringify(EVERYDAY), JSON.stringify({t:v.title,n:v.names}));
    await tap('#optLook'); await tap('#setNav');
    v = await view();
    ok('…and so does the Settings tab, from the look page', v.title==='Settings' && !v.back, v.title);

    await mk(undefined);
    v = await view();
    ok('a new phone: every everyday section open, Tiles included', v.secs.every(s=>s.open), JSON.stringify(v.secs.map(s=>s.name+':'+s.open)));
    await tap('#optLook');
    v = await view();
    ok('…and the look page starts folded, as an index of its sections', v.secs.length===LOOK.length && v.secs.every(s=>!s.open), JSON.stringify(v.secs.map(s=>s.name+':'+s.open)));

    /* ── search ─────────────────────────────────────────────────────── */
    await mk([]);
    v = await search('wallpaper');
    ok('"wallpaper" leaves the Wallpaper row under Appearance, and nothing else', JSON.stringify(v.names)==='["Appearance"]' && v.secs[0].rows.length>=1 && v.secs[0].rows.every(r=>/^Wallpaper/.test(r)), JSON.stringify(v.secs));
    v = await search('roundness');
    ok('the search reaches the look page: "roundness" finds Tile roundness, its section marked "Customise the look"',
       /* SUPERSEDED by v2.63: "roundness" also finds Edit item's Roundness. Still protected: Tile roundness is found, tagged. */
       v.names[0]==='Tile colours and shape' && v.secs[0].tag && JSON.stringify(v.secs[0].rows)==='["Shape","Tile roundness"]' && v.names.every(n=>["Tile colours and shape","Sheets"].includes(n))   /* v2.69: Edit item → Sheets */, JSON.stringify(v.secs));
    v = await search('shopping');   // v2.30: Sort is Shopping
    ok('a section\'s name shows the whole section ("shopping")', v.names.includes('Shopping') && ((v.secs.find(s=>s.name==='Shopping')||{}).rows||[]).length>=3, JSON.stringify(v.secs.map(s=>s.name+':'+s.rows.length)));
    v = await search('in regulars');
    ok('a subhead shows with all its rows, and no more ("in regulars": the Regulars heading and tile colours)',
       JSON.stringify(v.names)==='["Category headings","Tile colours and shape"]' && v.secs.every(s=>JSON.stringify(s.rows.slice(1))==='["Text","Background","Border"]'), JSON.stringify(v.secs));
    const cu = (await search('colour')).secs.reduce((n,s)=>n+s.rows.length,0), co = (await search('color')).secs.reduce((n,s)=>n+s.rows.length,0);
    ok('"color" and "colour" find the same rows', cu>0 && cu===co, JSON.stringify({cu,co}));
    v = await search('xyzzy');
    ok('nothing found says so, and shows no section', v.none==='No settings match “xyzzy”.' && v.names.length===0, JSON.stringify(v));
    await tap('#optSearchClear');
    v = await view();
    const foc = await page.evaluate(()=>document.activeElement && document.activeElement.id);
    ok('× clears it: everyday Settings back whole, the look page\'s sections hidden again, the field empty and ready', JSON.stringify(v.names)===JSON.stringify(EVERYDAY) && v.q==='' && !v.none && foc==='optSearch', JSON.stringify({n:v.names,q:v.q,foc}));
    await page.evaluate(()=>{ document.querySelector('#optSearch').dataset.probe='1'; });
    await page.locator('#optSearch').pressSequentially('tex', { delay:40 }); await page.waitForTimeout(200);
    const same = await page.evaluate(()=>{ const s=document.querySelector('#optSearch'); return { probe:s && s.dataset.probe, focused:document.activeElement===s, val:s && s.value }; });
    ok('typing never rebuilds the page: the same field, still focused, keyboard up', same.probe==='1' && same.focused && same.val==='tex', JSON.stringify(same));
    v = await search('theme');
    await tap('[data-opt-theme="dark"]');
    const dark = await page.evaluate(()=>document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'));
    v = await view();
    ok('a setting changed from the results takes effect and keeps the results (Theme › Dark)', dark && v.q==='theme' && JSON.stringify(v.names)==='["Appearance"]', JSON.stringify({dark,q:v.q,n:v.names}));
    await search('location');
    await page.locator('.optsect[data-sect="Shopping"]').click(); await page.waitForTimeout(300);
    const coll = await page.evaluate(()=>localStorage.getItem('ml_optcoll'));
    v = await view();
    ok('a header tap while searching folds nothing', coll==='[]' && (v.secs.find(s=>s.name==='Shopping')||{rows:[]}).rows.some(r=>/^Location/.test(r)), JSON.stringify({coll, sort:v.secs.find(s=>s.name==='Shopping')}));
    await tap('#cartNav'); await tap('#setNav');
    v = await view();
    ok('leaving Settings clears the search', v.q==='' && JSON.stringify(v.names)===JSON.stringify(EVERYDAY), JSON.stringify({q:v.q,n:v.names}));

    await mk(["Shopping"]);
    v = await search('location');
    ok('a folded section opens for a match ("location" in a folded Shopping)', (v.secs.find(s=>s.name==='Shopping')||{rows:[]}).rows.some(r=>/^Location/.test(r)), JSON.stringify(v.secs));
    await shot('search');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
