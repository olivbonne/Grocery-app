# Market List — project notes for Claude

## What this is
A vanilla-JS PWA, no build step, no framework. Since v2.19 (the module split, phase 1) `index.html` is the
shell — markup, the Firebase config and three small boot scripts — the styles are `app.css`, and the app is
one ES module, `js/app.js` (several thousand lines), importing the reference data (`js/data/catalog.js`),
the drawings (`js/data/drawings.js`) and the logic of the features built since as modules of their own — the 10%
shop (`js/tenpct.js`, v2.20), which store is cheaper (`js/compare.js`, v2.21), what we spend (`js/spend.js`, v2.24) and the aisle types and maps
(`js/aisles.js`, v2.27 — a name's type is its LONGEST word that STARTS a word in it, so short stems cannot hide in long words) and the till (`js/till.js`, v2.31 — a membership card's Code 128 barcode, checked bar for bar against python-barcode in v231.js, and pairing a receipt with the cart: by name, then in tick order between the named lines), the amounts (`js/amounts.js`, v2.43 — reading, rounding, scaling and adding recipe amounts; `showAmt`, which reads the units setting, stays in the app), the text parser (`js/parse.js`, v2.46 — a typed entry into count, weight and name, and a pasted list into entries; `parseInput`, which reads the category labels, stays in the app) and the phone's features (`js/platform.js`, v2.43 — the one door to file pickers, location, wake lock, share, clipboard, vibration, barcode and speech — the only module that touches the device): pure functions (platform.js aside), no imports, the
app passes in what they need, so each is unit-tested in Node by its version's suite. Until v2.18 all of it lived inline in `index.html`; it moved byte
for byte. Later phases move cohesive parts of `js/app.js` into modules of their own. Firebase Firestore for
live household sync, Vercel serves `main` as static files. Used as an iPhone home-screen app, portrait-only,
max-width 480px.

Seven serverless functions in `api/` (CommonJS, Vercel, `maxDuration` 60s in `vercel.json`):
`parse.js` (Smart add), `recipe.js` (recipe from text, a link, a TikTok or a photo),
`recipe-search.js`, `receipt.js` (a receipt photo → items and prices, v2.09; it never logs the photo
or what it read), `aisle.js` (v2.28, a photo of an aisle sign → its number and what it lists; built from receipt.js, the same no-logging rule), `card.js` (v2.35, a photo of a membership card → its name and number, only when the phone cannot read the barcode itself; the same no-logging rule, and never the number) and `feedback.js` (Report a problem, v2.13 → a GitHub issue, or a `[feedback]` log line). Their shared helper is `lib/guard.js` (v2.39). Their keys and settings are env vars — see `docs/ai-setup.md`.

## Conventions
- **Versioning:** bump the version by 0.01 per batch of app changes with `node .claude/tools/bump.js N.NN`
  (it sets `APP_VERSION` in `js/app.js` and every `?v=` — see "Versioned files" below) and add a
  dated row at the top of the `CHANGELOG.md` table (newest first). Docs-only changes do not bump.
- **Changelog rows are for the household**, not for developers: two to four plain sentences on
  what changed for the person using the app. The engineering why goes in the commit and the PR.
- **CSS** (in `app.css` since v2.19): design tokens live in `:root` (light), `body.dark`/`html.dark` (dark) and
  `html[data-theme="ink"|"noir"]` — change colours there, not inline. The bars' frosted glass is a
  designed, user-customisable system (`--glass-bg`, per-bar `--navbar-bg` etc.); leave it alone.
- **Brand (preserve):** forest ink `#21351F`, sage paper `#F2F6EE`, burnt-orange accent `#E2502C`,
  Outfit variable font (self-hosted `outfit-*.woff2` — no Google Fonts links; every asset lives in
  the repo so the PWA works offline). Since v2.15 that includes the Firebase SDK
  (`vendor/firebasejs/10.12.2/`, see its README for the one-line change and how to upgrade).
