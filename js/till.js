/* Market List — at the till (v2.31): a membership card's barcode, and pairing a receipt with what was ticked.
   Pure functions — no imports, nothing from the app; js/app.js passes in what they need.

   The barcode is Code 128, which every supermarket scanner reads, drawn from the card's number. Which symbology a given
   card prints could not be checked from where this was built, so the app also keeps a photo of the card as the fallback
   — a scanner reads a photographed barcode off a phone screen as well as the real card. */

/* The 107 Code 128 patterns (bar, space, bar, space, bar, space widths, in modules; 106 is the stop, with its final bar). */
const P = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 "
  + "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 "
  + "111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 "
  + "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 "
  + "141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 "
  + "124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 "
  + "311141 411131 211412 211214 211232 2331112").split(" ");
const START_B = 104, START_C = 105;

/* The symbol values for a text: set C (two digits a symbol) for a card number — an odd last digit in set B — else
   set B throughout (printable ASCII). Returns null for anything set B cannot carry. */
export function code128Values(text){ const s = String(text == null ? "" : text);
  if(!s.length || s.length > 48) return null;
  let v;
  if(/^\d+$/.test(s) && s.length >= 2){ v = [START_C]; const n = s.length - s.length % 2;
    for(let i = 0; i < n; i += 2) v.push(+s.slice(i, i + 2));
    if(n < s.length) v.push(100, s.charCodeAt(n) - 32); }   // an odd last digit: switch to set B (100) for it
  else { if(!/^[\x20-\x7e]+$/.test(s)) return null; v = [START_B]; for(const ch of s) v.push(ch.charCodeAt(0) - 32); }
  let sum = v[0]; for(let i = 1; i < v.length; i++) sum += v[i] * i;
  v.push(sum % 103, 106); return v; }

/* The bars as a string of 1s (bar) and 0s (space), one character a module, without the quiet zones. */
export function code128Modules(text){ const v = code128Values(text); if(!v) return "";
  let out = ""; for(const x of v){ const w = P[x]; for(let i = 0; i < w.length; i++) out += (i % 2 ? "0" : "1").repeat(+w[i]); }
  return out; }

/* An SVG of the barcode: black bars on white, a ten-module quiet zone each side (scanners need it), scaled by the page. */
export function code128SVG(text, height){ const m = code128Modules(text); if(!m) return "";
  const q = 10, w = m.length + 2 * q, h = height || 60; let d = "", i = 0;
  while(i < m.length){ if(m[i] === "1"){ let j = i; while(j < m.length && m[j] === "1") j++; d += `M${i + q} 0h${j - i}v${h}h-${j - i}z`; i = j; } else i++; }
  return `<svg class="bc128" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Barcode ${String(text).replace(/[<>&"]/g, "")}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`; }

/* v2.35 (the household's item 9): how well a receipt line names a ticked item, 0 to 1 — the share of the item's words that the
   line has, word by word, forgiving a plural and a letter or two ("kombucha" on the receipt, "Kambucha" on the list;
   "TOMATOES Heirloom" for "tomatoes big"). Receipts abbreviate and add brands and sizes, so one name rarely contains the
   other whole — which is what the first version asked, and why lines fell through to the tick order and crossed. */
const STOP = new Set(["the","and","with","for","pack","each","net","gram","grams","litre","litres","coles","woolworths","aldi","iga","brand","free","range","fresh","large","small","medium"]);
const stem = w => /ies$/.test(w) && w.length > 4 ? w.slice(0, -3) + "y" : /(ch|sh|ss|x|o)es$/.test(w) ? w.slice(0, -2) : (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) ? w.slice(0, -1) : w;
const words = s => String(s || "").toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)).map(stem);
function edits(a, b){ const m = a.length, n = b.length; let prev = Array.from({ length:n + 1 }, (_, j) => j);
  for(let i = 1; i <= m; i++){ const cur = [i]; for(let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n]; }
const close = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && edits(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1));
export function nameScore(line, item){ const A = words(line), B = words(item); if(!A.length || !B.length) return 0;
  let hit = 0; for(const w of B) if(A.some(x => close(x, w))) hit++;
  return hit / B.length; }

/* Pair a receipt's lines with the items ticked in the shop, in the order they were ticked (the household: "match what
   was in the cart, in the order it was checked, which should be the order on the bill").
   lines: [{ name, keep }] in receipt order; cart: [{ name }] in tick order; score(lineName, itemName, line, item): how well
   they match, 0 (not at all) to 1 — a true/false answer works too.
   1. by name FIRST (v2.35, the household's item 9) — every kept line against every ticked item; the best matches are
      paired first, so a strong match is never taken by a weak one that happened to come earlier;
   2. by order — between two name pairs (and before the first, after the last) the unpaired lines and the unpaired cart
      items in that stretch are paired in order, as far as both go. A name pair whose cart position runs backwards is not
      used as an edge, so the stretches never cross.
   Returns { pair: [cartIndex|null per line], how: ["name"|"order"|"" per line], missing: [cart indices not paired] }. */
