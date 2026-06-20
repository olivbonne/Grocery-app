# Market List — Changelog

A running logbook of every change to `index.html`, newest first.

The version **number** shown at the bottom of the app (e.g. `v0.30`) corresponds to the
entries below. The number is paired in the app with the file's automatic
**last-modified date/time** (shown on hover / in the element's title), so each deployed
build is traceable to both a number here and the moment the file was last saved.

Convention: bump the number by `0.01` for each batch of changes, add a dated row here.

| Version | Date | Changes |
|--------|------------|---------|
| v0.30 | 2026-06-20 | Edit-item: name + weight + quantity now on one line at equal height. Version footer now shows a version **number** (linked to the auto last-modified date via tooltip). Added this changelog. Edit-category icon picker reworked: relevant pictures/emoji shown in one always-visible row filtered strictly by the category name keyword, current selection pinned to the right, 😀 (position 7) opens the native emoji keyboard for full keyword choice, ⬇ (position 8) uploads from photos/files. |
| v0.29 | 2026-06-20 | Version number tied to automatic file last-modified date. Fixed oversized category clear ✕ (a `.catadd button` CSS rule was resizing it). Moved Collapse/Expand-all onto the first category's row, right-aligned. Category emoji updates live while typing the name. Confirmed sound intact. Added weight rolling selector (blank/100g–900g/1–3kg) in edit-item. |
| v0.28 | 2026-06-19 | Version footer (manual tally) added. Clear ✕ centred vertically in all input boxes. Edit-category emoji ordered by category name with category-colour backgrounds. Added star toggle in edit-item (gold ★, sorts starred to top). |
| v0.27 | 2026-06-19 | Category clear ✕ unified with main; padding so text clears the ✕. Collapse-all aligned to first category. Bulk pills use the purple category line in both themes. Asian bowl shows white in dark theme inside the edit-category sheet. Edit-category icon background uses the category colour (icon box + first cells). Removed “— commas for several” from category placeholders. |
| v0.26 | 2026-06-19 | Icon picker cells share width to fit 8 without scrolling; larger emoji. “Add subcategory” now creates an inline editable row (no popup). Asian bowl regenerated pure white for dark theme. |
| v0.25 | 2026-06-18 | Distinct check vs uncheck sounds. Clear ✕ moved to top-right, consistent across inputs, text padded. Reworked edit-category icon picker (one line, max 8: keyword pictures+emoji, 😀 grid, ⬇ upload), “x of y” above arrows, subcategories on top, smaller editable rows, “Remove”→“Delete”. Reverted the broken full-width-zoom experiment. Health cross given white interior inside the green ring. |
| v0.24 | 2026-06-18 | Collapse/Expand-all control. Dark mode set as default. Firebase config moved to a clearly-marked block at the very top of the file. One-line edit-category header (icon + name + up/down) with position indicator. Subcategory rows with up/down reordering. Picture shown in the icon box for default-picture categories with a long-press picker. Main-list category headings restyled as coloured chips matching the edit-item chips. Input clear (✕) buttons + draft persistence so typing isn’t lost on re-render. Bulk grey-surround treatment (later revised). |
| v0.23 | 2026-06-18 | Star items (gold ★, sort to top). Weight selector in edit-item. |
| v0.22 | 2026-06-17 | Firebase config relocated to top of file; module reads `window.FIREBASE_CONFIG`. Auto version footer (date-based) introduced. App Store / Siri / monetisation guidance delivered (not a code change). |
| v0.21 | 2026-06-17 | New-category sheet with icon picker; centred SVG “+”; doubled “+” size. Mic moved to the left of the input; orange while recording. Input clear ✕ (centred, consistent) and draft persistence first added. |
| v0.20 | 2026-06-17 | Emoji + picture category icons (milk / cross / ramen defaults, hammer preset, dark variants). Dark-mode image variants. PIL image processing: transparency via border-flood, interior-white fill, recolouring, grid splitting, largest-component keep (drop the hammer’s shadow). |
| v0.19 | 2026-06-16 | Create / remove categories and subcategories; inline editable subcategory rows with reordering. |
| v0.18 | 2026-06-16 | Meat / general subcategory grouping; checked items drop to the bottom of their category. |
| v0.17 | 2026-06-16 | Quantity per item (shown “N×”). A–Z sort within categories. |
| v0.16 | 2026-06-16 | Collapse / expand categories and the Buy-again section. |
| v0.15 | 2026-06-15 | Long-press to edit items, categories, and buy-again entries. |
| v0.14 | 2026-06-15 | Pop animation + tick sound on check; sound on/off toggle (off by default). |
| v0.13 | 2026-06-15 | Progress tally + bar in the header. |
| v0.12 | 2026-06-15 | Typing autocomplete suggestions (from buy-again, items, dictionary). |
| v0.11 | 2026-06-14 | Mic + voice capture (Web Speech API; unreliable on iOS Safari — noted). |
| v0.10 | 2026-06-14 | Compact density zoom (+ / −). |
| v0.09 | 2026-06-14 | Smart labelled-paste: multi-line / “Category:” blocks parsed into the right sections. |
| v0.08 | 2026-06-13 | Per-category “+” add boxes; always-visible categories. |
| v0.07 | 2026-06-13 | Buy-again history: cleared items land in a re-add section. |
| v0.06 | 2026-06-13 | Keyword auto-categorisation dictionary. |
| v0.05 | 2026-06-12 | Item pills with category colour accents; tap to check. |
| v0.04 | 2026-06-12 | Default category set (meat, fruit, vegetable, fresh, bulk, health, asian, alcohol, others) with colours. |
| v0.03 | 2026-06-12 | Firebase Firestore live sync across household members (up to 4). |
| v0.02 | 2026-06-11 | Shareable list via `?list=` code; basic add/remove. |
| v0.01 | 2026-06-11 | Initial single-file PWA scaffold (HTML/CSS/JS), manifest, app icons. |

> Dates before v0.22 are approximate (reconstructed from the build history); from v0.22 onward
> the app’s footer also carries the exact file last-modified timestamp for each deployed build.