- **The service worker (`sw.js`, v2.15)** is what lets the app open with no signal. The app page is
  network-first with a 4-second fallback to the stored copy; other same-origin files answer from the
  stored copy and refresh in the background; `/api/*`, non-GETs and anything cross-origin are never
  touched. A broken worker can strand phones on an old copy, so its header holds a **kill switch** —
  paste it over the file and deploy. Changing the SDK means a new versioned `vendor/` folder, never
  editing files in place (they are served `immutable`).
- **Emoji are for CONTENT; interface chrome gets drawn marks.** Emoji are the visual language for
  categories and items (🥩 🥦 🍌) — keep them. Buttons, toggles and status marks are inline SVGs in
  `currentColor` (`SEARCH_SVG`, `GLOBE_SVG`, the flag marks…), because they are the only saturated
  non-brand colour on screen otherwise. Settled in v1.58, applied to the newer chrome in v2.00.
  Established feature marks (✨ Smart add, 📖) stay.
  **v2.04: content is drawn too, by default** (Settings › Icon style). The nine standard categories
  get `CATMARK` line marks; items get `DRAWN` illustrations, 48×48 in three layers — back lines, a
  front shape filled with `--illbg` (the tile's own background, so it hides what is behind it) and
  detail lines (the drawings and the name maps are in `js/data/drawings.js` since v2.19). Name → drawing: `DRAW_EXACT`, then `DRAW_HINTS` (first match wins, so specific phrases
  go first). **A hint matches anywhere in the name, so a short stem hides inside longer words**
  ("toilet" and "foil" contain "oil", "eggplant" contains "egg"). Those phrases sit at the START of
  `DRAW_HINTS`, and new broad stems go at the END, where they can never change a Regular (v2.06,
  guarded by `.claude/tests/v206.js`). Emoji remain the fallback (household-made categories) and the opt-out. `itemIcon()` is
  for DISPLAY and returns markup; anything that stores an icon keeps `itemEmoji()` — no SVG in state.
  The drawings are designed on the canvas listed in `docs/icon-catalogue.md`.
- **Every wait is visible, and every wait ends** (household principle, v2.11). Anything that takes
  longer than a tap — a network call, an AI read, a photo resize — shows at once that it started
  (spinner plus the step it is on, in a `role="status"` element), and ends in either the result or a
  plain message: a timeout (AbortController), an error code turned into words, never a silent nothing.
  On iOS a file `<input>` must be attached to the DOM, or `change` never fires and the wait never starts
  (`rcPick`, v2.11). The suite for any new wait checks the busy state AND the failure message.
- **Text shown to the person goes through `t()` / `tf()` (v2.45)** with its French in `js/i18n.js` (keys are the English text; a missing key falls back to English, and the v2.45 suite fails on one). Never translate stored data, item or list names, or text sent to the server.
- **Security:** every provider key — `GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`,
  `SERPER_API_KEY`, `SEARCH_API_KEY`, `FEEDBACK_GITHUB_TOKEN` — stays server-side in `api/*.js` via `process.env`. Never in
  `index.html`, never logged, never in a response or a query string. The Firebase web config in
  `index.html` is intentionally public; leave it. Server-side fetches of user-supplied URLs go through
  `safeUrl`/`isBlockedHost` with every redirect hop re-checked — do not weaken them.
  Since v2.25 the Firestore rules live in `firebase/firestore.rules` (published by the owner from the console, steps in
  `docs/firestore-rules.md` — a change there does nothing until then), and new list codes come from `newListCode()`
  (128 bits, `crypto.getRandomValues`). Since v2.39 every `/api/*` function calls `guard(req, name)` (`lib/guard.js`) first — it checks the phone's quiet Firebase sign-in (`API_AUTH`: log by default, require once the owner switches it) and counts a daily limit when Upstash is configured; the client sends the token through `apiFetch()`, never plain `fetch('/api/…')`. Since v2.52 **App Check** is on (Fraud Defense, `APPCHECK_SITE_KEY`): it must be in place BEFORE the database and sign-in start (`startAppCheck(app).then(...)`, v2.54 — started alongside, every launch's first requests went out unverified). Since v2.53 the AI functions' **daily count** lives in Firestore `quota/{uid}/days/{day}`, written by the server *as the calling phone* (no admin key); its rule only allows +1. Vercel env (21–23 Oct 2026): `API_AUTH=require`, `APP_CHECK=log`. `privacy.html` says what the app keeps and what each feature sends where: a
  feature that changes what it sends, or where, changes that page in the same PR.
