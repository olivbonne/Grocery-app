/* api/prices.js — a Node test, not a browser one. Run it with `node .claude/tests/api-prices.js`; it needs no network:
   Apify is stubbed.

   WHY THIS EXISTS: v3.19 asks Apify (a paid scraping service) for Coles / Woolworths / ALDI shelf prices. The actors'
   inputs and outputs could not be seen from the development environment, so the reading must be tolerant, the settings
   must be env vars, and a wrong mapping must fail with a named code (lib/report.js turns it into an issue).

   WHAT THESE CHECKS HAVE TO PROVE:
   - only POST, a known mode and chain, a search word, at most 60 pins; no APIFY_TOKEN or no actor for the chain is
     `not_configured`;
   - the call goes to /v2/acts/<user~name>/run-sync-get-dataset-items with the token in the Authorization header ONLY
     (never in the URL, the body, a response or a log line), the default input or the APIFY_INPUT_* template;
   - the reply is read tolerantly (id/productId/stockcode, name/title, price as a number, a "$4.50" string or {now, was});
     rows with no id or no price are dropped; rows but none usable is `feed_shape`;
   - Apify 401 → feed_key, 402 → feed_credit, 404 → feed_actor, other → upstream, a hang → timeout (504);
   - refresh groups pins by chain, returns what came back and lists the rest as missing; every chain failing fails the call;
   - no log line holds the search word or a product name. */
const path = require('path');
const TOKEN = 'apify_api_TESTTOKEN_never_shown';
process.env.APIFY_TOKEN = TOKEN;
process.env.APIFY_ACTOR_COLES = 'someone/coles-scraper';
process.env.APIFY_ACTOR_ALDI = 'other~aldi';
delete process.env.APIFY_ACTOR_WOOLWORTHS;
const handler = require(path.join(__dirname, '..', '..', 'api', 'prices.js'));

const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
function mkRes() { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; }
const call = async (body, method) => { const res = mkRes(); await handler({ method: method || 'POST', body, headers: {} }, res); return res; };

