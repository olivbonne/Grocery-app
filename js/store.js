/* v2.55 (architecture review S8/S10): the ONE door to the database, as js/platform.js is to the device.
   Every read and write of Firestore goes through here, so the data's shape can change (S8: the list as many
   records) and a native app can swap the storage, without touching the screens. It takes the Firestore module
   and the db in storeInit, and imports nothing.
   v2.58 (S8 step 2): items as records. A split list keeps each item as its own record, lists/{code}/items/{id}; col()
   names that collection, listenAll() follows it, putMany() writes many records in batches (400 a batch) and canSplit()
   says whether this Firestore can do it at all (a stub without collection() keeps every list in one record). */
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
export function canSplit(){ return storeReady() && typeof _fs.collection === "function"; }
export function col(...path){ return canSplit() ? _fs.collection(_db, ...path) : null; }
export function listenAll(c, onSnap, onErr, opts){
  if(!c) return () => {};
  try{ return opts ? _fs.onSnapshot(c, opts, onSnap, onErr) : _fs.onSnapshot(c, onSnap, onErr); }
  catch(e){ if(onErr) onErr(e); return () => {}; } }
export function putMany(writes){
  if(!writes || !writes.length) return Promise.resolve();
  if(writes.some(w => !w || !w.ref)) return Promise.reject(new Error("store not ready"));
  if(typeof _fs.writeBatch === "function"){
    const promises = [];
    for(let i = 0; i < writes.length; i += 400){
      const chunk = writes.slice(i, i + 400), b = _fs.writeBatch(_db);
      chunk.forEach(w => b.set(w.ref, w.data)); promises.push(b.commit()); }
    return Promise.all(promises); }
  return Promise.all(writes.map(w => _fs.setDoc(w.ref, w.data))); }
