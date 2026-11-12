/* v2.99 — this week's security batch: a list is opened by its people only (S1), sizes on the records (S2), a weekly backup kept
   in the database (H1).

   The fake database here ENFORCES the new rules (the real ones cannot run in a test): under lists/{code} everything but creating
   the list record needs the caller in access/{code}.acl; access/{code} is read when missing or by a member, created by any
   signed-in phone, and joined while open.

   WHAT THESE CHECKS HAVE TO PROVE:
   1. a list that has NO access record (made before v2.44, or never opened since) ends OPEN on a signed-in phone — the record is
      created with this phone as its only person, and the list's items show — whether the sign-in is there at launch or arrives
      late; it is never left "locked" (lesson 67);
   2. a brand-new list made in the app ends open, and an item added to it reaches the database;
   3. a phone that is not one of the list's people (record closed) sees nothing of it;
   4. the weekly backup: written to backups/w0…w3 as JSON that restores the items, once a week per phone (the week is remembered);
      refused by the database (rules not published) it remembers nothing and tries again; Settings › Your data lists it;
   5. the rules file: no "!hasAccess" left, memberOf requires the record, sizes on note/weight/where/cat/ph/tags, the backups match. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const NEWER_V = +fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8').match(/const LIST_V = (\d+);/)[1] + 1;   // v2.78 (lesson 44): "a newer app" is always one past the app's own version, never a literal
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `const S = window.__srv || (window.__srv = { docs:{}, subs:[], writes:[] });
S.subs = [];
const J = v => v===undefined ? undefined : JSON.parse(JSON.stringify(v));
export const initializeApp=()=>({}); export const getFirestore=()=>({}); export const initializeFirestore=()=>({});
export const persistentLocalCache=()=>({}); export const persistentMultipleTabManager=()=>({});
export const doc=(db,...p)=>({ kind:'doc', path:p.join('/') });
export const collection=(db,...p)=>({ kind:'col', path:p.join('/') });
const meta = { hasPendingWrites:false, fromCache:false };
const deny = () => Object.assign(new Error('Missing or insufficient permissions.'), { code:'permission-denied' });
const uid = () => { const u = window.__auth && window.__auth.currentUser; return u ? u.uid : ''; };
const codeOf = p => (p.split('/')[1] || '');
const member = code => { const a = S.docs['access/'+code]; return !!(uid() && a && a.acl && a.acl[uid()] === true); };
/* the v2.99 rules */
function canRead(p){ const seg = p.split('/');
  if(seg[0]==='access') return !S.docs[p] || member(seg[1]);
  if(seg[0]==='lists') return member(seg[1]);
  return true; }
function canWrite(p, d, merge){ const seg = p.split('/');
  if(seg[0]==='access'){ if(!uid()) return false; if(!S.docs[p]) return true; if(member(seg[1])) return true;
    const a = S.docs[p]; return (a.openUntil||0) > Date.now() || ((d.joinProof||{})[uid()] === a.joinKey); }
  if(seg[0]==='lists'){ if(seg.length===2 && !S.docs[p]) return true;   // creating the list record
    if(!member(seg[1])) return false;
    if(seg[2]==='backups') return !S.refuseBackups && /^w[0-3]$/.test(seg[3]) && typeof d.json==='string' && d.json.length<=900000 && Number.isInteger(d.at);
    return true; }
  return true; }
const mergeD=(a,b)=>{ const o=Object.assign({}, a||{}); for(const k of Object.keys(b||{})){ const v=b[k]; o[k]=(v && typeof v==='object' && !Array.isArray(v) && o[k] && typeof o[k]==='object') ? mergeD(o[k], v) : v; } return o; };
function docSnap(p){ const d=S.docs[p]; return { id:p.split('/').pop(), exists:()=>d!==undefined, data:()=>J(d), metadata:meta }; }
function colSnap(p){ return { docs:Object.keys(S.docs).filter(k=>k.indexOf(p+'/')===0 && k.slice(p.length+1).indexOf('/')<0).map(docSnap), metadata:meta }; }
function snapOf(r){ return r.kind==='doc' ? docSnap(r.path) : colSnap(r.path); }
function tell(s){ if(!S.subs.includes(s)) return; if(!canRead(s.r.path)){ S.subs = S.subs.filter(x=>x!==s); S.denied=(S.denied||0)+1; if(s.er) s.er(deny()); return; } s.cb(snapOf(s.r)); }
function fire(){ S.subs.slice().forEach(s=>setTimeout(()=>tell(s), 0)); }
export function onSnapshot(r, a, b, c){ const cb = typeof a==='function' ? a : b, er = typeof a==='function' ? b : c; const s={ r, cb, er }; S.subs.push(s);
  setTimeout(()=>tell(s), S.slow||0); return ()=>{ S.subs = S.subs.filter(x=>x!==s); }; }
