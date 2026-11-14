/* lib/report.js — v3.11 (H3): a server failure is written down where it lasts. Vercel keeps its log for an hour; a failure of
   an AI function (5xx: the provider down or out of quota, a timeout, a missing setting) becomes ONE GitHub issue per function
   and error code, label `server-failure`, and each later occurrence a "Happened again" comment — at most one per 30 minutes per
   server instance. It holds the function, the code, the HTTP status, the time, the region and the deployment: never what the
   phone sent, what the AI read, a uid, an address or a key. Uses FEEDBACK_GITHUB_TOKEN / FEEDBACK_REPO like Report a problem;
   SERVER_REPORTS=off switches it off. A client mistake (4xx), a photo it could not read (`unreadable`) and a link the person sent
   that could not be read (`fetch_failed`, `no_caption`, `not_a_page`) are not failures and are never reported — so a caller
   cannot make issues by sending junk. */

const SKIP_CODES = new Set(['unreadable', 'fetch_failed', 'no_caption', 'not_a_page']);   // the photo or the link the person sent, not the server
const THROTTLE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 3000;
const _last = new Map();   // "fn/code" → time of this instance's last report
const SAFE = /^[a-z_]{1,32}$/;

const ghHeaders = (token, json) => Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'market-list-feedback' }, json ? { 'Content-Type': 'application/json' } : {});

async function reportFailure(fn, status, code) {
  if (!(status >= 500)) return false;
  if (SKIP_CODES.has(code)) return false;
  if (process.env.SERVER_REPORTS === 'off') return false;
  const token = process.env.FEEDBACK_GITHUB_TOKEN;
  const repo = process.env.FEEDBACK_REPO;
  if (!token || !repo) return false;
  if (typeof fn !== 'string' || !SAFE.test(fn)) return false;
  if (typeof code !== 'string' || !SAFE.test(code)) code = 'other';

  const sig = fn + '/' + code;
  if (Date.now() - (_last.get(sig) || 0) < THROTTLE_MS) return false;
  if (_last.size > 200) _last.clear();
  _last.set(sig, Date.now());

  const when = new Date().toISOString();
  const facts = [
    '- function: ' + fn,
    '- code: ' + code,
    '- HTTP status: ' + status,
    '- when: ' + when,
    '- region: ' + (process.env.VERCEL_REGION || '?'),
    '- deployment: ' + (process.env.VERCEL_GIT_COMMIT_SHA || '?').slice(0, 7),
  ].join('\n');
  const base = 'https://api.github.com/repos/' + repo + '/issues';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let reason = 'net fail';
  try {
    const r = await fetch(base + '?labels=server-failure&state=open&per_page=100', { headers: ghHeaders(token), signal: ctl.signal });
    if (!r.ok) { reason = String(r.status); throw 0; }
    const list = await r.json();
    const hit = Array.isArray(list)
      ? list.find(i => i && typeof i.title === 'string' && i.title.endsWith(' · sig:' + sig) && Number.isInteger(i.number))
      : null;
    if (hit) {
      const c = await fetch(base + '/' + hit.number + '/comments', {
        method: 'POST', headers: ghHeaders(token, true), signal: ctl.signal,
        body: JSON.stringify({ body: 'Happened again: ' + when + '\n\n' + facts }) });
      if (!c.ok) { reason = String(c.status); throw 0; }
      return true;
    }
    const n = await fetch(base, {
      method: 'POST', headers: ghHeaders(token, true), signal: ctl.signal,
      body: JSON.stringify({
        title: '[Server] ' + fn + ': ' + code + ' · sig:' + sig,
        labels: ['server-failure'],
        body: 'A server function failed. This issue collects every time it happens — each comment is one more.\n\n' + facts +
          '\n\nSeen in Vercel\'s log too for an hour: search for the function name.',
      }) });
    if (!n.ok) { reason = String(n.status); throw 0; }
    return true;
  } catch (e) {
    if (ctl.signal.aborted) reason = 'timed out';
    console.error('[report] ' + fn + '/' + code + ': ' + reason);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function _reset() { _last.clear(); }

module.exports = { reportFailure, _reset, SKIP_CODES, THROTTLE_MS };
