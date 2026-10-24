/* v2.60 — adding to the list from outside the app: Siri through an iPhone Shortcut (?add=), Android's share sheet (?text=).

   WHAT THESE CHECKS HAVE TO PROVE:
   - ?add=… adds the spoken items to the list ("and" splits them), says so with Undo, and leaves the address clean, so a
     reload adds nothing twice; the same text within two minutes is not added again;
   - Undo takes them back off;
   - a shared plain text (?text=…) adds the same way; a shared text with a link stays the recipe importer's;
   - with "Voice adds go through Smart add" on, the text goes to Smart add (its review sheet), and only then;
   - Settings › Smart features › Set up Siri shows the steps and this list's link (code, ending in add=);
   - everything goes through platform.js (takeOutsideText / onOutsideText) — the door a native app replaces.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.56 an object
   literal at the start of a statement in a seed is a block — assign it first. */
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
    let ctx, page, api=[];
    const mk = async(o, q)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => { api.push(r.request().url()); r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"milk",qty:1,weight:"",category:"fresh"}] }) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html${q}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const names = ()=>page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_v101')).items.map(i=>i.name.toLowerCase()); }catch(e){ return []; } });

    await mk({ docs:{ v101:DOC({ items:[] }) } }, '?list=v101&add=' + encodeURIComponent('milk and eggs, bread'));
    let n = await names();
    ok('Siri\'s words become items ("and" splits them): milk, eggs, bread', ['milk','eggs','bread'].every(x=>n.includes(x)) && n.length===3, JSON.stringify(n));
    ok('…the address is clean again (no add=), so a reload adds nothing twice', !/add=/.test(await page.evaluate(()=>location.search)), await page.evaluate(()=>location.search));
    const toast = await page.evaluate(()=>document.body.innerText);
    ok('…and it says so, with Undo', /Added 3 from Siri/.test(toast) && /Undo/.test(toast), '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-siri.png') });
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    ok('reloading adds nothing twice', (await names()).length===3, JSON.stringify(await names()));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101&add=` + encodeURIComponent('milk and eggs, bread')); await page.waitForTimeout(1300);
    ok('the same words again within two minutes (a shortcut that fired twice) are not added again', (await names()).length===3, JSON.stringify(await names()));

    /* Undo */
    await mk({ docs:{ v101:DOC({ items:[it("1","Rice","bulk")] }) } }, '?list=v101&add=' + encodeURIComponent('apples and pears'));
    const undo = page.locator('button', { hasText:/^Undo$/ }).first();
    if(await undo.count()){ await undo.click(); await page.waitForTimeout(600); }
    ok('Undo takes them back off (and leaves what was there)', JSON.stringify(await names())==='["rice"]', JSON.stringify(await names()));

    /* Android share */
    await mk({ docs:{ v101:DOC({ items:[] }) } }, '?list=v101&text=' + encodeURIComponent('olive oil, butter'));
    n = await names();
    ok('a text shared from another app (Android) is added the same way', n.includes('olive oil') && n.includes('butter'), JSON.stringify(n));
    await mk({ docs:{ v101:DOC({ items:[] }) } }, '?list=v101&text=' + encodeURIComponent('Try this https://example.com/recipe'));
    ok('…but a shared link stays the recipe importer\'s (nothing added to the list)', (await names()).length===0, JSON.stringify(await names()));

    /* Smart add on */
    api=[];
    await mk({ docs:{ v101:DOC({ items:[] }) }, extra:'localStorage.setItem("ml_siriSmart","1");' }, '?list=v101&add=' + encodeURIComponent('two litres of milk'));
    await page.waitForTimeout(800);
    ok('with "Voice adds go through Smart add" on, the words go to Smart add and its review sheet opens', api.some(u=>/api\/parse/.test(u)) && (await names()).length===0, JSON.stringify(api));
    api=[];
    await mk({ docs:{ v101:DOC({ items:[] }) } }, '?list=v101&add=' + encodeURIComponent('two litres of milk'));
    ok('…and off (the default), nothing is sent anywhere', api.length===0 && (await names()).length>=1, JSON.stringify(api));

    /* the set-up sheet */
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.evaluate(()=>{ document.querySelectorAll('.optgrpbody.coll').forEach(b=>b.classList.remove('coll')); });
    const btn = page.locator('button', { hasText:'Set up Siri' }).first();
    await btn.click(); await page.waitForTimeout(500);
    const sh = await page.evaluate(()=>{ const t=document.body.innerText; return { steps:/Shortcuts app/.test(t) && /Dictated Text/.test(t), link:([...document.querySelectorAll('input,textarea,code')].map(e=>e.value||e.textContent).concat([t]).join(' ').match(/https?:\/\/\S*list=v101\S*add=/)||[''])[0] }; });
    ok('Set up Siri shows the steps and this list\'s link (code, ending in add=)', sh.steps && !!sh.link, JSON.stringify(sh));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-setup.png') });

    const plat = fs.readFileSync(path.join(ROOT,'js','platform.js'),'utf8'), src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the door a native app replaces: platform.js reads the outside text (takeOutsideText / onOutsideText), app.js has one handler', /export function takeOutsideText/.test(plat) && /export function onOutsideText/.test(plat) && /onOutsideText\(addFromOutside\)/.test(src), '');
    ok('the duplicate guard and the Smart add switch are in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_lastoutside\$/.test(x) && /ml_siriSmart\$/.test(x)).length===2, '');
    ok('the privacy page says what Siri sends', /Siri/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
