/* api/fridge.js (v2.94) — a Node test, not a browser one. Run it with `node .claude/tests/api-fridge.js`; no server, no network
   (the one outward call is stubbed).

   WHY THIS EXISTS: "What's in the fridge?" sends a photo of the household's fridge or pantry to a vision model and hands back
   the products it can see, so the app can say which list items are already at home. The reply is untrusted and the photo is
   the household's.

   WHAT THESE CHECKS HAVE TO PROVE:
   - only POST, only a data:image photo, size-capped; a missing key says so;
   - the photo goes to the VISION model, in the multimodal shape;
   - the reply is coerced: each product has a non-empty name (≤ 60), brand ≤ 40, size ≤ 20, a whole count 1–99, a category
     from the nine (else "others"); at most 60; nameless lines are dropped; nothing but { items } leaves;
   - an empty photo comes back as { items:[] }, not an error;
   - upstream failures are named the way the other endpoints name them;
   - no log line, on success or failure, contains the image or any of the reply's text. */
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_VISION_MODEL = 'test-vision-model';
process.env.GROQ_MODEL = 'test-text-model';
const handler = require('../../api/fridge.js');

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
    reply = { items: [ { name:'Milk', brand:'Pauls', size:'2L', qty:1, category:'fresh' }, { name:'Greek yogurt', brand:'x'.repeat(80), size:'1kg', qty:3.6, category:'dairy' },
      { name:'', qty:2 }, { brand:'no name' }, { name:'y'.repeat(120), qty:500, category:'meat' } ].concat(Array.from({length:70}, (_,i)=>({ name:'thing '+i, qty:1, category:'others' }))), note:'nice fridge' };
    r = await call({ image: IMG });
    const sent = calls[0] && JSON.parse(calls[0].opts.body);
    ok('the photo goes to the vision model, as an image part', sent && sent.model === 'test-vision-model' && sent.messages[0].content.some(p => p.type === 'image_url' && p.image_url.url === IMG), sent && sent.model);
    const it = r.body && r.body.items || [];
    ok('products come back coerced: name, brand, size, a whole count, a category from the nine (dairy → others)', r.code === 200 && it[0].name === 'Milk' && it[0].brand === 'Pauls' && it[0].size === '2L' && it[0].qty === 1 && it[0].category === 'fresh'
      && it[1].brand.length <= 40 && Number.isInteger(it[1].qty) && it[1].qty >= 1 && it[1].category === 'others', JSON.stringify(it.slice(0,2)));
    ok('…nameless lines dropped, long names cut to 60, counts kept within 1–99, at most 60 products', !it.some(x => !x.name) && it[2].name.length <= 60 && it[2].qty <= 99 && it.length === 60, JSON.stringify({ n:it.length, third:it[2] }));
    ok('…and nothing else the model said leaves', JSON.stringify(Object.keys(r.body)) === '["items"]', JSON.stringify(Object.keys(r.body)));
    reply = { items: [] };
    r = await call({ image: IMG });
    ok('a photo with nothing recognisable is { items:[] }, not an error', r.code === 200 && Array.isArray(r.body.items) && r.body.items.length === 0, JSON.stringify(r.body));
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
    ok('no log line holds the photo or the reply\'s words', !all.includes('AAAA') && !/pauls|greek|nice fridge|thing 1|not json/i.test(all), all.slice(0, 300));
  } catch (e) { ok('suite ran to the end', false, e.message.slice(0, 300)); }
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
