# Behavioural suites

One file per version, named for the version that introduced it. Each is a standalone headless-Chromium
script: it seeds a list into `localStorage`, stubs the Firebase CDN (egress blocks it, and the app runs
local-only when `firebaseConfig.apiKey === "REPLACE_ME"`), drives the **real controls**, and asserts on
what the browser actually computed.

They live here rather than in a scratch directory because a scratch directory is not durable — the one
holding every suite up to v1.76 was cleared mid-batch on 2026-08-03, and those checks are simply gone.
Anything worth re-running belongs in the repo.

## Running them

```bash
# once per container: the browser is pre-installed, the node package is not
cd /tmp/<scratch> && npm init -y && npm i playwright

# serve the repo, then run a suite against it
python3 -m http.server 8971 --directory /home/user/Grocery-app &
node .claude/tests/v178.js 8971 /tmp/<scratch>/v178.png
```

Each prints one `PASS`/`FAIL` line per check and a tally, and writes a screenshot to the path given.
A suite that cannot reach the server crashes with `ERR_CONNECTION_REFUSED` — start the server first.

## The one that is not a browser suite

`api-recipe.js` tests the serverless endpoint directly — `node .claude/tests/api-recipe.js`, no server
and no network, with the one outward call stubbed. It exists because v1.86 made `/api/recipe` fetch a
URL that a user typed, which is a request only the deployment can make; the guards around that (no
loopback, no private ranges, no link-local, every redirect hop re-checked) are the most
security-relevant code in the repo and no browser suite can reach any of it.

## What a good check looks like

The header of each suite lists what that version's checks have to prove beyond "the control exists",
and carries forward the test bugs found in earlier ones. The recurring lessons:

- **Drive the real control.** Seeding `localStorage` in place of a tap tests the storage key, not the
  feature (v1.60).
- **A check that never triggers the thing it names is worse than no check** (v1.68) — assert the
  precondition too, so a vacuous pass is impossible.
- **Measure against a baseline from the same build.** Anything that adds to always-on chrome must be
  proved not to move an untouched install (v1.76, v1.78).
- **Find a row by the control it carries**, not by a label that may stop being unique (v1.76).
- Playwright scrolls a control into view before clicking it, so take any scroll baseline *after*
  bringing the target into view (v1.77).
- A page transition swallows the next tap while it runs — wait it out (v1.75).

## Superseding a check

When a version deliberately changes what an older check asserts, rewrite that check in place against
the new behaviour and leave a `SUPERSEDED by vX.YZ:` comment saying what replaced it and why. Deleting
it loses the reason it existed; leaving it failing makes the suite useless as a gate.
