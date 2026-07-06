# Market List — project notes for Claude

## What this is
A single-file vanilla-JS PWA (`index.html`, ~1900 lines: inline CSS + one module script).
No build step, no framework. Firebase Firestore for live household sync, Vercel serves
`main` as static files. Used as an iPhone home-screen app, portrait-only, max-width 480px.

## Conventions
- **Versioning:** bump `APP_VERSION` in `index.html` by 0.01 per batch of changes and add a
  dated row at the top of the `CHANGELOG.md` table describing them (newest first).
- **CSS:** design tokens live in `:root` (light) and `body.dark` (dark) — change colors there,
  not inline. Notable fix/feature blocks are tagged with `A<n>` comments (e.g. `/* A15 ... */`).
- **Brand (preserve):** forest ink `#21351F`, sage paper `#F2F6EE`, burnt-orange accent
  `#E2502C`, Outfit variable font (self-hosted `outfit-*.woff2` — do not reintroduce Google
  Fonts links; all assets must live in the repo so the PWA works offline).
- Emojis are part of the app's visual language (category icons) — keep them.

## Workflow
- Develop on the standing branch **`claude/review`**, push, and open/update a PR into `main`.
  **Never push `main` directly.** Merging the PR deploys via Vercel.
- **Auto-merge is authorized.** Once a change is verified (`/verify-app` + syntax), merge its
  PR into `main` without asking for confirmation, then restart `claude/review` from the
  updated `main` for the next change. (Standing user instruction — merging deploys to prod.)
- **Model split (10-80-10):** plan and review on the **main thread (Opus 4.8, high
  effort)**; run execution in the **`executor` subagent (Opus 4.8, low effort)** (Opus for
  the thinking, low-effort Opus for the grind). Project settings default the main thread to
  `model: opus` / `effortLevel: high`. See the RULE under **Workflow** below.
- **RULE — execution runs in the `executor` subagent.** Reserve the main thread's
  high-effort budget for planning and review; hand the heavy code-editing (the "80%") to
  the **`executor`** agent (`.claude/agents/executor.md` — pinned to `model: opus`,
  `effort: low`, so the effort level is guaranteed, not left to the Agent-tool defaults).
  This is the standing default, not an "only when asked" — plan on the main thread, spawn
  `executor` (via the Agent tool with `subagent_type: executor`) to do the edits, then
  review its diff on the main thread. Give it a thorough, self-contained brief (files,
  exact edits with exact anchors, conventions, version bump, verification bar); it applies
  the edits, **verifies before returning** (`node --check` + a headless smoke check), and
  does **not** commit/push/PR — the main thread ships. Trivial one-line touch-ups can stay
  in the main thread; anything larger goes to `executor`.
- **Always end a task by reporting what each agent did** — which subagent made which
  changes, and what the main thread did (plan/review/ship).
- Run `/verify-app` before opening or updating a PR. Use `/release` for the
  version-bump → changelog → commit → push → PR inner loop.

## Verification
- Syntax: extract the module script and `node --check` it.
- Behavior: `/verify-app` skill — serves the repo, launches headless Chromium
  (`executablePath: '/opt/pw-browsers/chromium'`), **stubs `www.gstatic.com/firebasejs/**`**
  (egress blocks it; the app runs local-only when `firebaseConfig.apiKey === "REPLACE_ME"`),
  walks onboarding (name → Join), pastes a sample list, screenshots at 390×844.
- There are no unit tests; the smoke test + screenshot is the bar.

## Environment quirks (Claude Code on the web)
- Egress blocks most external hosts (x.com, blogs, Firebase JS CDN). `fonts.gstatic.com`
  worked for one-off downloads; don't rely on external fetches at runtime.
- Remote git branch **deletion** is blocked (HTTP 403) — ask the user to delete branches.
- `~/.claude` is ephemeral (container is reclaimed); anything durable belongs in this repo
  under `.claude/`.
