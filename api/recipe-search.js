// api/recipe-search.js — Vercel Node serverless function (CommonJS).
//
// Finds candidate recipes for a dish typed in the app, so a recipe can be started
// without leaving to a browser, copying a link and coming back.
//
// Contract:  POST /api/recipe-search  { q }
//            ->  { source: "web" | "model", results: [ { title, url, site, note } ] }
//            errors are { error, code }.
//
// TWO SOURCES, and the app is told which it got:
//   "web"   — a real web search, when SEARCH_API_KEY is set (Brave Search).
//             Each result has a url, which the app hands to /api/recipe to read.
//   "model" — no search key configured, so the recipe reader is asked for ideas
//             instead. These have no url: picking one asks the model to write the
//             recipe out. Useful, but it is NOT the web, and the app says so.
//
// Keys live in environment variables (Vercel Project Settings -> Environment
// Variables). They are never logged, never returned to the browser, and never
// embedded in any static asset. See docs/ai-setup.md.

const MAX_Q = 120;
const MAX_RESULTS = 8;
const FETCH_TIMEOUT_MS = 7000;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';
const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

// Same guard as api/recipe.js: a URL this endpoint hands back will be fetched by
// the server later, so nothing pointing inward may leave here. Duplicated rather
// than shared because each function deploys on its own.
function isBlockedHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
  }
  return false;
}
function publicUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (isBlockedHost(u.hostname)) return null;
  return u.toString();
}

function fail(res, status, code, error) {
  res.status(status).json({ error: error || 'Search failed', code });
}

async function braveSearch(q, key) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = BRAVE_URL + '?q=' + encodeURIComponent(q + ' recipe') + '&count=' + MAX_RESULTS;
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { 'accept': 'application/json', 'x-subscription-token': key },
    });
    if (!r.ok) return { code: r.status === 401 || r.status === 403 ? 'search_key' : 'search_failed' };
    const data = await r.json();
    const raw = (data && data.web && Array.isArray(data.web.results)) ? data.web.results : [];
    const results = [];
    for (const x of raw) {
      const u = publicUrl(x && x.url);
      if (!u) continue;
      let site = '';
      try { site = new URL(u).hostname.replace(/^www\./, ''); } catch (e) {}
      results.push({
        title: String((x && x.title) || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        url: u,
        site: site.slice(0, 40),
        note: String((x && x.description) || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120),
      });
      if (results.length >= MAX_RESULTS) break;
    }
    return { results };
  } catch (e) {
    return { code: 'search_failed' };
  } finally {
    clearTimeout(timer);
  }
}

const IDEA_SYSTEM = [
  'You suggest well-known recipes matching a dish the user named.',
  'Respond with a JSON object of exactly this shape: {"results": [ ... ]}.',
  'Each element has exactly these keys:',
  '  "title": string — the recipe name, e.g. "Classic beef goulash"',
  '  "note": string  — at most 12 words on what makes it different from the others',
  'Give between 3 and 6 distinct suggestions. Return only the JSON object.',
].join('\n');

async function modelIdeas(q, key) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'authorization': 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: IDEA_SYSTEM }, { role: 'user', content: q }],
        temperature: 0.4,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) return { code: 'upstream' };
    const data = await r.json();
    const reply = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string') return { code: 'upstream' };
    let parsed;
    try { parsed = JSON.parse(reply); } catch (e) { return { code: 'unreadable' }; }
    const raw = (parsed && Array.isArray(parsed.results)) ? parsed.results : null;
    if (!raw) return { code: 'unreadable' };
    const results = raw.map((x) => ({
      title: String((x && x.title) || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      url: '',
      site: '',
      note: String((x && x.note) || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    })).filter((x) => x.title).slice(0, MAX_RESULTS);
    return { results };
  } catch (e) {
    return { code: 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed', code: 'method' });
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { return fail(res, 400, 'bad_body', 'Invalid JSON body'); }
    }
    const q = (body && typeof body.q === 'string') ? body.q.trim().replace(/\s+/g, ' ') : '';
    if (!q) return fail(res, 400, 'missing', 'Nothing to search for');
    if (q.length > MAX_Q) return fail(res, 400, 'too_long', 'That is a very long search');

    const searchKey = process.env.SEARCH_API_KEY;
    if (searchKey) {
      const got = await braveSearch(q, searchKey);
      if (!got.code) {
        if (!got.results.length) return fail(res, 404, 'no_results', 'Nothing found for that');
        res.status(200).json({ source: 'web', results: got.results });
        return;
      }
      // A configured-but-rejected key is worth naming; anything else falls through
      // to the model so the feature still does something useful.
      if (got.code === 'search_key') return fail(res, 502, 'search_key', 'Web search rejected its key');
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return fail(res, 500, 'not_configured', 'Server not configured');

    const ideas = await modelIdeas(q, groqKey);
    if (ideas.code) return fail(res, 502, ideas.code, 'Search failed');
    if (!ideas.results.length) return fail(res, 404, 'no_results', 'Nothing found for that');
    res.status(200).json({ source: 'model', results: ideas.results });
  } catch (e) {
    return fail(res, 502, 'unexpected', 'Search failed');
  }
};
