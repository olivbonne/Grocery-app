# Market List vs Samsung Food — benchmark, roadmap, and how this could make money

September 2026 · reviewed against Market List **v1.80**

> **Status at v2.14 (11 October 2026).** The live, more detailed version of this report is the published
> page "Market List vs Samsung Food" (the plan of what is left, the supermarkets' memberships, pricing in
> AUD). Of the roadmap in §3, everything in "Next" has shipped, and so have **7** receipt import and
> **9** price memory (v2.09, from the household's own receipts). **10** is half done (the plan syncs,
> appearance does not), **8** basket handoff has not started, and nothing in §4 has been acted on.
> **§7 below is a full app review from 11 October**: what to fix first, quick wins, bigger features and
> the long-term calls.
>
> (Status at v2.01: shipped — 1 Plan tab, 2 list switcher, 3 recipes as saved parses, 4 the week to the
> list, 5 pantry from evidence, 6 recipe from a URL; v2.01 also added meal slots and per-meal servings.)

Samsung Food (the rebuilt Whisk, folded into Samsung in 2023) is the strongest mainstream
product in this category, so it is the right thing to measure against. This note is in three
parts: **what they do that we don't**, **what we do that they can't**, and **a plan** — a
prioritised roadmap plus a monetisation model that fits what this app actually is.

The short version: *Samsung Food is a recipe product that ends in a shopping list. Market List
is a shopping product that has no beginning.* They monetise the inspiration upstream of the
list. We are far better than they are at the twenty minutes that matter — the trip itself —
and have nothing at all upstream. The opportunity is not to out-recipe them. It is to build
the smallest possible bridge from "what are we eating" to "what's in the trolley", and to keep
owning the part they treat as exhaust.

---

## 1. What Samsung Food has

| Area | Samsung Food | Market List v1.80 |
|---|---|---|
| Recipe corpus | ~240,000 recipes, ~124,000 step-by-step guided | none |
| Save a recipe from the web | Yes — clip from any site | no |
| Meal planner | 7-day grid, breakfast / lunch / dinner / snacks | **shipping now** (v1.82) |
| Recipe → shopping list | One tap, ingredients merged | no |
| Diet filters | 14 diets (keto, vegan, low-carb…) | no |
| Photo → food | Vision AI recognises dishes and ingredients | no |
| Pantry | Yes (paid tier) | partial — restock history knows what you rebuy |
| Nutrition tracking | Yes, syncs to Samsung Health | no |
| Community / creators | Feed, follows, shared plans | no |
| Appliance integration | Family Hub fridge, Bespoke ovens send-to-cook | n/a |
| Grocery e-commerce | Basket handoff in some regions | no |
| Real-time shared list | Weak — a list you can share, not a live one | **live multi-device Firestore sync** |
| Shopping mode | A checklist | **glanceable tiles, cart flow, finish-and-save** |
| Aisle order | Fixed categories | **learned per store, proposed and accepted** |
| Restock prediction | Paid "automated pantry suggestions" | **free, from shared purchase history** |
| Regulars / one-tap re-add | Buried | **first-class, conflict-free across devices** |
| Offline | Needs the network for most things | **fully offline, zero runtime fetches** |
| Personalisation of the UI | None | **themes, tokens, tile geometry, custom shortcut tiles** |
| Account required | Yes | **no — a name and a link** |
| Price | Free tier + Food+ at $6.99/mo or $59.99/yr | free |

## 2. What we are actually better at

These are not consolation prizes — they are the things a weekly shopper touches most.

1. **The trip.** Shopping mode, the flying tile into the cart, "N to buy / N in cart", finish
   and sweep into Regulars. Samsung Food's list is a checkbox column. Ours is designed for a
   phone held in one hand next to a trolley.
2. **The household.** Two people editing the same list at the same time, live, with a
   conflict-free merge behind it. Their sharing is a copy; ours is a shared object.
3. **Learning.** The aisle order per store, the restock history, the regulars. Samsung Food
   charges $59.99/yr for "automated pantry suggestions"; we already do the useful half free,
   from evidence rather than from a form the user has to fill in.
4. **No account.** Fastest cold start in the category — a name and a link. (This is also our
   biggest liability; see §5.)
5. **It is ours.** No corpus licensing, no appliance division, no feed to moderate.

## 3. What to build, in order

Each row says what it buys and roughly what it costs to build.

### Now (this batch)
| # | Change | Why | Cost |
|---|---|---|---|
| 1 | **Plan tab** — this week / next week, per-day entries | The missing reason to open the app between shops. Every Samsung Food session starts here. | shipped v1.82 |
| 2 | **List switcher in the header** | Multiple lists existed but were two taps and a page away; the switcher makes "Shopping / Food / Hardware" a real workflow. | shipped v1.81 |

