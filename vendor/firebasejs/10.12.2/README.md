# Firebase JS SDK 10.12.2 — kept in the repo (v2.15)

The two files the app imports, so the app opens without signal (the service worker caches them with
the page) and no third party sees each app load. Before v2.15 they came from
`https://www.gstatic.com/firebasejs/10.12.2/`.

Source: the npm package `firebase@10.12.2` (Apache-2.0, Copyright Google LLC — the licence header is
kept at the top of each file). These are its CDN builds, `package/firebase-app.js` and
`package/firebase-firestore.js`.

- `firebase-app.js` — byte-identical to the package file
  (sha256 `08b83f02859328aabb9acea9370d600ffe739d9e2c251b6668b6f6ff56a2e1d1`).
- `firebase-firestore.js` — one change: its import of
  `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js` points at `./firebase-app.js`
  (package file sha256 `aecb2b5b722d1a45426326cd144bc025d5bea8c48f3a53eca3914ad587361bd4`).

The `gstatic.com` strings left inside `firebase-app.js` are only names it gives itself for version
logging; nothing is fetched from them.

To upgrade: `npm pack firebase@X.Y.Z`, copy the two files into `vendor/firebasejs/X.Y.Z/`, repeat the
one import rewrite, point the two `import` lines in `index.html` and the precache list in `sw.js` at
the new folder, and keep the old folder until the release after (a phone may still be running it).
