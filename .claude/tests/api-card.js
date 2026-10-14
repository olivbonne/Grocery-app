/* api/card.js — a Node test, not a browser one. Run it with `node .claude/tests/api-card.js`; it needs no server and no
   network, because the one call the endpoint makes outward is stubbed.

   WHY THIS EXISTS: v2.35 sends a photo of a membership card to a vision model and hands back the programme's name and the
   card's number, so adding a card is "photo, check, save". The reply is untrusted, and the photo and the number are the
   household's.

   WHAT THESE CHECKS HAVE TO PROVE:
   - only POST, only a data:image photo, size-capped; a missing key says so;
   - the photo goes to the VISION model, in the multimodal shape;
   - the reply is coerced: the name is short plain text, the number is digits only (spaces and dashes dropped) and whole —
     a run that is not a plausible card number becomes "" rather than being cut down; nothing but { name, number } leaves;
   - a photo that is not a card comes back as { name:"", number:"" }, not an error;
   - upstream failures are named the way the other endpoints name them;
   - no log line, on success or failure, contains the image, the number or any of the reply's text. */
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_VISION_MODEL = 'test-vision-model';
process.env.GROQ_MODEL = 'test-text-model';
const handler = require('../../api/card.js');

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
    reply = { name: 'Flybuys<script>', number: '6008 9432-1861 6910', note: 'points 1200', member: 'O. Bonne' };
    r = await call({ image: IMG });
    const sent = calls[0] && JSON.parse(calls[0].opts.body);
    ok('the photo goes to the vision model, as an image part', sent && sent.model === 'test-vision-model' && sent.messages[0].content.some(p => p.type === 'image_url' && p.image_url.url === IMG), sent && sent.model);
    ok('the name comes back as short plain text', r.code === 200 && r.body.name === 'Flybuys script', JSON.stringify(r.body));
    ok('…the number as digits only, spaces and dashes dropped', r.body.number === '6008943218616910', JSON.stringify(r.body));
    ok('…and nothing else the model said leaves (no points, no member name)', JSON.stringify(Object.keys(r.body).sort()) === '["name","number"]', JSON.stringify(Object.keys(r.body)));
    reply = { name: '', number: '' };
    r = await call({ image: IMG });
    ok('a photo that is not a card is { name:"", number:"" }, not an error', r.code === 200 && r.body.name === '' && r.body.number === '', JSON.stringify(r.body));
    reply = { name: 'Everyday Rewards', number: 'ABC 1234 call 1300 000' };
    r = await call({ image: IMG });
    ok('a "number" that is not a run of digits becomes "" — never cut down to look like one', r.code === 200 && r.body.number === '' && r.body.name === 'Everyday Rewards', JSON.stringify(r.body));
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
    ok('no log line holds the photo, the number or the reply\'s words', !all.includes('AAAA') && !/6008|flybuys|everyday|points|bonne|not json/i.test(all), all.slice(0, 300));
  } catch (e) { ok('suite ran to the end', false, e.message.slice(0, 300)); }
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
