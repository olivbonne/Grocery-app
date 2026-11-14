/* v2.96 — the household's Regulars "under Others" (79, and none could be deleted); a photo on an item (Option B, removable);
   the server says when an AI call passes.

   WHAT THESE CHECKS HAVE TO PROVE:
   1. (bug, lesson 65) on a list using the thirteen categories, Regulars still in old categories (fresh, alcohol, bulk) show under
      Others with "N of these are from the old categories" and a Sort button; holding one and Delete REMOVES it (it did nothing:
      the tile carried the category it was shown under, so the key never matched); Sort removes the leftover copies whose twin is
      already in the right category and moves the others there, marking every old key gone (so the server's old record cannot come
      back); a backup was written first;
   2. switching a list to the new categories marks the Regulars' old keys gone too;
   3. photos (Option B): Edit item has a Photo row; a chosen photo is shrunk, saved as its own record lists/{code}/photos/{pid} and
      shown on the tile in place of the drawing; Remove marks the record gone and the tile shows the drawing again; with the
      database refusing (rules not published) the sheet says so; everything lives in js/photos.js and one fenced block;
   4. lib/guard.js logs "passed" for a call whose App Check token is good, without the uid. */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const NEWER_V = +fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8').match(/const LIST_V = (\d+);/)[1] + 1;   // v2.78 (lesson 44): "a newer app" is always one past the app's own version, never a literal
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const OPEN_MORE = async(page)=>{ if(!page) return; await page.evaluate(()=>{ const m=document.querySelector('#edMore'); if(m && m.getAttribute('aria-expanded')!=='true') m.click(); }); await page.waitForTimeout(400); };   /* SUPERSEDED by v3.10 (U5): the photo row sits under Edit item's "More" — every open of Edit item opens it too. Still protects everything this suite checked. */
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
    const it2=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[],ts:1000}, x||{});
    const D = DOC({ items:[ it2("1","Yogurt","dairy",{ note:"Blueberrie" }), it2("2","Dates","fruit") ] });
    const BASE='localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_largecols","3");';
    const items = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return (c.items||[]).filter(i=>/yogurt/i.test(i.name)).map(i=>({ id:i.id, note:i.note||"", cat:i.cat })); });




    const CAT = await import(pathToFileURL(path.join(ROOT,'js','data','catalog.js')).href);
    const C13 = CAT.CATS13.map(c=>({ id:c.id, label:c.label, color:c.color, emoji:c.emoji, subs:[] }));
    const R = (n,c,x)=>Object.assign({ name:n, cat:c, qty:1, weight:"", sub:"", note:"", where:"", ts:2000 }, x||{});
    const RD = DOC({ categories:C13, items:[ it("1","Milk","dairy") ],
      buyAgain:[ R("Butter","dairy"), R("Butter","fresh"), R("Aperol","liquor"), R("Aperol","alcohol"), R("Avocado oil","bulk"), R("Birthday card","fresh") ] });
    const OPEN='localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:["others"]}));';
    const regs = ()=>page.evaluate(()=>{ const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'); return { regs:(c.buyAgain||[]).map(r=>r.name+'|'+r.cat).sort(), tomb:Object.keys(c.baTomb||{}) }; });
    await mk({ srv:{ "lists/v101": RD }, cache:RD, extra:BASE+OPEN });
    const note = await page.evaluate(()=>{ const n=document.querySelector('.regsort'); return n ? n.textContent.trim() : null; });
    ok('under Others: "4 of these are from the old categories" with a Sort button', /4 of these are from the old categories/.test(note||'') && /Sort them/.test(note||''), note);
    /* hold Birthday card (only in an old category) → Delete */
    const bc = page.locator('[data-reg-add^="Birthday card|"]'); await bc.evaluate(e=>e.scrollIntoView({ block:'center' })); await page.waitForTimeout(400); const bb = await bc.boundingBox();
    await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(600);
    await page.locator('#delBtn').click(); await page.waitForTimeout(600);
    const r1 = await regs();
    ok('holding a Regular from an old category and Delete removes it (it did nothing before)', !r1.regs.some(x=>/^Birthday card/.test(x)) && r1.tomb.some(k=>/birthday card/i.test(k)), JSON.stringify(r1));
    await page.locator('[data-reg-sortold]').click(); await page.waitForTimeout(700);
    const r2 = await regs(); const note2 = await page.evaluate(()=>!!document.querySelector('.regsort'));
    const snap = await page.evaluate(()=>{ const a=JSON.parse(localStorage.getItem('ml_snap_v101')||'[]'); return a.length && (a[0].list.buyAgain||[]).length; });
    ok('Sort: the leftover Butter and Aperol copies are removed, Avocado oil moves to a thirteen-list category, the old keys are marked gone, and the note goes',
      r2.regs.filter(x=>/^Butter\|/.test(x)).join()==='Butter|dairy' && r2.regs.filter(x=>/^Aperol\|/.test(x)).join()==='Aperol|liquor'
      && r2.regs.some(x=>/^Avocado oil\|/.test(x) && !/\|bulk$/.test(x)) && ['butter|fresh','aperol|alcohol','avocado oil|bulk'].every(k=>r2.tomb.some(t=>t.toLowerCase().startsWith(k))) && !note2, JSON.stringify(r2));
    ok('…a backup with the old Regulars was written first', snap>=5, String(snap));
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the switch to the new categories marks a Regular\'s old key gone when it moves it', /if\(c!==b\.cat\)\{ baForget\(b\.name, b\.cat, b\.note\); b\.cat=c;/.test(src));

    /* ── 3. photos ── */
    const PD = DOC({ items:[ it("1","Milk","dairy"), it("2","Bread","bakery") ] });
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
    const holdOpen = async(id)=>{ const t=page.locator(`#zoomer .pill[data-pill="${id}"]`); await t.evaluate(e=>e.scrollIntoView({ block:'center' })); await page.waitForTimeout(300); const b=await t.boundingBox();
      await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForTimeout(700); };
    await mk({ srv:{ "lists/v101": PD }, cache:PD, extra:BASE });
    await holdOpen("1"); await OPEN_MORE(page);
    const row = await page.evaluate(()=>{ const s=document.querySelector('#sheet'); return s ? [...s.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>/photo/i.test(t)) : null; });
    const chooser = page.locator('#sheet button', { hasText:/Choose a photo/ });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), chooser.click()]);
    await fc.setFiles({ name:'p.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
    const ph = await page.evaluate(()=>{ const S=window.__srv, k=Object.keys(S.docs).filter(k=>/\/photos\//.test(k)); const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}');
      return { recs:k.map(x=>({ k:x, d:(S.docs[x].d||'').slice(0,23), n:(S.docs[x].d||'').length })), ph:((c.items||[]).find(i=>i.id==='1')||{}).ph||'' }; });
    await page.locator('#sheet button', { hasText:/^Save$/ }).first().click().catch(()=>{}); await page.waitForTimeout(800);
    const tile = await page.evaluate(()=>{ const t=document.querySelector('#zoomer .pill[data-pill="1"]'); return { img:!!(t && t.querySelector('img.pphoto-img, .pphoto img')), other:!!document.querySelector('#zoomer .pill[data-pill="2"] img') }; });
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-photo.png') });
    ok('Edit item has a Photo row (Take / Choose); a chosen photo is saved as its own jpeg record and the item names it',
      row && row.some(t=>/Take a photo/.test(t)) && row.some(t=>/Choose a photo/.test(t)) && ph.recs.length===1 && ph.recs[0].d==='data:image/jpeg;base64,' && ph.recs[0].n<=150000 && ph.ph && ph.recs[0].k.endsWith('/'+ph.ph), JSON.stringify({ row, ph }));
    ok('…the tile shows the photo in place of the drawing (only that tile)', tile.img && !tile.other, JSON.stringify(tile));
    await holdOpen("1"); await OPEN_MORE(page);
    await page.locator('#sheet button', { hasText:/^Remove$/ }).first().click(); await page.waitForTimeout(800);
    await page.locator('#sheet button', { hasText:/^Save$/ }).first().click().catch(()=>{}); await page.waitForTimeout(800);
    const rm = await page.evaluate(()=>{ const S=window.__srv, k=Object.keys(S.docs).filter(k=>/\/photos\//.test(k)); const c=JSON.parse(localStorage.getItem('ml_cache_v101')||'{}');
      return { gone:k.map(x=>!!S.docs[x].gone && !S.docs[x].d), ph:((c.items||[]).find(i=>i.id==='1')||{}).ph||'', img:!!document.querySelector('#zoomer .pill[data-pill="1"] img') }; });
    ok('…Remove marks the record gone (the picture itself is dropped) and the tile shows the drawing again', rm.gone.length===1 && rm.gone[0] && !rm.ph && !rm.img, JSON.stringify(rm));
    /* refused by the database (rules not published) */
    await mk({ srv:{ "lists/v101": PD }, cache:PD, extra:BASE+'window.__srvRefusePhotos=1;' });
    await page.evaluate(()=>{ const S=window.__srv; const orig=S.docs; });
    await page.route('**/nothing', r=>r.abort());
    const refusedMsg = await (async()=>{ await page.evaluate(()=>{ window.__srv.refusePhotos=true; });
      await holdOpen("2"); await OPEN_MORE(page);
      const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sheet button', { hasText:/Choose a photo/ }).click()]);
      await fc2.setFiles({ name:'p.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1500);
      return page.evaluate(()=>(document.querySelector('#sheet')||{}).textContent||''); })();
    ok('…when the database refuses (rules not published) the sheet says so', /updated database rules/i.test(refusedMsg), refusedMsg.slice(0,200));
    const blk = src.slice(src.indexOf('═══ PHOTOS'), src.indexOf('═══ END PHOTOS'));
    ok('photos live in js/photos.js and one fenced block with a single switch', fs.existsSync(path.join(ROOT,'js','photos.js')) && /const PHOTOS_ON = true;/.test(blk) && (src.match(/const PHOTOS_ON/g)||[]).length===1
      && fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8').includes('match /photos/{pid}') && /Photos on items/i.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')));

    /* ── 4. the server says when a call passes ── */
    const g = fs.readFileSync(path.join(ROOT,'lib','guard.js'),'utf8');
    ok('lib/guard.js logs "passed … app check ok" for a good call, naming the function only (never the uid)', /console\.log\(`\[guard\] \$\{fn\}: passed \(\$\{uid \? 'signed in' : 'not signed in'\}, app check ok\)`\)/.test(g));
    const fr = fs.readFileSync(path.join(ROOT,'js','i18n.js'),'utf8');
    ok('the new words have their French', ['Sort them','{n} of these are from the old categories.','Take a photo','Choose a photo'].every(k=>fr.includes(`"${k}"`)));
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
