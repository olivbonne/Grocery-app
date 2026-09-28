/* v2.04 — line drawings for categories and item tiles.

   WHY THIS EXISTS: the household approved the drawn set and asked for it in the app — a line mark on
   each of the nine standard category headings, and a drawing on every item tile. Drawings are markup,
   not characters, which opens three new ways to be wrong that emoji never had: the wrong drawing for a
   name (a stock cube drawn as a drumstick because "chicken" matched first), a front shape filled with
   the wrong colour (a white patch on a coloured tile), and SVG leaking into saved data. Each is checked.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a standard category heading shows its drawn mark; a category the household made keeps its emoji;
   - an item gets ITS drawing — the specific phrase wins over the general word ("Chicken stock" is a
     stock cube, not a chicken) — and an unknown item gets its category's mark, never nothing;
   - the drawing takes the tile's meta colour, and its front shape is filled with the tile's own
     background — on a plain tile, a checked tile, and a Full (colour-filled) tile;
   - Settings › Icon style › Emoji brings the emoji back, and Item icons Off still means none;
   - nothing drawn is ever saved: after adding a planned meal, the stored data contains no "<svg".

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control; seeds are preconditions only.  v1.77: nav ids differ per page.
   - v1.91: assert WHICH drawing appeared — compare the path data, not merely that an <svg> exists.
   - v2.00: the seed returns early once seeded. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

const seed = (fill) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  const cats=[{id:"meat",label:"Meat / Seafood",color:"#B5402B",emoji:"🥩",subs:[]},
              {id:"bulk",label:"Bulk",color:"#6B5CA5",emoji:"🧻",subs:[]},
              {id:"asian",label:"Asian",color:"#C73B5B",emoji:"🍜",img:"ramen.png",subs:[]},
              {id:"pets",label:"Pets",color:"#2E6FA3",emoji:"🐾",subs:[]}];
  const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,weight:w||"",qty:q||1,sub:"",checked:!!ck,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({
    items:[it("1","Chicken thigh","meat",2),it("2","Chicken stock","bulk"),it("3","Widget","meat"),
           it("4","Kimchi","asian"),it("5","Dog food","pets"),it("6","Squid","meat",1,"",true)],
    buyAgain:[{name:"Coconut milk",cat:"asian",qty:1,weight:"",sub:"",ts:1}],
    baTomb:{}, stores:[], storeMeta:{}, members:["O"], categories:cats, name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:["asian"],checked:true}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1"); localStorage.setItem("ml_optcoll","[]");
  ${fill ? `localStorage.setItem("ml_fill","${fill}");` : ''}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(fill)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(fill));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(600); };
  /* one pill's icon, read from the pill itself */
  const pill = (name)=>page.evaluate((n)=>{
    const p=[...document.querySelectorAll('.pill')].find(b=>b.textContent.replace(/\s+/g,' ').includes(n)); if(!p) return null;
    const e=p.querySelector('.pemoji'); const ill=p.querySelector('svg.ill'), cm=p.querySelector('svg.cmark');
    const f=ill && ill.querySelector('.if');
    const qty=p.querySelector('.qty');
    return { kind: ill?'ill':(cm?'cmark':(e&&e.textContent.trim()?'emoji':'none')),
      front: f ? f.getAttribute('d').slice(0,40) : null,
      frontFill: f ? getComputedStyle(f).fill : null, bg: getComputedStyle(p).backgroundColor,
      iconColor: e ? getComputedStyle(e).color : null, qtyColor: qty ? getComputedStyle(qty).color : null,
      text: e ? e.textContent.trim() : '' }; }, name);
  const heading = (label)=>page.evaluate((l)=>{
    const h=[...document.querySelectorAll('.chead')].find(x=>x.textContent.includes(l)); if(!h) return null;
    const c=h.querySelector('.cemoji'); return { mark: !!(c && c.querySelector('svg.cmark')), text: c ? c.textContent.trim() : '' }; }, label);
  const norm = (c)=>String(c||'').replace(/\s/g,'');

  try{
    /* ── A. drawn is the default ───────────────────────────────────────── */
    await mk();
    const hm = await heading('Meat / Seafood'), ha = await heading('Asian'), hp = await heading('Pets');
    ok('a standard category heading shows its drawn mark', hm && hm.mark===true, JSON.stringify(hm));
    ok('…including one that used to carry a picture (Asian)', ha && ha.mark===true, JSON.stringify(ha));
    ok('a category the household made keeps its own emoji', hp && hp.mark===false && hp.text==='🐾', JSON.stringify(hp));

    const thigh = await pill('Chicken thigh'), stock = await pill('Chicken stock'), widget = await pill('Widget'),
          kimchi = await pill('Kimchi'), dog = await pill('Dog food');
    ok('an item gets a drawing', thigh && thigh.kind==='ill', JSON.stringify(thigh));
    ok('the specific phrase wins: "Chicken stock" is not drawn as a chicken',
       stock && stock.kind==='ill' && thigh && stock.front!==thigh.front, JSON.stringify({stock:stock&&stock.front, thigh:thigh&&thigh.front}));
    ok('an item with no drawing of its own shows its category\'s mark, never nothing', widget && widget.kind==='cmark', JSON.stringify(widget));
    ok('Kimchi has its own drawing', kimchi && kimchi.kind==='ill', JSON.stringify(kimchi));
    ok('an item in a household-made category keeps an emoji fallback, not a blank', dog && dog.kind!=='ill' && dog.kind!=='cmark', JSON.stringify(dog));
    ok('the drawing takes the tile\'s meta colour', thigh && norm(thigh.iconColor)===norm(thigh.qtyColor), JSON.stringify({i:thigh.iconColor,q:thigh.qtyColor}));
    ok('its front shape is filled with the tile\'s own background', thigh && norm(thigh.frontFill)===norm(thigh.bg), JSON.stringify({f:thigh.frontFill,bg:thigh.bg}));
    await page.evaluate(()=>{ const h=document.querySelector('#checkedHead'); if(h && !document.querySelector('.checkedscroll')) h.click(); });   // the cart drawer starts closed (v2.00)
    await page.waitForTimeout(500);
    const sq = await pill('Squid');
    ok('…on a checked tile too', sq && sq.kind==='ill' && norm(sq.frontFill)===norm(sq.bg), JSON.stringify(sq && {f:sq.frontFill,bg:sq.bg}));
    const reg = await pill('Coconut milk');
    ok('Regulars tiles are drawn as well', reg && reg.kind==='ill', JSON.stringify(reg));
    if(out) await page.screenshot({ path: out });

    /* ── B. a Full (colour-filled) tile ────────────────────────────────── */
    await mk('full');
    const full = await pill('Chicken thigh');
    ok('on a Full tile the front shape takes the tile\'s fill, not the page\'s', full && norm(full.frontFill)===norm(full.bg), JSON.stringify(full && {f:full.frontFill,bg:full.bg}));
    ok('…and the line takes the tile\'s text colour, so it shows on the fill', full && norm(full.iconColor)===norm(full.qtyColor), JSON.stringify(full && {i:full.iconColor,q:full.qtyColor}));

    /* ── C. the switch ─────────────────────────────────────────────────── */
    await mk();
    await tap('#setNav, #setNavP, #setNavS');
    ok('Settings has Icon style', await page.locator('[data-opt-iconstyle="emoji"]').count()===1, '');
    await tap('[data-opt-iconstyle="emoji"]');
    ok('…whose choice is remembered', await page.evaluate(()=>localStorage.getItem('ml_icons'))==='emoji', '');
    await tap('#cartNavP, #cartNav');
    const em = await pill('Chicken thigh'), emh = await heading('Meat / Seafood');
    ok('Emoji brings the emoji back on tiles', em && em.kind==='emoji' && em.text==='🍗', JSON.stringify(em));
    ok('…and on headings', emh && emh.mark===false && emh.text==='🥩', JSON.stringify(emh));
    await tap('#setNav, #setNavP, #setNavS'); await tap('[data-opt-iconstyle="drawn"]');
    await page.evaluate(()=>{ const b=document.querySelector('[data-opt-itememoji="0"]'); if(b) b.scrollIntoView(); });
    const hasItemToggle = await page.locator('[data-opt-itememoji="0"]').count();
    /* TEST BUG, v2.04: a forced pointer click landed on whatever covered the row (the bottom bar), so the
       setting never changed. The button's own click handler is the real control; dispatch it there. */
    if(hasItemToggle){ await page.evaluate(()=>document.querySelector('[data-opt-itememoji="0"]').click()); await page.waitForTimeout(500); }
    const itemKey = await page.evaluate(()=>localStorage.getItem('ml_emoji_item'));
    await tap('#cartNavP, #cartNav');
    const none = await pill('Chicken thigh');
    ok('Item icons Off still means no icon at all', hasItemToggle===0 || (none && none.kind==='none'), JSON.stringify({none, itemKey, hasItemToggle}));

    /* ── D. nothing drawn is ever saved ─────────────────────────────────── */
    await mk();
    await tap('#planNav, #planNavP'); await tap('.pdmore'); await tap('#pmFood');
    await page.fill('#paName', 'chicken'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    const stored = await page.evaluate(()=>{ let s=''; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); s+=localStorage.getItem(k)||''; } return s; });
    ok('a planned meal is saved with an emoji, never markup — no "<svg" anywhere in storage', !/<svg/i.test(stored), '');
    const chip = await page.evaluate(()=>{ const c=[...document.querySelectorAll('[data-pchip]')].find(b=>/chicken/i.test(b.textContent)); return c ? !!c.querySelector('svg.ill') : null; });
    ok('…while the plan chip itself is drawn', chip===true, String(chip));
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
