/* v3.02 — Quick look: four ready-made layouts (the household's), in Settings and in the ⋯ menu; "Advanced look".

   WHAT THESE CHECKS HAVE TO PROVE:
   - Settings › Appearance starts with Quick look: List, Simple, Comfortable, Compact, fitting the row (nothing cut);
   - each one sets what the household asked: List 1 across no icons, Simple 2 no icons, Comfortable 3 with icons (not small),
     Compact 4 with small icons — and the notes still show on the tiles in every one;
   - nothing else changes (theme, text size, tile height keys untouched), and Undo puts back exactly what was there;
   - the ⋯ menu on the Shop page offers the same four, marks the one in use, and stays open;
   - the look page is called "Advanced look". */
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
    const BASE='localStorage.setItem("ml_nosmall","1");  localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","5"); localStorage.setItem("ml_icosize","xl"); localStorage.setItem("ml_theme","dark"); localStorage.setItem("ml_tilerad","17");';
    const D = DOC({ items:[ it("1","Yogurt","dairy",{ note:"Greek" }), it("2","Bread","bakery",{ note:"Sourdough" }), it("3","Milk","dairy"), it("4","Dates","fruit"), it("5","Leeks","vegetable") ] });
    const shot = async n => { if(out) await page.screenshot({ path: out.replace(/\.png$/, '-'+n+'.png') }); };
    const lay = ()=>page.evaluate(()=>{ const z=document.getElementById('zoomer'); const ps=[...z.querySelectorAll('.pill[data-pill]')]; const top=ps.length?ps[0].getBoundingClientRect().top:0;
      return { across:ps.filter(p=>Math.abs(p.getBoundingClientRect().top-top)<2).length, icons:ps.filter(p=>{ const e=p.querySelector('.pemoji'); return e && e.getBoundingClientRect().width>0; }).length,
        notes:ps.filter(p=>{ const n=p.querySelector('.pnote'); return n && n.getBoundingClientRect().height>0 && /Greek|Sourdough/.test(n.textContent); }).length,
        keys:{ cols:localStorage.getItem('ml_largecols'), emo:localStorage.getItem('ml_emoji_item'), ico:localStorage.getItem('ml_icosize'), theme:localStorage.getItem('ml_theme'), rad:localStorage.getItem('ml_tilerad') } }; });
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:BASE });
    await page.locator('#setNav').click(); await page.waitForTimeout(600);
    const st = await page.evaluate(()=>{ const bs=[...document.querySelectorAll('[data-opt-qlook]')]; const row=bs[0] && bs[0].closest('.optrow, .optrownl, div'); const seg=bs[0]&&bs[0].parentElement;
      const first=[...document.querySelectorAll('.optsect, [data-sect]')].find(e=>/Appearance/.test(e.textContent)||e.dataset.sect==='Appearance');
      return { labels:bs.map(b=>b.textContent.trim()), cut:bs.some(b=>b.scrollWidth>b.clientWidth+1), inside:seg ? seg.getBoundingClientRect().right<=391 && seg.getBoundingClientRect().left>=0 : false, on:bs.filter(b=>b.classList.contains('on')).length,
        look:(document.getElementById('optLook')||{}).textContent||'' }; });
    ok('Settings › Appearance offers Quick look: List, Simple, Comfortable, Compact — none cut, inside the screen, none marked for a look that is none of them',
      st.labels.join()==='List,Simple,Comfortable,Compact' && !st.cut && st.inside && st.on===0, JSON.stringify(st));
    ok('the look page\'s button reads "Advanced look"', /^Advanced look/.test(st.look.trim()), st.look.slice(0,60));
    await shot('settings');
    const want = { list:[1,false,null], simple:[2,false,null], comfy:[3,true,'big'], compact:[4,true,'s'] }; const got = {};
    for(const id of Object.keys(want)){
      await page.locator(`[data-opt-qlook="${id}"]`).click(); await page.waitForTimeout(400);
      const on = await page.evaluate(()=>[...document.querySelectorAll('[data-opt-qlook].on')].map(b=>b.dataset.optQlook));
      await page.locator('#cartNav, #cartNavS').first().click(); await page.waitForTimeout(700);
      got[id] = Object.assign(await lay(), { on }); await shot(id);
      await page.locator('#setNav').click(); await page.waitForTimeout(500); }
    const good = id => { const g=got[id], w=want[id]; return g.across===w[0] && (w[1] ? g.icons===5 : g.icons===0) && g.notes===2 && g.on.join()===id
      && (w[2]==='s' ? g.keys.ico==='s' : w[2]==='big' ? g.keys.ico!=='s' : true) && g.keys.theme==='dark' && g.keys.rad==='17'; };
    ok('List: 1 across, no icons, notes show; nothing else changed', good('list'), JSON.stringify(got.list));
    ok('Simple: 2 across, no icons, notes show', good('simple'), JSON.stringify(got.simple));
    ok('Comfortable: 3 across, icons (the size already chosen, XL — not small), notes show', good('comfy') && got.comfy.keys.ico==='xl', JSON.stringify(got.comfy));
    ok('Compact: 4 across, small icons, notes show', good('compact'), JSON.stringify(got.compact));
    /* from Compact (small icons) to Comfortable: small becomes L */
    await page.locator('[data-opt-qlook="comfy"]').click(); await page.waitForTimeout(400);
    const k2 = await page.evaluate(()=>({ ico:localStorage.getItem('ml_icosize'), toast:(document.getElementById('toast')||{}).textContent||'' }));
    ok('Comfortable after Compact: the small icons become L, and a message names the look with Undo', k2.ico==='l' && /Look: Comfortable/.test(k2.toast) && /Undo/.test(k2.toast), JSON.stringify(k2));
    await page.locator('#toast button').click(); await page.waitForTimeout(400);
    const k3 = await page.evaluate(()=>({ cols:localStorage.getItem('ml_largecols'), ico:localStorage.getItem('ml_icosize'), emo:localStorage.getItem('ml_emoji_item'), on:[...document.querySelectorAll('[data-opt-qlook].on')].map(b=>b.dataset.optQlook) }));
    ok('…Undo puts back exactly what was there (Compact)', k3.cols==='4' && k3.ico==='s' && k3.emo==='1' && k3.on.join()==='compact', JSON.stringify(k3));
    /* the ⋯ menu */
    await page.locator('#cartNav, #cartNavS').first().click(); await page.waitForTimeout(600);
    await page.locator('#shopMenu').first().click(); await page.waitForTimeout(500);
    const m0 = await page.evaluate(()=>{ const bs=[...document.querySelectorAll('#shopMenuEl [data-sm-look]')]; const m=document.getElementById('shopMenuEl').getBoundingClientRect();
      return { labels:bs.map(b=>b.textContent.trim()), on:bs.filter(b=>b.classList.contains('on')).map(b=>b.dataset.smLook), inside:bs.every(b=>{ const r=b.getBoundingClientRect(); return r.left>=m.left-1 && r.right<=m.right+1; }) }; });
    ok('the ⋯ menu offers the same four, inside the menu, with Compact marked', m0.labels.join()==='List,Simple,Comfortable,Compact' && m0.on.join()==='compact' && m0.inside, JSON.stringify(m0));
    await shot('menu');
    await page.locator('#shopMenuEl [data-sm-look="simple"]').click(); await page.waitForTimeout(600);
    const m1 = await page.evaluate(()=>({ open:!!document.getElementById('shopMenuEl'), on:[...document.querySelectorAll('#shopMenuEl [data-sm-look].on')].map(b=>b.dataset.smLook), cols:localStorage.getItem('ml_largecols'), emo:localStorage.getItem('ml_emoji_item') }));
    ok('…tapping Simple there applies it (2 across, no icons), marks it, and the menu stays open', m1.open && m1.on.join()==='simple' && m1.cols==='2' && m1.emo==='0', JSON.stringify(m1));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['"Advanced look"','"Quick look"','"Look: {x}"','"Comfortable"','"Compact"','"Simple"'].every(k=>fr.includes(k+':')), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
