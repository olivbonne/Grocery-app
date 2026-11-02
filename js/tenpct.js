/* Market List — the 10% shop (v2.20, plan item 3). Coles Plus and Woolworths Everyday Extra each take a percentage
   off one shop a period, up to a cap: 10% off one shop a month, up to $50, as of October 2026. That could not be
   checked from where this was built and the chains change it, so the percentage, the cap and the day the month
   starts are settings. Pure functions — no imports, nothing from the app; js/app.js passes in what they need. */
export const CHAINS = {
  coles:      { name:"Coles Plus",                short:"Coles",      store:/\bcoles\b/i,          discount:/plus\s*saver|coles\s*plus|plus\s*member/i },
  woolworths: { name:"Woolworths Everyday Extra", short:"Woolworths", store:/woolworths|woolies/i, discount:/everyday\s*extra|extra\s*member/i },
};
export const MEMB_DEFAULT = { on:false, pct:10, cap:50, day:1 };
const DAY = 86400000;
function clamp(v, a, b){ return Math.min(b, Math.max(a, v)); }
/* The fixed shape. A normaliser that rebuilds an object drops unknown fields (CLAUDE.md), so every field is named. */
export function membNorm(m){ m = (m && typeof m === "object") ? m : {}; const o = {};
  for(const k of Object.keys(CHAINS)){ const c = (m[k] && typeof m[k] === "object") ? m[k] : {};
    o[k] = { on:!!c.on, pct:clamp(Math.round(+c.pct || MEMB_DEFAULT.pct), 1, 50), cap:clamp(Math.round(+c.cap || MEMB_DEFAULT.cap), 1, 1000),
      day:clamp(Math.round(+c.day || MEMB_DEFAULT.day), 1, 28), used:(c.used && typeof c.used === "object" && !Array.isArray(c.used)) ? Object.assign({}, c.used) : {} }; }
  return o; }
/* The period a date falls in: from day `day` of one month to the day before day `day` of the next. */
export function periodOf(date, day){ const d = new Date(date); day = day || 1;
  let y = d.getFullYear(), m = d.getMonth(); if(d.getDate() < day){ m -= 1; if(m < 0){ m = 11; y -= 1; } }
  const start = new Date(y, m, day), end = new Date(y, m + 1, day);
  return { key: y + "-" + String(m + 1).padStart(2, "0"), start, end, daysLeft: Math.max(0, Math.ceil((end - d) / DAY)) }; }
export function chainOfStore(name){ const n = String(name || ""); for(const k of Object.keys(CHAINS)) if(CHAINS[k].store.test(n)) return k; return ""; }
/* A whole-receipt discount line that names the programme, or any percentage-off line (per-item specials are folded
   into their item's price by the receipt reader, so a percentage here is a whole-shop discount). */
export function discountSeen(discounts, chain){ const c = CHAINS[chain]; if(!c || !Array.isArray(discounts)) return false;
  return discounts.some(x => x && (c.discount.test(String(x.raw || "")) || /\b\d{1,2}(\.\d)?\s*%/.test(String(x.raw || "")))); }
/* Fresh food is bought as usual, not stocked up: left out (v2.92 adds the thirteen-category lists' fresh shelves — dairy,
   bakery, deli: yogurt, eggs, bread). Keeps if frozen: listed, unticked, your call. */
export const KEEP_OUT = ["fruit", "vegetable", "fresh", "dairy", "bakery", "deli"];
/* v2.92: a row's amount, changed in the sheet — the total follows (the rule lives here once) */
export function setRowQty(row, q){ row.qty = clamp(Math.round(q), 1, 99); row.total = Math.round(row.unit * row.qty * 100) / 100; return row; }
export const ASK = ["meat"];
/* The period's stock-up list: everything the household rebuys on a rhythm (two or more purchases, a median gap of 1.5
   to 120 days), enough for one period (horizonDays), priced per unit from what they paid — at that chain when known.
   Ticked in order of how often it is bought until the shop reaches the amount that earns the whole discount
   (cap ÷ percentage: $500 for 10% up to $50). Unpriced things are listed unticked: they cannot be counted. */
export function stockUp({ purch, priceOf, pct, cap, horizonDays }){
  horizonDays = horizonDays || 30;
  const base = Math.round(cap / (pct / 100) * 100) / 100, rows = [];
  for(const key in (purch || {})){ const r = purch[key];
    if(!r || !Array.isArray(r.ts) || r.ts.length < 2 || KEEP_OUT.includes(r.cat)) continue;
    const g = []; for(let i = 1; i < r.ts.length; i++) g.push(r.ts[i] - r.ts[i - 1]);
    g.sort((a, b) => a - b); const med = g.length % 2 ? g[(g.length - 1) / 2] : (g[g.length / 2 - 1] + g[g.length / 2]) / 2;
    const days = med / DAY; if(!(days >= 1.5 && days <= 120)) continue;
    const usual = Math.max(1, Math.round(+r.qty || 1)), qty = Math.max(1, Math.round(horizonDays / days)) * usual;
    const pr = priceOf ? priceOf(r.name) : null, unit = (pr && pr.unit > 0) ? pr.unit : 0;
    const row = { key, name:r.name, cat:r.cat, weight:r.weight || "", qty, usual, every:Math.max(1, Math.round(days)), unit,
      total:0, sn:pr ? (pr.sn || "") : "", priced:unit > 0, ask:ASK.includes(r.cat), sel:false };
    setRowQty(row, qty);   // the total, by the one rule (and the 1–99 bound)
    /* v2.92: rows of the same name are one row — the larger month's worth (ties: the priced one, then the first) */
    const nk = String(r.name || "").trim().toLowerCase(), at = rows.findIndex(x => String(x.name || "").trim().toLowerCase() === nk);
    if(at < 0) rows.push(row);
    else if(row.qty > rows[at].qty || (row.qty === rows[at].qty && row.priced && !rows[at].priced)) rows[at] = row; }
  rows.sort((a, b) => (b.priced - a.priced) || (a.ask - b.ask) || (a.every - b.every) || (b.total - a.total) || a.name.localeCompare(b.name));
  let total = 0;
  for(const x of rows){ if(!x.priced || x.ask) continue; if(total >= base) break; x.sel = true; total += x.total; }
  return Object.assign({ rows, base }, stockTotal(rows, pct, cap)); }
export function stockTotal(rows, pct, cap){
  const total = Math.round(rows.filter(r => r.sel && r.priced).reduce((a, r) => a + r.total, 0) * 100) / 100;
  return { total, saving: Math.round(Math.min(cap, total * pct / 100) * 100) / 100 }; }
