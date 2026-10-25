/* v2.71 — Edit item: the note right under the name, "Measure" renamed "Unit" (capitalised on its tile); tiles show the note
   under the name and the amount below it; settings remembered by the email account.

   WHAT THESE CHECKS HAVE TO PROVE:
   - in Edit item the Note row comes right after the title and before Quantity; the row is called "Unit", and an item with
     no measure shows "Unit" (capital U) on the tile;
   - on a grid tile the note sits above the amount ("2× 1kg");
   - signed in with an email, a settings change is written to users/{uid}.prefs 4 s later as ONE string (so a reset key
     cannot linger in a merged map); signed in quietly (anonymous), nothing is written;
   - a phone that has its own look is OFFERED newer account settings (card), and "Use them" applies them; a fresh phone
     takes them silently and reloads only once;
   - ml_prefsseen is in both exclusion lists; the rules allow prefs only as { at, json }.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export default {};
export const doc=(db,...p)=>({ path:p.join('/') });
export const onSnapshot=(ref,a,b,c)=>{ const cb=typeof a==='function'?a:b;
  if(ref && ref.path && ref.path.indexOf('users/')===0) setTimeout(()=>cb({ exists:()=>!!window.__acct, data:()=>window.__acct }), 50);
  return ()=>{}; };
export const setDoc=async(ref,d)=>{ if(ref && ref.path && ref.path.indexOf('users/')===0){ try{ const a=JSON.parse(localStorage.getItem('t_writes')||'[]'); a.push(JSON.parse(JSON.stringify(d))); localStorage.setItem('t_writes', JSON.stringify(a)); }catch(e){} } };`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null };
export function initializeAuth(){ A.currentUser = window.__email ? { uid:'u1', email:window.__email, isAnonymous:false, getIdToken:async()=>'t' } : { uid:'anon1', email:null, isAnonymous:true, getIdToken:async()=>'t' }; return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(A.currentUser),0); return ()=>{}; }
export async function signInAnonymously(){ return { user:A.currentUser }; }
export async function signOut(){ A.currentUser=null; }`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_cache_v101", JSON.stringify(${JSON.stringify(o.doc||DOC())}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store","home");
  ${o.fresh ? '' : 'localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_theme","light");'}
  ${o.extra||''} })()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page, loads=0;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000); loads=0;
      page.on('load', ()=>loads++);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(`window.__email=${JSON.stringify(o.email||'')}; window.__acct=${JSON.stringify(o.acct||null)};`);
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(o.wait||1500); };
    const hold = async(loc)=>{ await loc.scrollIntoViewIfNeeded(); const b=await loc.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    const writes = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('t_writes')||'[]'));

    /* 1. Edit item order and the Unit label */
    await mk({ doc:DOC({ items:[it("1","Yogurt","fresh",{ note:"greek" })] }) });
    await hold(page.locator('.pill[data-pill="1"]').first());
    const ed = await page.evaluate(()=>{ const s=document.querySelector('#sheet');
      const labels=[...s.querySelectorAll('.editsec-l')].map(l=>l.textContent.trim());
      const unitRow=[...s.querySelectorAll('.editsec')].find(r=>/^Unit/.test((r.querySelector('.editsec-l')||{}).textContent||''));
      return { labels, unitVal: unitRow ? (unitRow.querySelector('.edval')||{}).textContent.trim() : '' }; });
    const iN=ed.labels.findIndex(l=>/^Note/.test(l)), iQ=ed.labels.findIndex(l=>/^Quantity/.test(l));
    ok('the Note row comes first, right under the name, before Quantity', iN===0 && iQ>iN, JSON.stringify(ed.labels));
    ok('the measure row is called "Unit", not "Measure"', ed.labels.some(l=>/^Unit/.test(l)) && !ed.labels.some(l=>/Measure/.test(l)), JSON.stringify(ed.labels));
    ok('an item with no measure shows "Unit" with a capital U on its tile', /^Unit/.test(ed.unitVal), ed.unitVal);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });

    /* 2. the tile: note above the amount */
    await mk({ doc:DOC({ items:[it("1","Yogurt","fresh",{ note:"greek", qty:2, weight:"1kg" })] }), extra:'localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_largecols","3");' });
    const tl = await page.evaluate(()=>{ const p=document.querySelector('.pill[data-pill="1"]'); const n=p&&p.querySelector('.pnote'), m=p&&p.querySelector('.pill-meta');
      return { has:!!(n&&m), noteTop:n?n.getBoundingClientRect().bottom:0, metaTop:m?m.getBoundingClientRect().top:0, grid:!!document.querySelector('.shop .zoomer.gridmode') }; });
    ok('on a grid tile the note sits above the amount', tl.has && tl.grid && tl.noteTop <= tl.metaTop + 1, JSON.stringify(tl));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-tile.png') });

    /* 3. settings to the account */
    await mk({ email:'o@example.com', acct:{ lists:{ v101:{ name:"Groceries", ts:1 } } } });
    await page.evaluate(()=>{ localStorage.setItem('ml_units','imperial'); });
    await page.locator('#listSwitch').click(); await page.waitForTimeout(300); await page.keyboard.press('Escape');
    await page.waitForTimeout(5000);
    let w = (await writes()).filter(x=>x.prefs);
    const last = w[w.length-1]; let kk={}; try{ kk=JSON.parse(last.prefs.json); }catch(e){}
    ok('signed in with an email, settings are written to the account as one string', !!last && typeof last.prefs.json==='string' && kk.ml_units==='imperial' && !('keys' in last.prefs), JSON.stringify(last||{}).slice(0,160));
    await mk({});
    await page.evaluate(()=>{ localStorage.setItem('ml_units','imperial'); }); await page.locator('#listSwitch').click(); await page.waitForTimeout(5000);
    ok('signed in quietly (anonymous), nothing is written', (await writes()).filter(x=>x.prefs).length===0, '');

    /* 4. offered on a phone with its own look; Use them applies */
    const ACCT = { lists:{ v101:{ name:"Groceries", ts:1 } }, prefs:{ at: Date.now(), json: JSON.stringify({ ml_theme:"dark", ml_lang:"fr" }) } };
    await mk({ email:'o@example.com', acct:ACCT });
    const card = await page.locator('#prefsCard').count();
    ok('a phone with its own look is offered the account\'s newer settings', card===1, '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-card.png') });
    if(card){ await Promise.all([ page.waitForEvent('load', { timeout:6000 }).catch(()=>{}), page.locator('#prefsUse').click() ]); await page.waitForTimeout(1500); }
    const ap = await page.evaluate(()=>({ th:localStorage.getItem('ml_theme'), lang:localStorage.getItem('ml_lang'), card:!!document.querySelector('#prefsCard') }));
    ok('"Use them" applies them, and the card does not come back', ap.th==='dark' && ap.lang==='fr' && !ap.card, JSON.stringify(ap));

    /* 5. a fresh phone takes them silently, reloading once */
    await mk({ email:'o@example.com', acct:ACCT, fresh:true, wait:4500 });
    const fr = await page.evaluate(()=>({ th:localStorage.getItem('ml_theme'), lang:localStorage.getItem('ml_lang'), card:!!document.querySelector('#prefsCard') }));
    ok('a fresh phone takes the account\'s settings silently', fr.th==='dark' && fr.lang==='fr' && !fr.card, JSON.stringify(fr));
    ok('…reloading only once', loads<=2, 'loads='+loads);

    /* 6. static */
    const app = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('ml_prefsseen is in both exclusion lists', (app.match(/ml_prefsseen\$/g)||[]).length===2, '');
    ok('the rules allow prefs only as { at, json }', /'prefs'\]\)/.test(rules) && /hasOnly\(\['at', 'json'\]\)/.test(rules), '');
    ok('the privacy page says settings are kept in the account', /settings/i.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8').match(/account[\s\S]{0,1500}/i)[0]), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
