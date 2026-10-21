/* v2.51 — each item saved on its own (architecture review S8, the lighter step): two phones changing the list at once no
   longer undo each other. The list is still one record; a phone now MERGES what arrives item by item (js/merge.js).

   WHAT THESE CHECKS HAVE TO PROVE:
   - js/merge.js in Node: two ticks a second apart both survive; a removal travels and wins over an older copy, but not over
     an item added again later; equal stamps take the server's copy; an item only this phone has is kept or dropped by the
     app's rule; every change is stamped before a save without any edit path having to remember; removals are kept 30 days;
   - in the app: a tick here and a tick on another phone both stay, and the phone writes the merged list back once; a removal
     from another phone removes the item here; during the move from older apps (a v1 list, or a copy cached before this phone
     ever merged) an item only this phone has is NOT brought back — an older app may have removed it; what is written carries
     v:2, the items' stamps and the removals; a list from a newer app (v3) is not overwritten;
   - the rules accept itemTomb; merge.js is imported versioned and precached.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
/* Firestore: the test pushes snapshots by hand (window.__push) and every write of the list is recorded */
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export default {};
export const doc=(db,...p)=>({ path:p.join('/') });
export const onSnapshot=(ref,a,b,c)=>{ const cb=typeof a==='function'?a:(typeof b==='function'?b:c);
  if(ref && ref.path && ref.path.indexOf('lists/')===0){ window.__push=(d)=>cb({ exists:()=>true, data:()=>JSON.parse(JSON.stringify(d)), metadata:{ hasPendingWrites:false, fromCache:false } }); }
  return ()=>{}; };
