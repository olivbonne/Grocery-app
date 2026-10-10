/* v2.13 — the household's batch of 2026-10-11 (screenshots of the bottom bar, Groceries and Settings):
   1. "The settings wheel or gear is too big and the line is cut";
   2. "when saving to regular it show the message [object pointer event] undo" — and show messages near the
      top, below the top banner;
   3. "remove the green test tube before sandbox name";
   4. "the small tile now cut the name … true for all small tiles settings" (icon size L/XL, icons off);
   5. replace the top-right export button with a way to report an issue or a complaint;
   6. Settings: no back arrow, no orange dot;
   7. a colour for the bottom bar's selected tab, and for the tiles behind the list name, "N to buy" and
      the store on the top banner.

   WHAT THESE CHECKS HAVE TO PROVE: each of the above in the page; for 5, that the wait is visible and ends
   both ways (spinner → thanks; failure → message, share instead, words kept) and the request carries no list.

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
  let ctx, page, posted=[];
  const mk = async(items, extra, fb, name)=>{ if(ctx) await ctx.close();
    ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'text/javascript', body: STUB }));
    if(fb) await ctx.route('**/api/feedback', fb);
    page = await ctx.newPage(); page.setDefaultTimeout(9000);
    page.on('console',m=>{ if(m.type()!=='error') return; const t=m.text(); if(/Failed to load resource/i.test(t)) return; errors.push(t.slice(0,160)); });
    page.on('pageerror',e=>errors.push('PAGEERR '+e.message));
    await page.addInitScript(seed(items, extra).replace(/name:"Sandbox"/, 'name:'+JSON.stringify(name||"Groceries")));
    await page.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1500); };
  const tap = async(sel)=>{ await page.locator(sel).first().click(); await page.waitForTimeout(500); };
  const shot = async(tag)=>{ if(out) await page.screenshot({ path: out.replace(/\.png$/,'-'+tag+'.png') }); };
  const LIST=[["Frozen raspberries","frozen",2],["Ginger beer no sugar","drinks"],["Beef cubes","meat",1,"800g"],["Beef mince lean","meat",3,"700g"],["Beef steak","meat",6],
    ["Lamb rump or flank","meat"],["Chicken breast","meat",3,"200g"],["Chicken whole","meat"],["Avocados","vegetable"]].map((x,i)=>Object.assign(it(String(i),x[0],x[1],x[2],x[3]),{starred:i<2}));

  try{
    /* ── 1. the gear: whole, and no bigger than its neighbours ─────────── */
    await mk(LIST, SMALL(3));
    const g = await page.evaluate(()=>{ const sv=document.querySelectorAll('#bottomnav .navbtn')[2].querySelector('svg'), vb=sv.viewBox.baseVal, p=sv.querySelector('path'), b=p.getBBox(), sw=parseFloat(sv.getAttribute('stroke-width'))/2;
      const cal=document.querySelectorAll('#bottomnav .navbtn')[0].querySelector('svg');
      const ext=s=>{ const r=s.getBoundingClientRect(), v=s.viewBox.baseVal, bb=s.getBBox(); return (bb.height)*(r.height/v.height); };
      return { inside: b.x-sw>=vb.x && b.y-sw>=vb.y && b.x+b.width+sw<=vb.x+vb.width && b.y+b.height+sw<=vb.y+vb.height, gearH:ext(sv), calH:ext(cal) }; });
    ok('the gear is drawn whole — every stroke inside its box (v2.12 cut the teeth off)', g.inside, JSON.stringify(g));
    ok('…and it is no taller than the calendar beside it', g.gearH <= g.calH + 0.5, JSON.stringify(g));

    /* ── 2. Save to Regulars: the real message, under the top banner ───── */
    await mk(LIST.map((x,i)=>Object.assign({},x,{checked:i<3})), SMALL(3));
    await tap('#sweepBtn');
    const t = await page.evaluate(()=>{ const t=document.querySelector('#toast'), tf=document.querySelector('#topfix'); return t ? { txt:t.textContent.trim(), h:Math.round(t.getBoundingClientRect().height), top:Math.round(t.getBoundingClientRect().top), under:Math.round(tf.getBoundingClientRect().bottom) } : null; });
    ok('saving the cart to Regulars says what happened, not "[object PointerEvent]"', t && !/object|Event/.test(t.txt) && t.txt.length>4, JSON.stringify(t));
    ok('…and the message shows near the top, just under the top banner, one line tall', t && t.top >= t.under && t.top <= t.under + 24 && t.h < 60, JSON.stringify(t));
    await shot('toast');

    /* ── 3. no test tube on the Sandbox ────────────────────────────────── */
    await mk(LIST, SMALL(3), null, "🧪 Sandbox");
    const sb = await page.evaluate(()=>document.querySelector('#listSwitch').textContent.trim());
    ok('a list named "🧪 Sandbox" is shown as "Sandbox"', sb==='Sandbox', sb);

    /* ── 4. small tiles at L and XL never cut the name ─────────────────── */
    const cut=[];
    for(const sz of ['l','xl']) for(const ic of ['0','1']) for(const n of [0,1,2,3,4]){
      await mk(LIST, SMALL(n)+`localStorage.setItem("ml_icosize","${sz}"); localStorage.setItem("ml_emoji_item","${ic}");`);
      const bad = await page.evaluate(()=>[...document.querySelectorAll('#zoomer .pill[data-pill]')].map(p=>{ const e=p.querySelector('.pname'), lh=parseFloat(getComputedStyle(e).lineHeight)||18;
        return { n:e.textContent.trim(), h:e.getBoundingClientRect().height, want:Math.min(e.scrollHeight, 2*lh) }; }).filter(x=>x.h < x.want - 1.5));
      if(bad.length) cut.push({sz,ic,n,bad:bad.slice(0,2)});
      if(sz==='l' && ic==='0' && n===3) await shot('small-l');
    }
    ok('small tiles at icon size L and XL, icons on or off, 0–4 columns: no name is cut (two lines shown in full)', cut.length===0, JSON.stringify(cut.slice(0,3)));

    /* ── 5. Report a problem ───────────────────────────────────────────── */
    posted=[]; let fail=false;
    await mk(LIST, SMALL(3), async r=>{ posted.push(JSON.parse(r.request().postData()||'{}')); await new Promise(z=>setTimeout(z,400));
      fail ? r.fulfill({status:500, contentType:'application/json', body:'{"error":"x","code":"unexpected"}'}) : r.fulfill({status:200, contentType:'application/json', body:'{"ok":true,"via":"log"}'}); });
    const hb = await page.evaluate(()=>({ report:!!document.querySelector('#shopReport'), share:!!document.querySelector('#shopShare') }));
    ok('the top-right button reports a problem; the share button has gone from the banner', hb.report && !hb.share, JSON.stringify(hb));
    await tap('#shopReport');
    ok('…it opens "Report a problem" with four kinds to pick from', await page.evaluate(()=>!!document.querySelector('#rptSheet') && document.querySelectorAll('[data-rptkind]').length===4), '');
    await shot('report');
    await tap('#rptSend');
    ok('…sending nothing asks for a few words', /few words/.test(await page.evaluate(()=>document.querySelector('#rptSheet').textContent)), '');
    await tap('[data-rptkind="looks"]');
    await page.fill('#rptText', 'The gear is cut off');
    await page.locator('#rptSend').click(); await page.waitForTimeout(120);
    const busy = await page.evaluate(()=>{ const s=document.querySelector('#rptSheet'); return s && !!s.querySelector('.spin') && !!s.querySelector('[role=status]'); });
    ok('…while it sends, a spinner says so', busy, '');
    await page.waitForTimeout(800);
    const sent = await page.evaluate(()=>document.querySelector('#rptSheet') && document.querySelector('#rptSheet').textContent);
    ok('…then "Thanks — it\'s been sent"', /sent/.test(sent||''), sent);
    const pb = posted[0]||{};
    ok('…and the request carries the kind, the words and the app details (no list)', pb.kind==='looks' && pb.text==='The gear is cut off' && pb.diag && pb.diag.version && !JSON.stringify(pb).includes('Beef'), JSON.stringify(pb));
    await tap('#rptOk');
    fail=true; await tap('#shopReport'); await page.fill('#rptText', 'Again'); await page.locator('#rptSend').click(); await page.waitForTimeout(900);
    const fl = await page.evaluate(()=>({ txt:(document.querySelector('.rpterr')||{}).textContent||'', share:!!document.querySelector('#rptShare'), text:(document.querySelector('#rptText')||{}).value }));
    ok('a send that fails ends in a message, a way to share it instead, and the words kept', /Couldn't send/.test(fl.txt) && fl.share && fl.text==='Again', JSON.stringify(fl));
    await tap('#rptCancel');

    /* ── 6 + 7. Settings ───────────────────────────────────────────────── */
    await tap('#setNav, #setNavP, #setNavS');
    const sh = await page.evaluate(()=>({ back:!!document.querySelector('#setBack'), dot:!!document.querySelector('.topfix .dot'), title:document.querySelector('.topfix .title').textContent.trim(),
      other:!!document.querySelector('#optSendList') && !!document.querySelector('#optReport') && !!document.querySelector('#optExport') }));
    ok('Settings has no back arrow and no orange full stop', !sh.back && !sh.dot && sh.title==='Settings', JSON.stringify(sh));
    ok('Settings › Other keeps "send what\'s to buy to another app", the export, and a report button', sh.other, JSON.stringify(sh));
    const pick = async(attr)=>page.evaluate(a=>{ const b=[...document.querySelectorAll(`button[data-opt-${a}]`)].find(x=>!['auto','page'].includes(x.getAttribute('data-opt-'+a))); if(!b) return null; b.click(); return b.getAttribute('data-opt-'+a); }, attr);
    const k1 = await page.evaluate(()=>!!document.querySelector('button[data-opt-toptile]') && !!document.querySelector('button[data-opt-navsel]'));
    ok('Bars and overlays has "Name, count and store" (top) and "Selected tab" (bottom) colour rows', k1, '');
    await page.evaluate(()=>{ document.querySelector('button[data-opt-toptile]').scrollIntoView(); }); await page.waitForTimeout(200);
    const c1 = await pick('toptile'); await page.waitForTimeout(400);
    const c2 = await pick('navsel'); await page.waitForTimeout(400);
    const navBg = await page.evaluate(()=>({ v:getComputedStyle(document.documentElement).getPropertyValue('--navsel-bg').trim(), bg:getComputedStyle(document.querySelector('#bottomnav .navbtn.active')).backgroundColor }));
    await tap('#cartNav');
    const topBg = await page.evaluate(()=>({ v:getComputedStyle(document.documentElement).getPropertyValue('--toptile-bg').trim(), ls:getComputedStyle(document.querySelector('#listSwitch')).backgroundColor, hc:getComputedStyle(document.querySelector('.topfix .hcount')).backgroundColor,
      lc:(document.querySelector('.topfix .locchip')?getComputedStyle(document.querySelector('.topfix .locchip')).backgroundColor:null), chip:getComputedStyle(document.body).getPropertyValue('--chip').trim() }));
    const rgb = h=>{ const x=h.replace('#',''); return `rgb(${parseInt(x.slice(0,2),16)}, ${parseInt(x.slice(2,4),16)}, ${parseInt(x.slice(4,6),16)})`; };
    ok('picking a colour paints the selected tab with it', c2 && navBg.v && navBg.bg===rgb(navBg.v), JSON.stringify({c2,navBg}));
    ok('…and the name, the count and the store on the top banner', c1 && topBg.v && [topBg.ls,topBg.hc,topBg.lc].every(x=>x===rgb(topBg.v)), JSON.stringify({c1,topBg}));
    await shot('colours');
  } catch(e){ ok('suite ran to the end', false, e.message.slice(0,300)); }
  ok('no console errors anywhere in the run', errors.length===0, JSON.stringify(errors.slice(0,5)));
  await browser.close();
  results.forEach(([n,p,x])=>console.log(`${p?'PASS':'FAIL'}  ${n}${x?'   '+x:''}`));
  console.log(`\n${results.filter(r=>r[1]).length}/${results.length} passed`);
  process.exit(results.every(r=>r[1])?0:1);
})();
