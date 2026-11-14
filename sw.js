/*
  Market List service worker (v2.15; versioned files since v2.19).

  Why it exists: the app has to open with no signal (in a supermarket) after iOS has closed it.
  Without a worker, a reload with no connection simply fails.

  What it caches (cache "ml-shell-1"): the page, the manifest, the two Outfit font files, the
  home-screen icons and the Firebase SDK, which now lives in the repo under /vendor/firebasejs/,
  so everything the app needs to start is same-origin. Since v2.19 also the stylesheet, the app module
  and its two data modules, all under versioned URLs (?v=<version>) that change with every release,
  so a new page never meets an old file. A release therefore changes this file: the new worker
  fetches only the new versioned files (plus the page and the manifest, always re-fetched) and drops
  the previous release's ones on activate.

  Two strategies:
  - The app's page ("/" or "/index.html", any query string such as "/?list=abc") is network first.
    A good answer within NAV_TIMEOUT_MS is used; a failure, an error page or the timeout falls back to
    the copy on the phone. A good answer that arrives later still counts. It is stored under "/index.html" —
    since v3.20 only when it is the same version or the staged-release hold allows it (below); otherwise the phone
    keeps serving its stored page. Other pages (concept.html) come straight from the network and never
    replace the app's stored copy.
  - Everything else same-origin (fonts, icons, the Firebase SDK, the manifest) answers from the copy
    on the phone at once, and the network refreshes that copy in the background, so a changed file
    arrives on the next open instead of never.

  Never touched: /api/* (the server functions), anything that is not a GET, anything cross-origin
  (Firestore), and /sw.js itself.

  Under test automation (navigator.webdriver) the app does not register this worker unless a suite
  sets localStorage "ml_swtest" to "1", because Playwright 1.56 cannot stub a worker's own requests.

  Kill switch: to switch the worker off on every phone, replace this whole file with

    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))
      .then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate(c.url)))));

  and deploy; the next time each phone opens the app with signal, the worker removes itself and
  its caches.

  Staged releases (v3.20): a new version reaches the phone marked as the tester (Settings › Help › New versions
  first) at once; every other phone keeps the page it has for HOLD_MS (24 hours) after it first sees a newer one (a release on top
  of a waiting one keeps that clock),
  so a bad release shows on one phone first. The new versioned files are precached meanwhile, so the switch is
  instant when the hold ends. An urgent fix skips the hold with <meta name="ml-release" content="now"> in
  index.html's <head>. The app sends "release" (the next open takes the new version) when a newer app's data
  arrives or the person taps Get it now. What the worker remembers (tester, the waiting version) is one entry
  in the cache "ml-meta". The kill switch above is unchanged and still removes everything, ml-meta included.
*/

const SHELL = "ml-shell-1";        // bump only if the meaning of the precache changes; old ml-* caches are deleted on activate
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/outfit-latin.woff2", "/outfit-latin-ext.woff2",
  "/img/icon-180.png", "/img/icon-192.png", "/img/icon-512.png",
  "/vendor/firebasejs/10.12.2/firebase-app.js", "/vendor/firebasejs/10.12.2/firebase-firestore.js", "/vendor/firebasejs/10.12.2/firebase-auth.js", "/vendor/firebasejs/10.12.2/firebase-app-check.js",
  "/app.css?v=3.21", "/js/app.js?v=3.21", "/js/data/catalog.js?v=3.21", "/js/data/drawings.js?v=3.21", "/js/tenpct.js?v=3.21", "/js/compare.js?v=3.21", "/js/shared.js?v=3.21", "/js/spend.js?v=3.21", "/js/aisles.js?v=3.21", "/js/till.js?v=3.21", "/js/platform.js?v=3.21", "/js/amounts.js?v=3.21", "/js/i18n.js?v=3.21", "/js/parse.js?v=3.21", "/js/merge.js?v=3.21", "/js/store.js?v=3.21", "/js/photos.js?v=3.21", "/js/cards.js?v=3.21", "/js/env.js?v=3.21"];
