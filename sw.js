/*
  Market List service worker (v2.15).

  Why it exists: the app has to open with no signal (in a supermarket) after iOS has closed it.
  Without a worker, a reload with no connection simply fails.

  What it caches (cache "ml-shell-1"): the page, the manifest, the two Outfit font files, the
  home-screen icons and the Firebase SDK, which now lives in the repo under /vendor/firebasejs/,
  so everything the app needs to start is same-origin.

  Two strategies:
  - The app's page ("/" or "/index.html", any query string such as "/?list=abc") is network first.
    A good answer within NAV_TIMEOUT_MS is used; a failure, an error page or the timeout falls back to
    the copy on the phone. A good answer that arrives later still refreshes that copy. It is always
    stored under "/index.html". Other pages (concept.html) come straight from the network and never
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
*/

const SHELL = "ml-shell-1";        // bump only if the meaning of the precache changes; old ml-* caches are deleted on activate
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/outfit-latin.woff2", "/outfit-latin-ext.woff2",
  "/img/icon-180.png", "/img/icon-192.png", "/img/icon-512.png",
  "/vendor/firebasejs/10.12.2/firebase-app.js", "/vendor/firebasejs/10.12.2/firebase-firestore.js"];
const NAV_TIMEOUT_MS = 4000;       // every wait ends: a slow network never holds the app back longer than this when a copy is on the phone

self.addEventListener("install", event => {
  self.skipWaiting();
  // Each file is added on its own, so one missing file never blocks the install;
  // cache: "reload" bypasses the HTTP cache.
  event.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("ml-") && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
  return fetch(event.request).then(r => {
    if (r && r.ok && r.type === "basic" && !r.redirected) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(key, copy)).then(done, done); }
    else done();
    return r;
  }, e => { done(); throw e; });
}

function pageResponse(event) {
  const net = fetchAndStore(event, "/index.html");
  const timeout = new Promise(res => setTimeout(res, NAV_TIMEOUT_MS, null));
  // A good network answer in time wins; a failure, an error page or the timeout falls back to the stored copy.
  return Promise.race([net.then(r => (r && r.ok) ? r : null, () => null), timeout])
    .then(r => r || caches.match("/index.html").then(hit => hit || caches.match("/")).then(hit => hit || net));
}

function assetResponse(event) {
  const net = fetchAndStore(event, event.request);
  net.catch(() => {});                                     // offline: the stored copy answers; the failed refresh is not an error
  return caches.match(event.request).then(hit => hit || net);
}
