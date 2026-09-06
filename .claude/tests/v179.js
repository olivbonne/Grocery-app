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
  /* v1.87: each page's nav carries its own ids (the v1.77 note above) — with the Lists page gone the
     set is Shop / Plan / Settings, so the helpers name all three variants rather than the old L pair. */
  const settings = ()=>tap('#setNav, #setNavP, #setNavS');
  const shop = ()=>tap('#cartNav, #cartNavP, #cartNavS');
  /* SUPERSEDED by v1.87: the Lists page is gone. Its role here was "the page with no back button to
     go back to", which the Plan page now fills — so the alignment this version bought is still
     measured across three pages, one of which has no real back button. */
  const lists = ()=>tap('#planNav, #planNavP, #planNavS');

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
  ok('Plan starts in the same place (v1.87: was Lists)', listT.x===shopT.x,
     JSON.stringify({plan:listT.x, others:shopT.x}));
  ok('…and the bar is still the same height on all three',
     shopT.h===setT.h && setT.h===listT.h, JSON.stringify({shop:shopT.h, set:setT.h, plan:listT.h}));
  ok('…without giving the root page something to go back to',
     listT.back && listT.back.tappable===false && listT.back.w>=40,
     JSON.stringify(listT.back));
  /* SUPERSEDED by v1.87: "the other pages" was Shop and Settings. The Lists page is gone and the shop's
     back arrow went with it — there was nowhere left to go back to — so its slot is the same inert
     placeholder, and Settings is the one page that still has a real arrow to align. That it still does
     is the half of this check that still means something. */
  ok('Settings still has a real back button (v1.87: the shop\'s became a placeholder)',
     setT.back && setT.back.tappable===true, JSON.stringify({settings:setT.back, shop:shopT.back}));
  ok('…and the shop now carries the same inert placeholder the other pages do',
     shopT.back && shopT.back.tappable===false && shopT.back.w>=40, JSON.stringify(shopT.back));

  /* the placeholder must not be reachable by keyboard either */
  ok('…and it is not focusable', await page.evaluate(()=>{
    const b=document.querySelector('.topfix .backbtn'); if(!b) return false;
    b.focus(); return document.activeElement!==b; }), '');

  // ═══════════════════════════════════════════════════════════════════
  // ITEM 2 — the arrow's ink sits level with the title's ink
  // ═══════════════════════════════════════════════════════════════════
  /* SUPERSEDED by v1.87: this was measured on the shop page, whose arrow is now a placeholder with no
     ink to measure. Settings is where the real arrow lives, so that is where the optical centring this
     version bought is checked — the guarantee is unchanged, only the page carrying it is. */
  await mk();
  await settings();
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
  /* SUPERSEDED by v1.87: comparing the arrow's ink to the TITLE's ink only works on a title with no
     descender. v1.79 measured it beside "Groceries."; the page that still has a real arrow is Settings,
     and "Settings." has a g, which drags the word's ink band ~1.75px lower for reasons that have
     nothing to do with the arrow. So the check now asserts the property v1.79 actually engineered and
     which no neighbouring word can move: 5px of bottom padding lifts the centred chevron about 2.5px
     above its own box centre, which is what made it look level in the first place. The boxes being
     centred together is still checked above. */
  const inkBox = await page.evaluate(()=>{
    const b=document.querySelector('.topfix .backbtn'); const r=b.getBoundingClientRect();
    return +(r.top+r.height/2).toFixed(2); });
  /* The chevron's ink sits BELOW its box centre — measured at −3.5px before this version, which is the
     1.5px it visibly hung low by. The 5px of bottom padding lifts the centred content by half that, so
     what should remain is a little over one pixel low. Strip the padding and this returns to −3.5;
     over-correct it and it goes positive. Either would fail. */
  const belowBy = +(inkBack - inkBox).toFixed(2);   // y grows downward, so positive means the ink sits low
  ok('and the ARROW\'S INK is still lifted most of the way off its box centre by the padding',
     inkBack!==null && belowBy >= 0.5 && belowBy <= 2.0,
     JSON.stringify({ inkCentre:inkBack, boxCentre:inkBox, belowCentreBy:belowBy, titleInk:inkTitle }));
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
