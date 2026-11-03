/* v2.98 — Edit this page, step 2: each block's own settings (Pictures, Text, Position).

   WHAT THESE CHECKS HAVE TO PROVE:
   - in edit mode each block's toolbar has a settings button that opens a panel inside the block; tile blocks offer Pictures,
     Text and Position, text blocks Text only; the defaults show as chosen;
   - Your list › Pictures Off hides the drawings in that block only (Regulars keep theirs); Text Left puts the names at the
     tile's left; Position Top puts the contents at the top of the tile; all three survive a relaunch;
   - the panel works while the block's own contents ignore taps; Reset clears the settings. */
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
const refused = p => S.refuse && /^lists\\/[^/]+\\/items\\//.test(p);
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
    const it2=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
    const D = DOC({ items:[ it2("1","Yogurt","dairy",{ note:"Blueberrie" }), it2("2","Dates","fruit") ] });
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const items = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).filter(i=>/yogurt/i.test(i.name)).map(i=>({ id:i.id, note:i.note||"", cat:i.cat })); });




    const DP = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ], buyAgain:[{ name:"Rice", cat:"bulk", qty:1, weight:"", sub:"", note:"", where:"", ts:2000 }] });
    const OPEN='localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:["bulk","others"]})); localStorage.setItem("ml_largecols","3");';
    await mk({ srv:{ "lists/v101": DP }, cache:DP, extra:BASE+OPEN });
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smEditPage').click(); await page.waitForTimeout(500);
    await page.locator('.pblock[data-pb="shop.list"] [data-pbset]').click(); await page.waitForTimeout(400);
    const panel = await page.evaluate(()=>{ const p=document.querySelector('.pblock[data-pb="shop.list"] .pbset'); if(!p) return null;
      return { rows:[...p.querySelectorAll('.pbsrow')].map(r=>r.textContent.replace(/\s+/g,' ').trim()), on:[...p.querySelectorAll('.on')].map(b=>b.textContent.trim()) }; });
    ok('a tile block\'s settings: Pictures, Text and Position, with the defaults chosen (On, Centre, Middle)', panel && panel.rows.length===3 && /Pictures/.test(panel.rows[0]) && /Text/.test(panel.rows[1]) && /Position/.test(panel.rows[2]) && ['On','Centre','Middle'].every(x=>panel.on.includes(x)), JSON.stringify(panel));
    const pick = async(row, val)=>{ await page.locator(`.pblock[data-pb="shop.list"] .pbset [data-pbs="${row}"][data-pbsv="${val}"]`).click(); await page.waitForTimeout(400); };
    await pick('img','off'); await pick('ta','left'); await pick('tv','top');
    await page.locator('#peDone').click(); await page.waitForTimeout(400);
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1600);
    const g = await page.evaluate(()=>{ const t=document.querySelector('.pblock[data-pb="shop.list"] .pill[data-pill="1"]'), nm=t.querySelector('.pname');
      const tr=t.getBoundingClientRect(), nr=nm.getBoundingClientRect(), em=t.querySelector('.pemoji');
      const regEm=document.querySelector('.pblock[data-pb="shop.regulars"] .pill .pemoji');
      return { emHidden: !em || getComputedStyle(em).display==='none', regShown: !!regEm && getComputedStyle(regEm).display!=='none',
        leftGap: Math.round(nr.left-tr.left), rightGap: Math.round(tr.right-nr.right), topGap: Math.round(nr.top-tr.top), botGap: Math.round(tr.bottom-nr.bottom) }; });
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-settings.png') });
    ok('Your list › Pictures Off hides the drawings there only — Regulars keep theirs (after a relaunch)', g.emHidden && g.regShown, JSON.stringify(g));
    ok('…Text Left puts the name at the tile\'s left, Position Top puts it at the top', g.leftGap < g.rightGap && g.topGap < g.botGap, JSON.stringify(g));
    /* a text block offers Text only */
    await page.locator('#bottomnav .navbtn').nth(0).click(); await page.waitForTimeout(900);
    await page.locator('#pwMore').click(); await page.waitForTimeout(500); await page.locator('#pwEdit').click(); await page.waitForTimeout(500);
    await page.locator('.pblock[data-pb="plan.hint"] [data-pbset]').click(); await page.waitForTimeout(400);
    const tp = await page.evaluate(()=>[...document.querySelectorAll('.pblock[data-pb="plan.hint"] .pbset .pbsrow')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
    ok('a text block (the Plan tip) offers Text only', tp.length===1 && /Text/.test(tp[0]), JSON.stringify(tp));
    /* Reset clears the settings */
    await page.locator('#peDone').click(); await page.waitForTimeout(300);
    await page.locator('#bottomnav .navbtn').nth(1).click(); await page.waitForTimeout(900);
    page.once('dialog', d=>d.accept());
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smEditPage').click(); await page.waitForTimeout(400);
    await page.locator('#peReset').click(); await page.waitForTimeout(500);
    const lay = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_pagelay')||'{}'));
    ok('Reset clears this page\'s block settings', !lay.shop, JSON.stringify(lay));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Pictures','Settings for {x}','Middle'].every(k=>fr.includes(`"${k}"`)));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
