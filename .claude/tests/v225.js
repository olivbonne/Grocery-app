/* v2.25 — security before strangers (the app review's R25, the code side) and "delete my data" (R26).

   WHAT THESE CHECKS HAVE TO PROVE: a new list — on a first start, from "New list", or as a copy — gets a 25-character code
   from the cryptographic generator, and nothing makes 8-character codes any more; Settings › Your data can leave a list
   (your name comes off it in what is saved, and this phone forgets it and moves to another list), empty a list for
   everyone (content gone, Regulars tombstoned so another phone cannot merge them back, the household-wide predictions
   reset set; name, people and categories kept), and forget everything on this phone; the privacy page is there, offline-
   safe (no outside files), says what leaves the app, and links back; the database rules kept in the repo deny listing,
   deletes and anything outside lists/, and cap a list at four people.

   The Firebase stub here RECORDS what setDoc is given (localStorage t_sets — not ml_, and it outlives a navigation), so "what is saved" can be checked without any
   network. TEST-BUG NOTES CARRIED FORWARD: v2.00 the seed returns early once seeded; v2.10 seed ml_appmig163. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=(db,c,id)=>({ path:c+"/"+id });
export const onSnapshot=()=>()=>{};export const setDoc=async(r,d)=>{ try{ const a=JSON.parse(localStorage.getItem("t_sets")||"[]"); a.push({ path:r&&r.path, d:JSON.parse(JSON.stringify(d)) }); localStorage.setItem("t_sets", JSON.stringify(a.slice(-5))); }catch(e){} };export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x===undefined?'':String(x)]);
const it=(id,n,c)=>({id,name:n,cat:c,qty:1,weight:"",checked:false,tags:[]});
const LIST = { items:[it('1','Milk','fresh'), it('2','Rice','bulk')], buyAgain:[{name:'Bread',cat:'fresh',qty:1,ts:5}], baTomb:{}, stores:[], storeMeta:{},
  members:["O","Sam"], name:"Home", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0,
  purch:{ bread:{ name:'Bread', cat:'fresh', qty:1, ts:[1,2] } }, plan:{days:{'2026-10-12':[{id:'p1',kind:'food',name:'Soup'}]},recipes:[],saved:[]},
  prices:{ milk:[{p:4.5,q:1,s:'dand',sn:'Coles Dandenong',d:'2026-10-01',w:'',t:1}] }, spend:[{t:1,d:'2026-10-01',s:'dand',sn:'Coles Dandenong',tot:4.5,c:{fresh:4.5},n:1}],
  templates:[{id:'t1',name:'BBQ',at:1,items:[]}], memb:{ coles:{ on:true, pct:10, cap:50, day:1, used:{} } }, shopping:{}, aisle:{ dand:{ fresh:1 } } };
const seed = (o) => { o=o||{}; return `(() => {
  if(localStorage.getItem("t_seeded")) return; localStorage.setItem("t_seeded","1");   // not ml_: "Forget everything" must not make the seed run again
  ${o.empty ? '' : `
  localStorage.setItem("ml_cache_v101", JSON.stringify(${JSON.stringify(LIST)}));
  localStorage.setItem("ml_cache_w202", JSON.stringify(Object.assign({}, ${JSON.stringify(LIST)}, { name:"Work", items:[] })));
  localStorage.setItem("ml_hist_v101", "[]"); localStorage.setItem("ml_snap_v101", "{}"); localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false}));
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Home"},{code:"w202",name:"Work"}]));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_store","home");`}
})()`; };

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(o, url)=>{ o=o||{}; if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    page.on('dialog', d=>d.accept());
    await page.addInitScript(seed(o));
    await page.goto(`http://127.0.0.1:${port}${url||'/index.html?list=v101'}`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(450); };
  const ls = (k)=>page.evaluate(k=>localStorage.getItem(k), k);
  const lastSet = ()=>page.evaluate(()=>{ const a=JSON.parse(localStorage.getItem('t_sets')||'[]').filter(s=>s.path==='lists/v101'); return a.length ? a[a.length-1].d : null; });
  const CODE = /^[0-9a-z]{25}$/;

  try{
    /* ── R25 codes ──────────────────────────────────────────────────────── */
    await mk({ empty:true }, '/index.html');
    const first = new URL(page.url()).searchParams.get('list');
    ok('a first start makes a 25-character code from the cryptographic generator', CODE.test(first||''), first);
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8');
    ok('…and nothing makes 8-character codes any more (all three places call newListCode)', !/uid\(\)\.slice\(0,8\)/.test(src) && (src.match(/newListCode\(\)/g)||[]).length>=4 && /crypto\.getRandomValues/.test(src), '');
    await mk();

    /* ── R26 your data ──────────────────────────────────────────────────── */
    await tap('#setNav');
    const sect = await page.evaluate(()=>{ const b=[...document.querySelectorAll('#optPrivacy,#optLeave,#optEmpty,#optForget')]; return b.map(x=>x.id+':'+x.textContent.trim()); });
    ok('Settings › Your data: the privacy page, Leave, Empty, Forget', sect.length===4 && /optPrivacy:Privacy/.test(sect[0]) && (await page.evaluate(()=>(document.querySelector('#optPrivacy')||{}).getAttribute&&document.querySelector('#optPrivacy').getAttribute('href')))==='/privacy.html', JSON.stringify(sect));
    if(out) await page.screenshot({ path: out });

    /* empty for everyone */
    await tap('#optEmpty');
    const e = await lastSet(), ec = JSON.parse(await ls('ml_cache_v101')||'{}');
    const emptied = d => d && d.items.length===0 && d.buyAgain.length===0 && Object.keys(d.prices).length===0 && d.spend.length===0 && d.templates.length===0
      && Object.keys(d.memb).length===0 && Object.keys(d.aisle).length===0 && Object.keys(d.purch||{}).length===0 && !Object.keys(d.plan.days||{}).length;
    ok('"Empty this list for everyone" saves it empty: items, Regulars, plan, prices, spending, occasions, memberships, learning', emptied(e) && emptied(ec), JSON.stringify(e && { i:e.items.length, b:e.buyAgain.length, p:Object.keys(e.prices), s:e.spend, t:e.templates, m:e.memb, a:e.aisle, pu:e.purch, pl:e.plan }));
    ok('…Regulars by tombstone and the household-wide reset, so another phone\'s copy cannot merge them back', e && e.baTomb && e.baTomb['bread|fresh'] > 0 && e.predictReset > 0, JSON.stringify(e && { tomb:e.baTomb, reset:e.predictReset }));
    ok('…and keeps the list\'s name, people and categories', e && e.name==='Home' && JSON.stringify(e.members)==='["O","Sam"]', JSON.stringify(e && { n:e.name, m:e.members }));

    /* leave */
    await mk();
    await tap('#setNav');
    await Promise.all([page.waitForURL(/list=w202/, { timeout:9000 }).catch(()=>{}), page.locator('#optLeave').click()]);
    await page.waitForTimeout(800);
    const keys = await page.evaluate(()=>Object.keys(localStorage));
    ok('"Leave this list" moves to the phone\'s other list', /list=w202/.test(page.url()), page.url());
    ok('…and this phone forgets it: its cache, history, backups and fold state, and its place in the list switcher',
       !keys.some(k=>/_v101$/.test(k)) && !/v101/.test(await ls('ml_lists')||''), JSON.stringify(keys.filter(k=>/v101/.test(k)).concat([await ls('ml_lists')])));
    const lv = await lastSet();
    ok('…after saving the list without your name — the others keep it', lv && JSON.stringify(lv.members)==='["Sam"]' && lv.items.length===2, JSON.stringify(lv && lv.members));

    /* forget everything on this phone */
    await mk();
    await tap('#setNav');
    await Promise.all([page.waitForNavigation({ timeout:9000 }).catch(()=>{}), page.locator('#optForget').click()]);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(()=>({ keys:Object.keys(localStorage), url:location.href }));
    ok('"Forget everything on this phone" clears what it kept — the lists, the name, the caches — and starts fresh',
       !after.keys.some(k=>/v101|w202/.test(k)) && !after.keys.includes('ml_me') && !/list=v101/.test(after.url), JSON.stringify(after));

    /* ── the privacy page ───────────────────────────────────────────────── */
    const ph = fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8');
    ok('the privacy page is self-contained (no outside scripts, styles or fonts) and links back to the app',
       !/(src|href)=["']https?:/i.test(ph.replace(/<a [^>]*>/g,'')) && /href="\/"/.test(ph) && /<title>/.test(ph), '');
    ok('…and says what leaves the app: Smart add, recipes, search, receipts, problem reports, crash reports — and how to delete',
       ['Smart add','recipe','Recipe search','receipt','Report a problem','Crash reports','Firebase','Gemini','Groq','GitHub','Vercel','Leave this list','Empty this list for everyone','Forget everything on this phone'].every(w=>ph.includes(w)), '');
    await mk({}, '/privacy.html');
    ok('…and opens', /What Market List keeps/.test(await page.evaluate(()=>document.body.innerText)), '');

    /* ── the database rules, kept in the repo ───────────────────────────── */
    const rules = fs.readFileSync(path.join(ROOT,'firebase','firestore.rules'),'utf8').replace(/\/\/[^\n]*/g,'');
    /* SUPERSEDED by v2.44: once a list has an access record only its people may read it (members by account); a list without
       one is still read by its code alone. Still protects: by its code, never the list of lists; no deletes; four people;
       nothing outside the named collections. */
    ok('the rules: a list by its code only, never the list of lists; no deletes; four people; nothing outside lists/',
       /match \/lists\/\{code\}/.test(rules) && /allow get: if !hasAccess\(code\) \|\| memberOf\(code\);/.test(rules) && /allow list: if false;/.test(rules) && /allow delete: if false;/.test(rules)
       && /people\(request\.resource\.data\) <= 4/.test(rules) && /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(rules), '');
    ok('…and the publishing steps are written down', fs.existsSync(path.join(ROOT,'docs','firestore-rules.md')) && /Rules Playground/.test(fs.readFileSync(path.join(ROOT,'docs','firestore-rules.md'),'utf8')), '');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
