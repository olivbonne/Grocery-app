/* Market List — the membership cards' logic (v3.04, architecture review L17): which shop a card is for, the order of the
   cards, what "Show my card" opens and the limit. The cards themselves stay on the phone (ml_cards); reading and writing
   them, and drawing them, stay in js/app.js. Pure functions — no imports; js/app.js passes in what they need. */
export const CARD_MAX = 20;   // v3.03: was 6
/* v2.35 (the household's items 5, 6): the card's shop is worked out from its name or number, not asked — "Flybuys" or a
   number starting 6008 is Coles, "Everyday Rewards" is Woolworths. (The 6008 prefix is from the household's own card; other
   prefixes could not be checked from here.) A card whose shop cannot be told never comes up by itself. */
export function cardChainOf(name, num){ const n=String(name||"").toLowerCase(), d=String(num||"");
  if(/flybuys|fly buys|coles/.test(n) || /^6008/.test(d)) return "coles";
  if(/everyday|rewards|woolworths|woolies/.test(n)) return "woolworths";
  return ""; }
export function cardChain(c){ return (c && (c.chain || cardChainOf(c.name, c.num))) || ""; }
/* v2.56 item 8: a card can be for any shop. First a card the household tied to this shop (`stores`, its ids), then the chain
   as before, then a shared word between the card's name and the shop's ("My Dan's" / "Dan Murphy's Box Hill" → "dan"). */
export const CARD_NAME_STOP = new Set(["my","the","card","club","member","members","rewards","plus","australia","store","shop"]);
export function cardWords(x){ return String(x||"").toLowerCase().replace(/['’]s\b/g,"").replace(/['’]/g,"").split(/[^a-z0-9]+/)
  .filter(w=>w.length>=3 && !CARD_NAME_STOP.has(w)); }
export function cardNumFmt(n){ return String(n||"").replace(/\s+/g,"").replace(/(.{4})(?=.)/g,"$1 "); }

/* the stored list, read safely: an array of cards that have an id and a name */
export function cardsParse(json){ try{ const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a.filter(c => c && c.id && c.name) : []; }catch(e){ return []; } }
/* the card for a shop: one tied to it, then its chain's, then a shared word in the names. chainOf(name) is tenpct's chainOfStore */
export function cardForStore(all, store, chainOf){ if(!store) return null;
  const tied = all.find(c => Array.isArray(c.stores) && c.stores.includes(store.id)); if(tied) return tied;
  const k = chainOf(store.name); const byChain = k ? all.find(c => cardChain(c) === k) : null; if(byChain) return byChain;
  const sw = new Set(cardWords(store.name)); if(!sw.size) return null;
  return all.find(c => cardWords(c.name).some(w => sw.has(w))) || null; }
/* a new array with the card moved one place earlier (-1) or later (+1); the same array's order when it cannot move */
export function cardMove(all, id, dir){ const a = all.slice(), i = a.findIndex(c => c.id === id), j = i + (dir < 0 ? -1 : 1);
  if(i < 0 || j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }
/* what "Show my card" opens: the shop's card, else the only card, else the grid, else the add panel */
export function cardOpenTarget(here, all){ return here ? { id:here.id } : all.length > 1 ? { grid:true } : all.length ? { id:all[0].id } : { add:true }; }
/* true when one more card fits */
export function cardRoom(all){ return all.length < CARD_MAX; }
