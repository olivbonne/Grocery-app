/* api/recipe-search.js — a Node test, not a browser one. `node .claude/tests/api-recipe-search.js`;
   no server and no network, because the calls it makes outward are stubbed.

   WHY THIS EXISTS: the endpoint has two sources and the app behaves differently for each — a web result
   is a page to fetch, a model suggestion is a dish to write out. Getting the `source` field wrong would
   have the app fetching URLs that do not exist, or telling the user something came from the web when it
   did not. It also hands back URLs that THIS DEPLOYMENT will later fetch, so the same host guard as
   /api/recipe applies here and is checked here.

   WHAT THESE CHECKS HAVE TO PROVE:
   - with a search key: a real search is made, with the key in a header and never in the query;
   - a result pointing anywhere only the server can reach is dropped before it is ever handed back;
   - without a search key: the model is asked instead, and the answer is labelled "model", not "web" —
     the app tells the user which it got, so this field carries weight;
   - a rejected search key is named, while any other search failure falls through to the model rather
     than leaving the feature dead;
   - the answer is untrusted: titles, notes and counts are all coerced. */
process.env.GROQ_API_KEY = 'test-groq-key';
const handler = require('../../api/recipe-search.js');

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

let calls = [];
let brave = { status: 200, body: { web: { results: [
  { title: 'Best Beef Goulash', url: 'https://recipes.example.com/goulash', description: 'A <b>classic</b> stew' },
  { title: 'Quick Goulash', url: 'https://cooking.example.org/quick', description: 'Weeknight version' } ] } } };
let groq = { status: 200, content: JSON.stringify({ results: [
  { title: 'Classic beef goulash', note: 'Paprika-heavy, slow cooked' },
  { title: 'Quick weeknight goulash', note: 'Under an hour' } ] }) };

globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  if (String(url).indexOf('api.search.brave.com') >= 0) {
    return new Response(JSON.stringify(brave.body), { status: brave.status, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: groq.content } }] }),
    { status: groq.status, headers: { 'content-type': 'application/json' } });
};
const reset = () => { calls = []; };

