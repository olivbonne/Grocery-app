/* api/receipt.js — a Node test, not a browser one. Run it with `node .claude/tests/api-receipt.js`;
   it needs no server and no network, because the one call the endpoint makes outward is stubbed.

   WHY THIS EXISTS: v2.09 sends a photo of a household's receipt to a vision model and hands back what
   was bought and what was paid. Two things matter that no screenshot shows: the reply is untrusted
   (prices, quantities, dates and categories must be coerced, and anything else the model volunteers —
   a card number, a loyalty number — must not pass through), and a receipt is a household's shopping,
   so the endpoint must never write the photo or what it read into the server log.

   WHAT THESE CHECKS HAVE TO PROVE:
   - only POST, only a data:image photo, size-capped; a missing key says so;
   - the photo goes to the VISION model, in the multimodal shape;
   - the reply is coerced: lines without a usable price are dropped, prices round to cents, qty is
     clamped, unknown categories become "others", a bad date becomes "", lines are capped;
   - nothing but { store, date, total, items } leaves, and each line only its six fields;
   - upstream failures are named the same way the other endpoints name them (busy, quota, model,
     vision_model, unreadable);
   - no log line, on success or failure, contains the image or any of the reply's text. */
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_VISION_MODEL = 'test-vision-model';
process.env.GROQ_MODEL = 'test-text-model';
const handler = require('../../api/receipt.js');

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
/* every console.error line is captured, so the privacy checks can read what the server would log */
const logs = []; const realErr = console.error; console.error = (...a) => { logs.push(a.join(' ')); };

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);
const GOOD = { store: 'Coles Dandenong', date: '2026-10-02', total: 23.4, card: '**** 4417', flybuys: '6008 9412 3311',
  items: [
    { raw: 'WW FR RANGE EGGS 12PK', name: 'free range eggs', qty: 1, weight: '', price: 5.5, category: 'fresh', barcode: '93123' },
    { raw: 'BANANAS CAVENDISH', name: 'bananas', qty: 1, weight: '0.812 kg', price: '3.2449', category: 'fruit' },
    { raw: 'MILK 2L', name: 'milk', qty: 0, weight: '2 L', price: 3.1, category: 'dairy' },
    { raw: 'MYSTERY', name: 'mystery item', qty: 400, price: 'n/a', category: 'others' },
    { raw: 'NEG', name: 'refund', price: -2, category: 'others' },
    { raw: '', name: '', price: 1 },
  ] };

