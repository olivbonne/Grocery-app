/* v2.55 — S8 step 1: one door to the database (js/store.js), and languages as a registry (adding one = a table + a line).
   No behaviour change and no data moves; docs/s8-plan.md has the whole plan.

   WHAT THESE CHECKS HAVE TO PROVE:
   - js/store.js in Node, against a fake Firestore module: ref/listen/put pass straight through (the options object for
     listen, merge for put), do nothing harmful before storeInit, and a throwing onSnapshot reaches the error handler;
   - js/app.js no longer calls Firestore directly anywhere (no doc/onSnapshot/setDoc), imports it as a namespace (a test
     stub missing a name can no longer stop the app loading), and hands it to storeInit;
   - the language registry: tr() reads LANGS, an unknown code falls back to English, every table carries every key of the
     French one; in the app the Language row is built from LANGS and a stored code that is not in it means English;
   - the app still loads, shows the list, and writes through the door (a tick reaches the stub's setDoc). */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const load = async (f) => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export default {};
export const doc=(db,...p)=>({ path:p.join('/') });
export const onSnapshot=()=>()=>{};
export const setDoc=async(r,d)=>{ (window.__writes=window.__writes||[]).push(r.path); };`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const seed = (lang) => `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[{id:"1",name:"Milk",cat:"dairy",qty:1,weight:"",checked:false,tags:[]}], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}])); localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home"); localStorage.setItem("ml_installhint","1");
  ${lang ? `localStorage.setItem("ml_lang", ${JSON.stringify(lang)});` : ''} })()`;

(async () => {
  const [port] = process.argv.slice(2); const errors = []; let browser;
  try {
    /* ── the door, in Node ─────────────────────────────────────────── */
    const S = await load('store.js'); const calls = [];
    const fake = { doc:(db, ...p) => ({ db, path:p.join('/') }), onSnapshot:(...a) => { calls.push(['on', a.length, a[1]]); return () => 'unsub'; },
      setDoc:(...a) => { calls.push(['set', a[0].path, a[2]]); return Promise.resolve(); } };
    ok('before storeInit nothing is touched: ref is null, listen gives a no-op, put refuses', S.ref('lists', 'x') === null && typeof S.listen(null, () => {}) === 'function' && !S.storeReady(), '');
    let refused = false; await S.put(null, {}).catch(() => { refused = true }); ok('…put without a record refuses (it never writes somewhere unknown)', refused, '');
    S.storeInit(fake, 'DB');
    const r = S.ref('lists', 'v101'); ok('ref() builds the record path on the db it was given', r && r.db === 'DB' && r.path === 'lists/v101', JSON.stringify(r));
    S.listen(r, () => {}, () => {}, { includeMetadataChanges:true }); S.listen(r, () => {}, () => {});
    ok('listen() passes the options object through when given, and leaves it out when not', calls[0][0] === 'on' && calls[0][1] === 4 && calls[0][2].includeMetadataChanges === true && calls[1][1] === 3, JSON.stringify(calls.slice(0, 2)));
    await S.put(r, { a:1 }, true); await S.put(r, { a:1 });
    ok('put() merges only when asked', calls[2][0] === 'set' && calls[2][2] && calls[2][2].merge === true && calls[3][2] === undefined, JSON.stringify(calls.slice(2)));
    let errSeen = null; S.storeInit({ ...fake, onSnapshot:() => { throw new Error('boom'); } }, 'DB'); S.listen(S.ref('a', 'b'), () => {}, (e) => { errSeen = e; });
    ok('an onSnapshot that throws reaches the error handler', errSeen && /boom/.test(errSeen.message), String(errSeen));
    ok('has() tells which database features exist (later steps check for collections this way)', S.has('doc') && !S.has('collection'), '');

    /* ── the app uses only the door ───────────────────────────────── */
    const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    ok('js/app.js calls Firestore only through js/store.js (no doc/onSnapshot/setDoc of its own)', !/\b(onSnapshot|setDoc)\(/.test(src) && !/\bdoc\(db/.test(src), (src.match(/\b(onSnapshot|setDoc)\(.{0,40}/g) || []).join(' | '));
    ok('…imports Firestore as a namespace and hands it to storeInit', /import \* as FS from "\/vendor\/firebasejs\/10\.12\.2\/firebase-firestore\.js"/.test(src) && /storeInit\(FS, db\)/.test(src), '');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const ver = (src.match(/from "\.\/store\.js\?v=([\d.]+)"/) || [])[1];
    ok('js/store.js is imported versioned and precached at the same version', ver && sw.includes('/js/store.js?v=' + ver), ver);

    /* ── languages ─────────────────────────────────────────────────── */
    const I = await load('i18n.js');
    ok('the registry lists English and French, each with a name and a locale slot', I.LANGS.length >= 2 && I.LANGS[0].code === 'en' && I.LANGS.some(l => l.code === 'fr' && l.table === I.FR) && I.LANGS.every(l => l.name && 'locale' in l), JSON.stringify(I.LANGS.map(l => [l.code, l.name, l.locale])));
    ok('tr() reads the registry; an unknown language means English', I.tr('fr', 'Done') !== 'Done' && I.tr('xx', 'Done') === 'Done' && I.tr('en', 'Done') === 'Done', I.tr('fr', 'Done'));
    const frKeys = Object.keys(I.FR); const gaps = I.LANGS.filter(l => l.table).map(l => [l.code, frKeys.filter(k => !(k in l.table)).length]).filter(x => x[1]);
    ok('every language table carries every key of the French one (a new language cannot ship half-done unnoticed)', !gaps.length, JSON.stringify(gaps));
    ok('the Language setting is built from the registry, and the date format comes from it', /LANGS\.map\(l=>`<button data-opt-lang="\$\{l\.code\}"/.test(src) && /function dateLoc\(\)\{ return langOf\(appLang\)\.locale; \}/.test(src), '');
    ok('docs/languages.md says how to add one', /Adding a language|add a language/i.test(fs.readFileSync(path.join(ROOT, 'docs', 'languages.md'), 'utf8')), '');

    /* ── the app still works through the door ──────────────────────── */
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    let ctx, page;
    const mk = async (lang) => { if (ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{ width:390, height:844 } });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console', m => { if (m.type() !== 'error') return; const t = m.text(); if (/Failed to load resource/i.test(t)) return; errors.push(t.slice(0, 160)); });
      page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
      await page.addInitScript(seed(lang)); await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    await mk('');
    await page.locator('.pill, .tile, [data-id]').filter({ hasText:'Milk' }).first().click(); await page.waitForTimeout(600);
    const w = await page.evaluate(() => window.__writes || []);
    ok('the app loads, and a tick is written through the door to lists/{code}', w.includes('lists/v101'), JSON.stringify(w));
    await mk('xx');
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const langBtns = await page.evaluate(() => [...document.querySelectorAll('[data-opt-lang]')].map(b => [b.dataset.optLang, b.classList.contains('on')]));
    ok('a stored language the app does not know means English; the setting shows one button per language', langBtns.length === 2 && langBtns.find(b => b[0] === 'en')[1] === true, JSON.stringify(langBtns));
    await mk('fr');
    ok('French still works', /Réglages|Paramètres|Acheter|Liste/.test(await page.evaluate(() => document.body.innerText)), '');
  } catch (e) { ok('suite ran to the end', false, (e.stack || e.message).slice(0, 300)); }
  ok('no console errors anywhere in the run', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
  if (browser) await browser.close();
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
