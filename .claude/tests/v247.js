/* v2.47 — shared prices between households (the household's item C; Do later L5, plan item 5). Opt-in; Coles, Woolworths
   and ALDI only; an email account writes only its own entry; any signed-in phone reads; the middle price of at least two
   households from the last 30 days fills the gaps in "Which store is cheaper".

   WHAT THESE CHECKS HAVE TO PROVE:
   - js/shared.js in Node: which stores are shared (the three chains, not IGA), the record's key, the MEDIAN (a silly price
     cannot move it; one household is not enough; a 40-day-old price is ignored), and that a shared price is only added
     where the household has none of its own for that store;
   - js/compare.js still gives the same answer with no shared prices, and counts the shared ones per store;
   - in the app, off by default: no shared record is read and the comparison is the household's own; turned on, the gaps
     are filled and the store's line says "from other households";
   - sharing your own prices needs an email account, is called after a receipt is saved, and writes only your own entry;
   - the setting is kept in BOTH appearance-slot exclusion lists; the rules, the privacy page and the Playground steps say
     what is shared and who may write it.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,q)=>({id,name:n,cat:c,qty:q||1,weight:"",checked:false,tags:[]});
const NAMES=[["Salad rocket","vegetable",1],["High protein yogurt","fresh",2],["Frozen raspberries","fresh",2],["Cream","fresh",1],["Nexba lemon squash","others",2],["Popcorn Sweet and Salty","others",2],["Linguine","bulk",2],["Honey","bulk",1],["Tofu soft","asian",2]];
const ITEMS=NAMES.map(([n,c,q],i)=>it(String(i+1),n,c,q));
let CARDREPLY = { status:200, body:{ name:'Flybuys', number:'6008943218616910' }, delay:500 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ml_cache_v101")), ${JSON.stringify(o.doc||{})})));
  ${o.extra||''}
})()`; };

/* this suite's own stubs: Firestore answers users/… from window.__acct and records writes; the list itself runs on its cache */
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export default {};
export const doc=(db,...p)=>({ path:p.join('/') });
export const onSnapshot=(ref,a,b,c)=>{ const cb=typeof a==='function'?a:b, er=typeof a==='function'?b:c;
  if(ref && ref.path && ref.path.indexOf('shared/')===0){ window.__reads=(window.__reads||[]); window.__reads.push(ref.path);
    const k=ref.path.slice(7); setTimeout(()=>{ const d=window.__sharedDocs && window.__sharedDocs(k); cb({ exists:()=>!!d, data:()=>d }); }, 40); }
  return ()=>{}; };
