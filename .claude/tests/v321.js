/* v3.21 — the one-line tile rules (1 per row, variable) move from @layer app to the start of @layer tiles.

   WHY: they won by weight ("html body", ".zoomer.zoomer.zoomer", ".pill.pill"), which every later rule then had to out-weigh.
   In tiles they are :where() (weight zero) and FIRST in the layer: they beat every app rule (a later layer wins) and still lose
   to every tiles rule after them, exactly as before. Proved with .claude/tools/cssdiff.js: 89 screens, 29,231 elements,
   0 differences; a 1px canary in a moved rule gave 219.
   The rest could not move: the closure of what beats the v2.66 grid rules (.pill.pill:has(> .pemoji)) is 764 rules, 15 of
   them !important theme rules that a later layer cannot beat. They stay in app, counted here so the number only goes down.

   WHAT THESE CHECKS HAVE TO PROVE:
   - no one-line rule with weighting is left in the app layer, and the tiles layer starts with them, as :where();
   - the app layer holds at most 15 rules that weigh by repetition ("html body", "body .", a repeated class) — a new one fails;
   - the tool that did it is in the repo;
   - in the browser: one item per row keeps its row (flex row, 44px floor, the amount line at the right with the
     v2.91 8px gap), and variable tiles keep their own padding and the name's ellipsis. */
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'] }));
const ROOT = path.resolve(__dirname, '..', '..');
const results = []; const ok = (n, c, x) => results.push([n, !!c, x === undefined ? '' : String(x)]);
const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const appL = css.slice(css.indexOf('@layer app {'), css.indexOf('}   /* end @layer app */'));
const til = css.slice(css.indexOf('@layer tiles {'), css.indexOf('}   /* end @layer tiles */'));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
const it = (id, n, c, x) => Object.assign({ id, name: n, cat: c, qty: 1, weight: "", checked: false, tags: [] }, x || {});
const ITEMS = [it("1", "Free range eggs from the farm down the road", "dairy", { note: "large, the dozen box", qty: 2 }), it("2", "Milk", "dairy"), it("3", "Bread", "bakery")];

(async () => {
  ok('no one-line rule with weighting is left in the app layer', !/\.zoomer\.zoomer\.zoomer\.linelist|\.zoomer\.zoomer\.largevar/.test(appL), '');
  const first = til.split('\n').filter(l => /^:where\(/.test(l)).slice(0, 3);
  ok('…the tiles layer starts with them, as :where()', /^:where\(\.zoomer\.linelist \.pill, \.shop \.zoomer\.largevar \.pill\)/.test(first[0] || ''), first[0]);
  const sels = [...appL.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[;}])\s*([^{};@][^{};]*)\{/g)].map(m => m[1].trim());
  const hacks = sels.filter(s => /\.([a-z-]+)\.\1(?![\w-])|html body|\bbody \./.test(s));
  ok('the app layer holds at most 15 rules that weigh by repetition (the number only goes down)', hacks.length <= 15, hacks.length);
  ok('the tool that moves rules to the start of tiles is in the repo', fs.existsSync(path.join(ROOT, '.claude', 'tools', 'tilesprepend.py')));

  const [port, out] = process.argv.slice(2); const errors = []; let browser;
  try {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const look = async (cols) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await ctx.route('**/firebasejs/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
      const pg = await ctx.newPage(); pg.on('pageerror', e => errors.push('PAGEERR ' + e.message));
      await pg.addInitScript(`(() => { if(localStorage.getItem("ml_me")) return;
        localStorage.setItem("ml_cache_v101", JSON.stringify({ items:${JSON.stringify(ITEMS)}, buyAgain:[], baTomb:{}, stores:[], storeMeta:{}, members:["O"], name:"Groceries", baMeta:{label:"Buy again",emoji:"b",img:"",pos:99}, predictReset:0, purch:{}, plan:{days:{},recipes:[],saved:[]} }));
        localStorage.setItem("ml_lists", JSON.stringify([{code:"v101",name:"Groceries"}])); localStorage.setItem("ml_lastlist","v101"); localStorage.setItem("ml_me","O");
        localStorage.setItem("ml_shop","1"); localStorage.setItem("ml_optcoll","[]"); localStorage.setItem("ml_appmig163","1"); localStorage.setItem("ml_nosmall","1"); localStorage.setItem("ml_caton","0");
        localStorage.setItem("ml_largecols","${cols}"); })()`);
      await pg.goto(`http://127.0.0.1:${port}/index.html?list=v101`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500);
      const r = await pg.evaluate(() => { const p = document.querySelector('#zoomer .pill[data-pill="1"]'); if (!p) return null; const cs = getComputedStyle(p), nm = getComputedStyle(p.querySelector('.pname')), me = p.querySelector('.pill-meta');
        return { z: document.querySelector('#zoomer').className, dir: cs.flexDirection, wrap: cs.flexWrap, minh: cs.minHeight, pad: cs.paddingLeft, flex: cs.flex,
          nameWs: nm.whiteSpace, nameTo: nm.textOverflow, metaMl: me ? getComputedStyle(me).marginLeft : null, metaRight: me ? Math.round(p.getBoundingClientRect().right - me.getBoundingClientRect().right) : null }; });
      if (out) await pg.screenshot({ path: out.replace(/\.png$/, '-' + cols + '.png') });
      await ctx.close(); return r; };
    const l = await look("1");
    ok('one item per row: a flex row with the 44px floor, the name cut with an ellipsis (wrapping is a later tiles rule\'s, as before)', l && /linelist/.test(l.z) && l.dir === 'row' && l.minh === '44px' && l.nameWs === 'nowrap' && l.nameTo === 'ellipsis', JSON.stringify(l));
    ok('…the amount line at the right with its 8px gap (v2.91, later in tiles, still wins)', l && l.metaMl === '8px' && l.metaRight < 40, JSON.stringify(l));
    const v = await look("v");
    ok('variable: as wide as its content (flex none), 12px side padding, one line', v && /largevar/.test(v.z) && /^0 0 auto|none/.test(v.flex) && v.pad === '12px' && v.dir === 'row' && v.nameWs === 'nowrap', JSON.stringify(v));
  } catch (e) { ok('suite ran to the end', false, e.message.slice(0, 300)); }
  ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  if (browser) await browser.close();
  results.forEach(([n, p, x]) => console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${x ? '   ' + x : ''}`));
  console.log(`\n${results.filter(r => r[1]).length}/${results.length} passed`);
  process.exit(results.every(r => r[1]) ? 0 : 1);
})();
