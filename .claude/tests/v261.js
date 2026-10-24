/* v2.61 — on an iPhone the microphone card offers what works there.

   WHAT THESE CHECKS HAVE TO PROVE: iOS refuses speech recognition to home-screen web apps even with every setting right
   (the household's phone, 24 Oct 2026), so on an iPhone the refusal card does not send people through settings that cannot
   help: it offers "Add with Siri" (opens the v2.60 set-up sheet, from the Shop page) and "Use the keyboard's microphone"
   (opens the add sheet and says to tap the keyboard's mic), and still lets the app's own microphone be tried again. On other
   phones the steps card stays (v259.js). iPhone detection lives in platform.js.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const FSTUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const AUTHSTUB = `export const indexedDBLocalPersistence={}, browserLocalPersistence={};
const A={ currentUser:null }; export function initializeAuth(){ return A; }
export function onAuthStateChanged(a,f){ setTimeout(()=>f(null),0); return ()=>{}; }
export async function signInAnonymously(){ throw Object.assign(new Error('x'),{code:'auth/offline'}); }`;
const it=(id,n,c,x)=>Object.assign({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]}, x||{});
const DOC=(o)=>Object.assign({ items:[it("1","Milk","dairy")], buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
  baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }, o||{});
const seed = (o) => { o=o||{}; return `(() => { if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  const lists=${JSON.stringify(o.lists||[{code:"v101",name:"Groceries"}])};
  localStorage.setItem("ml_lists", JSON.stringify(lists));
  const docs=${JSON.stringify(o.docs||{ v101:DOC() })}; Object.entries(docs).forEach(([c,d])=>localStorage.setItem("ml_cache_"+c, JSON.stringify(d)));
  localStorage.setItem("ml_lastlist", ${JSON.stringify(o.last||"v101")}); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_installhint","1");
  localStorage.setItem("ml_store", ${JSON.stringify(o.store||"home")});
  ${o.extra||''} })()`; };



(async () => {
  const [port,out]=process.argv.slice(2); const errors=[]; let browser;
  try {
    browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
    const page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed({ docs:{ v101:DOC({ items:[] }) } }));
    await page.addInitScript(`window.webkitSpeechRecognition = class { start(){ const me=this; setTimeout(()=>me.onerror && me.onerror({ error:"not-allowed" }), 60); } stop(){} }; window.SpeechRecognition = window.webkitSpeechRecognition;`);
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(500);
    const c = await page.evaluate(()=>{ const s=document.querySelector('#micHelpSheet'); return s ? { siri:!!s.querySelector('#micSiri'), kbd:!!s.querySelector('#micKbd'), again:!!s.querySelector('#micTry'), steps:s.querySelectorAll('.michelp li').length, text:s.textContent } : null; });
    ok('on an iPhone, a refused microphone offers Siri and the keyboard\'s microphone (not settings that cannot help)', c && c.siri && c.kbd && c.again && c.steps===0, JSON.stringify(c && { siri:c.siri, kbd:c.kbd, again:c.again, steps:c.steps }));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-iphone.png') });
    await page.locator('#micSiri').click(); await page.waitForTimeout(500);
    ok('"Add with Siri" opens the Siri set-up sheet, right there on the Shop page', /Add with Siri/.test(await page.evaluate(()=>document.body.innerText)) && /Shortcuts app/.test(await page.evaluate(()=>document.body.innerText)) && !(await page.locator('#micHelpSheet').count()), '');
    await page.evaluate(()=>{ const b=document.querySelector('#siriBg'); if(b) b.click(); }); await page.waitForTimeout(400);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(500);
    await page.locator('#micKbd').click(); await page.waitForTimeout(900);
    ok('"Use the keyboard\'s microphone" opens the add sheet and says to tap the keyboard\'s mic', await page.locator('#addSheet').count()===1 && /microphone on the keyboard/.test(await page.evaluate(()=>document.body.innerText)), '');
    const plat = fs.readFileSync(path.join(ROOT,'js','platform.js'),'utf8');
    ok('iPhone detection lives in platform.js', /export function isAppleMobile/.test(plat), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
