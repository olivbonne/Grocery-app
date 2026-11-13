/* v3.03 — My cards: a grid of card tiles, edit from the Shop page, reorder.

   WHAT THESE CHECKS HAVE TO PROVE:
   - ⋯ › Show my card with several cards and no shop: a grid, two across, one tile per card with its name, nothing cut or
     outside the sheet, and an Add card tile; a tap on a tile shows that card's barcode;
   - the barcode view has All cards and Edit: Edit opens the same edit sheet as Settings (name, number), Save changes the
     stored card and comes back to the card;
   - Edit mode in the grid: move later / earlier change the stored order (and the first has no "earlier", the last no "later");
     the pencil opens the edit sheet; Delete from there comes back to the grid without that card;
   - with one card the menu opens that card directly; twenty cards can be stored. */
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
    const BASE='localStorage.setItem("ml_nosmall","1");';
    const CARDS = [ { id:"c1", name:"Flybuys", chain:"coles", num:"6008123412341234", photo:"" }, { id:"c2", name:"Everyday Rewards", chain:"woolworths", num:"9355123412345", photo:"" },
      { id:"c3", name:"Dan Murphy's", chain:"", num:"123456789", photo:"" }, { id:"c4", name:"Library", chain:"", num:"A1234567", photo:"" }, { id:"c5", name:"Priceline Sister Club", chain:"", num:"5551234", photo:"" } ];
    const D = DOC({ items:[ it("1","Milk","dairy") ] });
    const withCards = cs => BASE + `localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(cs))});`;
    const stored = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cards')||'[]').map(c=>c.id+':'+c.name));
    const openMenuCard = async()=>{ await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smCard').click(); await page.waitForTimeout(500); };
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:withCards(CARDS) });
    await openMenuCard();
    const g = await page.evaluate(()=>{ const sh=document.getElementById('cardSheet').getBoundingClientRect(); const ts=[...document.querySelectorAll('#cardSheet .cardtile:not(.cardtile-add)')];
      const top=ts[0].getBoundingClientRect().top;
      return { title:(document.getElementById('cardTitle')||{}).textContent, names:ts.map(t=>t.textContent.trim()), across:ts.filter(t=>Math.abs(t.getBoundingClientRect().top-top)<2).length,
        inside:ts.every(t=>{ const r=t.getBoundingClientRect(); return r.left>=sh.left-1 && r.right<=sh.right+1; }), cut:ts.some(t=>{ const n=t.querySelector('.cardtile-n'); return n.scrollWidth>n.clientWidth+1; }),
        add:!!document.querySelector('#cardSheet .cardtile-add'), bgs:new Set(ts.map(t=>getComputedStyle(t).backgroundColor)).size, tools:document.querySelectorAll('.cardtile-tools').length }; });
    ok('⋯ › Show my card with five cards: "My cards", a grid two across, a tile per card with its name, inside the sheet, uncut, with an Add card tile',
      g.title==='My cards' && g.across===2 && g.names.join('|')==="Flybuys|Everyday Rewards|Dan Murphy's|Library|Priceline Sister Club" && g.inside && !g.cut && g.add && g.tools===0, JSON.stringify(g));
    ok('…the tiles carry their programmes\' colours (not all the same)', g.bgs>=2, String(g.bgs));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-grid.png') });
    await page.locator('#cardSheet [data-card-pick="c3"]').click(); await page.waitForTimeout(400);
    const v = await page.evaluate(()=>({ title:(document.getElementById('cardTitle')||{}).textContent, bc:!!document.querySelector('#cardSheet .bc128'), all:!!document.getElementById('cardAll'), edit:!!document.getElementById('cardEditThis') }));
    ok('a tap on a tile shows that card: its name, its barcode, with All cards and Edit', v.title==="Dan Murphy's" && v.bc && v.all && v.edit, JSON.stringify(v));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-card.png') });
    await page.locator('#cardEditThis').click(); await page.waitForTimeout(400);
    const e0 = await page.evaluate(()=>({ name:(document.getElementById('ceName')||{}).value, num:(document.getElementById('ceNum')||{}).value, del:!!document.getElementById('ceDel') }));
    await page.locator('#ceName').fill("Dan's"); await page.locator('#ceSave').click(); await page.waitForTimeout(500);
    const e1 = await page.evaluate(()=>({ title:(document.getElementById('cardTitle')||{}).textContent, edit:!!document.getElementById('ceSheet') }));
    ok('Edit there is the Settings edit sheet (name, number, Delete); Save stores the change and comes back to the card',
      e0.name==="Dan Murphy's" && e0.num==='123456789' && e0.del && e1.title==="Dan's" && !e1.edit && (await stored())[2]==="c3:Dan's", JSON.stringify({ e0, e1 }));
    await page.locator('#cardAll').click(); await page.waitForTimeout(400);
    await page.locator('#cardGridEdit').click(); await page.waitForTimeout(300);
    const t0 = await page.evaluate(()=>[...document.querySelectorAll('#cardSheet .cardtile:not(.cardtile-add)')].map(t=>[...t.querySelectorAll('.cardtile-tools button')].map(b=>b.hasAttribute('data-card-mv')?b.dataset.cardMv.split('|')[1]:'edit').join(',')));
    ok('grid › Edit: every tile gets earlier / later / pencil — the first has no "earlier", the last no "later"', t0[0]==='1,edit' && t0[4]==='-1,edit' && t0[2]==='-1,1,edit', JSON.stringify(t0));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-edit.png') });
    await page.locator('[data-card-mv="c1|1"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-card-mv="c5|-1"]').click(); await page.waitForTimeout(300);
    const o1 = await stored(); const still = await page.evaluate(()=>document.querySelectorAll('.cardtile-tools').length);
    ok('…move later / earlier change the stored order, and edit mode stays on', o1.map(x=>x.split(':')[0]).join()==='c2,c1,c3,c5,c4' && still===5, JSON.stringify(o1));
    await page.locator('.cardtile-tools [data-card-edit="c4"]').click(); await page.waitForTimeout(400);
    await page.locator('#ceDel').click(); await page.waitForTimeout(500);
    const d1 = await page.evaluate(()=>({ grid:!!document.querySelector('#cardSheet .cardgrid'), n:document.querySelectorAll('#cardSheet .cardtile:not(.cardtile-add)').length }));
    ok('…the pencil opens the edit sheet; Delete comes back to the grid without that card', d1.grid && d1.n===4 && (await stored()).length===4, JSON.stringify(d1));
    /* one card: straight to it; twenty fit */
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:withCards(CARDS.slice(0,1)) });
    await openMenuCard();
    const one = await page.evaluate(()=>({ grid:!!document.querySelector('#cardSheet .cardgrid'), bc:!!document.querySelector('#cardSheet .bc128'), all:!!document.getElementById('cardAll') }));
    ok('with one card the menu opens that card directly, with no "All cards"', !one.grid && one.bc && !one.all, JSON.stringify(one));
    const many = Array.from({ length:20 }, (_,k)=>({ id:'m'+k, name:'Card '+(k+1), chain:'', num:String(1000+k), photo:'' }));
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:withCards(many) });
    await openMenuCard();
    const m = await page.evaluate(()=>{ const sh=document.getElementById('cardSheet'); return { n:document.querySelectorAll('#cardSheet .cardtile:not(.cardtile-add)').length, add:!!document.querySelector('.cardtile-add'), scrolls:sh.scrollHeight>sh.clientHeight, fits:sh.getBoundingClientRect().bottom<=845 }; });
    ok('twenty cards show (no Add tile at the limit) and the sheet scrolls inside the screen', m.n===20 && !m.add && m.scrolls && m.fits, JSON.stringify(m));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['"My cards"','"All cards"','"Show all cards"','"Move {x} earlier"','"Move {x} later"','"Edit {x}"'].every(k=>fr.includes(k+':')));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