let calls = [], reply = [], status = 200, hang = false;
globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  if (/github/.test(String(url))) return new Response('{}', { status: 201 });
  calls.push({ url: String(url), opts, body: opts.body ? JSON.parse(opts.body) : null });
  if (hang) return new Promise((res, rej) => { if (opts.signal) opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const r = typeof reply === 'function' ? reply(String(url), opts) : reply;
  if (status !== 200) return new Response('{"error":"x"}', { status });
  return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
};
const logs = []; const keep = (...a) => logs.push(a.join(' ')); console.error = keep; console.log = keep; console.warn = keep;
const out = (...a) => process.stdout.write(a.join(' ') + '\n');

(async () => {
  try {
    let r = await call({}, 'GET');
    ok('only POST', r.code === 405, r.code);
    r = await call({ mode: 'x' });
    ok('an unknown mode is bad_mode', r.code === 400 && r.body.code === 'bad_mode', JSON.stringify(r.body));
    r = await call({ mode: 'search', chain: 'iga', q: 'milk' });
    ok('an unknown chain is bad_chain', r.code === 400 && r.body.code === 'bad_chain', JSON.stringify(r.body));
    r = await call({ mode: 'search', chain: 'coles', q: '  ' });
    ok('no search word is missing', r.code === 400 && r.body.code === 'missing', JSON.stringify(r.body));
    r = await call({ mode: 'search', chain: 'woolworths', q: 'milk' });
    ok('no actor for the chain is not_configured (and nothing is asked)', r.code === 500 && r.body.code === 'not_configured' && calls.length === 0, JSON.stringify(r.body));
    delete process.env.APIFY_TOKEN; r = await call({ mode: 'search', chain: 'coles', q: 'milk' }); process.env.APIFY_TOKEN = TOKEN;
    ok('no token is not_configured', r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));

    /* a search, tolerant reading */
    calls = []; reply = [
      { id: 1, name: 'Coles Milk', size: '2L', price: 3.1 },
      { productId: 'A2', title: 'Pauls Milk', packageSize: '2L', currentPrice: '$4.50', isOnSpecial: 'true' },
      { stockcode: 'S3', productName: 'Farmers Milk', price: { now: 2.8, was: 3.4 } },
      { name: 'No id', price: 2 }, { id: 'noprice', name: 'No price' },
    ];
    r = await call({ mode: 'search', chain: 'coles', q: 'full cream milk' });
    const c0 = calls[0] || { opts: { headers: {} } };
    ok('the call goes to the actor, "/" written as "~"', /^https:\/\/api\.apify\.com\/v2\/acts\/someone~coles-scraper\/run-sync-get-dataset-items$/.test(c0.url), c0.url);
    ok('the token is in the Authorization header only, never in the URL or the body', c0.opts.headers.authorization === 'Bearer ' + TOKEN && !c0.url.includes(TOKEN) && !String(c0.opts.body).includes(TOKEN), c0.url);
    ok('the default search input is sent with the search word', JSON.stringify(c0.body) === '{"searchTerms":["full cream milk"],"maxItems":8}', JSON.stringify(c0.body));
    const p = (r.body && r.body.products) || [];
    ok('rows are read tolerantly: id/productId/stockcode, name/title/productName, a number, a "$4.50" string, {now, was}', r.code === 200 && p.length === 3
      && p[0].id === '1' && p[0].price === 3.1 && p[1].id === 'A2' && p[1].name === 'Pauls Milk' && p[1].size === '2L' && p[1].price === 4.5 && p[1].promo === true
      && p[2].id === 'S3' && p[2].price === 2.8 && p[2].was === 3.4, JSON.stringify(r.body));
    ok('…rows with no id or no price are dropped, and nothing else leaves', p.every(x => JSON.stringify(Object.keys(x).sort()) === '["id","name","price","promo","size","was"]'), JSON.stringify(p[0]));
    reply = Array.from({ length: 12 }, (_, i) => ({ id: 'x' + i, name: 'M' + i, price: 1 + i }));
    r = await call({ mode: 'search', chain: 'coles', q: 'milk' });
    ok('at most 8 products', r.body.products.length === 8, r.body.products.length);
    reply = { items: [{ id: 'w', name: 'Wrapped', price: 2 }] };
    r = await call({ mode: 'search', chain: 'coles', q: 'milk' });
    ok('a reply wrapped as { items } is read too', r.code === 200 && r.body.products.length === 1, JSON.stringify(r.body));
    reply = [{ sku: 'x', label: 'unknown fields', cost: 3 }];
    r = await call({ mode: 'search', chain: 'coles', q: 'milk' });
    ok('rows but none with an id and a price is feed_shape (502)', r.code === 502 && r.body.code === 'feed_shape', JSON.stringify(r.body));
    reply = [];
    r = await call({ mode: 'search', chain: 'coles', q: 'milk' });
    ok('no rows at all is an empty answer, not an error', r.code === 200 && r.body.products.length === 0, JSON.stringify(r.body));

    /* the input template */
    process.env.APIFY_INPUT_COLES = '{"query":"{q}","limit":5,"ids":{ids}}'; calls = []; reply = [];
    await call({ mode: 'search', chain: 'coles', q: 'oat "milk"' });
    ok('APIFY_INPUT_COLES replaces the input, the word inserted as a JSON value', calls[0] && JSON.stringify(calls[0].body) === '{"query":"oat \\"milk\\"","limit":5,"ids":[]}', calls[0] && JSON.stringify(calls[0].body));
    process.env.APIFY_INPUT_COLES = '{not json'; calls = [];
    r = await call({ mode: 'search', chain: 'coles', q: 'milk' });
    ok('a template that is not JSON is not_configured, and nothing is asked', r.code === 500 && r.body.code === 'not_configured' && calls.length === 0, JSON.stringify(r.body));
    delete process.env.APIFY_INPUT_COLES;

    /* Apify's errors */
    for (const [st, code, want] of [[401, 'feed_key', 502], [403, 'feed_key', 502], [402, 'feed_credit', 502], [404, 'feed_actor', 502], [500, 'upstream', 502]]) {
      status = st; r = await call({ mode: 'search', chain: 'coles', q: 'milk' });
      ok(`Apify ${st} is ${code}`, r.code === want && r.body.code === code, JSON.stringify([r.code, r.body]));
    }
    status = 200;

    /* refresh */
    calls = [];
    reply = (url) => /aldi/.test(url) ? [{ id: 'A1', name: 'ALDI Milk', size: '2L', price: 2.49 }] : [{ id: 'C1', name: 'Coles Milk', size: '2L', price: 3.1 }, { id: 'ZZ', name: 'Not pinned', price: 9 }];
    r = await call({ mode: 'refresh', pins: [{ chain: 'coles', id: 'C1' }, { chain: 'coles', id: 'C2' }, { chain: 'aldi', id: 'A1' }, { chain: 'coles', id: 'C1' }] });
    const cc = calls.find(c => /coles/.test(c.url));
    ok('refresh asks each chain once, with its ids (default input)', calls.length === 2 && cc && JSON.stringify(cc.body) === '{"productIds":["C1","C2"]}', JSON.stringify(calls.map(c => c.body)));
    const pr = (r.body && r.body.prices) || [];
    ok('…returns the pinned products\' prices with their chain, and lists the rest as missing', r.code === 200 && pr.length === 2 && pr.some(x => x.chain === 'coles' && x.id === 'C1' && x.price === 3.1)
      && pr.some(x => x.chain === 'aldi' && x.id === 'A1') && !pr.some(x => x.id === 'ZZ') && JSON.stringify(r.body.missing) === '["C2"]', JSON.stringify(r.body));
    r = await call({ mode: 'refresh', pins: [{ chain: 'coles', id: 'C1' }, { chain: 'woolworths', id: 'W1' }] });
    ok('a chain that fails: what came back is returned, its ids listed as missing', r.code === 200 && r.body.prices.length === 1 && JSON.stringify(r.body.missing) === '["W1"]', JSON.stringify(r.body));
    r = await call({ mode: 'refresh', pins: [{ chain: 'woolworths', id: 'W1' }] });
    ok('every chain failing fails the call', r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));
    r = await call({ mode: 'refresh', pins: Array.from({ length: 61 }, (_, i) => ({ chain: 'coles', id: 'p' + i })) });
    ok('more than 60 pins is too_many', r.code === 400 && r.body.code === 'too_many', JSON.stringify(r.body));
    r = await call({ mode: 'refresh', pins: [] });
    ok('no pins is missing', r.code === 400 && r.body.code === 'missing', JSON.stringify(r.body));

    /* a hang ends: Apify never answers; the 45 s budget's timer is made to fire at once */
    hang = true; const realST = global.setTimeout; global.setTimeout = (f, ms, ...x) => realST(f, ms >= 1000 ? 5 : ms, ...x);
    r = await call({ mode: 'search', chain: 'coles', q: 'milk' }); global.setTimeout = realST; hang = false;
    ok('Apify never answering ends as a timeout (504)', r.code === 504 && r.body.code === 'timeout', JSON.stringify([r.code, r.body]));

    ok('no log line holds the token, a search word or a product name', !logs.some(l => l.includes(TOKEN) || /cream milk|oat|Coles Milk|Pauls|ALDI Milk/.test(l)), JSON.stringify(logs.filter(l => /milk|Milk|TOKEN/.test(l)).slice(0, 3)));
  } catch (e) { ok('suite ran to the end', false, e.stack); }
  results.forEach(([n, p, x]) => out(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  out(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
