// lib/guard.js — v2.39 (architecture review A1): who calls the AI functions, and how often.
// Every api/*.js function calls guard(req, name) first. Three env switches, all dormant by default:
//   API_AUTH — "log" (default): check a Firebase sign-in when one is sent, log calls without one, block nothing;
//              "require": a call without a valid sign-in gets 401; "off": skip the check.
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — when both are set, a daily count per phone
//              (QUOTA_<NAME> overrides a limit); without them there is no limit.
//   QUOTA_SALT / FIREBASE_PROJECT_ID — optional.
//   APP_CHECK — v2.50: "off" (default) skips it; "log": check a Firebase App Check token (X-Firebase-AppCheck) when one is
//              sent, log calls without a valid one; "require": such a call gets 401 code "appcheck" (not feedback).
//              FIREBASE_PROJECT_NUMBER — optional.
//   QUOTA_STORE — v2.53: where the daily count is kept. Unset: Upstash when its two variables are set, otherwise Firestore,
//              written AS THE CALLING PHONE (its own sign-in, never an admin key) into quota/{uid}/days/{day}, where the rules
//              let a phone only add one to its own count; "off": no count. Either store fails open (the call goes through).
// It never logs a token, an IP or anything from the request body.
const crypto = require('crypto');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'grocery-list-88109';   // public, like the web config
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certs = null, certsUntil = 0;
const PROJECT_NUMBER = process.env.FIREBASE_PROJECT_NUMBER || '237398844171';   // public, the web config's messagingSenderId
const JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
let jwks = null, jwksUntil = 0;
function _reset(){ certs = null; certsUntil = 0; jwks = null; jwksUntil = 0; }
async function getCerts(){ if (certs && Date.now() < certsUntil) return certs;
  const r = await fetch(CERTS_URL); if (!r.ok) throw new Error('certs ' + r.status);
  const j = await r.json(); const m = /max-age=(\d+)/.exec((r.headers && r.headers.get && r.headers.get('cache-control')) || '');
  certs = j; certsUntil = Date.now() + (m ? +m[1] * 1000 : 3600e3); return certs; }
const b64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
/* A Firebase ID token: RS256, signed by one of Google's published certificates, for this project, not expired. */
async function verifyIdToken(tok){ const p = String(tok || '').split('.'); if (p.length !== 3) return { err:'malformed' };
  let h, c; try { h = JSON.parse(b64u(p[0]).toString('utf8')); c = JSON.parse(b64u(p[1]).toString('utf8')); } catch (e) { return { err:'malformed' }; }
  if (!h || h.alg !== 'RS256' || !h.kid) return { err:'alg' };
  const now = Math.floor(Date.now() / 1000);
  if (c.aud !== PROJECT || c.iss !== 'https://securetoken.google.com/' + PROJECT) return { err:'audience' };
  if (!(typeof c.exp === 'number' && c.exp > now)) return { err:'expired' };
  if (typeof c.iat === 'number' && c.iat > now + 300) return { err:'future' };
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) return { err:'subject' };
  let cs; try { cs = await getCerts(); } catch (e) { return { err:'certs' }; }
  const pem = cs && cs[h.kid]; if (!pem) return { err:'kid' };
  let ok = false; try { ok = crypto.createVerify('RSA-SHA256').update(p[0] + '.' + p[1]).verify(pem, b64u(p[2])); } catch (e) { ok = false; }
  return ok ? { uid:c.sub } : { err:'signature' }; }
/* v2.50 App Check's public keys, cached 6 hours. */
async function getJwks(){ if (jwks && Date.now() < jwksUntil) return jwks;
  const r = await fetch(JWKS_URL); if (!r.ok) throw new Error('jwks ' + r.status);
  const j = await r.json(); jwks = j; jwksUntil = Date.now() + 6 * 3600e3; return jwks; }