- **New `localStorage` keys that are preferences or data (not a LOOK) must be added to BOTH
  `APP_EXCLUDE_BOOT` and `APP_EXCLUDE`** — they are duplicated deliberately. Otherwise applying an
  appearance slot wipes them. This has bitten twice (`ml_lastview`, then `ml_optcoll` in v2.00).
- **Versioned files (v2.19).** `app.css`, `js/app.js` and every module it imports are loaded as `…?v=<version>`,
  and `sw.js` PRECACHE lists the same URLs — so a phone never pairs a new page with an old file (the worker
  answers assets from its copy first). Never edit a `?v=` or `APP_VERSION` by hand: `bump.js` changes them all
  together, and `v219.js` fails if any disagree. A new module needs a versioned import, a PRECACHE entry and,
  when it is pure data, no imports of its own. **index.html's inline scripts are pinned by hash** in vercel.json's Content-Security-Policy (v2.39): editing one means recomputing its hash there — the syntax gate fails until they agree, and the live site would otherwise refuse to run it. Imported bindings are read-only: move only what is never
  reassigned (`syntax.js` links every relative import to an export of its target).
- **Module top level runs in order, and `applyTheme()` runs at boot (`js/app.js` ≈ line 1200).** A module-level `let`/`const`
  that anything called at boot touches must be declared above that call, or be `var` — otherwise the app dies
  at start-up with "Cannot access … before initialization" (v2.16 `_cardHexMemo`, caught by the suite).
