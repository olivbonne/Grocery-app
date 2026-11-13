/* Market List — computed-style snapshot (v3.06). Proves a stylesheet refactor changes nothing on screen.

   node .claude/tools/cssdiff.js snap <port> <out.json>     record every element's computed style on a matrix of screens
   node .claude/tools/cssdiff.js diff <a.json> <b.json>     compare two records; exit 1 on any difference

   How to use it for a stylesheet change: serve the BASE tree (git worktree of origin/main) on one port and the changed tree
   on another, snap both, diff. Zero differences is the bar. The real Firebase SDK is never loaded (stubbed, as in every suite).
   The matrix: Shop at 1/2/3/4/variable across, grouped and flat, light and dark, small icons, no icons; the page editor
   with each text alignment and vertical place; Settings and Advanced look; Plan; Edit item; the + sheet; the ⋯ menu; My cards. */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const PROPS = ['display','position','top','right','bottom','left','width','height','margin','padding','border','border-radius','box-sizing','flex','flex-direction','flex-wrap','align-items','align-self','justify-content','justify-self','gap','grid-template-columns','order','overflow','color','background-color','background-image','opacity','font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform','white-space','text-overflow','overflow-wrap','transform','z-index','box-shadow','visibility','pointer-events','backdrop-filter','-webkit-line-clamp','aspect-ratio','max-width','max-height','min-width','min-height','fill','stroke'];
const [mode, a, b] = process.argv.slice(2);
if(mode === 'diff'){ const A = JSON.parse(fs.readFileSync(a,'utf8')), B = JSON.parse(fs.readFileSync(b,'utf8')); let n = 0;
  for(const k of new Set([...Object.keys(A), ...Object.keys(B)])){ const x = A[k], y = B[k];
    if(!x || !y){ console.log(`SCREEN ${k}: missing in ${x ? 'b' : 'a'}`); n++; continue; }
    if(x.length !== y.length){ console.log(`SCREEN ${k}: ${x.length} elements vs ${y.length}`); n++; continue; }
    let shown = 0;
    for(let i = 0; i < x.length; i++){ if(x[i][1] === y[i][1] && x[i][0] === y[i][0]) continue; n++;
      if(shown++ < 6){ const pa = x[i][1].split('|'), pb = y[i][1].split('|'), d = [];
        pa.forEach((v, j) => { if(v !== pb[j]) d.push(`${PROPS[j]}: ${v} → ${pb[j]}`); });
        console.log(`DIFF ${k} :: ${x[i][0]} :: ${d.slice(0,4).join(' ; ')}`); } } }
  console.log(n ? `\n${n} differences` : '\n0 differences'); process.exit(n ? 1 : 0); }
if(mode !== 'snap'){ console.log('usage: cssdiff.js snap <port> <out.json> | diff <a.json> <b.json>'); process.exit(2); }
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const SUITE = fs.readFileSync(path.join(ROOT, '.claude', 'tests', 'v297.js'), 'utf8');
const FSTUB = eval('`' + SUITE.match(/const FSTUB = `([\s\S]*?)`;\nconst AUTHSTUB/)[1] + '`');
const AUTHSTUB = SUITE.match(/const AUTHSTUB = `([\s\S]*?)`;/)[1];
const it = (id, n, c, x) => Object.assign({ id, name:n, cat:c, qty:1, weight:"", checked:false, tags:[], ts:1000 }, x || {});
const ITEMS = [ it("1","Yogurt","dairy",{ note:"Greek, low fat", qty:3, weight:"1kg" }), it("2","Sourdough bread","bakery",{ note:"Sliced" }), it("3","Milk","dairy",{ qty:2 }),
  it("4","Dates","fruit",{ tags:["urgent"], starred:true }), it("5","Leeks","vegetable",{ tags:["sale"] }), it("6","Chicken thighs","meat",{ weight:"800g", note:"Free range" }),
  it("7","Wombok cabbage","vegetable",{ qty:6, weight:"900g", note:"Organic, white" }), it("8","Eggs","dairy",{ checked:true, checkedAt:5 }), it("9","Toilet paper","others",{ qty:10, weight:"0.5kg" }), it("10","Olive oil","bulk") ];
const DOC = { items:ITEMS, itemTomb:{}, buyAgain:[{ name:"Butter", cat:"dairy", qty:1, ts:1 }, { name:"Rice", cat:"bulk", qty:1, note:"Basmati", ts:1 }], baTomb:{}, stores:[], storeMeta:{}, members:["O","A"], name:"Groceries",
  baMeta:{ label:"Buy again", emoji:"b", img:"", pos:99 }, predictReset:0, purch:{}, plan:{ days:{}, recipes:[], saved:[] }, v:2 };
