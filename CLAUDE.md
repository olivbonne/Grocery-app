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
- **10-80-10 model habit:** plan on Fable 5 (plan mode), execute on Opus 4.8/Haiku
  (`/model claude-opus-4-8`), then review the finished diff on Fable 5 before merging.
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