### Next (the bridge — highest value per line of code)
| # | Change | Why | Cost |
|---|---|---|---|
| 3 | **Recipes as saved parses.** A recipe = a name + ingredient lines. Paste text, use the existing `/api/parse` to turn it into categorised items, save it to a per-list recipe book. | Closes the recipe→plan→list loop without a corpus, a licence, or a scraper. We already own the parser. | small — reuses Smart-add end to end |
| 4 | **"Add the week to the list"** — one action that takes every recipe/food planned in a week and merges the ingredients into the list, deduped, with quantities summed. | This is the single feature that makes planning pay off. It is the moment the app earns its place. | small |
| 5 | **Pantry from evidence.** Turn the restock history into "probably still have it" and grey those items out when planning. | Their paid feature, done better and without data entry. | medium |
| 6 | **Recipe from a URL.** Server-side fetch + parse in `api/`, never in the browser. | The one Samsung Food habit worth copying outright. | medium — needs a fetch/extract endpoint |

### Later (only once §5 is solved)
| # | Change | Why | Cost |
|---|---|---|---|
| 7 | **Receipt import** (photo → items) using a vision model server-side | Makes the history real without anyone ticking boxes. | medium/large |
| 8 | **Basket handoff** to a supermarket (export, then a real API where one exists) | The only rail with meaningful revenue per shop. | large, mostly commercial |
| 9 | **Price memory** — what you last paid, per store | Nobody in this category does it well and everyone wants it. | medium |
| 10 | **Cross-device appearance + plan sync** | Appearance is device-local today; on a second phone the app looks like a stranger. | small |

### Explicitly not doing
- **A recipe corpus.** Licensing, moderation, and search quality are a company, not a feature.
- **Nutrition tracking.** Their moat, a health-claims surface, and a different user.
- **A social feed.** Requires moderation forever, and our user is two people in a kitchen.

## 4. Money

Two principles, and everything else follows.

**The shared list is never paid.** It is the product's soul and its only growth loop — a shared
list is an invitation someone else has to open. Putting a paywall on it would kill the one
channel we have.

**Charge for the things that cost us money, or that only a heavy user wants.** That keeps the
pricing honest and easy to explain.

### Market List+ — proposed
Target **£2.49/month or £19.99/year**. Deliberately about a third of Food+ ($6.99 / $59.99):
we are a tool, not a media library, and the comparison a user makes is with a notes app, not
with a subscription magazine.

| In the free tier, forever | In Market List+ |
|---|---|
| The shared live list, up to 4 people | Households above 4 |
| Shopping mode, cart, finish-and-save | |
| Regulars, restock prediction, learned aisle order | Learned order across *multiple* stores |
| 2 lists | Unlimited lists |
| Smart-add, fair-use daily cap | Uncounted Smart-add (this is a real per-call cost) |
| The current week's plan | Unlimited weeks, unlimited saved recipes |
| Dark mode and the built-in themes | Appearance slots, custom tiles, full theming |
| Offline, always | Export / print / receipt import |

Three notes on that table. The Smart-add cap is the one meter that reflects a real marginal
cost (a Groq call per parse) — meter it visibly and generously. Full theming is already built
and costs nothing to serve, which makes it the highest-margin line on the page. And the free
tier has to stay genuinely useful for a solo weekly shop, or the invitation loop stops.

### Other rails, ranked by fit
1. **One-time "Pro unlock"** (~£24.99) alongside the subscription. A meaningful share of people
   will never rent a grocery list, and the marginal cost of serving them is nearly zero.
2. **Affiliate basket handoff.** Real money per shop, no cost to the user, and it makes the app
   *more* useful. Blocked on retailer APIs, so treat as a later commercial project.
3. **Family/household plan** — one price, everyone on the list. Fits how the app is actually used.
4. **White-label** for a small grocer or meal-kit brand. Real revenue, big distraction.
5. **Sponsored regulars** — a brand paying to appear in your one-tap suggestions. *Recommended
   against*: it corrupts the one screen the user trusts to be theirs.
6. **Selling purchase data** — no. Not anonymised, not aggregated, not "for research". The whole
   promise is that this is the household's private list, and there is no version of this that
   survives being discovered.

### What has to be true first
Costs to keep an eye on as usage grows: Firestore reads (the app holds a live subscription per
open list), Groq calls per Smart-add, and Vercel bandwidth. At household scale these are pennies;
the first two grow with active devices rather than with users, so measure per-device, not per-account.

## 5. The blocker nobody has named yet

**There are no accounts.** A list is a code in a URL. That is the best onboarding in the
category, and it makes three things impossible:

- **Billing.** You cannot sell a subscription to an anonymous browser and have it follow the
  user to their next phone.
