/* v2.49 — architecture review A3 and A2's first half: full server addresses for the future iPhone/Android app (S13), a
   version on the list's data (S9), rules that check what is written (S2), and the rest of the French.

   WHAT THESE CHECKS HAVE TO PROVE:
   - lib/guard.js cors(): the app shells' origins (capacitor://localhost …) get the CORS headers and their preflight a 204;
     any other origin's preflight is refused; a call from the website itself (no Origin) is untouched; every function
     answers the preflight before anything else;
   - inside a native shell /api/… goes to the full address; on the website it stays relative;
   - the list is written in its known shape only (a stray old key is never written) with v:1;
   - a list saved by a NEWER app (v:2) is not overwritten: the phone stops writing, keeps the list as it was, and says so;
   - the rules accept every field the app writes, and no other; v is a whole number.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
/* Firestore answers the list from window.__doc (once, after a moment) and records every write */
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export default {};
export const doc=(db,...p)=>({ path:p.join('/') });
export const onSnapshot=(ref,a,b,c)=>{ const cb=typeof a==='function'?a:(typeof b==='function'?b:c);
  if(ref && ref.path && ref.path.indexOf('lists/')===0 && window.__doc){ setTimeout(()=>cb({ exists:()=>true, data:()=>JSON.parse(JSON.stringify(window.__doc)), metadata:{ hasPendingWrites:false, fromCache:false } }), 300); }
  return ()=>{}; };