function write(r, d, o){ if(!canWrite(r.path, d, o && o.merge)) throw deny();
  S.writes.push({ path:r.path, data:J(d) }); S.docs[r.path] = (o && o.merge) ? mergeD(S.docs[r.path], J(d)) : J(d); }
export async function setDoc(r, d, o){ write(r, d, o); fire(); }
export function writeBatch(){ const ops=[]; return { set(r,d,o){ ops.push([r,d,o]); },
  async commit(){ if(ops.some(([r,d,o])=>!canWrite(r.path, d, o && o.merge))) throw deny(); ops.forEach(([r,d,o])=>write(r,d,o)); fire(); } }; }
export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const user=(id)=>({ uid:id, isAnonymous:true, getIdToken:async()=>'tok' });
const A={ currentUser: window.__authNow ? user('anon1') : null }; let cb=null; window.__auth=A;
export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ cb=f; setTimeout(()=>f(A.currentUser),0); return ()=>{}; }
export async function signInAnonymously(){ await new Promise(r=>setTimeout(r, window.__authDelay||0)); A.currentUser=user('anon1'); if(cb) cb(A.currentUser); return { user:A.currentUser }; }`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy"), it("2","Bread","bakery")], itemTomb:{ "x9":500 }, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, v:2 }, o||{});
/* the server's records and this phone's cache, seeded before the app's module runs */
const seed = (o) => { o=o||{}; return `(() => {
  const srv = ${JSON.stringify(o.srv||{ "lists/v101": DOC() })};
  window.__srv = { docs:srv, subs:[], writes:[], refuseBackups:${!!o.refuseBackups} }; window.__authNow=${!!o.authNow}; window.__authDelay=${o.authDelay||0};
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





    const st = ()=>page.evaluate(()=>{ const S=window.__srv, a=S.docs['access/v101'], c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}');
      return { acl:a ? Object.keys(a.acl||{}).join() : null, tiles:[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(b=>b.textContent.trim()).sort().join('|'),
        locked:/can.t open this list|locked/i.test((document.querySelector('.lockcard, #lockedCard, [data-locked]')||{textContent:''}).textContent) || !!document.querySelector('.lockcard, #lockedCard'),
        denied:S.denied||0, items:(c.items||[]).map(i=>i.name).sort().join('|') }; });
    const LEG = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ] });
    /* 1. a list with no access record */
    const r1={};
    for(const [k,o] of [['signedInAtLaunch',{ authNow:true }], ['signInArrivesLate',{ authDelay:700 }]]){
      await mk(Object.assign({ srv:{ "lists/v101": LEG }, cache:false, extra:BASE }, o)); await page.waitForTimeout(2500);
      r1[k] = await st(); }
    ok('a list with no access record ends OPEN on a signed-in phone: the record is created with this phone only, the items show, nothing is left locked — sign-in at launch or late',
      Object.values(r1).every(x=>x.acl==='anon1' && x.tiles==='Bread|Milk' && !x.locked) && Object.values(r1).some(x=>x.denied>0), JSON.stringify(r1));
    /* 2. a brand-new list */
    await mk({ srv:{}, cache:false, authNow:true, extra:BASE }); await page.waitForTimeout(2500);
    await page.locator('#shopAddFab').click().catch(()=>{}); await page.waitForTimeout(600);
    const canAdd = await page.locator('#mainInput').count();
    if(canAdd){ await page.keyboard.type('apples'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); }
    const r2 = await page.evaluate(()=>{ const S=window.__srv; const L=S.docs['lists/v101']||{}; const recs=Object.keys(S.docs).filter(k=>/^lists\/v101\/items\//.test(k)).map(k=>S.docs[k].name);
      return { acl:Object.keys((S.docs['access/v101']||{}).acl||{}).join(), onServer:[...(L.items||[]).map(i=>i.name), ...recs].join('|') }; });
    ok('a brand-new list ends open, and an item added to it reaches the database', canAdd===1 && r2.acl==='anon1' && /apples/i.test(r2.onServer), JSON.stringify(r2));
    /* 3. not one of its people */
    await mk({ srv:{ "lists/v101": LEG, "access/v101": { acl:{ u2:true }, names:{ u2:"Sam" }, joinKey:"k".repeat(20), openUntil:0 } }, cache:false, authNow:true, extra:BASE }); await page.waitForTimeout(2500);
    const r3 = await st();
    ok('a phone that is not one of the list\'s people (record closed) sees none of its items', r3.tiles==='' && r3.items==='' && r3.acl==='u2', JSON.stringify(r3));
    /* 4. the weekly backup */
    const MEM = { acl:{ anon1:true }, names:{ anon1:"O" }, joinKey:"k".repeat(20), openUntil:0 };
    await mk({ srv:{ "lists/v101": LEG, "access/v101": MEM }, cache:LEG, authNow:true, extra:BASE }); await page.waitForTimeout(7500);
    const b1 = await page.evaluate(()=>{ const S=window.__srv; const k=Object.keys(S.docs).filter(k=>/\/backups\//.test(k)); const d=k.length?S.docs[k[0]]:null; let items=null; try{ items=(JSON.parse(d.json).items||[]).map(i=>i.name).sort().join('|'); }catch(e){}
      return { keys:k, items, at:d&&d.at, wk:localStorage.getItem('ml_srvbak_v101'), n:S.writes.filter(w=>/\/backups\//.test(w.path)).length }; });
    ok('the weekly backup is written to one of four slots as JSON holding the list, and the week is remembered', b1.keys.length===1 && /\/backups\/w[0-3]$/.test(b1.keys[0]) && b1.items==='Bread|Milk' && Number.isInteger(b1.at) && /^\d{4}-W\d{1,2}$/.test(b1.wk||''), JSON.stringify(b1));
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(7500);
    const b2 = await page.evaluate(()=>window.__srv.writes.filter(w=>/\/backups\//.test(w.path)).length);
    ok('…the same week it is not written again', b2===0, String(b2));
    const OLD = DOC({ items:[ it("9","Cheese","dairy") ] });
    await mk({ srv:{ "lists/v101": LEG, "access/v101": MEM, "lists/v101/backups/w1": { at:Date.now()-8*864e5, v:"v2.98", by:"Sam", json:JSON.stringify(OLD), left:[] } }, cache:LEG, authNow:true, extra:BASE+'localStorage.setItem("ml_srvbak_v101","2099-W1");' });
    await page.waitForTimeout(1200);
    await page.locator('#bottomnav .navbtn').nth(2).click(); await page.waitForTimeout(2000);
    const sb = await page.evaluate(()=>{ const t=document.body.textContent; const b=document.querySelector('[data-srvrestore]'); if(b) b.scrollIntoView({ block:'center' });
      return { head:/Kept in the database \(weekly\)/.test(t), btn:document.querySelectorAll('[data-srvrestore]').length, by:/by Sam/.test(t) }; });
    await page.locator('[data-srvrestore]').first().click(); await page.waitForTimeout(600);
    const conf = await page.evaluate(()=>{ const s=document.querySelector('#rstSheet, .sheet'); return s ? s.textContent.replace(/\s+/g,' ').trim().slice(0,200) : ''; });
    ok('Settings › Your data lists the database backup (date, who) with Restore, which asks before replacing the list', sb.head && sb.btn>=1 && sb.by && /restore|replace/i.test(conf), JSON.stringify({ sb, conf }));
    await mk({ srv:{ "lists/v101": LEG, "access/v101": MEM }, cache:LEG, authNow:true, refuseBackups:true, extra:BASE }); await page.waitForTimeout(7500);
    const b3 = await page.evaluate(()=>({ wk:localStorage.getItem('ml_srvbak_v101'), n:Object.keys(window.__srv.docs).filter(k=>/\/backups\//.test(k)).length }));
    ok('refused by the database (rules not published): nothing is remembered, so it tries again', !b3.wk && b3.n===0, JSON.stringify(b3));
    /* 5. the rules file */
    const R = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8'), src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const body_ = R.slice(R.indexOf('service cloud.firestore'));
    ok('the rules: no "!hasAccess" left; memberOf requires the record; only the list\'s own create needs no member; sizes on note, weight, where, cat, ph, tags; the backups match',
      !/!hasAccess\(code\)/.test(body_) && /hasAccess\(code\) && get\(accessPath\(code\)\)/.test(body_) && /allow create: if code\.size\(\) <= 64/.test(body_)
      && ['note','weight','where','cat','ph'].every(f=>new RegExp("d\\.get\\('"+f+"', ''\\) is string").test(body_)) && /d\.get\('tags', \[\]\) is list/.test(body_)
      && /match \/backups\/\{slot\}/.test(body_) && /d\.json\.size\(\) <= 900000/.test(body_), '');
    ok('ml_srvbak_ is in both exclude lists; the new words have their French', ['APP_EXCLUDE_BOOT','APP_EXCLUDE'].every(n=>{ const m=src.match(new RegExp('const '+n+' = (/.*/);')); return m && m[1].includes('ml_srvbak_'); })
      && ['Kept in the database (weekly)',"That backup can't be read."].every(k=>fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8').includes(`"${k}"`)));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
