/* v3.20 — staged releases: the tester phone gets a new version at once, the household's other phones a day later.

   Part 1 runs sw.js itself in Node (a vm with a fake Cache API, a fake server and fake events) — a worker cannot be
   stubbed under Playwright, and these are the rules that decide whether a phone is stranded. Part 2 is the browser:
   the Settings row.

   WHAT THESE CHECKS HAVE TO PROVE:
   - install never overwrites the stored page (it would end a hold at once) but adds it on a first install;
   - activate keeps the held page's own versioned files and the worker's memory (ml-meta), and drops other old ones;
   - a household phone seeing a new version serves its stored page and remembers since when; after 24 hours it takes the
     new page and drops the old files; the tester, an urgent release (<meta name="ml-release" content="now">) and
     "release" take it at once; a release on top of a waiting one keeps the clock (several a day never strand a phone); a phone whose old files are not all there takes it at once (never an old page with new files);
   - a versioned file of another release is never stored (the server ignores ?v= and would answer with the NEW file);
   - with no network or a slow one, the stored page answers (the 4 s fallback is unchanged);
   - the kill switch text in the header is unchanged;
   - Settings › Help: "New versions first (tester)" is Off by default and stores ml_tester (in both exclude lists); with
     no worker nothing waits and nothing breaks; the new words have their French. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
const SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://app.test';
const CUR = (SRC.match(/js\/app\.js\?v=([0-9.]+)/) || [])[1];
const NEXT = (Math.round(parseFloat(CUR) * 100 + 1) / 100).toFixed(2), OLD = (Math.round(parseFloat(CUR) * 100 - 1) / 100).toFixed(2);
const VFILES = (SRC.match(/"\/[^"]+\?v=[0-9.]+"/g) || []).map(s => s.slice(1, -1).split('?v=')[0]);
const page = (v, extra) => `<!doctype html><html><head>${extra || ''}<link rel="stylesheet" href="/app.css?v=${v}"></head><body><script type="module" src="/js/app.js?v=${v}"></script></body></html>`;

/* a fake world: one origin, its caches, its server */
function world(o) {
  o = o || {};
  const store = new Map();   // cache name → Map(url → { body, headers, status })
  const abs = k => new URL(typeof k === 'string' ? k : k.url, ORIGIN).href;
  const mkCache = name => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name);
    return {
      match: async k => { const e = m.get(abs(k)); return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined; },
      put: async (k, r) => { m.set(abs(k), { body: await r.text(), status: r.status, headers: [...r.headers] }); },
      add: async k => { const r = await W.fetch(new Request(abs(k))); if (!r.ok) throw new Error('add failed'); m.set(abs(k), { body: await r.text(), status: r.status, headers: [...r.headers] }); },
      delete: async k => m.delete(abs(k)),
      keys: async () => [...m.keys()].map(u => new Request(u)),
    }; };
  const W = { serverPage: o.serverPage || page(CUR), offline: false, delay: 0, fetched: [], now: o.now || Date.parse('2026-11-14T10:00:00Z') };
  /* a browser's fetch answers same-origin with type "basic"; Node's Response says "default" */
  const basic = r => { Object.defineProperty(r, 'type', { value: 'basic' }); return r; };
  W.fetch = async (req) => { const u = new URL(typeof req === 'string' ? req : req.url, ORIGIN); W.fetched.push(u.pathname + u.search);
    if (W.offline) throw new TypeError('offline');
    if (W.delay) await new Promise(r => setTimeout(r, W.delay));
    if (u.pathname === '/' || u.pathname === '/index.html') return basic(new Response(W.serverPage, { status: 200, headers: { 'content-type': 'text/html' } }));
    /* the server ignores ?v= and answers with what it has NOW — the version of its current page */
    const sv = (W.serverPage.match(/js\/app\.js\?v=([0-9.]+)/) || [])[1];
    return basic(new Response(`file ${u.pathname} of ${sv}`, { status: 200, headers: { 'content-type': 'text/plain' } })); };
  /* Node's Request does not take cache:"reload" nor a relative address (a worker's does): drop the one, resolve the other */
  class Req extends Request { constructor(u, o) { const x = Object.assign({}, o || {}); delete x.cache; super(typeof u === 'string' ? new URL(u, ORIGIN).href : u, x); } }
  const caches = { open: async n => mkCache(n), keys: async () => [...store.keys()], delete: async n => store.delete(n),
    match: async k => { for (const n of store.keys()) { const r = await mkCache(n).match(k); if (r) return r; } return undefined; } };
  const listeners = {};
  const self = { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => {}, location: { origin: ORIGIN },
    clients: { claim: async () => {} }, registration: {} };
  const ctx = vm.createContext({ self, caches, fetch: W.fetch, Request: Req, Response, Headers, URL, Promise, Set, Map, JSON, String, Date: { now: () => W.now },
    setTimeout: (f, ms, ...a) => setTimeout(f, Math.min(ms, 60), ...a), console });
  vm.runInContext(SRC, ctx, { filename: 'sw.js' });
  W.ctx = ctx; W.store = store; W.caches = caches;
  const ext = () => { const ps = []; return { ps, waitUntil: p => ps.push(Promise.resolve(p).catch(() => {})) }; };
  W.install = async () => { const e = ext(); listeners.install(e); await Promise.all(e.ps); };
  W.activate = async () => { const e = ext(); listeners.activate(e); await Promise.all(e.ps); };
  W.open = async () => { const e = ext(); let resp; e.request = new Request(ORIGIN + '/index.html', { mode: 'same-origin' });
    e.respondWith = p => { resp = p; }; listeners.fetch(e); const r = await resp; const txt = r ? await r.text() : null;
    await Promise.all(e.ps); for (let i = 0; i < 3; i++) await Promise.all(e.ps); return txt; };
  W.asset = async (p) => { const e = ext(); let resp; e.request = new Request(ORIGIN + p); e.respondWith = x => { resp = x; }; listeners.fetch(e); const r = await resp; const t = await r.text(); await Promise.all(e.ps); return t; };
  W.msg = async (data) => { const e = ext(); let got = null; e.data = data; e.ports = [{ postMessage: x => { got = x; } }]; listeners.message(e); await Promise.all(e.ps); return got; };
  W.cached = async (n, k) => { const r = await mkCache(n).match(k); return r ? r.text() : null; };
  W.keys = async n => (await mkCache(n).keys()).map(r => { const u = new URL(r.url); return u.pathname + u.search; });
  W.meta = async () => { const t = await W.cached('ml-meta', '/__ml/meta'); return t ? JSON.parse(t) : {}; };
  W.seedOld = async (v) => { const c = await caches.open('ml-shell-1'); await c.put('/index.html', new Response(page(v), { headers: { 'content-type': 'text/html' } }));
    for (const f of VFILES) await c.put(f + '?v=' + v, new Response(`file ${f} of ${v}`)); };
  return W;
}
const verOf = t => ((t || '').match(/js\/app\.js\?v=([0-9.]+)/) || [])[1];
const H = 3600 * 1000;

