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
    const m = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
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

    let upstream;
    try {
      upstream = await fetch(ai.url, {
        method: 'POST',
        headers: {
          'authorization': 'Bearer ' + ai.key,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: text },
          ],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    /* v1.91: read the body before bailing. A retired or renamed model comes back as a 400 naming
       itself, and "Parse failed" sent nobody to the setting that fixes it — that is exactly how the
       app sat broken for three weeks. Logged for the next time, and named for the person using it. */
    if (!upstream.ok) {
      // Don't surface upstream status/body to the client — the detail goes to the log only.
      const detail = await upstream.text().catch(() => '');
      console.error(ai.name + ' ' + upstream.status + ' ' + detail.slice(0, 300));
      if (MODEL_GONE.test(detail)) {
        res.status(502).json({ error: 'The recipe reader\'s model is no longer available', code: 'model' });
        return;
      }
      res.status(502).json({ error: 'Parse failed', code: 'upstream' });
      return;
    }

    let data;
    try {
      data = await upstream.json();
    } catch (e) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    const reply = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string') {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    const parsed = looseJson(reply);
    if (!parsed) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    // JSON mode returns an object; accept {items:[...]} or a bare array just in case.
    const rawItems = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
    if (!rawItems) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    const items = rawItems.map(clampItem).filter(Boolean);
    res.status(200).json({ items });
  } catch (e) {
    // Catch-all: never let an unexpected error leak details or the key.
    res.status(502).json({ error: 'Parse failed' });
  }
};
