/* v2.44 — members by account (architecture review A2; the household's item b of 19 October). Until now a list's code was the
   only key; now who may open a list is kept beside it in access/{code}, and the list itself does not change shape.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a list with no access record gets one from the first signed-in phone: only that phone's account, its name, a long
     random join key, and open for 30 days (so the household's other phones join by themselves);
   - the app's share link carries the join key; a link opened with a key keeps it on the phone and takes it OUT of the
     address bar, and a phone not yet on the list joins by adding only itself, showing the key;
   - a list read refused before the phone was in is opened again once it has joined;
   - refused for good (removed, or an old link after the open month), the phone says so in plain words;
   - Settings › People shows who is on the list; Remove takes a person off AND changes the link; "Close now" ends the open
     month; "New link" changes the key, kept on this phone for the next share;
   - the key is kept in BOTH appearance-slot exclusion lists; the rules keep the access record and its 20-day open start;
     the privacy page says what the record keeps.

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
const deny=()=>{ const e=new Error('Missing or insufficient permissions.'); e.code='permission-denied'; return e; };
const log=(w)=>{ try{ const a=JSON.parse(localStorage.getItem('t_awrites')||'[]'); a.push(w); localStorage.setItem('t_awrites', JSON.stringify(a)); }catch(e){} };
const merge=(a,b)=>{ const o=Object.assign({}, a||{}); for(const k of Object.keys(b||{})){ const v=b[k]; o[k]=(v && typeof v==='object' && !Array.isArray(v) && o[k] && typeof o[k]==='object') ? merge(o[k], v) : v; } return o; };
const member=()=>{ const u=window.__auth && window.__auth.currentUser; return !!(u && window.__access && window.__access.acl && window.__access.acl[u.uid]===true); };
export const onSnapshot=(ref,a,b,c)=>{ const cb=typeof a==='function'?a:b, er=typeof a==='function'?b:c;
  if(ref && ref.path && ref.path.indexOf('access/')===0){ setTimeout(()=>{
      if(window.__access && !member() && window.__accessHide){ er && er(deny()); return; }
      cb({ exists:()=>!!window.__access, data:()=>JSON.parse(JSON.stringify(window.__access)) }); }, 60); return ()=>{}; }
  if(ref && ref.path && ref.path.indexOf('lists/')===0){ window.__listSubs=(window.__listSubs||0)+1;
    if(window.__listDeny && !member()) setTimeout(()=>{ er && er(deny()); }, 30); }
  return ()=>{}; };
export const setDoc=async(ref,d,o)=>{ if(ref && ref.path && ref.path.indexOf('access/')===0){ log({ path:ref.path, d:JSON.parse(JSON.stringify(d)), merge:!!(o && o.merge) });
    if(window.__refuseJoin && !member()) throw deny();
    window.__access = (o && o.merge) ? merge(window.__access, d) : JSON.parse(JSON.stringify(d)); } };`;
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
    await page.addInitScript(`window.__access=${JSON.stringify(o.access||null)}; window.__accessHide=${!!o.hide}; window.__listDeny=${!!o.listDeny}; window.__refuseJoin=${!!o.refuseJoin}; window.__shared=null; navigator.share=async(d)=>{ window.__shared=d; }; navigator.canShare=()=>true; window.__restore=${!!o.restore}; window.__acct=${JSON.stringify(o.acct||null)}; window.__acctDeny=${!!o.deny}; window.__taken=${!!o.taken}; window.__sendFail=${JSON.stringify(o.sendFail||'')};`);
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

  const aw = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('t_awrites')||'[]'));
  const ppl = ()=>page.evaluate(()=>{ const b=document.querySelector('#accessBox'); return b ? b.textContent.replace(/\s+/g,' ').trim() : ''; });
  const toPeople = async()=>{ await tap('#setNav'); await page.evaluate(()=>{ const b=document.querySelector('#accessBox'); if(b) b.scrollIntoView({ block:'center' }); }); await page.waitForTimeout(200); };
  try{
    /* ── the first phone makes the record ────────────────────────────── */
    await mk({});
    await page.waitForTimeout(800);
    const w1 = await aw(), c = w1.find(w=>!w.merge);
    ok('a list with no access record gets one: only this phone\'s account, its name, a long key, open for 30 days',
      c && c.path==='access/v101' && JSON.stringify(c.d.acl)==='{"anon1":true}' && c.d.names && c.d.names.anon1==='O' && typeof c.d.joinKey==='string' && c.d.joinKey.length>=16
      && Math.abs(c.d.openUntil - (Date.now()+30*864e5)) < 36e5, JSON.stringify(w1).slice(0,300));
    ok('…and the phone keeps the key', (await ls('ml_jk_v101'))===(c && c.d.joinKey), String(await ls('ml_jk_v101')));
    await tap('#setNav'); await tap('#optShare'); await page.waitForTimeout(400);
    const sh = await page.evaluate(()=>window.__shared);
    ok('the app\'s share link carries the join key', sh && new RegExp('[?&]k='+((c&&c.d.joinKey)||'x')).test(String(sh.url||sh.text||'')), JSON.stringify(sh));

    /* ── joining with a link ─────────────────────────────────────────── */
    const KEY='abcdefghijklmnop1234';
    await mk({ hide:true, listDeny:true, access:{ acl:{ u2:true }, names:{ u2:'Sam' }, joinKey:KEY, openUntil:0 }, q:'&k='+KEY });
    await page.waitForTimeout(900);
    const j = (await aw()).find(w=>w.merge);
    const href = await page.evaluate(()=>location.href);
    ok('a link with a key: the key is kept on the phone and taken out of the address bar', (await ls('ml_jk_v101'))===KEY && !/[?&]k=/.test(href), href);
    ok('…and a phone not on the list joins by adding only itself, showing the key', j && JSON.stringify(j.d.acl)==='{"anon1":true}' && j.d.joinProof && j.d.joinProof.anon1===KEY
      && Object.keys(j.d).every(k=>['acl','names','joinProof'].includes(k)), JSON.stringify(j));
    ok('…and the list, refused before it joined, is opened again', await page.evaluate(()=>(window.__listSubs||0)>=2), String(await page.evaluate(()=>window.__listSubs)));

    /* ── locked out ──────────────────────────────────────────────────── */
    await mk({ hide:true, listDeny:true, refuseJoin:true, access:{ acl:{ u2:true }, names:{ u2:'Sam' }, joinKey:KEY, openUntil:0 } });
    await page.waitForTimeout(1500);
    const msg = await page.evaluate(()=>document.body.textContent.replace(/\s+/g,' '));
    ok('refused for good, the phone says so in plain words', /not on this list any more/.test(msg) && !/publish Firestore rules/.test(msg), (msg.match(/.{0,40}not on this list.{0,60}/)||[''])[0]);

    /* ── People ──────────────────────────────────────────────────────── */
    await mk({ access:{ acl:{ anon1:true, u2:true, u3:false }, names:{ anon1:'O', u2:'Sam', u3:'Gone' }, joinKey:KEY, openUntil:Date.now()+5*864e5 } });
    await page.waitForTimeout(700);
    await toPeople();
    const p1 = await ppl();
    ok('Settings › People shows who is on the list (not who was removed), with Remove for the others', /Sam/.test(p1) && !/Gone/.test(p1) && await page.evaluate(()=>document.querySelectorAll('[data-access-rm]').length===1 && !!document.querySelector('[data-access-rm="u2"]')), p1);
    ok('…and says the list is still open to its code for now, with Close now', /anyone with the list's code can still join/.test(p1) && await page.evaluate(()=>!!document.querySelector('#accessClose')), p1);
    await shot('people');
    await page.evaluate(()=>{ window.confirm=()=>true; localStorage.setItem('t_awrites','[]'); });
    await tap('[data-access-rm="u2"]'); await page.waitForTimeout(500);
    const r = (await aw()).find(w=>w.d.acl);
    ok('Remove takes the person off AND changes the link', r && r.d.acl.u2===false && r.d.joinKey && r.d.joinKey!==KEY && r.d.openUntil===0 && (await ls('ml_jk_v101'))===r.d.joinKey, JSON.stringify(r));
    await toPeople();
    const k1 = await ls('ml_jk_v101');
    await page.evaluate(()=>{ window.confirm=()=>true; localStorage.setItem('t_awrites','[]'); });
    await tap('#accessNewKey'); await page.waitForTimeout(500);
    const n = (await aw()).find(w=>w.d.joinKey);
    ok('"New link" changes the key, kept on this phone for the next share', n && n.d.joinKey!==k1 && (await ls('ml_jk_v101'))===n.d.joinKey, JSON.stringify(n));
    await mk({ access:{ acl:{ anon1:true }, names:{ anon1:'O' }, joinKey:KEY, openUntil:Date.now()+5*864e5 } });
    await page.waitForTimeout(700); await toPeople();
    await page.evaluate(()=>localStorage.setItem('t_awrites','[]'));
    await tap('#accessClose'); await page.waitForTimeout(500);
    ok('"Close now" ends the open month', (await aw()).some(w=>w.d.openUntil===0), JSON.stringify(await aw()));

    /* ── the source ──────────────────────────────────────────────────── */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the join key is in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_jk_/.test(x)).length===2, '');
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('the rules keep the access record, and a new one must start open for 20 days or more', /match \/access\/\{code\}/.test(rules) && /20 \* 24 \* 3600 \* 1000/.test(rules) && /allow get: if !hasAccess\(code\) \|\| memberOf\(code\)/.test(rules), '');
    ok('the privacy page says what the access record keeps', /who is on each list/i.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
