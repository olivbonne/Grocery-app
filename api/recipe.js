// api/recipe.js — Vercel Node serverless function (CommonJS).
//
// Turns a recipe into a shopping-ready ingredient list using Gemini or Groq, keeping
// the API key SERVER-SIDE so the client (index.html) never sees it.
//
// Contract:  POST /api/recipe  with exactly one of:
//              { text }   pasted recipe text
//              { url }    a link to a recipe page — fetched and read here (v1.86)
//              { image }  a data: URL of a photo of a recipe        (v1.86)
//              { dish }   the name of a dish, written out by the model (v1.89) —
//                         used for search results that have no page behind them
//            ->  { title, servings, items: [{ name, qty, weight, category }] }
//            errors are { error, code } so the app can say something useful.
//
// The key lives in the GEMINI_API_KEY or GROQ_API_KEY environment variable (Vercel
// Project Settings -> Environment Variables). It is never logged, never returned to the
// browser, and never embedded in any static asset. See docs/ai-setup.md.

const MAX_INPUT_CHARS = 8000;   // recipes are longer than a grocery jot
const MAX_IMAGE_CHARS = 3500000; // ~2.6MB of image; Vercel caps the request body around 4.5MB
const MAX_PAGE_BYTES = 1500000; // stop reading a fetched page after this much
const FETCH_TIMEOUT_MS = 8000;  // the function itself is capped at 60s (vercel.json)
const MAX_REDIRECTS = 3;
const MODEL_BUDGET_MS = 30000;  // room for a retry or two inside the 60s function cap

const CATEGORIES = [
  'meat', 'vegetable', 'fruit', 'fresh', 'bulk',
  'asian', 'alcohol', 'health', 'others',
];

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

const SYSTEM = [
  'You extract a grocery shopping list from a recipe.',
  'Ignore steps/instructions; output only the ingredients someone must buy.',
  'Combine duplicate ingredients; skip water and plain tap water.',
  'Respond with a JSON object of exactly this shape:',
  '{"title": string, "servings": integer, "items": [ ... ]}.',
  '"title": a short recipe name (or "" if unknown).',
  '"servings": how many the recipe makes as written (integer, default 4 if unstated).',
  'Each element of "items" has exactly these keys:',
  '  "name": string  — ingredient name, lowercase, singular where natural (no amounts in the name)',
  '  "qty": integer  — count if the ingredient is counted (e.g. "3 eggs" -> 3), else 1',
  '  "weight": string — amount/measure if given, e.g. "500g", "2 cups", "1 tbsp"; else ""',
  '  "category": one of ' + CATEGORIES.map((c) => '"' + c + '"').join(', '),
  'Choose the closest category; use "others" when nothing fits.',
  'Return only the JSON object — no prose, no markdown fences.',
].join('\n');

// v1.89: a search result with no URL is a dish the model suggested, so the model is
// asked to write that dish out. Same output shape, so it lands in the same form.
const DISH_SYSTEM = SYSTEM
  + '\nYou are given the NAME of a dish rather than a recipe. Write out the ingredients'
  + '\na cook would need to buy for it, as the same JSON object. Use the dish name as the title.';

const VISION_SYSTEM = SYSTEM
  + '\nThe recipe is in the attached image. Read the ingredient list from it.'
  + '\nIf the image is not a recipe, return {"title":"","servings":4,"items":[]}.';

// ── the model output is untrusted: coerce every field into a safe shape ──────
function clampItem(x) {
  if (!x || typeof x !== 'object') return null;
  const name = String(x.name || '').trim().slice(0, 60);
  if (!name) return null;
  let qty = parseInt(x.qty, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (qty > 999) qty = 999;
  const weight = String(x.weight == null ? '' : x.weight).trim().slice(0, 16);
  let category = String(x.category || '').toLowerCase().trim();
  if (!CATEGORIES.includes(category)) category = 'others';
  return { name, qty, weight, category };
}

// ── the URL a user pastes is attacker-controlled input to a server-side fetch ─
// Everything below exists to keep /api/recipe from being used to reach things
// only this server can reach: link-local metadata endpoints, loopback, and
// anything on a private network. Each redirect hop is re-checked, because a
// public host is free to redirect to 169.254.169.254.
function isBlockedHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true;   // IPv6 link-local / unique-local
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;                              // cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;                                            // multicast / reserved
  }
  return false;
}

function safeUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (isBlockedHost(u.hostname)) return null;
  return u;
}

// Prefer schema.org Recipe JSON-LD when a page carries it — most recipe sites do,
// and it is the ingredient list already separated from the prose.
function jsonLdIngredients(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 3) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const nodes = [];
    const walk = (n, depth) => {
      if (!n || depth > 4) return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, depth + 1)); return; }
      if (typeof n !== 'object') return;
      nodes.push(n);
      if (n['@graph']) walk(n['@graph'], depth + 1);
    };
    walk(data, 0);
    for (const n of nodes) {
      const t = n['@type'];
      const isRecipe = t === 'Recipe' || (Array.isArray(t) && t.indexOf('Recipe') >= 0);
      if (!isRecipe) continue;
      const ing = n.recipeIngredient || n.ingredients;
      if (!Array.isArray(ing) || !ing.length) continue;
      const name = String(n.name || '').trim().slice(0, 80);
      const yld = String(n.recipeYield == null ? '' : (Array.isArray(n.recipeYield) ? n.recipeYield[0] : n.recipeYield)).slice(0, 40);
      out.push([name ? ('Recipe: ' + name) : '', yld ? ('Serves: ' + yld) : '', 'Ingredients:',
        ing.map((x) => '- ' + String(x).trim()).join('\n')].filter(Boolean).join('\n'));
    }
  }
  return out.length ? out.join('\n\n') : '';
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