- **Never measure every tile on a render.** Per-row equal heights are CSS (rows stretch their tiles); the floor is
  `--tileh` (the cart's own is `--tileh-cart`), the 90th percentile of the tiles' natural heights. `syncTileH`
  measures each tile ONCE, as an unstretched copy in a hidden probe, remembered by what it shows until the layout
  signature changes (v2.16). v2.10–v2.11's per-tile measuring was over half of every redraw. A single stand-in
  probe tile was tried first and was wrong whenever most names wrap (three small columns) — CI caught it.
- **A tick is not a purchase (v2.29).** Ticking only moves an item to the cart. What a shop teaches — the AI walking
  order, purchase history, the "bought" history line — is recorded at the finish (`sweep`, which auto-finish also
  calls), from what is still ticked, in tick order. Never learn from a tick itself: a wrong tap, untapped, must leave no trace.
- **Settings has two layers (v2.18).** Sections named in `LOOK_SECTS` show only on the "Customise the look" page
  (`#optLook` opens it, `#lookBack` or the Settings tab returns); everything else is everyday Settings. A new section
  is everyday unless it is added there. Since v2.30 everyday Settings is grouped by what it is for — Appearance, Tiles,
  Shopping, Smart features (AI and receipt features, with `.optsub` subheads), Plan & recipes, People, Lists & sharing, History,
  Help, Your data; a new row joins one of these, not a new section. Since v2.32 an explanation under a setting is written as
  `<div class="opthint">` right after its row: `infoBubbles()` folds it behind an (i) on the row's label — write new ones that way. The search (`filterOptions`) only toggles classes — never `render()` from it,
  or the field loses focus and the keyboard drops. A suite that drives a look control opens that page first.
- **Device features go through `js/platform.js` (v2.43)** — file pickers, location, wake lock, share, barcode, speech. A future native app replaces that file's insides; never call `navigator.*` device APIs or build a file `<input>` directly in js/app.js.
- **Two category sets (v2.33).** Lists made before v2.33 keep the nine (`DEFAULT_CATS`); a list made since (`_freshList`)
  starts with the thirteen plus Others (`CATS13`, in the order a shop is walked). The dictionary, the AI readers and receipts
  still speak the nine: every place an item is ADDED goes through `newCat(cat, name)`, which on a thirteen-list puts it where
  the shop shelves it (its aisle type first). A category the person picked by hand is never changed, and nothing stored is
  ever re-categorised.
- **An item's `where` may name several shops (v2.35)** — their ids joined by commas, so it stays a string everywhere it is
  copied. Read it with `whereIds(i)`, never `i.where === id`.
- **Views group items with `catShown(i.cat)`, never `i.cat === cat.id`** (v2.17). An item whose category is gone
  (removed on another phone mid-edit, or old data) otherwise vanishes from the list while still counted in "N to
  buy". It is display only: never rewrite a stored `cat` to tidy an orphan, the categories may still be arriving.
- **Normalisers that rebuild an object from a fixed shape drop unknown fields.** `writePlan` and
  `planIngNorm` both did, silently (v1.94 amounts, v1.97 saved plans). Adding a field means adding it
  there too. Items are copied field by field as well: a ticked item becomes a Regular in `moveToBuyAgain` (via `sweep`
  and `removeEditing`), and a Regular comes back in `addFromRegular` and `restore` — v2.22's `note` and `where` are
  named in each. The list document itself is one: `subscribe()` rebuilds `state` field by field, so a new
  top-level field (v2.09 `prices`, v2.16 `aisle`, v2.20 `memb`, v2.23 `templates`, v2.24 `spend`, v2.26 `looks`, v2.27 `aislemap`) must be named there, in the two default
  `state` literals, in `listDoc()` (the v2.15 backups) and in `restoreList()`. Presence is the exception: v2.23 `shopping`
  (who is at a shop now) is synced, so it is in the literals and `subscribe()`, but never backed up or restored.

## Workflow
- Develop on the branch the session is given, push, and open a PR into `main`.
  **Never push `main` directly.** Merging the PR deploys via Vercel.
- **Auto-merge is authorized.** Once a change is verified (syntax gate + suites + `/verify-app`),
  squash-merge its PR without asking, then restart the working branch from the updated `main`
  (`git checkout -B <branch> origin/main`) before the next change — forgetting that is how a later PR
  conflicted once. (Standing user instruction — merging deploys to prod.)
- **Model split — latest Opus, high / low.** Plan, review and verify on the main thread
  (**latest Opus, high effort** — `.claude/settings.json`); hand the mechanical code editing to the
  **`executor`** subagent (**latest Opus, low effort** — `.claude/agents/executor.md`). Both use the
  `opus` alias, so they move to each new Opus automatically — do not pin a version ID. (Standing user
  instruction, 2026-09-26. Opus 5.5 at the time of writing.)
  Give it a self-contained brief — files, exact edits with exact anchors, conventions, self-check
  bar. It applies the edits, runs the syntax gate, and hands back its diff. It does not commit, push,
  or run behavioural checks. Trivial touch-ups can stay on the main thread.
- **Verification is the main thread's job.** Review the executor's diff, then run the suites and
  `/verify-app` yourself. Read the executor's "things I noticed" notes — they have caught real bugs in
  the main thread's own briefs more than once.
- **Say every shortcut out loud (standing user instruction, 2026-10-15).** When a choice is good enough for one household but
  not for strangers, growth or an app store (a key in a link, one big record, a limit counted on the phone…), tell the owner
  in that reply what would make it not good enough and what fixing it costs, and add it to the report's "Do later" list.
  Raise sign-in, data shape, target platforms and abuse cost before building, not when asked (`docs/lessons-learned.md` §8).
- **Always end a task by reporting what each agent did** — which subagent made which changes, and
  what the main thread did.
- Use `/release` for the bump → changelog → commit → PR → merge loop.

## Verification
- **Syntax: `node .claude/tests/syntax.js`.** Do not hand-roll the command. It checks every module under
  `js/` as **`.mjs`** (as `.js`, Node 22 passes a file with `import` lines no matter what is in it — found
  2026-09-26, after which every earlier SYNTAX_OK was known vacuous), plants a canary error in a copy of
  `js/app.js` first so it cannot go vacuous silently again, links every relative import to an export of its
  target, refuses an inline module or `<style>` back in `index.html`, and checks `api/*.js` too. (Until v2.18
  it extracted the inline module to the LAST `</script>` — the module holds one inside a template literal.)
- **Per-version suites live in `.claude/tests/`** — one browser suite per version, plus
  `api-recipe.js`, `api-recipe-search.js`, `api-receipt.js`, `api-aisle.js`, `api-card.js` and `api-feedback.js`, which test the serverless functions directly with no
  network. See `.claude/tests/README.md` for how to run them and what a check has to prove. Never
  leave a suite in the scratchpad: it is not durable, and every suite up to v1.76 was lost that way.
- Behaviour: the `/verify-app` skill serves the repo, launches headless Chromium
  (`executablePath: '/opt/pw-browsers/chromium'`), stubs the Firebase SDK with the route
  `**/firebasejs/**` (it lives at `/vendor/firebasejs/` since v2.15; the stub makes the app run on its
  local cache), adds a sample list and screenshots at 390×844. For a UI change, screenshot the affected
  screens before and after.
- **RULE — the real Firebase SDK must never run in a test.** GitHub's runners have internet, so it
  would reach the household's real database. Every suite routes `**/firebasejs/**` to the stub. The
  service worker is not registered under automation (`navigator.webdriver`) because Playwright 1.56
  cannot stub a worker's own requests; a suite that needs it sets localStorage `ml_swtest` to "1" and
  must swap the worker's cached SDK for the stub before reloading (v215.js shows how).
- **CI (v2.15):** `.github/workflows/tests.yml` runs the syntax gate, the api suites and every browser
  suite (4 shards, 300 s per suite) on each pull request. Check its result on the PR before merging.
- **RULE — sweep ONCE, at the end of the batch.** While building, run only the new version's suite
  plus the syntax gate. The full sweep and `/verify-app` run once, after the last change, right
  before shipping. (Standing user instruction, 2026-09-06.) Since v2.16 the sweep of record is the CI
  run on the PR — the same suites, four shards, about six minutes against 25+ locally; run them locally
  only when CI is unavailable, and never merge on a red or missing CI run.
- **RULE — one version per batch, not one per item.** A batch of numbered requests is ONE
  `APP_VERSION` bump, one CHANGELOG row, one PR. Ship mid-batch only when an item is genuinely
  independent — and say why.
- When a version deliberately changes what an older check asserts, rewrite that check in place with
  a `SUPERSEDED by vX.YZ:` note that says what it still protects — never delete it, never leave it
  failing.
- There are no unit tests; the syntax gate, the suites, the smoke test and the screenshots are the bar.

## Environment quirks (Claude Code on the web)
- Egress blocks most external hosts — including tiktok.com, groq.com, tavily.com and Google's docs.
  **So claims about a third-party service (pricing, free tiers, URL formats, model names) cannot be
  checked from here.** Say so when relaying one, and build so that being wrong is cheap: env vars for
  model names, named error codes, fallbacks. Two such claims were wrong in September 2026 (a "no
  credit card" free tier, and a TikTok search URL that drops its query).
- Vercel runtime logs (via the Vercel MCP tools) are the way to see what the live functions did —
  every failure path in `api/*.js` logs its reason for exactly this.
- Remote git branch **deletion** is blocked (HTTP 403) — ask the user to delete branches.
- `~/.claude` is ephemeral (the container is reclaimed); anything durable belongs in this repo under
  `.claude/`.
