/* api/recipe.js — a Node test, not a browser one. Run it with `node .claude/tests/api-recipe.js`;
   it needs no server and no network, because the one call the endpoint makes outward is stubbed.

   WHY THIS EXISTS AT ALL: v1.86 made this endpoint fetch a URL that a user typed. That is a request
   only the server can make, from inside the deployment's own network, so the guards around it are the
   most security-relevant code in the repo and the least visible in a screenshot. The browser suites
   cannot reach any of it.

   WHAT THESE CHECKS HAVE TO PROVE:
   - a link to somewhere only the server can reach is refused — loopback, private ranges, link-local
     (the cloud metadata address), and non-http schemes;
   - a PUBLIC host that redirects inward is refused too, which is the guard people forget;
   - a page is read as a page: capped, content-type checked, and schema.org Recipe JSON-LD preferred
     over the surrounding prose;
   - a photo goes to the vision model in the multimodal shape, and a missing vision model is reported
     as its own thing rather than as a generic failure — Groq's image-capable line-up changes;
   - the model's answer is untrusted: categories, quantities and lengths are all coerced;
   - a dish NAME (v1.89, for a search suggestion with no page behind it) is written out by the text
     model under its own prompt — the app must not be sent a recipe for the wrong thing. */
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_VISION_MODEL = 'test-vision-model';
const handler = require('../../api/recipe.js');

const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);

function mkRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const call = async (body, method) => {
  const res = mkRes();
  await handler({ method: method || 'POST', body }, res);
  return res;
};

/* The one outward call is stubbed. `calls` records what the endpoint actually sent, so the checks can
   assert the request shape rather than only the reply. */
let calls = [];
let groqReply = { title: 'Stew', servings: 4, items: [{ name: 'onion', qty: 2, weight: '', category: 'vegetable' }] };
let groqStatus = 200;
let pages = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  if (String(url).indexOf('api.groq.com') >= 0) {
    if (groqStatus !== 200) return new Response('{}', { status: groqStatus });
    const content = typeof groqReply === 'string' ? groqReply : JSON.stringify(groqReply);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const p = pages[String(url)];
  if (!p) return new Response('not found', { status: 404 });
  if (p.redirect) return new Response(null, { status: 302, headers: { location: p.redirect } });
  return new Response(p.body, { status: p.status || 200, headers: { 'content-type': p.type || 'text/html' } });
};
const reset = () => { calls = []; groqStatus = 200; pages = {}; groqReply = { title: 'Stew', servings: 4, items: [{ name: 'onion', qty: 2, weight: '', category: 'vegetable' }] }; };

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(200);

