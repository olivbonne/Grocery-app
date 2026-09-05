# Market List vs Samsung Food — benchmark, roadmap, and how this could make money

September 2026 · reviewed against Market List **v1.80**

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

Sources: [Samsung Food](https://samsungfood.com/), [Food+](https://samsungfood.com/food-plus/),
[what Food+ includes](https://support.samsungfood.com/hc/en-us/articles/32709269852052-What-s-Included-in-Your-Samsung-Food-Subscription),
[Samsung US](https://www.samsung.com/us/home-appliances/samsung-food/),
[Plan to Eat review](https://www.plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons/).