(async () => {
  // ── basics ────────────────────────────────────────────────────────────────
  reset();
  let r = await call({ q: 'goulash' }, 'GET');
  ok('a GET is refused', r.code === 405, r.code);
  r = await call({});
  ok('an empty search is a 400', r.code === 400 && r.body.code === 'missing', JSON.stringify(r.body));
  r = await call({ q: 'x'.repeat(200) });
  ok('an absurdly long search is refused', r.code === 400 && r.body.code === 'too_long', JSON.stringify(r.body));
  ok('…without calling out', calls.length === 0, calls.length);

  // ── with a web-search key ─────────────────────────────────────────────────
  process.env.SEARCH_API_KEY = 'test-search-key';
  reset();
  r = await call({ q: 'beef goulash' });
  ok('a search key means a real web search', r.code === 200 && r.body.source === 'web', JSON.stringify(r.body && r.body.source));
  ok('…with two results carried through', r.body.results.length === 2, JSON.stringify(r.body.results.map(x => x.title)));
  ok('…each with the page to read', r.body.results.every(x => /^https:\/\//.test(x.url)),
    JSON.stringify(r.body.results.map(x => x.url)));
  ok('…and the site named, for the person choosing', r.body.results[0].site === 'recipes.example.com', r.body.results[0].site);
  ok('…with markup stripped out of the blurb', !/[<>]/.test(r.body.results[0].note), r.body.results[0].note);
  const braveCall = calls.find(c => c.url.indexOf('brave') >= 0);
  ok('the key travels in a header, never in the query string',
    braveCall && braveCall.opts.headers['x-subscription-token'] === 'test-search-key'
    && braveCall.url.indexOf('test-search-key') < 0, braveCall && braveCall.url.slice(0, 70));
  ok('…and the search actually asks for a recipe', /recipe/i.test(braveCall.url), braveCall.url.slice(0, 80));

  /* A search engine can return anything, including something pointing back inside this network — and
     the app feeds the URL it gets straight back to /api/recipe to be fetched. Drop it here too. */
  reset();
  brave = { status: 200, body: { web: { results: [
    { title: 'Inside', url: 'http://169.254.169.254/latest/meta-data/', description: '' },
    { title: 'Also inside', url: 'http://192.168.0.10/recipe', description: '' },
    { title: 'Local file', url: 'file:///etc/passwd', description: '' },
    { title: 'Fine', url: 'https://recipes.example.com/ok', description: '' } ] } } };
  r = await call({ q: 'goulash' });
  ok('a result pointing somewhere only the server can reach is dropped',
    r.code === 200 && r.body.results.length === 1 && r.body.results[0].title === 'Fine',
    JSON.stringify(r.body.results.map(x => x.url)));

  reset();
  brave = { status: 200, body: { web: { results: [] } } };
  r = await call({ q: 'nonsense dish' });
  ok('a search with nothing in it says so', r.code === 404 && r.body.code === 'no_results', JSON.stringify(r.body));

  reset();
  brave = { status: 401, body: {} };
  r = await call({ q: 'goulash' });
  ok('a rejected search key is named, not hidden as a generic failure',
    r.code === 502 && r.body.code === 'search_key', JSON.stringify(r.body));

  /* Any other search failure should not kill the feature — the model can still suggest something. */
  reset();
  brave = { status: 500, body: {} };
  r = await call({ q: 'goulash' });
  ok('any other search failure falls through to the model rather than dying',
    r.code === 200 && r.body.source === 'model', JSON.stringify({ c: r.code, s: r.body && r.body.source }));

  // ── without a web-search key ──────────────────────────────────────────────
  delete process.env.SEARCH_API_KEY;
  reset();
  r = await call({ q: 'goulash' });
  ok('with no search key the model is asked instead', r.code === 200 && r.body.source === 'model',
    JSON.stringify(r.body && r.body.source));
  ok('…and it is NOT labelled as coming from the web', r.body.source !== 'web', r.body.source);
  ok('…its suggestions have no page behind them', r.body.results.every(x => x.url === ''),
    JSON.stringify(r.body.results.map(x => x.url)));
  ok('…and nothing was asked of a search engine', !calls.some(c => c.url.indexOf('brave') >= 0),
    JSON.stringify(calls.map(c => c.url.slice(0, 40))));

  const key = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  reset();
  r = await call({ q: 'goulash' });
  ok('with neither key it says it is not set up', r.code === 500 && r.body.code === 'not_configured', JSON.stringify(r.body));
  process.env.GROQ_API_KEY = key;

  // ── the answer is untrusted ───────────────────────────────────────────────
  reset();
  groq = { status: 200, content: JSON.stringify({ results: [
    { title: 'y'.repeat(200), note: 'n'.repeat(400) },
    { title: '', note: 'dropped' },
    { title: 'Fine one', note: 'ok' },
    ...Array.from({ length: 20 }, (_, i) => ({ title: 'extra ' + i, note: '' })) ] }) };
  r = await call({ q: 'goulash' });
  ok('runaway titles and notes are cut to length',
    r.body.results[0].title.length === 90 && r.body.results[0].note.length === 120,
    JSON.stringify({ t: r.body.results[0].title.length, n: r.body.results[0].note.length }));
  ok('a nameless suggestion is dropped', !r.body.results.some(x => !x.title), JSON.stringify(r.body.results.length));
  ok('and the list is capped', r.body.results.length <= 8, r.body.results.length);

  reset();
  groq = { status: 200, content: 'not json at all' };
  r = await call({ q: 'goulash' });
  ok('an unreadable answer is an error, not a crash', r.code === 502 && r.body.code === 'unreadable', JSON.stringify(r.body));

  let pass = 0; results.forEach(([n, c, x]) => { if (c) pass++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? '   ' + x : '')); });
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
