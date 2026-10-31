/* v2.78 — tile height: variable (as before), a fixed number of lines (3–8), or square. Shop ⋯ menu › Height and
   Settings › Tile height. Applies to the list's, the Regulars' and the cart's tiles in column layouts; the one-line layouts
   (1 per row, variable width) ignore it.

   WHAT THESE CHECKS HAVE TO PROVE:
   - untouched, nothing changes: no data-tilelines on <html>, tiles keep their natural heights;
   - fixed lines: every tile has the same height, and more lines make taller tiles (3 < 4 < 8);
   - what does not fit gives way by whole lines: no name is cut through the middle (its height is a whole number of lines)
     and nothing spills out of its tile — the Milk tile with a two-line note and an amount, at 3 lines, was cut mid-name
     before the budget counted the note;
   - square: each tile is as tall as it is wide;
   - variable width ignores the setting;
   - the ⋯ menu row sets it and stays open; ↔ clears it; Settings offers the same row;
   - ml_tilelines is a look: never in the exclusion lists.

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
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC = { items:[it("1","Milk","dairy",{qty:3,note:"Soy, high protein, VitaSoy"}),it("2","Yogurt","dairy"),
    it("3","Wombok cabbage","vegetable",{qty:6,weight:"900g",note:"Organic, white"}),it("4","Ginger","vegetable"),it("5","Lemongrass","vegetable"),it("6","Bread","bulk")],
  buyAgain:[{name:"Rice",cat:"bulk",qty:1,ts:1}], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"b",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} };
const seed = (extra) => `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_cache_v101", JSON.stringify(${JSON.stringify(DOC)}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_shop","1");
  localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store","home"); localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_caton","0");
  ${extra||''} })()`;

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(extra)=>{ if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(extra)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const tiles = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const r=p.getBoundingClientRect(), n=p.querySelector('.pname');
      const nr=n.getBoundingClientRect(), lh=parseFloat(getComputedStyle(n).lineHeight)||nr.height;
      const kids=[...p.children].filter(k=>getComputedStyle(k).display!=='none'&&k.getBoundingClientRect().height>0);
      const inside=kids.every(k=>{ const b=k.getBoundingClientRect(); return b.top>=r.top-1 && b.bottom<=r.bottom+1; });
      return { id:p.dataset.pill, h:Math.round(r.height), w:Math.round(r.width), lines:+(nr.height/lh).toFixed(2), inside }; }));
    const attr = ()=>page.evaluate(()=>document.documentElement.getAttribute('data-tilelines'));

    /* untouched */
    await mk('');
    const d = await tiles();
    ok('untouched: no data-tilelines, tiles keep their natural heights (the noted ones taller)', await attr()===null && new Set(d.map(x=>x.h)).size>1, JSON.stringify(d.map(x=>x.h)));

    /* fixed lines */
    const H = {};
    for (const n of ['3','4','8']) {
      await mk(`localStorage.setItem("ml_tilelines","${n}");`);
      const tt = await tiles(); H[n]=tt[0].h;
      ok(`${n} lines: data-tilelines="${n}" and every tile the same height`, await attr()===n && tt.every(x=>x.h===tt[0].h), JSON.stringify(tt.map(x=>x.h)));
      const bad = tt.filter(x=>!x.inside || Math.abs(x.lines-Math.round(x.lines))>0.08 || x.lines<0.9);
      ok(`${n} lines: every name shows whole lines and nothing spills out of its tile`, !bad.length, JSON.stringify(bad));
      if (n==='3' && out) await page.screenshot({ path: out.replace(/\.png$/,'-3lines.png') });
    }
    ok('more lines make taller tiles (3 < 4 < 8)', H['3']<H['4'] && H['4']<H['8'], JSON.stringify(H));

    /* square */
    await mk('localStorage.setItem("ml_tilelines","sq");');
    const sq = await tiles();
    /* SUPERSEDED by v2.88: a square tile is as tall as wide OR, when the tallest tile's content needs more, that height — every
       tile the same (the household's tiles were different sizes with text hanging out); still protects: Square is set, every
       tile is the same size and never shorter than it is wide */
    ok('square: every tile the same size, never shorter than wide', await attr()==='sq' && sq.every(x=>x.h>=x.w-1 && x.h===sq[0].h && x.w===sq[0].w), JSON.stringify(sq.map(x=>x.w+'x'+x.h)));
    ok('square: every name shows whole lines and nothing spills out of its tile', sq.every(x=>x.inside && Math.abs(x.lines-Math.round(x.lines))<=0.08 && x.lines>=0.9), JSON.stringify(sq));
    if (out) await page.screenshot({ path: out.replace(/\.png$/,'-square.png') });

    /* variable width ignores it */
    await mk('localStorage.setItem("ml_tilelines","8"); localStorage.setItem("ml_largecols","0");');
    const vw = await page.evaluate(()=>({ z:document.querySelector('#zoomer').className, h:[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>Math.round(p.getBoundingClientRect().height)) }));
    ok('variable width ignores the setting (one-line tiles, far below 8 lines)', /largevar/.test(vw.z) && vw.h.every(h=>h<H['8']*0.6), JSON.stringify(vw));

    /* the ⋯ menu */
    await mk('');
    await page.locator('#shopMenuBtn, [aria-label="More"]').first().click(); await page.waitForTimeout(400);
    const mb = await page.evaluate(()=>[...document.querySelectorAll('[data-sm-lines]')].map(b=>(b.dataset.smLines||'v')+(b.classList.contains('on')?'*':'')));
    /* SUPERSEDED by v2.79: heights 1 and 2 were added before 3. Still protected: every height, variable and square are offered,
       in order, with the current one (variable) marked. */
    ok('the Shop ⋯ menu offers 1–8, variable and square, variable marked', mb.join()==='1,2,3,4,5,6,7,8,v*,sq', JSON.stringify(mb));
    await page.locator('[data-sm-lines="5"]').click(); await page.waitForTimeout(500);
    const a5 = await page.evaluate(()=>({ v:localStorage.getItem('ml_tilelines'), a:document.documentElement.getAttribute('data-tilelines'), open:!!document.querySelector('#shopMenuEl'), on:(document.querySelector('[data-sm-lines].on')||{}).dataset }));
    ok('…tapping 5 sets it at once and the menu stays open', a5.v==='5' && a5.a==='5' && a5.open && a5.on && a5.on.smLines==='5', JSON.stringify(a5));
    const t5 = await tiles();
    ok('…and the tiles take one height', t5.every(x=>x.h===t5[0].h) && t5[0].h>H['4'] && t5[0].h<H['8'], JSON.stringify(t5.map(x=>x.h)));
    if (out) await page.screenshot({ path: out.replace(/\.png$/,'-menu.png') });
    await page.locator('[data-sm-lines=""]').click(); await page.waitForTimeout(500);
    const av = await page.evaluate(()=>({ v:localStorage.getItem('ml_tilelines'), a:document.documentElement.getAttribute('data-tilelines') }));
    ok('…↔ goes back to variable (nothing stored, no attribute)', av.v===null && av.a===null, JSON.stringify(av));

    /* Settings */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('Settings offers the same row (data-opt-lines) under "Tile height"', /t\("Tile height"\)[^\n]*tileLinesBtns\("data-opt-lines"\)/.test(src) && /\[data-opt-lines\]/.test(src));
    const ex = src.match(/const APP_EXCLUDE = (\/.*\/);/), exb = src.match(/const APP_EXCLUDE_BOOT = (\/.*\/);/);
    ok('ml_tilelines is a look: in neither exclusion list', ex && exb && !eval(ex[1]).test('ml_tilelines') && !eval(exb[1]).test('ml_tilelines'));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Tile height','Variable height','Square','Height'].every(k=>fr.includes(`"${k}"`)));

    ok('no page errors', !errors.length, errors.join(' | '));
  } catch(e) { ok('suite ran', false, e.stack); }
  finally { if(browser) await browser.close(); }
  let fail=0; for (const [n,p,x] of results){ if(!p) fail++; console.log(`${p?'PASS':'FAIL'}  ${n}${x&&!p?'  — '+x:''}`); }
  console.log(`\n${results.length-fail}/${results.length} passed`); process.exit(fail?1:0);
})();