async function readCapped(resp) {
  // Never buffer a whole CDN video because someone pasted the wrong link.
  const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
  if (!reader) {
    const t = await resp.text();
    return t.slice(0, MAX_PAGE_BYTES);
  }
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(Buffer.from(value));
    if (total >= MAX_PAGE_BYTES) { try { await reader.cancel(); } catch (e) {} break; }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchRecipeText(rawUrl) {
  let u = safeUrl(rawUrl);
  if (!u) return { code: 'bad_url' };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    let resp = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      resp = await fetch(u.toString(), {
        redirect: 'manual',
        signal: ctl.signal,
        headers: {
          /* v1.93: a bot-shaped user-agent is refused by a good share of recipe sites, which is why
             some links worked and some did not. This is one page, fetched because someone asked for
             it, on their behalf — so it asks the way their browser would. The guards above (scheme,
             host, redirect re-checks, size cap, timeout) are what keep this fetch safe; the header
             was never doing that work. */
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) return { code: 'fetch_failed' };
        const next = safeUrl(new URL(loc, u).toString());   // a public host may redirect inward
        if (!next) return { code: 'blocked_url' };
        u = next;
        continue;
      }
      break;
    }
    if (!resp || !resp.ok) return { code: 'fetch_failed' };
    const ct = String(resp.headers.get('content-type') || '').toLowerCase();
    if (ct && !/text\/html|application\/xhtml|text\/plain/.test(ct)) return { code: 'not_a_page' };

    const body = await readCapped(resp);
    const ld = jsonLdIngredients(body);
    const text = (ld || htmlToText(body)).slice(0, MAX_INPUT_CHARS);
    if (text.replace(/\s/g, '').length < 40) return { code: 'fetch_failed' };
    return { text };
  } catch (e) {
    return { code: 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

// A vision model may ignore response_format, so accept a fenced or wrapped object too.
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

function looseJson(s) {
  const t = String(s).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

function fail(res, status, code, error) {
  res.status(status).json({ error: error || 'Parse failed', code });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed', code: 'method' });
      return;
    }

    const ai = aiProvider();
    if (!ai) return fail(res, 500, 'not_configured', 'Server not configured');

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { return fail(res, 400, 'bad_body', 'Invalid JSON body'); }
    }
    body = body || {};

    const image = typeof body.image === 'string' ? body.image.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const dish = typeof body.dish === 'string' ? body.dish.trim().slice(0, 120) : '';
    let text = typeof body.text === 'string' ? body.text.trim() : '';

    if (image) {
      if (!/^data:image\/(png|jpe?g|webp|heic|heif);base64,/i.test(image)) {
        return fail(res, 400, 'bad_image', 'That does not look like a photo');
      }
      if (image.length > MAX_IMAGE_CHARS) return fail(res, 413, 'too_large', 'That photo is too big');
    } else if (url) {
      const got = await fetchRecipeText(url);
      if (got.code) {
        const msg = got.code === 'bad_url' || got.code === 'blocked_url' ? 'That link cannot be opened'
          : got.code === 'not_a_page' ? 'That link is not a web page'
            : 'Could not read that page';
        /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
        console.error('page fetch ' + got.code + ' for a link');
        return fail(res, got.code === 'bad_url' || got.code === 'blocked_url' ? 400 : 502, got.code, msg);
      }
      text = got.text;
    } else if (dish) {
      text = dish;
    } else {
      if (!text) return fail(res, 400, 'missing', 'Missing text');
      if (text.length > MAX_INPUT_CHARS) return fail(res, 400, 'too_long', 'Input too long');
    }

    const payload = image
      ? {
        model: ai.vision,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: VISION_SYSTEM },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
        temperature: 0.2,
        max_tokens: 1500,
      }
      : {
        model: ai.model,
        messages: [
          { role: 'system', content: dish ? DISH_SYSTEM : SYSTEM },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      };

    /* v1.93: one call, retried where a retry can help — callModel logs every attempt and
       classifyUpstream decides what the failure MEANS, identically on all three endpoints. */
    const attempt = await callModel(ai, payload, MODEL_BUDGET_MS);
    if (attempt && attempt.netFail) {
      /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
      console.error(ai.name + ' network failure reaching the model');
      return fail(res, 502, 'upstream', 'Parse failed');
    }
    if (!attempt || !attempt.ok) {
      // A missing/renamed vision model is the one upstream failure worth naming:
      // Groq's image-capable line-up changes, and "parse failed" would send the
      // user hunting in the wrong place. See GROQ_VISION_MODEL in docs/ai-setup.md.
      /* v1.92: only Groq has a vision model that can be missing on its own. On Gemini the same
         model reads the photo, so a failure there is a model or an image problem, and falls
         through to the branches below rather than blaming a setting that does not exist. */
      if (image && ai.name === 'groq' && (attempt.status === 400 || attempt.status === 404)) {
        return fail(res, 502, 'vision_model', 'Photo reading is not set up on this account');
      }
      return fail(res, 502, classifyUpstream(attempt.status, attempt.detail), 'Parse failed');
    }
    const upstream = attempt.ok;

    let data;
    try { data = await upstream.json(); } catch (e) {
      /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
      console.error(ai.name + ' reply was not JSON');
      return fail(res, 502, 'upstream', 'Parse failed');
    }

    const reply = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string') {
      console.error(ai.name + ' reply was not a string ' + String(reply).slice(0, 200));
      return fail(res, 502, 'upstream', 'Parse failed');
    }

    const parsed = looseJson(reply);
    if (!parsed) {
      console.error(ai.name + ' unreadable ' + String(reply).slice(0, 200));
      return fail(res, 502, 'unreadable', 'Parse failed');
    }

    const rawItems = Array.isArray(parsed) ? parsed
      : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
    if (!rawItems) {
      console.error(ai.name + ' unreadable, no items ' + String(reply).slice(0, 200));
      return fail(res, 502, 'unreadable', 'Parse failed');
    }

    const items = rawItems.map(clampItem).filter(Boolean);
    let servings = parseInt(parsed && parsed.servings, 10);
    if (!Number.isFinite(servings) || servings < 1) servings = 4;
    if (servings > 99) servings = 99;
    const title = String((parsed && parsed.title) || '').trim().slice(0, 80);

    res.status(200).json({ title, servings, items });
  } catch (e) {
    /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
    console.error('recipe unexpected ' + String(e && e.message).slice(0, 200));
    return fail(res, 502, 'unexpected', 'Parse failed');
  }
};
