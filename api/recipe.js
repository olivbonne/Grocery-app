// api/recipe.js — Vercel Node serverless function (CommonJS).
//
// Extracts a shopping-ready ingredient list from pasted recipe text using Groq
// (llama-3.1-8b-instant), keeping the API key SERVER-SIDE so the client
// (index.html) never sees it.
// Contract:  POST /api/recipe  { text }
//            ->  { title, servings, items: [{ name, qty, weight, category }] }
//
// The key lives in the GROQ_API_KEY environment variable (Vercel Project
// Settings -> Environment Variables). It is never logged, never returned to the
// browser, and never embedded in any static asset. See docs/ai-setup.md.

const MAX_INPUT_CHARS = 8000; // recipes are longer than a grocery jot

const CATEGORIES = [
  'meat', 'vegetable', 'fruit', 'fresh', 'bulk',
  'asian', 'alcohol', 'health', 'others',
];

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

const SYSTEM = [
  'You extract a grocery shopping list from a recipe pasted as free text.',
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

// The model output is untrusted: coerce every field into a safe shape.
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

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

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
          max_tokens: 1500,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    if (!upstream.ok) {
      res.status(502).json({ error: 'Parse failed' });
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

    const rawItems = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
    if (!rawItems) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    const items = rawItems.map(clampItem).filter(Boolean);
    let servings = parseInt(parsed && parsed.servings, 10);
    if (!Number.isFinite(servings) || servings < 1) servings = 4;
    if (servings > 99) servings = 99;
    const title = String((parsed && parsed.title) || '').trim().slice(0, 80);

    res.status(200).json({ title, servings, items });
  } catch (e) {
    res.status(502).json({ error: 'Parse failed' });
  }
};
