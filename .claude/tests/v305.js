/* v3.05 — a Vercel preview uses its own, empty Firebase project (H2).

   WHAT THESE CHECKS HAVE TO PROVE:
   - in Node (js/env.js): only *.vercel.app addresses other than the live one are previews — the live site, a custom domain,
     localhost, the test server and a look-alike ("vercel.app.evil.com", "notvercel.app") are not; a preview gets the preview
     config, everything else the config it was given;
   - in the app, opened under a fake preview address (every request answered by the local server, the SDK by the stub — the
     real Firebase is never loaded): initializeApp receives the PREVIEW project, App Check is not started, and the version
     label says "Preview data" inside the screen;
   - opened as usual: initializeApp receives the live project from index.html and there is no marker;
   - index.html still carries the live config (previews never replace it). */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const NEWER_V = +fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8').match(/const LIST_V = (\d+);/)[1] + 1;   // v2.78 (lesson 44): "a newer app" is always one past the app's own version, never a literal
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `const S = window.__srv || (window.__srv = { docs:{}, subs:[], writes:[], refuse:false });
S.subs = [];
const J = v => v===undefined ? undefined : JSON.parse(JSON.stringify(v));
export const initializeApp=(c)=>{ window.__fbConfig=c; return {}; }; export const getFirestore=()=>({}); export const initializeFirestore=()=>({});
export const persistentLocalCache=()=>({}); export const persistentMultipleTabManager=()=>({});
export const doc=(db,...p)=>({ kind:'doc', path:p.join('/') });
export const collection=(db,...p)=>({ kind:'col', path:p.join('/') });
const meta = { hasPendingWrites:false, fromCache:false };
function docSnap(p){ const d=S.docs[p]; return { id:p.split('/').pop(), exists:()=>d!==undefined, data:()=>J(d), metadata:meta }; }
function colSnap(p){ return { docs:Object.keys(S.docs).filter(k=>k.indexOf(p+'/')===0 && k.slice(p.length+1).indexOf('/')<0).map(docSnap), metadata:meta }; }
function snapOf(r){ return r.kind==='doc' ? docSnap(r.path) : colSnap(r.path); }
function fire(){ S.subs.slice().forEach(s=>setTimeout(()=>{ if(S.subs.includes(s)) s.cb(snapOf(s.r)); }, 0)); }
S.set = (p, d) => { S.docs[p] = J(d); fire(); };
export function onSnapshot(r, a, b){ const cb = typeof a==='function' ? a : b; const s={ r, cb }; S.subs.push(s);
  setTimeout(()=>{ if(S.subs.includes(s)) cb(snapOf(r)); }, 0); return ()=>{ S.subs = S.subs.filter(x=>x!==s); }; }
const refused = p => (S.refuse && /^lists\\/[^/]+\\/items\\//.test(p)) || (S.refusePhotos && /\\/photos\\//.test(p));
const deny = () => Object.assign(new Error('Missing or insufficient permissions.'), { code:'permission-denied' });
export async function setDoc(r, d){ if(refused(r.path)) throw deny(); S.writes.push({ path:r.path, data:J(d), batch:0 }); S.docs[r.path]=J(d); fire(); }
export function writeBatch(){ const ops=[]; return { set(r,d){ ops.push([r,d]); },
  async commit(){ if(ops.some(([r])=>refused(r.path))) throw deny(); S.batches=(S.batches||0)+1;
    ops.forEach(([r,d])=>{ S.writes.push({ path:r.path, data:J(d), batch:S.batches }); S.docs[r.path]=J(d); }); fire(); } }; }
export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const FAKE = (y,m,d)=>`(()=>{ const T=new Date(${y},${m},${d},10,0,0).getTime(), OFF=T-Date.now(), _D=Date;
  class FD extends _D { constructor(...a){ if(a.length) super(...a); else super(_D.now()+OFF); } static now(){ return _D.now()+OFF; } }
  FD.UTC=_D.UTC; FD.parse=_D.parse; window.Date=FD; })()`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy"), it("2","Bread","bakery")], itemTomb:{ "x9":500 }, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, v:2 }, o||{});
/* the server's records and this phone's cache, seeded before the app's module runs */
const seed = (o) => { o=o||{}; return `(() => {
  const srv = ${JSON.stringify(o.srv||{ "lists/v101": DOC() })};
  window.__srv = { docs:srv, subs:[], writes:[], refuse:${!!o.refuse} };
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  ${o.cache===false ? '' : `const c=${JSON.stringify(o.cache||DOC())}; localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(c, { mv:2 })));`}
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_onb", JSON.stringify({done:1}));
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(o)=>{ if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      if(o.date) await page.addInitScript(FAKE(...o.date)); await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800); };
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8'), html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    const E = await import(pathToFileURL(path.join(ROOT,'js','env.js')).href);
    const yes = ['grocery-app-2-git-claude-market-lis-e6db16-olivier-s-projects12.vercel.app','grocery-app-2-abc123.vercel.app','GROCERY-APP-2-ABC.VERCEL.APP','vercel.app'];
    const no = ['grocery-app-2-sage.vercel.app','127.0.0.1','localhost','marketlist.example.com','vercel.app.evil.com','notvercel.app','', undefined];
    ok('only *.vercel.app addresses other than the live one are previews', yes.every(h=>E.isPreviewHost(h)) && no.every(h=>!E.isPreviewHost(h)), JSON.stringify({ yes:yes.map(h=>E.isPreviewHost(h)), no:no.map(h=>E.isPreviewHost(h)) }));
    const live = { projectId:'live-x' };
    ok('a preview gets the preview project; everything else the config it was given', E.firebaseConfigFor(yes[0], live).projectId==='market-list-preview-fcccf' && E.firebaseConfigFor('grocery-app-2-sage.vercel.app', live)===live && E.firebaseConfigFor('', live)===live);
    ok('js/env.js is pure, imported versioned and precached; index.html still carries the live project', !/^\s*import\s/m.test(fs.readFileSync(path.join(ROOT,'js','env.js'),'utf8')) && /from "\.\/env\.js\?v=\d+\.\d+"/.test(src) && /"\/js\/env\.js\?v=\d+\.\d+"/.test(sw) && /projectId: "grocery-list-88109"/.test(html));
    const D = DOC({ items:[ it("1","Milk","dairy") ] });
    const look = ()=>page.evaluate(()=>{ const v=document.getElementById('appVer'); const r=v?v.getBoundingClientRect():null;
      return { project:(window.__fbConfig||{}).projectId, ver:v?v.textContent.trim():'', inside:r ? (r.left>=0 && r.right<=391) : null, ac:!!window.__acStarted, host:location.hostname }; });
    /* as usual (the test server) */
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:'localStorage.setItem("ml_nosmall","1");' });
    const l0 = await look();
    ok('opened as usual: the live project from index.html, no marker', l0.project==='grocery-list-88109' && !/Preview/.test(l0.ver) && /^v\d/.test(l0.ver), JSON.stringify(l0));
    /* under a preview address: every request to it is answered from the local server */
    const HOST = 'grocery-app-2-git-test-abc123.vercel.app'; const reqs = [];
    await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
    await ctx.route('**/*', async r => { const u = new URL(r.request().url());
      if(/firebasejs/.test(u.pathname)){ if(/app-check/.test(u.pathname)) reqs.push('app-check'); return r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(u.pathname) ? AUTHSTUB : FSTUB }); }
      if(u.hostname===HOST){ try{ const res = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`); const buf = Buffer.from(await res.arrayBuffer());
          return r.fulfill({ status:res.status, headers:{ 'content-type':res.headers.get('content-type')||'application/octet-stream' }, body:buf }); }catch(e){ return r.abort(); } }
      reqs.push(u.hostname); return r.abort(); });   // nothing else may be reached
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed({ srv:{ "lists/v101": D }, cache:D, extra:'localStorage.setItem("ml_nosmall","1");' }));
    await page.goto(`http://${HOST}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(2200);
    const p0 = await look();
    ok('under a preview address: initializeApp gets the PREVIEW project, and the version label says "Preview data", inside the screen',
      p0.host===HOST && p0.project==='market-list-preview-fcccf' && /Preview data/.test(p0.ver) && p0.inside===true, JSON.stringify(p0));
    ok('…App Check is not started there, and nothing outside the page\'s own address was contacted', !reqs.includes('app-check') && reqs.filter(x=>x!=='app-check').length===0, JSON.stringify(reqs.slice(0,6)));
    if(out) await page.screenshot({ path: out });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const vf = await page.evaluate(()=>(document.getElementById('verFoot')||{}).textContent||'');
    ok('…Settings\' version line says it too', /Preview data/.test(vf), vf);
    ok('the marker has its French', /"Preview data":/.test(fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
