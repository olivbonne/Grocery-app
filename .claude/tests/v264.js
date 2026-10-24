/* v2.64 — on an iPhone the microphone opens a box ready for the keyboard's own dictation.

   WHAT THESE CHECKS HAVE TO PROVE: iOS refuses speech recognition to home-screen web apps, and the household won't send their
   voice to an AI, so on an iPhone the empty list's microphone opens a sheet whose text box is ALREADY FOCUSED (so the keyboard,
   with its 🎤, is up — the focus has to happen inside the tap), with a hint pointing at that 🎤. Return (Done) sends the TEXT to
   Smart add — and only text: the app records nothing. The keyboard bar's Done (a blur) sends a filled box; an empty box, ×
   and the scrim send nothing. With Smart add off, the words are added directly ("and"/"et" split them). Other phones keep
   the v2.57 listening sheet.

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
    let ctx, page, api=[];
    const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const mk = async(o, ua)=>{ o=o||{}; if(ctx) await ctx.close(); api=[];
      ctx = await browser.newContext(Object.assign({ viewport:{width:390,height:844}, deviceScaleFactor:2 }, ua?{ userAgent:ua }:{}));
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => { api.push({ url:r.request().url(), body:r.request().postData()||'' }); r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"milk",qty:2,weight:"",category:"fresh"}] }) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(Object.assign({ docs:{ v101:DOC({ items:[] }) } }, o)));
      await page.addInitScript(`window.webkitSpeechRecognition = class { start(){} stop(){} }; window.SpeechRecognition = window.webkitSpeechRecognition;`);
      await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    const names = ()=>page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_v101')).items.map(i=>i.name.toLowerCase()); }catch(e){ return []; } });

    await mk({}, IPHONE);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(400);
    const s = await page.evaluate(()=>({ box:!!document.querySelector('#dictBox'), focused:document.activeElement && document.activeElement.id==='dictBox',
      hint:!!document.querySelector('.dictsheet .dictmark svg') && !/Tap 🎤 on the keyboard/.test(document.body.innerText),   /* v2.67: the keyboard's own mic glyph, no text */ done:(document.querySelector('#dictBox')||{}).getAttribute && document.querySelector('#dictBox').getAttribute('enterkeyhint'),
      voice:!!document.querySelector('.voicesheet'), help:!!document.querySelector('#micHelpSheet') }));
    ok('on an iPhone the microphone opens the dictation box, already focused (keyboard up), pointing at the keyboard\'s 🎤', s.box && s.focused && s.hint && s.done==='done' && !s.voice && !s.help, JSON.stringify(s));
    if(out) await page.screenshot({ path: out.replace(/\.png$/,'-dict.png') });
    await page.locator('#dictBox').fill('two litres of milk and bread'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    const call = api.find(a=>/api\/parse/.test(a.url));
    ok('return sends the TEXT to Smart add, and its review opens', call && /two litres of milk and bread/.test(call.body) && !(await page.locator('#dictBox').count()), call ? call.body.slice(0,80) : 'no call');
    ok('…and nothing but text: the app records no sound (no getUserMedia/MediaRecorder anywhere)', !/getUserMedia|MediaRecorder/.test(fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8')+fs.readFileSync(path.join(ROOT,'js','platform.js'),'utf8')), '');

    /* the keyboard bar's Done (a blur) sends a filled box; × and an empty box send nothing */
    await mk({}, IPHONE);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(300);
    await page.locator('#dictBox').fill('eggs'); await page.evaluate(()=>document.getElementById('dictBox').blur()); await page.waitForTimeout(700);
    ok('the keyboard bar\'s Done (the box loses focus) sends a filled box', api.some(a=>/api\/parse/.test(a.url) && /eggs/.test(a.body)), JSON.stringify(api.map(a=>a.body.slice(0,40))));
    await mk({}, IPHONE);   // TEST BUG (fixed): the add above left the list non-empty, so its microphone tile was gone
    await page.locator('#emptyMic').click(); await page.waitForTimeout(300);
    await page.locator('#dictBox').fill('butter'); await page.locator('#dictClose').click(); await page.waitForTimeout(700);
    ok('× closes it and sends nothing', api.length===0 && !(await page.locator('#dictBox').count()), JSON.stringify(api));
    await page.locator('#emptyMic').click(); await page.waitForTimeout(300);
    await page.evaluate(()=>document.getElementById('dictBox').blur()); await page.waitForTimeout(600);
    ok('an empty box stays open when it loses focus', await page.locator('#dictBox').count()===1 && api.length===0, '');

    /* Smart add off */
    await mk({ extra:'localStorage.setItem("ml_smart","0");' }, IPHONE);
    await page.locator('#emptyMic').click(); await page.waitForTimeout(300);
    const lbl = await page.locator('#dictGo').innerText();
    await page.locator('#dictBox').fill('apples and pears'); await page.locator('#dictGo').click(); await page.waitForTimeout(700);
    const n = await names();
    ok('with Smart add off, the words are added directly ("and" splits them), and nothing is sent', n.includes('apples') && n.includes('pears') && api.length===0 && !/Smart add/.test(lbl), JSON.stringify({ n, lbl }));

    /* other phones */
    await mk({});
    await page.locator('#emptyMic').click(); await page.waitForTimeout(400);
    ok('other phones keep the listening sheet', await page.locator('.voicesheet').count()===1 && !(await page.locator('#dictBox').count()), '');
    ok('the privacy page says the app records no sound and only text goes to Smart add', /never\s+records\s+sound/i.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
