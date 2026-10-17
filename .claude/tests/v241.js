/* v2.41 — an email and a password, inside the app (the household: "it is not common to have to copy the link"). A web app on
   iPhone cannot be opened by a link, so v2.40's email link landed in Safari; a password needs no link.

   WHAT THESE CHECKS HAVE TO PROVE:
   - "Your account" asks for an email and a password, with Continue; the email link is still offered, second;
   - a password under 6 characters is refused in words (Firebase's minimum — a 4-digit code would guard every list too weakly);
   - a new email UPGRADES the phone's quiet account (the same account, nothing on the phone changes), shows that it is
     working, and ends signed in, with the phone's lists written to the account and the account's lists brought back;
   - an email that already has an account (another phone) signs in to that one, keeping this phone's lists and its own;
   - a wrong password says so, offers "Forgot your password?", and that sends a reset email and says what happens next;
   - the return key in the password field is Continue.

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
export const setDoc=async(ref,d,o)=>{ if(ref && ref.path && ref.path.indexOf('users/')===0){ const w={ path:ref.path, d:JSON.parse(JSON.stringify(d)) }; try{ const a=JSON.parse(localStorage.getItem('t_writes')||'[]'); a.push(w); localStorage.setItem('t_writes', JSON.stringify(a)); }catch(e){}
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
    await page.addInitScript(`window.__restore=${!!o.restore}; window.__acct=${JSON.stringify(o.acct||null)}; window.__acctDeny=${!!o.deny}; window.__taken=${!!o.taken}; window.__wrongPw=${!!o.wrongPw}; window.__sendFail=${JSON.stringify(o.sendFail||'')};`);
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

  try{
    await mk({ acct:{ lists:{ camp1:{ name:'Camping', ts:10 } } } });
    await toAcct();
    const f = await page.evaluate(()=>({ email:!!document.querySelector('#acctEmail'), pw:(document.querySelector('#acctPw')||{}).type, go:(document.querySelector('#acctGo')||{}).textContent, link:(document.querySelector('#acctSend')||{}).textContent }));
    ok('"Your account" asks for an email and a password, with Continue; the email link is still offered, second', f.email && f.pw==='password' && f.go==='Continue' && /sign-in link/.test(f.link||''), JSON.stringify(f));
    await shot('form');
    await page.locator('#acctEmail').fill('olive@example.com'); await page.locator('#acctPw').fill('1234'); await tap('#acctGo');
    ok('a password under 6 characters is refused, in words, keeping the email', /at least 6 characters/.test(await box()) && (await page.locator('#acctEmail').inputValue())==='olive@example.com' && await page.evaluate(()=>!window.__calls.some(c=>/^link:|^pw:/.test(c))), await box());
    await page.locator('#acctPw').fill('123456');
    await page.locator('#acctGo').click(); await page.waitForTimeout(60);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#acctBox [role=status]'); return s ? s.textContent : ''; });
    await page.waitForTimeout(700);
    const c1 = await page.evaluate(()=>({ calls:window.__calls.slice(), uid:window.__auth.currentUser.uid, anon:window.__auth.currentUser.isAnonymous }));
    ok('a new email UPGRADES the quiet account — the same account — showing that it is working', /Signing in/.test(busy) && c1.calls.includes('link:olive@example.com') && c1.uid==='anon1' && !c1.anon, busy+' '+JSON.stringify(c1));
    await toAcct();
    ok('…and ends signed in', /Signed in as olive@example\.com/.test(await box()), await box());
    const l1 = await lists(), w1 = await writes();
    ok('…with the phone\'s lists written to the account, and the account\'s brought back', l1.includes('camp1') && l1.includes('v101') && w1.some(w=>w.path==='users/anon1' && w.d.lists && w.d.lists.v101), JSON.stringify(l1));
    await shot('signedin');

    await mk({ taken:true, acct:{ lists:{ other9:{ name:'From the other phone', ts:5 } } } });
    await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await page.locator('#acctPw').fill('654321');
    await page.locator('#acctPw').press('Enter'); await page.waitForTimeout(800);
    const c2 = await page.evaluate(()=>({ calls:window.__calls.slice(), uid:window.__auth.currentUser.uid }));
    const l2 = await lists();
    ok('the return key is Continue; an email that already has an account signs in to it, keeping both phones\' lists', c2.calls.includes('pw:olive@example.com') && c2.uid==='acct2' && l2.includes('v101') && l2.includes('other9'), JSON.stringify(c2)+' '+JSON.stringify(l2));

    await mk({ taken:true, wrongPw:true });
    await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await page.locator('#acctPw').fill('000000'); await tap('#acctGo'); await page.waitForTimeout(300);
    ok('a wrong password says so, and offers "Forgot your password?"', /doesn't match this email/.test(await box()) && await page.evaluate(()=>!!document.querySelector('#acctForgot')), await box());
    await tap('#acctForgot'); await page.waitForTimeout(300);
    ok('…which sends a reset email and says what happens next', await page.evaluate(()=>window.__calls.includes('reset:olive@example.com')) && /set a new password/.test(await box()), await box());
    await shot('forgot');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
