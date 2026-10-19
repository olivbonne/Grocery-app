/* v2.28 — map a shop by photographing its aisle signs.

   WHAT THESE CHECKS HAVE TO PROVE: in Settings › Sort › Aisle map, "Read a sign" opens the camera (a file input attached to
   the page — iOS fires nothing for a detached one); the wait shows at once, with its step, in a role="status" line, and
   the button cannot be pressed twice; a read sign joins the END of the box as "5 pasta, rice, sauces", keeping what was
   typed, ready for the next sign; every failure ends in words — quota, not set up, a photo with no sign, no connection —
   never a silent nothing; the day's free limit is enforced, and its counter survives applying an appearance slot.

   /api/aisle is answered by a route here (the endpoint itself is tested in api-aisle.js, with no network).
   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (extra) => `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:[{id:"1",name:"Spaghetti",cat:"bulk",qty:1,weight:"",checked:false,tags:[]}], buyAgain:[], baTomb:{}, stores:[], storeMeta:{},
    members:["O"], name:"Sandbox", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]}, aislemap:{} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","dand");
  ${extra||''}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page, reply, hold=null;
  const mk = async(extra)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/aisle', async r => { if(hold) await hold; const x = reply();
      if(x === 'abort') return r.abort('internetdisconnected');
      return r.fulfill({ status:x.status||200, contentType:'application/json', body:JSON.stringify(x.body) }); });
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource|ERR_INTERNET_DISCONNECTED/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.locator('#setNav').click(); await page.waitForTimeout(400);
    await page.locator('#optAisleMap').click(); await page.waitForTimeout(400); };
  const status = ()=>page.evaluate(()=>{ const s=document.querySelector('.amread'); return s ? { t:s.textContent.replace(/\s+/g,' ').trim(), role:s.getAttribute('role') } : null; });
  const box = ()=>page.evaluate(()=>(document.querySelector('#amText')||{}).value);
  const read = async()=>{ const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#amCam').click()]);
    await fc.setFiles({ name:'sign.png', mimeType:'image/png', buffer:PNG }); };

  try{
    /* a sign read, while text is already in the box */
    reply = ()=>({ body:{ aisle:'5', items:['pasta','rice','sauces'] } });
    let release; hold = new Promise(r=>release=r);
    await mk();
    await page.locator('#amText').fill('1 Fruit & veg');
    await read();
    await page.waitForTimeout(400);
    const busy = await status();
    const dis = await page.evaluate(()=>!!(document.querySelector('#amCam')||{}).disabled);
    ok('"Read a sign" opens the camera, and the wait shows at once — its step, in a status line — with the button held',
       busy && busy.role==='status' && /(Preparing the photo|Reading the sign)…/.test(busy.t) && dis, JSON.stringify({ busy, dis }));
    release(); hold = null; await page.waitForTimeout(900);
    ok('the sign joins the END of the box, keeping what was typed', await box()==='1 Fruit & veg\n5 pasta, rice, sauces', JSON.stringify(await box()));
    const st = await status();
    ok('…and says what it added, ready for the next', st && /Added “5 pasta, rice, sauces”\. Next sign\?/.test(st.t), st && st.t);
    if(out) await page.screenshot({ path: out });
    await page.locator('#amSave').click(); await page.waitForTimeout(500);
    const saved = await page.evaluate(()=>((JSON.parse(localStorage.getItem('ml_cache_v101')).aislemap||{}).dand||{}).aisles);
    ok('…and Save keeps both lines as the map', saved && saved.length===2 && saved[1].n==='5' && saved[1].t==='pasta, rice, sauces', JSON.stringify(saved));
    ok('a read sign counts toward the day', JSON.parse(await page.evaluate(()=>localStorage.getItem('ml_aisleday'))||'{}').n===1, '');

    /* every failure ends in words */
    for(const [label, rep, want] of [
      ['the free allowance used up', { status:502, body:{ error:'x', code:'quota' } }, /allowance is used up/],
      ['reading not set up on the server', { status:500, body:{ error:'x', code:'not_configured' } }, /isn't set up on the server yet/],
      ['a photo with no sign in it', { body:{ aisle:'', items:[] } }, /No aisle sign in that photo/],
      ['no connection', 'abort', /Couldn't read that sign|No connection/] ]){
      reply = ()=>rep; await mk();
      await read(); await page.waitForTimeout(1200);
      const s = await status();
      ok(`${label}: the wait ends in words`, s && want.test(s.t) && !/…/.test(s.t) && await box()==='', s && s.t);
    }

    /* the day's free limit, and its counter is not a look */
    reply = ()=>({ body:{ aisle:'1', items:['x'] } });
    const today = new Date(); const dk = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    await mk(`localStorage.setItem("ml_aisleday", JSON.stringify({ d:"${dk}", n:60 }));`);
    await read(); await page.waitForTimeout(600);
    const capped = await status();
    ok('at the day\'s limit it says so instead of reading', capped && /60 signs today/.test(capped.t), capped && capped.t);
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    const ex = (src.match(/const APP_EXCLUDE(?:_BOOT)? = \/\^\(([^)]*)\)\//g)||[]);
    ok('the day\'s counter survives applying an appearance slot (in both exclude lists)', ex.length===2 && ex.every(x=>/ml_aisleday\$/.test(x)), '');
    /* SUPERSEDED by v2.43: every file picker is built in js/platform.js (pickFile), and the aisle sign's goes through it.
       Still protects: the input is attached to the page before it is opened (iOS), and the sign's picker uses it. */
    const plat = fs.readFileSync(path.join(ROOT,'js','platform.js'),'utf8');
    ok('the camera input is attached to the page before it is opened (iOS)', /document\.body\.appendChild\(f\);\s*\/\/ iOS fires change only/.test(plat) && /function amPick\(\)\{ pickFile\(/.test(src), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
