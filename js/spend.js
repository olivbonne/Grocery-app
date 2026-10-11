/* v2.24 What we spend (the app review's R20). The logic, in its own module like js/tenpct.js and js/compare.js: pure
   functions, no imports — the app passes in what they need.

   A receipt is logged when it is saved (spendEntry → spendLog): when, where, what was paid, and its lines by category.
   Receipts read before v2.24 are rebuilt from the price memory (spendFromPrices). Its records carry the time the receipt
   was saved, so one receipt's lines group together — but the memory keeps at most eight prices an item, and one of two
   identical lines, so those entries are estimates (est) and the app says "about". */

export const SPEND_MAX = 400;   // receipts kept in the list: years of a household's shops, about 150 bytes each

const r2 = x => Math.round((+x || 0) * 100) / 100;

/* "2026-10-05" → "2026-10"; "" for anything that is not a date */
export function monthKey(d){ const m = String(d || "").slice(0, 7); return /^\d{4}-\d{2}$/.test(m) ? m : ""; }
export function prevMonth(m){ const [y, mo] = String(m).split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; }

/* one saved receipt → one entry. What was paid is the receipt's own total when it read one that agrees with its lines
   (at least half of the lines less the discounts, at most twice the lines); otherwise the lines less the discounts. */
export function spendEntry({ t, d, s, sn, total, lines, discounts }){
  const c = {}; let sum = 0, n = 0;
  for(const L of (lines || [])){ const p = +L.price; if(!(p > 0)) continue; const k = L.cat || "others"; c[k] = r2((c[k] || 0) + p); sum += p; n++; }
  const disc = r2((discounts || []).reduce((a, x) => a + ((+x.amount > 0) ? +x.amount : 0), 0));
  const net = Math.max(0, sum - disc), T = +total;
  const tot = (T > 0 && T >= net * 0.5 && T <= sum * 2 + 1) ? r2(T) : r2(net);
  const e = { t:+t || 0, d:String(d || ""), s:String(s || ""), sn:String(sn || ""), tot, c, n };
  if(disc > 0) e.disc = disc;
  return e;
}

/* the log with one more receipt: one entry per receipt (by its time), oldest first, at most max */
export function spendLog(log, entry, max){
  const a = (Array.isArray(log) ? log : []).filter(e => e && e.t !== entry.t);
  a.push(entry); a.sort((x, y) => (x.t || 0) - (y.t || 0));
  return a.slice(-(max || SPEND_MAX)); }

/* the receipts the log does not have, rebuilt from the price memory { key: [{ p, s, sn, d, q, w, t }] } */
export function spendFromPrices(prices, logged, catOf){
  const have = new Set((logged || []).map(e => e && e.t)), g = new Map();
  for(const [k, recs] of Object.entries(prices || {})) for(const r of (Array.isArray(recs) ? recs : [])){
    if(!r || !r.t || have.has(r.t) || !(+r.p > 0) || !monthKey(r.d)) continue;
    let e = g.get(r.t); if(!e){ e = { t:r.t, d:r.d, s:r.s || "", sn:r.sn || "", tot:0, c:{}, n:0, est:1 }; g.set(r.t, e); }
    const cat = (catOf && catOf(k)) || "others"; e.c[cat] = r2((e.c[cat] || 0) + (+r.p)); e.tot = r2(e.tot + (+r.p)); e.n++; }
  return [...g.values()]; }

/* the months that have any spending, newest first */
export function spendMonths(entries){ return [...new Set((entries || []).map(e => monthKey(e && e.d)).filter(Boolean))].sort().reverse(); }

/* one month: what was paid, at which stores, on what */
export function spendMonth(entries, month){
  const es = (entries || []).filter(e => e && monthKey(e.d) === month), st = new Map(), cats = {};
  let tot = 0, est = false;
  for(const e of es){ tot += +e.tot || 0; if(e.est) est = true;
    const k = e.s || e.sn || "?", x = st.get(k) || { sn:e.sn || "A shop", tot:0, n:0 }; x.tot += +e.tot || 0; x.n++; st.set(k, x);
    for(const [c, a] of Object.entries(e.c || {})) cats[c] = (cats[c] || 0) + (+a || 0); }
  return { month, tot:r2(tot), n:es.length, est,
    stores:[...st.values()].map(x => ({ sn:x.sn, n:x.n, tot:r2(x.tot) })).sort((a, b) => b.tot - a.tot),
    cats:Object.entries(cats).map(([cat, a]) => ({ cat, tot:r2(a) })).filter(x => x.tot > 0).sort((a, b) => b.tot - a.tot) }; }