export const setDoc=async(ref,d)=>{ if(ref && ref.path && ref.path.indexOf('lists/')===0){ window.__writes=(window.__writes||[]); window.__writes.push(JSON.parse(JSON.stringify(d))); } };`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(items,x)=>Object.assign({ items, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, x||{});
const seed = (items, extra) => `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(${JSON.stringify(DOC(items))}, ${JSON.stringify(extra||{})})));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home");
})()`;
async function mergeChecks(ok, ROOT, fs, path){
  const src = fs.readFileSync(path.join(ROOT, 'js', 'merge.js'), 'utf8');
  const M = await import('data:text/javascript,' + encodeURIComponent(src));
  const base = [{ id:'1', name:'Milk', checked:false, ts:100 }, { id:'2', name:'Bread', checked:false, ts:100 }];
  /* two phones tick a second apart; the server got B's write, which never saw A's tick */
  const A = [{ ...base[0], checked:true, ts:200 }, { ...base[1] }], srvB = [{ ...base[0] }, { ...base[1], checked:true, ts:210 }];
  let m = M.mergeItems(srvB, {}, A, {});
  ok('two ticks on two phones, a second apart: both survive the merge', m.items.find(i=>i.id==='1').checked && m.items.find(i=>i.id==='2').checked, JSON.stringify(m.items));
  m = M.mergeItems(srvB, {}, [A[0]], { '2':300 });
  ok('a removal on one phone wins over the other phone\'s older copy, and its tombstone travels', m.items.length===1 && m.tomb['2']===300, JSON.stringify(m));
  m = M.mergeItems([{ id:'2', name:'Bread', ts:400 }], {}, [], { '2':300 });
  ok('…but an item added again after the removal comes back, and the tombstone is dropped', m.items.length===1 && !m.tomb['2'], JSON.stringify(m));
  m = M.mergeItems([{ ...base[0], name:'Milk (server)' }], {}, [{ ...base[0], name:'Milk (phone)' }], {});
  ok('equal stamps: the server\'s copy', m.items[0].name==='Milk (server)', m.items[0].name);
  m = M.mergeItems([base[0]], {}, [base[0], { id:'3', name:'Eggs', ts:150 }], {}, () => false);
  ok('an item only this phone has is dropped when the rule says it may have been removed by an older app', m.items.length===1, JSON.stringify(m.items));
  m = M.mergeItems([base[0]], {}, [base[0], { id:'3', name:'Eggs', ts:150 }], {}, () => true);
  ok('…and kept when the rule says the other phone simply had not seen it yet', m.items.length===2, JSON.stringify(m.items));
  const sigs = new Map(base.map(i => [i.id, M.itemSig(i)])), items = [{ ...base[0], checked:true }], tomb = {};
  const r = M.stampItems(items, sigs, tomb, 500);
  ok('before a save, what changed is stamped and what went missing is tombstoned — no edit path can forget', r.stamped===1 && r.removed===1 && items[0].ts===500 && tomb['2']===500, JSON.stringify({ r, items, tomb }));
  const r2 = M.stampItems(items, sigs, tomb, 600);
  ok('…and nothing is stamped twice', r2.stamped===0 && r2.removed===0 && items[0].ts===500, JSON.stringify(r2));
  const now = Date.now(); const p = M.pruneTomb({ old: now - 31*864e5, fresh: now - 864e5 }, now);
  ok('removals are remembered for 30 days', !('old' in p) && ('fresh' in p), JSON.stringify(p));
  ok('the fingerprint tells a merged list from the server\'s', M.itemsSig(A, {}) !== M.itemsSig(srvB, {}) && M.itemsSig(A, {}) === M.itemsSig(JSON.parse(JSON.stringify(A)), {}), '');
}

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[]; let browser;
  try {
    await mergeChecks(ok, ROOT, fs, path);
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(items, extra)=>{ if(ctx) await ctx.close();
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(items, extra));
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    const push = async(d)=>{ await page.evaluate(d=>window.__push(d), d); await page.waitForTimeout(500); };
    const writes = ()=>page.evaluate(()=>window.__writes||[]);
    const local = ()=>page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_v101')).items||[]; }catch(e){ return []; } });
    const tick = async(name)=>{ await page.locator('.pill, .tile, [data-id]').filter({ hasText:name }).first().click(); await page.waitForTimeout(500); };
    const T0 = Date.now() - 3600e3;

    /* a list already written by merging phones, merged here before (mv 2) */
    const ITEMS = [it('1','Milk','dairy',{ ts:T0 }), it('2','Bread','bakery',{ ts:T0 }), it('3','Apples','fruit',{ ts:T0 })];
    await mk(ITEMS, { mv:2, itemTomb:{} });
    await push(DOC(ITEMS, { v:2, itemTomb:{} }));
    await tick('Milk');
    const myTick = (await local()).find(i=>i.id==='1');
    ok('a tick is stamped with when it happened', myTick && myTick.checked && myTick.ts > T0, JSON.stringify(myTick));
    const nW = (await writes()).length;
    /* the other phone ticked Bread, before it saw this phone's Milk */
    await push(DOC([it('1','Milk','dairy',{ ts:T0 }), it('2','Bread','bakery',{ checked:true, ts:Date.now()-500 }), it('3','Apples','fruit',{ ts:T0 })], { v:2, itemTomb:{} }));
    const after = await local();
    ok('a tick here and a tick on another phone a moment apart: both stay', after.find(i=>i.id==='1').checked && after.find(i=>i.id==='2').checked, JSON.stringify(after.map(i=>[i.name,i.checked])));
    const w = await writes(), lw = w[w.length-1] || {};
    ok('…and this phone writes the merged list back once, so the other phone gets Milk too', w.length===nW+1 && lw.items && lw.items.find(i=>i.id==='1').checked && lw.items.find(i=>i.id==='2').checked, (w.length-nW)+' writes');
    ok('…what is written carries v:2, the stamps and the removals', lw.v===2 && lw.itemTomb && typeof lw.itemTomb==='object' && lw.items.every(i=>typeof i.ts==='number'), JSON.stringify({ v:lw.v, tomb:lw.itemTomb }));
    await push(lw);
    ok('the server now holding the merged list, nothing more is written (no ping-pong)', (await writes()).length===w.length, (await writes()).length+' vs '+w.length);
    /* the other phone removed Apples */
    await push(Object.assign({}, lw, { items: lw.items.filter(i=>i.id!=='3'), itemTomb:{ '3':Date.now() } }));
    ok('a removal on another phone removes the item here', !(await local()).some(i=>i.id==='3') && !/Apples/.test(await page.locator('#zoomer').textContent()), JSON.stringify((await local()).map(i=>i.name)));
    await shot(page, out, 'merged');

    /* the move from older apps: a v1 list from the server lacks Apples, which this phone still has in its old cached copy */
    await mk(ITEMS, {});
    await push(DOC([it('1','Milk','dairy'), it('2','Bread','bakery')]));
    ok('moving from an older app: an item only this phone\'s old copy has is NOT brought back (an older app may have removed it)', !(await local()).some(i=>i.id==='3'), JSON.stringify((await local()).map(i=>i.name)));
    const wv = await writes(); const l2 = wv[wv.length-1] || {};
    ok('…and the first write after the move upgrades the list to v:2', l2.v===2, JSON.stringify(l2.v));

    /* a tick in the first moment after opening, before the server's copy arrives: it must be stamped too, or the server's
       older copy (same stamp) would undo it — the v2.51 start-up trap */
    await mk(ITEMS, { mv:2, itemTomb:{} });
    await tick('Bread');
    await push(DOC(ITEMS, { v:2, itemTomb:{} }));
    ok('a tick made right after opening survives the server\'s older copy arriving', (await local()).find(i=>i.id==='2').checked, JSON.stringify((await local()).map(i=>[i.name,i.checked,i.ts])));

    /* a list from a newer app */
    await mk(ITEMS, { mv:2 });
    await push(DOC(ITEMS, { v:3 }));
    ok('a list saved by a newer app (v3) is not overwritten: "Update now"', await page.locator('#newerNote').count()===1, '');

    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8');
    ok('the rules accept itemTomb (a map, bounded)', /'itemTomb'/.test(rules) && /d\.get\('itemTomb', \{\}\) is map/.test(rules), '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    const ver = (src.match(/from "\.\/merge\.js\?v=([\d.]+)"/)||[])[1];
    ok('js/merge.js is imported versioned and precached at the same version', ver && sw.includes('/js/merge.js?v='+ver), ver);
    ok('itemTomb is kept in the list (both defaults, the sync) but not in backups (listDoc)', (src.match(/itemTomb:\{\}/g)||[]).length>=2 && !/function listDoc\(s\)\{[^}]*itemTomb/.test(src.replace(/\n/g,' ').slice(src.indexOf('function listDoc(s)'), src.indexOf('function listDoc(s)')+900)), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
async function shot(page, out, tag){ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); }
