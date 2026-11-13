# When a release goes wrong — how to go back (v3.07, plan item D2)

Written so that it can be followed from a phone, by the owner alone, without an assistant session. Menu names on Vercel,
GitHub and Firebase could not be checked from where this was written; they move from time to time.

**How you find out:** the `live-check` workflow fails after a merge (GitHub emails you), a phone shows something broken,
or a `crash` issue appears on GitHub. **First question: is the list itself safe?** Almost always yes — a release changes
the app, not the data. Sections 1–3 put the app back; section 5 is for data.

## 1. Put the previous version back (about one minute) — do this first
Vercel keeps every deployment. Going back does not rebuild anything.
1. vercel.com › the **grocery-app-2** project › **Deployments**.
2. Find the last deployment that worked (the one before the newest **Production** one — each shows its commit title, e.g.
   "v3.06: …").
3. Its **⋯** menu › **Instant Rollback** (or **Promote to Production**). Confirm.
4. Open the app on a phone, close it fully (swipe it away) and open it again. The version under the ⋯ button should be
   the older one.

While a rollback is in place Vercel stops auto-deploying new merges until you promote a newer deployment — so tell the
assistant (or undo it in the same menu) once the fix is ready.

## 2. Make the repository agree (so the next merge does not bring the problem back)
The rollback only changes what is served; `main` still holds the bad change.
- On GitHub: open the merged pull request › **Revert** › create the revert pull request › wait for its five checks ›
  merge. That deploys the reverted code, and auto-deploy carries on.
- Or ask the assistant: "revert v3.NN".
Never push to `main` directly — the ruleset refuses it anyway.

## 3. A phone is stuck on a broken copy (the service worker)
The app keeps a copy of itself on each phone so it opens without signal. If a bad release left phones on a broken copy
that a rollback does not replace:
1. Open `sw.js` in the repository. Its header comment holds a **kill switch**: a few lines to paste over the whole file.
2. Do that in a pull request, merge it. Phones that next open the app with signal drop their stored copy and load fresh.
3. Once things are normal, put `sw.js` back (revert that pull request).
On one phone only: delete the home-screen app and add it again from Safari (settings kept on the phone are lost; the
list is not — it lives in the database).

## 4. A server setting or a database rule made it worse
- **AI features refused on every phone after a settings change:** Vercel › Settings › Environment Variables — put the
  variable back (`APP_CHECK` → `log`, `API_AUTH` → `log`), then Deployments › ⋯ › **Redeploy**.
- **Lists locked on every phone after publishing rules:** Firebase console › Firestore Database › Rules — the editor keeps
  a **history**; pick the previous version and publish it. Without history: copy `firebase/firestore.rules` from the
  repository at the previous version (GitHub › the file › History) and publish that. Do it for the real project first,
  then the preview project (`market-list-preview-fcccf`).

## 5. The list's data is wrong (items missing, a bad merge)
In this order — each is less recent than the one before:
1. **Undo**, if the message is still on screen.
2. **Settings › Your data › Restore** — the phone keeps a snapshot a day for seven days.
3. **Kept in the database (weekly)** in the same place — four weekly backups, restorable from any of the list's phones.
4. A backup file you exported (**Back up to a file**).
A restore replaces the list for everyone on it; tell the household first.

## 6. Afterwards
- Tell the assistant what happened and when, with a screenshot if there is one: every fix of something broken ends with
  a lesson in `docs/lessons-learned.md` and a test that would have caught it.
- If the live check failed for a reason that was not a real problem (the host was slow to deploy), re-run it: GitHub ›
  Actions › live-check › **Run workflow**.
