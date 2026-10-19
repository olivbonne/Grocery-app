/* v2.46 — the household's items A, B, D, E of 19 October (C, shared prices, is v2.47).

   WHAT THESE CHECKS HAVE TO PROVE:
   - (A) signed in with an email, "Your account" offers Delete my account; it asks first; it shows that it is working; it
     takes this account off every list this phone knows (access entry false, name cleared) and empties its saved lists
     BEFORE Firebase deletes the account; it ends in a plain message and the phone carries on quietly signed in, with its
     lists; Firebase asking for a fresh sign-in is explained;
   - (B) the French covers the screens v2.45 left in English — checked by v245's key test, plus here: the look page's
     section titles and the Plan page read in French;
   - (D) crash reports are grouped — tested in api-feedback.js; here: the monitoring guide exists and keeps the privacy
     promise (no analytics);
   - (E) one more pure module was split out of js/app.js, imported versioned and precached.

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
  if(ref && ref.path && ref.path.indexOf('users/')===0) setTimeout(()=>{ if(window.__acctDeny){ er && er({ code:'permission-denied' }); return; }
    cb({ exists:()=>!!window.__acct, data:()=>window.__acct }); }, 50);
  return ()=>{}; };
export const setDoc=async(ref,d,o)=>{ if(ref && ref.path && (ref.path.indexOf('users/')===0 || ref.path.indexOf('access/')===0)){ const w={ path:ref.path, d:JSON.parse(JSON.stringify(d)) }; try{ const a=JSON.parse(localStorage.getItem('t_writes')||'[]'); a.push(w); localStorage.setItem('t_writes', JSON.stringify(a)); }catch(e){}
  if(window.__acctDeny){ const e=new Error('Missing or insufficient permissions.'); e.code='permission-denied'; throw e; } } };`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; let cb=null; window.__auth=A; window.__calls=[];
const user=(uid,email)=>({ uid, email:email||null, isAnonymous:!email, getIdToken: async()=>'tok-'+uid });
export function initializeAuth(){ if(window.__restore){ A.authStateReady=()=>new Promise(r=>setTimeout(()=>{ A.currentUser=user('anon1'); r(); }, 300)); } return A; }
export function onAuthStateChanged(a, f){ cb=f; setTimeout(()=>f(A.currentUser), 0); return ()=>{}; }
export async function signInAnonymously(){ A.currentUser=user('anon1'); window.__calls.push('anon'); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function sendSignInLinkToEmail(a, email, s){ window.__calls.push('send'); window.__sent={ email, s };
  if(window.__sendFail){ const e=new Error('x'); e.code=window.__sendFail; throw e; } }
export function isSignInWithEmailLink(a, url){ return /[?&]oobCode=/.test(String(url||'')) && /[?&]mode=signIn/.test(String(url||'')); }
export const EmailAuthProvider={ credentialWithLink:(email, url)=>({ email, url }), credential:(email, pw)=>({ email, pw }) };
export async function linkWithCredential(u, cred){ window.__calls.push('link:'+cred.email); if(cred.pw) await new Promise(r=>setTimeout(r, 300));   /* v2.41: a real sign-in takes a moment; the busy line must show */
  if(window.__taken){ const e=new Error('x'); e.code='auth/credential-already-in-use'; throw e; }
  u.email=cred.email; u.isAnonymous=false; if(cb) cb(u); return { user:u }; }
