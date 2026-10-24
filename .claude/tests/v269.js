/* v2.69 — Customise the look › Sheets: every sliding sheet can be customised.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the look page has a "Sheets" section whose chooser offers Edit item, Smart add, Add items, My card and Other sheets, and
     switching it shows that sheet's own rows (Background, Text, the buttons' Text/Background/Border, Roundness, Gap);
   - a colour set for one sheet reaches that sheet only (Smart add's tile background on its rows; My card's background on
     the card slider; Other sheets' background on, e.g., the lists sheet) — and not the Edit item sheet;
   - Edit item's existing pill settings (v2.63 keys) still apply to Edit item;
   - with nothing set, a sheet looks as before.

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
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  const lists=${JSON.stringify(o.lists||[{code:"v101",name:"Groceries"}])};
  localStorage.setItem("ml_lists", JSON.stringify(lists));
  const docs=${JSON.stringify(o.docs||{ v101:DOC() })}; Object.entries(docs).forEach(([c,d])=>localStorage.setItem("ml_cache_"+c, JSON.stringify(d)));
  localStorage.setItem("ml_lastlist", ${JSON.stringify(o.last||"v101")}); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };



(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(extra)=>{ if(ctx) await ctx.close();
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"milk",qty:2,weight:"",category:"fresh"}] }) }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed({ docs:{ v101:DOC({ items:[it("1","Yogurt","fresh")] }) }, extra:extra||'' }));
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    const hold = async(loc)=>{ const b=await loc.boundingBox(); await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const bgOf = sel=>page.evaluate(s=>{ const e=document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; }, sel);

    /* the look page */
    await mk('localStorage.setItem("ml_optcoll","[]");');
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.locator('#optLook').click(); await page.waitForTimeout(600);
    const ch = await page.evaluate(()=>[...document.querySelectorAll('[data-lk-sheet]')].map(b=>b.dataset.lkSheet));
    ok('Customise the look › Sheets: the chooser offers Edit item, Smart add, Add items, My card, Other sheets', JSON.stringify(ch)==='["edit","smart","add","card","other"]', JSON.stringify(ch));
    await page.locator('[data-lk-sheet="smart"]').click(); await page.waitForTimeout(500);
    const rows = await page.evaluate(()=>['bg','text','ptext','pbg','pbrd'].every(p=>!!document.querySelector(`[data-opt-lk-smart-${p}]`)) && !!document.querySelector('[data-opt-num="lk_smart_rad"]') && !!document.querySelector('[data-opt-num="lk_smart_gapy"]'));
    ok('…choosing Smart add shows its own Background, Text, buttons\' colours, Roundness and Gap', rows, '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-look.png') });

    /* untouched: the same as before */
    await mk('');
    const base = { edit:null };
    await hold(page.locator('.pill[data-pill="1"]').first());
    base.edit = await bgOf('#sheet');
    const baseChip = await bgOf('#sheet .flagchip');

    /* set colours for other sheets — Edit item must not change */
    await mk('localStorage.setItem("ml_lk_smart_pbg","#FFE08A"); localStorage.setItem("ml_lk_card_bg","#123456"); localStorage.setItem("ml_lk_other_bg","#2A6041");');
    await hold(page.locator('.pill[data-pill="1"]').first());
    ok('a colour set for other sheets does not touch the Edit item sheet', (await bgOf('#sheet'))===base.edit && (await bgOf('#sheet .flagchip'))===baseChip, JSON.stringify({ base, now:await bgOf('#sheet') }));
    await page.evaluate(()=>{ const b=document.querySelector('#sheetBg'); if(b) b.click(); }); await page.waitForTimeout(300);
    /* Other sheets: the lists sheet */
    await page.locator('#listSwitch').click(); await page.waitForTimeout(500);
    const otherBg = await page.evaluate(()=>{ const s=[...document.querySelectorAll('.sheet')].find(x=>!x.dataset.look); return s ? getComputedStyle(s).backgroundColor : null; });
    ok('Other sheets\' background reaches a sheet with no look of its own (the lists sheet)', otherBg==='rgb(42, 96, 65)', String(otherBg));

    /* Smart add's tile background on its rows */
    await mk('localStorage.setItem("ml_lk_smart_pbg","#FFE08A");');
    await page.evaluate(()=>{ window.__go = true; });
    await page.locator('#shopAddFab, #emptyAdd').first().click(); await page.waitForTimeout(500);
    await page.locator('#mainInput').fill('two milk'); await page.waitForTimeout(200);
    const sm = page.locator('#smartBtn, [data-smart-typed], button:has-text("Smart add")').first();
    if(await sm.count()){ await sm.click(); await page.waitForTimeout(900); }
    if(await page.locator('[data-smart-edit="0"]').count()){ await page.locator('[data-smart-edit="0"]').click(); await page.waitForTimeout(400); }
    const smChip = await bgOf('#smartSheetEl .smartedit .eqty');
    ok('Smart add\'s own button background reaches its item rows', smChip==='rgb(255, 224, 138)', String(smChip));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-smart.png') });

    /* Edit item's v2.63 keys still apply */
    await mk('localStorage.setItem("ml_epillbg","#FFE08A");');
    await hold(page.locator('.pill[data-pill="1"]').first());
    ok('Edit item\'s existing button colour (v2.63 setting) still applies', (await bgOf('#sheet .flagchip'))==='rgb(255, 224, 138)', String(await bgOf('#sheet .flagchip')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
