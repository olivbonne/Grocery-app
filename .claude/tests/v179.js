/* v1.79 — the Lists title starts where every other page's does; the back arrow is optically centred
   rather than box-centred; Page margins moves to Appearance; every section carries a separating rule.

   WHAT THESE CHECKS HAVE TO PROVE:
   - the titles line up ACROSS pages, measured, and the Lists page still has no back button to tap —
     reserving the space must not accidentally give the root page somewhere to go back to;
   - the arrow's INK is level with the title's ink, not merely its box — the boxes were already
     centred, which is why the bug survived until someone looked at it;
   - the moved row is the same row, buttons and all, and still works where it landed;
   - every folded section is separated the same way, with nothing above the first.

   TEST-BUG NOTES CARRIED FORWARD:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: a check that never triggers the thing it names is worse than no check.
   - v1.75: a page transition swallows the next tap while it runs — wait it out.
   - v1.76: find a row by the control it carries, not by a label that may not be unique.
   - v1.77: the Lists page's nav carries its own ids (#setNavL / #cartNavL). */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results=[]; const ok=(n,c,x)=>results.push([n,!!c,x||'']);
const SEED = (extra)=>`(() => {
  const items=[];
  for(let n=0;n<8;n++) items.push({id:"i"+n,name:"item"+n,qty:1,cat:n%2?"meat":"fruit",weight:"",sub:"",checked:false,tags:[],starred:false});
  localStorage.setItem("ml_cache_v101", JSON.stringify({ items,
    buyAgain:[{name:"kiwi",cat:"fruit",qty:1,weight:"",sub:"",ts:9}],
    baTomb:{}, stores:[], storeMeta:{}, members:["O"],
    categories:[{id:"fruit",label:"Fruit",color:"#2F9E44",emoji:"",subs:[]},
                {id:"meat",label:"Meat",color:"#B5402B",emoji:"",subs:[]}],
    name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0 }));
  localStorage.setItem("ml_collapse_v101", JSON.stringify({cats:[],ba:false,regAll:true,regOpen:["fruit"]}));
  localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
  localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}]));
  localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_caton","1");
  ${extra||""}
})()`;

