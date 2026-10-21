# First-time use — a proposal (October 2026, the household's item 4) — BUILT in v2.48

**Decided (2026-10-21, the household took every suggestion):** 1. "Your shops" waits until the first time in Shop, not first
launch. 2. Pinning is offered on the first tick at a shop with no pin — and when auto-detect knows no shop, the card asks
which shop this is, pins it, and gives that trip's ticks (last 3 hours) the shop. 3. The aisle map is offered on the second
day at a shop with no map. 4. "Never" is per shop. Moments 1 and 2 are for a NEW phone only (one that gave its name since
v2.48), so the household's phones are not lectured. Phone-level answers live in `ml_onb`; Settings › Shopping ›
First-time questions › Ask again clears them. Suite: `.claude/tests/v248.js`.

The household asked: "the workflow after adding to Regulars should consider the first time using the app — define where
this applies, make sure it doesn't disturb the rest; add the membership card (scan, photo, file or later) if not already
there; there may be no card, and the app shouldn't keep asking; a card can always be added later; maybe a way to set the
location the first time. Think hard about onboarding the first user. Define what needs to be done and ask for feedback."

## What a new person meets today
1. **Your name** (or "Continue as…" when joining someone's list by link). Nothing else is asked.
2. **An empty list** with four suggestions (Milk, Eggs, Bananas, Bread) and "Add items".
3. **Install card** on iPhone Safari (once), **Got the receipt?** after a shop, **Got a Flybuys card?** after a shop at a Coles.
4. **Location** is on by default, but the browser asks for permission only the first time a shop is checked — usually mid-shop,
   when it is least welcome. Only the built-in shops (two Coles, a market…) have pins; a new shop has none until someone taps
   "Set … location here" while standing in it.

Gaps: nobody is told what Regulars are, where to set their shop, or that receipts and cards exist; location permission
arrives at a bad moment; and the first shop at a new store sorts by category because the store has no pin.

## Principles
- **Ask at the moment it is useful, once.** Every question has three answers: do it now, later (asks again next time the
  moment comes), never (stops asking; a switch in Settings brings it back). Nothing is asked twice in one visit.
- **Never block.** Every step can be skipped; the list works with none of them done.
- **One thing at a time.** Prompts queue: at most one first-time card on screen.
- **First-time only means first time on this phone** (a second phone joining the same list gets the phone-level ones —
  location, card — but not the list-level ones, like "set up your shops").

## The moments
| # | When | What | Answers |
|---|---|---|---|
| 1 | First launch, after the name | **Your shops**: "Where do you usually shop?" — the built-in ones ticked off, plus "Add another" (name only). Location permission is asked here, with one line on why ("so the list walks the shop you're in"). | Done · Skip |
| 2 | First items added | A one-line tip under the list: "Tick things off in the shop. When you're done, Save to Regulars — next time they're one tap away." | Got it (gone for good) |
| 3 | First tick at a shop with **no pin** | "Are you at <shop>? Pin it here so the list knows next time." | Pin it · Not now · Never for this shop |
| 4 | First Save to Regulars **at a chain with a programme** (Coles, Woolworths) and no card | The card prompt (already built): Scan · Photo · Type it in · Not now · I don't have one | (as built; "I don't have one" stops it) |
| 5 | Right after 4 (or after Save when no card applies) | Got the receipt? (already built) | Read · Not now · Off in Settings |
| 6 | Second visit to a shop with no **aisle map** | "Want the list in this shop's aisle order? Walk it once and photograph the signs." | Start · Later · Never for this shop |
| 7 | Any time | Settings › Smart features keeps everything above (cards, receipts, location, aisle maps) — "always able to add later". | — |

4 and 5 are what already happens after Save to Regulars; the only change there is that a scan of the card now leads straight
to "check and save" (v2.35). 1, 2, 3 and 6 are new.

## What it does not do
- No tour, no slides, no account. No question before the list is usable.
- It never asks for a card at home or at a shop with no programme (v2.35 fixed the Flybuys card showing at home).

## Questions for you
1. Moment 1 — is "Your shops" at first launch right, or should it wait until the first time they open Shop?
2. Moment 3 — pinning a new shop: ask on the first tick there, or only from Settings as now?
3. Moment 6 — offer the aisle map automatically on a second visit, or keep it in the menu only?
4. Should "Never" be per shop (3, 6) or once for all shops?
5. Anything a first-time person in your household got stuck on that is not here?
