# S8 — the list as many small records (plan, 23 October 2026)

Architecture review S8. Since v2.51 two phones no longer undo each other's ticks (items merge one by one), but the list is
still **one database record**, rewritten whole on every change. That leaves three limits:

1. **The 1 MB ceiling.** Prices, spending, history, plans and aisle maps all grow inside the same record. A busy household
   reaches it in time; strangers' households sooner. Past it, nothing saves.
2. **Every change sends everything.** A tick re-sends the whole list (and its prices and history) — slow on a weak signal,
   and wasteful.
3. **Rules can only check the record as a whole.** With items as their own records, the rules can check each item.

## The new shape
| Record | Holds | Written |
|---|---|---|
| `lists/{code}` | the list's settings: name, people, categories, stores, look, plan, occasions, aisle maps, `v`, `parts` | rarely |
| `lists/{code}/items/{id}` | one item (name, amount, category, ticked…) | on every tick or edit — only that item |
| `lists/{code}/regulars/{key}` | one Regular (with `gone` instead of a tombstone list) | at the finish of a shop |
| `lists/{code}/prices/{key}` | one item's recent prices (the last 8) | after a receipt |
| `lists/{code}/spend/{t}` | one receipt's total and categories | after a receipt (append only) |

`parts` in the list record says which parts already live as records (e.g. `["items"]`), so the app reads each part from
the right place during the move. Who may open the list (`access/{code}`) and the rules that check members apply to the
records under it too.

## The order — each step its own release, each one safe on its own
1. **v2.55 — one door (done) to the database (`js/store.js`).** Every read and write goes through one module, no behaviour
   change. Also makes languages a registry (`docs/languages.md`). *No data moves.*
2. **v2.58 — items as records (this release; planned as v2.56).** The first phone on v2.58 copies the items into `items/{id}` (one batch, safe to repeat,
   the copy keyed by the item's own id), then marks `parts:["items"]` and `v:3`. From then on a tick writes one small
   record. The old `items` array is left untouched as a frozen backup until step 4. Phones on v2.49–v2.57 see `v:3` and
   stop writing ("Update now") — they cannot overwrite the new shape. Each phone also keeps its usual daily backup
   (Settings › Backups) and takes one just before the move. New rules for `items/{id}` are published **before** this
   release goes live.
3. **v2.75 — Regulars, prices and spending as records (this release),** the same way (`parts` grows to
   `["items","regulars","prices","spend"]`, `v:4`; phones on v2.58–v2.74 stop writing). These are what grow without limit.
   Records are `regulars/{rid}`, `prices/{pid}` and `spend/{sid}`, never deleted; the old arrays stay frozen in the list record.
4. **Later — tidy up.** Once every phone has run step 3 for a couple of weeks, the frozen arrays are cleared from the
   list record, which then stays small for good.

## What it costs (said out loud)
- **Database reads.** Opening a list reads each item once (Firestore's offline cache then sends only changes while the app
  stays open). 100 items × 20 openings a day ≈ 2,000 reads; Firebase's free plan allows 50,000 a day (not re-checked
  from here). Fine for households; for thousands of users, plan on the paid plan.
- **Tests.** The test stubs speak only "one record"; v2.58's suite adds a stub that speaks collections. Older suites keep
  their one-record lists, which stay readable (a list without `parts` is read the old way).
- **No going back automatically.** Once a list moves, a phone on v2.57 or older can only read it. That's deliberate.

## What could go wrong, and the guard
| Risk | Guard |
|---|---|
| Two phones move the same list at once | the copy is keyed by item id and merged — the second copy writes the same records |
| The move stops halfway (signal lost) | `parts` is only set after the batch succeeds; the next opening repeats the move |
| A phone still on an old version | `v:3` makes it read-only with "Update now" (since v2.49) |
| A rule mistake refuses writes | rules published and checked on the Sandbox list before the release; the server logs Firestore's own reason |
| Anything else | the daily backup on each phone, and the frozen array in the record until step 4 |
