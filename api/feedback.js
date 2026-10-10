// api/feedback.js — Vercel Node serverless function (CommonJS). v2.13.
//
// "Report a problem": a short note from the household, sent to the developer as a GitHub issue when
// a token is configured, and written to the server log otherwise.
//
// Contract:  POST /api/feedback  { kind, text, diag }
//            kind  one of "broken", "looks", "idea", "complaint"
//            text  1–2000 characters after trimming
//            diag  optional { version, page, layout, icons, theme, screen, ua } — anything else is dropped
//            ->  { ok: true, via: "github" | "log", ref? }   (ref is the issue number)
//            errors are { error, code }: method, bad_request, unexpected.
//
// Env: FEEDBACK_GITHUB_TOKEN and FEEDBACK_REPO ("owner/name"). Both are read per request. The token
// never appears in a log line, a response or a URL. Request headers and the IP are never logged; the
// note itself is meant for the developer, so the log path writes it — and nothing else from the request.

const KINDS = ['broken', 'looks', 'idea', 'complaint'];
const LABELS = { broken: 'Broken', looks: 'Looks wrong', idea: 'Idea', complaint: 'Complaint' };
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

async function toGithub(token, repo, kind, text, diag) {
  const first = (text.split('\n').map(l => l.trim()).find(Boolean) || '').slice(0, 70);   // the first line with words on it
  const title = '[' + LABELS[kind] + '] ' + first;
  const lines = Object.keys(diag).filter(k => diag[k]).map(k => k + ': ' + diag[k]);
  const body = text + '\n\n---\n' + lines.join('\n');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GITHUB_TIMEOUT_MS);
  try {
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
