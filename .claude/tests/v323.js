/* v3.23 — Settings in six sections; actions leave Settings for the ⋯ menu.

   WHAT THESE CHECKS HAVE TO PROVE (older suites, superseded for v3.23, cover each moved row's own behaviour):
   - everyday Settings has exactly six sections, in order: Look, Shopping, Smart features, Lists & people, Your data, Help;
   - the actions are no longer buttons in Settings (Read a receipt, Which store is cheaper, What we spend, Send what's to
     buy, the occasions, the cards, the aisle map) — and each is still in the Shop ⋯ menu;
   - the search still finds an action: typing "receipt" shows a "→ Read a receipt" button, without the field losing focus,
     and "spend" opens What we spend from there;
   - Help has one Diagnostics fold, closed: its rows are hidden, a tap shows them, and the search finds one ("connection")
     while it is folded;
   - Look ends with the Advanced look button; Line weight is not on the everyday page;
   - the new words have their French. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.route('**/firebasejs/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
    const pg = await ctx.newPage(); pg.setDefaultTimeout(9000);
    pg.on('console', m => { if (m.type() !== 'error') return; const t = m.text(); if (/Failed to load resource/i.test(t)) return; errors.push(t.slice(0, 160)); });
    pg.on('pageerror', e => errors.push('PAGEERR ' + e.message));
    await pg.addInitScript(`(() => { if(localStorage.getItem("ml_me")) return;
      localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify([it("1", "Milk", "dairy"), it("2", "Bread", "bakery")])}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O","A"], name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
      localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}])); localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
      localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_onb", JSON.stringify({done:1})); })()`);
    await pg.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500);
    await pg.click('#setNav'); await pg.waitForTimeout(600);
    const vis = sel => pg.evaluate(sel => { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null && e.getBoundingClientRect().height > 0); }, sel);
    const s0 = await pg.evaluate(() => { const shown = e => e.offsetParent !== null;
      const secs = [...document.querySelectorAll('.optpage .optsect')].filter(shown).map(h => h.dataset.sect);
      const txt = [...document.querySelectorAll('.optpage button')].filter(shown).map(b => b.textContent.trim());
      const look = document.querySelector('.optsect[data-sect="Look"]').nextElementSibling, kids = [...look.children].filter(shown);
      return { secs, acts: txt.filter(x => /^(Read a receipt|Which store is cheaper|What we spend|Send what's to buy|Save what's to buy as an occasion|Add an occasion|Show all cards|Add a membership card|Aisle map)/.test(x)),
        lookLast: kids.length ? (kids[kids.length - 1].id || (kids[kids.length - 1].querySelector('#optLook') ? 'optLook' : kids[kids.length - 1].className)) : '', lineW: txt.some(x => x === 'Fine') }; });
    if (out) await pg.screenshot({ path: out.replace(/\.png$/, '-top.png') });
    ok('everyday Settings has six sections: Look, Shopping, Smart features, Lists & people, Your data, Help', s0.secs.join('|') === 'Look|Shopping|Smart features|Lists & people|Your data|Help', s0.secs.join('|'));
    ok('no action is a button in Settings any more', s0.acts.length === 0, JSON.stringify(s0.acts));
    ok('Look ends with the Advanced look button, and Line weight is not on the everyday page', s0.lookLast === 'optLook' && !s0.lineW, JSON.stringify([s0.lookLast, s0.lineW]));
    /* Diagnostics */
    await pg.evaluate(() => document.querySelector('#optDiagFold').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(200);
    const d0 = { fold: await pg.getAttribute('#optDiagFold', 'aria-expanded'), ai: await vis('#optDiag'), conn: await vis('#optConnDiag') };
    ok('Help has one Diagnostics fold, closed: its rows are hidden', d0.fold === 'false' && !d0.ai && !d0.conn, JSON.stringify(d0));
    await pg.click('#optDiagFold'); await pg.waitForTimeout(400);
    await pg.evaluate(() => document.querySelector('#optDiagFold').scrollIntoView({ block: 'start' })); await pg.waitForTimeout(200);
    if (out) await pg.screenshot({ path: out.replace(/\.png$/, '-diag.png') });
    const d1 = { fold: await pg.getAttribute('#optDiagFold', 'aria-expanded'), ai: await vis('#optDiag'), price: await vis('#optPriceDiag'), loc: await vis('#optLocDiag'), conn: await vis('#optConnDiag'), onb: await vis('#optOnbReset') };
    ok('…a tap shows AI, price and location diagnostics, the connection check and First-time questions', d1.fold === 'true' && d1.ai && d1.price && d1.loc && d1.conn && d1.onb, JSON.stringify(d1));
    await pg.click('#optDiagFold'); await pg.waitForTimeout(300);
    /* the search */
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.click('#optSearch'); await pg.keyboard.type('connection', { delay: 20 }); await pg.waitForTimeout(400);
    ok('the search finds a diagnostics row while the fold is closed ("connection")', await vis('#optConnDiag'), '');
    await pg.fill('#optSearch', ''); await pg.click('#optSearch'); await pg.keyboard.type('receipt', { delay: 20 }); await pg.waitForTimeout(400);
    const a1 = await pg.evaluate(() => ({ shown: [...document.querySelectorAll('[data-optact]')].filter(b => !b.hidden).map(b => b.textContent.trim()), focus: document.activeElement && document.activeElement.id }));
    if (out) await pg.screenshot({ path: out.replace(/\.png$/, '-search.png') });
    ok('typing "receipt" shows "→ Read a receipt", the field still focused (no redraw)', a1.shown.length === 1 && /Read a receipt/.test(a1.shown[0]) && a1.focus === 'optSearch', JSON.stringify(a1));
    await pg.fill('#optSearch', ''); await pg.click('#optSearch'); await pg.keyboard.type('spend', { delay: 20 }); await pg.waitForTimeout(400);
    await pg.locator('[data-optact]:not([hidden])').first().click(); await pg.waitForTimeout(600);
    ok('…and "spend" → What we spend opens its sheet from there', !!(await pg.$('#spendSheet')), '');
    await pg.keyboard.press('Escape'); await pg.evaluate(() => { const c = document.querySelector('#spendClose'); if (c) c.click(); }); await pg.waitForTimeout(400);
    /* the ⋯ menu still has them */
    await pg.evaluate(() => { const b = document.querySelector('.bottomnav [data-nav="shop"], #shopNav'); if (b) b.click(); }); await pg.waitForTimeout(500);
    if (!(await pg.$('#shopMenu'))) { await pg.goto(`http://127.0.0.1:${port}/index.html?list=v101`); await pg.waitForTimeout(1200); if (!(await pg.$('#shopMenu'))) { await pg.locator('.navbtn').nth(1).click(); await pg.waitForTimeout(500); } }
    await pg.click('#shopMenu'); await pg.waitForTimeout(400); await pg.click('#smHome'); await pg.waitForTimeout(400);
    const m = await pg.evaluate(() => ['smCard', 'smRcpt', 'smCompare', 'smSend', 'smOcc', 'smSpend'].filter(id => !document.getElementById(id)));
    ok('every action is still in the Shop ⋯ menu (card, receipt, cheaper store, send, occasions, spending)', m.length === 0, JSON.stringify(m));
    const fr = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
    ok('the new words have their French', /"Lists & people":/.test(fr) && /"Diagnostics":/.test(fr) && /"Look":/.test(fr), '');
  } catch (e) { ok('suite ran to the end', false, e.message.slice(0, 300)); }
  ok('no console errors anywhere in the run', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
  if (browser) await browser.close();
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
