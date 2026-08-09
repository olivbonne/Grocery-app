/* Iron Circle (gym.html) v1.00 — the first behavioural suite for the gym tracker.

   This is a different app from Market List, so it gets its own suite file rather than a
   version row in the vNNN series. It needs no Firebase stub: gym.html makes no network
   requests at all.

   WHAT THESE CHECKS HAVE TO PROVE, beyond "a control exists":
   - the circle is actually closed: a wrong invite code does not get you in;
   - a workout logged through the real controls (sheet → weight → reps → check → Finish)
     lands in the feed with the numbers the browser computed, not the ones we typed;
   - PR detection is a recompute, not a high-water mark: deleting the session that HELD a
     PR must hand that PR back to the next-best set. This is the check that a naive
     "is it bigger than the best I've seen" implementation fails;
   - a lighter set after a heavier one is NOT a PR (the precondition is asserted, so a
     vacuous pass is impossible — v1.68 lesson);
   - the leaderboard's timeframe filter actually narrows the window;
   - likes and comments round-trip and survive a relaunch;
   - the unit switch is display-only: kg → lb → kg returns the identical string.

   TEST-BUG NOTES CARRIED FORWARD from the Market List suites:
   - v1.60: drive the real control, never seed localStorage in its place.
   - v1.68: assert the precondition, so a check cannot pass by never triggering.
   - v1.76: find a row by the control it carries, not by a label that may not be unique.
   - v1.77: Playwright scrolls a control into view before clicking it.                    */

const { chromium } = require(require.resolve('playwright', {
  paths: [__dirname, '/opt/node22/lib/node_modules', '/tmp'],
}));

const results = [];
const ok = (name, cond, extra) => results.push([name, !!cond, extra || '']);

const KG_PER_LB = 0.45359237;

