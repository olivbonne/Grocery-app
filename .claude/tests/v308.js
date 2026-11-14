/* v3.08 — a shorter ⋯ menu on the Shop page, in groups (plan item U3).

   WHAT THESE CHECKS HAVE TO PROVE:
   - the menu reads Store, then "At the shop" (card, receipt, cheaper store, fridge), "Display" (Look and one "More display
     options" button), "Your list" (send, occasions, spending, edit this page) and Report a problem last;
   - closed, the seven display rows (tiles, height, text size, theme, grouping, icons, sort) are not shown, and the menu is
     much shorter than before (it fits a 844 px screen with no scrolling);
   - "More display options" opens them in the menu (it stays open), says so (aria-expanded), and they still work; it is
     remembered while the app is open and shows "Fewer display options" to close;
   - the new words have their French, and the opener's mark is a drawn chevron, not a character. */
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
    const D = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ] });
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:'localStorage.setItem("ml_nosmall","1");' });
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const m0 = await page.evaluate(()=>{ const m=document.getElementById('shopMenuEl');
      const seq=[...m.querySelectorAll('.smgroup, .smitem, #smMore, .smtlabel')].map(e=>e.classList.contains('smgroup')?'#'+e.textContent.trim():e.id||e.textContent.trim());
      return { seq, h:m.scrollHeight, client:m.clientHeight, display:m.querySelectorAll('[data-sm-cols],[data-sm-lines],[data-sm-zoom],[data-sm-theme],[data-sm-caton],[data-sm-itememoji],[data-sm-sort]').length,
        exp:(document.getElementById('smMore')||{getAttribute:()=>null}).getAttribute('aria-expanded'), more:(document.getElementById('smMore')||{}).textContent||'', svg:!!document.querySelector('#smMore svg') }; });
    const seq = m0.seq.join(' ');
    ok('the menu reads Store, At the shop, Display (Look + More display options), Your list, then Report a problem last',
      /^Store #At the shop smCard smRcpt smCompare smFridge #Display Look smMore #Your list smSend smOcc smSpend smEditPage smReport$/.test(seq), seq);
    ok('closed, none of the seven display rows is shown', m0.display===0, String(m0.display));
    ok('the opener says "More display options", is marked closed, and its mark is drawn', /More display options/.test(m0.more) && m0.exp==='false' && m0.svg && !/[›→▸▾⌄]/.test(m0.more), m0.more);
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-closed.png') });
    await page.locator('#smMore').click(); await page.waitForTimeout(400);
    const m1 = await page.evaluate(()=>({ open:!!document.getElementById('shopMenuEl'), exp:document.getElementById('smMore').getAttribute('aria-expanded'), more:document.getElementById('smMore').textContent,
      rows:['cols','lines','zoom','theme','caton','itememoji','sort'].map(k=>document.querySelectorAll('#smMoreBox [data-sm-'+k+']').length>0) }));
    const hOpen = await page.evaluate(()=>document.getElementById('shopMenuEl').scrollHeight);
    ok('…and closed it is at most two thirds the height of the menu with everything shown (as it was before v3.08)', m0.h <= hOpen*2/3, JSON.stringify({ closed:m0.h, everything:hOpen }));
    ok('"More display options" opens all seven rows in the menu, which stays open, and then reads "Fewer display options"', m1.open && m1.exp==='true' && m1.rows.every(Boolean) && /Fewer display options/.test(m1.more), JSON.stringify(m1));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-open.png') });
    await page.locator('#smMoreBox [data-sm-cols="2"]').click(); await page.waitForTimeout(400);
    const m2 = await page.evaluate(()=>({ cols:localStorage.getItem('ml_largecols'), open:!!document.getElementById('smMoreBox') }));
    ok('…a row inside still works and the box stays open', m2.cols==='2' && m2.open, JSON.stringify(m2));
    await page.mouse.click(20, 820); await page.waitForTimeout(300);
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400);
    const m3 = await page.evaluate(()=>!!document.getElementById('smMoreBox'));
    ok('…closing and reopening the menu keeps it as it was left, while the app is open', m3);
    await page.locator('#smMore').click(); await page.waitForTimeout(300);
    ok('…and "Fewer display options" folds it away again', await page.evaluate(()=>!document.getElementById('smMoreBox')));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['"At the shop"','"Display"','"More display options"','"Fewer display options"','"Your list"'].every(k=>fr.includes(k+':')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