/* A Firebase App Check token: RS256, signed by one of App Check's published keys, for this project, not expired. */
async function verifyAppCheck(tok){ const p = String(tok || '').split('.'); if (p.length !== 3) return { err:'malformed' };
  let h, c; try { h = JSON.parse(b64u(p[0]).toString('utf8')); c = JSON.parse(b64u(p[1]).toString('utf8')); } catch (e) { return { err:'malformed' }; }
  if (!h || !c || h.alg !== 'RS256' || (h.typ !== undefined && h.typ !== 'JWT') || !h.kid) return { err:'alg' };
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(c.aud) ? c.aud : [];
  if (c.iss !== 'https://firebaseappcheck.googleapis.com/' + PROJECT_NUMBER
    || !(aud.includes('projects/' + PROJECT_NUMBER) || aud.includes('projects/' + PROJECT))) return { err:'audience' };
  if (!(typeof c.exp === 'number' && c.exp > now)) return { err:'expired' };
  if (typeof c.sub !== 'string' || !c.sub) return { err:'malformed' };
  let ks; try { ks = await getJwks(); } catch (e) { return { err:'keys' }; }
  const jwk = ks && Array.isArray(ks.keys) && ks.keys.find(k => k && k.kid === h.kid); if (!jwk) return { err:'kid' };
  let ok = false; try { const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    ok = crypto.createVerify('RSA-SHA256').update(p[0] + '.' + p[1]).verify(key, b64u(p[2])); } catch (e) { ok = false; }
  return ok ? { app:c.sub } : { err:'signature' }; }
const LIMITS = { receipt:15, card:20, aisle:60, parse:200, recipe:60, 'recipe-search':60, feedback:30 };   // a day, per signed-in phone
function limitFor(fn){ const v = +process.env['QUOTA_' + fn.toUpperCase().replace(/-/g, '_')]; return v > 0 ? v : (LIMITS[fn] || 60); }
function ipKey(req){ const h = (req && req.headers) || {}; const ip = String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim() || 'unknown';
  return crypto.createHash('sha256').update((process.env.QUOTA_SALT || PROJECT) + '|' + ip).digest('hex').slice(0, 16); }   // never kept or logged as the address itself
