// api/receipt.js — Vercel Node serverless function (CommonJS). v2.09.
//
// Reads a photo of a supermarket receipt into what was bought and what was paid, using the same
// Gemini or Groq key as /api/recipe, kept SERVER-SIDE.
//
// Contract:  POST /api/receipt  { image }   a data: URL of a photo of a receipt
//            ->  { store, date, total, items: [{ raw, name, qty, weight, price, category }] }
//            errors are { error, code }: bad_image, too_large, missing, not_configured, model, busy,
//            quota, vision_model, upstream, unreadable, unexpected.
//
// A receipt is a household's shopping, so this endpoint never logs the image or the model's reply —
// only the reason for a failure and the reply's length. Nothing but the fields above leaves it: card
// numbers, loyalty numbers and the like are not asked for, and anything else the model says is dropped.

const MAX_IMAGE_CHARS = 3500000; // ~2.6MB of image; Vercel caps the request body around 4.5MB
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
  'You read a photo of a supermarket receipt.',
  'Respond with a JSON object of exactly this shape:',
  '{"store": string, "date": string, "items": [ ... ], "total": number}.',
  '"store": the shop\'s name as printed, with its branch or suburb if shown (e.g. "Coles Dandenong"); "" if unreadable.',
  '"date": the purchase date as YYYY-MM-DD; "" if not printed.',
  '"total": the total paid, in dollars; 0 if unreadable.',
  'Each element of "items" is one product bought, with exactly these keys:',
  '  "raw": string — the product line as printed',
  '  "name": string — what the product is in plain words, lowercase, without brand codes or pack abbreviations where you can tell (e.g. "WW FR RANGE EGGS 12PK" -> "free range eggs")',
  '  "qty": integer — how many were bought (default 1)',
  '  "weight": string — the weight or pack size if the line shows one, e.g. "0.512 kg", "2 L"; else ""',
  '  "price": number — what was paid for that line in dollars, after any discount printed directly under it',
  '  "category": one of ' + CATEGORIES.map((c) => '"' + c + '"').join(', '),
  'Leave out subtotals, totals, GST or tax lines, payment, change, card and loyalty lines, and anything that is not a product.',
  'If the photo is not a receipt, return {"store":"","date":"","total":0,"items":[]}.',
  'Return only the JSON object — no prose, no markdown fences.',
].join('\n');

/* v2.09: the model's output is untrusted. Every field is coerced to its type and capped, and a line
   without a believable price is dropped — a wrong price remembered is worse than none. */
function clampLine(x) {
  if (!x || typeof x !== 'object') return null;
  const name = String(x.name || '').trim().slice(0, 60);
  if (!name) return null;
  const raw = String(x.raw || '').trim().slice(0, 60);
  let qty = parseInt(x.qty, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (qty > 99) qty = 99;
  const weight = String(x.weight || '').trim().slice(0, 16);
  const p = Number(x.price);
  if (!Number.isFinite(p) || p < 0 || p > 5000) return null;
  const price = Math.round(p * 100) / 100;
  let category = String(x.category || '').toLowerCase().trim();
  if (!CATEGORIES.includes(category)) category = 'others';
  return { raw, name, qty, weight, price, category };
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
    /* v2.09: unlike recipe.js, not even the provider's error text is logged here — a provider that
       echoed the request would put a household's receipt in the log. The status and what it means are enough. */
    console.error(ai.name + ' ' + r.status + ' attempt' + (attempt + 1) + ' ' + classifyUpstream(r.status, detail));
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
    if (!image) return fail(res, 400, 'missing', 'Missing image');
    if (!/^data:image\/(png|jpe?g|webp|heic|heif);base64,/i.test(image)) {
      return fail(res, 400, 'bad_image', 'That does not look like a photo');
    }
    if (image.length > MAX_IMAGE_CHARS) return fail(res, 413, 'too_large', 'That photo is too big');

    const payload = {
      model: ai.vision,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 4000,
    };

    const attempt = await callModel(ai, payload, MODEL_BUDGET_MS);
    if (attempt && attempt.netFail) {
      console.error(ai.name + ' network failure reaching the model');
      return fail(res, 502, 'upstream', 'Parse failed');
    }
    if (!attempt || !attempt.ok) {
      /* Only Groq has a vision model that can be missing on its own (see recipe.js). */
      if (attempt && ai.name === 'groq' && (attempt.status === 400 || attempt.status === 404)) {
        console.error(ai.name + ' vision model refused, status ' + attempt.status);
        return fail(res, 502, 'vision_model', 'Receipt reading is not set up on this account');
      }
      console.error(ai.name + ' upstream failure' + (attempt ? ', status ' + attempt.status : ', budget spent'));
      return fail(res, 502, attempt ? classifyUpstream(attempt.status, attempt.detail) : 'upstream', 'Parse failed');
    }

    let data;
    try { data = await attempt.ok.json(); } catch (e) {
      console.error(ai.name + ' reply was not JSON');
      return fail(res, 502, 'upstream', 'Parse failed');
    }

    const reply = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    /* v2.09: the reply is a receipt — its length goes in the log, never its text. */
    if (typeof reply !== 'string') {
      console.error(ai.name + ' reply was not a string, type ' + typeof reply);
      return fail(res, 502, 'upstream', 'Parse failed');
    }

    const parsed = looseJson(reply);
    if (!parsed || !Array.isArray(parsed.items)) {
      console.error(ai.name + ' unreadable, reply length ' + String(reply).length);
      return fail(res, 502, 'unreadable', 'Parse failed');
    }

    const items = parsed.items.map(clampLine).filter(Boolean).slice(0, 150);
    const store = String(parsed.store || '').trim().slice(0, 60);
    let date = String(parsed.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) date = '';
    let total = Number(parsed.total);
    total = (Number.isFinite(total) && total >= 0 && total <= 100000) ? Math.round(total * 100) / 100 : 0;

    res.status(200).json({ store, date, total, items });
  } catch (e) {
    console.error('receipt unexpected ' + String(e && e.message).slice(0, 200));
    return fail(res, 502, 'unexpected', 'Parse failed');
  }
};
