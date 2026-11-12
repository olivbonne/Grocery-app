/* v3.01 — one message at a time above the list (U2), and two fixes.

   WHAT THESE CHECKS HAVE TO PROVE:
   - with two messages due (duplicates to merge + the install card) only ONE card shows, with "1 more message" under it;
     tapping that shows the other one, and again the first; with one message due there is no "more" line;
   - dismissing the card that shows leaves the other, without a "more" line;
   - accepting a prediction is found again as "on the list" on a thirteen-category list (the twin is matched by name) — source;
   - a Regular put back on the list from its sheet keeps its photo — source. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const NEWER_V = +fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8').match(/const LIST_V = (\d+);/)[1] + 1;   // v2.78 (lesson 44): "a newer app" is always one past the app's own version, never a literal
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `const S = window.__srv || (window.__srv = { docs:{}, subs:[], writes:[], refuse:false });
S.subs = [];
const J = v => v===undefined ? undefined : JSON.parse(JSON.stringify(v));
export const initializeApp=()=>({}); export const getFirestore=()=>({}); export const initializeFirestore=()=>({});
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
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3"); localStorage.removeItem("ml_installhint");';
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const cards = ()=>page.evaluate(()=>({ ids:[...document.querySelectorAll('#zoomer .mergecard, #zoomer #installCard, #zoomer #cmpCard, #zoomer #tenCard, #zoomer #lookCard')].map(e=>e.id||'merge'), more:(document.getElementById('noticeNext')||{}).textContent||'' }));
    const bip = ()=>page.evaluate(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=()=>{}; window.dispatchEvent(e); });
    const DM = DOC({ items:[ it("1","Carrot","vegetable"), it("2","Carrots","vegetable"), it("3","Bread","bakery") ] });
    await mk({ srv:{ "lists/v101": DM }, cache:DM, extra:BASE });
    await bip(); await page.waitForTimeout(500);
    const c0 = await cards();
    ok('two messages due: one card shows, with "1 more message" under it', c0.ids.length===1 && /1 more message/.test(c0.more), JSON.stringify(c0));
    if(out) await page.screenshot({ path: out });
    await page.locator('#noticeNext').click(); await page.waitForTimeout(300);
    const c1 = await cards();
    await page.locator('#noticeNext').click(); await page.waitForTimeout(300);
    const c2 = await cards();
    ok('…tapping it shows the other message, and tapping again the first', c1.ids.length===1 && c1.ids[0]!==c0.ids[0] && c2.ids[0]===c0.ids[0], JSON.stringify({ c0:c0.ids, c1:c1.ids, c2:c2.ids }));
    if(c2.ids[0]!=='installCard'){ await page.locator('#noticeNext').click(); await page.waitForTimeout(300); }
    await page.locator('#installDone').click(); await page.waitForTimeout(400);
    const c3 = await cards();
    ok('…dismissing the one that shows leaves the other, with no "more" line', c3.ids.join()==='merge' && !c3.more, JSON.stringify(c3));
    const DS = DOC({ items:[ it("3","Bread","bakery") ] });
    await mk({ srv:{ "lists/v101": DS }, cache:DS, extra:BASE });
    await bip(); await page.waitForTimeout(500);
    const c4 = await cards();
    ok('one message due: it shows alone, no "more" line', c4.ids.join()==='installCard' && !c4.more, JSON.stringify(c4));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', /"1 more message"/.test(fr) && /"\{n\} more messages"/.test(fr));
    ok('the "more" line is a drawn mark, not an arrow character', !/[›→▸»]/.test(c0.more), c0.more);
    const pa = src.slice(src.indexOf('function predictAdd('), src.indexOf('function predictAdd(')+500);
    ok('a prediction\'s twin is matched by name, whatever category the list shelves it in', /anyNote:true/.test(pa) && !/sameCat/.test(pa.replace(/\/\/.*$/gm,'')) && /i\.cat===newCat\(cat, name\)/.test(src));
    const re = src.slice(src.indexOf('function restoreEditingToList('), src.indexOf('function restoreEditingToList(')+900);
    ok('a Regular put back from its sheet keeps its photo', /regFind\(editing\.origName, editing\.origCat, editing\.origNote\)/.test(re) && /ph:\s*_reg && _reg\.ph/.test(re));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
