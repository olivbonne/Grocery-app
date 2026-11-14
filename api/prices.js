// api/prices.js — Vercel Node serverless function (CommonJS). v3.19.
//
// Shelf prices from Coles, Woolworths and ALDI, through Apify (a paid scraping service) — docs/price-feed.md.
//
// Contract:  POST /api/prices  { mode:"search", chain:"coles"|"woolworths"|"aldi", q }      q: an item name, at most 60 chars
//            ->  { products: [{ id, name, size, price, was, promo }] }                        at most 8
//            POST /api/prices  { mode:"refresh", pins:[{ chain, id }] }                       at most 60 pins
//            ->  { prices: [{ chain, id, name, size, price, was, promo }], missing: [ids] }
//            errors are { error, code }: bad_body, bad_mode, bad_chain, missing, too_many, not_configured, feed_key,
//            feed_credit, feed_actor, feed_shape, timeout, upstream, unexpected.
//
// Env: APIFY_TOKEN (secret, sent only as an Authorization header — never in a URL), APIFY_ACTOR_COLES / _WOOLWORTHS / _ALDI
// (the actor ids, "user/name" or "user~name"), optional APIFY_INPUT_COLES / _WOOLWORTHS / _ALDI: a JSON input template where
// the strings "{q}" (the search word) and "{ids}" (the product ids, a JSON array) are replaced as JSON values.
//
// THE DEFAULTS ARE GUESSES. Apify cannot be reached from the development environment, so the actors' input and output were
// never seen. Search defaults to {"searchTerms":["{q}"],"maxItems":8}, refresh to {"productIds":{ids}}; the output is read
// tolerantly (pick() below). When the mapping is wrong the call fails with feed_shape, which lib/report.js turns into an issue.
//
// Never logged: the token, the search word, the products. Only codes and counts.

const { guard, cors } = require('../lib/guard.js');
const { reportFailure } = require('../lib/report');
const CHAINS = ['coles', 'woolworths', 'aldi'];
const BUDGET_MS = 45000;   // maxDuration is 60 (vercel.json)
const MAX_PINS = 60, MAX_PRODUCTS = 8;
const DEFAULT_INPUT = { search: '{"searchTerms":["{q}"],"maxItems":8}', refresh: '{"productIds":{ids}}' };

function fail(res, status, code, error) {
  res.status(status).json({ error: error || 'Price feed failed', code });
  return reportFailure('prices', status, code);   // v3.11 (H3)
}

/* A path like "price.now" read from an object; the first one present wins. */
function get(o, path) { let v = o; for (const k of path.split('.')) { if (v == null || typeof v !== 'object') return undefined; v = v[k]; } return v; }
function pick(o, paths) { for (const p of paths) { const v = get(o, p); if (v !== undefined && v !== null && v !== '') return v; } return undefined; }
function money(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') { const m = v.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
  return NaN;
}
/* the first path that holds a usable price ("price" may be an object like { now, was }) */
function pickPrice(o, paths) { for (const p of paths) { const v = okPrice(get(o, p)); if (v !== null) return v; } return null; }
function okPrice(v) { const n = money(v); return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null; }
function truthy(v) { if (typeof v === 'string') return /^(true|yes|1|y|special|on special)$/i.test(v.trim()); return !!v; }
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

function readRow(x) {
  if (!x || typeof x !== 'object') return null;
  const id = clean(pick(x, ['id', 'productId', 'stockcode', 'sku', 'stockCode', 'product_id']), 64);
  const price = pickPrice(x, ['price', 'currentPrice', 'price.now', 'pricing.now', 'priceNow', 'salePrice']);
  if (!id || price === null) return null;
  const was = pickPrice(x, ['wasPrice', 'price.was', 'pricing.was', 'was']);
  return {
    id,
    name: clean(pick(x, ['name', 'title', 'productName', 'displayName']), 120),
    size: clean(pick(x, ['size', 'packageSize', 'package_size', 'unit_size', 'unitSize']), 40),
    price,
    was: was !== null && was > price ? was : 0,
    promo: truthy(pick(x, ['isOnSpecial', 'onSpecial', 'promotion', 'special'])),
  };
}

/* The input template with "{q}" / {ids} replaced as JSON values; null when the template is not valid JSON. */
function buildInput(chain, mode, q, ids) {
  const tpl = process.env['APIFY_INPUT_' + chain.toUpperCase()] || DEFAULT_INPUT[mode];
  const s = tpl.replace(/"\{q\}"/g, JSON.stringify(q || '')).replace(/"\{ids\}"|\{ids\}/g, JSON.stringify(ids || []));
  try { return JSON.parse(s); } catch (e) { return null; }
}