/* The day's count in Upstash Redis, over its REST API — only when the owner has set it up; otherwise null (no limit). */
async function count(key){ const url = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !tok) return null;
  const r = await fetch(url.replace(/\/+$/, '') + '/pipeline', { method:'POST', headers:{ authorization:'Bearer ' + tok, 'content-type':'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, '93600']]) });
  if (!r.ok) throw new Error('store ' + r.status);
  const j = await r.json(); const n = +(Array.isArray(j) && j[0] && j[0].result); return Number.isFinite(n) ? n : null; }
/* v2.53 the daily count in Firestore, with the phone's own sign-in (and its App Check token, so it still works once App
   Check is enforced for Firestore). One write: add 1 to today's field for this function and read the new value back. The
   rules (firebase/firestore.rules, match /quota) allow exactly that — one field, up by one, on the phone's own document — so a
   phone can never lower or delete its count; a FRESH anonymous sign-in starts a fresh count (said out loud in the docs:
   App Check is what stops a script making those). Returns the new count; throws when the store cannot be reached or refuses. */
const FS_KEYS = { receipt:'receipt', card:'card', aisle:'aisle', parse:'parse', recipe:'recipe', 'recipe-search':'recipeSearch', feedback:'feedback' };
async function fsCount(fn, uid, idToken, appCheck, day){ const key = FS_KEYS[fn]; if (!key) return null;
  const name = `projects/${PROJECT}/databases/(default)/documents/quota/${uid}/days/${day}`;
  const headers = { authorization:'Bearer ' + idToken, 'content-type':'application/json' }; if (appCheck) headers['x-firebase-appcheck'] = appCheck;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`, { method:'POST', headers,
    body: JSON.stringify({ writes:[{ update:{ name, fields:{} }, updateMask:{ fieldPaths:[] }, updateTransforms:[{ fieldPath:key, increment:{ integerValue:'1' } }] }] }) });
  if (!r.ok) throw new Error('firestore ' + r.status);
  const j = await r.json(); const v = j && j.writeResults && j.writeResults[0] && j.writeResults[0].transformResults && j.writeResults[0].transformResults[0];
  const n = v ? +(v.integerValue != null ? v.integerValue : v.doubleValue) : NaN; if (!Number.isFinite(n)) throw new Error('firestore reply'); return n; }
/* API_AUTH: "log" (default) — check a sign-in when one is sent, log the calls without one, block nothing;
   "require" — a call without a valid sign-in gets 401 code "signin" (not feedback: a crash report may come from a phone that never signed in);
   "off" — skip the check. */
async function guard(req, fn){ const mode = String(process.env.API_AUTH || 'log').toLowerCase();
  const h = (req && req.headers) || {}; const m = /^Bearer\s+(\S+)$/i.exec(String(h.authorization || h.Authorization || ''));
  let uid = '', why = '';
  if (mode !== 'off') { if (m) { const v = await verifyIdToken(m[1]); if (v.uid) uid = v.uid; else why = v.err; } else why = 'none'; }
  if (!uid && why) { console.log(`[guard] ${fn}: unsigned (${why})`);
    if (mode === 'require' && fn !== 'feedback') return { block:true, status:401, code:'signin', error:'Sign-in needed' }; }
  /* v2.50 App Check, after the sign-in and before the count. Never logs the token. */
  const acMode = String(process.env.APP_CHECK || 'off').toLowerCase();
  if (acMode !== 'off') { const act = String(h['x-firebase-appcheck'] || h['X-Firebase-AppCheck'] || ''); let acWhy = 'none';
    if (act) { const v = await verifyAppCheck(act); acWhy = v.app ? '' : v.err; }
    if (acWhy) { console.log(`[guard] ${fn}: no app check (${acWhy})`);
      if (acMode === 'require' && fn !== 'feedback') return { block:true, status:401, code:'appcheck', error:'App check failed' }; } }
  const day = new Date().toISOString().slice(0, 10);
  const lim = uid ? limitFor(fn) : limitFor(fn) * 3;   // without a sign-in, a whole household's network shares one count
  const store = String(process.env.QUOTA_STORE || '').toLowerCase(), upstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  try { const n = store === 'off' ? null
      : (!upstash && uid && m) ? await fsCount(fn, uid, m[1], String(h['x-firebase-appcheck'] || h['X-Firebase-AppCheck'] || ''), day)   // v2.53
      : await count(`q:${fn}:${uid ? 'u:' + uid : 'ip:' + ipKey(req)}:${day}`);
    if (n !== null && n > lim) { console.log(`[guard] ${fn}: over the daily limit`); return { block:true, status:429, code:'quota', error:'Daily limit reached' }; } }
  catch (e) { console.log(`[guard] ${fn}: quota store unavailable`); }   // fail open: the limit is a guard rail, not the feature
  return { block:false, uid }; }
/* v2.49 (architecture review S13): the future iPhone/Android app's page lives at its shell's own origin, so its calls are
   cross-origin — answer them (and their OPTIONS preflight) for those origins only. The website is same-origin and needs nothing.
   Returns true when the request was a preflight and has been answered. */
const CORS_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'];
function cors(req, res){ const h = (req && req.headers) || {}; const origin = h.origin || h.Origin || '';
  const ok = CORS_ORIGINS.includes(origin);
  if (ok && typeof res.setHeader === 'function') {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-firebase-appcheck');
    res.setHeader('Access-Control-Max-Age', '600'); }
  if (req && req.method === 'OPTIONS') { const r = res.status(ok ? 204 : 403); if (r && typeof r.end === 'function') r.end(); else if (r && typeof r.json === 'function') r.json({}); return true; }
  return false; }
module.exports = { guard, cors, verifyIdToken, verifyAppCheck, fsCount, _reset };
