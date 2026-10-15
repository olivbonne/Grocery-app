/* v2.38 — the household's items of 15 October (third batch). Item 1 was a question (the aisle order with no map), answered in chat.

   WHAT THESE CHECKS HAVE TO PROVE:
   - (2) the add panel says "Add card", "Choose photo" and "Type it"; "Choose photo" opens the picker without the camera hint;
     "Type it" opens the name and number right below those two buttons, in the same drop-down, with the Add card tile still
     above and no photo row in the form (the tile is the camera); Save keeps the card;
   - (3) no explanation under the Add card tile, nor under the two buttons.

   TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c,q)=>({id,name:n,cat:c,qty:q||1,weight:"",checked:false,tags:[]});
const NAMES=[["Salad rocket","vegetable",1],["High protein yogurt","fresh",2],["Frozen raspberries","fresh",2],["Cream","fresh",1],["Nexba lemon squash","others",2],["Popcorn Sweet and Salty","others",2],["Linguine","bulk",2],["Honey","bulk",1],["Tofu soft","asian",2]];
const ITEMS=NAMES.map(([n,c,q],i)=>it(String(i+1),n,c,q));
let CARDREPLY = { status:200, body:{ name:'Flybuys', number:'6008943218616910' }, delay:500 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(o.items||ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries",
    baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1");
  localStorage.setItem("ml_store","${o.store||'home'}");
  localStorage.setItem("ml_cache_v101", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ml_cache_v101")), ${JSON.stringify(o.doc||{})})));
  ${o.extra||''}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    await ctx.route('**/api/card', async r => { await new Promise(z=>setTimeout(z, CARDREPLY.delay||0)); r.fulfill({ status:CARDREPLY.status, contentType:'application/json', body:JSON.stringify(CARDREPLY.body) }); });
    await ctx.route('**/api/receipt', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEIPT) }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const ls = k=>page.evaluate(k=>localStorage.getItem(k), k);
  const pill = id=>page.locator(`#zoomer .pill[data-pill="${id}"]:visible`).first();   // visible: the urgent strip keeps hidden copies

  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  try{
    await mk({ store:'home' });
    await tap('#shopMenu'); await tap('#smCard');
    const p = await page.evaluate(()=>({ t:(document.querySelector('#cardTitle')||{}).textContent, ph:(document.querySelector('#cardPhotoGo')||{}).textContent, ty:(document.querySelector('#cardTypeGo')||{}).textContent,
      sub:!!document.querySelector('.cardadd-sub'), hint:[...document.querySelectorAll('#cardSheet .hint')].map(h=>h.textContent) }));
    ok('(2) the panel says "Add card", "Choose photo" and "Type it"', p.t==='Add card' && p.ph==='Choose photo' && p.ty==='Type it', JSON.stringify(p));
    ok('(3) no explanation under the Add card tile, nor under the buttons', !p.sub && p.hint.length===0, JSON.stringify(p.hint));
    await shot('panel');
    const lib = await page.evaluate(()=>new Promise(res=>{ const orig=HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click=function(){ HTMLInputElement.prototype.click=orig; res({ type:this.type, capture:this.getAttribute('capture') }); };
      document.querySelector('#cardPhotoGo').click(); setTimeout(()=>res(null), 1500); }));
    ok('(2) "Choose photo" opens the photo picker, not the camera', lib && lib.type==='file' && lib.capture===null, JSON.stringify(lib));
    await tap('#cardTypeGo');
    const f = await page.evaluate(()=>{ const sh=document.querySelector('#cardSheet'), btns=sh && sh.querySelector('.cardaddbtns'), form=sh && sh.querySelector('#ceSheet');
      return { tile:!!sh.querySelector('#cardSwipe.cardadd'), below:!!(btns && form && btns.nextElementSibling===form), name:!!(form && form.querySelector('#ceName')), num:!!(form && form.querySelector('#ceNum')),
        photo:!!(form && form.querySelector('#cePhoto')), title:!!(form && form.querySelector('#ceTitle')), bottom:!!document.querySelector('#ceBg'), focus:document.activeElement && document.activeElement.id,
        pressed:document.querySelector('#cardTypeGo').getAttribute('aria-expanded') }; });
    ok('(2) "Type it" opens the name and number right below the two buttons, in the same drop-down', f.tile && f.below && f.name && f.num && !f.bottom && f.focus==='ceName' && f.pressed==='true', JSON.stringify(f));
    ok('(2) …with no photo row in it (the Add card tile is the camera)', !f.photo && !f.title, JSON.stringify(f));
    await shot('typeit');
    await page.locator('#ceName').fill('Everyday Rewards'); await page.locator('#ceNum').fill('9355123456789'); await tap('#ceSave');
    const sv = await page.evaluate(()=>({ cards:JSON.parse(localStorage.getItem('ml_cards')||'[]').map(c=>c.name+'|'+c.chain), t:(document.querySelector('#cardTitle')||{}).textContent, band:(document.querySelector('#cardSwipe .cardband')||{}).textContent }));
    ok('(2) Save keeps the card and shows it', sv.cards.length===1 && sv.cards[0]==='Everyday Rewards|woolworths' && /Everyday Rewards/.test(sv.band||''), JSON.stringify(sv));
    await shot('saved');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