(async () => {
  try {
    /* ── shape of the request ───────────────────────────────────────── */
    let r = await call({}, 'GET');
    ok('only POST', r.code === 405, r.code);
    r = await call({});
    ok('no photo is "missing"', r.code === 400 && r.body.code === 'missing', JSON.stringify(r.body));
    r = await call({ image: 'https://example.com/receipt.jpg' });
    ok('a URL instead of a photo is refused, and never fetched', r.code === 400 && r.body.code === 'bad_image' && calls.length === 0, JSON.stringify(r.body));
    r = await call({ image: 'data:image/jpeg;base64,' + 'A'.repeat(3600000) });
    ok('an oversized photo is refused before any model call', r.code === 413 && r.body.code === 'too_large' && calls.length === 0, JSON.stringify(r.body));

    /* ── the happy path ─────────────────────────────────────────────── */
    reply = GOOD; calls = []; logs.length = 0;
    r = await call(JSON.stringify({ image: IMG }));   // the string body form, as Vercel can deliver it
    ok('a receipt is read', r.code === 200, r.code + ' ' + JSON.stringify(r.body));
    const sent = JSON.parse(calls[0].opts.body);
    ok('…by the VISION model', sent.model === 'test-vision-model', sent.model);
    ok('…in the multimodal shape, with the photo attached', Array.isArray(sent.messages[0].content)
      && sent.messages[0].content.some(p => p.type === 'image_url' && p.image_url.url === IMG), '');
    ok('…and a prompt that asks for receipts, not recipes', /receipt/i.test(sent.messages[0].content[0].text) && !/recipe/i.test(sent.messages[0].content[0].text), '');
    const b = r.body;
    ok('store, date and total come back', b.store === 'Coles Dandenong' && b.date === '2026-10-02' && b.total === 23.4, JSON.stringify({ s: b.store, d: b.date, t: b.total }));
    ok('only { store, date, total, items } leave — no card or loyalty number', JSON.stringify(Object.keys(b).sort()) === '["date","items","store","total"]'
      && !/4417|6008/.test(JSON.stringify(b)), JSON.stringify(Object.keys(b)));
    ok('each line carries only its six fields (the barcode the model added is dropped)',
      b.items.every(x => JSON.stringify(Object.keys(x).sort()) === '["category","name","price","qty","raw","weight"]'), JSON.stringify(b.items[0]));
    ok('lines with no usable price are dropped (n/a, negative, nameless)', b.items.map(x => x.name).join() === 'free range eggs,bananas,milk', b.items.map(x => x.name).join());
    ok('prices round to cents, from a string too', b.items[1].price === 3.24, b.items[1].price);
    ok('qty is clamped to at least 1', b.items[2].qty === 1, b.items[2].qty);
    ok('an unknown category becomes "others"', b.items[2].category === 'others', b.items[2].category);
    ok('the weight comes through as written', b.items[1].weight === '0.812 kg', b.items[1].weight);
    ok('nothing about the receipt reached the log', !logs.some(l => /Coles|eggs|bananas|4417|AAAA/.test(l)), JSON.stringify(logs));

    /* ── coercion at the edges ──────────────────────────────────────── */
    reply = { store: 'X'.repeat(200), date: 'yesterday', total: 'lots', items: Array.from({ length: 300 }, (_, i) => ({ name: 'item ' + i, price: 1 })) };
    r = await call({ image: IMG });
    ok('a store name is capped, a date that is not YYYY-MM-DD becomes "", a non-number total becomes 0',
      r.body.store.length <= 60 && r.body.date === '' && r.body.total === 0, JSON.stringify({ s: r.body.store.length, d: r.body.date, t: r.body.total }));
    ok('lines are capped', r.body.items.length <= 150, r.body.items.length);
    reply = '```json\n' + JSON.stringify({ store: '', date: '', total: 0, items: [] }) + '\n```';
    r = await call({ image: IMG });
    ok('a fenced reply is still read; "not a receipt" is an empty list, not an error', r.code === 200 && r.body.items.length === 0, JSON.stringify(r.body));

    /* ── failures, named, and logged without content ────────────────── */
    reply = 'Sorry, I cannot read the receipt for COLES DANDENONG, card 4417'; logs.length = 0;
    r = await call({ image: IMG });
    ok('an unreadable reply is "unreadable"', r.code === 502 && r.body.code === 'unreadable', JSON.stringify(r.body));
    ok('…and its text is not in the log, only that it failed', logs.length > 0 && !logs.some(l => /COLES|4417|Sorry/.test(l)), JSON.stringify(logs));
    status = 404; errBody = '{"error":{"message":"model not here"}}';
    r = await call({ image: IMG });
    ok('a missing Groq vision model is named as such', r.body.code === 'vision_model', JSON.stringify(r.body));
    status = 400; errBody = '{"error":{"message":"Invalid request: COLES DANDENONG eggs 4417"}}'; logs.length = 0;
    r = await call({ image: IMG });
    ok('even a provider error that echoes the request is not logged — only its status and meaning', logs.length > 0 && !logs.some(l => /COLES|eggs|4417/.test(l)), JSON.stringify(logs));
    status = 429; errBody = '{"error":{"message":"rate limit"}}';
    r = await call({ image: IMG });
    ok('a quota is "quota"', r.body.code === 'quota', JSON.stringify(r.body));
    status = 200;
    delete process.env.GROQ_API_KEY;
    r = await call({ image: IMG });
    ok('no key is "not_configured"', r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));
  } catch (e) { ok('the suite ran to the end', false, e.stack); }

  console.error = realErr;
  let pass = 0; results.forEach(([n, c, x]) => { if (c) pass++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x && !c ? '   ' + x : '')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