(async () => {
  const [port,out]=process.argv.slice(2);
  const errors=[];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ctx, page;
  const mk = async(extra)=>{
    if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**www.gstatic.com/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,160));});
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(SEED(extra));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1300);
  };
  const tap = async(sel)=>{ const l=page.locator(sel).first(); await l.click(); await page.waitForTimeout(900); };
  const settings = ()=>tap('#setNav, #setNavL');
  const shop = ()=>tap('#cartNav, #cartNavL');
  const lists = ()=>tap('#listsBtn');

  /* The INK of a glyph, not its box. The boxes were already centred — that is why this bug lived so
     long — so the only measurement that can prove the fix reads the painted pixels. Each element is
     screenshotted on its own and the rows containing any non-background pixel are the ink. */
  const inkCentre = async (sel)=>{
    const el = page.locator(sel).first();
    const box = await el.boundingBox(); if(!box) return null;
    const buf = await page.screenshot({ clip:{ x:Math.floor(box.x), y:Math.floor(box.y),
      width:Math.ceil(box.width), height:Math.ceil(box.height) } });
    /* decode just enough PNG: hand it back to the browser, which has a decoder */
    const b64 = buf.toString('base64');
    return page.evaluate(async ({b64, top})=>{
      const img = new Image();
      await new Promise(r=>{ img.onload=r; img.src='data:image/png;base64,'+b64; });
      const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const x=c.getContext('2d'); x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data;
      /* the background is whatever the corner pixel is; ink is anything far from it */
      const bg=[d[0],d[1],d[2]];
      let first=-1,last=-1;
      for(let row=0; row<c.height; row++){
        let hit=false;
        for(let col=0; col<c.width; col++){
          const i=(row*c.width+col)*4;
          if(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]) > 90){ hit=true; break; }
        }
        if(hit){ if(first<0) first=row; last=row; }
      }
      if(first<0) return null;
      /* the clip was taken at 2x, so halve back into CSS pixels and add the element's own offset */
      return +(top + (first+last)/2/2).toFixed(2);
    }, { b64, top: box.y });
  };

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 1 — one starting position for every page's title
  // ═══════════════════════════════════════════════════════════════════
  const titleX = ()=>page.evaluate(()=>{
    const tf=document.querySelector('.topfix'), t=tf&&tf.querySelector('.title');
    const bk=tf&&tf.querySelector('.backbtn');
    return { x:t?Math.round(t.getBoundingClientRect().left):null,
             back: bk ? { tag:bk.tagName, tappable: bk.tagName==='BUTTON', w:Math.round(bk.getBoundingClientRect().width) } : null,
             h:tf?Math.round(tf.getBoundingClientRect().height):null };
  });
  await mk();
  const shopT = await titleX();
  await settings();
  const setT = await titleX();
  await lists();
  const listT = await titleX();
  ok('Shop and Settings agree on where the title starts (the baseline for this)',
     shopT.x===setT.x && shopT.x>40, JSON.stringify({shop:shopT.x, settings:setT.x}));
  ok('Lists now starts in the same place', listT.x===shopT.x,
     JSON.stringify({lists:listT.x, others:shopT.x}));
  ok('…and the bar is still the same height on all three',
     shopT.h===setT.h && setT.h===listT.h, JSON.stringify({shop:shopT.h, set:setT.h, lists:listT.h}));
  ok('…without giving the root page something to go back to',
     listT.back && listT.back.tappable===false && listT.back.w>=40,
     JSON.stringify(listT.back));
  ok('NOT CHANGED: the other pages still have a real back button',
     shopT.back && shopT.back.tappable===true, JSON.stringify(shopT.back));

  /* the placeholder must not be reachable by keyboard either */
  ok('…and it is not focusable', await page.evaluate(()=>{
    const b=document.querySelector('.topfix .backbtn'); if(!b) return false;
    b.focus(); return document.activeElement!==b; }), '');

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 2 — the arrow's ink sits level with the title's ink
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  const boxes = await page.evaluate(()=>{
    const tf=document.querySelector('.topfix');
    const t=tf.querySelector('.title'), b=tf.querySelector('.backbtn');
    const c=e=>{ const r=e.getBoundingClientRect(); return +(r.top+r.height/2).toFixed(2); };
    return { title:c(t), back:c(b) };
  });
  const inkTitle = await inkCentre('.topfix .title');
  const inkBack  = await inkCentre('.topfix .backbtn');
  ok('the two boxes were already centred together (which is why this needed looking at)',
     Math.abs(boxes.title-boxes.back) <= 1.5, JSON.stringify(boxes));
  ok('and now the ARROW\'S INK is level with the title\'s ink',
     inkTitle!==null && inkBack!==null && Math.abs(inkTitle-inkBack) <= 1.0,
     JSON.stringify({title:inkTitle, back:inkBack, gap:+(inkBack-inkTitle).toFixed(2)}));
  ok('…and the hit area is still a full 44px', await page.evaluate(()=>{
    const b=document.querySelector('.topfix .backbtn');
    return Math.round(b.getBoundingClientRect().height)>=44; }), '');

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 3 — Page margins lives in Appearance
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await settings();
  const where = await page.evaluate(()=>{
    const sec = name => { const h=[...document.querySelectorAll('.optsect')].find(s=>s.dataset.sect===name);
      return h&&h.nextElementSibling; };
    const inside = (body, sel) => !!(body && body.querySelector(sel));
    return { marginsInAppearance: inside(sec('Appearance'), '[data-opt-num="padl"]'),
             marginsInTiles:      inside(sec('Tiles'), '[data-opt-num="padl"]'),
             roundnessInTiles:    inside(sec('Tiles'), '[data-opt-num="rad"]'),
             gapInTiles:          inside(sec('Tiles'), '[data-opt-num="gapx"]'),
             buttonsWithIt:       inside(sec('Appearance'), '#optNumSave') && inside(sec('Appearance'), '#optNumFactory'),
             padlCount:           document.querySelectorAll('[data-opt-num="padl"]').length };
  });
  ok('Page margins now sits in Appearance', where.marginsInAppearance && !where.marginsInTiles, JSON.stringify(where));
  ok('…and took its buttons with it rather than being copied', where.buttonsWithIt && where.padlCount===2,
     JSON.stringify({buttons:where.buttonsWithIt, steppers:where.padlCount}));
  ok('NOT CHANGED: the tile measurements stayed in Tiles', where.roundnessInTiles && where.gapInTiles,
     JSON.stringify(where));

  /* it has to still work where it landed */
  const padBefore = await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--padl').trim());
  await page.locator('[data-opt-num="padl"][data-opt-delta="1"]').first().click();
  await page.waitForTimeout(400);
  const padAfter = await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--padl').trim());
  ok('…and the stepper still drives the page margin from its new home',
     parseFloat(padAfter) === parseFloat(padBefore||'14') + 2, JSON.stringify({was:padBefore, now:padAfter}));

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 4 — one separator rule for every section
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  await settings();
  const rules = await page.evaluate(()=>[...document.querySelectorAll('.optsect')]
    .map(s=>({ name:s.dataset.sect, top:getComputedStyle(s).borderTopWidth,
               first:s===document.querySelector('.optpage > .optsect') })));
  ok('every section after the first is separated the same way',
     rules.filter(r=>!r.first).every(r=>parseFloat(r.top)>0),
     JSON.stringify(rules.filter(r=>parseFloat(r.top)===0).map(r=>r.name)));
  ok('…and the first has nothing above it to separate from',
     rules.length>0 && parseFloat(rules[0].top)===0, JSON.stringify(rules[0]));
  ok('…which holds with every section folded, where it actually shows',
     await (async()=>{
       for(const n of ['Appearance','Colour','Tiles','Sort','Sound']){
         const h=page.locator(`.optsect[data-sect="${n}"]`);
         await h.scrollIntoViewIfNeeded(); await h.click(); await page.waitForTimeout(250);
       }
       return page.evaluate(()=>[...document.querySelectorAll('.optsect')]
         .filter(s=>s!==document.querySelector('.optpage > .optsect'))
         .every(s=>parseFloat(getComputedStyle(s).borderTopWidth)>0));
     })(), '');

  // ═══════════════════════════════════════════════════════════════════
  // NOT CHANGED
  // ═══════════════════════════════════════════════════════════════════
  await mk();
  ok('the shop list still renders', (await page.locator('.pill').count())>0, '');
  await page.locator('#shopAddFab').click(); await page.waitForTimeout(2200);
  ok('the add sheet still opens', (await page.locator('#addSheet').count())>0, '');
  await page.locator('#addDone').click(); await page.waitForTimeout(1500);
  ok('…and closes', (await page.locator('#addSheet').count())===0, '');
  await lists();
  await settings();

  ok('no console errors anywhere in the run', errors.length===0, errors.slice(0,4).join(' | '));
  if(out) await page.screenshot({ path: out });
  await browser.close();
  let pass=0, fail=0;
  results.forEach(([n,c,x])=>{ if(c){pass++; console.log('PASS  '+n+(x?'   ['+x+']':''));} else {fail++; console.log('FAIL  '+n+(x?'   ['+x+']':''));} });
  console.log(`\n${pass}/${pass+fail} passed`);
})().catch(e=>{ console.log('HARNESS CRASH', e.message); process.exit(1); });
