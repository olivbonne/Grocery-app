/* v2.15 — the safety net, from the app review of 11 October (the household: "Do all of the fixes as said in
   the order suggested"). R1 it opens with no signal (a service worker, and the Firebase SDK in the repo);
   R2 it reports its own crashes; R5 the tests run on every pull request; R3 backups you can restore; R4 install
   guidance, and asking the browser to keep the data.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a worker takes charge of the page, keeps the page, fonts, icons and SDK, and with the connection off the
     app opens and shows the list; /api is never stored; another page never replaces the stored app;
   - without the test flag no worker registers under automation (Playwright 1.56 cannot stub a worker's own
     requests — so this suite swaps the worker's SDK copy for the stub before it goes offline, and the real
     SDK never runs: on a CI runner with internet it would reach the real database);
   - an error or an unhandled rejection is reported as a crash with the version and page, never the list code
     or the site's address; noise and repeats are not sent; at most three a day;
   - "Back up" writes a readable file without the list code; restoring asks first, replaces the items, adds
     Regulars back without removing any, and can be undone; a wrong file is refused with a message; one copy
     a day is kept on the phone and any of them can be restored;
   - iPhone Safari (not installed) shows the install card once; installed, or with no prompt, it does not;
     the browser's own prompt opens from the card; the app asks for persistent storage;
   - the workflow, the exclude lists and the SDK path, checked in the files themselves.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.07 the app reopens on the
   last page; v2.10 a fresh profile runs the v1.63 slot migration and reloads — seed ml_appmig163. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (items, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(items)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  ${extra||''}
})()`;
const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[]});
const GRID4 = 'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","4"); localStorage.setItem("ml_fill","full"); localStorage.setItem("ml_caton","0");';


const SMALL0 = n => `localStorage.setItem("ml_displays", JSON.stringify({shop:"small"})); localStorage.setItem("ml_smallcols","${n}"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_store","home");`;
const LIST = [["Frozen raspberries","frozen",2],["Ginger beer no sugar","drinks"],["Beef cubes","meat",1,"800g"],["Beef topside steak","meat",3,"200g"],
  ["Lamb rump or flank","meat"],["Chicken breast","meat",3,"200g"],["Chicken drumsticks","meat",4,"1kg"],["Chicken thigh","meat",8,"500g"],["Avocados","vegetable"]];

const SMALL = n => SMALL0(n);



const FB = '/vendor/firebasejs/10.12.2/';
const LIST15 = [["Milk","fresh",2],["Bananas","fruit"],["Chicken thigh","meat",8,"500g"],["Rice","bulk",1,"5kg"],["Shampoo","health"]].map((x,i)=>it(String(i),x[0],x[1],x[2],x[3]));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const today = ()=>{ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };

(async () => {
  const [port,out]=process.argv.slice(2);
  const fs=require('fs'), path=require('path');
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page, posts=[];
  const mk = async(items, extra, opts)=>{ opts=opts||{}; if(ctx) await ctx.close(); posts=[];
    ctx = await browser.newContext(Object.assign({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true }, opts.ua?{userAgent:opts.ua}:{}));
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/feedback', r => { try{ posts.push(JSON.parse(r.request().postData()||'{}')); }catch(e){} r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true,"via":"log"}' }); });
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource|boom v215|reject v215|ResizeObserver loop|aborted|crash v215/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>{ if(/boom v215|reject v215|ResizeObserver loop|aborted|crash v215/i.test(e.message)) return; errors.push('PAGEERR '+e.message); });
    if(opts.init) await page.addInitScript(opts.init);
    await page.addInitScript(seed(items, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const cache = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ml_cache_v101')||'{}'));
  const names = async()=>((await cache()).items||[]).map(i=>i.name).sort();

  try{
    /* ── R1. it opens with no signal ───────────────────────────────────── */
    await mk(LIST15, 'localStorage.setItem("ml_swtest","1");');
    const ctl = await page.evaluate(async()=>{ if(!('serviceWorker' in navigator)) return 'none';
      await navigator.serviceWorker.ready; for(let i=0;i<60 && !navigator.serviceWorker.controller;i++) await new Promise(r=>setTimeout(r,100));
      return !!navigator.serviceWorker.controller; });
    ok('the app registers a service worker, and it takes charge of the page', ctl===true, String(ctl));
    const keys = await page.evaluate(async()=>{ const c=await caches.open('ml-shell-1'); return (await c.keys()).map(r=>new URL(r.url).pathname); });
    ok('…which keeps the page, the fonts, the icons and the Firebase SDK on the phone',
       ['/index.html','/outfit-latin.woff2','/img/icon-180.png',FB+'firebase-app.js',FB+'firebase-firestore.js'].every(k=>keys.includes(k)), JSON.stringify(keys));
    /* The worker fetched the real SDK files for its copy. The test swaps that copy for the stub before going
       offline, so the real SDK never runs here — on a CI runner with internet it would reach the real database. */
    await page.evaluate(async(stub)=>{ const c=await caches.open('ml-shell-1');
      for(const f of ['firebase-app.js','firebase-firestore.js']) await c.put('/vendor/firebasejs/10.12.2/'+f, new Response(stub,{headers:{'content-type':'text/javascript'}})); }, STUB);
    await ctx.setOffline(true);
    let opened=true; try{ await page.reload({ waitUntil:'domcontentloaded', timeout:9000 }); }catch(e){ opened=false; }
    await page.waitForTimeout(1500);
    const offTxt = opened ? await page.evaluate(()=>document.getElementById('app').innerText) : '';
    ok('with no connection, the app still opens — and shows the list', opened && /Chicken thigh/.test(offTxt) && /Bananas/.test(offTxt) && !/Still loading/.test(offTxt), offTxt.replace(/\s+/g,' ').slice(0,120));
    await shot('offline');
    await ctx.setOffline(false);
    const noApi = await page.evaluate(async()=>{ const c=await caches.open('ml-shell-1'); return (await c.keys()).every(r=>!new URL(r.url).pathname.startsWith('/api/')); });
    ok('the server functions are never kept in the worker\'s copy', noApi, '');
    await page.goto(`http://127.0.0.1:${port}/concept.html`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(600);
    const stillApp = await page.evaluate(async()=>{ const c=await caches.open('ml-shell-1'); const r=await c.match('/index.html'); const t=r?await r.text():''; return /id="app"/.test(t) && /Market List/.test(t); });
    ok('opening another page on the site never replaces the stored app (the worker\'s copy is still index.html)', stillApp, '');

    await mk(LIST15);
    const regs = await page.evaluate(async()=>('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
    ok('under test automation, without the test flag, no worker is registered (Playwright 1.56 cannot stub its requests)', regs===0, String(regs));

    /* ── R2. it reports its own crashes ────────────────────────────────── */
    await page.evaluate(()=>{ setTimeout(()=>{ throw new Error('boom v215 at http://x.test/index.html?list=v101:12'); }, 0); });
    await page.waitForTimeout(500);
    const c1 = posts.filter(p=>p.kind==='crash');
    ok('an error is reported as a crash, with the version and the page (and the message only once)', c1.length===1 && /boom v215/.test(c1[0].text) && (c1[0].text.match(/boom v215/g)||[]).length===1 && c1[0].diag && /^v\d+\.\d+$/.test(c1[0].diag.version) && c1[0].diag.page==='shop', JSON.stringify(c1));
    ok('…and never the list code, or the site\'s address', c1.length===1 && !/v101|list=|x\.test/.test(JSON.stringify(c1[0])), JSON.stringify(c1));
    await page.evaluate(()=>{ Promise.reject(new Error('reject v215')); });
    await page.waitForTimeout(400);
    ok('a promise that fails unhandled is reported too', posts.filter(p=>p.kind==='crash').some(p=>/reject v215/.test(p.text)), '');
    await page.evaluate(()=>{ setTimeout(()=>{ throw new Error('ResizeObserver loop completed with undelivered notifications.'); },0);
      Promise.reject(new DOMException('The user aborted a request.','AbortError'));
      setTimeout(()=>{ throw new Error('boom v215 at http://x.test/index.html?list=v101:12'); }, 10); });
    await page.waitForTimeout(500);
    ok('ResizeObserver noise, aborts and a repeat of the same error are not sent', posts.filter(p=>p.kind==='crash').length===2, JSON.stringify(posts.map(p=>p.text)));
    await page.evaluate(()=>{ for(const n of [1,2,3]) setTimeout(()=>{ throw new Error('crash v215 number '+n); }, n*5); });
    await page.waitForTimeout(500);
    ok('at most three crash reports a day from one phone', posts.filter(p=>p.kind==='crash').length===3, JSON.stringify(posts.map(p=>p.text)));

    /* ── R3. backups you can restore ───────────────────────────────────── */
    const shareInit = `(()=>{ Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
      Object.defineProperty(navigator,'share',{value:async(d)=>{ window.__sharedName=d.files&&d.files[0]&&d.files[0].name; window.__sharedFile=d.files&&d.files[0]?await d.files[0].text():null; },configurable:true}); })()`;
    const yday = new Date(Date.now()-86400000);
    const ydayKey = yday.getFullYear()+"-"+String(yday.getMonth()+1).padStart(2,"0")+"-"+String(yday.getDate()).padStart(2,"0");
    const snapList = [{ day:ydayKey, at:yday.getTime(), v:'v2.14', list:{ items:[it('s1','Snapshot apple','fruit'),it('s2','Snapshot pear','fruit'),it('s3','Snapshot plum','fruit')], buyAgain:[{name:'Old regular',cat:'others',qty:1,weight:'',sub:'',ts:1}], plan:{days:{},recipes:[],saved:[]}, prices:{} } }];
    await mk(LIST15, `localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_snap_v101", ${JSON.stringify(JSON.stringify(snapList))});`, { init:shareInit });
    await tap('#setNav, #setNavP, #setNavS');
    await tap('#optBackup');
    const file = await page.evaluate(()=>({ name:window.__sharedName, text:window.__sharedFile }));
    let bk=null; try{ bk=JSON.parse(file.text); }catch(e){}
    ok('"Back up this list" writes a file the app can read back: kind list-backup, with the items', bk && bk.kind==='list-backup' && bk.format===1 && bk.list && (bk.list.items||[]).length===5 && /-backup-\d{4}-\d\d-\d\d\.json$/.test(file.name||''), JSON.stringify({name:file.name, kind:bk&&bk.kind, n:bk&&bk.list&&bk.list.items&&bk.list.items.length}));
    ok('…and the list code (the key to the list) is not in it', file.text && !/v101/.test(file.text), '');
    const restoreFile = JSON.stringify(Object.assign({}, bk, { savedAt:new Date().toISOString(), list:Object.assign({}, bk.list, { items:[it('b1','Backup apple','fruit'), it('b2','Backup pear','fruit')], buyAgain:[{name:'Backup regular',cat:'others',qty:1,weight:'',sub:'',ts:2}] }) }));
    const before = await names();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRestoreFile').click()]);
    const attached = await page.evaluate(()=>!!document.querySelector('body > input[type=file]'));
    await fc.setFiles({ name:'groceries-backup.json', mimeType:'application/json', buffer:Buffer.from(restoreFile) }); await page.waitForTimeout(600);
    const sheet = await page.evaluate(()=>{ const s=document.querySelector('#rstSheet'); return s ? s.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('"Restore from a backup file" opens the picker attached to the page (iOS), then asks first, saying what is in the file', attached && sheet && /2 items/.test(sheet) && /Restore/.test(sheet), sheet);
    await tap('#rstGo'); await page.waitForTimeout(400);
    const after = await names();
    const toastT = await page.evaluate(()=>{ const t=document.querySelector('#toast'); return t ? t.textContent : ''; });
    const regsAfter = ((await cache()).buyAgain||[]).map(b=>b.name);
    ok('restoring replaces the items, and offers Undo', JSON.stringify(after)===JSON.stringify(['Backup apple','Backup pear']) && /Restored/.test(toastT) && /Undo/.test(toastT), JSON.stringify({after, toastT}));
    ok('…adds the backup\'s Regulars back and removes none', regsAfter.includes('Backup regular'), JSON.stringify(regsAfter.slice(0,6)));
    await tap('#undoBtn'); await page.waitForTimeout(400);
    ok('…and Undo puts the list back as it was', JSON.stringify(await names())===JSON.stringify(before), JSON.stringify(await names()));
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#optRestoreFile').click()]);
    await fc2.setFiles({ name:'notes.json', mimeType:'application/json', buffer:Buffer.from('{"hello":1}') }); await page.waitForTimeout(500);
    const bad = await page.evaluate(()=>({ sheet:!!document.querySelector('#rstSheet'), toast:(document.querySelector('#toast')||{}).textContent||'' }));
    ok('a file that is not a backup is refused, with a message', !bad.sheet && /isn't a Market List backup/.test(bad.toast), JSON.stringify(bad));
    await page.waitForTimeout(5200);   // the daily copy is taken a few seconds after start-up
    const snaps = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_snap_v101')||'[]').map(s=>({day:s.day, n:(s.list.items||[]).length})));
    ok('the app keeps one copy of the list a day on the phone (today\'s, with yesterday\'s still there)', snaps.length===2 && snaps[0].day===today() && snaps[0].n===5 && snaps[1].day===ydayKey, JSON.stringify(snaps));
    await page.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(200);
    ok('…and only one a day', (await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_snap_v101')||'[]').length))===2, '');
    await tap('#optHistClear, #setNavP').catch(()=>{});
    await page.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); });
    await tap('#cartNav'); await tap('#setNav');
    const rows = await page.evaluate(()=>[...document.querySelectorAll('.snaprow')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
    ok('Settings › Other lists the copies on this phone', rows.length===2 && /5 items/.test(rows[0]) && /3 items/.test(rows[1]), JSON.stringify(rows));
    await tap('[data-snaprestore="1"]');
    const s2 = await page.evaluate(()=>{ const s=document.querySelector('#rstSheet'); return s ? s.textContent.replace(/\s+/g,' ').trim() : null; });
    await tap('#rstGo'); await page.waitForTimeout(300);
    ok('…and any of them can be restored, after the same question', s2 && /3 items/.test(s2) && JSON.stringify(await names())===JSON.stringify(['Snapshot apple','Snapshot pear','Snapshot plum']), JSON.stringify({s2, now:await names()}));
    await shot('backups');

    /* ── R4. install guidance, and keeping the data ────────────────────── */
    const persistInit = `window.__persist=0; Object.defineProperty(navigator,'storage',{value:{ persisted:async()=>false, persist:async()=>{ window.__persist++; return true; }, estimate:async()=>({}) },configurable:true});`;
    await mk(LIST15, '', { ua:IPHONE, init:`(()=>{ Object.defineProperty(navigator,'standalone',{value:false,configurable:true}); ${persistInit} })()` });
    const card = await page.evaluate(()=>{ const c=document.querySelector('#installCard'); return c ? c.textContent.replace(/\s+/g,' ').trim() : null; });
    ok('iPhone Safari, not installed: a card says how to put the app on the Home Screen', card && /Add to Home Screen/.test(card) && /Share/.test(card), card);
    ok('…and the app asks the browser to keep its data', (await page.evaluate(()=>window.__persist))>=1, '');
    await shot('install');
    await tap('#installDone');
    await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200);
    ok('"Got it" hides the card for good', !(await page.evaluate(()=>!!document.querySelector('#installCard'))), '');
    await mk(LIST15, '', { ua:IPHONE, init:`(()=>{ Object.defineProperty(navigator,'standalone',{value:true,configurable:true}); })()` });
    ok('installed (opened from the Home Screen): no card', !(await page.evaluate(()=>!!document.querySelector('#installCard'))), '');
    await mk(LIST15);
    ok('a browser with no install prompt and not an iPhone: no card', !(await page.evaluate(()=>!!document.querySelector('#installCard'))), '');
    await page.evaluate(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=()=>{ window.__prompted=true; }; e.userChoice=Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); });
    await page.waitForTimeout(400);
    const has = await page.evaluate(()=>!!document.querySelector('#installGo'));
    if(has) await tap('#installGo');
    ok('where the browser offers an install prompt, the card\'s Install button opens it', has && (await page.evaluate(()=>window.__prompted===true)) && !(await page.evaluate(()=>!!document.querySelector('#installCard'))), '');

    /* ── R5 + housekeeping: static checks on the repo ──────────────────── */
    const root = path.resolve(__dirname, '..', '..');
    const wf = fs.existsSync(path.join(root,'.github/workflows/tests.yml')) ? fs.readFileSync(path.join(root,'.github/workflows/tests.yml'),'utf8') : '';
    ok('a GitHub workflow runs the syntax gate, the server suites and every browser suite on each pull request',
       /pull_request/.test(wf) && /node \.claude\/tests\/syntax\.js/.test(wf) && /api-\*\.js/.test(wf) && /v\*\.js/.test(wf) && /timeout 300/.test(wf) && /\^FAIL/.test(wf), '');
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    const ex = (html.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]);
    ok('the new data keys survive applying an appearance slot (in both exclude lists)', ex.length===2 && ex.every(r=>/ml_crashday\$/.test(r) && /ml_installhint\$/.test(r) && /ml_snap_/.test(r)), JSON.stringify(ex.map(r=>r.slice(-60))));
    ok('the app loads the Firebase SDK from the repo, not from gstatic', /from "\/vendor\/firebasejs\/10\.12\.2\/firebase-app\.js"/.test(html) && !/import[^;]*gstatic\.com\/firebasejs/.test(html), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