export const setDoc=async(ref,d)=>{ if(ref && ref.path && ref.path.indexOf('lists/')===0){ window.__writes=(window.__writes||[]); window.__writes.push(JSON.parse(JSON.stringify(d))); } };`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const ITEMS=[it("1","Milk","dairy"),it("2","Bread","bakery")];
const seed = (o) => `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, oldJunk:{ x:1 } }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home");
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  let browser;
  try {
    /* ── the server: CORS for the app shells ─────────────────────── */
    const { cors } = require('../../lib/guard.js');
    const mkRes = () => ({ h:{}, code:0, ended:false, setHeader(k,v){ this.h[k.toLowerCase()]=v; }, status(c){ this.code=c; return this; }, end(){ this.ended=true; return this; }, json(){ this.ended=true; return this; } });
    let r = mkRes(), done = cors({ method:'OPTIONS', headers:{ origin:'capacitor://localhost' } }, r);
    ok('the iPhone app\'s preflight is answered 204 with the CORS headers (sign-in and App Check headers allowed)', done && r.code===204 && r.h['access-control-allow-origin']==='capacitor://localhost'
       && /authorization/.test(r.h['access-control-allow-headers']||'') && /x-firebase-appcheck/.test(r.h['access-control-allow-headers']||''), JSON.stringify(r.h)+' '+r.code);
    r = mkRes(); done = cors({ method:'POST', headers:{ origin:'https://localhost' } }, r);
    ok('…the Android app\'s POST gets the header and carries on to the function', !done && r.h['access-control-allow-origin']==='https://localhost', JSON.stringify(r.h));
    r = mkRes(); done = cors({ method:'OPTIONS', headers:{ origin:'https://evil.example' } }, r);
    ok('another website\'s preflight is refused, with no CORS header', done && r.code===403 && !r.h['access-control-allow-origin'], JSON.stringify(r.h)+' '+r.code);
    r = mkRes(); done = cors({ method:'POST', headers:{} }, r);
    ok('a call from the website itself (no Origin) is untouched', !done && !Object.keys(r.h).length, JSON.stringify(r.h));
    const fns = ['aisle','card','feedback','parse','receipt','recipe-search','recipe'];
    const first = fns.filter(f=>{ const s=fs.readFileSync(path.join(ROOT,'api',f+'.js'),'utf8'); const c=s.indexOf('if (cors(req, res)) return;'), m=s.search(/req\.method !== 'POST'/); return c>0 && m>c; });
    ok('all seven functions answer the preflight first, before their method check', first.length===7, first.join(','));

    /* ── the client: full address inside an app shell ────────────── */
    const plat = fs.readFileSync(path.join(ROOT,'js','platform.js'),'utf8'), src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const isNative = new Function('window', plat.match(/export function isNativeApp\(\)\{([\s\S]*?)\n?\}\s*\n/)?.[1] || 'return "missing";');
    ok('isNativeApp(): a Capacitor shell yes, a browser no', isNative({ Capacitor:{ isNativePlatform:()=>true } })===true && isNative({})===false, String(isNative({})));
    ok('apiFetch sends /api/… to the full address inside the app, and stays relative on the website', /function apiUrl\(u\)\{ return \(isNativeApp\(\) && \/\^\\\/api\\\/\/\.test\(u\)\) \? API_ORIGIN \+ u : u; \}/.test(src) && /fetch\(apiUrl\(url\), o\)/.test(src) && !/[^.]fetch\(["']\/api\//.test(src), '');

    /* ── the list: its shape and its version ─────────────────────── */
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(doc)=>{ if(ctx) await ctx.close();
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(`window.__doc=${JSON.stringify(doc||null)};`);
      await page.addInitScript(seed());
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
      await page.waitForTimeout(1600); };
    const writes = ()=>page.evaluate(()=>window.__writes||[]);
    const tick = async(name)=>{ await page.locator('.pill, .tile, [data-id]').filter({ hasText:name }).first().click(); await page.waitForTimeout(500); };
    await mk(null);
    await tick('Milk');
    let w = await writes(); const last = w[w.length-1] || {};
    /* SUPERSEDED by v2.51: the shape's version is now 2 (items saved one by one). Still protects: a version is written, and a
       stray old key is never written. */
    ok('a change writes the list in its known shape, with its version (v:2 since v2.51) — a stray old key in the cache is not written', w.length>0 && last.v===2 && !('oldJunk' in last) && Array.isArray(last.items), JSON.stringify(Object.keys(last)));
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    const allowed = ((rules.match(/function listOk\(d\)[\s\S]*?hasOnly\(\[([^\]]*)\]\)/)||[])[1]||'').match(/'([^']+)'/g)?.map(x=>x.slice(1,-1)) || [];
    const missing = Object.keys(last).filter(k=>!allowed.includes(k));
    ok('the rules accept every field the app writes (listOk), and require it on create and update', allowed.length && !missing.length && /allow create: if[\s\S]{0,200}listOk\(request\.resource\.data\)/.test(rules) && /allow update: if[\s\S]{0,300}listOk\(request\.resource\.data\)/.test(rules), 'missing: '+missing.join(','));
    ok('…and v must be a whole number, the items a list of at most 3000', /d\.get\('v', 0\) is int/.test(rules) && /d\.get\('items', \[\]\)\.size\(\) <= 3000/.test(rules), '');

    await mk({ items:[it("9","Eggs","dairy")], buyAgain:[], members:["O"], name:"Groceries", v:4, newField:{ a:1 } });   // SUPERSEDED by v2.58: the app knows 3 now (split lists), so "newer" is 4. Still protects: a newer app's data is never written over
    await page.waitForTimeout(500);
    ok('a list saved by a NEWER app: the phone says so, with Update now', await page.locator('#newerNote').count()===1 && await page.locator('#newerReload').count()===1, '');
    await shot(page, out, 'newer');
    const before = (await writes()).length;
    await tick('Milk');
    const kept = await page.evaluate(()=>{ try{ return (JSON.parse(localStorage.getItem('ml_cache_v101')).items||[]).some(i=>i.name==='Milk' && i.checked); }catch(e){ return false; } });
    ok('…and does not write over it (its own change stays on the phone)', (await writes()).length===before && kept, (await writes()).length+' vs '+before+' kept '+kept);
    await mk({ items:[it("9","Eggs","dairy")], buyAgain:[], members:["O"], name:"Groceries", v:2 });   // v2.51: this version is 2
    await page.waitForTimeout(500);
    ok('a list at this version opens as usual', await page.locator('#newerNote').count()===0 && /Eggs/.test(await page.locator('#zoomer').textContent()), '');
    await page.evaluate(()=>{ localStorage.setItem('ml_lang','fr'); }); await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1300);
    await page.locator('#listSwitch').click(); await page.waitForTimeout(500);
    ok('in French, the lists sheet speaks French too', !/New list|Create/.test(await page.evaluate(()=>document.body.innerText)), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
async function shot(page, out, tag){ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); }
