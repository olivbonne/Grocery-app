// api/feedback.js — Vercel Node serverless function (CommonJS). v2.13.
//
// "Report a problem": a short note from the household, sent to the developer as a GitHub issue when
// a token is configured, and written to the server log otherwise.
//
// Contract:  POST /api/feedback  { kind, text, diag }
//            kind  one of "broken", "looks", "idea", "complaint", "crash"
//                  "crash" is sent by the app itself when it hits an error (v2.15) — version, page, the
//                  error's first line — never the list.
//            text  1–2000 characters after trimming
//            diag  optional { version, page, layout, icons, theme, screen, ua } — anything else is dropped
//            ->  { ok: true, via: "github" | "log", ref? }   (ref is the issue number)
//            errors are { error, code }: method, bad_request, unexpected.
//
// Env: FEEDBACK_GITHUB_TOKEN and FEEDBACK_REPO ("owner/name"). Both are read per request. The token
// never appears in a log line, a response or a URL. Request headers and the IP are never logged; the
// note itself is meant for the developer, so the log path writes it — and nothing else from the request.

const { guard } = require('../lib/guard.js');
const KINDS = ['broken', 'looks', 'idea', 'complaint', 'crash'];
const LABELS = { broken: 'Broken', looks: 'Looks wrong', idea: 'Idea', complaint: 'Complaint', crash: 'Crash' };
const DIAG_KEYS = ['version', 'page', 'layout', 'icons', 'theme', 'screen', 'ua'];
const MAX_TEXT = 2000;
const GITHUB_TIMEOUT_MS = 10000;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function fail(res, status, code, error) {
  res.status(status).json({ error, code });
}

function cleanDiag(d) {
  const out = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  for (const k of DIAG_KEYS) {
    if (d[k] === undefined || d[k] === null) continue;
    out[k] = String(d[k]).trim().slice(0, 120);
  }
  return out;
}

/* v2.46 (the household's item D, error monitoring): the same crash from many phones used to open a new issue every time.
   Each crash now carries a short signature — its first line with numbers taken out, hashed — and a crash whose
   signature already has an open issue is added to it as a comment ("happened again"), so the issues list reads as one
   line per problem, with how often it happens. Nothing else changes: the list of open crash issues is read with the
   same token, and if that read fails the crash simply opens a new issue as before. */
const crypto = require('crypto');
function crashSig(text) { const first = (text.split('\n').map(l => l.trim()).find(Boolean) || '').replace(/\d+/g, '#').slice(0, 200);
  return crypto.createHash('sha256').update(first).digest('hex').slice(0, 10); }
const ghHeaders = (token, json) => Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'market-list-feedback' }, json ? { 'Content-Type': 'application/json' } : {});
async function openCrashIssue(token, repo, sig, signal) {
  try {
    const r = await fetch('https://api.github.com/repos/' + repo + '/issues?labels=crash&state=open&per_page=100', { headers: ghHeaders(token), signal });
    if (!r.ok) return 0;
    const list = await r.json();
    if (!Array.isArray(list)) return 0;
    const hit = list.find(i => i && typeof i.title === 'string' && i.title.endsWith('· sig:' + sig) && Number.isInteger(i.number));
    return hit ? hit.number : 0;
  } catch (e) { return 0; }
}

async function toGithub(token, repo, kind, text, diag) {
  const first = (text.split('\n').map(l => l.trim()).find(Boolean) || '').slice(0, 70);   // the first line with words on it
  const sig = kind === 'crash' ? crashSig(text) : '';
  const title = '[' + LABELS[kind] + '] ' + first + (sig ? ' · sig:' + sig : '');
  const lines = Object.keys(diag).filter(k => diag[k]).map(k => k + ': ' + diag[k]);
  const body = text + '\n\n---\n' + lines.join('\n');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GITHUB_TIMEOUT_MS);
  try {
    if (sig) {
      const n = await openCrashIssue(token, repo, sig, ctl.signal);
      if (n) {
        const c = await fetch('https://api.github.com/repos/' + repo + '/issues/' + n + '/comments', {
          method: 'POST', headers: ghHeaders(token, true), signal: ctl.signal,
          body: JSON.stringify({ body: 'Happened again.\n\n---\n' + lines.join('\n') + '\nat: ' + new Date().toISOString() }) });
        if (c.ok) return { ref: n, again: true };
        console.error('feedback github comment ' + c.status);   // fall through: open a new issue instead
      }
    }
    const r = await fetch('https://api.github.com/repos/' + repo + '/issues', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'market-list-feedback',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: ['from-app', kind] }),
      signal: ctl.signal,
    });
    if (!r.ok) {
      console.error('feedback github ' + r.status);
      return null;
    }
    let ref;
    try {
      const j = await r.json();
      if (j && Number.isInteger(j.number) && j.number > 0) ref = j.number;
    } catch (e) {}
    return { ref };
  } catch (e) {
    console.error('feedback github ' + (ctl.signal.aborted ? 'timed out' : 'net fail'));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return fail(res, 405, 'method', 'Method not allowed');
    const gate = await guard(req, 'feedback');   // v2.39 (architecture review A1): who is calling, and how often — see lib/guard.js
    if (gate.block) return fail(res, gate.status, gate.code, gate.error);

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { return fail(res, 400, 'bad_request', 'Invalid JSON body'); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'bad_request', 'Invalid body');

    const kind = body.kind;
    if (!KINDS.includes(kind)) return fail(res, 400, 'bad_request', 'Unknown kind');
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return fail(res, 400, 'bad_request', 'Missing text');
    if (text.length > MAX_TEXT) return fail(res, 400, 'bad_request', 'Text too long');
    const diag = cleanDiag(body.diag);

    const token = process.env.FEEDBACK_GITHUB_TOKEN;
    const repo = process.env.FEEDBACK_REPO;
    const repoOk = !!repo && REPO_RE.test(repo) && !repo.split('/').some(p => p === '.' || p === '..');
    if (token && repo && !repoOk) console.error('feedback repo invalid');   // a typo in FEEDBACK_REPO, not "not configured"
    if (token && repoOk) {
      const g = await toGithub(token, repo, kind, text, diag);
      if (g) {
        const out = { ok: true, via: 'github' };
        if (g.ref) out.ref = g.ref;
        return res.status(200).json(out);
      }
    }

    console.log('[feedback] ' + JSON.stringify({ kind, text, diag, at: new Date().toISOString() }));
    return res.status(200).json({ ok: true, via: 'log' });
  } catch (e) {
    console.error('feedback unexpected ' + (e && e.name));
    return fail(res, 500, 'unexpected', 'Something went wrong');
  }
};
