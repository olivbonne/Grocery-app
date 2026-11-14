/* v3.09 — the stylesheet in layers, second slice: the count and unit, the badge places and the one-item row.

   WHAT THESE CHECKS HAVE TO PROVE:
   - app.css declares `@layer app, tiles, blocks;`; the tiles layer sits between the two, and every rule in it is a
     `:where(…)` selector (weight zero, so the later rule wins) with no repeated class, no "html body", no !important;
   - the browser really builds app, tiles, blocks in that order;
   - the order inside the layer does what the old weights did: the 5- and 6-across disc is smaller than the base disc (it
     comes after it), the 4-across pill is narrower, the one-item row's amount keeps its 8px gap (v2.91 after B85's auto),
     a badge on the border sits on it, a style chosen for the one-line layouts puts the disc in the row;
   - the two rules that had to stay in @layer app still win: icon tiles keep their note at 1.25 lines (v2.66), Square's
     cart tiles keep their own floor;
   - .claude/tools/cssdiff.js covers every place a badge can take (the proof the move changed nothing), with a valid
     count-and-unit style (it asked for "disc", which is not one, until v3.09), and .claude/tools/layermove.py is in the repo. */
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
    const iApp = bare.indexOf('@layer app {'), iTil = bare.indexOf('@layer tiles {'), iBlk = bare.indexOf('@layer blocks {');
    const depthAt = i => { let d=0; for(let k=0;k<i;k++){ if(bare[k]==='{')d++; else if(bare[k]==='}')d--; } return d; };
    ok('app.css declares app, tiles, blocks, and the tiles layer sits between the two at the top level',
      /@layer app, tiles, blocks;/.test(bare) && iApp>0 && iTil>iApp && iBlk>iTil && depthAt(iTil)===0 && depthAt(iBlk)===0, [iApp,iTil,iBlk].join(','));
    const til = bare.slice(iTil + '@layer tiles {'.length, bare.lastIndexOf('}', iBlk));
    const starts = til.split('\n').filter(l => l && !/^\s/.test(l) && !/^\}/.test(l));
    ok('every rule in the tiles layer is a :where() selector', starts.length > 60 && starts.every(l => l.startsWith(':where(')), starts.length + ' ' + (starts.find(l => !l.startsWith(':where(')) || ''));
    ok('…with no repeated class, no "html body", no !important', !/\.([a-z-]+)\.\1(?![\w-])/.test(til) && !/html body|\bbody \./.test(til) && !/!important/.test(til), (til.match(/\.([a-z-]+)\.\1(?![\w-])/)||[''])[0]);
    const appL = bare.slice(iApp, iTil);
    ok('the moved count-and-unit rules are gone from the app layer (no ".pill.pill.pill > .cu-" and no one-line ".cu-" rule left there)', !/\.pill\.pill\.pill > \.cu-/.test(appL) && !/\.zoomer\.zoomer\.zoomer\.linelist \.pill\.pill[^{]*\.cu-/.test(appL));
    const BASE = c => `localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","${c}");`;
    const D = DOC({ items:[ it("1","Yogurt","dairy",{ note:"Greek, low fat", qty:3, weight:"1kg" }), it("2","Bread","bakery",{ note:"Sliced" }), it("3","Milk","dairy",{ qty:2, weight:"2L" }) ] });
    const go = async (cols, ls) => { await mk({ srv:{ "lists/v101": D }, cache:D, extra: BASE(cols) + Object.entries(ls||{}).map(([k,v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('') }); };
    const look = () => page.evaluate(() => { const p = document.querySelector('#zoomer .pill[data-pill="1"]'); if(!p) return null;
      const g = (sel) => { const e = p.querySelector(sel); if(!e) return null; const c = getComputedStyle(e); return { top:c.top, left:c.left, h:c.height, pl:c.paddingLeft, ml:c.marginLeft, pos:c.position, disp:c.display, tf:c.transform, lh:c.lineHeight, fs:c.fontSize }; };
      const names=[]; for(const sh of document.styleSheets){ try{ for(const r of sh.cssRules){ if(r instanceof CSSLayerStatementRule) names.push(...r.nameList); } }catch(e){} }
      return { disc:g('.cudisc'), tog:g('.cupill-t'), alt:g('.cu-alt'), meta:g('.pill-meta'), note:g('.pnote'), emoji:!!p.querySelector('.pemoji'), layers:names.join(','), z:document.querySelector('#zoomer').className }; });
    await go("3", { ml_cu_style:"sep" }); const s3 = await look();
    ok('the browser builds the layers app, tiles, blocks', s3 && s3.layers==='app,tiles,blocks', s3 && s3.layers);
    ok('3 across, disc and unit: the disc is 22px, inside the top-right corner at the 8px margin', s3 && s3.disc && s3.disc.h==='22px' && s3.disc.top==='8px' && s3.disc.pos==='absolute', JSON.stringify(s3 && s3.disc));
    ok('…and an icon tile keeps its note at 1.25 lines (the v2.66 rule that stayed in @layer app still wins)', s3 && s3.emoji && s3.note && Math.abs(parseFloat(s3.note.lh) / parseFloat(s3.note.fs) - 1.25) < 0.01, JSON.stringify(s3 && s3.note));
    await go("5", { ml_cu_style:"sep" }); const s5 = await look();
    ok('5 across: the smaller 18px disc at the 6px margin (it comes after the base disc in the layer, so it wins)', s5 && s5.disc && s5.disc.h==='18px' && s5.disc.top==='6px', JSON.stringify(s5 && s5.disc));
    await go("4", { ml_cu_style:"tog" }); const s4 = await look();
    ok('4 across, one pill: 5px side padding, not the base 8px', s4 && s4.tog && /^5(\.\d+)?px$/.test(s4.tog.pl), JSON.stringify(s4 && s4.tog));
    await go("3", { ml_cu_style:"sep", ml_cu_dp:"tl", ml_cu_de:"border", ml_gapx:"14", ml_gapy:"14" }); const sb = await look();
    ok('a disc on the border (gaps of 13px or more allow it) sits on the top-left corner, half out (top 0, translated -50% -50%)', sb && sb.disc && sb.disc.top==='0px' && /matrix\(1, 0, 0, 1, -\d/.test(sb.disc.tf), JSON.stringify(sb && sb.disc));
    await go("1", {}); const l0 = await look();
    ok('one item per row, no style: the amount line keeps its 8px gap (v2.91, in tiles, over the one-line auto margin left in app)', l0 && /linelist/.test(l0.z) && l0.meta && l0.meta.disp!=='none' && l0.meta.ml==='8px', JSON.stringify(l0 && l0.meta));
    await go("1", { ml_cu_style:"sep" }); const l1 = await look();
    ok('…with the disc chosen: the disc sits in the row (static, not placed) and the amount line is hidden', l1 && l1.disc && l1.disc.pos==='static' && /flex/.test(l1.disc.disp) && l1.alt && l1.alt.disp==='none', JSON.stringify(l1 && { d:l1.disc, a:l1.alt }));
    const tool = fs.readFileSync(path.join(ROOT,'.claude','tools','cssdiff.js'),'utf8');
    ok('the comparison tool covers every badge place, with valid styles', /ml_cu_tp:tp/.test(tool) && /ml_cu_dp:dp/.test(tool) && /ml_cu_uw:uw/.test(tool) && /\["tog","note","sep"\]/.test(tool) && !/"disc"\]/.test(tool) && /'align-content','vertical-align'/.test(tool));
    ok('the move tool is in the repo', fs.existsSync(path.join(ROOT,'.claude','tools','layermove.py')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