(async () => {
  try {
    /* the kill switch */
    ok('the kill switch in the header is unchanged', SRC.includes('self.addEventListener("install", () => self.skipWaiting());')
      && SRC.includes('self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))')
      && SRC.includes('.then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate(c.url)))));'), '');

    /* 1. first install: everything stored, the page taken */
    let W = world();
    await W.install(); await W.activate();
    ok('a first install stores the page and this release\'s files', verOf(await W.cached('ml-shell-1', '/index.html')) === CUR && (await W.keys('ml-shell-1')).includes('/js/app.js?v=' + CUR), '');
    let t = await W.open();
    ok('…and the first open serves the current page', verOf(t) === CUR, verOf(t));

    /* 2. a household phone on the previous version meets this worker */
    W = world(); await W.seedOld(OLD); await (await W.caches.open('ml-shell-1')).put('/x.js?v=0.01', new Response('ancient'));
    await W.install();
    ok('install does not overwrite the stored (older) page', verOf(await W.cached('ml-shell-1', '/index.html')) === OLD, '');
    await W.activate();
    const k2 = await W.keys('ml-shell-1');
    ok('activate keeps the held page\'s own files and this release\'s, and drops other old ones', k2.includes('/js/app.js?v=' + OLD) && k2.includes('/js/app.js?v=' + CUR) && !k2.includes('/x.js?v=0.01'), JSON.stringify(k2.filter(k => /x\.js/.test(k))));
    t = await W.open();
    ok('a household phone keeps serving its page when a new version appears', verOf(t) === OLD, verOf(t));
    let m = await W.meta();
    ok('…and remembers which version waits, and since when', m.pend && m.pend.ver === CUR && m.pend.since === W.now, JSON.stringify(m));
    const st = await W.msg({ t: 'status' });
    ok('status reports the page it serves and the waiting version', st && st.cur === OLD && st.pend && st.pend.ver === CUR && st.holdMs === 24 * H, JSON.stringify(st));
    const a1 = await W.asset('/js/app.js?v=' + OLD);
    ok('the held page gets its own file (old), not the server\'s new one', a1 === `file /js/app.js of ${OLD}`, a1);
    await new Promise(r => setTimeout(r, 30));
    ok('…and the background refresh does not store the server\'s new file under the old address', (await W.cached('ml-shell-1', '/js/app.js?v=' + OLD)) === `file /js/app.js of ${OLD}`, await W.cached('ml-shell-1', '/js/app.js?v=' + OLD));
    W.now += 23 * H; t = await W.open();
    ok('23 hours later: still the held page, the waiting time not restarted', verOf(t) === OLD && (await W.meta()).pend.since === W.now - 23 * H, verOf(t));
    W.now += 2 * H; t = await W.open();
    const k3 = await W.keys('ml-shell-1');
    ok('after 24 hours the new page is taken and stored', verOf(t) === CUR && verOf(await W.cached('ml-shell-1', '/index.html')) === CUR && !(await W.meta()).pend, verOf(t));
    ok('…and the old version\'s files are dropped', !k3.some(k => k.endsWith('?v=' + OLD)) && k3.includes('/js/app.js?v=' + CUR), JSON.stringify(k3.filter(k => k.includes(OLD))));
    W.offline = true; t = await W.open();
    ok('no signal: the stored page answers', verOf(t) === CUR, verOf(t));

    /* 2b. releases on top of a waiting one never restart the clock */
    W = world(); await W.seedOld(OLD); await W.install(); await W.activate(); await W.open();
    const since0 = (await W.meta()).pend.since;
    W.now += 20 * H; W.serverPage = page(NEXT); t = await W.open();
    m = await W.meta();
    ok('a newer release while one waits: still the held page, and the clock kept from the first one', verOf(t) === OLD && m.pend.ver === NEXT && m.pend.since === since0, JSON.stringify(m));
    W.now += 5 * H; t = await W.open();
    ok('…so 24 hours after the first, the newest is taken (several releases a day never strand a phone)', verOf(t) === NEXT, verOf(t));

    /* 3. the tester */
    W = world(); await W.seedOld(OLD); await W.install(); await W.activate();
    const cf = await W.msg({ t: 'cfg', tester: true });
    t = await W.open();
    ok('the tester phone takes the new version at once', cf && cf.ok && verOf(t) === CUR && (await W.meta()).tester === true, verOf(t));

    /* 4. urgent */
    W = world({ serverPage: page(CUR, '<meta name="ml-release" content="now">') }); await W.seedOld(OLD); await W.install(); await W.activate();
    t = await W.open();
    ok('an urgent release (<meta name="ml-release" content="now">) reaches every phone at once', verOf(t) === CUR, verOf(t));

    /* 5. release */
    W = world(); await W.seedOld(OLD); await W.install(); await W.activate();
    t = await W.open(); const rl = await W.msg({ t: 'release' }); const t2 = await W.open();
    ok('"release" (Get it now, or a newer app\'s data): the next open takes the waiting version', verOf(t) === OLD && rl && rl.ok && verOf(t2) === CUR && !(await W.meta()).release, JSON.stringify([verOf(t), verOf(t2)]));

    /* 6. missing old files: never an old page with new files */
    W = world(); await W.seedOld(OLD); await W.install(); await W.activate();
    await (await W.caches.open('ml-shell-1')).delete('/js/i18n.js?v=' + OLD);
    t = await W.open();
    ok('a phone missing one of its page\'s files takes the new version instead of holding', verOf(t) === CUR, verOf(t));

    /* 7. slow network: the stored page after the fallback, and the late answer still counted */
    W = world(); await W.seedOld(OLD); await W.install(); await W.activate();
    W.delay = 200; t = await W.open();
    ok('a slow network: the stored page answers after the fallback', verOf(t) === OLD, verOf(t));
    await new Promise(r => setTimeout(r, 300));
    ok('…and the late answer still starts the waiting time', ((await W.meta()).pend || {}).ver === CUR, JSON.stringify(await W.meta()));

    /* 8. the worker's memory survives an update */
    await W.msg({ t: 'cfg', tester: true }); await W.install(); await W.activate();
    ok('activate never deletes the worker\'s memory (ml-meta)', (await W.meta()).tester === true, JSON.stringify(await W.meta()));
  } catch (e) { ok('worker part ran to the end', false, e.stack.slice(0, 400)); }

  /* Part 2: the browser */
  const [port, out] = process.argv.slice(2);
  if (port) {
    const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
    const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
    const errors = []; let browser;
    try {
      browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
      const pg = await ctx.newPage(); pg.setDefaultTimeout(9000);
      pg.on('console', m => { if (m.type() !== 'error') return; const x = m.text(); if (/Failed to load resource/i.test(x)) return; errors.push(x.slice(0, 160)); });
      pg.on('pageerror', e => errors.push('PAGEERR ' + e.message));
      await pg.addInitScript(`(() => { if(localStorage.getItem("ml_me")) return;
        localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
        localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}])); localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
        localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); })()`);
      await pg.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500);
      await pg.locator('#setNav').click(); await pg.waitForTimeout(500);
      const s0 = await pg.evaluate(() => { const b = document.querySelector('[data-opt-tester="0"]'); return { off: b && b.classList.contains('on'), get: !!document.querySelector('#optSwGet') }; });
      ok('Settings: "New versions first (tester)" is Off by default; with no worker nothing waits', s0.off === true && !s0.get, JSON.stringify(s0));
      await pg.evaluate(() => document.querySelector('[data-opt-tester="1"]').scrollIntoView({ block: 'center' }));
      if (out) await pg.screenshot({ path: out.replace(/\.png$/, '-tester.png') });
      await pg.locator('[data-opt-tester="1"]').click(); await pg.waitForTimeout(400);
      const s1 = await pg.evaluate(() => ({ v: localStorage.getItem('ml_tester'), on: document.querySelector('[data-opt-tester="1"]').classList.contains('on') }));
      ok('…tapping On stores ml_tester and shows it', s1.v === '1' && s1.on, JSON.stringify(s1));
      /* a stand-in worker (the page talks to it through navigator.serviceWorker.controller): a version waits */
      const pg2 = await ctx.newPage(); pg2.on('pageerror', e => errors.push('PAGEERR ' + e.message));
      await pg2.addInitScript(`(() => { window.__sent = JSON.parse(sessionStorage.getItem('t_sent') || '[]');
        const ctl = { postMessage(m, ports){ window.__sent.push(m.t); sessionStorage.setItem('t_sent', JSON.stringify(window.__sent));
          const r = m.t === 'status' ? { cur:'${CUR}', pend:{ ver:'${NEXT}', since: Date.now() - 2*3600*1000 }, holdMs: 86400000 } : { ok:true };
          setTimeout(() => ports && ports[0] && ports[0].postMessage(r), 20); } };
        try { Object.defineProperty(navigator, 'serviceWorker', { configurable:true, value: { controller: ctl, ready: Promise.resolve({}), register: () => Promise.resolve({}) } }); } catch(e) {} })()`);
      await pg2.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil: 'domcontentloaded' }); await pg2.waitForTimeout(1500);
      await pg2.locator('#setNav').click(); await pg2.waitForTimeout(800);
      const w1 = await pg2.evaluate(() => { const g = document.querySelector('#optSwGet'); const l = g && g.previousElementSibling;
        if (g) g.scrollIntoView({ block: 'center' }); return { line: l ? l.textContent.trim() : null, btn: g ? g.textContent.trim() : null, shown: !!(g && l && l.offsetHeight > 0 && g.offsetHeight > 0) }; });
      if (out) await pg2.screenshot({ path: out.replace(/\.png$/, '-waiting.png') });
      ok('a version waiting: Settings says which, and that it arrives tomorrow, with Get it now (both visible)', w1.shown && w1.line === `Version ${NEXT} is waiting — it arrives tomorrow.` && w1.btn === 'Get it now', JSON.stringify(w1));
      await pg2.locator('#optSwGet').click(); await pg2.waitForTimeout(1500);   /* reloaded: the reopened Settings asks for the status again */
      const sent = await pg2.evaluate(() => JSON.parse(sessionStorage.getItem('t_sent') || '[]'));
      ok('…Get it now asks the worker to release and reloads the app', sent.includes('release') && sent.lastIndexOf('status') > sent.indexOf('release'), JSON.stringify(sent));
      await pg2.close();
      const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
      const ex = n => (app.match(new RegExp('const ' + n + ' = /\\^\\(([^/]+)\\)/')) || [])[1] || '';
      ok('ml_tester is in both APP_EXCLUDE_BOOT and APP_EXCLUDE', /ml_tester\$/.test(ex('APP_EXCLUDE_BOOT')) && /ml_tester\$/.test(ex('APP_EXCLUDE')), '');
      const fr = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
      ok('the new words have their French', ['New versions first (tester)', 'Version {v} is waiting — it arrives {when}.', 'Get it now', 'Updating…', 'tomorrow', 'in {n} h'].every(k => fr.includes(JSON.stringify(k)) || fr.includes('"' + k + '"') || fr.includes("'" + k + "'")), '');
    } catch (e) { ok('browser part ran to the end', false, e.message.slice(0, 300)); }
    ok('no console errors in the browser part', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
    if (browser) await browser.close();
  }
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
