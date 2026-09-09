// api/recipe-search.js — Vercel Node serverless function (CommonJS).
//
// Finds candidate recipes for a dish typed in the app, so a recipe can be started
// without leaving to a browser, copying a link and coming back.
//
// Contract:  POST /api/recipe-search  { q, scope?: "web" | "tiktok" }
//            ->  { source: "web" | "model", provider, results: [ { title, url, site, note } ] }
//            errors are { error, code }.
//
// TWO SOURCES, and the app is told which it got:
//   "web"   — a real web search, when a search key is set (TAVILY_API_KEY, SERPER_API_KEY
//             or SEARCH_API_KEY for Brave, in that order); `provider` names which answered.
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
const MODEL_BUDGET_MS = 20000;  // smaller than the others: this endpoint also spends time on the web search

/* v1.96: three search backends, one shape. Brave's free tier asks for a credit card, which is a
   hard stop for a household app, so Tavily (1,000/month) and Serper (2,500 on signup) — both free
   without a card — are first-class alongside it. Whichever key is present wins, in that order.
   Google's Custom Search JSON API is deliberately absent: it is closed to new signups and shuts
   down on 2027-01-01, so building on it would be building on sand. */
function searchProvider() {
  const tav = process.env.TAVILY_API_KEY;
  if (tav) return { name: 'tavily', key: tav };
  const ser = process.env.SERPER_API_KEY;
  if (ser) return { name: 'serper', key: ser };
  const brave = process.env.SEARCH_API_KEY;
  if (brave) return { name: 'brave', key: brave };
  return null;
}

/* v1.92: two providers, one shape. Groq and Gemini both speak the OpenAI chat-completions API, so
   the only things that differ are the URL, the key and the model name. Gemini is chosen when its
   key is set, because a key someone went and created is the one they meant to use.

   Both model names are env vars. v1.91 was the lesson: Groq retired llama-3.1-8b-instant on
   2026-08-16 and took every AI feature down with it because the name was compiled in. Providers
   retire models on their own schedule and this app should survive it as a settings change. */
function aiProvider() {
  const gem = process.env.GEMINI_API_KEY;
  if (gem) {
    /* v1.93: Flash-Lite, not the newest Flash. gemini-3.8-flash was five days old and answering
       "This model is currently experiencing high demand" to most calls, and its free tier allows
       20 requests a day against Flash-Lite's 500 — a grocery list parsed a few times an evening
       runs out on the former and never touches the latter. Flash-Lite is multimodal too, so the
       photo path keeps working, and it is built for exactly this: small, structured extraction.
       Point GEMINI_MODEL at something larger if you ever want the accuracy instead. */
    const m = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    return {
      name: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: gem,
      model: m,
      /* Gemini is natively multimodal — the same model reads a photo, so there is no separate
         vision model to configure and no separate way for the photo path to be unavailable. */
      vision: m,
      modelVar: 'GEMINI_MODEL',
    };
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: groq,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      /* Groq's image-capable line-up changes separately from its text one — Llama 4 Scout was
         deprecated for free/developer tiers in June 2026 — so vision is its own setting here. */
      vision: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      modelVar: 'GROQ_MODEL',
    };
  }
  return null;
}

/* v1.92: providers word "that model is gone" differently — Groq says model_decommissioned, Google
   says "is not found for API version v1beta". Both mean the same thing to whoever has to fix it, so
   both have to reach the same message: point at the model setting, not at a generic failure. Getting
   this wrong is not cosmetic — it is the difference between a one-line fix and another three weeks. */
const MODEL_GONE = /model_decommissioned|model_not_found|decommissioned|does not exist|is not found for API version|unsupported model|invalid model|not supported for this API/i;

/* v1.93: a 503 from a model is not a failure, it is "not right now" — and the app was showing it
   as "couldn't read that", which blames the input for a queue. Retried with backoff, then named.
   Only where a retry can help: overload, rate limit, and a bare 500. A bad request or a model that
   is gone is answered the same way every time, so retrying it just spends the clock. */
const MODEL_BUSY = /UNAVAILABLE|high demand|overloaded|try again later/i;
const MODEL_QUOTA = /RESOURCE_EXHAUSTED|quota|rate limit/i;

