/* v2.06 — the line drawings, finished: every catalogue item drawn, and no emoji left in the chrome.

   WHY THIS EXISTS: the household asked to "finish the line drawing implementation" — both halves:
   the emoji still standing in for interface marks (🏠 Home, 📍 store pin, 🔁 restock, 🔬/🧪 flask, 🗑 bin,
   the 🥦/🍞 swatches in Settings), and the ~400 reference-catalogue names that had no drawing yet, so
   that anything added later gets its own picture. A name map this large fails in one characteristic
   way: a short word hiding inside a longer one ("toilet" contains "oil", "eggplant" contains "egg",
   "cauliflower" contains "flour", "cardamom" contains "card"), so those are checked by name.

   WHAT THESE CHECKS HAVE TO PROVE:
   - every name in docs/icon-catalogue.md resolves to a drawing, except the few listed as not drawn;
   - every key the map names exists as a drawing, and no drawing carries NaN/undefined path data;
   - on a real tile, a catalogue item shows ITS drawing — compared by path data, not merely "an svg";
   - the trap words resolve to the right drawing, and the household's Regulars did not move;
   - the chrome shows drawn marks: the Home chip, the store pin, the flask, the Settings swatches —
     and none of 🏠 📍 🔁 🔬 🗑 appears as text on the Shop or Settings screens;
   - nothing drawn is ever saved (no "<svg" in storage), carried forward from v2.04.

   TEST-BUG NOTES CARRIED FORWARD: v1.60 drive the real control; v1.91 assert WHICH drawing (path
   data); v2.00 the seed returns early once seeded, and the cart drawer starts closed. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);

/* ── the drawings and the map, read from the file itself ─────────────────── */
const ROOT = path.join(__dirname,'..','..');
const src = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const a = src.indexOf('const DRAWN = (function(){')+'const DRAWN = (function(){'.length;
const ILL = new Function(src.slice(a, src.indexOf('})();', src.indexOf('  return ILL;', a))))();
const EXACT = JSON.parse(src.match(/const DRAW_EXACT = (\{.*?\});/)[1]);
const HINTS = JSON.parse(src.match(/const DRAW_HINTS = (\[.*?\]\]);/)[1]);
const drawKey = (name)=>{ const n=String(name||'').trim().toLowerCase(); if(!n) return null; if(EXACT[n]) return EXACT[n];
  for(const [k,v] of HINTS){ if(n.includes(k)) return v; } return null; };
const sig = (k)=>ILL[k] ? ILL[k].back+'|'+ILL[k].front+'|'+ILL[k].detail : null;

/* names on the tiles below, and the drawing each must show */
const ON_TILES = [["Croissant","croissant"],["Blood orange","orange"],["Dog food","petfood"],["Hot dog","sausage"],
  ["Toilet rolls","toilet"],["Aluminium foil","foilroll"],["Eggplant","eggplant"],["Cauliflower","cauliflower"],
  ["Watering can","wateringcan"],["Craft beer","beer"]];