- **Recovery.** Lose the link, lose the list. Fine for a free tool; indefensible the moment
  someone has paid.
- **Cross-device identity.** Appearance, plan, and slots are device-local because there is
  nowhere to hang them.

So the prerequisite for *any* of §4 is a light identity layer — an optional sign-in that claims
the lists this device already has, keeps the link-sharing flow exactly as it is, and never
becomes a wall in front of a first-time user. It is the least glamorous item in this document
and the one that gates everything else.

A second structural note: `index.html` is a 6,200-line single file. It has held up remarkably
well, but a recipe book, a planner, and a pantry will not fit in it comfortably. Somewhere
around item 6 it needs to become modules — before, not during, the feature that breaks it.

## 6. Recommended sequence

1. **v1.81–1.82** — list switcher, Plan tab *(done)*
2. **v1.83** — recipes as saved parses, added to a planned day
3. **v1.84** — "add the week to the list", deduped and summed
4. **v1.85** — pantry from restock evidence
5. **then** — identity layer, and only then anything with a price on it

## 7. App review — 11 October 2026 (v2.14)

Method: every main screen driven in headless Chromium at iPhone size (390×844) with a realistic household
list (40 items, 30 regulars, two lists), plus three measurements — opening with no connection, the time one
tap takes to redraw a list, and an automated accessibility scan (axe-core 4.10). Measured on a desktop-class
CPU, not on an iPhone; the 4× slow-down figures stand in for an older phone.

**The verdict.** The app looks finished and is fast enough today. What it lacks is a safety net — it
cannot open without signal, it cannot restore a backup, and it cannot tell you when it breaks on someone's
phone — and a guided path for anyone who is not the person who built it: Settings has outgrown one page,
and several features wait at the bottom of it rather than at the moment they are useful.

### Fix first — trust (each small)
| # | Change | Evidence and why | Cost |
|---|---|---|---|
| R1 | **Open without signal.** A service worker that caches the app, its fonts and icons and the Firebase SDK — never `/api/*`. | Reloading with no connection fails outright (`ERR_INTERNET_DISCONNECTED`); there is no service worker. Supermarkets are where signal drops, and iOS often closes a backgrounded app. The ledger's "fully offline" is only true while the app stays open. It is also the base for notifications (R18). | Small–medium |
| R2 | **The app reports its own crashes.** `window.onerror` and unhandled rejections go to `/api/feedback` as kind "crash" — version, page, first stack line, at most 3 a day per phone, never the list. | Today a broken phone is invisible until someone mentions it. The endpoint already exists (v2.13). | Small |
| R3 | **Backups you can restore.** "Restore from an export", plus an automatic weekly snapshot of the list. | Export exists (v2.02); import does not, so an export cannot bring anything back. Undo covers one action, not a bad afternoon. | Small–medium |
| R4 | **Install guidance, and ask the browser to keep data.** On iPhone Safari (not installed), a one-time card with the three Add-to-Home-Screen steps; `navigator.storage.persist()`. | Safari can clear a website's stored data after about 7 days without use; installed home-screen apps are exempt. Stored per phone today: your name on the list, appearance, history and the learned aisle order. (Apple's rule as of iOS 17 — not re-checkable from here.) | Small |
| R5 | **The tests run on every pull request.** GitHub Actions running the syntax gate, the api suites and the browser suites in Chromium. | 41 suites exist (37 in the browser, 4 for the server functions), but they only run when Claude runs them. | Small |

