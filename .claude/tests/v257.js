/* v2.57 — the household's batch (23 October 2026, second round).

   WHAT THESE CHECKS HAVE TO PROVE:
   1 the Language label is set like the section headings around it;
   2 Settings › Help says how the security check is doing; a failure sends only a short code, logged sanitised;
   3 a photo from the add sheet is read as a SHOPPING LIST (kind:"list"), and an empty answer is about the photo;
   4 "Use the new categories" moves a list of the nine to the thirteen — items and Regulars, stamped, after a backup;
   5/7 no Paste tile; Smart add, Camera and Photos on one line;
   6 the empty list's microphone opens a voice sheet, starts listening in the tap, shows each thing heard, ✓ → Smart add;
   8 the empty list's two tiles are centred in grid mode;
   9 Edit item: flags first, sections one size without capitals, folded; Note suggests options for the item;
   10/12 an item can be dragged within its category; the lists sheet's ⋯ opens options inline; a list can be dragged.

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
    let ctx, page, apiBodies=[];
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQEALhvCvZ3cYwLAAAAAElFTkSuQmCC','base64');
    const mk = async(o, q)=>{ o=o||{}; if(ctx) await ctx.close(); ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:false });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: /firebase-auth\.js/.test(r.request().url()) ? AUTHSTUB : FSTUB }));
      await ctx.route('**/api/**', r => { let b={}; try{ b=JSON.parse(r.request().postData()||"{}"); }catch(e){}
        apiBodies.push({ url:r.request().url(), body:b, headers:r.request().headers() });
        const items = /api\/parse/.test(r.request().url()) ? [{name:"milk",qty:1,weight:"",category:"fresh"},{name:"eggs",qty:6,weight:"",category:"fresh"}] : [];
        r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ title:"", servings:4, items, steps:[] }) }); });
      page = await ctx.newPage(); page.setDefaultTimeout(9000);
      page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
      page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
      page.on('dialog', d=>d.accept());
      await page.addInitScript(seed(o)); await page.goto(`http://127.0.0.1:${port}/index.html${q===undefined?'?list=v101':q}`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400); };
    const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
    const cache = ()=>page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_cache_v101')); }catch(e){ return null; } });
    const hold = async(sel, to)=>{ const a=await page.locator(sel).first().boundingBox();
      await page.mouse.move(a.x+a.width/2, a.y+a.height/2); await page.mouse.down(); await page.waitForTimeout(650);
      if(to){ for(let s=1;s<=10;s++){ await page.mouse.move(a.x+a.width/2+(to.x-(a.x+a.width/2))*s/10, a.y+a.height/2+(to.y-(a.y+a.height/2))*s/10); await page.waitForTimeout(30); } }
      await page.mouse.up(); await page.waitForTimeout(600); };
    const center = async(sel)=>{ const b=await page.locator(sel).first().boundingBox(); return { x:b.x+b.width/2, y:b.y+b.height/2 }; };

    /* 1 + 2 ─ Language looks like a heading; Connection check in Help */
    await mk();
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    const lf = await page.evaluate(()=>{ const l=document.querySelector('.optlangtop .optlabel'), h=document.querySelector('.optsect');
      const f=e=>{ const s=getComputedStyle(e); return [s.fontSize, s.fontWeight]; }; return { l:f(l), h:f(h) }; });
    ok('1 · the Language label is set like the section headings beside it', JSON.stringify(lf.l)===JSON.stringify(lf.h), JSON.stringify(lf));
    await shot('settings');
    const diag = await page.evaluate(()=>/Security check: (not started|working|not working)/.test(document.body.textContent));
    ok('2 · Settings › Help has a Connection check that says how the security check is doing', diag, '');
    const src = fs.readFileSync(path.join(ROOT,'js','app.js'),'utf8'), guard = fs.readFileSync(path.join(ROOT,'lib','guard.js'),'utf8');
    ok('2 · when the check fails, only a short error code goes to the server (x-appcheck-err), and the server logs it sanitised', /"x-appcheck-err": acDiag\.code/.test(src) && /x-appcheck-err/.test(guard) && /client:/.test(guard), '');
    ok('2 · the privacy page says so', /error code/i.test(fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8')), '');

    /* 5 + 7 ─ the add sheet's start tiles: no Paste, three on one line */
    await mk({ docs:{ v101:DOC({ items:[] }) } });
    await page.locator('#emptyAdd').click(); await page.waitForTimeout(900);
    const st = await page.evaluate(()=>{ const b=[...document.querySelectorAll('[data-add-smart],[data-add-photo]')].map(e=>{ const r=e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.right)]; });
      return { n:b.length, paste:document.querySelectorAll('[data-add-paste]').length, oneLine: b.length && b.every(x=>Math.abs(x[0]-b[0][0])<3), fits: b.every(x=>x[1]<=390) }; });
    ok('5/7 · Paste is gone; Smart add, Camera and Photos sit on one line and fit the screen', st.n===3 && st.paste===0 && st.oneLine && st.fits, JSON.stringify(st));
    await page.waitForTimeout(500); await shot('addstart');

    /* 3 ─ a photo of a list goes to the list reader, and an empty answer says so in its own words */
    apiBodies=[];
    const [fc] = await Promise.all([ page.waitForEvent('filechooser'), page.locator('[data-add-photo="gallery"]').click() ]);
    await fc.setFiles({ name:'list.png', mimeType:'image/png', buffer:PNG }); await page.waitForTimeout(1800);
    const rq = apiBodies.find(a=>/api\/recipe/.test(a.url));
    ok('3 · a photo from the add sheet asks for a SHOPPING LIST reading (kind:"list")', rq && rq.body.kind==='list' && /^data:image\//.test(rq.body.image||''), rq ? JSON.stringify({ kind:rq.body.kind }) : 'no call');
    const msg = await page.evaluate(()=>document.body.textContent);
    ok('3 · …and when nothing is found it says so about the photo, not "the recipe"', /Nothing to buy found in that photo/.test(msg) && !/try pasting the full recipe/.test(msg), '');

    /* 6 + 8 ─ the voice sheet, from the empty list's microphone; the tiles are centred in grid mode */
    const FAKE_SR = `window.webkitSpeechRecognition = class { constructor(){ window.__sr=this; } start(){ window.__srStarted=(window.__srStarted||0)+1;
        setTimeout(()=>{ this.onresult && this.onresult({ resultIndex:0, results:[ Object.assign([{ transcript:"milk and eggs" }], { isFinal:true }) ] }); }, 150); }
      stop(){ setTimeout(()=>this.onend && this.onend(), 10); } }; window.SpeechRecognition = window.webkitSpeechRecognition;`;
    await mk({ docs:{ v101:DOC({ items:[] }) }, extra:`localStorage.setItem("ml_displays", JSON.stringify({shop:"grid4",plan:"grid4"}));` });
    await page.evaluate(FAKE_SR);
    const tc = await page.evaluate(()=>{ const a=document.querySelector('#emptyMic').getBoundingClientRect(), b=document.querySelector('#emptyAdd').getBoundingClientRect();
      return Math.round((a.left + b.right)/2); });
    ok('8 · the empty list\'s microphone and + are centred, even with grid tiles', Math.abs(tc - 195) <= 6, String(tc));
    await page.locator('#emptyMic').click(); await page.waitForTimeout(700);
    const vs = await page.evaluate(()=>({ sheet:!!document.querySelector('.voicesheet'), started:window.__srStarted||0, rows:[...document.querySelectorAll('#voiceList .voicerow:not(.voiceskel)')].map(r=>r.textContent.trim()) }));
    ok('6 · the microphone opens the voice sheet and starts listening inside the tap', vs.sheet && vs.started===1, JSON.stringify(vs));
    ok('6 · what is heard shows as it comes, one row per thing ("milk and eggs" → milk, eggs)', JSON.stringify(vs.rows)==='["milk","eggs"]', JSON.stringify(vs.rows));
    await shot('voice');
    apiBodies=[];
    await page.locator('#voiceDone').click(); await page.waitForTimeout(1500);
    const vp = apiBodies.find(a=>/api\/parse/.test(a.url));
    ok('6 · ✓ sends what was said to Smart add', vp && /milk/.test(vp.body.text||''), vp ? vp.body.text : 'no call');

    /* 9 ─ the Edit item sheet */
    await mk({ docs:{ v101:DOC({ items:[it("1","Yogurt","dairy",{ note:"" }), it("2","Milk","dairy")] }) } });
    await hold('[data-pill="1"]');
    const ed = await page.evaluate(()=>{ const sh=document.querySelector('#sheet'); if(!sh) return null;
      const flags=sh.querySelector('[data-flag]'), qty=sh.querySelector('#qMinus'), labs=[...sh.querySelectorAll('.editsec-l')];
      return { flagsFirst: !!(flags && qty && (flags.compareDocumentPosition(qty) & Node.DOCUMENT_POSITION_FOLLOWING)),
        labels: labs.map(l=>l.textContent.trim()), sizes:[...new Set(labs.map(l=>getComputedStyle(l).fontSize))], upper: labs.some(l=>getComputedStyle(l).textTransform==='uppercase'),
        folded: ![...sh.querySelectorAll('.catchip')].some(c=>c.offsetParent!==null) }; });   // v2.65: note chips are in the page but hidden until the note has focus
    /* SUPERSEDED by v2.63: Quantity and Measure are rows now, above Note (was: Note first). Still protected: flags first,
       one label size, no capitals, everything folded. */
    ok('9 · Edit item: flags above the quantity; Quantity, Measure, Note, Category… one size, no capitals; everything folded', ed && ed.flagsFirst && ed.labels.slice(0,3).join()==='Quantity,Measure,Note' && ed.sizes.length===1 && !ed.upper && ed.folded, JSON.stringify(ed));
    /* SUPERSEDED by v2.65: the note is always a field (no fold); its suggestions show while it has focus. Still protected:
       a field, and this item's suggestions. */
    await page.locator('#sheet #editNote').click(); await page.waitForTimeout(400);
    const chips = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotechips .catchip')].filter(c=>c.offsetParent!==null).map(c=>c.textContent.trim()));
    ok('9 · the Note field shows suggestions for this item while typing (yogurt → Greek, low fat…)', chips.includes('Greek') && chips.some(c=>/low fat/i.test(c)) && await page.locator('#sheet input#editNote').count()===1, JSON.stringify(chips));
    await shot('edititem');
    await page.locator('#sheet .catchip', { hasText:'Greek' }).click(); await page.waitForTimeout(300);
    /* SUPERSEDED by v2.68: the chosen suggestion shows as a tile, not in the box. Still protected: it is in the note. */
    const nv = await page.evaluate(()=>[...document.querySelectorAll('#sheet .ednotesel .catchip')].map(c=>c.textContent.trim()).join(', '));
    ok('9 · tapping a suggestion puts it in the note (as a chosen tile)', /Greek/.test(nv||''), String(nv));

    /* 10a ─ dragging an item on the Shop page */
    await mk({ docs:{ v101:DOC({ items:[it("1","Apples","fruit"), it("2","Bananas","fruit"), it("3","Cherries","fruit")] }) } });
    const ca = await center('[data-pill="1"]');
    await hold('[data-pill="3"]', ca);
    const its = ((await cache())||{}).items||[];
    const ord = its.filter(i=>typeof i.pos==='number').sort((a,b)=>a.pos-b.pos).map(i=>i.name);
    ok('10 · hold and drag an item: Cherries moves first in Fruit, kept as pos with a fresh stamp', ord[0]==='Cherries' && its.find(i=>i.name==='Cherries').ts>0, JSON.stringify(ord));
    const shown = await page.evaluate(()=>[...document.querySelectorAll('[data-pill]')].map(p=>p.textContent.trim().replace(/\s+/g,' ')).slice(0,3));
    ok('10 · …and the list shows that order', /Cherries/.test(shown[0]||''), JSON.stringify(shown));
    await shot('itemdrag');

    /* 10b ─ lists: ⋯ opens options inline; hold-and-drag reorders */
    const THREE = { lists:[{code:"v101",name:"Groceries"},{code:"v202",name:"Hardware"},{code:"v303",name:"Party"}],
      docs:{ v101:DOC(), v202:DOC({ name:"Hardware" }), v303:DOC({ name:"Party" }) } };
    await mk(THREE);
    await page.locator('#listSwitch').click(); await page.waitForTimeout(500);
    await page.locator('[data-list-more="v202"]').click(); await page.waitForTimeout(400);
    const inl = await page.evaluate(()=>({ panel:!!document.querySelector('.lp-opts[data-lo="v202"]'), btns:document.querySelectorAll('.lp-opts button').length, sheet:!!document.querySelector('#listActSheet'), still:!!document.querySelector('#listsSheetEl') }));
    ok('12 · ⋯ shows the list\'s options right below it, in the same sheet (no new window)', inl.panel && inl.btns>=4 && !inl.sheet && inl.still, JSON.stringify(inl));
    await shot('listopts');
    await page.locator('[data-list-more="v202"]').click(); await page.waitForTimeout(300);
    const top = await center('[data-list="v101"]');
    await hold('[data-list="v303"]', top);
    const order = await page.evaluate(()=>JSON.parse(localStorage.getItem('ml_lists')).map(l=>l.code));
    ok('12 · hold and drag a list to move it (Party to the top)', order[0]==='v303', JSON.stringify(order));

    /* 4 ─ moving a list to the thirteen categories */
    await mk({ docs:{ v101:DOC({ items:[it("1","Milk","fresh"), it("2","Rice","bulk"), it("3","Wine","alcohol"), it("4","Thing","mine")],
      categories:null, buyAgain:[{name:"Cheese",cat:"fresh",qty:1,ts:1}] }) } });
    await page.locator('#setNav').click(); await page.waitForTimeout(500);
    await page.evaluate(()=>{ const s=document.querySelector('#optSearch, .optsearch input, input[type=search]'); });
    const btn = page.locator('#optCats13'); const has = await btn.count();
    if(has){ await page.evaluate(()=>{ document.querySelectorAll('.optgrpbody.coll').forEach(b=>b.classList.remove('coll')); }); await btn.click(); await page.waitForTimeout(700); }
    const d = await cache();
    const cat = n => ((d&&d.items)||[]).find(i=>i.name===n)?.cat;
    const snaps = await page.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ml_snap_v101')||'[]').length; }catch(e){ return -1; } });
    ok('4 · "Use the new categories" moves the list to the thirteen (Milk → Dairy, Rice → Pantry, Wine → Liquor), after a backup',
      has===1 && d && (d.categories||[]).some(c=>c.id==='pantry') && cat('Milk')==='dairy' && cat('Rice')==='pantry' && cat('Wine')==='liquor' && snaps>=1,
      JSON.stringify({ has, cats:(d&&d.categories||[]).map(c=>c.id).join(','), milk:cat('Milk'), rice:cat('Rice'), wine:cat('Wine'), snaps }));
    ok('4 · …Regulars move too, with a fresh stamp so other phones take it', d && d.buyAgain[0].cat==='dairy' && d.buyAgain[0].ts>1, JSON.stringify(d && d.buyAgain));
    const gone = await page.evaluate(()=>!!document.querySelector('#optCats13'));
    ok('4 · …and the row goes away once the list has them', !gone, '');

    const rec = fs.readFileSync(path.join(ROOT,'api','recipe.js'),'utf8');
    ok('3 · the server reads a list photo with its own instructions (not "if the image is not a recipe, return nothing")', /LIST_VISION_SYSTEM/.test(rec) && /kind === 'list'/.test(rec), '');
  } catch(e){ ok('suite ran to the end', false, (e.stack||e.message).slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  if(browser) await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
