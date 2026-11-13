/* v3.04 — the cards' logic in js/cards.js (pure, tested here in Node), and the 21st card refused with a message (lesson 71).

   WHAT THESE CHECKS HAVE TO PROVE:
   - js/cards.js has no imports and the app imports it versioned, with a PRECACHE entry;
   - in Node: the stored list is read safely; a card's shop comes from its name or number; the card for a shop is the tied
     one, then the chain's, then a shared word; a move swaps neighbours and never loses or duplicates a card; "Show my card"
     opens the shop's card, the only card, the grid, or the add panel;
   - in the app: saving a 21st card says "Up to 20 cards" and the twenty stored are untouched; the v3.03 grid still works. */
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
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), cs = fs.readFileSync(path.join(ROOT,'js','cards.js'),'utf8'), sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    ok('js/cards.js is pure (no imports); the app imports it versioned and the worker precaches it', !/^\s*import\s/m.test(cs) && /from "\.\/cards\.js\?v=\d+\.\d+"/.test(src) && /"\/js\/cards\.js\?v=\d+\.\d+"/.test(sw));
    ok('the moved functions are defined once, in the module', !/function cardChainOf\(|function cardWords\(|function cardNumFmt\(|const CARD_MAX/.test(src) && /export function cardChainOf\(/.test(cs) && /export const CARD_MAX = 20;/.test(cs));
    const C = await import(pathToFileURL(path.join(ROOT,'js','cards.js')).href);
    ok('the stored list is read safely: bad JSON, a non-list and cards without id or name give no cards',
      C.cardsParse('{oops').length===0 && C.cardsParse('{"a":1}').length===0 && C.cardsParse(null).length===0 && C.cardsParse('[{"id":"a","name":"X"},{"id":"b"},null,{"name":"Y"}]').length===1);
    ok('a card\'s shop from its name or number: Flybuys and 6008… are Coles, Everyday Rewards is Woolworths, a library card is nobody\'s',
      C.cardChainOf('Flybuys','')==='coles' && C.cardChainOf('My card','6008123')==='coles' && C.cardChainOf('Everyday Rewards','')==='woolworths' && C.cardChainOf('Library','A1')==='' && C.cardChain({ name:'X', chain:'coles' })==='coles');
    const chainOf = n => /coles/i.test(n) ? 'coles' : /woolworths/i.test(n) ? 'woolworths' : '';
    const all = [ { id:'a', name:'Flybuys', num:'6008' }, { id:'b', name:'Everyday Rewards', num:'9' }, { id:'c', name:"My Dan's", num:'1' }, { id:'d', name:'Library', num:'2', stores:['s9'] } ];
    const f = (id,name)=>{ const c=C.cardForStore(all, { id, name }, chainOf); return c ? c.id : null; };
    ok('the card for a shop: the tied one first, then the chain\'s, then a shared word; none for a stranger',
      f('s9','Coles Anywhere')==='d' && f('s1','Coles Dandenong')==='a' && f('s2','Woolworths Box Hill')==='b' && f('s3',"Dan Murphy's Box Hill")==='c' && f('s4','Bunnings')===null && C.cardForStore(all, null, chainOf)===null, '');
    const ids = a => a.map(x=>x.id).join('');
    ok('a move swaps neighbours, returns a new list, and cannot lose or duplicate a card (first earlier, last later, unknown id: unchanged)',
      ids(C.cardMove(all,'a',1))==='bacd' && ids(C.cardMove(all,'d',-1))==='abdc' && ids(C.cardMove(all,'a',-1))==='abcd' && ids(C.cardMove(all,'d',1))==='abcd' && ids(C.cardMove(all,'zz',1))==='abcd' && ids(all)==='abcd' && C.cardMove(all,'a',1)!==all);
    ok('"Show my card" opens the shop\'s card, else the only card, else the grid, else the add panel',
      JSON.stringify([C.cardOpenTarget(all[1], all), C.cardOpenTarget(null, all.slice(0,1)), C.cardOpenTarget(null, all), C.cardOpenTarget(null, [])])==='[{"id":"b"},{"id":"a"},{"grid":true},{"add":true}]');
    ok('the number is shown in fours; room for one more until twenty', C.cardNumFmt('6008 12341234')==='6008 1234 1234' && C.cardRoom(new Array(19).fill(0)) && !C.cardRoom(new Array(20).fill(0)));
    /* in the app: the 21st card */
    const many = Array.from({ length:20 }, (_,k)=>({ id:'m'+k, name:'Card '+(k+1), chain:'', num:String(1000+k), photo:'' }));
    const D = DOC({ items:[ it("1","Milk","dairy") ] });
    await mk({ srv:{ "lists/v101": D }, cache:D, extra:`localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_cards", ${JSON.stringify(JSON.stringify(many))});` });
    await page.locator('#shopMenu').click(); await page.waitForTimeout(400); await page.locator('#smCard').click(); await page.waitForTimeout(500);
    const g = await page.evaluate(()=>document.querySelectorAll('#cardSheet .cardtile:not(.cardtile-add)').length);
    await page.locator('#cardSheet [data-card-pick="m0"]').click(); await page.waitForTimeout(400);
    await page.evaluate(()=>{ const d=document.querySelector('[data-card-addpanel]'); if(d) d.click(); }); await page.waitForTimeout(400);
    const typeGo = await page.locator('#cardTypeGo').count();
    let msg = '', said = '';
    if(typeGo){ await page.locator('#cardTypeGo').click(); await page.waitForTimeout(400);
      said = await page.evaluate(()=>(document.getElementById('toast')||{}).textContent||'');
      if(await page.locator('#ceName').count()){ await page.locator('#ceName').fill('One too many'); await page.locator('#ceNum').fill('4242'); await page.locator('#ceSave').click(); await page.waitForTimeout(400);
        msg = await page.evaluate(()=>(document.querySelector('.rpterr')||{}).textContent||''); } }
    const after = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cards')||'[]').map(c=>c.id).join());
    ok('with twenty cards the grid shows twenty, and adding a 21st is refused with "Up to 20 cards" — the twenty are untouched',
      g===20 && /Up to 20 cards/.test(msg+said) && after===many.map(c=>c.id).join(), JSON.stringify({ g, msg, said, n:after.split(',').length }));
    ok('the Save handler refuses a new card when there is no room (not a trim)', /if\(i<0 && !cardRoom\(a\)\)/.test(src));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
