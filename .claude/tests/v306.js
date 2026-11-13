/* v3.06 — the stylesheet in layers (plan item O3, first slice).

   WHAT THESE CHECKS HAVE TO PROVE:
   - app.css declares `@layer app, blocks;`, every rule sits in a layer (nothing is left unlayered, which would beat them
     all), and the `blocks` layer has plain selectors: no repeated class, no "html body" prefix, no !important;
   - the browser really builds the two layers, in that order;
   - Edit this page still does what v2.98 built: a block's text alignment (left / right) and vertical place (bottom) reach
     the tiles — now through the `blocks` layer — and a block with no setting keeps the tiles' own centre;
   - the comparison tool is in the repo (.claude/tools/cssdiff.js) — it is how a stylesheet change is proved to change nothing. */
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
    const css = fs.readFileSync(path.join(ROOT,'app.css'),'utf8'), bare = css.replace(/\/\*[\s\S]*?\*\//g,'');
    const iApp = bare.indexOf('@layer app {'), iBlk = bare.indexOf('@layer blocks {');
    ok('app.css declares the layers in order, and nothing but that line sits outside a layer', /@layer app, blocks;/.test(bare) && iApp>0 && iBlk>iApp && bare.slice(0,iApp).replace('@layer app, blocks;','').trim()==='' , bare.slice(0,iApp).trim().slice(0,80));
    const depthAt = i => { let d=0; for(let k=0;k<i;k++){ if(bare[k]==='{')d++; else if(bare[k]==='}')d--; } return d; };
    ok('the app layer closes just before the blocks layer, and the file ends when blocks closes', depthAt(iBlk)===0 && depthAt(bare.length)===0 && /\}\s*$/.test(bare));
    const blk = bare.slice(iBlk);
    ok('the blocks layer has plain selectors: no repeated class, no "html body", no !important', !/\.([a-z-]+)\.\1\b/.test(blk) && !/html body/.test(blk) && !/!important/.test(blk) && /\.pblock\.pb-ta-left \.pill \{/.test(blk), '');
    ok('the repeated-class tile overrides for blocks are gone from the app layer', !/\.pblock\.pb-t[av]-[a-z]+ \.pill\.pill/.test(bare.slice(0,iBlk)));
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const D = DOC({ items:[ it("1","Yogurt","dairy",{ note:"Greek" }), it("2","Bread","bakery"), it("3","Milk","dairy") ] });
    const tile = ()=>page.evaluate(()=>{ const p=document.querySelector('#zoomer .pill[data-pill="1"]'), cs=getComputedStyle(p), n=getComputedStyle(p.querySelector('.pname'));
      const names=[]; for(const sh of document.styleSheets){ try{ for(const r of sh.cssRules){ if(r instanceof CSSLayerStatementRule) names.push(...r.nameList); } }catch(e){} }
      return { ai:cs.alignItems, ta:cs.textAlign, jc:cs.justifyContent, nameTa:n.textAlign, layers:names.join(',') }; });
    const lay = o => BASE + `localStorage.setItem("ml_pagelay", ${JSON.stringify(JSON.stringify({ shop:{ s:{ "shop.list":o } } }))});`;
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE }); const t0 = await tile();
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:lay({ ta:"left", tv:"bottom" }) }); const tl = await tile();
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:lay({ ta:"right", tv:"top" }) }); const tr = await tile();
    ok('the browser builds the layers app, blocks', t0.layers==='app,blocks', t0.layers);
    ok('a block with no setting keeps the tiles\' own centre', t0.ai==='center' && t0.nameTa==='center', JSON.stringify(t0));
    ok('Edit this page › left + bottom reaches the tiles through the blocks layer', tl.ai==='flex-start' && tl.nameTa==='left' && tl.jc==='flex-end', JSON.stringify(tl));
    ok('…and right + top', tr.ai==='flex-end' && tr.nameTa==='right' && tr.jc==='flex-start', JSON.stringify(tr));
    const tool = fs.existsSync(path.join(ROOT,'.claude','tools','cssdiff.js')) ? fs.readFileSync(path.join(ROOT,'.claude','tools','cssdiff.js'),'utf8') : '';
    ok('the comparison tool is in the repo and stubs the Firebase SDK', /firebasejs/.test(tool) && /snap/.test(tool) && /diff/.test(tool));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