async function callModel(ai, payload, budgetMs) {
  const started = Date.now();
  const waits = [700, 2200];
  let last = null;
  for (let attempt = 0; ; attempt++) {
    /* v1.93: every attempt is bounded, and by what is LEFT of the budget rather than a fixed number
       — otherwise a model that accepts the connection and then goes quiet holds the function open
       until Vercel kills it at 60s, and a 504 tells the user nothing at all. That is the same
       failure this version exists to remove, so it must not be reintroduced by the retry loop. */
    const left = budgetMs - (Date.now() - started);
    if (left < 1500) break;              // not enough left to be worth another attempt
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), left);
    let r;
    try {
      r = await fetch(ai.url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'authorization': 'Bearer ' + ai.key, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      clearTimeout(timer);
      console.error(ai.name + ' attempt' + (attempt + 1) + ' ' + (e && e.name === 'AbortError' ? 'timed out' : 'net fail'));
      return { netFail: true };
    }
    clearTimeout(timer);
    if (r.ok) return { ok: r };
    const detail = await r.text().catch(() => '');
    console.error(ai.name + ' ' + r.status + ' attempt' + (attempt + 1) + ' ' + detail.slice(0, 300));
    last = { status: r.status, detail: detail };
    const wait = waits[attempt];
    const retryable = r.status === 503 || r.status === 429 || r.status === 500;
    if (!retryable || wait === undefined) break;
    /* Do not start a wait the function has no time left to finish — a 504 tells the user nothing. */
    if (Date.now() - started + wait > budgetMs) break;
    await new Promise((s) => setTimeout(s, wait));
  }
  return last;
}

/* One place decides what an upstream failure MEANS, so all three endpoints say the same thing. */
function classifyUpstream(status, detail) {
  if (MODEL_GONE.test(detail)) return 'model';
  if (status === 429 || MODEL_QUOTA.test(detail)) return 'quota';
  if (status === 503 || MODEL_BUSY.test(detail)) return 'busy';
  return 'upstream';
}

/* v1.92: lifted from api/recipe.js. Strict JSON mode is a request, not a guarantee — a
   compatibility layer in front of another provider may hand back a fenced block instead. Keep
   asking for json_object; just do not fall over when something wraps it. */
function looseJson(s) {
  const t = String(s).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

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

const TAVILY_URL = 'https://api.tavily.com/search';
const SERPER_URL = 'https://google.serper.dev/search';

/* Every URL a backend hands back is fetched later by /api/recipe, so each mapping path goes through
   publicUrl() — not just Brave's. One shaper, so that guard cannot be forgotten in a new backend. */
function shapeResults(raw, pick) {
  const results = [];
  for (const x of raw) {
    const got = pick(x || {});
    const u = publicUrl(got.url);
    if (!u) continue;
    let site = '';
    try { site = new URL(u).hostname.replace(/^www\./, ''); } catch (e) {}
    results.push({
      title: String(got.title || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      url: u,
      site: site.slice(0, 40),
      note: String(got.note || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120),
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return { results };
}

/* Scoping to TikTok is NOT uniform, and cannot be: Tavily takes a structured include_domains list,
   while Brave and Serper only accept plain query text and understand site: there. Both spellings of
   the same intent live here, in one place, so a new scope is one edit rather than three. */
function scopedQuery(q, scope, provider) {
  const base = q + ' recipe';
  if (scope === 'tiktok' && provider !== 'tavily') return base + ' site:tiktok.com';
  return base;
}

async function webSearch(q, scope, provider) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const query = scopedQuery(q, scope, provider.name);
    let r;
    if (provider.name === 'tavily') {
      r = await fetch(TAVILY_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'authorization': 'Bearer ' + provider.key, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: query,
          max_results: MAX_RESULTS,
          include_domains: scope === 'tiktok' ? ['tiktok.com'] : undefined,
        }),
      });
    } else if (provider.name === 'serper') {
      r = await fetch(SERPER_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'x-api-key': provider.key, 'content-type': 'application/json' },
        body: JSON.stringify({ q: query, num: MAX_RESULTS }),
      });
    } else {
      // Brave, unchanged: the key rides in a header and never in the query string.
      const url = BRAVE_URL + '?q=' + encodeURIComponent(query) + '&count=' + MAX_RESULTS;
      r = await fetch(url, {
        signal: ctl.signal,
        headers: { 'accept': 'application/json', 'x-subscription-token': provider.key },
      });
    }
    if (!r.ok) return { code: r.status === 401 || r.status === 403 ? 'search_key' : 'search_failed' };
    const data = await r.json();
    if (provider.name === 'tavily') {
      const raw = (data && Array.isArray(data.results)) ? data.results : [];
      return shapeResults(raw, (x) => ({ title: x.title, url: x.url, note: x.content }));
    }
    if (provider.name === 'serper') {
      const raw = (data && Array.isArray(data.organic)) ? data.organic : [];
      return shapeResults(raw, (x) => ({ title: x.title, url: x.link, note: x.snippet }));
    }
    const raw = (data && data.web && Array.isArray(data.web.results)) ? data.web.results : [];
    return shapeResults(raw, (x) => ({ title: x.title, url: x.url, note: x.description }));
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

