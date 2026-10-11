/* api/aisle.js — a Node test, not a browser one. Run it with `node .claude/tests/api-aisle.js`; it needs no server and no
   network, because the one call the endpoint makes outward is stubbed.

   WHY THIS EXISTS: v2.28 sends a photo of an aisle sign to a vision model and hands back the aisle's number and what the
   sign lists, so a household can map a shop by walking it once. The reply is untrusted and the photo is the household's.

   WHAT THESE CHECKS HAVE TO PROVE:
   - only POST, only a data:image photo, size-capped; a missing key says so;
   - the photo goes to the VISION model, in the multimodal shape;
   - the reply is coerced: the aisle is a short code ("5", "12B") or "", and the items are short plain lower-case words,
     at most twelve; anything else the model says is dropped, and nothing but { aisle, items } leaves;
   - a photo that is not a sign comes back as { aisle:"", items:[] }, not an error;
   - upstream failures are named the way the other endpoints name them (busy, quota, model, vision_model, unreadable);
   - no log line, on success or failure, contains the image or any of the reply's text. */
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_VISION_MODEL = 'test-vision-model';
process.env.GROQ_MODEL = 'test-text-model';
const handler = require('../../api/aisle.js');

const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
function mkRes() { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; }
const call = async (body, method) => { const res = mkRes(); await handler({ method: method || 'POST', body }, res); return res; };

let calls = [], reply = null, status = 200, errBody = '{}';
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  if (status !== 200) return new Response(errBody, { status });
  const content = typeof reply === 'string' ? reply : JSON.stringify(reply);
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const logs = []; console.error = (...a) => { logs.push(a.join(' ')); };

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);

(async () => {
  try {
    let r = await call({}, 'GET');
    ok('only POST', r.code === 405, r.code);
    r = await call({});
    ok('no photo is "missing"', r.code === 400 && r.body.code === 'missing', JSON.stringify(r.body));
    r = await call({ image: 'https://example.com/sign.jpg' });
    ok('only a data:image photo', r.code === 400 && r.body.code === 'bad_image', JSON.stringify(r.body));
    r = await call({ image: 'data:image/jpeg;base64,' + 'A'.repeat(3600000) });
    ok('a photo over the cap is "too_large"', r.code === 413 && r.body.code === 'too_large', JSON.stringify(r.body));

    calls = []; status = 200;
    reply = { aisle: 'Aisle 12b', items: ['Pasta', 'RICE!!', 'sauces & condiments', '', 42, 'x'.repeat(90), 'a','b','c','d','e','f','g','h','i','j'], note: 'store opens 7am', promo: '$2 off' };
    r = await call({ image: IMG });
    const sent = calls[0] && JSON.parse(calls[0].opts.body);
    ok('the photo goes to the vision model, as an image part', sent && sent.model === 'test-vision-model' && sent.messages[0].content.some(p => p.type === 'image_url' && p.image_url.url === IMG), sent && sent.model);
    ok('the aisle comes back as its short code', r.code === 200 && r.body.aisle === '12B', JSON.stringify(r.body));
    ok('…the items as short plain lower-case words, at most twelve', r.body.items.length === 12 && r.body.items[0] === 'pasta' && r.body.items[1] === 'rice' && r.body.items[2] === 'sauces & condiments' && r.body.items.every(x => typeof x === 'string' && x.length <= 40 && x === x.toLowerCase()), JSON.stringify(r.body.items));
    ok('…and nothing else the model said leaves', JSON.stringify(Object.keys(r.body).sort()) === '["aisle","items"]', JSON.stringify(Object.keys(r.body)));

    reply = { aisle: '', items: [] };
    r = await call({ image: IMG });
    ok('a photo that is not a sign is { aisle:"", items:[] }, not an error', r.code === 200 && r.body.aisle === '' && r.body.items.length === 0, JSON.stringify(r.body));
    reply = { aisle: 'Frozen foods section near the back', items: ['ice cream'] };
    r = await call({ image: IMG });
    ok('a long "aisle" that is not a code becomes ""', r.code === 200 && r.body.aisle === '', JSON.stringify(r.body));
    reply = 'not json at all';
    r = await call({ image: IMG });
    ok('an unreadable reply is "unreadable"', r.code === 502 && r.body.code === 'unreadable', JSON.stringify(r.body));

    for (const [st, body, code] of [[503, 'UNAVAILABLE high demand', 'busy'], [429, 'rate limit', 'quota'], [404, 'model_not_found', 'vision_model'], [400, 'bad', 'vision_model']]) {
      status = st; errBody = body; r = await call({ image: IMG });
      ok(`an upstream ${st} is named "${code}"`, r.code === 502 && r.body.code === code, JSON.stringify(r.body));
    }
    status = 200;
    delete process.env.GROQ_API_KEY;
    r = await call({ image: IMG });
    ok('no key is "not_configured"', r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));

    const all = logs.join('\n');
    ok('no log line holds the photo or the reply\'s words', !all.includes('AAAA') && !/pasta|sauces|ice cream|opens 7am|not json/i.test(all), all.slice(0, 300));
  } catch (e) { ok('suite ran to the end', false, e.message.slice(0, 300)); }
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
