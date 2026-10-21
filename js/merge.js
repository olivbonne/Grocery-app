/* v2.51 (architecture review S8, the lighter step) — two phones changing the same list at once no longer undo each other.
   Pure module, no imports.

   The list is still one record, written whole. What changes is how a phone takes in the record when it arrives: instead of
   replacing its items with the server's, it merges them ITEM BY ITEM — each item carries `ts`, when it was last changed on
   the phone that changed it, and the newer copy wins; a removed item leaves a tombstone (`itemTomb`, id → when) so the
   removal travels too. If the merged list differs from what the server holds, the phone writes it back once, so both phones
   end on the same list (the same pattern Regulars use since A24). A tick on one phone and a tick on another, a second
   apart, both survive.

   The app never stamps `ts` by hand: before every save, stampItems compares each item with what it was at the last merge,
   and stamps the ones that changed — so no edit path can forget. What it does not solve (said out loud): two phones whose
   clocks disagree by more than the gap between their edits — the later clock wins; and the one-record size ceiling (S8's
   full split into many records). */

const TOMB_KEEP_MS = 30 * 24 * 3600 * 1000;   // a removal is remembered for 30 days — longer than any phone stays offline

/* what an item IS, without its stamp — two copies with the same signature are the same item */
export function itemSig(it){ if(!it || typeof it !== "object") return "";
  const o = {}; for(const k of Object.keys(it).sort()){ if(k !== "ts") o[k] = it[k]; } return JSON.stringify(o); }

/* before a save: stamp what changed since `sigs` (id → signature at the last merge) and tombstone what went missing.
   Mutates items (ts), tomb and sigs; returns how many were stamped and removed. */
export function stampItems(items, sigs, tomb, now){ const seen = new Set(); let stamped = 0, removed = 0;
  for(const it of (items || [])){ if(!it || it.id == null) continue; const id = String(it.id); seen.add(id);
    const s = itemSig(it); if(sigs.get(id) !== s){ it.ts = now; sigs.set(id, s); stamped++; if(tomb[id]) delete tomb[id]; } }
  for(const id of Array.from(sigs.keys())){ if(!seen.has(id)){ tomb[id] = now; sigs.delete(id); removed++; } }
  return { stamped, removed }; }

/* forget removals older than 30 days */
export function pruneTomb(tomb, now){ const out = {}; for(const [id, t] of Object.entries(tomb || {})){ if(+t > now - TOMB_KEEP_MS) out[id] = +t; } return out; }

/* the server's items and removals, merged with this phone's: per item the newer copy (ts) wins; an item removed at or after
   its last change stays removed. Order: the server's, then what only this phone has. Equal stamps: the server's copy.
   keepLocal(id) decides an item ONLY this phone has and no removal names: in a list written by merging phones (v2+) that
   means another phone wrote before it saw this one — keep it; in an older list, or from a copy kept before this phone ever
   merged, it may have been removed by an older app that left no tombstone — keep it only if it is this phone's own unsent
   change. The app passes that rule; omitted, everything is kept. */
export function mergeItems(remote, remoteTomb, local, localTomb, keepLocal){
  const tomb = {}; for(const src of [remoteTomb || {}, localTomb || {}]) for(const [id, t] of Object.entries(src)){ if(!(+t <= (tomb[id] || 0))) tomb[id] = +t; }
  const L = new Map(); for(const it of (local || [])) if(it && it.id != null) L.set(String(it.id), it);
  const out = [], done = new Set();
  const pick = (r, l) => { if(!r) return l; if(!l) return r; return (+(l.ts) || 0) > (+(r.ts) || 0) ? l : r; };
  const keep = (it) => { const id = String(it.id); const t = tomb[id]; return !(t && t >= (+(it.ts) || 0)); };
  for(const r of (remote || [])){ if(!r || r.id == null) continue; const id = String(r.id); if(done.has(id)) continue; done.add(id);
    const w = pick(r, L.get(id)); if(keep(w)) out.push(w); }
  for(const [id, l] of L){ if(done.has(id)) continue; done.add(id); if(keep(l) && (!keepLocal || keepLocal(id))) out.push(l); }
  for(const it of out){ const id = String(it.id); if(tomb[id]) delete tomb[id]; }   // alive and newer than its removal: the removal is over
  return { items: out, tomb }; }

/* a short fingerprint of a list of items and removals, to tell whether the server already holds the merged list */
export function itemsSig(items, tomb){ return JSON.stringify([(items || []).map(i => [String(i.id), +(i.ts) || 0, itemSig(i)]), Object.keys(tomb || {}).sort().map(k => [k, tomb[k]])]); }
