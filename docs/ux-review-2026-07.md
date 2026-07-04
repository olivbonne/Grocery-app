# Market List — UX walkthrough report (July 2026, v0.65)

Method: drove every major user path in headless Chromium at iPhone size (390×844),
screenshotting each step; cross-checked against the "Mobile UI/UX Principles for AI-First
Design" framework document. Fixes marked ✅ shipped in v0.65.

## Paths walked
Onboarding → empty state → batch add → check items → clear to Buy again → re-add (tap and
re-type) → Plan page → Lists page → swipe navigation → Options (display/sort/store) →
quick-edit panel → shopping mode.

## Confusion points found (and what was done)

| # | Finding | Status |
|---|---------|--------|
| 1 | **Shopping mode was unreachable.** The feature (big glanceable pills, editing hidden) existed but nothing could turn it on — the only toggle lived *inside* the mode. | ✅ Fixed: "🛒 At the store? Start shopping" bar on the Shop page |
| 2 | **Home couldn't be remembered as a place.** Only real stores could save a GPS location; Auto-detect never recognised "at home". | ✅ Fixed: Home saves a location and is auto-detected (category sort) |
| 3 | **Re-typing a cleared item lost its subcategory** (tapping the Buy-again pill kept it). | ✅ Fixed: typed re-entries reuse remembered category + subcategory |
| 4 | **"3/12"-style counters read ambiguously** (is 3 bought or remaining?), and the Shop-tab badge counted *checked* items — a number that grows as work shrinks. | ✅ Fixed: Lists badge = total only; Shop-tab badge removed |
| 5 | **Plan page is not discoverable** (real user feedback). "Plan" + a "+" icon reads as "add", not "this is where you plan the week's shop". First launch lands on the Shop page, so planners may never find Plan. | Proposal below — structural, needs a decision |
| 6 | **Setting a store requires Display=Flat first.** Sort=Location (and the store picker under it) is hidden while Display=Category, so the path to "set Home/store" is: Options → Display: Flat → Sort: Location → pick store. Three non-obvious steps. | Open — consider always showing the Store row, or auto-switching Display when Location is tapped |
| 7 | **Back-chevron (‹) semantics are invisible**: Shop → Plan → Lists, but nothing says so. | Mitigated: swipe navigation now moves between pages directly |
| 8 | **Options sheet differs per page** (no Display/Sort on Lists) — users may hunt for a setting on the "wrong" page. | Open — minor; acceptable progressive disclosure |
| 9 | Mic button renders even where speech recognition may be unsupported. | Open — hide when `webkitSpeechRecognition` is absent |

## Proposal: make Plan discoverable / merge Plan + Shop (user request #5)

The Plan page's real job is **selecting from history**: dotted (Buy-again) items sit inline so
you tap to re-add, with quantity steppers. The Shop page's job is **executing**: check things
off. Two options:

**Option A — cheap, no restructure:** rename tab "Plan" → "Choose" (or "Pick"), swap the +
icon for a checklist-pencil icon, and land *new lists* on the Plan page instead of Shop.
Add a one-time hint ("Plan here — tap faded items to re-add them").

**Option B — recommended end-state, bigger change:** collapse to **one list page**.
Unchecked items = to buy; dotted Buy-again pills shown inline *per category* (they already
render this way on Plan); "Start shopping" flips the same page into store mode (v0.65 made
this mode reachable again). Bottom nav becomes just **Lists · List**. There is no page to
fail to discover; planner and shopper use the same surface in different modes.

Suggested route: ship Option A now (5-minute change), trial Option B behind the existing
Start-shopping bar pattern.

## Framework document — status map (Tier A)

Already in the app: A2 44px targets (v0.64) · A3 shopping mode (v0.65) · A4 aisle sort ·
A5 sync chip · A6 Firestore offline persistence · A7 avatars + "by" attribution ·
A8 undo on clear/delete · A9/A10 contrast + light mode (v0.64) · A11 optimistic UI ·
A12 empty state with example chips · A13 inline quantity steppers · A14 reduced motion ·
A15 share link (copy).

Worth doing next: **A1** move the add bar to the bottom thumb zone on the Shop page (fits
Option B); **A15+** use `navigator.share` for the native share sheet; skeleton on first load.

## Tier B (AI features) — gate first

All Tier B ideas (natural-language batch entry, smart categorisation with confidence,
recipe-to-list, predictive buy-again) require one architectural addition: a tiny Vercel
serverless function to hold the Anthropic API key. Recommended order per the document:
B1 NL batch entry → B2 smart categorisation → B3 recipe-to-list → B4 predictions, each
behind a setting, each with preview-before-apply + undo. Validate the v0.65 in-store fixes
with the household before starting.

## Code-review notes (v0.65)

- Removed: unreachable-shopping-mode trap, unused `ccD`/`done` counters, vestigial no-op
  template, `knownCat` (superseded by `knownEntry`).
- Hardened: `data-restore` parsing no longer breaks on item names containing `|`.
- Known-but-fine: full-page `innerHTML` re-render per interaction (appropriate at this
  scale); `ml_shop` persistence written but intentionally not restored on boot (each visit
  to Shop starts in normal mode); accent-on-white CTA contrast 3.88:1 (brand decision,
  flagged in v0.64).
