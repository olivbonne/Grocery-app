/* v2.58 — S8 step 2: each item is its own record, lists/{code}/items/{id}.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the move: a v2 list opened on this version copies every item (and every removal) into a record of its own, takes a
     backup first, and only THEN marks the list split (parts ["items"], v 3), keeping the old array untouched as a backup;
   - after the move a tick writes ONE small record and not the list record;
   - another phone's add and removal (records written on the server) arrive here; a removal here is a {gone} record;
   - a split list opened on a phone with nothing cached shows the records, never the frozen old array;
   - with the rules not yet published (item records refused) nothing changes: the list stays one v2 record and works;
   - a list from a newer app (v4) is never written over; the rules carry the item records and refuse writing a split list
     back as an old one.
   The household's tile batch (same version): the Shop ⋯ menu picks 1–6 or variable; Settings has one "Tile display"; a phone
   on small tiles moves to the same look; 1-per-row and variable tiles keep everything on one line; Smart add drops the keyboard.
   The fake database lives in the page (window.__srv): records by path, listeners on records and on collections, batches.
   It is the first stub that speaks collections; older suites keep theirs, so their lists are never split.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.56 an object
   literal at the start of a statement in a seed is a block — assign it first. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
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
const refused = p => S.refuse && /^lists\\/[^/]+\\/items\\//.test(p);
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
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800); };
    const srv = ()=>page.evaluate(()=>({ docs:window.__srv.docs, writes:window.__srv.writes }));
    const names = ()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer [data-pill]')].map(p=>p.textContent.trim().replace(/\s+/g,' ')));
    const local = ()=>page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_v101')).items.map(i=>i.name); }catch(e){ return []; } });

    /* 1 ─ the move */
    await mk();
    let s = await srv(); const L = s.docs['lists/v101'] || {};
    ok('the move: every item becomes a record of its own (id as the record name)', s.docs['lists/v101/items/1'] && s.docs['lists/v101/items/1'].name==='Milk' && s.docs['lists/v101/items/2'] && s.docs['lists/v101/items/2'].name==='Bread', JSON.stringify(Object.keys(s.docs)));
    ok('…and every removal a {gone} record, so it still travels', s.docs['lists/v101/items/x9'] && s.docs['lists/v101/items/x9'].gone===500, JSON.stringify(s.docs['lists/v101/items/x9']));
    const iFirstItem = s.writes.findIndex(w=>/\/items\//.test(w.path)), iParts = s.writes.findIndex(w=>w.path==='lists/v101' && (w.data.parts||[]).includes('items'));
    ok('…then, and only then, the list is marked split: parts ["items"], v 3', iParts>iFirstItem && iFirstItem>=0 && L.v===3 && (L.parts||[]).includes('items'), JSON.stringify({ iFirstItem, iParts, v:L.v, parts:L.parts }));
    ok('…with the old items array left in the record, untouched, as the backup', Array.isArray(L.items) && L.items.length===2 && L.items.map(i=>i.name).join()==='Milk,Bread', JSON.stringify(L.items && L.items.map(i=>i.name)));
    const snaps = await page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_snap_v101')||'[]').length; }catch(e){ return 0; } });
    ok('…and a backup was taken on this phone first', snaps>=1, String(snaps));
    ok('the list still shows its items', (await names()).some(n=>/Milk/.test(n)) && (await names()).some(n=>/Bread/.test(n)), JSON.stringify(await names()));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-split.png') });

    /* 2 ─ a tick is one small record */
    const n0 = (await srv()).writes.length;
    await page.locator('[data-pill="1"]').click(); await page.waitForTimeout(900);
    s = await srv(); const w = s.writes.slice(n0);
    ok('after the move, a tick writes ONE record — the item — and not the list record', w.length===1 && w[0].path==='lists/v101/items/1' && w[0].data.checked===true, JSON.stringify(w.map(x=>x.path)));

    /* 3 ─ another phone */
    await page.evaluate(()=>window.__srv.set('lists/v101/items/n7', { id:'n7', name:'Eggs', cat:'dairy', qty:1, weight:'', checked:false, tags:[], ts:Date.now() }));
    await page.waitForTimeout(700);
    ok('another phone\'s new item (its record) arrives here', (await names()).some(n=>/Eggs/.test(n)), JSON.stringify(await names()));
    await page.evaluate(()=>window.__srv.set('lists/v101/items/2', { id:'2', gone:Date.now() }));
    await page.waitForTimeout(700);
    ok('…and its removal (a gone record) removes the item here', !(await names()).some(n=>/Bread/.test(n)) && !(await local()).includes('Bread'), JSON.stringify(await names()));
    const n1 = (await srv()).writes.length;
    await page.evaluate(()=>{ /* remove Eggs the way the app does: through its own state and save */ });
    const delOk = await page.evaluate(async()=>{ const b=document.querySelector('[data-pill="n7"]'); if(!b) return 'no tile';
      b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); await new Promise(r=>setTimeout(r,650)); b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
      await new Promise(r=>setTimeout(r,500)); const d=document.querySelector('#delBtn'); if(!d) return 'no delete'; d.click(); return 'ok'; });
    await page.waitForTimeout(900);
    s = await srv(); const gw = s.writes.slice(n1).filter(x=>x.path==='lists/v101/items/n7');
    ok('a removal here is written as a gone record (never a delete)', delOk==='ok' && gw.length>=1 && gw[gw.length-1].data.gone>0 && s.docs['lists/v101/items/n7'].gone>0, JSON.stringify({ delOk, gw }));

    /* 4 ─ a split list on a phone with nothing cached: the records, never the frozen array */
    const SPLIT = { "lists/v101": DOC({ v:3, parts:["items"], items:[it("old","Old thing","others")], itemTomb:{} }),
      "lists/v101/items/a": it("a","Apples","fruit"), "lists/v101/items/b": it("b","Butter","dairy"), "lists/v101/items/c": { id:"c", gone:900 } };
    await mk({ srv:SPLIT, cache:false });
    const nm = await names();
    ok('a split list opened on a new phone shows its records', nm.some(n=>/Apples/.test(n)) && nm.some(n=>/Butter/.test(n)), JSON.stringify(nm));
    ok('…never the frozen old array, and not a removed record', !nm.some(n=>/Old thing/.test(n)) && nm.length===2, JSON.stringify(nm));
    s = await srv();
    ok('…and opening it writes nothing back (no needless writes)', s.writes.filter(x=>/^lists\/v101/.test(x.path)).length===0, JSON.stringify(s.writes.map(x=>x.path)));
    ok('…the frozen array is still there, untouched', (s.docs['lists/v101'].items||[]).length===1, '');

    /* 5 ─ the rules not published yet: nothing changes */
    await mk({ refuse:true });
    s = await srv(); const L5 = s.docs['lists/v101'];
    ok('with the item records refused (rules not yet published), the list is NOT marked split', L5.v===2 && !(L5.parts||[]).includes('items'), JSON.stringify({ v:L5.v, parts:L5.parts }));
    const n5 = s.writes.length;
    await page.locator('[data-pill="1"]').click(); await page.waitForTimeout(900);
    s = await srv(); const w5 = s.writes.slice(n5);
    ok('…and it works as before: a tick writes the one list record, v 2, with the item in it', w5.length>=1 && w5.every(x=>x.path==='lists/v101') && w5[w5.length-1].data.v===2 && w5[w5.length-1].data.items.find(i=>i.id==='1').checked===true, JSON.stringify(w5.map(x=>[x.path, x.data.v])));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-refused.png') });

    /* 6 ─ a newer app's list */
    await mk({ srv:{ "lists/v101": DOC({ v:4 }) } });
    s = await srv();
    ok('a list saved by a newer app (v4) is never written over: "Update now"', (await page.locator('#newerNote').count())===1 && s.writes.filter(x=>/^lists\/v101/.test(x.path)).length===0, JSON.stringify(s.writes.map(x=>x.path)));


    /* 7 ─ tiles: a phone on small tiles (variable) moves to the same look, once */
    const TDOC = DOC({ items:[it("1","Beef topside steak","meat",{ qty:3, weight:"200g" }), it("2","Milk","dairy",{ note:"2L full cream" }), it("3","Bananas","fruit")], itemTomb:{} });
    await mk({ srv:{ "lists/v101": TDOC }, cache:TDOC, extra:`localStorage.setItem("ml_displays", JSON.stringify({shop:"small",plan:"small"})); localStorage.setItem("ml_smallcols","0"); localStorage.setItem("ml_largecols","4");` });
    const mig = await page.evaluate(()=>({ d:JSON.parse(localStorage.getItem('ml_displays')), lc:localStorage.getItem('ml_largecols'), ns:localStorage.getItem('ml_nosmall'), z:document.querySelector('#zoomer').className }));
    ok('small tiles are gone: a phone on small·variable moves to Tile display·variable (not to its old large·4)', mig.d.shop==='large' && mig.d.plan==='large' && mig.lc==='0' && mig.ns==='1' && /largevar/.test(mig.z) && !/smalltile/.test(mig.z), JSON.stringify(mig));
    const one = async()=>page.evaluate(()=>[...document.querySelectorAll('#zoomer [data-pill]')].map(p=>{ const r=p.getBoundingClientRect(), n=p.querySelector('.pname').getBoundingClientRect(), m=p.querySelector('.pill-meta, .pnote');
      const mr = m ? m.getBoundingClientRect() : n; return { h:Math.round(r.height), sameLine: Math.abs((n.top+n.height/2)-(mr.top+mr.height/2))<6 }; }));
    let o1 = await one();
    ok('variable: every tile is one line (drawing, name, note or amount side by side)', o1.length===3 && o1.every(x=>x.sameLine && x.h<64), JSON.stringify(o1));
    /* the ⋯ menu */
    await page.locator('#shopMenuBtn, [aria-label="More"]').first().click(); await page.waitForTimeout(400);
    const mb = await page.evaluate(()=>[...document.querySelectorAll('[data-sm-cols]')].map(b=>b.dataset.smCols+(b.classList.contains('on')?'*':'')));
    ok('the Shop ⋯ menu offers 1–6 and variable, with the current one marked', mb.join()==='1,2,3,4,5,6,0*', JSON.stringify(mb));
    await page.locator('[data-sm-cols="1"]').click(); await page.waitForTimeout(500);
    const after = await page.evaluate(()=>({ lc:localStorage.getItem('ml_largecols'), z:document.querySelector('#zoomer').className, open:!!document.querySelector('#shopMenuEl'), on:(document.querySelector('[data-sm-cols].on')||{}).dataset }));
    ok('…tapping 1 shows one tile per row at once, and the menu stays open to compare', after.lc==='1' && /linelist/.test(after.z) && after.open && after.on && after.on.smCols==='1', JSON.stringify(after));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-tilemenu.png') });
    await page.evaluate(()=>{ const b=document.querySelector('#smBg'); if(b) b.click(); }); await page.waitForTimeout(400);
    o1 = await one();
    ok('1 per row: one line too — the note sits beside the name, not under it', o1.length===3 && o1.every(x=>x.sameLine && x.h<64), JSON.stringify(o1));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-oneline.png') });
    /* Settings */
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const st = await page.evaluate(()=>({ small:document.querySelectorAll('[data-tiledisp="small"], [data-opt-smallcols]').length, label:/Tile display/.test(document.body.textContent), large:/Large tiles/.test(document.body.textContent) }));
    ok('Settings: no Small tiles any more, and the one left is called "Tile display"', st.small===0 && st.label && !st.large, JSON.stringify(st));

    /* 8 ─ Smart add drops the keyboard */
    await page.locator('#cartNav, #cartNavS').first().click(); await page.waitForTimeout(500);
    await page.locator('#shopAddFab').click(); await page.waitForTimeout(800);
    await page.locator('#mainInput').fill('milk eggs and bread'); await page.locator('#mainInput').dispatchEvent('input'); await page.waitForTimeout(400);
    await page.locator('[data-add-smart]').first().click(); await page.waitForTimeout(600);
    const foc = await page.evaluate(()=>document.activeElement ? document.activeElement.tagName : '');
    ok('pressing Smart add puts the keyboard away (nothing is left focused for typing), so its suggestions can be seen', !/^(INPUT|TEXTAREA)$/.test(foc), foc);
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('the rules: item records for the list\'s people, never deleted, and a split list cannot be written back as an old one',
      /match \/items\/\{id\}/.test(rules) && /allow delete: if false;/.test(rules.slice(rules.indexOf('match /items/{id}'))) && /'parts'/.test(rules)
      && /resource\.data\.get\('v', 0\) < 3 \|\| request\.resource\.data\.get\('v', 0\) >= 3/.test(rules), '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), store = fs.readFileSync(path.join(ROOT,'js','store.js'),'utf8');
    ok('only js/store.js touches the database (no collection/writeBatch in js/app.js)', !/\b(collection|writeBatch)\(/.test(src) && /writeBatch/.test(store), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
