// lib/guard.js — v2.39 (architecture review A1): who calls the AI functions, and how often.
// Every api/*.js function calls guard(req, name) first. Three env switches, all dormant by default:
//   API_AUTH — "log" (default): check a Firebase sign-in when one is sent, log calls without one, block nothing;
//              "require": a call without a valid sign-in gets 401; "off": skip the check.
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — when both are set, a daily count per phone
//              (QUOTA_<NAME> overrides a limit); without them there is no limit.
//   QUOTA_SALT / FIREBASE_PROJECT_ID — optional.
// It never logs a token, an IP or anything from the request body.
const crypto = require('crypto');
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'grocery-list-88109';   // public, like the web config
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certs = null, certsUntil = 0;
function _reset(){ certs = null; certsUntil = 0; }
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
/* API_AUTH: "log" (default) — check a sign-in when one is sent, log the calls without one, block nothing;
   "require" — a call without a valid sign-in gets 401 code "signin" (not feedback: a crash report may come from a phone that never signed in);
   "off" — skip the check. */
async function guard(req, fn){ const mode = String(process.env.API_AUTH || 'log').toLowerCase();
  const h = (req && req.headers) || {}; const m = /^Bearer\s+(\S+)$/i.exec(String(h.authorization || h.Authorization || ''));
  let uid = '', why = '';
  if (mode !== 'off') { if (m) { const v = await verifyIdToken(m[1]); if (v.uid) uid = v.uid; else why = v.err; } else why = 'none'; }
  if (!uid && why) { console.log(`[guard] ${fn}: unsigned (${why})`);
    if (mode === 'require' && fn !== 'feedback') return { block:true, status:401, code:'signin', error:'Sign-in needed' }; }
  const day = new Date().toISOString().slice(0, 10);
  const lim = uid ? limitFor(fn) : limitFor(fn) * 3;   // without a sign-in, a whole household's network shares one count
  try { const n = await count(`q:${fn}:${uid ? 'u:' + uid : 'ip:' + ipKey(req)}:${day}`);
    if (n !== null && n > lim) { console.log(`[guard] ${fn}: over the daily limit`); return { block:true, status:429, code:'quota', error:'Daily limit reached' }; } }
  catch (e) { console.log(`[guard] ${fn}: quota store unavailable`); }   // fail open: the limit is a guard rail, not the feature
  return { block:false, uid }; }
module.exports = { guard, verifyIdToken, _reset };
