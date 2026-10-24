/* v2.62 — one Siri shortcut for every list.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the one link (?add= with no list) adds to the list used last, and the toast names it;
   - a list's name said first or last ("Groceries, bread", "clous pour Bricolage maison", "nails to the Hardware list") picks
     that list, opens it, and is taken out of the words; a name with an emoji still matches;
   - an old per-list shortcut (?list=…&add=) behaves exactly as in v2.60;
   - a browser that knows no list (Safari, separate storage) adds nothing to a brand-new list and says why;
   - Set up Siri hands out the one link (no code, no key) and keeps this list's own link for Safari.

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
    const names = (c)=>page.evaluate((c)=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_'+c)).items.map(i=>i.name.toLowerCase()); }catch(e){ return []; } }, c||'v101');

    const LISTS=[{code:"v101",name:"🛒 Groceries"},{code:"v202",name:"Hardware"},{code:"v303",name:"Bricolage maison"}];
    const DOCS=()=>({ v101:DOC({ items:[] }), v202:DOC({ items:[], name:"Hardware" }), v303:DOC({ items:[], name:"Bricolage maison" }) });
    const cur = ()=>page.evaluate(()=>localStorage.getItem('ml_lastlist'));

    /* one link, no list in it: the list used last */
    await mk({ lists:LISTS, docs:DOCS(), last:"v202" }, '?add=' + encodeURIComponent('milk and eggs'));
    let n = await names('v202');
    ok('one link for every list: with no list named, the words land on the list used last', n.includes('milk') && n.includes('eggs') && (await names('v101')).length===0, JSON.stringify(n));
    ok('…and the toast names the list', /Added 2 to Hardware/.test(await page.evaluate(()=>document.body.innerText)), '');

    /* a list named first */
    await mk({ lists:LISTS, docs:DOCS(), last:"v202" }, '?add=' + encodeURIComponent('Groceries, bread and butter'));
    n = await names('v101');
    ok('a list\'s name said first picks that list ("Groceries, bread and butter" → Groceries, even with its emoji)', JSON.stringify(n.sort())==='["bread","butter"]' && (await names('v202')).length===0, JSON.stringify(n));
    ok('…and that list is the one open', (await cur())==='v101', await cur());
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-named.png') });

    /* a list named last, in French */
    await mk({ lists:LISTS, docs:DOCS(), last:"v101" }, '?add=' + encodeURIComponent('clous et vis pour Bricolage maison'));
    n = await names('v303');
    ok('a name said last picks it too ("clous et vis pour Bricolage maison")', JSON.stringify(n.sort())==='["clous","vis"]', JSON.stringify(n));
    await mk({ lists:LISTS, docs:DOCS(), last:"v101" }, '?add=' + encodeURIComponent('nails to the Hardware list'));
    ok('…and "nails to the Hardware list"', JSON.stringify(await names('v202'))==='["nails"]', JSON.stringify(await names('v202')));

    /* an old per-list shortcut keeps working */
    await mk({ lists:LISTS, docs:DOCS(), last:"v101" }, '?list=v202&add=' + encodeURIComponent('Groceries tape'));
    ok('an old per-list shortcut (?list=…&add=) still adds to its own list, words untouched', (await names('v202')).length>=1 && (await names('v101')).length===0, JSON.stringify(await names('v202')));

    /* a browser that knows no list (Safari) */
    await mk({ lists:[], docs:{}, last:"" }, '?add=' + encodeURIComponent('milk'));
    const nl = await page.evaluate(()=>({ sheet:!!document.querySelector('#noListBg'), t:document.body.innerText, items:Object.keys(localStorage).filter(k=>k.startsWith('ml_cache_')).map(k=>{ try{ return JSON.parse(localStorage.getItem(k)).items.length; }catch(e){ return 0; } }) }));
    ok('a browser that knows none of the lists adds nothing and says why', nl.sheet && /doesn't know your lists/.test(nl.t) && nl.items.every(x=>x===0), JSON.stringify({ sheet:nl.sheet, items:nl.items }));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-nolist.png') });
    await page.locator('#noListOk').click(); await page.waitForTimeout(400);
    ok('…and OK closes it', !(await page.locator('#noListBg').count()), '');

    /* the set-up sheet */
    await mk({ lists:LISTS, docs:DOCS(), last:"v101" }, '');
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.evaluate(()=>{ document.querySelectorAll('.optgrpbody.coll').forEach(b=>b.classList.remove('coll')); });
    await page.locator('button', { hasText:'Set up Siri' }).first().click(); await page.waitForTimeout(500);
    const sh = await page.evaluate(()=>({ one:(document.querySelector('#siriLink')||{}).value, per:(document.querySelector('#siriListLink')||{}).value, t:document.body.innerText }));
    ok('Set up Siri hands out ONE link with no list code or key in it', /\/\?add=$/.test(sh.one||'') && !/list=|k=/.test(sh.one||''), sh.one);
    ok('…says how to name a list, and keeps this list\'s own link for Safari', /say a list's name first/.test(sh.t) && /list=v101/.test(sh.per||'') && /add=$/.test(sh.per||''), sh.per);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-setup.png') });

    const parse = fs.readFileSync(path.join(ROOT,'js','parse.js'),'utf8');
    ok('the list picker is a pure function in js/parse.js (no imports)', /export function pickListFromText/.test(parse) && !/^\s*import\s/m.test(parse), '');
    ok('the privacy page says the shortcut\'s link carries no list code', /no longer carries/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