const CARDS = [ { id:"c1", name:"Flybuys", chain:"coles", num:"6008123412341234", photo:"" }, { id:"c2", name:"Everyday Rewards", chain:"woolworths", num:"9355123412345", photo:"" }, { id:"c3", name:"Library", chain:"", num:"A1234567", photo:"" } ];
const seed = (ls) => `(() => { window.__srv = { docs:{ "lists/v101": ${JSON.stringify(DOC)} }, subs:[], writes:[], refuse:false };
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(${JSON.stringify(DOC)}, { mv:2 })));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_onb", JSON.stringify({done:1}));
  localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(CARDS))});
  const o=${JSON.stringify(ls || {})}; for(const k in o) localStorage.setItem(k, o[k]); })()`;
const SNAP = `(PROPS) => { const out = []; const walk = (el, p) => { const cs = getComputedStyle(el);
    const key = p + '>' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    out.push([key.slice(-140), PROPS.map(n => cs.getPropertyValue(n)).join('|')]);
    let i = 0; for(const c of el.children){ if(c.tagName === 'SCRIPT' || c.tagName === 'STYLE' || c.tagName === 'LINK') continue; walk(c, String(i++)); } };
  walk(document.body, ''); return out; }`;
(async () => {
  const port = a, out = b, res = {}; const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const open = async (ls, dark) => { const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:1, reducedMotion:'reduce' });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
    const page = await ctx.newPage(); page.setDefaultTimeout(9000);
    await page.addInitScript(`(()=>{ const T=new Date(2026,10,10,10,0,0).getTime(), OFF=T-Date.now(), _D=Date; class FD extends _D { constructor(...x){ if(x.length) super(...x); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } } FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`);
    await page.addInitScript(seed(Object.assign(dark ? { ml_theme:"dark" } : {}, ls)));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500);
    await page.addStyleTag({ content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }); await page.waitForTimeout(150);
    return { ctx, page }; };
  const snap = async (name, page) => { await page.waitForTimeout(250); res[name] = await page.evaluate(`(${SNAP})(${JSON.stringify(PROPS)})`); };
  const run = async (name, ls, dark, fn) => { const { ctx, page } = await open(ls, dark); try{ if(fn) await fn(page); await snap(name, page); }catch(e){ res[name] = [['ERROR', String(e.message).slice(0,120)]]; } await ctx.close(); };
  for(const cols of ["1","2","3","4","0"]) for(const cat of ["1","0"]) await run(`shop-c${cols}-cat${cat}`, { ml_largecols:cols, ml_caton:cat }, false);
  await run('shop-dark', { ml_largecols:"3" }, true);
  await run('shop-smallicons', { ml_largecols:"4", ml_icosize:"s" }, false);
  await run('shop-noicons', { ml_largecols:"2", ml_emoji_item:"0" }, false);
  for(const h of ["3","sq"]) await run(`shop-height-${h}`, { ml_largecols:"3", ml_tilelines:h }, false);
  for(const st of ["tog","note","disc"]) await run(`shop-cu-${st}`, { ml_largecols:"3", ml_cu_style:st }, false);
  for(const ta of ["left","center","right"]) for(const tv of ["top","middle","bottom"]){ if(ta !== "center" && tv !== "middle") continue;
    await run(`pb-${ta}-${tv}`, { ml_largecols:"3", ml_pagelay:JSON.stringify({ shop:{ s:{ "shop.list":{ ta, tv } } } }) }, false); }
  await run('pb-noimg-list', { ml_largecols:"1", ml_pagelay:JSON.stringify({ shop:{ s:{ "shop.list":{ img:"off", ta:"right" } } } }) }, false);
  await run('settings', {}, false, async p => { await p.locator('#setNav').click(); });
  await run('settings-dark', {}, true, async p => { await p.locator('#setNav').click(); });
  await run('advanced-look', {}, false, async p => { await p.locator('#setNav').click(); await p.waitForTimeout(300); await p.locator('#optLook').click(); });
  await run('plan', {}, false, async p => { await p.locator('#planNav').click(); });
  await run('edit-item', { ml_largecols:"3" }, false, async p => { const t = p.locator('#zoomer .pill[data-pill="1"]');
    await t.dispatchEvent('pointerdown'); await p.waitForTimeout(700); await t.dispatchEvent('pointerup'); await p.waitForTimeout(600); await p.locator('#ecHead').click(); });
  await run('add-sheet', { ml_largecols:"3" }, false, async p => { await p.locator('#shopAddFab').click(); await p.waitForTimeout(600); await p.keyboard.type('yo'); await p.waitForTimeout(400); });
  await run('menu', {}, false, async p => { await p.locator('#shopMenu').click(); });
  await run('cards-grid', {}, false, async p => { await p.locator('#shopMenu').click(); await p.waitForTimeout(300); await p.locator('#smCard').click(); await p.waitForTimeout(300); const e = p.locator('#cardGridEdit'); if(await e.count()) await e.click(); });
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(res));
  const errs = Object.keys(res).filter(k => res[k][0] && res[k][0][0] === 'ERROR');
  console.log(`${Object.keys(res).length} screens, ${Object.values(res).reduce((n, x) => n + x.length, 0)} elements${errs.length ? ' — ERRORS: ' + errs.map(k => k + ' ' + res[k][0][1]).join(' ; ') : ''}`);
  process.exit(errs.length ? 1 : 0);
})();