const SEED = `(() => {
  if(localStorage.getItem("ml_me")) return;
  const it=(id,n,c)=>({id,name:n,cat:c,weight:"",qty:1,sub:"",checked:false,tags:[],starred:false});
  const names=${JSON.stringify(ON_TILES.map(x=>x[0]))};
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:names.map((n,i)=>it(String(i+1),n,"others")),
    buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_store","home");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];

  /* ── A. the map, statically ──────────────────────────────────────────── */
  const cat = fs.readFileSync(path.join(ROOT,'docs','icon-catalogue.md'),'utf8');
  const group = cat.slice(cat.indexOf('## Fruit & vegetables'), cat.indexOf('## Also drawn'));
  const names = [...group.matchAll(/[✅⬜] ([^·\n]+?)(?= ·|\s*$)/gm)].map(m=>m[1].replace(/\s*\(.*\)$/,'').trim());
  const NOT_DRAWN = ["Costume","Hole punch","Reflectors","Table bomb","Toner","Snow chains"];
  const undrawn = names.filter(n=>!drawKey(n));
  ok(`every catalogue name resolves to a drawing (${names.length} names), except the six listed as not drawn`,
     names.length>500 && JSON.stringify(undrawn.sort())===JSON.stringify(NOT_DRAWN.slice().sort()), JSON.stringify(undrawn));
  const keys = new Set([...Object.values(EXACT), ...HINTS.map(h=>h[1])]);
  ok('every key the map names exists as a drawing', [...keys].every(k=>ILL[k]), JSON.stringify([...keys].filter(k=>!ILL[k])));
  ok('no drawing carries NaN or undefined path data', Object.values(ILL).every(v=>!/NaN|undefined/.test(v.back+v.front+v.detail)),
     JSON.stringify(Object.keys(ILL).filter(k=>/NaN|undefined/.test(ILL[k].back+ILL[k].front+ILL[k].detail))));
  const TRAPS = [["Toilet rolls","toilet"],["Tin foil","foilroll"],["Eggplant","eggplant"],["Cauliflower rice","cauliflower"],
    ["Cardamom pods","spicejar"],["Hot dog buns","bun"],["Hot dog","sausage"],["Gingerbread men","gingerbread"],["Peanut butter","jam"],
    ["Buttermilk","milk"],["Shaving cream","shavingfoam"],["Potting soil","spicepacket"],["Coffee beans","coffee"],["Vanilla bean","vanilla"],
    ["Sweet potatoes","sweetpotato"],["Watercress","cress"],["Cheesecake","cakeslice"],["Dog treats","bones"]];
  const wrong = TRAPS.filter(([n,k])=>drawKey(n)!==k).map(([n,k])=>`${n}: ${drawKey(n)} (want ${k})`);
  ok('a short word hidden in a longer one does not win ("toilet" ⊃ "oil", "eggplant" ⊃ "egg", "cauliflower" ⊃ "flour"…)', wrong.length===0, JSON.stringify(wrong));
  /* The Regulars: a sample of the household's own names across every category, with the drawing
     each had in v2.05. They are exact entries, so a new hint must never reach them. */
  const REG = [["Chicken thigh","chicken"],["Chicken stock","stock"],["Ginger beer no sugar","sodacan"],["Toilet paper","toilet"],
    ["Toilet cleaner","toiletcleaner"],["Coconut oil","oilbottle"],["Kimchi","kimchi"],["Salad","lettuce"],["Gruyère","cheese"],
    ["Popcorn sweet & salty","popcorn"],["Chocolate chip","chocchips"],["Cotton tips","cottonswabs"],["Birthday card","card"],
    ["Frozen raspberries","frozenbag"],["Thai basil","mint"],["Tumeric leaves","longleaf"],["Zero sugar soju","soju"]];
  const moved = REG.filter(([n,k])=>drawKey(n)!==k).map(([n,k])=>`${n}: ${drawKey(n)} (was ${k})`);
  ok('the household\'s Regulars keep the drawing they had', moved.length===0, JSON.stringify(moved));

  /* ── B. on the screen ────────────────────────────────────────────────── */
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
  await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
  const page = await ctx.newPage(); page.setDefaultTimeout(9000);
  page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
  page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
  await page.addInitScript(SEED);
  await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1600);
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(600); };
  const CHROME_EMOJI = /[🏠📍🔁🔬🗑]/u;
  const screenText = ()=>page.evaluate(()=>{ const a=document.querySelector('#app')||document.body; return a.innerText; });

  try{
    const tiles = await page.evaluate((names)=>names.map(n=>{
      const p=[...document.querySelectorAll('.pill')].find(b=>b.textContent.replace(/\s+/g,' ').includes(n)); if(!p) return [n,null];
      const s=p.querySelector('svg.ill'); if(!s) return [n,'no drawing'];
      return [n, ['.ib','.if','.id'].map(c=>s.querySelector(c).getAttribute('d')).join('|')]; }), ON_TILES.map(x=>x[0]));
    const off = tiles.filter(([n,s],i)=>s!==sig(ON_TILES[i][1])).map(([n,s])=>n+': '+(s&&s.length>40?'another drawing':s));
    ok('each catalogue item on a tile shows ITS drawing (path data compared)', off.length===0, JSON.stringify(off));
    const chip = await page.evaluate(()=>{ const c=document.querySelector('.locchip'); return c ? { svg:!!c.querySelector('svg'), text:c.textContent.trim() } : null; });
    ok('the store chip reads "Home" with a drawn house, no 🏠', chip && chip.svg && chip.text==='Home', JSON.stringify(chip));
    ok('no chrome emoji (🏠 📍 🔁 🔬 🗑) as text on the Shop screen', !CHROME_EMOJI.test(await screenText()), '');
    if(out) await page.screenshot({ path: out });

    await tap('#setNav, #setNavP, #setNavS');
    const st = await page.evaluate(()=>{
      const home=[...document.querySelectorAll('[data-opt-store]')].find(b=>b.dataset.optStore==='home');
      const pin=document.querySelector('#optSetStore'), diag=document.querySelector('#optDiag');
      return { home: home ? { svg:!!home.querySelector('svg'), text:home.textContent.trim() } : null,
        pin: pin ? !!pin.querySelector('svg') : null, diag: diag ? !!diag.querySelector('svg') : null,
        swatches: ['[data-opt-catemoji="1"]','[data-opt-itememoji="1"]'].map(q=>{ const s=document.querySelector(q+' .tdswatch-ico'); if(!s) return null;
          return s.querySelector('svg') ? s.querySelector('svg').getAttribute('class') : s.textContent.trim(); }) }; });
    ok('Settings › Store: the Home choice has the drawn house', st.home && st.home.svg && st.home.text==='Home', JSON.stringify(st.home));
    ok('…"Set location here" has the drawn pin, AI diagnostics the drawn flask', st.pin===true && st.diag===true, JSON.stringify(st));
    ok('the Category and Item icon swatches are drawn (a category mark and an item drawing)',
       JSON.stringify(st.swatches)==='["cmark","ill"]', JSON.stringify(st.swatches));
    ok('no chrome emoji (🏠 📍 🔁 🔬 🗑) as text on the Settings screen', !CHROME_EMOJI.test(await screenText()),
       ((await screenText()).match(/.{0,20}[🏠📍🔁🔬🗑].{0,20}/u)||[''])[0]);
    await tap('#optDiag');
    const dt = await page.evaluate(()=>{ const t=[...document.querySelectorAll('.disp')].find(d=>/AI diagnostics/.test(d.textContent)); return t ? { svg:!!t.querySelector('svg'), text:t.textContent.trim() } : null; });
    ok('the diagnostics sheet title is drawn too', dt && dt.svg && !CHROME_EMOJI.test(dt.text), JSON.stringify(dt));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400);

    /* ── C. the emoji style is still the opt-out ─────────────────────────── */
    await tap('#setNav, #setNavP, #setNavS'); await tap('[data-opt-iconstyle="emoji"]');
    const emSw = await page.evaluate(()=>['[data-opt-catemoji="1"]','[data-opt-itememoji="1"]'].map(q=>{ const s=document.querySelector(q+' .tdswatch-ico'); return !s ? null : (s.querySelector('svg')?'svg':s.textContent.trim()); }));
    ok('with Icon style › Emoji the two swatches go back to 🥦 and 🍞', JSON.stringify(emSw)==='["🥦","🍞"]', JSON.stringify(emSw));
    await tap('[data-opt-iconstyle="drawn"]');
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400);

    /* ── D. nothing drawn is ever saved ──────────────────────────────────── */
    /* the app reopens on the last page (ml_lastview), so this is Settings: its nav carries its own ids (v1.77) */
    await tap('#planNav, #planNavP, #planNavS, #planNavX'); await tap('.pdmore'); await tap('#pmFood');
    await page.fill('#paName', 'Croissant'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    const stored = await page.evaluate(()=>{ let s=''; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); s+=localStorage.getItem(k)||''; } return s; });
    ok('a planned croissant is saved without markup — no "<svg" anywhere in storage', !/<svg/i.test(stored), '');
    const pc = await page.evaluate(()=>{ const c=[...document.querySelectorAll('[data-pchip]')].find(b=>/croissant/i.test(b.textContent)); const f=c&&c.querySelector('svg.ill .if'); return f ? f.getAttribute('d') : null; });
    ok('…while its plan chip shows the croissant drawing', pc===ILL.croissant.front, String(pc).slice(0,40));
  }catch(e){ ok('the suite ran to the end', false, e.message); }

  ok('no console errors anywhere in the run', errors.length===0, errors.join(' | '));
  await browser.close();
  let pass=0; results.forEach(([n,c,x])=>{ if(c)pass++; console.log((c?'PASS':'FAIL')+'  '+n+(x?'   '+x:'')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass===results.length?0:1);
})();
