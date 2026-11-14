# Shelf prices from Coles, Woolworths and ALDI (the price feed) — plan, November 2026

The household asked for it (14 Nov 2026) on the basis of the October research
(`docs/research/2026-10-price-data-wiselist.pdf`, option B): pin the products the household buys, fetch their prices once a
week through a paid scraping service (Apify), keep them with the list's other prices. Receipts and shelf prices stay as they
are; the feed is one more source.

**Household use only.** The supermarkets' terms do not allow scraping. The research's judgement: low risk for one household
reading a few dozen products a week through a third-party service; the risk rises sharply if the app goes public or
commercial (then licensed data and legal advice). This is said again in the app's privacy page.

## What could not be checked from here
The development environment cannot reach Apify (its API is blocked here), so the actors' names, their inputs and the shape of
what they return are NOT verified. Everything that depends on them is a setting the owner can change without a new version:
`APIFY_ACTOR_COLES`, `APIFY_ACTOR_WOOLWORTHS`, `APIFY_ACTOR_ALDI` (the actor ids) and `APIFY_INPUT_COLES` etc. (the input, as
JSON with `{q}` for a search word and `{ids}` for product ids). The server reads the output tolerantly (name / title /
productName; price / currentPrice / price.now; id / productId / stockcode / sku; size / packageSize) and says which field it
could not find, by error code, in the server-failure issues (v3.11).

## How it works
1. **Pin a product** — Edit item › More › *Shelf prices*: the app asks the server to search each chain for the item's name
   (`/api/prices`, `mode:"search"`), shows up to 8 products per chain (name, size, price), and the person picks one per chain
   (or none). The picks are kept on the list (`feedPins`: item name → `{ coles, woolworths, aldi }` with the product id, name
   and size), so the whole household shares them.
2. **Weekly refresh** — when someone opens the app and the list's feed is more than 7 days old, the app asks the server for
   the pinned products' prices (`mode:"refresh"`, at most 60 products a call). The prices land in the list's prices like a
   receipt's, marked as coming from the feed ("Coles online", the date), so Which store is cheaper, the price under an item
   and the 10% shop use them with no other change. One phone does it; the list records when (`feedAt`).
3. **Cost** — the research's figures (about $1.50 per 1,000 products) put 50 pinned products × 3 chains × 4 weeks at about
   $1 a month. The server's daily limit (lib/guard.js) counts these calls too.
4. **No admin key** — the server never writes the database itself; it returns prices and the phone writes them, as it does
   for receipts. So no Firebase service-account key is needed (simpler and safer than the research's sketch).

## What the owner does (when the code is in)
1. Create an Apify account; choose one actor per chain (the research names rel8ble's and clearpath's Coles actors and
   parsebird's ALDI actor; for Woolworths, search the Apify store); note each actor's id and what input it takes.
2. In Vercel › Settings › Environment Variables: `APIFY_TOKEN` (secret), the three `APIFY_ACTOR_*` and, if an actor needs a
   different input than the default, `APIFY_INPUT_*`. Redeploy.
3. Publish the Firestore rules (the daily count gains `prices`), to both projects, live first.
4. Pin a few products and check the next day that their prices show.
