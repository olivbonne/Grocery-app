# Categories — a proposal (October 2026, for after v2.31)

The household asked (item 18): "land on the best set of categories so that the number is manageable, each keeps its
own colour, and they match the shopping experience — the order things are organised in the shop — for a wide range
of users". This is a proposal to decide on, not a change. Nothing below is built yet.

## What is there now
Nine standard categories, each with a colour and a drawn mark: **Meat, Fruit, Vegetable, Fresh, Bulk, Health, Asian,
Alcohol, Others**. They were made for this household's Coles-plus-Asian-grocer shop, and they show it:

- **"Fresh" and "Bulk" are not how a shop is laid out.** Fresh mixes the fridge (milk, cheese) with bakery (bread);
  Bulk mixes pantry (pasta, tins) with household (toilet paper, bin bags). Neither tells you which end of the shop to walk to.
- **"Others" collects too much.** The household's own list shows it: drinks, snacks, popcorn, kombucha and frozen
  raspberries all landed there.
- **Since v2.27 the ORDER no longer depends on the categories.** Every item has a detailed aisle type (25 of them —
  "Pasta, rice & grains", "Snacks & confectionery"…) and a shop can have its own aisle map. So categories can be chosen
  for what they are best at: a glanceable colour and a sensible heading, not a walk order.

## What others do
I could not get the other list apps' exact default lists from here: the searches turned up app-store pages, not their
category names, and their help pages are not reachable from this environment. What is clear:
- Australian supermarkets present the same broad departments online and on the floor. A consumer review of Coles
  Online lists fruit, vegetables, dairy, meat, seafood, pantry, bakery, liquor, frozen, pet, health, household and baby;
  a company profile describes the store as bakery, fruit and veg, meat and seafood, deli, dairy and eggs, pantry, frozen.
- Bring! groups items automatically and lets the categories be reordered to match a store's aisles — the same idea as
  the app's aisle map.
- General-purpose list apps settle on roughly 10–15 categories: fewer and a heading means nothing ("Others"), more and
  the colours stop being tellable apart at a glance (about a dozen distinct hues is the practical limit on a phone).

Sources: [Choice — Coles Online review](https://www.choice.com.au/products/shopping/everyday-shopping/supermarkets/coles-online),
[Plunkett Research — Coles Group](https://www.plunkettresearch.com/?p=1874884),
[Bring! on the App Store](https://apps.apple.com/us/app/-/id580669177).

## Proposal: twelve, in the order most Australian supermarkets are walked

| # | Category | Colour family | What goes there | Today's category |
|---|---|---|---|---|
| 1 | Fruit & veg | green | all produce, herbs, salad | Fruit + Vegetable (merged, or kept as two — see below) |
| 2 | Bakery | wheat brown | bread, rolls, wraps, cakes | part of Fresh |
| 3 | Meat & seafood | red | meat, poultry, fish | Meat |
| 4 | Deli | coral | ham, salami, olives, dips, cheese counter | part of Fresh |
| 5 | Dairy, eggs & fridge | blue | milk, yoghurt, cheese, butter, eggs, tofu, fresh pasta | most of Fresh |
| 6 | Pantry | purple | pasta, rice, tins, sauces, oils, spices, baking, spreads, cereal | most of Bulk |
| 7 | Snacks & drinks | amber | chips, biscuits, chocolate, soft drinks, water, juice, coffee, tea | most of Others |
| 8 | Frozen | ice teal | frozen veg, ice cream, frozen meals, ice | scattered today |
| 9 | Asian & international | pink | the Asian grocer's things, other cuisines | Asian |
| 10 | Health & beauty | sea green | medicine, vitamins, toiletries, personal care | Health |
| 11 | Household | slate grey | cleaning, laundry, paper, foil, bin bags, batteries, pet, baby | part of Bulk + Others |
| 12 | Liquor | brown | beer, wine, spirits | Alcohol |

Why this set:
- **Every heading is a place in the shop.** You can tell from the heading which end of the store to go to, before any
  aisle map exists.
- **Twelve keeps every colour distinct**, and each keeps a drawn mark (three new marks: bakery, deli, frozen).
- **"Others" goes away as a default** (it stays as a fallback for anything unknown, but the dictionary sends nearly
  everything somewhere real — the v2.27 aisle types already know where).
- **Baby and pet go in Household** rather than having their own colour: most households buy little of either, and
  a household that buys a lot can add its own category, as today.

**Fruit and veg — one or two?** Supermarkets keep them in one area; this household's list keeps them apart, and the
two colours read well. Recommendation: keep them as two by default (13 categories), since they are the biggest group on
most lists and splitting them costs nothing in the shop.

## Moving existing lists
- Nothing is re-categorised silently. A one-time card offers "Sort your list into the new categories": it shows the
  moves ("12 things from Fresh to Dairy, eggs & fridge; 4 to Bakery…") and applies them with Undo.
- Custom categories a household made are kept as they are.
- Regulars move with the same card. History, prices and spending keep their old category ids, which `catShown` already
  maps to Others when a category is gone — the card can map old ids to new ones instead.

## Open questions for the owner
1. Twelve or thirteen (fruit and veg together, or apart)?
2. Happy with baby and pet inside Household?
3. Should new lists start with the new set, and existing lists only switch when someone taps the card?
