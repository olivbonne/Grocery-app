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
process.env.GROQ_MODEL = 'test-text-model';   // v1.91: the text model is a setting too, so the suite sets it
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
let groqErrBody = '{}';   /* v1.91: what a failing upstream SAYS decides which error the app shows */
let pages = {};
/* v1.93: the endpoint may now call the model MORE THAN ONCE — an overloaded model is retried. A
   single fixed reply cannot express "503, then 200", which is the whole behaviour of this version,
   so the stub can be handed a queue of replies it shifts through. Empty queue = the old behaviour. */
let modelQueue = [];
const realFetch = globalThis.fetch;
const modelBody = (reply) => JSON.stringify({ choices: [{ message: {
  content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] });
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  /* v1.92: the stub answers for EITHER provider's chat-completions endpoint. Routing only on
     api.groq.com would drop a Gemini call into the page-fetch branch below and every provider
     check would fail for the wrong reason. */
  if (String(url).indexOf('api.groq.com') >= 0 || String(url).indexOf('generativelanguage.googleapis.com') >= 0) {
    if (modelQueue.length) {
      const q = modelQueue.shift();
      if (q.status !== 200) return new Response(q.body === undefined ? '{}' : q.body, { status: q.status });
      return new Response(modelBody(q.reply === undefined ? groqReply : q.reply),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (groqStatus !== 200) return new Response(groqErrBody, { status: groqStatus });
    const content = typeof groqReply === 'string' ? groqReply : JSON.stringify(groqReply);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const p = pages[String(url)];
  if (!p) return new Response('not found', { status: 404 });
  if (p.redirect) return new Response(null, { status: 302, headers: { location: p.redirect } });
  return new Response(p.body, { status: p.status || 200, headers: { 'content-type': p.type || 'text/html' } });
};
const reset = () => { calls = []; modelQueue = []; groqStatus = 200; groqErrBody = '{}'; pages = {}; groqReply = { title: 'Stew', servings: 4, items: [{ name: 'onion', qty: 2, weight: '', category: 'vegetable' }] }; };

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

  /* ── which provider (v1.92) ────────────────────────────────────────────────
     Two keys, one code path. Gemini wins when both are set, because a key someone went and made
     is the one they meant to use. What must hold: the call goes to the right host, carries the
     RIGHT key (sending the Groq key to Google would be both broken and a leak), and uses that
     provider's model. And the Groq path must be exactly as it was — everything below this
     section is the Groq path, and it is the regression guard. */
  reset();
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  r = await call({ text: 'onions' });
  ok('a GEMINI_API_KEY sends the call to Google, not to Groq',
    r.code === 200 && calls[0].url.indexOf('generativelanguage.googleapis.com') >= 0, calls[0] && calls[0].url);
  ok('…carrying the Gemini key, never the Groq one',
    calls[0].opts.headers.authorization === 'Bearer test-gemini-key'
    && calls[0].opts.headers.authorization.indexOf(process.env.GROQ_API_KEY) < 0,
    calls[0].opts.headers.authorization);
  /* SUPERSEDED by v1.93: this named gemini-3.8-flash, which was answering "high demand" to most
     calls and allows 20 requests a day on the free tier. The default is now gemini-3.5-flash-lite —
     500 a day, and multimodal, so the photo path still works. The thing that has to hold is
     unchanged: Gemini's own default, never GROQ_MODEL. */
  ok('…and Gemini\'s own default model, not GROQ_MODEL',
    JSON.parse(calls[0].opts.body).model === 'gemini-3.5-flash-lite', JSON.parse(calls[0].opts.body).model);

  reset();
  process.env.GEMINI_MODEL = 'test-gemini-model';
  r = await call({ text: 'onions' });
  ok('GEMINI_MODEL overrides that default, so the next retirement is a setting',
    JSON.parse(calls[0].opts.body).model === 'test-gemini-model', JSON.parse(calls[0].opts.body).model);

  reset();
  r = await call({ image: IMG });
  ok('on Gemini a PHOTO uses the same model as text — there is no second model to configure',
    r.code === 200 && JSON.parse(calls[0].opts.body).model === 'test-gemini-model',
    JSON.parse(calls[0].opts.body).model);

  reset(); groqStatus = 400;
  r = await call({ image: IMG });
  ok('…so a Gemini photo failure never blames GROQ_VISION_MODEL, a setting that does not exist there',
    r.code === 502 && r.body.code !== 'vision_model' && (r.body.code === 'model' || r.body.code === 'upstream'),
    JSON.stringify(r.body));
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_API_KEY;

  reset();
  r = await call({ text: 'onions' });
  ok('with only a GROQ_API_KEY the call still goes to Groq, unchanged',
    r.code === 200 && calls[0].url.indexOf('api.groq.com') >= 0
    && calls[0].opts.headers.authorization === 'Bearer test-key'
    && JSON.parse(calls[0].opts.body).model === 'test-text-model', calls[0] && calls[0].url);

  delete process.env.GROQ_API_KEY;
  reset();
  r = await call({ text: 'onions' });
  ok('with NEITHER key it is still not configured, not a parse failure',
    r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));
  process.env.GROQ_API_KEY = key;

  // ── pasted text ───────────────────────────────────────────────────────────
  reset();
  r = await call({ text: 'Beef stew\n2 onions\n500g beef' });
  ok('pasted text is parsed', r.code === 200 && r.body.items.length === 1, JSON.stringify(r.body));
  /* SUPERSEDED by v1.91: this named llama-3.1-8b-instant, which Groq shut down on 2026-08-16 — so the
     check that was meant to prove "the text model, not the vision one" instead pinned the app to a dead
     model and would have broken again on the next retirement. It asks the endpoint what it is configured
     to use, which is the thing that actually has to hold: the text model, never the vision one, and JSON
     asked for explicitly. GROQ_MODEL is set at the top of this file, so the literal below is the test's
     own value, not a model name compiled into the app. */
  ok('…by the text model, with a JSON response format asked for', (() => {
    const b = JSON.parse(calls[0].opts.body);
    return b.model === 'test-text-model' && b.model !== process.env.GROQ_VISION_MODEL
      && b.response_format && b.response_format.type === 'json_object';
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

  /* v1.91: Groq shut down llama-3.1-8b-instant on 2026-08-16 and this endpoint answered "Parse failed"
     to every call for three weeks. The upstream says exactly what happened; the only reason nobody
     could see it was that we threw the body away. Now it is read, logged, and named. */
  reset(); groqStatus = 400;
  groqErrBody = JSON.stringify({ error: { message: 'The model `llama-3.1-8b-instant` has been decommissioned', code: 'model_decommissioned' } });
  r = await call({ text: 'onions' });
  ok('a retired model is named, not hidden as a generic parse failure',
    r.code === 502 && r.body.code === 'model', JSON.stringify(r.body));
  ok('…without the upstream body reaching the client',
    !/llama|decommissioned/i.test(JSON.stringify(r.body)), JSON.stringify(r.body));

  /* v1.92: Google words the same thing entirely differently, and the whole value of naming this
     failure is lost if only one provider's phrasing is recognised. A wrong GEMINI_MODEL is the most
     likely way this endpoint breaks for someone setting it up, so it is the case that must not fall
     through to "couldn't read that". */
  reset(); groqStatus = 400;
  groqErrBody = JSON.stringify({ error: { code: 404, status: 'NOT_FOUND',
    message: 'models/gemini-9.9-flash is not found for API version v1beta, or is not supported for generateContent' } });
  r = await call({ text: 'onions' });
  ok('Google\'s wording for a model that is gone reaches the same message',
    r.code === 502 && r.body.code === 'model', JSON.stringify(r.body));

  reset(); groqStatus = 500; groqErrBody = 'gateway blew up';
  r = await call({ text: 'onions' });
  ok('…while any other upstream failure stays generic', r.body.code === 'upstream', JSON.stringify(r.body));

  /* The regex must not be so eager that a real content failure gets blamed on the model.
     SUPERSEDED by v1.93: a 503 used to read as a generic 'upstream'. It now reads as 'busy' — the
     model is queueing, which is a different thing to say and a different thing to do about it. What
     still has to hold is that it is NOT blamed on the model being gone. */
  reset(); groqStatus = 503; groqErrBody = 'upstream connect error or disconnect/reset before headers';
  r = await call({ text: 'onions' });
  ok('…and a transport failure is not blamed on the model being gone',
    r.body.code === 'busy' && r.body.code !== 'model', JSON.stringify(r.body));

  /* ── v1.93: an overloaded model is waited out, not reported ────────────────
     The production logs were full of `gemini 503 … "This model is currently experiencing high
     demand"`, and the app told people it could not read their list. A queue is not a failure of
     the input, and most of the time it clears in a second. */
  reset();
  modelQueue = [{ status: 503, body: JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }) }, { status: 200 }];
  r = await call({ text: 'onions' });
  ok('a 503 is retried, and a success on the second attempt is just a normal answer',
    r.code === 200 && r.body.items.length === 1, JSON.stringify({ c: r.code, b: r.body }));
  ok('…having actually called the model twice', calls.length === 2, calls.length);

  reset(); groqStatus = 503;
  groqErrBody = JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand. Please try again later.' } });
  r = await call({ text: 'onions' });
  ok('an overload that outlasts the retries is named "busy", not "upstream" and not "model"',
    r.code === 502 && r.body.code === 'busy', JSON.stringify(r.body));

  /* "Wait a moment" and "wait until tomorrow" are different advice, so they are different codes. */
  reset(); groqStatus = 429; groqErrBody = '{}';
  r = await call({ text: 'onions' });
  ok('a 429 is "quota", not "busy"', r.code === 502 && r.body.code === 'quota', JSON.stringify(r.body));

  reset(); groqStatus = 400;
  groqErrBody = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for this model' } });
  r = await call({ text: 'onions' });
  ok('…and a body naming RESOURCE_EXHAUSTED is "quota" whatever the status was',
    r.code === 502 && r.body.code === 'quota', JSON.stringify(r.body));

  /* The retry loop is where a timeout is easiest to lose: the first draft of it dropped the abort
     signal the single-shot call used to carry. A model that accepts the connection and then goes
     quiet would hold the function open until Vercel killed it at 60s — and a 504 says nothing at
     all to the person waiting, which is the exact failure this version exists to remove. */
  reset();
  r = await call({ text: 'onions' });
  const sig = calls[0] && calls[0].opts && calls[0].opts.signal;
  ok('every model call carries an abort signal, so a silent model cannot hold the function open',
    !!sig && typeof sig.aborted === 'boolean', String(sig && sig.constructor && sig.constructor.name));

  /* And when that abort fires, it has to come back as a reachability failure rather than a hang. */
  reset();
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  r = await call({ text: 'onions' });
  globalThis.fetch = prevFetch;
  ok('a model call that times out is reported, not left hanging',
    r.code === 502 && !!r.body.code, JSON.stringify(r.body));

  /* Retrying something that answers the same way every time only spends the function's clock. */
  reset(); groqStatus = 400;
  groqErrBody = JSON.stringify({ error: { message: 'The model `llama-3.1-8b-instant` has been decommissioned', code: 'model_decommissioned' } });
  r = await call({ text: 'onions' });
  ok('a model that is gone is still "model" under the retry logic',
    r.code === 502 && r.body.code === 'model', JSON.stringify(r.body));
  ok('…and is NOT retried — a permanent failure is answered once', calls.length === 1, calls.length);
  groqErrBody = '{}';

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
  /* SUPERSEDED by v1.91: was pinned to the retired llama-3.1-8b-instant — see the note above. */
  ok('…by the text model, not the vision one',
    db.model === 'test-text-model' && db.model !== process.env.GROQ_VISION_MODEL, db.model);
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
