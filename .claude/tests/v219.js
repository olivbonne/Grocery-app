/* v2.19 — the module split, phase 1 (the app review's R23 and item 1 of the published plan: "modules before
   features"). The CSS moved to app.css, the app to js/app.js, the reference data and the drawings to js/data/ —
   byte for byte, no behaviour change — and every one of them is fetched under a versioned URL.

   WHAT THESE CHECKS HAVE TO PROVE: index.html is a shell (no inline style, no inline module); every ?v= in the page,
   in the app's imports and in the worker's PRECACHE is the app's own version, so a phone can never pair a new page
   with an old file; the data modules import nothing; the bump tool refuses a malformed version. In the browser:
   the app boots from the files with no console error, its styles apply (Outfit, the fixed nav), the drawings
   and the category marks draw, the stores list comes from the catalogue. The worker: keeps all four files, opens
   offline WITH its styles and drawings, and — unit-tested in Node against an in-memory cache — re-fetches only the
   page, the manifest and what it does not hold on install, and drops the previous release's files on activate.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.15 the
   worker's own requests cannot be stubbed, so its cached SDK is swapped for the stub before going offline — the
   real SDK must never run in a test. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[]});
const L19 = [["Croissant","fresh",2],["Chicken thigh","meat",1,"500g"],["Bananas","fruit",6]].map((x,i)=>it(String(i),x[0],x[1],x[2],x[3]));
const seed = (extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(L19)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  ${extra||''}
})()`;

/* ── the worker, in Node, against an in-memory Cache Storage ─────────────────────────────────────────────── */
async function swUnit(){
  const store = new Map();                                  // cache name → Map(url → body)
  const fetched = [];
  const cacheObj = name => { if(!store.has(name)) store.set(name, new Map()); const m = store.get(name);
    return { match: async u => m.get(new URL(typeof u === 'string' ? u : u.url, 'https://ml.test').href),
             add: async req => { const u = new URL(typeof req === 'string' ? req : req.url, 'https://ml.test').href; fetched.push(new URL(u).pathname + new URL(u).search); m.set(u, 'fresh'); },
             put: async (req, res) => { m.set(new URL(typeof req === 'string' ? req : req.url, 'https://ml.test').href, res); },
             keys: async () => [...m.keys()].map(u => ({ url: u })),
             delete: async req => m.delete(req.url) }; };
  const handlers = {};
  const sandbox = { self: { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} },
                            location: { origin: 'https://ml.test' }, registration: {} },
    caches: { open: async n => cacheObj(n), keys: async () => [...store.keys()], delete: async n => store.delete(n) },
    Request: class { constructor(u){ this.url = new URL(u, 'https://ml.test').href; } }, URL, Promise, Set, Map, console,
    fetch: async () => { throw new Error('no network in the unit test'); }, setTimeout };
  vm.runInNewContext(read('sw.js'), sandbox);
  const PRE = vm.runInNewContext('PRECACHE', sandbox) || [];
  // a phone that ran the previous release: an old cache, last release's files, and the unchanging fonts and SDK
  store.set('ml-shell-0', new Map([['https://ml.test/old', 'x']]));
  const shell = cacheObj('ml-shell-1');
  const keep = PRE.filter(u => !/^\/(index\.html)?$|manifest/.test(u) && !/[?&]v=/.test(u));
  for(const u of keep) await shell.put(u, 'old');
  await shell.put('/app.css?v=0.01', 'stale'); await shell.put('/js/app.js?v=0.01', 'stale');
  let p; handlers.install({ waitUntil: x => { p = x; } }); await p;
  const versioned = PRE.filter(u => /[?&]v=/.test(u));
  const inst = { fetched: fetched.slice().sort(), expected: ['/', '/index.html', '/manifest.webmanifest', ...versioned].sort() };
  handlers.activate({ waitUntil: x => { p = x; } }); await p;
  const left = [...store.get('ml-shell-1').keys()].map(u => new URL(u).pathname + new URL(u).search);
  return { PRE, inst, left, oldCacheGone: !store.has('ml-shell-0'), keep };
}

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  try{
    /* ── static: the shell and the versions ───────────────────────────── */
    const html = read('index.html'), app = read('js/app.js'), sw = read('sw.js');
    const V = ((app.match(/const APP_VERSION = "v(\d+\.\d\d)";/)||[])[1])||null;
    ok('index.html is a shell: no inline style, no inline module', !/<style[\s>]/.test(html) && !/<script type="module">/.test(html), '');
    const link = (html.match(/<link rel="stylesheet" href="\/app\.css\?v=([\d.]+)">/)||[])[1], mod = (html.match(/<script type="module" src="\/js\/app\.js\?v=([\d.]+)"><\/script>/)||[])[1];
    ok('…it links /app.css and loads /js/app.js, both at the app\'s own version', V && link===V && mod===V, JSON.stringify({V,link,mod}));
    /* SUPERSEDED by v2.20: js/tenpct.js joined the modules, so the set is DERIVED from the imports instead of named —
       a new module can no longer be left out of the worker's PRECACHE (v2.20's first build was, and would not have
       opened offline). Still protects: every module at the app's version, and the worker keeping exactly those. */
    const mods = new Set(), walk = (f)=>{ for(const m of read(f).matchAll(/from "(\.{1,2}\/[^"]+)"/g)){ const u=new URL(m[1], 'https://x/'+f).pathname+new URL(m[1], 'https://x/'+f).search; if(!mods.has(u)){ mods.add(u); walk(u.replace(/^\//,'').replace(/\?.*$/,'')); } } };
    walk('js/app.js');
    const imps = [...mods];
    ok('every module js/app.js loads, directly or not, carries that version', imps.length>=3 && imps.every(s=>s.endsWith('?v='+V)), JSON.stringify(imps));
    const preSrc = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/)||[])[1]||'';
    const pre = [...preSrc.matchAll(/"([^"]+\?v=[^"]+)"/g)].map(m=>m[1]).sort();
    const want = ['/app.css?v='+V, '/js/app.js?v='+V, ...imps].sort();
    ok('the worker precaches exactly the stylesheet, the app and every module it loads, at that version', JSON.stringify(pre)===JSON.stringify(want), JSON.stringify({pre,want}));
    const data = ['js/data/catalog.js','js/data/drawings.js','js/tenpct.js'].map(read);
    ok('the data modules and the logic modules import nothing (pure; the app passes in what they need)', data.every(t=>!/^\s*import\b/m.test(t)), '');
    const bad = spawnSync(process.execPath, [path.join(ROOT,'.claude/tools/bump.js'), '2.1'], { encoding:'utf8' });
    ok('the bump tool refuses a malformed version, and changes nothing', bad.status!==0 && read('js/app.js')===app && read('index.html')===html, (bad.stderr||bad.stdout||'').slice(0,120));

    /* ── the worker's install and activate, unit-tested ───────────────── */
    const u = await swUnit();
    ok('a new worker re-fetches only the page, the manifest and the versioned files — not the fonts, icons or SDK it already holds',
       JSON.stringify(u.inst.fetched)===JSON.stringify(u.inst.expected) && u.keep.length>=7, JSON.stringify(u.inst));
    ok('…and on activate drops the previous release\'s files and caches, keeping everything it lists',
       u.oldCacheGone && !u.left.some(x=>/v=0\.01/.test(x)) && u.PRE.every(x=>u.left.includes(x)), JSON.stringify(u.left));

    /* ── the browser: it boots from the files ─────────────────────────── */
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async(extra)=>{ if(ctx) await ctx.close();
      ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(extra));
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
      await page.waitForTimeout(1500); };
    const look = ()=>page.evaluate(()=>{ const nav=document.querySelector('.bottomnav'), t=[...document.querySelectorAll('#zoomer .pill')].find(p=>/Croissant/.test(p.textContent));
      return { txt:(document.getElementById('app')||{}).innerText||'', font:getComputedStyle(document.body).fontFamily, nav:nav?getComputedStyle(nav).position:null,
        drawn:!!(t && t.querySelector('svg.ill')), mark:!!document.querySelector('#zoomer .cdraw svg') }; });
    await mk();
    const res = await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>{ const u=new URL(e.name); return u.pathname+u.search; }));
    ok('the page loads the stylesheet, the app and every module, versioned',
       want.every(x=>res.includes(x)), JSON.stringify(res.filter(x=>/\?v=/.test(x))));
    const l1 = await look();
    ok('it boots: the list is there', /Croissant/.test(l1.txt) && /Chicken thigh/.test(l1.txt), l1.txt.replace(/\s+/g,' ').slice(0,80));
    ok('…its styles apply (Outfit, the bar fixed at the bottom)', /Outfit/.test(l1.font) && l1.nav==='fixed', JSON.stringify(l1));
    ok('…the drawings come from the data module (a drawn croissant, drawn category marks)', l1.drawn && l1.mark, JSON.stringify(l1));
    await page.locator('#setNav').click(); await page.waitForTimeout(700);
    ok('…and so do the stores (Settings › Sort lists Coles Dandenong)', await page.evaluate(()=>[...document.querySelectorAll('.storechip')].some(b=>/Coles Dandenong/.test(b.textContent))), '');

    /* ── offline, with the worker ─────────────────────────────────────── */
    await mk('localStorage.setItem("ml_swtest","1");');
    const ctl = await page.evaluate(async()=>{ if(!('serviceWorker' in navigator)) return 'none';
      await navigator.serviceWorker.ready; for(let i=0;i<60 && !navigator.serviceWorker.controller;i++) await new Promise(r=>setTimeout(r,100));
      return !!navigator.serviceWorker.controller; });
    const keys = await page.evaluate(async()=>{ const c=await caches.open('ml-shell-1'); return (await c.keys()).map(r=>{ const u=new URL(r.url); return u.pathname+u.search; }); });
    ok('the worker takes charge and keeps every file', ctl===true && want.every(k=>keys.includes(k)), JSON.stringify(keys));
    await page.evaluate(async(stub)=>{ const c=await caches.open('ml-shell-1');
      for(const f of ['firebase-app.js','firebase-firestore.js']) await c.put('/vendor/firebasejs/10.12.2/'+f, new Response(stub,{headers:{'content-type':'text/javascript'}})); }, STUB);
    await ctx.setOffline(true);
    let opened=true; try{ await page.reload({ waitUntil:'domcontentloaded', timeout:9000 }); }catch(e){ opened=false; }
    await page.waitForTimeout(1500);
    const l2 = opened ? await look() : {};
    ok('with no connection it opens WITH its styles and drawings, not as bare text', opened && /Croissant/.test(l2.txt) && /Outfit/.test(l2.font) && l2.nav==='fixed' && l2.drawn, JSON.stringify(l2).slice(0,200));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-offline.png') });
    await ctx.setOffline(false);
    await browser.close();
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
