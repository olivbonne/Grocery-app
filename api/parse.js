// api/parse.js — Vercel Node serverless function (CommonJS).
//
// Turns free-form grocery text into structured items using Groq, keeping the
// API key SERVER-SIDE so the client (index.html) never sees it.
// Contract:  POST /api/parse  { text }  ->  { items: [{ name, qty, category }] }
//
// The key lives in the GROQ_API_KEY environment variable (Vercel Project
// Settings -> Environment Variables). It is never logged, never returned to the
// browser, and never embedded in any static asset. See docs/ai-setup.md.

const MAX_INPUT_CHARS = 2000;

const CATEGORIES = [
  'meat', 'vegetable', 'fruit', 'fresh', 'bulk',
  'asian', 'alcohol', 'health', 'others',
];

// Groq is OpenAI-compatible. The default is a small, fast model, which is plenty
// for grocery parsing; set GROQ_MODEL in Vercel to any model your account lists
// (a larger one for higher accuracy on messy input, at more cost/latency).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/* v1.91: Groq retires models on its own schedule — llama-3.1-8b-instant was shut down for
   free-tier traffic on 2026-08-16 and took every AI feature in the app down with it, silently,
   because the name was compiled in. It is an env var now, like GROQ_VISION_MODEL already is, so
   the next retirement is a Vercel setting rather than a deploy. See docs/ai-setup.md. */
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
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
      upstream = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'authorization': 'Bearer ' + apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
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
      console.error('groq ' + upstream.status + ' ' + detail.slice(0, 300));
      if (/model_decommissioned|model_not_found|does not exist|decommissioned/i.test(detail)) {
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

    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (e) {
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
