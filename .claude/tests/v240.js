/* v2.40 — sign-in by email (the owner turned on Anonymous and Email link in Firebase on 15–17 October 2026).

   WHAT THESE CHECKS HAVE TO PROVE:
   - Settings › Your data has "Your account": while the phone is only signed in quietly, an email field and "Send link";
   - a bad email is refused in words; a good one shows that it is sending, then "Link sent to …", and the link points back
     to the app (handleCodeInApp); Firebase refusing the app's address is explained in words, not a silent nothing;
   - the link pasted into the app (iPhone opens it in Safari, not the Home Screen app) signs in; something that is not the
     link is refused; opening the app FROM the link signs in by itself and takes the code out of the address bar;
   - signing in UPGRADES the quiet account (the same account), so nothing on the phone changes and no list is lost;
     an email that already has an account (another phone) signs in to that one instead;
   - the account remembers which lists are yours: this phone's lists are written to users/{uid} (codes and names only), and
     lists the account has come back to the phone — except one left on purpose ("gone" later than it was added);
   - leaving a list marks it gone in the account; signing out keeps the phone's lists and signs it in quietly again;
   - before the new rules are published, a refused write says so plainly;
   - the pending email is kept in BOTH appearance-slot exclusion lists; the rules let only the account's own person read
     or write users/{uid}; the privacy page says what the account keeps.

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
    await page.addInitScript(`window.__restore=${!!o.restore}; window.__acct=${JSON.stringify(o.acct||null)}; window.__acctDeny=${!!o.deny}; window.__taken=${!!o.taken}; window.__sendFail=${JSON.stringify(o.sendFail||'')};`);
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
    /* ── the block, and sending the link ─────────────────────────────── */
    await mk({ acct:{ lists:{ camp1:{ name:'Camping', ts:10 }, old1:{ name:'Old list', ts:10 } }, gone:{ old1:20 } } });
    await toAcct();
    ok('Settings › Your data has "Your account", with an email field and Send link, while the phone is only signed in quietly',
      /Your account/.test(await box()) && /signed in quietly/.test(await box()) && await page.evaluate(()=>!!document.querySelector('#acctEmail') && !!document.querySelector('#acctSend')), await box());
    await shot('account');
    await page.locator('#acctEmail').fill('not-an-email'); await tap('#acctSend');
    ok('a bad email is refused, in words', /doesn't look right/.test(await box()) && await page.evaluate(()=>!window.__sent), await box());
    await page.locator('#acctEmail').fill('olive@example.com');
    await page.locator('#acctSend').click(); await page.waitForTimeout(20);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#acctBox [role=status]'); return s ? s.textContent : ''; });
    await page.waitForTimeout(500);
    const sent = await page.evaluate(()=>window.__sent);
    ok('a good email shows that it is sending, then "Link sent to …"', (/Sending/.test(busy) || /Link sent/.test(await box())) && /Link sent to olive@example\.com/.test(await box()), busy+' | '+(await box()).slice(0,80));
    ok('…the link comes back to the app (handleCodeInApp), and the email is remembered for when it is opened', sent && sent.email==='olive@example.com' && sent.s && sent.s.handleCodeInApp===true && /^http:\/\/127\.0\.0\.1:\d+\/\?signin=1$/.test(sent.s.url) && (await ls('ml_signinemail'))==='olive@example.com', JSON.stringify(sent));
    await shot('sent');

    /* ── pasting the link ────────────────────────────────────────────── */
    await page.locator('#acctPaste').fill('hello there'); await tap('#acctUse');
    ok('something that is not the link is refused, and the paste box stays', /isn't the sign-in link/.test(await box()) && await page.evaluate(()=>!!document.querySelector('#acctPaste')), await box());
    await page.locator('#acctPaste').fill(LINK); await tap('#acctUse'); await page.waitForTimeout(600);
    const calls = await page.evaluate(()=>window.__calls.slice());
    ok('the pasted link UPGRADES the quiet account — the same account, so nothing on the phone changes', calls.includes('link:olive@example.com') && !calls.some(c=>/^signin:/.test(c)) && await page.evaluate(()=>window.__auth.currentUser.uid==='anon1' && !window.__auth.currentUser.isAnonymous), JSON.stringify(calls));
    await toAcct();
    ok('…Your account then says who is signed in', /Signed in as olive@example\.com/.test(await box()) && await page.evaluate(()=>!!document.querySelector('#acctOut')), await box());
    const l1 = await lists();
    ok('the account\'s lists come back to the phone — but not one left on purpose', l1.includes('camp1') && !l1.includes('old1') && l1.includes('v101'), JSON.stringify(l1));
    const w1 = await writes();
    ok('…and this phone\'s lists are written to the account: codes and names only, under its own uid', w1.some(w=>w.path==='users/anon1' && w.d.lists && w.d.lists.v101 && w.d.lists.v101.name==='Groceries'
      && Object.keys(w.d).every(k=>['lists','gone','updated'].includes(k)) && !w.d.lists.camp1), JSON.stringify(w1).slice(0,300));
    ok('the pending email is forgotten once signed in', (await ls('ml_signinemail'))===null, String(await ls('ml_signinemail')));
    await shot('signedin');

    /* ── leaving a list, signing out ─────────────────────────────────── */
    await page.evaluate(()=>{ localStorage.setItem('t_writes','[]'); window.confirm=()=>true; });
    await tap('#optLeave'); await page.waitForTimeout(1500);
    const w2 = await writes();
    ok('leaving a list marks it gone in the account, so it does not come back on another phone', w2.some(w=>w.d.gone && w.d.gone.v101>0), JSON.stringify(w2).slice(0,200));
    await mk({ acct:{ lists:{} } });
    await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await tap('#acctSend');
    await page.locator('#acctPaste').fill(LINK); await tap('#acctUse'); await page.waitForTimeout(600);
    await toAcct(); await page.evaluate(()=>{ window.confirm=()=>true; });
    await tap('#acctOut'); await page.waitForTimeout(600);
    ok('signing out keeps the phone\'s lists and signs it in quietly again', (await lists()).includes('v101') && await page.evaluate(()=>window.__calls.includes('out') && window.__auth.currentUser && window.__auth.currentUser.isAnonymous), JSON.stringify(await page.evaluate(()=>window.__calls)));

    /* ── opening the app from the email's link ───────────────────────── */
    await mk({ acct:{ lists:{} }, extra:`localStorage.setItem("ml_signinemail","olive@example.com");`, q:'&apiKey=k&oobCode=CODE123&mode=signIn&lang=en&signin=1' });
    await page.waitForTimeout(500);
    const u3 = await page.evaluate(()=>({ href:location.href, signed:!!(window.__auth.currentUser && !window.__auth.currentUser.isAnonymous), calls:window.__calls.slice() }));
    ok('opening the app from the link signs in by itself, and takes the code out of the address bar', u3.signed && !/oobCode|apiKey|mode=signIn/.test(u3.href) && /list=v101/.test(u3.href), JSON.stringify(u3));
    await mk({ acct:{ lists:{} }, promptEmail:'olive@example.com', q:'&apiKey=k&oobCode=CODE123&mode=signIn&lang=en' });
    await page.waitForTimeout(500);
    ok('…opened where the email was never typed (Safari, not the app), it asks which email, then signs in', await page.evaluate(()=>window.__calls.some(c=>/^(link|signin):olive@example\.com$/.test(c)) && window.__auth.currentUser && !window.__auth.currentUser.isAnonymous), JSON.stringify(await page.evaluate(()=>window.__calls)));
    await mk({ restore:true, acct:{ lists:{} }, extra:`localStorage.setItem("ml_signinemail","olive@example.com");`, q:'&apiKey=k&oobCode=CODE123&mode=signIn&lang=en' });
    await page.waitForTimeout(600);
    const u5 = await page.evaluate(()=>({ uid:window.__auth.currentUser && window.__auth.currentUser.uid, calls:window.__calls.slice() }));
    ok('…and it waits for the phone\'s quiet account to be read back, so the link upgrades it instead of making a second account', u5.uid==='anon1' && u5.calls.includes('link:olive@example.com') && !u5.calls.some(c=>/^signin:/.test(c)), JSON.stringify(u5));

    /* ── an email that already has an account ────────────────────────── */
    await mk({ taken:true, acct:{ lists:{ other9:{ name:'From the other phone', ts:5 } } } });
    await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await tap('#acctSend');
    await page.locator('#acctPaste').fill(LINK); await tap('#acctUse'); await page.waitForTimeout(800);
    const u4 = await page.evaluate(()=>({ uid:window.__auth.currentUser && window.__auth.currentUser.uid, calls:window.__calls.slice() }));
    const l4 = await lists();
    ok('an email that already has an account signs in to that one, and keeps this phone\'s lists AND its own', u4.uid==='acct2' && u4.calls.includes('signin:olive@example.com') && l4.includes('v101') && l4.includes('other9'), JSON.stringify(u4)+' '+JSON.stringify(l4));

    /* ── refusals, in words ──────────────────────────────────────────── */
    await mk({ sendFail:'auth/unauthorized-continue-uri' });
    await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await tap('#acctSend'); await page.waitForTimeout(300);
    ok('Firebase refusing the app\'s address is explained (Authorized domains), and the wait ends', /Authorized domains/.test(await box()) && await page.evaluate(()=>!document.querySelector('#acctBox .spin')), await box());
    await mk({ deny:true, acct:{ lists:{} } });
    await toAcct(); await page.locator('#acctEmail').fill('olive@example.com'); await tap('#acctSend');
    await page.locator('#acctPaste').fill(LINK); await tap('#acctUse'); await page.waitForTimeout(800);
    await toAcct();
    ok('before the new rules are published, Your account says the lists can\'t be saved to it yet', /new database rules/.test(await box()), await box());

    /* ── the source ──────────────────────────────────────────────────── */
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('ml_signinemail is in both appearance-slot exclusion lists', (src.match(/ml_signinemail\$/g)||[]).length===2, '');
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('the rules let only the account\'s own person read or write users/{uid}, with only lists, gone and updated', /match \/users\/\{uid\}/.test(rules) && /request\.auth\.uid == uid/.test(rules) && /hasOnly\(\['lists', 'gone', 'updated'\]\)/.test(rules), '');
    ok('the privacy page says what the account keeps', /codes and names/.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
