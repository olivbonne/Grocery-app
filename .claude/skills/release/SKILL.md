---
name: release
description: Ship the current Market List changes — bump APP_VERSION, add a CHANGELOG row, commit to claude/review, push, and open or update the PR into main. Use when asked to release, ship, publish, or finish a batch of changes.
---

# Release Market List changes

The repo's inner-loop shipping workflow. Run `/verify-app` first if it hasn't been run for
the current changes — do not release unverified work.

## Steps

1. **Verify** the working tree changes are complete (`git status`, `git diff --stat`) and that
   `/verify-app` passed on them.

2. **Bump the version:** find `const APP_VERSION = "v0.NN"` in `index.html`, increment by 0.01.

3. **Add a CHANGELOG row** at the top of the table in `CHANGELOG.md`:
   `| v0.NN | YYYY-MM-DD | <plain-language summary, bold key features, user-facing wording> |`
   Match the voice of existing rows (written for the household, not for developers).

4. **Commit** to `claude/review` (create from latest `main` if it doesn't exist) with a message
   like `v0.NN: <summary>`. Push with `git push -u origin claude/review`; on network failure
   retry up to 4 times with exponential backoff.

5. **PR into `main`:** if an open PR for `claude/review` exists (GitHub MCP
   `list_pull_requests`), update its title/body (`update_pull_request`) to cover the new commit;
   otherwise create one (`create_pull_request`). Body: what changed, why, how it was verified
   (mention the `/verify-app` screenshot), any known tradeoffs.

6. **Report** the PR link and remind: merging deploys via Vercel; a PR preview URL is available
   if the repo is connected to Vercel.

## Rules
- Never push `main` directly.
- One version bump per release, even if the batch has many edits.
- If `main` has moved (`git fetch origin main`), rebase or re-apply on top before pushing —
  never clobber newer `main` work (it has happened that `main` advanced mid-session).
