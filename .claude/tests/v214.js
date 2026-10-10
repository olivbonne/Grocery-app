/* v2.14 — the household's batch of 2026-10-11 (afternoon):
   1. "have the same colour for the report problem button as the name count and store";
   2. "make sure the line weight for the plan, shop and settings icons are the same (plan looks thicker)";
   3. a UI/UX and long-term review, written into the Samsung Food report (docs only, not tested here).

   WHAT THESE CHECKS HAVE TO PROVE: the Report button's computed background and ink equal the name tile's,
   on Auto and with a colour chosen; and the three bar icons' strokes RENDER at the same width — measured
   as the stroke-width the browser computes times the icon's own viewBox scale, because the attributes
   differ on purpose (each mark is drawn in its own units). Line weight (Settings) must not move them.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.07 the app reopens on the
   last page; v2.10 a fresh profile runs the v1.63 slot migration and reloads — seed ml_appmig163. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (items, extra) => `(() => {
  if(localStorage.getItem("ml_me")) return;
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(items)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Sandbox",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Sandbox"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  ${extra||''}
})()`;
const it=(id,n,c,q,w,ck)=>({id,name:n,cat:c,qty:q||1,weight:w||"",checked:!!ck,tags:[]});
const GRID4 = 'localStorage.setItem("ml_displays", JSON.stringify({shop:"large"})); localStorage.setItem("ml_largecols","4"); localStorage.setItem("ml_fill","full"); localStorage.setItem("ml_caton","0");';


const SMALL0 = n => `localStorage.setItem("ml_displays", JSON.stringify({shop:"small"})); localStorage.setItem("ml_smallcols","${n}"); localStorage.setItem("ml_caton","0"); localStorage.setItem("ml_store","home");`;
const LIST = [["Frozen raspberries","frozen",2],["Ginger beer no sugar","drinks"],["Beef cubes","meat",1,"800g"],["Beef topside steak","meat",3,"200g"],
  ["Lamb rump or flank","meat"],["Chicken breast","meat",3,"200g"],["Chicken drumsticks","meat",4,"1kg"],["Chicken thigh","meat",8,"500g"],["Avocados","vegetable"]];

const SMALL = n => SMALL0(n);


(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(items, extra)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(items, extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const LIST=[["Eggs","fresh",12],["Milk","fresh",2],["Bananas","fruit"]].map((x,i)=>it(String(i),x[0],x[1],x[2]));
  const tiles = ()=>page.evaluate(()=>{ const g=e=>e?getComputedStyle(e):null, b=document.querySelector('#shopReport'), n=document.querySelector('#listSwitch'), c=document.querySelector('.topfix .hcount');
    return { rep:b&&{bg:g(b).backgroundColor, col:g(b).color}, name:n&&{bg:g(n).backgroundColor, col:g(n).color}, count:c&&{bg:g(c).backgroundColor, col:g(c).color} }; });

  try{
    /* ── 1. the Report button wears the banner tiles' colour ───────────── */
    await mk(LIST, SMALL(3));
    const a = await tiles();
    ok('on Auto, the Report button has the same background and ink as the list name and the count', a.rep && a.rep.bg===a.name.bg && a.rep.bg===a.count.bg && a.rep.col===a.name.col, JSON.stringify(a));
    await mk(LIST, SMALL(3)+'localStorage.setItem("ml_toptile","#2E6BD9");');
    const b = await tiles();
    ok('with "Name, count and store" set to a colour, the Report button takes it too — background and ink', b.rep && b.rep.bg==='rgb(46, 107, 217)' && b.rep.bg===b.name.bg && b.rep.col===b.name.col, JSON.stringify(b));
    await shot('banner');

    /* ── 2. one line weight across the bottom bar ──────────────────────── */
    const w = await page.evaluate(()=>[...document.querySelectorAll('#bottomnav .navbtn')].map(btn=>{
      const sv=btn.querySelector('svg'), vb=sv.viewBox.baseVal, r=sv.getBoundingClientRect(), k=Math.min(r.width/vb.width, r.height/vb.height);
      const shape=[...sv.querySelectorAll('path,rect,circle,line,polyline')].find(e=>getComputedStyle(e).stroke!=='none');
      return +(parseFloat(getComputedStyle(shape).strokeWidth)*k).toFixed(3); }));
    ok('Plan, Shop and Settings are drawn with the same line weight (to 0.02px)', w.length===3 && Math.max(...w)-Math.min(...w) <= 0.02, JSON.stringify(w));
    ok('…the cart\'s, about 2.17px — Plan is no longer heavier (it was 2.47px) nor the gear lighter (1.73px)', w.every(x=>Math.abs(x-2.167)<=0.02), JSON.stringify(w));
    for(const lw of ['fine','bold']){
      await mk(LIST, SMALL(3)+`localStorage.setItem("ml_linew","${lw}");`);
      const w2 = await page.evaluate(()=>[...document.querySelectorAll('#bottomnav .navbtn svg')].map(sv=>{ const vb=sv.viewBox.baseVal, r=sv.getBoundingClientRect(), k=Math.min(r.width/vb.width, r.height/vb.height);
        const shape=[...sv.querySelectorAll('path,rect,circle')].find(e=>getComputedStyle(e).stroke!=='none'); return +(parseFloat(getComputedStyle(shape).strokeWidth)*k).toFixed(3); }));
      ok(`…and Line weight "${lw}" (for the item drawings) leaves the bar alone`, w2.every(x=>Math.abs(x-2.167)<=0.02), JSON.stringify(w2));
    }
    await shot('nav');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
