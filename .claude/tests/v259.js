/* v2.59 — the microphone help card (the household asked how to allow the microphone).

   WHAT THESE CHECKS HAVE TO PROVE:
   - when the phone refuses the microphone, a card shows the steps (Safari › Microphone › Allow, Dictation on, reopen),
     with "Try again" and "Type instead" — not a toast that is gone in two seconds;
   - the refusal is remembered: the next tap on the microphone shows the steps straight away, without asking again;
   - "Try again" asks again, inside the tap; the first words heard forget the refusal;
   - a phone with no voice input at all gets the same card, in its own words; the card is in French too;
   - the remembered refusal survives an appearance slot (both exclusion lists);
   - when the phone stops listening for its own reason, the sheet says which (its error code);
   - after the keyboard closes, a bottom bar left out of place is put back (on every page, Settings too), and logged;
   - the database is opened with a single-tab manager that owns its writes (the 54-minute save), and the save timer leaves
     out time the app was hidden.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163; v2.56 an object
   literal at the start of a statement in a seed is a block — assign it first. */
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
    let ctx, page;
    const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); if(o.sr) await page.addInitScript(o.sr);
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    /* a phone that refuses the microphone, until window.__allow is set; then it hears "milk" */
    const SR = `window.__starts=0; window.webkitSpeechRecognition = class { start(){ window.__starts++; const me=this;
        setTimeout(()=>{ if(window.__allow){ me.onresult && me.onresult({ resultIndex:0, results:[ Object.assign([{ transcript:"milk" }], { isFinal:true }) ] }); }
          else { me.onerror && me.onerror({ error:"not-allowed" }); } }, 80); }
      stop(){ setTimeout(()=>this.onend && this.onend(), 10); } }; window.SpeechRecognition = window.webkitSpeechRecognition;`;
    const card = ()=>page.evaluate(()=>{ const s=document.querySelector('#micHelpSheet'); return s ? { steps:s.querySelectorAll('.michelp li').length, text:s.textContent, try:!!s.querySelector('#micTry'), type:!!s.querySelector('#micType') } : null; });

    await mk({ docs:{ v101:DOC({ items:[] }) }, sr:SR });
    await page.locator('#emptyMic').click(); await page.waitForTimeout(500);
    let c = await card();
    ok('refused: a card with the steps, "Try again" and "Type instead" (not a passing toast)', c && c.steps===4 && /Microphone/.test(c.text) && /Dictation/.test(c.text) && c.try && c.type, JSON.stringify(c && { steps:c.steps, try:c.try, type:c.type }));
    ok('…and the refusal is remembered on this phone', await page.evaluate(()=>localStorage.getItem('ml_micdenied'))==='1', '');
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-michelp.png') });
    await page.evaluate(()=>{ const b=document.querySelector('#micHelpBg'); if(b) b.click(); }); await page.waitForTimeout(300);
    const s0 = await page.evaluate(()=>window.__starts);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(400);
    c = await card();
    ok('the next tap shows the steps straight away, without asking the phone again', c && c.steps===4 && await page.evaluate(()=>window.__starts)===s0, String(await page.evaluate(()=>window.__starts)-s0));
    await page.evaluate(()=>{ window.__allow=true; });
    await page.locator('#micTry').click(); await page.waitForTimeout(500);
    const v = await page.evaluate(()=>({ starts:window.__starts, voice:!!document.querySelector('.voicesheet'), card:!!document.querySelector('#micHelpSheet'), denied:localStorage.getItem('ml_micdenied') }));
    ok('"Try again" asks again inside the tap; it works now, so the voice sheet opens and the refusal is forgotten', v.starts===s0+1 && v.voice && !v.card && v.denied===null, JSON.stringify(v));
    await page.evaluate(()=>{ const b=document.querySelector('#voiceClose'); if(b) b.click(); }); await page.waitForTimeout(300);

    /* "Type instead" */
    await page.evaluate(()=>{ localStorage.setItem('ml_micdenied','1'); });
    await page.locator('#emptyMic').click(); await page.waitForTimeout(400);
    await page.locator('#micType').click(); await page.waitForTimeout(900);
    ok('"Type instead" opens the add sheet', await page.locator('#addSheet').count()===1 && !(await card()), '');

    /* no voice input at all */
    await mk({ docs:{ v101:DOC({ items:[] }) }, sr:`delete window.webkitSpeechRecognition; delete window.SpeechRecognition; window.webkitSpeechRecognition=undefined; window.SpeechRecognition=undefined;` });
    await page.locator('#emptyMic').click(); await page.waitForTimeout(400);
    c = await card();
    ok('a phone with no voice input gets the same steps, in its own words', c && c.steps===4 && /isn't switched on/.test(c.text), c ? c.text.slice(0,80) : 'no card');

    /* French */
    await mk({ docs:{ v101:DOC({ items:[] }) }, sr:SR, extra:'localStorage.setItem("ml_lang","fr");' });
    await page.locator('#emptyMic').click(); await page.waitForTimeout(500);
    c = await card();
    ok('the card is in French too', c && /Réessayer/.test(c.text) && /Réglages/.test(c.text) && /Dictée/.test(c.text), c ? c.text.slice(0,80) : 'no card');


    /* the phone's own reason for pausing */
    const SRERR = `window.__n=0; window.webkitSpeechRecognition = class { start(){ if(window.__n++) throw new Error('busy'); const me=this; setTimeout(()=>{ me.onerror && me.onerror({ error:"audio-capture" }); setTimeout(()=>me.onend && me.onend(), 20); }, 80); }
      stop(){} }; window.SpeechRecognition = window.webkitSpeechRecognition;`;
    await mk({ docs:{ v101:DOC({ items:[] }) }, sr:SRERR });
    await page.locator('#emptyMic').click(); await page.waitForTimeout(600);
    await page.evaluate(()=>{ /* the restart inside the sheet is refused by this fake too */ });
    const vst = await page.evaluate(()=>(document.querySelector('#voiceStatus')||{}).textContent||'');
    ok('when the phone stops listening, the sheet says its reason ("audio-capture")', /Paused \(audio-capture\)/.test(vst), vst);

    /* the bottom bar after the keyboard */
    await mk({ docs:{ v101:DOC() } });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const bar = await page.evaluate(async()=>{ const bb=document.getElementById('bottomnav'); bb.style.transform='translateY(-300px)';
      const calls=[]; const real=window.scrollTo.bind(window); window.scrollTo=(x,y)=>{ calls.push([x,y]); real(x,y); };
      const i=document.createElement('input'); document.body.appendChild(i); i.focus(); i.blur(); i.remove();
      await new Promise(r=>setTimeout(r,600)); bb.style.transform='';
      let log=[]; try{ log=JSON.parse(localStorage.getItem('ml_stucklog')||'[]'); }catch(e){}
      return { calls:calls.length, logged: log.some(e=>/^bar /.test(e.src||'') && e.page==='settings') }; });
    ok('after the keyboard closes, a bottom bar left out of place is put back on Settings too (a one-pixel nudge), and logged', bar.calls>=2 && bar.logged, JSON.stringify(bar));

    const src2 = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the database is opened with a single-tab manager that owns its writes (no waiting for a frozen copy of the app)', /persistentSingleTabManager\(\{ forceOwnership:true \}\)/.test(src2), '');
    ok('the save timer leaves out time the app was hidden (locked phone, another app)', /_hiddenMs\(_pendSince\)/.test(src2) && /visibilitychange/.test(src2), '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('the remembered refusal is in both appearance-slot exclusion lists', (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]).filter(x=>/ml_micdenied\$/.test(x)).length===2, '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