### Quick wins — UI and UX
| # | Change | Evidence and why | Cost |
|---|---|---|---|
| R6 | **Readable greys.** `--muted` to about `#746E5F`; a darker text shade for category-coloured amounts. | axe: 30 failures on Shop, 17 on Plan, 37 in Settings. Counts ("0/8"), dates and "Nothing planned" are 2.4:1 against the page, section names 2.7:1, and yellow fruit amounts 2.9:1 on their tiles; WCAG AA asks 4.5:1. The look stays; the small text becomes legible in a bright store. | Small |
| R7 | **Faster taps.** Do the per-row tile stretching in CSS (grid rows already stretch to their tallest tile) and measure the usual tile height once per layout change, not on every tap. | One redraw: 27–41 ms for a list your size (60 items, 95 regulars). On a 4× slower CPU: 100–135 ms with 40 items, 275–525 ms with 150 items and 120 regulars. Over half is `equalizeTiles` (v2.10–v2.11) re-measuring every tile; building the tiles takes under 2 ms. About twice as fast on older phones. | Small |
| R8 | **Label the add bar.** "Add items…" inside the floating bar. | The empty list says "Tap **Add** below", but the bar shows only "+". | Tiny |
| R9 | **The receipt at the till.** After "Save to Regulars": "Got the receipt? Snap it and the app remembers the prices." | Receipt reading lives at the bottom of Settings › Prices — the one place nobody is when the receipt is in their hand. | Small |
| R10 | **A running total while shopping.** "4 in cart · about $38", from price memory. | The prices are already stored (v2.09); this makes reading receipts pay off on the next trip. | Small |
| R11 | **Keep the screen on while shopping** (Screen Wake Lock), on while the cart has items. | The phone dims and locks mid-aisle. Supported in recent iOS — check on the phone. | Tiny |
| R12 | **Settings in two layers, with search.** Everyday settings first (theme, text size, tiles, store and sort, Smart add, plan, predictions, people, sharing); "Customise the look" as its own page for the 19 colour rows, bars, slots and margins. | With everything open: 16 sections, 483 buttons, about seven screens. Built row by row at the household's request, and worth keeping — but a new member has to scroll past about 300 colour buttons to find "Share link". | Medium |
| R13 | **Structure for VoiceOver.** A `main` landmark and real headings (list name, categories). | axe flags both on every page: a screen-reader user cannot jump between categories. Pinch-zoom is off (`user-scalable=no`); Text size covers most of it. | Small |
| R14 | **Plan says what it is for.** Empty week: one line ("Plan dinners and add all their ingredients to the list in one tap") and a button. | A new week is seven rows of "Nothing planned". The 2026-07 review found the same problem with the old Plan page. | Tiny |
| R15 | **Share the learned aisle order.** Keep it in the list, per store, like restock history. | It is learned per phone today ("Learned shop order is per-device"), so the second shopper starts from nothing. | Small |

### Bigger features (ranked by value to a household)
| # | Change | Why | Cost |
|---|---|---|---|
| R16 | **Notes and a photo on an item** — "the green bottle", "no-name is fine". | "Which one?" is the most common message between two people shopping. Notes are cheap; photos need storage (Firebase Storage, or small thumbnails inside the 1 MB list document). | Small (notes) · medium (photos) |
| R17 | **Where to buy it.** Tag an item with a store; at a store the list shows what is for there and folds the rest under "Elsewhere". | This household's list mixes supermarket and Asian-grocer items (kangkung, galangal, taugeh). | Medium |
| R18 | **Notifications** (needs R1): "Sam added 3 things", "Olive is at Coles — anything else?", the restock reminder on your day. | iOS home-screen web apps can receive push since iOS 16.4. Needs a small server piece to send. | Medium |
| R19 | **Who is shopping now.** When someone starts ticking at a store, the others see "Olive is at Coles". Opt-in, the store name only. | Stops double-buying, and gives the people at home a window to add the last things. | Small–medium |
| R20 | **What we spend.** Monthly spend by category and by store, from the receipts already read. | The data exists. A free summary; trends and alerts fit Market List+. | Medium |
| R21 | **Lists for occasions.** Save a list as a template — "BBQ", "Camping", "Christmas" — and drop it into the current one. | Saved weeks already do this for the plan. | Small |
| R22 | **Siri.** "Add milk to Market List" through an iOS Shortcut calling a small endpoint that writes to the list. | Hands-free capture at the fridge. Needs a Firebase service account on the server, so it waits on R25's security work. | Medium |

### Long term — the calls to make
- **R23 Modules before features.** `index.html` is 8,638 lines now (6,200 when this report was written). Plain ES modules keep the no-build, offline approach. Already item 1 on the published plan.
- **R24 PWA or App Store — decide before charging.** A native shell (Capacitor or similar) brings widgets, Siri, reliable push, "you're near Coles" reminders and store discovery; it costs app review and 15–30% of subscriptions sold in the app. Recommendation: stay a PWA until identity and one paid feature (the 10% shop) prove people will pay, then wrap it.
- **R25 Security before strangers.** Fine for one household, not for a public product: list codes are 8 characters, 7 of them from `Math.random()`; the 4-person limit is checked in the app's own code; and the Firestore rules that would enforce anything live only in the Firebase console, where nobody can review or test them. Use 128-bit codes from `crypto.getRandomValues` for new lists, and keep the rules in the repo with emulator tests.
- **R26 A privacy page and "delete my data".** Needed for an app store, and for trust once prices are shared between households.

**Suggested order:** R1, R2 and R5 together (the safety net) → R6–R8 and R11 (one polish batch) →
R9–R10 (receipts pay off) → R12 (Settings) → then the published plan: modules, the 10% shop, identity.

Sources: [Samsung Food](https://samsungfood.com/), [Food+](https://samsungfood.com/food-plus/),
[what Food+ includes](https://support.samsungfood.com/hc/en-us/articles/32709269852052-What-s-Included-in-Your-Samsung-Food-Subscription),
[Samsung US](https://www.samsung.com/us/home-appliances/samsung-food/),
[Plan to Eat review](https://www.plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons/).
