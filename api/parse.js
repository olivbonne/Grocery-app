// api/parse.js — Vercel Node serverless function (CommonJS).
//
// Turns free-form grocery text into structured items using Gemini or Groq, keeping
// the API key SERVER-SIDE so the client (index.html) never sees it.
// Contract:  POST /api/parse  { text }  ->  { items: [{ name, qty, category }] }
//
// The key lives in the GEMINI_API_KEY or GROQ_API_KEY environment variable (Vercel
// Project Settings -> Environment Variables). It is never logged, never returned to the
// browser, and never embedded in any static asset. See docs/ai-setup.md.

const MAX_INPUT_CHARS = 2000;
const MODEL_BUDGET_MS = 30000;   // the function itself is capped at 60s (vercel.json)

const CATEGORIES = [
  'meat', 'vegetable', 'fruit', 'fresh', 'bulk',
  'asian', 'alcohol', 'health', 'others',
];

// Both providers are OpenAI-compatible. The defaults are small, fast models, which are
// plenty for grocery parsing; set GEMINI_MODEL / GROQ_MODEL in Vercel to any model your
// account lists (a larger one for higher accuracy on messy input, at more cost/latency).
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

const SYSTEM = [
  'You parse free-form grocery shopping text into discrete items.',
  'The input may be casual, e.g. "2 milk, dozen eggs, stuff for tacos".',
  'Expand vague requests (like "stuff for tacos") into concrete grocery items.',
  'Respond with a JSON object of exactly this shape: {"items": [ ... ]}.',
  'Each element of "items" has exactly these keys:',
  '  "name": string  — the item name, lowercase, singular where natural',
  '  "qty": integer  — quantity, default 1 if unspecified (e.g. "dozen eggs" -> 12)',
  '  "category": one of ' + CATEGORIES.map((c) => '"' + c + '"').join(', '),
  'Choose the closest category; use "others" when nothing fits.',
  'Return only the JSON object — no prose, no markdown fences.',
].join('\n');

// The model output is untrusted: coerce every field into a safe shape.
function clampItem(x) {
  if (!x || typeof x !== 'object') return null;
  const name = String(x.name || '').trim().slice(0, 60);
  if (!name) return null;
  let qty = parseInt(x.qty, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (qty > 999) qty = 999;
  let category = String(x.category || '').toLowerCase().trim();
  if (!CATEGORIES.includes(category)) category = 'others';
  return { name, qty, category };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const ai = aiProvider();
    if (!ai) {
      // Never leak the reason beyond "not configured".
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

    // Body may already be parsed (Vercel does this for JSON) or a raw string.
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }
    }

    const text = body && typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }
    if (text.length > MAX_INPUT_CHARS) {
      res.status(400).json({ error: 'Input too long' });
      return;
    }

    const payload = {
      model: ai.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    };

    /* v1.93: one call, retried where a retry can help — callModel logs every attempt and
       classifyUpstream decides what the failure MEANS, identically on all three endpoints. */
    const attempt = await callModel(ai, payload, MODEL_BUDGET_MS);
    if (attempt && attempt.netFail) {
      /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
      console.error(ai.name + ' network failure reaching the model');
      res.status(502).json({ error: 'Parse failed', code: 'upstream' });
      return;
    }
    if (!attempt || !attempt.ok) {
      // Don't surface upstream status/body to the client — the detail goes to the log only.
      const code = classifyUpstream(attempt.status, attempt.detail);
      if (code === 'model') {
        res.status(502).json({ error: 'The recipe reader\'s model is no longer available', code: 'model' });
        return;
      }
      res.status(502).json({ error: 'Parse failed', code });
      return;
    }
    const upstream = attempt.ok;

    let data;
    try {
      data = await upstream.json();
    } catch (e) {
      /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
      console.error(ai.name + ' reply was not JSON');
      res.status(502).json({ error: 'Parse failed', code: 'upstream' });
      return;
    }

    const reply = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string') {
      console.error(ai.name + ' reply was not a string ' + String(reply).slice(0, 200));
      res.status(502).json({ error: 'Parse failed', code: 'upstream' });
      return;
    }

    const parsed = looseJson(reply);
    if (!parsed) {
      console.error(ai.name + ' unreadable ' + String(reply).slice(0, 200));
      res.status(502).json({ error: 'Parse failed', code: 'unreadable' });
      return;
    }

    // JSON mode returns an object; accept {items:[...]} or a bare array just in case.
    const rawItems = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
    if (!rawItems) {
      console.error(ai.name + ' unreadable, no items ' + String(reply).slice(0, 200));
      res.status(502).json({ error: 'Parse failed', code: 'unreadable' });
      return;
    }

    const items = rawItems.map(clampItem).filter(Boolean);
    res.status(200).json({ items });
  } catch (e) {
    // Catch-all: never let an unexpected error leak details or the key.
    /* v1.93: a 502 with nothing in the log is a bug that costs an afternoon. Every bail says why. */
    console.error('parse unexpected ' + String(e && e.message).slice(0, 200));
    res.status(502).json({ error: 'Parse failed', code: 'unexpected' });
  }
};