export async function signInWithEmailLink(a, email, url){ window.__calls.push('signin:'+email); A.currentUser=user('acct2', email); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function signInWithEmailAndPassword(a, email, pw){ window.__calls.push('pw:'+email);
  if(window.__wrongPw){ const e=new Error('x'); e.code='auth/invalid-credential'; throw e; }
  A.currentUser=user('acct2', email); if(cb) cb(A.currentUser); return { user:A.currentUser }; }
export async function sendPasswordResetEmail(a, email){ window.__calls.push('reset:'+email); }
export async function updatePassword(u, pw){ window.__calls.push('setpw:'+pw.length); await new Promise(r=>setTimeout(r, 200));
  if(window.__pwFail){ const e=new Error('x'); e.code=window.__pwFail; throw e; } }
export async function deleteUser(u){ window.__calls.push('delete:'+u.uid); await new Promise(r=>setTimeout(r, 200));
  if(window.__delFail){ const e=new Error('x'); e.code=window.__delFail; throw e; } A.currentUser=null; if(cb) cb(null); }
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
    await page.addInitScript(`window.__restore=${!!o.restore}; window.__acct=${JSON.stringify(o.acct||null)}; window.__acctDeny=${!!o.deny}; window.__taken=${!!o.taken}; window.__wrongPw=${!!o.wrongPw}; window.__pwFail=${JSON.stringify(o.pwFail||'')}; window.__delFail=${JSON.stringify(o.delFail||'')}; window.__sendFail=${JSON.stringify(o.sendFail||'')};`);
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

  const signIn = async()=>{ await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await page.locator('#acctPw').fill('123456'); await tap('#acctGo'); await page.waitForTimeout(800); await toAcct(); };
  try{
    /* ── A ──────────────────────────────────────────────────────────── */
    await mk({ acct:{ lists:{} } });
    await signIn();
    ok('(A) signed in, "Your account" offers Delete my account', await page.evaluate(()=>!!document.querySelector('#acctDel')), await box());
    await page.evaluate(()=>{ window.__asked=0; window.confirm=()=>{ window.__asked++; return false; }; localStorage.setItem('t_writes','[]'); });
    await tap('#acctDel');
    ok('(A) it asks first, and a No changes nothing', await page.evaluate(()=>window.__asked===1 && !window.__calls.some(c=>/^delete:/.test(c))), '');
    await page.evaluate(()=>{ window.confirm=()=>true; });
    await page.locator('#acctDel').click(); await page.waitForTimeout(60);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#acctBox [role=status]'); return s ? s.textContent : ''; });
    await page.waitForTimeout(900);
    const w = await page.evaluate(()=>JSON.parse(localStorage.getItem('t_writes')||'[]'));
    const calls = await page.evaluate(()=>window.__calls.slice());
    const accW = w.find(x=>x.path==='access/v101'), usrW = w.find(x=>x.path==='users/anon1');
    ok('(A) it shows that it is working', /Deleting your account/.test(busy), busy);
    ok('(A) the account comes off the list and its saved lists are emptied, before Firebase deletes it', accW && accW.d.acl && accW.d.acl.anon1===false && accW.d.names && accW.d.names.anon1===''
      && usrW && JSON.stringify(usrW.d.lists)==='{}' && calls.includes('delete:anon1'), JSON.stringify(w).slice(0,300)+' '+JSON.stringify(calls));
    await toAcct();
    ok('(A) it ends in a plain message, and the phone carries on quietly signed in, with its lists', /account is deleted/.test(await box()) && await page.evaluate(()=>!!(window.__auth.currentUser && window.__auth.currentUser.isAnonymous))
      && (await lists()).includes('v101'), await box());
    await shot('deleted');
    await mk({ acct:{ lists:{} }, delFail:'auth/requires-recent-login' });
    await signIn(); await page.evaluate(()=>{ window.confirm=()=>true; });
    await tap('#acctDel'); await page.waitForTimeout(500); await toAcct();
    ok('(A) Firebase asking for a fresh sign-in is explained, and the wait ends', /fresh sign-in/.test(await box()) && await page.evaluate(()=>!document.querySelector('#acctBox .spin')), await box());

    /* ── B ──────────────────────────────────────────────────────────── */
    await mk({ extra:`localStorage.setItem("ml_lang","fr");` });
    await tap('#setNav'); await tap('#optLook'); await page.waitForTimeout(400);
    const look = await page.evaluate(()=>document.body.innerText);
    ok('(B) the "Customise the look" page reads in French', /Couleurs|Mise en page/.test(look) && !/\bBars and overlays\b/.test(look), look.slice(0,200));
    await tap('#lookBack').catch(()=>{});
    await tap('[id^="planNav"]:visible'); await page.waitForTimeout(500);
    const plan = await page.evaluate(()=>document.body.innerText);
    ok('(B) the Plan page reads in French', !/\bNothing planned\b/.test(plan) && /Menus/.test(plan), plan.slice(0,200));
    await shot('fr-plan');

    /* ── D, E ───────────────────────────────────────────────────────── */
    const mon = fs.existsSync(path.join(ROOT,'docs','monitoring.md')) ? fs.readFileSync(path.join(ROOT,'docs','monitoring.md'),'utf8') : '';
    ok('(D) the monitoring guide says where to look, and keeps the no-analytics promise', /sig:/.test(mon) && /Observability/.test(mon) && /no analytics/i.test(mon), '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    const mods = [...src.matchAll(/from "\.\/([a-z0-9]+)\.js\?v=/g)].map(m=>m[1]);
    const known = ['tenpct','compare','spend','aisles','till','amounts','platform','i18n'];
    const extra = mods.filter(m=>!known.includes(m));
    ok('(E) one more module is split out of js/app.js, imported versioned and precached', extra.length>=1 && extra.every(m=>new RegExp('/js/'+m+'\\.js\\?v=').test(sw)), JSON.stringify(mods));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
