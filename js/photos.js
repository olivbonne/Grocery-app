/* Market List — a photo on an item (v2.96, Option B). Built to be REMOVED: everything about photos lives in this file and in
   ONE fenced block of js/app.js ("═══ PHOTOS … ═══" to "═══ END PHOTOS ═══", behind PHOTOS_ON), plus a few guarded hook lines
   listed in that block's header. A small JPEG (about 480 pixels) is kept as its own record, lists/{code}/photos/{pid}; the item
   carries only ph: "<pid>". A removal is the record { gone } — records are never deleted, like items. Pure functions — no
   imports; js/app.js passes in what they need. */
export const PHOTO_MAX_PX = 480;
export const PHOTO_QUALITY = 0.7;
export const PHOTO_MAX_CHARS = 150000;   // the rules allow 160000; a margin under it
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
/* rand(n) returns a Uint8Array of n random bytes (the app passes crypto.getRandomValues) */
export function newPhotoId(rand){ const b = rand(12); let s = "p";
  for(let i = 0; i < 12; i++) s += B36[b[i] % 36];
  return s; }
export function photoOk(dataUrl){ return typeof dataUrl === "string" && dataUrl.startsWith("data:image/jpeg;base64,") && dataUrl.length <= PHOTO_MAX_CHARS; }
export function photoRecord(dataUrl, w, h, by, now){ return { d:dataUrl, w:Math.round(+w || 0), h:Math.round(+h || 0), t:Math.round(+now || 0), by:String(by || "").slice(0, 60) }; }
export function photoGone(now){ return { gone:Math.round(+now || 0) }; }
