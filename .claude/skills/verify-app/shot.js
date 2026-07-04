// Run from a directory where `npm i playwright` has been done (e.g. the session scratchpad);
// the browser itself is pre-installed at /opt/pw-browsers/chromium.
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }));
const STUB = `export const initializeApp=()=>({});export const getFirestore=()=>({});
export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});export const doc=()=>({});
export const onSnapshot=()=>()=>{};export const setDoc=async()=>{};export default {};`;
(async () => {
  const [port, out] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('**www.gstatic.com/firebasejs/**', r =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
  // safety net: fonts are self-hosted, but stub Google Fonts in case an old revision is tested
  await page.route('**fonts.googleapis.com/**', r =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => r.abort()));
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 150)); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // onboarding: name field
  for (const btn of ['Join', 'Start', 'Continue']) {
    const inp = page.locator('input:visible').first();
    if (await inp.count()) { await inp.fill('Olive').catch(()=>{}); }
    const b = page.locator(`button:visible:has-text("${btn}")`).first();
    if (await b.count()) { await b.click().catch(()=>{}); await page.waitForTimeout(600); break; }
  }
  // add items through the add bar
  const ta = page.locator('textarea:visible').first();
  if (await ta.count()) {
    await ta.fill('2 milk, bananas, chicken, shampoo, rice, 500g cheese');
    const add = page.locator('.addbtn, #catAddBtn').first();
    if (await add.count()) await add.click().catch(()=>{}); else await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: out });
  const txt = await page.locator('#app').innerText().catch(() => '(none)');
  console.log('saved', out, '| APP:', txt.replace(/\s+/g, ' ').slice(0, 220));
  await browser.close();
})();
