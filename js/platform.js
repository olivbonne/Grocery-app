/* v2.43 (architecture review A3 / S12): one door to the phone.
   Every device feature js/app.js uses — the file picker, location, the screen wake lock, sharing,
   the clipboard, vibration, barcode reading and speech — goes through this file. These are the web
   versions. A future native app (Capacitor) replaces this file's insides, not its callers, so the
   semantics here must stay exactly what the app expects. No imports. */

/* A hidden file <input>, opened at once. Resolves with the chosen File, or null when the change event
   brings none. It is ATTACHED to the page before it opens: iOS Safari does not reliably fire "change"
   on a file input that is not in the document (rcPick, v2.11). If the person cancels, iOS fires nothing
   and the promise simply never settles — exactly as before. */
export function pickFile({ accept, capture } = {}){
  return new Promise(resolve=>{
    const f=document.createElement("input"); f.type="file"; f.accept=accept; if(capture) f.setAttribute("capture",capture);
    f.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(f);   // iOS fires change only for an input in the page (rcPick, v2.11)
    f.onchange=()=>{ const file=f.files && f.files[0]; f.remove(); resolve(file||null); };
    f.click(); }); }

export function hasGeolocation(){ return typeof navigator!=="undefined" && !!navigator.geolocation; }
/* rejects with the browser's own error object (it carries .code) */
export function getPosition(options){
  return new Promise((resolve, reject)=>navigator.geolocation.getCurrentPosition(resolve, reject, options)); }

export function wakeLockSupported(){ return !!(navigator.wakeLock && navigator.wakeLock.request); }
/* the browser's promise for a screen lock sentinel (it may reject) */
export function requestWakeLock(){ return navigator.wakeLock.request("screen"); }

export function hasShare(){ return !!navigator.share; }
export function canShare(data){ return !!(navigator.canShare && navigator.canShare(data)); }
export function share(data){ return navigator.share(data); }

export function hasClipboard(){ return !!(navigator.clipboard && navigator.clipboard.writeText); }
/* throws (or rejects) where there is no clipboard, as the raw call did */
export function copyText(t){ return navigator.clipboard.writeText(t); }

export function vibrate(ms){ if(navigator.vibrate) navigator.vibrate(ms); }

export function barcodeSupported(){ return typeof BarcodeDetector!=="undefined"; }
export function detectBarcodes(source){ return new BarcodeDetector().detect(source); }

export function speechRecognitionCtor(){ return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
