/* v3.22 — the Shop ⋯ menu starts with what is used in the shop; tile heights 7 and 8 are gone.

   WHAT THESE CHECKS HAVE TO PROVE (the order itself and the folds are checked in v308.js, superseded for v3.22):
   - "At the shop" is the first thing in the menu and is not shown in capitals; "At home" is closed when the menu opens;
   - an Undo row sits in "At the shop" (before At home), and still undoes;
   - Tile height offers 1–6, variable and square in Settings; a phone that had 7 or 8 stored shows 6 (data-tilelines="6",
     the 6 button marked), and the stored value is left alone until the person picks another. */
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
const it = (id, n, c, x) => Object.assign({ id, name: n, cat: c, qty: 1, weight: "", checked: false, tags: [] }, x || {});
(async () => {
  const [port, out] = process.argv.slice(2); const errors = []; let browser;
  try {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const mk = async (extra) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
      const pg = await ctx.newPage(); pg.setDefaultTimeout(9000);
      pg.on('console', m => { if (m.type() !== 'error') return; const t = m.text(); if (/Failed to load resource/i.test(t)) return; errors.push(t.slice(0, 160)); });
      pg.on('pageerror', e => errors.push('PAGEERR ' + e.message));
      await pg.addInitScript(`(() => { if(localStorage.getItem("ml_me")) return;
        localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify([it("1", "Milk", "dairy"), it("2", "Bread", "bakery", { checked: true })])}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
        localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}])); localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
        localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_onb", JSON.stringify({done:1})); localStorage.setItem("ml_nosmall","1"); ${extra || ''} })()`);
      await pg.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500); return pg; };
    let pg = await mk();
    await pg.click('#shopMenu'); await pg.waitForTimeout(500);
    const m0 = await pg.evaluate(() => { const m = document.querySelector('#shopMenuEl'), g = m.firstElementChild, h = m.querySelector('#smHome');
      return { first: g.className, text: g.textContent.trim(), tt: getComputedStyle(g).textTransform, home: h && h.getAttribute('aria-expanded'), box: !!m.querySelector('#smHomeBox'), homeText: h && h.textContent.trim() }; });
    if (out) await pg.screenshot({ path: out.replace(/\.png$/, '-menu.png') });
    ok('"At the shop" is the first thing in the ⋯ menu, not in capitals', m0.first === 'smgroup' && m0.text === 'At the shop' && m0.tt === 'none', JSON.stringify(m0));
    ok('"At home" is there, closed', m0.homeText === 'At home' && m0.home === 'false' && !m0.box, JSON.stringify(m0));
    /* finish the shop (Bread is ticked) → an Undo row */
    await pg.keyboard.press('Escape'); await pg.evaluate(() => { const b = document.querySelector('#smBg'); if (b) b.click(); }); await pg.waitForTimeout(300);
    const sw = pg.locator('#sweepBtn, .sweepbtn').first(); await sw.click(); await pg.waitForTimeout(800);
    await pg.click('#shopMenu'); await pg.waitForTimeout(500);
    const u = await pg.evaluate(() => { const m = document.querySelector('#shopMenuEl'), r = m.querySelector('[data-undo]'), h = m.querySelector('#smHome');
      return { has: !!r, before: !!(r && h && (r.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)), afterRc: !!(r && (m.querySelector('#smRcpt').compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)) }; });
    ok('after finishing a shop, Undo sits in "At the shop": after Read a receipt, before At home', u.has && u.before && u.afterRc, JSON.stringify(u));
    await pg.click('[data-undo]'); await pg.waitForTimeout(700);
    const back = await pg.evaluate(() => (JSON.parse(localStorage.getItem('ml_cache_v101')).items || []).map(i => i.name).sort().join(','));
    ok('…and it still undoes (Bread is back on the list)', back === 'Bread,Milk', back);
    await pg.context().close();

    pg = await mk('localStorage.setItem("ml_tilelines","8");');
    const h8 = await pg.evaluate(() => ({ attr: document.documentElement.getAttribute('data-tilelines'), stored: localStorage.getItem('ml_tilelines') }));
    ok('a phone that had height 8 shows 6 (the stored value untouched)', h8.attr === '6' && h8.stored === '8', JSON.stringify(h8));
    await pg.click('#setNav'); await pg.waitForTimeout(500);
    const hs = await pg.evaluate(() => [...document.querySelectorAll('[data-opt-lines]')].map(b => (b.dataset.optLines || 'v') + (b.classList.contains('on') ? '*' : '')).join(','));
    ok('Settings › Tile height offers 1–6, variable and square — no 7 or 8 — with 6 marked', hs === '1,2,3,4,5,6*,v,sq', hs);
    await pg.context().close();
  } catch (e) { ok('suite ran to the end', false, e.message.slice(0, 300)); }
  ok('no console errors anywhere in the run', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
  if (browser) await browser.close();
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
