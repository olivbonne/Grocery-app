# Market List — project notes for Claude

## What this is
A single-file vanilla-JS PWA: `index.html` holds the inline CSS and one `<script type="module">`
(several thousand lines). No build step, no framework. Firebase Firestore for live household sync,
Vercel serves `main` as static files. Used as an iPhone home-screen app, portrait-only, max-width 480px.

Three serverless functions in `api/` (CommonJS, Vercel, `maxDuration` 60s in `vercel.json`):
`parse.js` (Smart add), `recipe.js` (recipe from text, a link, a TikTok or a photo) and
`recipe-search.js`. Their keys and settings are env vars — see `docs/ai-setup.md`.

## Conventions
- **Versioning:** bump `APP_VERSION` in `index.html` by 0.01 per batch of app changes and add a
  dated row at the top of the `CHANGELOG.md` table (newest first). Docs-only changes do not bump.
- **Changelog rows are for the household**, not for developers: two to four plain sentences on
  what changed for the person using the app. The engineering why goes in the commit and the PR.
- **CSS:** design tokens live in `:root` (light), `body.dark`/`html.dark` (dark) and
  `html[data-theme="ink"|"noir"]` — change colours there, not inline. The bars' frosted glass is a
  designed, user-customisable system (`--glass-bg`, per-bar `--navbar-bg` etc.); leave it alone.
- **Brand (preserve):** forest ink `#21351F`, sage paper `#F2F6EE`, burnt-orange accent `#E2502C`,
  Outfit variable font (self-hosted `outfit-*.woff2` — no Google Fonts links; every asset lives in
  the repo so the PWA works offline).
- **Emoji are for CONTENT; interface chrome gets drawn marks.** Emoji are the visual language for
  categories and items (🥩 🥦 🍌) — keep them. Buttons, toggles and status marks are inline SVGs in
  `currentColor` (`SEARCH_SVG`, `GLOBE_SVG`, the flag marks…), because they are the only saturated
  non-brand colour on screen otherwise. Settled in v1.58, applied to the newer chrome in v2.00.
  Established feature marks (✨ Smart add, 📖) stay.
- **Security:** every provider key — `GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`,
  `SERPER_API_KEY`, `SEARCH_API_KEY` — stays server-side in `api/*.js` via `process.env`. Never in
  `index.html`, never logged, never in a response or a query string. The Firebase web config in
  `index.html` is intentionally public; leave it. Server-side fetches of user-supplied URLs go through
  `safeUrl`/`isBlockedHost` with every redirect hop re-checked — do not weaken them.
- **New `localStorage` keys that are preferences or data (not a LOOK) must be added to BOTH
  `APP_EXCLUDE_BOOT` and `APP_EXCLUDE`** — they are duplicated deliberately. Otherwise applying an
  appearance slot wipes them. This has bitten twice (`ml_lastview`, then `ml_optcoll` in v2.00).
- **Normalisers that rebuild an object from a fixed shape drop unknown fields.** `writePlan` and
  `planIngNorm` both did, silently (v1.94 amounts, v1.97 saved plans). Adding a field means adding it
  there too.

## Workflow
- Develop on the branch the session is given, push, and open a PR into `main`.
  **Never push `main` directly.** Merging the PR deploys via Vercel.
- **Auto-merge is authorized.** Once a change is verified (syntax gate + suites + `/verify-app`),
  squash-merge its PR without asking, then restart the working branch from the updated `main`
  (`git checkout -B <branch> origin/main`) before the next change — forgetting that is how a later PR
  conflicted once. (Standing user instruction — merging deploys to prod.)
- **Model split:** plan, review and verify on the main thread at higher effort; hand the mechanical
  code editing to the **`executor`** subagent (`.claude/agents/executor.md`, pinned to low effort).
  Give it a self-contained brief — files, exact edits with exact anchors, conventions, self-check
  bar. It applies the edits, runs the syntax gate, and hands back its diff. It does not commit, push,
  or run behavioural checks. Trivial touch-ups can stay on the main thread.
- **Verification is the main thread's job.** Review the executor's diff, then run the suites and
  `/verify-app` yourself. Read the executor's "things I noticed" notes — they have caught real bugs in
  the main thread's own briefs more than once.
- **Always end a task by reporting what each agent did** — which subagent made which changes, and
  what the main thread did.
- Use `/release` for the bump → changelog → commit → PR → merge loop.

## Verification
- **Syntax: `node .claude/tests/syntax.js`.** Do not hand-roll the command. It extracts the module to
  the LAST `</script>` (the module holds one inside a template literal, so the first compiles only a
  prefix — v1.82), saves it as **`.mjs`** (as `.js`, Node 22 passes a file with `import` lines no
  matter what is in it — found 2026-09-26, after which every earlier SYNTAX_OK was known vacuous),
  and plants a canary error first so it cannot go vacuous silently again. It checks `api/*.js` too.
- **Per-version suites live in `.claude/tests/`** — one browser suite per version, plus
  `api-recipe.js` and `api-recipe-search.js`, which test the serverless functions directly with no
  network. See `.claude/tests/README.md` for how to run them and what a check has to prove. Never
  leave a suite in the scratchpad: it is not durable, and every suite up to v1.76 was lost that way.
- Behaviour: the `/verify-app` skill serves the repo, launches headless Chromium
  (`executablePath: '/opt/pw-browsers/chromium'`), stubs `www.gstatic.com/firebasejs/**` (egress
  blocks it; the app runs local-only when `firebaseConfig.apiKey === "REPLACE_ME"`), adds a sample
  list and screenshots at 390×844. For a UI change, screenshot the affected screens before and after.
- **RULE — sweep ONCE, at the end of the batch.** While building, run only the new version's suite
  plus the syntax gate. The full sweep and `/verify-app` run once, after the last change, right
  before shipping. (Standing user instruction, 2026-09-06.)
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