/* One actor run. Returns { rows } or { code, status }. */
async function runActor(chain, input, deadline) {
  const actor = process.env['APIFY_ACTOR_' + chain.toUpperCase()];
  if (!actor) return { code: 'not_configured', status: 500 };
  const left = deadline - Date.now();
  if (left < 1000) return { code: 'timeout', status: 504 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), left);
  let r;
  try {
    r = await fetch('https://api.apify.com/v2/acts/' + encodeURIComponent(actor.trim().replace(/\//g, '~')) + '/run-sync-get-dataset-items', {
      method: 'POST',
      signal: ctl.signal,
      headers: { authorization: 'Bearer ' + process.env.APIFY_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (e) {
    clearTimeout(timer);
    const to = e && e.name === 'AbortError';
    console.error('prices ' + chain + ' ' + (to ? 'timed out' : 'net fail'));
    return to ? { code: 'timeout', status: 504 } : { code: 'upstream', status: 502 };
  }
  clearTimeout(timer);
  if (!r.ok) {
    const code = (r.status === 401 || r.status === 403) ? 'feed_key' : r.status === 402 ? 'feed_credit' : r.status === 404 ? 'feed_actor'
      : (r.status === 408 || r.status === 504) ? 'timeout' : 'upstream';
    console.error('prices ' + chain + ' apify ' + r.status + ' ' + code);   // never the reply's text
    return { code, status: code === 'timeout' ? 504 : 502 };
  }
  let data;
  try { data = await r.json(); } catch (e) { console.error('prices ' + chain + ' reply was not JSON'); return { code: 'feed_shape', status: 502 }; }
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
  if (!list) { console.error('prices ' + chain + ' reply was not a list'); return { code: 'feed_shape', status: 502 }; }
  const rows = list.map(readRow).filter(Boolean);
  if (list.length && !rows.length) { console.error('prices ' + chain + ' ' + list.length + ' rows, none with an id and a price'); return { code: 'feed_shape', status: 502 }; }
  return { rows, n: list.length };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed', code: 'method' }); return; }
    const gate = await guard(req, 'prices');
    if (gate.block) { res.status(gate.status).json({ error: gate.error, code: gate.code }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return fail(res, 400, 'bad_body', 'Invalid JSON body'); } }
    body = body || {};
    const mode = body.mode;
    if (mode !== 'search' && mode !== 'refresh') return fail(res, 400, 'bad_mode', 'Unknown mode');
    if (!process.env.APIFY_TOKEN) return fail(res, 500, 'not_configured', 'Server not configured');
    const deadline = Date.now() + BUDGET_MS;

    if (mode === 'search') {
      const chain = String(body.chain || '').toLowerCase();
      if (!CHAINS.includes(chain)) return fail(res, 400, 'bad_chain', 'Unknown chain');
      const q = clean(body.q, 60);
      if (!q) return fail(res, 400, 'missing', 'Missing search');
      const input = buildInput(chain, 'search', q, []);
      if (!input) { console.error('prices ' + chain + ' input template is not JSON'); return fail(res, 500, 'not_configured', 'Server not configured'); }
      const out = await runActor(chain, input, deadline);
      if (out.code) return fail(res, out.status, out.code);
      console.log('prices search ' + chain + ' ' + out.rows.length + ' of ' + out.n);
      res.status(200).json({ products: out.rows.slice(0, MAX_PRODUCTS) });
      return;
    }

    const pins = Array.isArray(body.pins) ? body.pins : null;
    if (!pins || !pins.length) return fail(res, 400, 'missing', 'Missing pins');
    if (pins.length > MAX_PINS) return fail(res, 400, 'too_many', 'Too many pins');
    const by = {};
    for (const p of pins) {
      const chain = String((p && p.chain) || '').toLowerCase(), id = clean(p && p.id, 64);
      if (!CHAINS.includes(chain) || !id) continue;
      (by[chain] = by[chain] || new Set()).add(id);
    }
    const chains = Object.keys(by);
    if (!chains.length) return fail(res, 400, 'missing', 'Missing pins');
    const results = await Promise.all(chains.map(async (chain) => {
      const ids = [...by[chain]];
      const input = buildInput(chain, 'refresh', '', ids);
      if (!input) { console.error('prices ' + chain + ' input template is not JSON'); return { chain, ids, code: 'not_configured', status: 500 }; }
      return Object.assign({ chain, ids }, await runActor(chain, input, deadline));
    }));
    const prices = [], missing = [];
    let firstErr = null;
    for (const r of results) {
      if (r.code) { if (!firstErr) firstErr = r; missing.push(...r.ids); continue; }
      const seen = new Set();
      for (const row of r.rows) { if (!r.ids.includes(row.id) || seen.has(row.id)) continue; seen.add(row.id); prices.push(Object.assign({ chain: r.chain }, row)); }
      r.ids.forEach((id) => { if (!seen.has(id)) missing.push(id); });
    }
    /* every chain failed: the call failed. Some did: what came back is returned, the rest listed as missing. */
    if (firstErr && !prices.length) return fail(res, firstErr.status, firstErr.code);
    if (firstErr) reportFailure('prices', firstErr.status, firstErr.code);
    console.log('prices refresh ' + prices.length + ' found, ' + missing.length + ' missing');
    res.status(200).json({ prices, missing });
  } catch (e) {
    console.error('prices unexpected ' + String(e && e.message).slice(0, 200));
    return fail(res, 502, 'unexpected', 'Price feed failed');
  }
};
