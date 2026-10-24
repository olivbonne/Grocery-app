/* v2.66 — grid tiles: the icon, the name and the lines under it are one centred block (after another app's tiles).

   WHAT THESE CHECKS HAVE TO PROVE: in a row of 3 tiles — nothing under the name, one line, two lines — the icon sits lower
   the fewer lines there are (it moves up as lines are added), it is the SAME size in all three, the lines under the name are
   smaller than the name, and a long note wraps to a second line rather than being cut.

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
    const mk = async(o, q)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => { api.push(r.request().url()); r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ items:[{name:"milk",qty:1,weight:"",category:"fresh"}] }) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html${q}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500); };
    const names = (c)=>page.evaluate((c)=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_'+c)).items.map(i=>i.name.toLowerCase()); }catch(e){ return []; } }, c||'v101');

    for(const ico of ["m","xl"]){
      await mk({ docs:{ v101:DOC({ items:[it("1","Apples","fruit"), it("2","Pears","fruit",{ note:"Jazz" }), it("3","Plums","fruit",{ qty:2, weight:"1kg", note:"Pink Lady, Granny Smith and more" })] }),  },
        extra:`localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_largecols","3"); localStorage.setItem("ml_icosize","${ico}");` }, '');
      const t = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const ic=p.querySelector('.pemoji').getBoundingClientRect(), r=p.getBoundingClientRect();
        const nm=p.querySelector('.pname'), sub=[...p.querySelectorAll('.pill-meta, .pnote')]; const note=p.querySelector('.pnote');
        return { iconTop:Math.round(ic.top-r.top), icon:Math.round(ic.width)+'x'+Math.round(ic.height), nameFs:parseFloat(getComputedStyle(nm).fontSize),
          subFs:sub.map(x=>parseFloat(getComputedStyle(x).fontSize)), noteLines: note ? Math.round(note.getBoundingClientRect().height/parseFloat(getComputedStyle(note).lineHeight)) : 0 }; }));
      ok(`(icons ${ico.toUpperCase()}) the icon moves up as lines are added under the name: none > one > two`, t.length===3 && t[0].iconTop>t[1].iconTop && t[1].iconTop>t[2].iconTop, JSON.stringify(t.map(x=>x.iconTop)));
      ok(`…and it stays the same size`, new Set(t.map(x=>x.icon)).size===1, JSON.stringify(t.map(x=>x.icon)));
      ok(`…the lines under the name are smaller than the name`, t.every(x=>x.subFs.every(f=>f<x.nameFs)), JSON.stringify(t.map(x=>[x.nameFs,x.subFs])));
      ok(`…and a long note wraps to a second line instead of being cut`, t[2].noteLines===2, String(t[2].noteLines));
      if(out) await page.screenshot({ path: out.replace(/\.png$/,`-${ico}.png`) });
    }
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
