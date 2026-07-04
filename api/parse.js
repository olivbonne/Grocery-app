// api/parse.js — Vercel Node serverless function (CommonJS).
//
// Holds the Anthropic API key SERVER-SIDE so the client (index.html) never sees it.
// Contract:  POST /api/parse  { text }  ->  { items: [{ name, qty, category }] }
//
// The key lives in the ANTHROPIC_API_KEY environment variable (Vercel Project
// Settings -> Environment Variables). It is never logged, never returned to the
// browser, and never embedded in any static asset. See docs/ai-setup.md.

const MAX_INPUT_CHARS = 2000;

const CATEGORIES = [
  'meat', 'vegetable', 'fruit', 'fresh', 'bulk',
  'asian', 'alcohol', 'health', 'others',
];

const SYSTEM = [
  'You parse free-form grocery shopping text into discrete items.',
  'The input may be casual, e.g. "2 milk, dozen eggs, stuff for tacos".',
  'Expand vague requests (like "stuff for tacos") into concrete grocery items.',
  'Return ONLY a JSON array. No prose, no explanation, no markdown code fences.',
  'Each element is an object with exactly these keys:',
  '  "name": string  — the item name, lowercase, singular where natural',
  '  "qty": integer  — quantity, default 1 if unspecified (e.g. "dozen eggs" -> qty 12)',
  '  "category": one of ' + CATEGORIES.map((c) => '"' + c + '"').join(', '),
  'Choose the closest category; use "others" when nothing fits.',
  'Example input: "2 milk, dozen eggs"',
  'Example output: [{"name":"milk","qty":2,"category":"fresh"},{"name":"eggs","qty":12,"category":"fresh"}]',
].join('\n');

// Strip an accidental ```json ... ``` fence if the model added one anyway.
function stripFences(s) {
  let t = String(s).trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  }
  return t;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
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
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: SYSTEM,
          messages: [{ role: 'user', content: text }],
        }),
      });
    } catch (e) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    if (!upstream.ok) {
      // Don't surface upstream status/body to the client.
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

    const reply = data && data.content && data.content[0] && data.content[0].text;
    if (typeof reply !== 'string') {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    let items;
    try {
      items = JSON.parse(stripFences(reply));
    } catch (e) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    if (!Array.isArray(items)) {
      res.status(502).json({ error: 'Parse failed' });
      return;
    }

    res.status(200).json({ items });
  } catch (e) {
    // Catch-all: never let an unexpected error leak details or the key.
    res.status(502).json({ error: 'Parse failed' });
  }
};
