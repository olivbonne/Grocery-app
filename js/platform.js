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

// v2.49 S13: true inside a Capacitor shell (the future iPhone/Android app); the web app is never one
export function isNativeApp(){ try{ return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform==="function" && window.Capacitor.isNativePlatform()); }catch(e){ return false; } }

/* v2.60: text handed to the app from outside — Siri through an iPhone Shortcut (?add=…), Android's share sheet (?text=…,
   the manifest's share_target). Returns { text, source } once and removes it from the address, so a reload never adds it
   twice. A native app (Capacitor) replaces this file's insides: Siri App Intents / Google Assistant App Actions / share
   intents call the same handler through onOutsideText(). */
export function takeOutsideText(){
  try{
    const p = new URLSearchParams(location.search);
    let text = "", source = "", drop = [];
    if(p.get("add")){ text = p.get("add"); source = "shortcut"; drop = ["add"]; }
    else if(p.get("text") && !/https?:\/\//i.test(p.get("text"))){ text = p.get("text"); source = "share"; drop = ["text","title"]; }   // a text with a link stays the recipe importer's
    if(!source) return null;
    drop.forEach(k=>p.delete(k));
    const q = p.toString();
    try{ history.replaceState(null, "", location.pathname + (q?("?"+q):"") + location.hash); }catch(e){}
    text = String(text).trim().slice(0, 1000);
    return text ? { text, source } : null;
  }catch(e){ return null; }
}
let _outsideCb = null;   // web: kept for a native shell to call; the web never calls it
export function onOutsideText(cb){ _outsideCb = cb; }
