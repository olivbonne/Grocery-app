/* v2.55 (architecture review S8/S10): the ONE door to the database, as js/platform.js is to the device.
   Every read and write of Firestore goes through here, so the data's shape can change (S8: the list as many
   records) and a native app can swap the storage, without touching the screens. It takes the Firestore module
   and the db in storeInit, and imports nothing. */
let _fs = null, _db = null;

export function storeInit(fs, db){ _fs = fs; _db = db; }
export function storeReady(){ return !!(_fs && _db); }
export function ref(...path){ return storeReady() ? _fs.doc(_db, ...path) : null; }
export function listen(r, onSnap, onErr, opts){
  if(!r) return () => {};
  try{ return opts ? _fs.onSnapshot(r, opts, onSnap, onErr) : _fs.onSnapshot(r, onSnap, onErr); }
  catch(e){ if(onErr) onErr(e); return () => {}; } }
export function put(r, data, merge){
  if(!r) return Promise.reject(new Error("store not ready"));
  return merge ? _fs.setDoc(r, data, { merge:true }) : _fs.setDoc(r, data); }
export function has(name){ return !!(_fs && typeof _fs[name] === "function"); }
