/* Market List — shared shelf prices between households (v2.47, plan item 5). Pure: no imports; js/app.js passes in what
   it needs. Only the national chains (one price across the country) are pooled; each household's entry is a unit price
   and a time. What is shown is the MEDIAN of recent entries from at least two households, so one silly price is shrugged off. */
const DAY = 86400000;
export const SHARE_CHAINS = { coles:/\bcoles\b/i, woolworths:/woolworths|woolies/i, aldi:/\baldi\b/i };
export function shareChain(storeName){ const s = String(storeName || "");
  for(const k in SHARE_CHAINS) if(SHARE_CHAINS[k].test(s)) return k;
  return ""; }
export function sharedKey(chain, pkey){ if(!String(pkey || "").trim() || !chain) return "";   // no item, no record
  const k = (chain + "__" + String(pkey || "").trim().replace(/\s+/g, "-")).toLowerCase(); return /^[a-z0-9_-]{3,120}$/.test(k) ? k : ""; }
/* by: the doc's `by` map; returns { p, n, d } (median unit price, households, newest time) or null */
export function sharedMedian(by, now, maxAgeDays, minHouseholds){ maxAgeDays = maxAgeDays || 30; minHouseholds = minHouseholds || 2;
  now = now || Date.now(); const ok = [];
  for(const u in (by || {})){ const e = by[u]; if(!e) continue; const p = +e.p, d = +e.d;
    if(!(p > 0) || !(d > 0) || now - d > maxAgeDays * DAY) continue; ok.push({ p, d }); }
  if(ok.length < minHouseholds) return null;
  const ps = ok.map(e => e.p).sort((a, b) => a - b), mid = ps.length >> 1;
  const med = ps.length % 2 ? ps[mid] : Math.round((ps[mid - 1] + ps[mid]) / 2 * 100) / 100;
  return { p:med, n:ok.length, d:Math.max(...ok.map(e => e.d)) }; }
const ymd = ms => { const x = new Date(ms); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
/* records to add to compareStores' lookup for one item: a household store whose chain has a shared median and where the
   household has no own price for that store */
export function sharedRecords(own, stores, medians){ const out = [], have = new Set((own || []).map(r => r && r.s).filter(Boolean));
  for(const st of (stores || [])){ if(!st || !st.id || have.has(st.id)) continue;
    const med = (medians || {})[shareChain(st.name)]; if(!med || !(med.p > 0)) continue;
    out.push({ d:ymd(med.d), s:st.id, sn:st.name, p:med.p, q:1, shared:med.n }); }
  return out; }