export function reconcile(lines, cart, score){ lines = Array.isArray(lines) ? lines : []; cart = Array.isArray(cart) ? cart : [];
  const pair = lines.map(() => null), how = lines.map(() => ""), used = new Set(), cands = [];
  lines.forEach((L, i) => { if(!L || !L.keep) return;
    cart.forEach((x, k) => { if(!x) return; const s = +score(L.name, x.name, L, x) || 0; if(s > 0) cands.push([s, i, k]); }); });
  cands.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  for(const [, i, k] of cands){ if(pair[i] !== null || used.has(k)) continue; pair[i] = k; how[i] = "name"; used.add(k); }
  /* the edges: name pairs in receipt order whose cart positions only go forward */
  const edges = []; let last = -1;
  pair.forEach((c, i) => { if(c !== null && c > last){ edges.push([i, c]); last = c; } });
  const bounds = [[-1, -1], ...edges, [lines.length, cart.length]];
  for(let b = 0; b + 1 < bounds.length; b++){ const [l0, c0] = bounds[b], [l1, c1] = bounds[b + 1];
    const ls = [], cs = [];
    for(let i = l0 + 1; i < l1; i++) if(pair[i] === null && lines[i] && lines[i].keep) ls.push(i);
    for(let k = c0 + 1; k < c1; k++) if(!used.has(k)) cs.push(k);
    for(let n = 0; n < Math.min(ls.length, cs.length); n++){ pair[ls[n]] = cs[n]; how[ls[n]] = "order"; used.add(cs[n]); } }
  return { pair, how, missing: cart.map((_, k) => k).filter(k => !used.has(k)) }; }

/* v2.37 (the household's item 3, option A): a band in the programme's own colour with its name, above the barcode.
   Colours only, by eye — the programmes' logos are trademarks and are not shipped; colours could not be checked against
   brand guides from where this was built. An unknown name gets a steady colour of its own from its letters. */
const BRANDS = [   // [words to find in the name, background, text] — specific names before the chains that run them
  ["everyday rewards", "#FF6A13", "#fff"], ["flybuys", "#0A2D8C", "#fff"], ["fly buys", "#0A2D8C", "#fff"],
  ["woolworths", "#178841", "#fff"], ["coles", "#E01A22", "#fff"], ["aldi", "#00205B", "#fff"], ["iga", "#E2231A", "#fff"],
  ["qantas", "#E40000", "#fff"], ["velocity", "#C8102E", "#fff"], ["priceline", "#E4007C", "#fff"], ["chemist warehouse", "#D7282F", "#fff"],
  ["myer", "#111111", "#fff"], ["david jones", "#111111", "#fff"], ["bunnings", "#0D5257", "#fff"], ["kmart", "#E31837", "#fff"],
  ["big w", "#0055A5", "#fff"], ["dan murphy", "#0E5B3A", "#fff"], ["costco", "#005DAA", "#fff"],
  ["walmart", "#0071CE", "#fff"], ["target", "#CC0000", "#fff"], ["wawa", "#A6192E", "#FFD100"], ["wegmans", "#231F20", "#fff"],
  ["subway", "#008C15", "#FFC20E"], ["sheetz", "#D7282F", "#fff"], ["stop & shop", "#E2001A", "#fff"], ["stop and shop", "#E2001A", "#fff"],
  ["true value", "#E31837", "#fff"], ["kroger", "#134B97", "#fff"], ["safeway", "#E21836", "#fff"], ["cvs", "#CC0000", "#fff"],
  ["walgreens", "#E31837", "#fff"], ["starbucks", "#00704A", "#fff"], ["7-eleven", "#008163", "#fff"], ["пятёрочка", "#E31E24", "#fff"], ["пятерочка", "#E31E24", "#fff"]];
const CHAIN_BRAND = { coles:"flybuys", woolworths:"everyday rewards" };
const SPARE = ["#3B6E8F", "#7A4E9C", "#2F7D6D", "#9C5B2E", "#5B6B2F", "#8F3B5A", "#2E5E9C", "#6B4F3A"];
export function cardBrand(name, chain){ const n = " " + String(name || "").toLowerCase().replace(/\s+/g, " ").trim() + " ";
  const hit = BRANDS.find(([w]) => n.includes(" " + w) );   // a word that STARTS a word in the name ("iga" is not found in "sigarette")
  if(hit) return { bg:hit[1], fg:hit[2] };
  const cb = CHAIN_BRAND[chain]; if(cb){ const b = BRANDS.find(([w]) => w === cb); return { bg:b[1], fg:b[2] }; }
  const s = n.trim(); if(!s) return { bg:"#6B7280", fg:"#fff" };
  let h = 0; for(const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return { bg:SPARE[h % SPARE.length], fg:"#fff" }; }