export const setDoc=async(ref,d,o)=>{ if(ref && ref.path && ref.path.indexOf('shared/')===0){ try{ const a=JSON.parse(localStorage.getItem('t_swrites')||'[]'); a.push({ path:ref.path, d, merge:!!(o&&o.merge) }); localStorage.setItem('t_swrites', JSON.stringify(a)); }catch(e){} } };`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; let cb=null; window.__auth=A; window.__calls=[];
const user=(uid,email)=>({ uid, email:email||null, isAnonymous:!email, getIdToken: async()=>'tok-'+uid });
export function initializeAuth(){ if(window.__restore){ A.authStateReady=()=>new Promise(r=>setTimeout(()=>{ A.currentUser=user('anon1'); r(); }, 300)); } return A; }
export function onAuthStateChanged(a, f){ cb=f; setTimeout(()=>f(A.currentUser), 0); return ()=>{}; }
export async function signInAnonymously(){ A.currentUser=user('anon1'); window.__calls.push('anon'); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function sendSignInLinkToEmail(a, email, s){ window.__calls.push('send'); window.__sent={ email, s };
  if(window.__sendFail){ const e=new Error('x'); e.code=window.__sendFail; throw e; } }
export function isSignInWithEmailLink(a, url){ return /[?&]oobCode=/.test(String(url||'')) && /[?&]mode=signIn/.test(String(url||'')); }
export const EmailAuthProvider={ credentialWithLink:(email, url)=>({ email, url }) };
export async function linkWithCredential(u, cred){ window.__calls.push('link:'+cred.email);
  if(window.__taken){ const e=new Error('x'); e.code='auth/credential-already-in-use'; throw e; }
  u.email=cred.email; u.isAnonymous=false; if(cb) cb(u); return { user:u }; }
export async function signInWithEmailLink(a, email, url){ window.__calls.push('signin:'+email); A.currentUser=user('acct2', email); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function signOut(){ window.__calls.push('out'); A.currentUser=null; if(cb) cb(null); }`;
const LINK = 'https://grocery-list-88109.firebaseapp.com/__/auth/action?apiKey=k&mode=signIn&oobCode=CODE123&continueUrl=x&lang=en';

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    page.on('dialog', d=>d.accept(o.promptEmail||''));
    await page.addInitScript(`window.__sharedDocs=(k)=>{ const now=Date.now(); return /^woolworths__/.test(k) ? { by:{ hA:{ p:1, d:now }, hB:{ p:1.2, d:now }, hC:{ p:50, d:now } } } : null; }; window.__restore=${!!o.restore}; window.__acct=${JSON.stringify(o.acct||null)}; window.__acctDeny=${!!o.deny}; window.__taken=${!!o.taken}; window.__sendFail=${JSON.stringify(o.sendFail||'')};`);
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101${o.q||''}`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const ls = k=>page.evaluate(k=>localStorage.getItem(k), k);
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const box = ()=>page.evaluate(()=>{ const b=document.querySelector('#acctBox'); return b ? b.textContent.replace(/\s+/g,' ').trim() : ''; });
  const toAcct = async()=>{ await tap('#setNav'); await page.evaluate(()=>{ const b=document.querySelector('#acctBox'); if(b) b.scrollIntoView({ block:'center' }); }); await page.waitForTimeout(200); };
  const lists = async()=>JSON.parse(await ls('ml_lists')||'[]').map(l=>l.code);
  const writes = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('t_writes')||'[]'));   // in storage: leaving a list reloads the page

  const C=(p,d)=>({p,q:1,s:'dand',sn:'Coles Dandenong',d});
  const today = new Date().toISOString().slice(0,10);
  const PRICES = { milk:[C(4,today)], rice:[C(20,today)], 'soy sauce':[C(5,today)] };
  const ITEMS2 = [it('1','Milk','fresh',1), it('2','Rice','bulk',1), it('3','Soy sauce','asian',1)];
  const DOC = { prices:PRICES, stores:[{ id:'ww1', name:'Woolworths Box Hill', emoji:'🛒' }] };
  const rows = ()=>page.evaluate(()=>[...document.querySelectorAll('.cmprow')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
  try{
    /* ── the module, in Node ───────────────────────────────────────── */
    const { pathToFileURL } = require('url');
    const S = await import(pathToFileURL(path.join(ROOT,'js','shared.js')).href);
    const M = await import(pathToFileURL(path.join(ROOT,'js','compare.js')).href);
    const now = Date.now(), DAYMS = 864e5;
    ok('the three national chains are shared, others are not', S.shareChain('Coles Dandenong')==='coles' && S.shareChain('Woolworths Box Hill')==='woolworths' && S.shareChain('ALDI Clayton')==='aldi' && S.shareChain('IGA Kew')==='' && S.shareChain('Asian Richmond')==='', '');
    ok('the record\'s key: chain and item, plain letters only', S.sharedKey('coles','full cream milk 2l')==='coles__full-cream-milk-2l' && S.sharedKey('coles','')==='', S.sharedKey('coles','full cream milk 2l'));
    const m1 = S.sharedMedian({ a:{p:2,d:now}, b:{p:3,d:now}, c:{p:100,d:now} }, now);
    ok('the middle price: one silly price cannot move it', m1 && m1.p===3 && m1.n===3, JSON.stringify(m1));
    ok('…one household is not enough, and a price older than 30 days does not count', S.sharedMedian({ a:{p:2,d:now} }, now)===null
       && S.sharedMedian({ a:{p:2,d:now}, b:{p:3,d:now-40*DAYMS}, c:{p:5,d:now} }, now).p===3.5, '');
    const recs = S.sharedRecords([C(4,today)], [{id:'dand',name:'Coles Dandenong'},{id:'ww1',name:'Woolworths Box Hill'}], { coles:{p:3,n:2,d:now}, woolworths:{p:2,n:4,d:now} });
    ok('a shared price is added only where the household has none of its own for that store', recs.length===1 && recs[0].s==='ww1' && recs[0].p===2 && recs[0].shared===4, JSON.stringify(recs));
    const look = n=>PRICES[n.toLowerCase()]||[];
    const before = M.compareStores({ items:ITEMS2, lookup:look, now, minItems:3 });
    ok('compare.js: the same answer as before with no shared prices, and a count of shared ones per store', before.best===null && before.stores.length===1 && before.stores[0].shared===0 && before.stores[0].total===29, JSON.stringify(before));

    /* ── off by default ───────────────────────────────────────────── */
    await mk({ items:ITEMS2, doc:DOC });
    await tap('#setNav'); await tap('#optCompare'); await page.waitForTimeout(400);
    const r0 = await rows();
    ok('off by default: no shared price is read, and the comparison is the household\'s own', !r0.some(x=>/Woolworths/.test(x)) && await page.evaluate(()=>(window.__reads||[]).length===0), JSON.stringify(r0));
    ok('…and Settings offers it, off', await page.evaluate(()=>{ const b=document.querySelector('[data-opt-sharepx="0"]'); return !!(b && b.classList.contains('on')); }), '');

    /* ── turned on ────────────────────────────────────────────────── */
    await mk({ items:ITEMS2, doc:DOC, extra:`localStorage.setItem("ml_sharepx","1");` });
    await tap('#setNav'); await tap('#optCompare'); await page.waitForTimeout(900);
    const r1 = await rows();
    ok('turned on: the gaps are filled from other households, and the store\'s line says so', r1.some(x=>/^Woolworths Box Hill.*3 from other households/.test(x)) && r1.some(x=>/^Coles Dandenong/.test(x) && !/other households/.test(x)), JSON.stringify(r1));
    ok('…using the middle price (a $50 outlier among $1 and $1.20 does not count)', r1.some(x=>/^Woolworths Box Hill.*\$3\.60/.test(x)), JSON.stringify(r1));
    await shot('compare');

    /* ── sharing your own, and the paperwork ──────────────────────── */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const rc = src.slice(src.indexOf('function rcSave('), src.indexOf('function rcSave(')+4000);
    ok('your own prices are shared after a receipt is saved, only from an email account, only your own entry', /sharedContribute\(/.test(rc) && /function sharedContribute/.test(src)
       && /isAnonymous/.test(src.slice(src.indexOf('function shareEmailAcct'), src.indexOf('function shareEmailAcct')+300)) && /by:\s*\{\s*\[/.test(src.slice(src.indexOf('function sharedContribute'), src.indexOf('function sharedContribute')+1500)), '');
    ok('the setting is kept in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_sharepx\$/.test(x)).length===2, '');
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('the rules: anyone signed in reads, only an email account writes, only its own entry, a sane price and time', /match \/shared\/\{key\}/.test(rules) && /sign_in_provider != 'anonymous'/.test(rules)
       && /affectedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/.test(rules) && /mine\(\)\.p < 1000/.test(rules), '');
    ok('the privacy page and the Playground steps say what is shared', /Shared prices/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')) && /shared\/coles__milk/.test(fs.readFileSync(path.join(ROOT,'docs','firestore-rules.md'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