const PRECACHE_V = (PRECACHE.find(u => u.includes("?v=")) || "").split("?v=")[1] || "";   // this release's version
const HOLD_MS = 24 * 3600 * 1000;  // v3.20: how long a non-tester phone keeps its page after a new version is first seen
const META = "ml-meta", META_KEY = "/__ml/meta";   // the worker cannot read localStorage; its settings live here
const NAV_TIMEOUT_MS = 4000;       // every wait ends: a slow network never holds the app back longer than this when a copy is on the phone

// v3.20: the page ("/", "/index.html") is no longer re-fetched on install — that would replace a held page at once;
// it is added only when missing (first install) and otherwise goes through decide() on the next open.
const ALWAYS = new Set(["/manifest.webmanifest"]);   // re-fetched on every install; the rest only when missing
self.addEventListener("install", event => {
  self.skipWaiting();
  // Each file is added on its own, so one missing file never blocks the install; cache: "reload" bypasses the HTTP cache.
  event.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u =>
    (ALWAYS.has(u) ? Promise.resolve(undefined) : c.match(u)).then(hit => hit || c.add(new Request(u, { cache: "reload" })).catch(() => {}))))));
});

self.addEventListener("activate", event => {
  // v3.20: ml-meta survives; so do the files of the page the phone is holding (its own ?v=).
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("ml-") && k !== SHELL && k !== META).map(k => caches.delete(k))))
    .then(() => caches.open(SHELL)).then(c => storedPageText(c).then(txt => pruneVersioned(c, pageVer(txt))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;                       // POSTs (the api, Firestore) pass straight through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // Firestore, anything cross-origin: untouched
  if (url.pathname.startsWith("/api/")) return;            // never cache the server functions
  if (url.pathname === "/sw.js") return;
  if (url.pathname === "/" || url.pathname === "/index.html") { event.respondWith(pageResponse(event)); return; }
  if (req.mode === "navigate") return;                     // other pages: straight from the network, never stored as the app
  event.respondWith(assetResponse(event));
});

// Fetches, and stores a good same-origin answer under `key`. The event is kept alive until the copy is
// stored, which may be after the response was already answered from the phone's copy.
function fetchAndStore(event, key) {
  let done; event.waitUntil(new Promise(res => { done = res; }));
  // v3.20: a versioned URL of another release is never stored. Vercel ignores the query, so fetching an old ?v= gets
  // the NEW file; storing it under the old URL would pair the held (old) page with a new file on every later open.
  const v = new URL(event.request.url).searchParams.get("v");
  const storable = v === null || v === PRECACHE_V;
  return fetch(event.request).then(r => {
    if (storable && r && r.ok && r.type === "basic" && !r.redirected) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(key, copy)).then(done, done); }
    else done();
    return r;
  }, e => { done(); throw e; });
}

// v3.20 staged releases. Plain top-level functions so a Node suite can load this file in a vm and call them.
function pageVer(txt) { return (String(txt).match(/js\/app\.js\?v=([0-9.]+)/) || [])[1] || ""; }
function urgent(txt) { return /<meta name="ml-release" content="now">/.test(String(txt)); }
// → { act: "take" | "hold", pend } — pend is what meta.pend becomes on "hold".
function decide(newTxt, storedTxt, meta, now) {
  meta = meta || {};
  const newV = pageVer(newTxt), oldV = pageVer(storedTxt), pend = meta.pend;
  if (!storedTxt || !oldV || !newV || newV === oldV || meta.tester || urgent(newTxt)
      || meta.release === "*" || meta.release === newV
      || (pend && now - pend.since >= HOLD_MS)) return { act: "take", pend: null };
  // The wait counts from the FIRST newer version this phone saw: a release on top of a waiting one keeps the clock,
  // or a household that ships several times a day would never leave its old version.
  return { act: "hold", pend: { ver: newV, since: pend ? pend.since : now } };
}

