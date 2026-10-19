/* v2.43 — the household's items of 19 October: a Regular picked in "+ Add items" opens Edit item at once; (a) an account
   made from the email link can set a password. (Items e and f — the phone-features layer and the module split — change no
   behaviour: every older suite is their test.)

   WHAT THESE CHECKS HAVE TO PROVE:
   - (1) picking a Regular in "+ Add items" puts it on the list and opens its Edit item panel straight away;
   - (1) a tap under "Add from your regulars" still just adds it (v2.42);
   - (a) signed in, "Your account" offers a new password and Save password; under 6 characters is refused in words; saving
     shows that it is working, then "Password saved"; Firebase asking for a fresh sign-in is explained, not a silent nothing;
   - (e) js/app.js no longer builds a file input or calls the device APIs itself: they go through js/platform.js.

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
export async function updatePassword(u, pw){ window.__calls.push('setpw:'+pw.length); await new Promise(r=>setTimeout(r, 200));
  if(window.__pwFail){ const e=new Error('x'); e.code=window.__pwFail; throw e; } }
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
    await page.addInitScript(`window.__restore=${!!o.restore}; window.__acct=${JSON.stringify(o.acct||null)}; window.__acctDeny=${!!o.deny}; window.__taken=${!!o.taken}; window.__wrongPw=${!!o.wrongPw}; window.__pwFail=${JSON.stringify(o.pwFail||'')}; window.__sendFail=${JSON.stringify(o.sendFail||'')};`);
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
    /* ── 1 ──────────────────────────────────────────────────────────── */
    await mk({ doc:{ buyAgain:[{ name:'Beer', cat:'alcohol', qty:2, ts:1 }] } });
    await tap('#shopAddFab'); await page.locator('#mainInput').fill('bee'); await page.waitForTimeout(500);
    await page.locator('#addSheet [data-add-ba^="Beer|"]').first().click(); await page.waitForTimeout(600);
    const p1 = await page.evaluate(()=>({ name:(document.querySelector('[data-ae-name]')||{}).value||'', on:JSON.parse(localStorage.getItem('ml_cache_v101')).items.filter(i=>i.name==='Beer').length }));
    ok('(1) a Regular picked in "+ Add items" goes on the list and opens its Edit item panel at once', p1.name==='Beer' && p1.on===1, JSON.stringify(p1));
    await shot('pick');
    await page.locator('#addDone').click({ force:true }); await page.waitForTimeout(1600);
    await mk({ doc:{ buyAgain:[{ name:'Sourdough', cat:'fresh', qty:1, ts:1 }] } });
    await page.locator('[data-regc="fresh"]').first().click(); await page.waitForTimeout(400);
    await page.locator('[data-reg-add^="Sourdough|"]').first().click(); await page.waitForTimeout(500);
    ok('(1) …while a tap under "Add from your regulars" still just adds it', await page.evaluate(()=>!document.querySelector('#addSheet') && JSON.parse(localStorage.getItem('ml_cache_v101')).items.some(i=>i.name==='Sourdough')), '');

    /* ── a ──────────────────────────────────────────────────────────── */
    await mk({ acct:{ lists:{} } });
    await signIn();
    ok('(a) signed in, "Your account" offers a new password and Save password', /Signed in as/.test(await box()) && await page.evaluate(()=>!!document.querySelector('#acctNewPw') && !!document.querySelector('#acctSetPw')), await box());
    await page.locator('#acctNewPw').fill('12345'); await tap('#acctSetPw');
    ok('(a) under 6 characters is refused, in words', /at least 6 characters/.test(await box()) && await page.evaluate(()=>!window.__calls.some(c=>/^setpw/.test(c))), await box());
    await page.locator('#acctNewPw').fill('246810');
    await page.locator('#acctSetPw').click(); await page.waitForTimeout(40);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#acctBox [role=status]'); return s ? s.textContent : ''; });
    await page.waitForTimeout(500);
    ok('(a) saving shows that it is working, then "Password saved"', /Saving the password/.test(busy) && /Password saved/.test(await box()) && await page.evaluate(()=>window.__calls.includes('setpw:6')), busy+' | '+(await box()).slice(0,120));
    await shot('pwsaved');
    await mk({ acct:{ lists:{} }, pwFail:'auth/requires-recent-login' });
    await signIn(); await page.locator('#acctNewPw').fill('246810'); await tap('#acctSetPw'); await page.waitForTimeout(400);
    ok('(a) Firebase asking for a fresh sign-in is explained', /fresh sign-in/.test(await box()) && await page.evaluate(()=>!document.querySelector('#acctBox .spin')), await box());

    /* ── e ──────────────────────────────────────────────────────────── */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const direct = (src.match(/\.type\s*=\s*["']file["']|navigator\.geolocation\.|navigator\.wakeLock\.|new BarcodeDetector/g)||[])   // file inputs written in the page's markup (icon, plan photo) are fine: only the ones built in code moved;
    ok('(e) js/app.js no longer builds a file input or calls location, wake lock or barcode itself — js/platform.js does', direct.length===0 && fs.existsSync(path.join(ROOT,'js','platform.js')) && /from "\.\/platform\.js\?v=/.test(src), JSON.stringify(direct));
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