(async () => {
  // ── the basics ────────────────────────────────────────────────────────────
  reset();
  let r = await call({ text: 'x' }, 'GET');
  ok('a GET is refused', r.code === 405, r.code);

  r = await call({});
  ok('a body with none of text/url/image is a 400', r.code === 400 && r.body.code === 'missing', JSON.stringify(r.body));

  const key = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  r = await call({ text: 'onions' });
  ok('no API key is reported as not configured, not as a parse failure',
    r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));
  process.env.GROQ_API_KEY = key;

  // ── pasted text ───────────────────────────────────────────────────────────
  reset();
  r = await call({ text: 'Beef stew\n2 onions\n500g beef' });
  ok('pasted text is parsed', r.code === 200 && r.body.items.length === 1, JSON.stringify(r.body));
  ok('…by the text model, with a JSON response format asked for', (() => {
    const b = JSON.parse(calls[0].opts.body);
    return b.model === 'llama-3.1-8b-instant' && b.response_format && b.response_format.type === 'json_object';
  })(), calls[0] && JSON.parse(calls[0].opts.body).model);

  reset();
  r = await call({ text: 'x'.repeat(9000) });
  ok('an over-long paste is refused before it costs anything', r.code === 400 && r.body.code === 'too_long', JSON.stringify(r.body));
  ok('…without calling out', calls.length === 0, calls.length);

  // ── the link guard ────────────────────────────────────────────────────────
  for (const [what, u] of [
    ['loopback by name', 'http://localhost/r'],
    ['loopback by address', 'http://127.0.0.1/r'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['a private 10.x host', 'http://10.1.2.3/r'],
    ['a private 192.168.x host', 'http://192.168.0.1/r'],
    ['a private 172.16-31.x host', 'http://172.20.0.5/r'],
    ['an .internal host', 'http://vault.internal/r'],
    ['a .local host', 'http://printer.local/r'],
    ['a file:// URL', 'file:///etc/passwd'],
    ['a non-URL', 'not a url at all'],
  ]) {
    reset();
    r = await call({ url: u });
    ok(`a link to ${what} is refused`, r.code === 400 && (r.body.code === 'bad_url' || r.body.code === 'blocked_url'),
      JSON.stringify({ code: r.code, body: r.body }));
    ok(`…and nothing was fetched for ${what}`, calls.length === 0, calls.length);
  }

  // ── a public host that redirects inward ───────────────────────────────────
  reset();
  pages['https://recipes.example.com/x'] = { redirect: 'http://169.254.169.254/latest/meta-data/' };
  r = await call({ url: 'https://recipes.example.com/x' });
  ok('a PUBLIC link that redirects to a private address is refused at the hop',
    r.code === 400 && r.body.code === 'blocked_url', JSON.stringify(r.body));
  ok('…and the private address was never requested',
    !calls.some(c => c.url.indexOf('169.254') >= 0), JSON.stringify(calls.map(c => c.url)));

  // ── a real page ───────────────────────────────────────────────────────────
  reset();
  pages['https://recipes.example.com/goulash'] = { body: `<html><head>
    <script type="application/ld+json">{"@type":"Recipe","name":"Beef Goulash","recipeYield":"6 servings",
      "recipeIngredient":["2 pounds ground beef","2 yellow onions","3 cups tomato sauce"]}<\/script>
    </head><body><p>Lots of unrelated prose about the author's childhood.</p></body></html>` };
  r = await call({ url: 'https://recipes.example.com/goulash' });
  ok('a public recipe link is fetched and parsed', r.code === 200, JSON.stringify({ c: r.code, b: r.body }));
  const sent = JSON.parse(calls[calls.length - 1].opts.body).messages[1].content;
  ok('…using the page\'s Recipe JSON-LD rather than its prose',
    /Beef Goulash/.test(sent) && /ground beef/.test(sent) && !/childhood/.test(sent), sent.slice(0, 120));

  reset();
  pages['https://recipes.example.com/plain'] = { body: '<html><body><h1>Soup</h1><p>1 onion</p><p>2 carrots</p><p>Simmer for twenty minutes and season to taste, then serve hot.</p></body></html>' };
  r = await call({ url: 'https://recipes.example.com/plain' });
  ok('a page with no JSON-LD falls back to its text', r.code === 200, JSON.stringify(r.body));
  const sent2 = JSON.parse(calls[calls.length - 1].opts.body).messages[1].content;
  ok('…with the tags stripped', !/</.test(sent2) && /onion/.test(sent2), sent2.slice(0, 80));

  reset();
  pages['https://cdn.example.com/pic.png'] = { body: 'binary', type: 'image/png' };
  r = await call({ url: 'https://cdn.example.com/pic.png' });
  ok('a link that is not a web page says so', r.code === 502 && r.body.code === 'not_a_page', JSON.stringify(r.body));

  reset();
  r = await call({ url: 'https://recipes.example.com/missing' });
  ok('a link that will not load says so', r.body.code === 'fetch_failed', JSON.stringify(r.body));

  // ── photos ────────────────────────────────────────────────────────────────
  reset();
  r = await call({ image: 'notanimage' });
  ok('something that is not a photo is refused', r.code === 400 && r.body.code === 'bad_image', JSON.stringify(r.body));

  reset();
  r = await call({ image: 'data:image/jpeg;base64,' + 'A'.repeat(3600000) });
  ok('a photo too big for the request is refused before it is sent',
    r.code === 413 && r.body.code === 'too_large', JSON.stringify({ c: r.code, b: r.body }));
  ok('…without calling out', calls.length === 0, calls.length);

  reset();
  r = await call({ image: IMG });
  ok('a photo is parsed', r.code === 200 && r.body.items.length === 1, JSON.stringify(r.body));
  const vb = JSON.parse(calls[0].opts.body);
  ok('…by the configured vision model', vb.model === 'test-vision-model', vb.model);
  ok('…sent as an image part, not as text', Array.isArray(vb.messages[0].content)
    && vb.messages[0].content.some(p => p.type === 'image_url' && p.image_url.url === IMG),
    JSON.stringify(vb.messages[0].content && vb.messages[0].content.map(p => p.type)));

  reset(); groqStatus = 404;
  r = await call({ image: IMG });
  ok('a vision model the account cannot use is named as such, not as a parse failure',
    r.code === 502 && r.body.code === 'vision_model', JSON.stringify(r.body));
  reset(); groqStatus = 404;
  r = await call({ text: 'onions' });
  ok('…while the same upstream failure on text stays generic', r.body.code === 'upstream', JSON.stringify(r.body));

  reset();
  groqReply = '```json\n{"title":"Pie","servings":2,"items":[{"name":"apple","qty":3,"category":"fruit"}]}\n```';
  r = await call({ image: IMG });
  ok('a vision answer wrapped in a code fence is still read',
    r.code === 200 && r.body.items[0].name === 'apple', JSON.stringify(r.body));

  // ── a dish name, for a search result with no page behind it (v1.89) ──────
  reset();
  r = await call({ dish: 'Classic beef goulash' });
  ok('a named dish is written out', r.code === 200 && r.body.items.length === 1, JSON.stringify(r.body));
  const db = JSON.parse(calls[0].opts.body);
  ok('…by the text model, not the vision one', db.model === 'llama-3.1-8b-instant', db.model);
  ok('…told it is being given a NAME rather than a recipe',
    /name of a dish/i.test(db.messages[0].content), db.messages[0].content.slice(-140));
  ok('…with the dish as the user message', db.messages[1].content === 'Classic beef goulash', db.messages[1].content);

  reset();
  r = await call({ dish: '', text: 'onions and beef' });
  ok('an empty dish falls back to the text it was sent with', r.code === 200, JSON.stringify(r.body));
  ok('…using the ordinary recipe prompt', !/name of a dish/i.test(JSON.parse(calls[0].opts.body).messages[0].content));

  // ── the model's answer is untrusted ───────────────────────────────────────
  reset();
  groqReply = { title: 'x'.repeat(200), servings: 999999, items: [
    { name: 'y'.repeat(200), qty: -4, weight: 'z'.repeat(90), category: 'nonsense' },
    { name: '', qty: 1, category: 'fruit' },
    { name: 'leeks', qty: '3', category: 'VEGETABLE' },
  ] };
  r = await call({ text: 'anything' });
  const it = r.body.items;
  ok('a nonsense category becomes "others"', it[0].category === 'others', it[0].category);
  ok('a negative quantity becomes 1', it[0].qty === 1, it[0].qty);
  ok('runaway strings are cut to length',
    it[0].name.length === 60 && it[0].weight.length === 16 && r.body.title.length === 80,
    JSON.stringify({ n: it[0].name.length, w: it[0].weight.length, t: r.body.title.length }));
  ok('a nameless item is dropped', it.length === 2, JSON.stringify(it.map(x => x.name)));
  ok('a category in the wrong case is still recognised', it[1].category === 'vegetable', it[1].category);
  ok('a quantity sent as a string is read', it[1].qty === 3, it[1].qty);
  ok('an absurd serving count is clamped', r.body.servings === 99, r.body.servings);

  globalThis.fetch = realFetch;
  let pass = 0; results.forEach(([n, c, x]) => { if (c) pass++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? '   ' + x : '')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
