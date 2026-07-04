---
name: verify-app
description: Smoke-test the Market List app in headless Chromium before opening or updating a PR. Use when asked to verify the app, check a change works, or before any /release. Serves the repo locally, stubs the blocked Firebase CDN, walks onboarding, adds sample items, and screenshots the result at iPhone size.
---

# Verify Market List

Run the bundled smoke test against the working tree. It proves: the module script parses,
the app boots without Firebase (local-only mode), onboarding works, item parsing/categorization
works, and the UI renders correctly.

## Steps

1. **Syntax check** the inline module script:
   ```bash
   awk '/<script>/{f=1;next} /<\/script>/{f=0} f' index.html > "$SCRATCH/app.js" && node --check "$SCRATCH/app.js"
   ```
   (`$SCRATCH` = the session scratchpad dir. Failure here = stop and fix before anything else.)

2. **Install Playwright** into the scratchpad if not already there (browser is pre-installed;
   never run `playwright install`):
   ```bash
   cd "$SCRATCH" && npm init -y && npm i playwright
   ```

3. **Serve the repo** and run the bundled script:
   ```bash
   cd /path/to/Grocery-app && python3 -m http.server 8901 &   # run_in_background
   cd "$SCRATCH" && node /path/to/Grocery-app/.claude/skills/verify-app/shot.js 8901 verify.png
   ```
   `shot.js` launches Chromium via `executablePath: '/opt/pw-browsers/chromium'`, stubs
   `www.gstatic.com/firebasejs/**` (egress-blocked; the stub makes the app run local-only),
   fills the onboarding name, taps Join, pastes a sample grocery list, and screenshots
   390×844 @2x.

4. **Read the screenshot** and check: header "Groceries." renders in Outfit (rounded
   geometric G — if it looks like a system font, the font files broke), items appear under
   correct category chips with counts, bottom nav shows Lists / Plan / Shop.

5. **Report** pass/fail with the screenshot. The console output also prints the app's rendered
   text — items missing from it means parsing broke.

## Expected output
`APP TEXT:` line containing the added items grouped by category (e.g. Meat/Chicken,
Fruit/Bananas), and a screenshot matching the app's known look. Kill the http server after.
