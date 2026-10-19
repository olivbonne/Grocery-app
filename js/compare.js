/* Market List — which store is cheaper for this list (v2.21, plan item 6), from the household's own receipts. Pure: no
   imports; js/app.js passes in the list and a price lookup.

   For each store with a recent price: what the list's items it has prices for would cost there — the latest price at
   that store, per unit, times the list's quantity. A special counts until a newer price replaces it or it is older than
   maxAgeDays. Two stores are only ever compared on the items BOTH have prices for, so a store never looks cheaper just
   because fewer of its prices are known. */
const DAY = 86400000;
const r2 = n => Math.round(n * 100) / 100;
/* one store per saved store id, or per name when the receipt's store was not a saved one */
export function storeKey(r){ return r && r.s ? "id:" + r.s : "name:" + String((r && r.sn) || "").trim().toLowerCase(); }
export function latestByStore(records, now, maxAgeDays){ const out = {};
  for(const r of (records || [])){ if(!r || !(r.s || String(r.sn || "").trim())) continue;
    const t = /^\d{4}-\d{2}-\d{2}$/.test(r.d || "") ? Date.parse(r.d + "T12:00:00") : (+r.t || 0);
    if(!(t > 0) || now - t > maxAgeDays * DAY) continue;
    const unit = (+r.p || 0) / Math.max(1, +r.q || 1); if(!(unit > 0)) continue;
    const k = storeKey(r); if(!out[k] || t >= out[k].t) out[k] = { unit, t, name:String(r.sn || "").trim(), id:r.s || "", shared:r.shared || 0 }; }
  return out; }
export function compareStores({ items, lookup, now, maxAgeDays, minItems }){
  now = now || Date.now(); maxAgeDays = maxAgeDays || 60; minItems = minItems || 3;
  const list = (items || []).filter(i => i && String(i.name || "").trim()), per = {};
  list.forEach((it, idx) => { const by = latestByStore(lookup(it.name), now, maxAgeDays), q = Math.max(1, +it.qty || 1);
    for(const k in by){ const s = per[k] || (per[k] = { key:k, name:by[k].name, id:by[k].id, n:0, total:0, cost:{}, t:0, shared:0 });
      if(by[k].t >= s.t){ s.t = by[k].t; if(by[k].name) s.name = by[k].name; }
      s.cost[idx] = r2(by[k].unit * q); s.n++; if(by[k].shared) s.shared++; s.total = r2(s.total + s.cost[idx]); } });
  const stores = Object.values(per).sort((a, b) => (b.n - a.n) || (a.total - b.total) || a.name.localeCompare(b.name));
  let best = null;
  for(let i = 0; i < stores.length; i++) for(let j = i + 1; j < stores.length; j++){ const A = stores[i], B = stores[j];
    const common = Object.keys(A.cost).filter(k => k in B.cost); if(common.length < minItems) continue;
    const a = r2(common.reduce((x, k) => x + A.cost[k], 0)), b = r2(common.reduce((x, k) => x + B.cost[k], 0));
    const c = a <= b ? { cheaper:A, dearer:B, lo:a, hi:b } : { cheaper:B, dearer:A, lo:b, hi:a };
    const cand = { cheaper:c.cheaper.name, cheaperId:c.cheaper.id, dearer:c.dearer.name, dearerId:c.dearer.id, n:common.length, lo:c.lo, hi:c.hi, diff:r2(c.hi - c.lo) };
    if(!best || cand.n > best.n || (cand.n === best.n && cand.diff > best.diff)) best = cand; }
  return { of:list.length, stores:stores.map(s => ({ key:s.key, name:s.name, id:s.id, n:s.n, total:s.total, shared:s.shared })), best }; }
/* worth saying out loud: at least $2 and 5% on the items both stores have */
export function worthIt(best){ return !!best && best.diff >= 2 && best.diff >= best.hi * 0.05; }
