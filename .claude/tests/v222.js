/* v2.22 — a note on an item (the app review's R16, without photos) and where to buy it (R17).

   WHAT THESE CHECKS HAVE TO PROVE: a note and a shop show as the tile's last line ("Asian Richmond · firm"), and only
   the note when you are AT that shop; at home every item stays in its category; at another shop, what is for another
   one leaves its category (a category left empty goes) and waits, folded, under "For other shops" with its count,
   grouped by shop when opened, still tickable; the edit sheet writes both (a note box, "Where to buy" with Anywhere and
   the saved shops); Regulars remember both, and a Regular added back brings them with it; text that leaves the app
   says them too. In every kind of tile the note sits under the name without taking its room, and a long note ends in
   "…" instead of pushing its tile off the screen.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.20 a row is
   found by an anchored name (hasText ignores case). Long-press = pointerdown, 600 ms, pointerup (the app waits 450). */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,o)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, o||{});
const ITEMS = [it('1','Tofu','asian',{note:'firm',where:'asri'}), it('2','Soy sauce','asian',{where:'asri'}), it('3','Milk','fresh'), it('4','Rice','bulk',{note:'jasmine 5kg'})];
const seed = (store, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${store||'home'}");
  ${extra||''}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(store, extra)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(`window.__shared=null; navigator.share = async (d)=>{ window.__shared=d; };`);
    await page.addInitScript(seed(store, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  /* every tile on the list (not the cart): its name, its last line, the section it sits in */
  const tiles = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].filter(p=>p.offsetParent!==null).map(p=>{ const s=p.closest('section');
    return { n:(p.querySelector('.pname')||{}).textContent, note:(p.querySelector('.pnote')||{}).textContent||null,
      sec: s ? (s.classList.contains('elsewhere') ? 'elsewhere' : ((s.querySelector('[data-cat]')||{}).dataset||{}).cat||'?') : '?' }; }));
  const T = (a,n)=>a.find(x=>x.n===n);

  try{
    /* ── at home: everything in its place, saying which shop ───────────── */
    await mk('home');
    let t = await tiles();
    ok('at home every item stays in its category', T(t,'Tofu') && T(t,'Tofu').sec==='asian' && T(t,'Soy sauce').sec==='asian' && T(t,'Milk').sec==='fresh', JSON.stringify(t));
    ok('…a tile\'s last line says which shop and its note', T(t,'Tofu').note==='Asian Richmond · firm' && T(t,'Soy sauce').note==='Asian Richmond' && T(t,'Rice').note==='jasmine 5kg' && T(t,'Milk').note===null, JSON.stringify(t.map(x=>[x.n,x.note])));
    ok('…and no "For other shops" at home', !(await page.locator('#elseToggle').count()), '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-home.png') });

    /* ── at another shop ────────────────────────────────────────────────── */
    await mk('dand');
    t = await tiles();
    ok('at Coles, the Asian Richmond things leave the list (and the Asian category, now empty, goes)', !T(t,'Tofu') && !T(t,'Soy sauce') && T(t,'Milk') && T(t,'Rice')
       && !(await page.evaluate(()=>!!document.querySelector('#zoomer [data-cat="asian"]'))), JSON.stringify(t));
    const eh = await page.evaluate(()=>{ const b=document.querySelector('#elseToggle'); return b ? { t:b.textContent.replace(/\s+/g,' ').trim(), x:b.getAttribute('aria-expanded') } : null; });
    ok('…and wait, folded, under "For other shops" with their count', eh && /For other shops 2 ▸/.test(eh.t) && eh.x==='false', JSON.stringify(eh));
    await tap('#elseToggle');
    t = await tiles();
    const hd = await page.evaluate(()=>[...document.querySelectorAll('.elsehd')].map(e=>e.textContent));
    ok('opened, they are grouped by shop', JSON.stringify(hd)==='["Asian Richmond"]' && T(t,'Tofu') && T(t,'Tofu').sec==='elsewhere' && T(t,'Soy sauce').sec==='elsewhere', JSON.stringify({hd, t}));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-away.png') });
    await page.locator('#zoomer .pill[data-pill="2"]').click(); await page.waitForTimeout(500);
    ok('…and still tickable from there', ((await cache()).items.find(i=>i.id==='2')||{}).checked===true, '');

    /* ── at the item's own shop ─────────────────────────────────────────── */
    await mk('asri');
    t = await tiles();
    ok('at Asian Richmond its things are on the list as usual, the tile saying only the note', T(t,'Tofu') && T(t,'Tofu').sec==='asian' && T(t,'Tofu').note==='firm' && T(t,'Soy sauce').note===null
       && !(await page.locator('#elseToggle').count()), JSON.stringify(t));

    /* ── the edit sheet ─────────────────────────────────────────────────── */
    await mk('home');
    const milk = page.locator('#zoomer .pill[data-pill="3"]');
    await milk.dispatchEvent('pointerdown'); await page.waitForTimeout(600); await milk.dispatchEvent('pointerup'); await page.waitForTimeout(500);
    /* SUPERSEDED by v2.57: the note is a folded section like Category (the household's item 11) — open it first.
       Still protects: the editor has a note box and "Where to buy: Anywhere". */
    if(await page.locator('#enHead').count()){ await page.locator('#enHead').click(); await page.waitForTimeout(400); }
    ok('a long press opens the editor, with a note box and "Where to buy: Anywhere"', await page.locator('#editNote').count()===1
       && /Where to buy\s*Anywhere/.test(await page.evaluate(()=>(document.querySelector('#ewHead')||{}).textContent||'')), '');
    await page.locator('#editNote').fill('2L full cream');
    await tap('#ewHead');
    const chips = await page.evaluate(()=>[...document.querySelectorAll('[data-ew]')].map(b=>b.textContent));
    ok('"Where to buy" offers Anywhere and the saved shops', chips[0]==='Anywhere' && chips.includes('Asian Glenferrie') && chips.includes('Coles Dandenong'), JSON.stringify(chips));
    await tap('[data-ew="asgl"]');
    await tap('#saveBtn');
    const m = (await cache()).items.find(i=>i.id==='3');
    t = await tiles();
    ok('saving writes both, and the tile says them', m.note==='2L full cream' && m.where==='asgl' && T(t,'Milk').note==='Asian Glenferrie · 2L full cream', JSON.stringify({m, tile:T(t,'Milk')}));

    /* ── Regulars remember ──────────────────────────────────────────────── */
    await page.locator('#zoomer .pill[data-pill="1"]').click(); await page.waitForTimeout(500);
    await tap('#sweepBtn');
    const reg = ((await cache()).buyAgain||[]).find(e=>e.name==='Tofu');
    ok('a ticked item saved to Regulars keeps its note and shop', reg && reg.note==='firm' && reg.where==='asri', JSON.stringify(reg));
    await page.waitForTimeout(400);
    const rc = page.locator('[data-regc="asian"]'); if(await rc.count()) { await rc.first().click(); await page.waitForTimeout(400); }
    await page.locator('[data-reg-add^="Tofu|"]').first().click(); await page.waitForTimeout(600);
    const back = ((await cache()).items||[]).find(i=>i.name==='Tofu' && !i.checked);
    ok('…and brings them back when it is added again', back && back.note==='firm' && back.where==='asri', JSON.stringify(back));
    /* SUPERSEDED by v2.36: a Regular tapped opens the add sheet and its details panel (like "+ Add items"), so the sheet is
       finished with the return key before going on. Still protects: the note and the shop come back with the Regular. */
    if(await page.locator('#mainInput').count()){ await page.locator('#mainInput').press('Enter'); await page.waitForTimeout(1600); }

    /* ── text that leaves the app ───────────────────────────────────────── */
    await tap('#setNav');
    await tap('#optSendList');
    const shared = await page.evaluate(()=>window.__shared && window.__shared.text || '');
    ok('"Send what\'s to buy" says the shop and the note', /• Tofu \(Asian Richmond\) — firm/.test(shared) && /• Milk \(Asian Glenferrie\) — 2L full cream/.test(shared) && /• Rice — jasmine 5kg/.test(shared), shared.slice(0,300));

    /* ── the note line in every kind of tile ─────────────────────────────
       Found in screenshots while building: in icon-on-top tiles the wrap started a second column beside the icon; in small
       tiles in two columns an older nowrap left the name no width at all (the note stood where "Rice" should be); and a long
       note grew a tile sized to its words past the edge of the screen. */
    const geo = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill.hasnote')].filter(p=>p.offsetParent!==null).map(t=>{
      const r=t.getBoundingClientRect(), row=t.closest('.pills').getBoundingClientRect(), n=t.querySelector('.pname').getBoundingClientRect(), o=t.querySelector('.pnote').getBoundingClientRect();
      return { n:t.querySelector('.pname').textContent, nameW:Math.round(n.width), below:o.top>=n.bottom-1, inTile:o.left>=r.left-1 && o.right<=r.right+1, inRow:r.right<=row.right+1 }; }));
    const D = (d, more)=>`localStorage.setItem("ml_displays", JSON.stringify({shop:"${d}"})); ${more||''}`;
    const LONG = `const c=JSON.parse(localStorage.getItem("ml_cache_v101")); c.items[2].note="full cream, the blue one from the back of the fridge, two litres please"; localStorage.setItem("ml_cache_v101", JSON.stringify(c));`;
    for(const [tag, ls, want, oneLine] of [['small tiles, 2 columns', D('small','localStorage.setItem("ml_smallcols","2");'), 3],
                                  ['small tiles, 3 columns', D('small','localStorage.setItem("ml_smallcols","3");'), 3],
                                  ['large tiles, 4 columns', D('large','localStorage.setItem("ml_largecols","4");'), 3],
                                  ['the list', D('list'), 3, true],
                                  ['XL icons in 2 small columns', D('small','localStorage.setItem("ml_smallcols","2"); localStorage.setItem("ml_icosize","xl");'), 3],
                                  ['tiles sized to their words, with a long note', LONG, 4, true]]){
      /* SUPERSEDED by v2.58 (the household): one per row and tiles sized to their words keep everything on ONE line — the
         note beside the name, not under it. Still protects in those two: the name keeps its room, the note stays inside the
         tile, the tile inside its row (a long note is cut short with "…", never pushed off the screen). */
      await mk('home', ls);
      const g = await geo();
      ok(`${tag}: every tile with a note keeps its name, the note under it and inside the tile, the tile inside its row`,
         g.length===want && g.every(x=>x.nameW>10 && (oneLine ? !x.below : x.below) && x.inTile && x.inRow), JSON.stringify(g));
    }
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
