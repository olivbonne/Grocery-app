---
name: release
description: Ship the current Market List changes — verify, bump APP_VERSION, add a CHANGELOG row, commit, push, open the PR into main, squash-merge it, and restart the working branch from main. Use when asked to release, ship, publish, or finish a batch of changes.
---

# Release Market List changes

The repo's shipping loop. Auto-merge is authorized (see CLAUDE.md), so this ends with the change
live, not with a PR waiting. Never release unverified work.

## Steps

1. **Verify**, in this order, once for the whole batch:
   - `node .claude/tests/syntax.js` → `SYNTAX_OK`
   - the full sweep: every `.claude/tests/v*.js` against a local server, plus
     `node .claude/tests/api-recipe.js` and `node .claude/tests/api-recipe-search.js`
   - `/verify-app`, and for a UI change, screenshots of the affected screens before and after.
   Any red: stop. If a version deliberately changed what an old check asserts, rewrite that check in
   place with a `SUPERSEDED by vX.YZ:` note — never delete it, never ship it failing.

2. **Bump** `const APP_VERSION = "vN.NN"` in `index.html` by 0.01 — once per batch, not per item.
   Docs-only changes do not bump.

3. **CHANGELOG row** at the top of the table in `CHANGELOG.md`:
   `| vN.NN | YYYY-MM-DD | <two to four plain sentences> |`
   Written for the household: what changed for the person using the app, with the key feature in
   bold. No regex names, retry budgets or file paths — those go in the commit and the PR.

4. **Commit** on the session's working branch. The message carries the engineering why: what
   changed, why, what was found along the way. Push with `git push -u origin <branch>`; on a network
   failure retry up to 4 times with backoff (2s, 4s, 8s, 16s).

5. **PR into `main`** (GitHub MCP `create_pull_request`). Body: what changed and why, how it was
   verified with the actual sweep tally, anything not verified and why, and any judgement calls the
   user should know about. Follow a PR template if the repo has one.

6. **Squash-merge** it (`merge_pull_request`, `merge_method: squash`). This deploys via Vercel.

7. **Restart the branch from the new `main`** — skipping this is how a later PR once conflicted:
   ```bash
   git fetch origin main && git checkout -B <branch> origin/main && git push -f -u origin <branch>
   ```

8. **Report** the version, the merge commit, the sweep tally, and what each agent did.

## Rules
- Never push `main` directly.
- One version bump per batch.
- If `main` has moved, rebase or re-apply on top before pushing — never clobber newer `main` work.
