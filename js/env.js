/* Market List — which Firebase project a page uses (v3.05, H2). Until now every Vercel preview (a *.vercel.app address
   that is not the live one) ran against the household's REAL database; a preview now gets its own, empty project.
   Pure functions — no imports; js/app.js passes in the hostname and the live config. */
export const LIVE_HOST = "grocery-app-2-sage.vercel.app";
/* a Vercel preview: any *.vercel.app address except the live one. Everything else — the live site, a custom domain, the
   phone app's own address, localhost and the test server — is NOT a preview and uses the config in index.html. */
export function isPreviewHost(hostname){ const h = String(hostname || "").toLowerCase();
  return h !== LIVE_HOST && /(^|\.)vercel\.app$/.test(h); }
/* the preview project's web config (public by design, like the live one in index.html). Its database is empty and its
   rules are firebase/firestore.rules, published by the owner on 13 Nov 2026. No App Check on this project. */
export const PREVIEW_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCR-DEsUI-h4RnhBSIr-Stivaa6nCb88HU",
  authDomain: "market-list-preview-fcccf.firebaseapp.com",
  projectId: "market-list-preview-fcccf",
  storageBucket: "market-list-preview-fcccf.firebasestorage.app",
  messagingSenderId: "161975178743",
  appId: "1:161975178743:web:f5de0b5fd203bad380caf2" };
export function firebaseConfigFor(hostname, liveConfig){ return isPreviewHost(hostname) ? PREVIEW_FIREBASE_CONFIG : liveConfig; }