async function modelIdeas(q, ai) {
  try {
    const payload = {
      model: ai.model,
      messages: [{ role: 'system', content: IDEA_SYSTEM }, { role: 'user', content: q }],
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    };
    /* v1.93: one call, retried where a retry can help — callModel logs every attempt and
       classifyUpstream decides what the failure MEANS, identically on all three endpoints. The
       budget, not an AbortController, is what keeps this inside the function's time. */
    const attempt = await callModel(ai, payload, MODEL_BUDGET_MS);
    if (attempt && attempt.netFail) {
      /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
      console.error(ai.name + ' network failure reaching the model');
      return { code: 'upstream' };
    }
    if (!attempt || !attempt.ok) return { code: classifyUpstream(attempt.status, attempt.detail) };
    const r = attempt.ok;
    let data;
    try { data = await r.json(); } catch (e) {
      console.error(ai.name + ' reply was not JSON');
      return { code: 'upstream' };
    }
    const reply = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string') {
      console.error(ai.name + ' reply was not a string ' + String(reply).slice(0, 200));
      return { code: 'upstream' };
    }
    const parsed = looseJson(reply);
    if (!parsed) {
      console.error(ai.name + ' unreadable ' + String(reply).slice(0, 200));
      return { code: 'unreadable' };
    }
    const raw = (parsed && Array.isArray(parsed.results)) ? parsed.results : null;
    if (!raw) {
      console.error(ai.name + ' unreadable, no results ' + String(reply).slice(0, 200));
      return { code: 'unreadable' };
    }
    const results = raw.map((x) => ({
      title: String((x && x.title) || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      url: '',
      site: '',
      note: String((x && x.note) || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    })).filter((x) => x.title).slice(0, MAX_RESULTS);
    return { results };
  } catch (e) {
    /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
    console.error(ai.name + ' ideas failed ' + String(e && e.message).slice(0, 200));
    return { code: 'upstream' };
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

    /* v1.96: an optional scope, validated to a known one — anything else is a plain web search. */
    const scope = (body && body.scope === 'tiktok') ? 'tiktok' : 'web';

    const sp = searchProvider();
    if (sp) {
      const got = await webSearch(q, scope, sp);
      if (!got.code) {
        if (!got.results.length) return fail(res, 404, 'no_results', 'Nothing found for that');
        res.status(200).json({ source: 'web', provider: sp.name, results: got.results });
        return;
      }
      // A configured-but-rejected key is worth naming; anything else falls through
      // to the model so the feature still does something useful.
      if (got.code === 'search_key') {
        /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
        console.error(sp.name + ' rejected its key');
        return fail(res, 502, 'search_key', 'Web search rejected its key');
      }
    }

    /* v1.98: v1.96 refused the TikTok scope here rather than offer model ideas, because an invented
       dish name is not a video. The danger was real but the remedy was wrong: every result now carries
       its own TikTok link, so a suggestion is openly an idea with a real route to TikTok's search
       rather than something passed off as a video. So fall through to the same ideas the web scope
       uses, and keep no_video_search only for when there is no model either — nothing to show at all. */
    const ai = aiProvider();
    if (!ai) {
      if (scope === 'tiktok') return fail(res, 404, 'no_video_search', 'Nothing is set up to search with');
      return fail(res, 500, 'not_configured', 'Server not configured');
    }

    const ideas = await modelIdeas(q, ai);
    if (ideas.code) {
      /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
      console.error('recipe-search bail ' + ideas.code);
      return fail(res, 502, ideas.code, 'Search failed');
    }
    if (!ideas.results.length) return fail(res, 404, 'no_results', 'Nothing found for that');
    res.status(200).json({ source: 'model', provider: '', results: ideas.results });
  } catch (e) {
    /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
    console.error('recipe-search unexpected ' + String(e && e.message).slice(0, 200));
    return fail(res, 502, 'unexpected', 'Search failed');
  }
};