(async () => {
  const [port, out] = process.argv.slice(2);
  const base = `http://127.0.0.1:${port}/gym.html`;
  const errors = [];

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const settle = (ms = 140) => page.waitForTimeout(ms);

  /* ── helpers that drive the real UI ─────────────────────────────────── */

  // Log a whole workout: name it, add one exercise, fill each set, tick it, finish.
  async function logWorkout(title, exercise, sets){
    await page.click('nav.tabs [data-tab="log"]');
    await settle();
    await page.click('[data-act="startworkout"]');
    await settle();
    await page.fill('[data-act="drafttitle"]', title);

    await page.click('[data-act="pickexercise"]');
    await settle();
    await page.fill('[data-act="exsearch"]', exercise);
    await settle();
    await page.click(`.opt[data-name="${exercise}"]`);
    await settle();

    for (let i = 0; i < sets.length; i++){
      if (i > 0){ await page.click('[data-act="addset"]'); await settle(); }
      const row = page.locator('.set-grid').nth(i);
      await row.locator('[data-f="weight"]').fill(String(sets[i][0]));
      await row.locator('[data-f="reps"]').fill(String(sets[i][1]));
      await row.locator('[data-act="toggleset"]').click();
      await settle();
    }

    await page.click('[data-act="finish"]');
    await settle(220);
  }

  // The feed card whose header carries this session name.
  const cardByTitle = (t) => page.locator('.feed-card', { hasText: t }).first();

  const readState = () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('ironcircle.v1')));

  /* ── 1. The circle is closed ────────────────────────────────────────── */

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await settle(260);

  ok('auth gate shown on first load',
     await page.locator('#authform').count() === 1,
     'no sign-in form rendered');

  await page.click('[data-act="authmode"][data-mode="signup"]');
  await settle();
  await page.fill('#authform [name="name"]', 'Robin');
  await page.fill('#authform [name="email"]', 'robin@circle.gym');
  await page.fill('#authform [name="password"]', 'lift1234');
  await page.fill('#authform [name="invite"]', 'WRONG-CODE');
  await page.click('#authform button[type="submit"]');
  await settle();

  ok('wrong invite code is refused',
     await page.locator('#authform').count() === 1 &&
     (await page.locator('.err').innerText()).toLowerCase().includes('invite'),
     'a bad code got through, or no error was shown');

  // Same form, correct code — proves the refusal above was the code, not the form.
  await page.fill('#authform [name="invite"]', 'IRON-2026');
  await page.click('#authform button[type="submit"]');
  await settle(260);

  ok('correct invite code signs up',
     await page.locator('nav.tabs').count() === 1 &&
     await page.locator('#authform').count() === 0,
     'still on the auth screen after a valid signup');

  const seeded = await readState();
  ok('circle seeded with history to look at',
     seeded.users.length >= 5 && seeded.workouts.length > 20,
     `users=${seeded.users?.length} workouts=${seeded.workouts?.length}`);

  ok('feed shows the circle, not an empty state',
     await page.locator('.feed-card').count() > 3,
     `${await page.locator('.feed-card').count()} cards`);

  /* ── 2. Logging through the real controls ───────────────────────────── */

  await logWorkout('Bench A', 'Bench Press', [[60, 5], [60, 5]]);

  const afterA = await readState();
  const mine = afterA.workouts.filter(w => w.userId === afterA.session);
  ok('finished workout is saved to my account',
     mine.length === 1 && mine[0].title === 'Bench A',
     JSON.stringify(mine.map(w => w.title)));

  ok('the app computed the volume, not the test',
     // 60×5 + 60×5 = 600 kg, computed by the browser from what was typed
     await page.locator('.feed-card', { hasText: 'Bench A' }).first()
       .locator('.badge.accent').innerText() === '600 kg',
     await page.locator('.feed-card', { hasText: 'Bench A' }).first()
       .locator('.badge.accent').innerText().catch(() => 'no badge'));

  ok('first-ever Bench Press is flagged a PR',
     (await cardByTitle('Bench A').innerText()).includes('🏅'),
     'no PR badge on the first log of an exercise');

  /* ── 3. PR detection is a recompute, not a high-water mark ──────────── */

  await logWorkout('Bench B', 'Bench Press', [[55, 5]]);
  await settle(200);

  // PRECONDITION (v1.68): B must genuinely be the lighter session, or the
  // "no PR" assertion below would pass for the wrong reason.
  const stB = await readState();
  const wA = stB.workouts.find(w => w.title === 'Bench A');
  const wB = stB.workouts.find(w => w.title === 'Bench B');
  ok('precondition: Bench B is lighter and lower-volume than Bench A',
     Math.max(...wB.exercises[0].sets.map(s => s.weight)) <
     Math.max(...wA.exercises[0].sets.map(s => s.weight)) &&
     Math.max(...wB.exercises[0].sets.map(s => s.weight * s.reps)) <
     Math.max(...wA.exercises[0].sets.map(s => s.weight * s.reps)),
     'B is not actually lighter — the next check would be vacuous');

  ok('a lighter set after a heavier one is not a PR',
     !wB.exercises[0].sets.some(s => s.pr) &&
     !(await cardByTitle('Bench B').innerText()).includes('🏅'),
     'the lighter session was flagged as a record');

  // Now delete the session that HOLDS the PR. A high-water-mark implementation
  // cannot give the record back; a full recompute must.
  await cardByTitle('Bench A').locator('[data-act="open"]').click();
  await settle(200);
  page.once('dialog', d => d.accept());
  await page.click('[data-act="delworkout"]');
  await settle(300);

  const stC = await readState();
  const wB2 = stC.workouts.find(w => w.title === 'Bench B');
  ok('deleting the PR session hands the record to the next-best set',
     !stC.workouts.some(w => w.title === 'Bench A') &&
     wB2.exercises[0].sets.some(s => s.pr),
     'Bench B did not regain the PR after Bench A was deleted');

  ok('the reverted PR is visible in the feed, not just in storage',
     (await cardByTitle('Bench B').innerText()).includes('🏅'),
     'storage says PR but the card does not show it');

  /* ── 4. Social round-trip ───────────────────────────────────────────── */

  const someoneElse = page.locator('.feed-card').filter({ hasNot: page.locator('[data-act="open"]') }).first();
  const likeBtn = someoneElse.locator('[data-act="like"]');
  const before = (await likeBtn.innerText()).trim();
  await likeBtn.click();
  await settle(180);
  const after = (await page.locator('.feed-card').filter({ hasNot: page.locator('[data-act="open"]') })
                    .first().locator('[data-act="like"]').innerText()).trim();

  ok('liking a card changes its count and pressed state',
     before !== after &&
     await page.locator('.feed-card').filter({ hasNot: page.locator('[data-act="open"]') })
       .first().locator('[data-act="like"][aria-pressed="true"]').count() === 1,
     `before="${before}" after="${after}"`);

  await cardByTitle('Bench B').locator('input[name="text"]').fill('felt easy');
  await cardByTitle('Bench B').locator('button[type="submit"]').click();
  await settle(200);

  ok('a comment posts and renders under the card',
     (await cardByTitle('Bench B').innerText()).includes('felt easy') &&
     (await cardByTitle('Bench B').innerText()).includes('Robin'),
     'comment did not appear with its author');

  /* ── 5. Survives a relaunch ─────────────────────────────────────────── */

  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(300);

  ok('still signed in after a relaunch',
     await page.locator('nav.tabs').count() === 1,
     'the app logged us out on reload');

  ok('workout, like and comment all survived the relaunch',
     (await cardByTitle('Bench B').innerText()).includes('felt easy') &&
     (await cardByTitle('Bench B').innerText()).includes('🏅'),
     'state did not round-trip through localStorage');

  /* ── 6. Leaderboard ─────────────────────────────────────────────────── */

  await page.click('nav.tabs [data-tab="board"]');
  await settle(220);

  ok('leaderboard ranks the whole circle',
     await page.locator('.lb-row').count() >= 5,
     `${await page.locator('.lb-row').count()} rows`);

  ok('I am marked on the board',
     await page.locator('.lb-row.me').count() === 1,
     'my own row is not highlighted');

  const weekTotals = await page.locator('.lb-val').allInnerTexts();
  await page.click('[data-act="frame"][data-f="all"]');
  await settle(220);
  const allTotals = await page.locator('.lb-val').allInnerTexts();

  // The app abbreviates six-figure tonnage as "275k kg" (fmtBig). Stripping
  // non-digits would read that as 275 and make an all-time total look SMALLER
  // than a weekly one — so honour the k suffix.
  const toNum = (s) => {
    const m = String(s).match(/([\d,.]+)\s*k\b/i);
    if (m) return parseFloat(m[1].replace(/,/g, '')) * 1000;
    return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
  };
  const weekMax = Math.max(...weekTotals.map(toNum));
  const allMax  = Math.max(...allTotals.map(toNum));
  ok('the timeframe filter actually narrows the window',
     allMax > weekMax && weekMax > 0,
     `week max=${weekMax} all-time max=${allMax}`);

  await page.click('[data-act="boardmetric"][data-m="exercise"]');
  await settle(220);
  ok('by-exercise board ranks on a single lift',
     await page.locator('[data-act="boardex"]').count() === 1 &&
     await page.locator('.lb-row').count() >= 5,
     'the exercise picker or its rows did not render');

  /* ── 7. Stats ───────────────────────────────────────────────────────── */

  await page.click('nav.tabs [data-tab="stats"]');
  await settle(260);

  ok('stats draws a chart with a point per session',
     await page.locator('.card .chart .dot').count() >= 1,
     `${await page.locator('.card .chart .dot').count()} plotted points`);

  ok('the PR session is drawn as a PR point',
     await page.locator('.chart .dot.pr').count() >= 1,
     'no PR-coloured point on the chart');

  const e1rmTile = await page.locator('.tile', { hasText: 'Est. 1RM' }).innerText();
  // Epley on 55×5 → 55 × (1 + 5/30) = 64.17 → shown as 64.2
  ok('estimated 1RM uses Epley on the logged set',
     e1rmTile.includes('64.2'),
     e1rmTile.replace(/\n/g, ' '));

  await page.click('[data-act="statmetric"][data-m="volume"]');
  await settle(200);
  ok('the metric toggle redraws the chart',
     (await page.locator('.card', { hasText: 'Session volume' }).count()) === 1,
     'switching metric did not change the chart heading');

  /* ── 8. History search ──────────────────────────────────────────────── */

  await page.click('[data-act="tab"][data-tab="history"]');
  await settle(220);
  const allSessions = await page.locator('[data-act="open"]').count();
  await page.fill('[data-act="histsearch"]', 'Bench Press');
  await settle(220);
  const matched = await page.locator('[data-act="open"]').count();
  await page.fill('[data-act="histsearch"]', 'zzzznope');
  await settle(220);
  const none = await page.locator('[data-act="open"]').count();

  ok('history search filters by exercise name and can miss',
     allSessions >= 1 && matched === allSessions && none === 0,
     `all=${allSessions} matched=${matched} none=${none}`);

  /* ── 9. Units are display-only ──────────────────────────────────────── */

  await page.fill('[data-act="histsearch"]', '');
  await settle(160);
  await page.click('nav.tabs [data-tab="feed"]');
  await settle(220);
  const kgText = await cardByTitle('Bench B').locator('.ex-line .r').first().innerText();

  await page.click('nav.tabs [data-tab="profile"]');
  await settle(200);
  await page.click('[data-act="unit"][data-u="lb"]');
  await settle(200);
  await page.click('nav.tabs [data-tab="feed"]');
  await settle(220);
  const lbText = await cardByTitle('Bench B').locator('.ex-line .r').first().innerText();

  const kgVal = toNum(kgText.split('×')[1]);
  const lbVal = toNum(lbText.split('×')[1]);
  ok('switching to lb converts the displayed weight',
     lbText.includes('lb') && Math.abs(lbVal - kgVal / KG_PER_LB) < 0.15,
     `kg="${kgText}" lb="${lbText}"`);

  const storedAfterUnit = await readState();
  ok('the stored weight is still kilograms after the switch',
     storedAfterUnit.workouts.find(w => w.title === 'Bench B').exercises[0].sets[0].weight === 55,
     'switching units rewrote the stored data');

  await page.click('nav.tabs [data-tab="profile"]');
  await settle(200);
  await page.click('[data-act="unit"][data-u="kg"]');
  await settle(200);
  await page.click('nav.tabs [data-tab="feed"]');
  await settle(220);
  const kgAgain = await cardByTitle('Bench B').locator('.ex-line .r').first().innerText();

  ok('kg → lb → kg returns the identical string',
     kgAgain === kgText,
     `"${kgText}" vs "${kgAgain}"`);

  /* ── 10. Nothing threw along the way ────────────────────────────────── */

  ok('no page errors or console errors', errors.length === 0, errors.slice(0, 4).join(' | '));

  await page.screenshot({ path: out, fullPage: false });

  /* ── report ─────────────────────────────────────────────────────────── */
  let failed = 0;
  for (const [name, pass, extra] of results){
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !extra ? '' : `\n        ↳ ${extra}`}`);
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('SUITE CRASHED:', err); process.exit(2); });
