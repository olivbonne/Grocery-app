# AI setup — server-side Groq key

Market List can call an LLM to turn free-form text ("2 milk, dozen eggs, stuff
for tacos") into structured grocery items. The API key stays on the server so it
is never exposed in the browser.

The backend uses **Groq** running **`llama-3.1-8b-instant`** — an open-weights
model that is very cheap and fast (Groq has a generous free tier that easily
covers a household). Groq's API is OpenAI-compatible.

## Setting `GROQ_API_KEY` in Vercel

1. Get a key at **https://console.groq.com** → **API Keys** → Create Key.
2. Vercel dashboard → the Market List project → **Settings → Environment
   Variables**.
3. Add a variable named `GROQ_API_KEY` with your Groq key as the value.
   Apply it to the Production (and Preview, if you want) environments.
4. **Redeploy.** Environment variables are baked in at deploy time — an existing
   deployment will not pick up the new value until you redeploy (merge a PR, or
   use "Redeploy" on the latest deployment).

Until the key is set, `/api/parse` returns `500 Server not configured` and the
app's Smart-add falls back gracefully (plain typing still adds items).

## Reading a recipe from a link or a photo

`/api/recipe` takes any one of three things:

| body | what happens |
|---|---|
| `{ text }` | pasted recipe text is parsed straight away |
| `{ url }`  | the page is fetched **on the server**, reduced to text, then parsed |
| `{ image }`| a data: URL of a photo is sent to a vision model |

**The link path fetches a URL the user typed**, which is a request only the server can
make — so it is fenced in: `http`/`https` only, no loopback, private, link-local or
`.local`/`.internal` hosts, every redirect hop re-checked (a public host is free to redirect
inward), an 8s timeout, a 1.5MB read cap, and HTML/plain-text content types only. Where a page
carries schema.org `Recipe` JSON-LD — most recipe sites do — the ingredient list is taken from
that rather than from the prose, which is both cheaper and more accurate.

**The photo path needs a vision model, and Groq's image-capable line-up changes** — Llama 4
Scout was deprecated for free and developer tiers in June 2026. So the model name is an
environment variable:

```
GROQ_VISION_MODEL = <a model your Groq account lists as image-capable>
```

Set it in the same place as `GROQ_API_KEY` (Vercel → Settings → Environment Variables), then
redeploy. Pick the name from **console.groq.com → Models**, filtering for image input. If it is
unset the default is tried, and when that model is not available to your account the endpoint
answers with the code `vision_model` and the app says photo reading is not set up — rather than
a generic failure that sends you looking in the wrong place. The link and paste paths work
without it.

## Why the key stays server-side

The serverless function `api/parse.js` reads `process.env.GROQ_API_KEY` and
calls Groq from the server. The key is never sent to the browser, never logged,
and never embedded in any static asset.

This is deliberately different from the **Firebase web config** in `index.html`,
which is *meant* to be public — Firebase client config identifies the project and
is protected by Firestore security rules, not by secrecy. The Anthropic key is a
real secret: anyone who has it can spend money against your account, so it must
never ship to the client. Never move Claude calls into `index.html`.

## Endpoint contract

```
POST /api/parse
Request body:   { "text": "2 milk, dozen eggs, stuff for tacos" }
Response body:  { "items": [ { "name": "milk", "qty": 2, "category": "fresh" }, ... ] }
```

- `text` is required, non-empty, and capped at ~2000 characters.
- Each item has `name` (string), `qty` (integer, default 1), and `category`, one
  of: `meat`, `vegetable`, `fruit`, `fresh`, `bulk`, `asian`, `alcohol`,
  `health`, `others`.

Error responses (all JSON, never leaking the key or upstream details):

| Status | Body                              | When                                    |
|--------|-----------------------------------|-----------------------------------------|
| 405    | `{ "error": "Method not allowed" }` | Non-POST request                        |
| 400    | `{ "error": "Missing text" }` etc.  | Empty / oversized / malformed input     |
| 500    | `{ "error": "Server not configured" }` | `GROQ_API_KEY` missing                |
| 502    | `{ "error": "Parse failed" }`       | Upstream error or unparseable model reply |

The function validates the model's output server-side: `qty` is coerced to a
positive integer, `category` is forced to one of the allowed values (else
`others`), and `name` is trimmed/length-capped.

## Recipe endpoint — folded into ✨ Smart add

A second function, `api/recipe.js`, extracts a shopping list from pasted recipe
text using the same server-side Groq key.

```
POST /api/recipe
Request body:   { "text": "Pancakes\n200g flour\n2 eggs\n300ml milk\n..." }
Response body:  { "title": "Pancakes", "servings": 4,
                  "items": [ { "name": "flour", "qty": 1, "weight": "200g", "category": "bulk" }, ... ] }
```

Same key, same guardrails as `/api/parse` (405/400/500/502, output validated
server-side). In the app the ingredients land in the **Smart-add preview**, where
you can scale by servings, edit any item, and see which are already on your list
before adding. Until `GROQ_API_KEY` is set it returns `500` and the sheet says so.

**One entry point (v0.77).** There is no separate "Add from a recipe" button.
The **✨ Smart add** button reads the add-box text and, when it *looks like a
recipe* (a `Serves N` line, cooking verbs/steps, or measurements like
`tbsp`/`°`/`minutes` across several lines), routes to `/api/recipe` and shows the
servings scaler; otherwise it uses `/api/parse` for a plain list. Both share the
same editable preview.

## Model

Uses **`llama-3.1-8b-instant`** on Groq — the cheapest, fastest option, and
plenty for grocery parsing. To raise accuracy on messy/ambiguous input, change
`MODEL` in `api/parse.js` to `llama-3.3-70b-versatile` (still cheap, a bit
slower). Groq JSON mode (`response_format: json_object`) guarantees valid JSON.

## Client wiring — "✨ Smart add"

Wired into the app: in planning mode, the **✨** button sends the add-box text to
`POST /api/parse` (or `POST /api/recipe` when the text looks like a recipe — see
above) and shows the returned items as **editable chips for preview** before
anything is committed. Each chip expands to edit **Quantity → Weight → Category →
Subcategory**. Nothing is added silently — the user reviews and confirms first. If
the key isn't set (or the call fails), Smart-add says so and plain typing keeps
working.