function metaGet() {
  return caches.open(META).then(c => c.match(META_KEY)).then(r => r ? r.json() : {}).then(o => (o && typeof o === "object") ? o : {}, () => ({}));
}
function metaPut(o) {
  return caches.open(META).then(c => c.put(META_KEY, new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } }))).catch(() => {});
}
function storedPageText(c) {
  return c.match("/index.html").then(h => h || c.match("/")).then(h => h ? h.text() : "").catch(() => "");
}
// Deletes versioned entries that are neither this release's (PRECACHE) nor `keepV`.
function pruneVersioned(c, keepV) {
  return c.keys().then(reqs => Promise.all(reqs.filter(r => { const u = new URL(r.url), v = u.searchParams.get("v");
    return v !== null && !PRECACHE.includes(u.pathname + u.search) && !(keepV && v === keepV); }).map(r => c.delete(r))));
}
// The held page can be served only if its own files are all on the phone. Counted against this release's
// PRECACHE, so a release that ADDS a module goes out at once (the old page has fewer files) — the safe side.
function heldFilesReady(c, oldV) {
  const need = PRECACHE.filter(u => u.includes("?v=")).length;
  return c.keys().then(reqs => {
    const mine = reqs.map(r => new URL(r.url)).filter(u => u.searchParams.get("v") === oldV).map(u => u.pathname);
    return mine.includes("/app.css") && mine.includes("/js/app.js") && mine.length >= need;
  }).catch(() => false);
}
// A copy of a good page answer that can be both stored and served (its body was read to decide).
function pageCopy(txt, r) {
  const h = new Headers(r.headers); h.delete("content-encoding"); h.delete("content-length");   // the text is already decoded
  return new Response(txt, { headers: h, status: r.status, statusText: r.statusText });
}
// Decides about a good network page, stores accordingly and resolves to the response to serve.
function settlePage(txt, r) {
  return caches.open(SHELL).then(c => Promise.all([storedPageText(c), metaGet()]).then(([stored, meta]) => {
    const d = decide(txt, stored, meta, Date.now()), oldV = pageVer(stored);
    return (d.act === "hold" ? heldFilesReady(c, oldV) : Promise.resolve(false)).then(ready => {
      if (d.act === "hold" && ready) {
        meta.pend = d.pend;
        return metaPut(meta).then(() => c.match("/index.html").then(h => h || c.match("/"))).then(h => h || pageCopy(txt, r));
      }
      meta.pend = null; meta.release = "";
      const newV = pageVer(txt);
      return c.put("/index.html", pageCopy(txt, r)).then(() => metaPut(meta))
        .then(() => (newV && newV !== oldV) ? pruneVersioned(c, newV) : null).catch(() => {}).then(() => pageCopy(txt, r));
    });
  }));
}

function pageResponse(event) {
  let done; event.waitUntil(new Promise(res => { done = res; }));
  // The late answer (after the timeout) goes through the same settlePage: it updates the stored copy or the
  // waiting version, and is simply not served. A non-ok or redirected answer is never stored (as before v3.20).
  const raw = fetch(event.request);
  const net = raw.then(r => (r && r.ok && r.type === "basic" && !r.redirected)
    ? r.clone().text().then(txt => settlePage(txt, r)).catch(() => r)
    : r);
  net.then(done, done);
  const timeout = new Promise(res => setTimeout(res, NAV_TIMEOUT_MS, null));
  // A good network answer in time wins; a failure, an error page or the timeout falls back to the stored copy.
  return Promise.race([net.then(r => (r && r.ok) ? r : null, () => null), timeout])
    .then(r => r || caches.match("/index.html").then(hit => hit || caches.match("/")).then(hit => hit || raw));
}

self.addEventListener("message", event => {
  const d = event.data || {}, port = event.ports && event.ports[0];
  const reply = o => { try { if (port) port.postMessage(o); } catch (e) {} };
  let job;
  if (d.t === "cfg") job = metaGet().then(m => { m.tester = !!d.tester; return metaPut(m); }).then(() => reply({ ok: true }));
  else if (d.t === "status") job = Promise.all([caches.open(SHELL).then(storedPageText), metaGet()])
    .then(([txt, m]) => reply({ cur: pageVer(txt), pend: m.pend || null, holdMs: HOLD_MS }));
  else if (d.t === "release") job = metaGet().then(m => { m.release = m.pend ? m.pend.ver : "*"; return metaPut(m); }).then(() => reply({ ok: true }));
  else return;
  event.waitUntil(job.catch(() => reply({ ok: false })));
});

function assetResponse(event) {
  const net = fetchAndStore(event, event.request);
  net.catch(() => {});                                     // offline: the stored copy answers; the failed refresh is not an error
  return caches.match(event.request).then(hit => hit || net);
}
