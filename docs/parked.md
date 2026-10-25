# Parked — ideas the household has asked to come back to

Not scheduled. Each keeps the household's own words, so it can be picked up without asking again.

## Tiles, rationalised (October 2026, the household's item 8)
"The tile display needs to be rationalised. A single line needs to be organised differently to fit an item on 2 lines,
not 4. Test with and without the icon: with the icon, the big and small tiles look very similar — only the text is bold
in the large tile."
- Start from: `syncTileH` and the tile CSS in `app.css` (CLAUDE.md, "Never measure every tile on a render").
- First step when picked up: screenshots of every size × icon on/off × 1–4 columns, side by side, then one proposal.

## Page areas you can design (October 2026, item 9)
"Under Customise the look, the page margin should be one setting for every page (Plan, Shop, Settings). And tiles on
each page — an area of information with its own settings: image and text yes/no, position (top, middle, bottom),
justification (left, middle, right), tile position…" — "maybe an idea for another app, to build apps."
- The page margin as one global setting is small and could ship on its own.
- The information areas are a page builder; worth a separate design note before any code.

## A screen editor (October 2026, v2.73 batch, item 4)
"Create an editor where I can place things on the screen from the start, defining each level individually; another way
would be to show the user the current grid, how things are organised, and allow them to rearrange, defining the number of
columns, spacing etc. as needed — for every screen or sheet."
- v2.74 built the first step for sheets: Customise the look › Sheets › Layout (rows and choices in 1–6 columns or variable,
  row names, row gap). The editor generalises it: a page shown as its grid, dragged into place. Same family as "Page areas".

## Prices across Coles, Woolworths and ALDI (October 2026, item 6)
"Look into WiseList: it shows Coles and Woolies and price comparison for every item in their catalogue … a scanner for
barcodes … the cheapest shopping across the 3 shops, vs a combination of 2 shops, or each shop individually. We are getting
prices from receipts but there may be a better way to import all the shop data."
- The household's research: `docs/research/2026-10-price-data-wiselist.pdf`. Its recommendation (option B): pin the
  products the household buys (Woolworths, Coles and ALDI ids, barcode), fetch them weekly on Wednesday through a paid
  scraping service (Apify, about $1–5 a month), write them to the database; hotprices.org history as a supplement (ask its
  maintainer); receipts and shelf prices stay the fallback. Household-only: the risk rises sharply if the app goes public
  or commercial (licensed data and legal advice then).
- The household's additions: a barcode scan looks the product up in that price data; a photo of the fridge — the AI
  recognising the products (barcodes are rarely readable in such a photo; a native app's live scanner could read several).
- Waiting on the owner (25 Oct 2026): an Apify account (its key in Vercel), how products are pinned (pasted links and/or
  an AI-proposed match), the hotprices.org permission email, the fridge-photo approach. Built after the S8 step 3
  database move, since the price records live there.
