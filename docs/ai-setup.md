# AI setup — a server-side model key

Market List can call an LLM to turn free-form text ("2 milk, dozen eggs, stuff
for tacos") into structured grocery items. The API key stays on the server so it
is never exposed in the browser.

## Pick a provider

Either key works, and you only need one. **Gemini** (Google AI Studio) or **Groq** —
both speak the OpenAI-compatible chat-completions API, so the app talks to them through
the same code path and only the URL, the key and the model name differ. If **both** keys
are set, Gemini is used: a key someone went and created is the one they meant to use.

With neither key set the AI features answer `500 not_configured` and the app falls back
gracefully — plain typing still adds items, and the app names the variable to add.

### Gemini (Google AI Studio)

1. Get a key at **https://aistudio.google.com** → **API keys** → Create key.
2. Vercel dashboard → the Market List project → **Settings → Environment
   Variables**.
3. Add a variable named `GEMINI_API_KEY` with your key as the value. Apply it to the
   Production (and Preview, if you want) environments.
4. **Redeploy.** Environment variables are baked in at deploy time — an existing
   deployment will not pick up the new value until you redeploy.

The model name is a setting too:

```
GEMINI_MODEL = <a model your Google AI Studio account lists>
```

Unset, the default `gemini-3.5-flash-lite` is used. Flash-Lite is the default rather than the
newest Flash for two reasons: **free-tier headroom** — 500 requests a day against 20 — and it is
**multimodal**, so the photo path reads a photo with the same model. A grocery list parsed a few
times an evening never comes near the former limit and runs out of the latter. Point `GEMINI_MODEL`
at a larger model if you want the accuracy instead. The current line-up is at
**ai.google.dev/gemini-api/docs/models**.

Gemini is natively multimodal: **the same model reads a photo**, so there is no separate
vision model on this path and `GROQ_VISION_MODEL` is not needed. That also means a photo
failure here is a model or an image problem, never a missing vision setting.

### Groq

1. Get a key at **https://console.groq.com** → **API Keys** → Create Key.
2. Vercel dashboard → the Market List project → **Settings → Environment
   Variables**.
3. Add a variable named `GROQ_API_KEY` with your Groq key as the value.
   Apply it to the Production (and Preview, if you want) environments.
4. **Redeploy.** Environment variables are baked in at deploy time — an existing
   deployment will not pick up the new value until you redeploy (merge a PR, or
   use "Redeploy" on the latest deployment).

Groq has a generous free tier that easily covers a household. Its text model is
`GROQ_MODEL` and its vision model is `GROQ_VISION_MODEL` — both described below.

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

**The text model is a setting on both providers, because providers retire models on their own
schedule** — Groq shut `llama-3.1-8b-instant` down for free and developer tiers on 16 August 2026,
and every AI feature in the app (smart add, recipe reading, recipe suggestions) went down with it
while the name was still compiled in. So all three endpoints read it from the environment:

```
GROQ_MODEL   = <a model your Groq account lists>
GEMINI_MODEL = <a model your Google AI Studio account lists>
```

Set it in the same place as the key (Vercel → Settings → Environment Variables), then redeploy.
Unset, the defaults are `openai/gpt-oss-20b` on Groq and `gemini-3.5-flash-lite` on Gemini — both
support JSON object mode, which these endpoints rely on. The current line-ups are at
**console.groq.com/docs/models** and **ai.google.dev/gemini-api/docs/models**. When the model in
use is gone the endpoints answer with the code `model` and the app says *the recipe model is no
longer available — set GEMINI_MODEL (or GROQ_MODEL) in Vercel*, so a retirement points straight at
the knob that fixes it instead of reading as a generic failure. (The upstream status and body are
logged server-side only; they are never returned to the browser.)

**An overloaded model is waited out before the app gives up.** A `503` / `UNAVAILABLE` ("this model
is currently experiencing high demand") is not a failure of your input, it is a queue — so the call
is retried with backoff (about 0.7s, then 2.2s) and only then reported, as the code `busy`. A `429`
or a body naming `RESOURCE_EXHAUSTED` is the day's free allowance instead: it is reported as `quota`
and is *not* retried, because that one does not clear in two seconds. The app says which:
*"the model is busy — give it a moment"* against *"today's free quota is used up; it resets
tomorrow"*.

**The functions may run for up to 60 seconds** (`maxDuration` in `vercel.json`). It was 15, and a
photo genuinely needs longer — a real photo import came back as `504 Task timed out after 15
seconds`. Retries are budgeted against this, so a retry is never started that the function has no
time left to finish.

Every path that answers `502` logs why first. A 502 with nothing in the log is what turned a
one-line fix into three weeks of a broken app.

**On Groq the photo path needs a separate vision model, and Groq's image-capable line-up changes** — Llama 4
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
without it. On Gemini this variable does no work at all: the same model reads the photo, so the
`vision_model` code is never returned there.

## Searching for a recipe

`/api/recipe-search` takes `{ q }` and answers `{ source, results }`. It has two sources and it always
says which one you got:

| `source` | when | what a result carries |
|---|---|---|
| `web`   | `SEARCH_API_KEY` is set | a real page: `title`, `url`, `site`, `note` |
| `model` | it is not | the recipe reader's own suggestions: `title`, `note`, no `url` |

The app shows that distinction to the user rather than passing suggestions off as search results. Picking
a web result sends its `url` to `/api/recipe`; picking a suggestion sends `{ dish }` instead, and the
model writes that dish out.

**To enable real web search**, set

```
SEARCH_API_KEY = <a Brave Search API key>
```

alongside the model key (Vercel → Settings → Environment Variables), then redeploy. Brave has a free
tier; the endpoint asks for the top 8 results and appends "recipe" to the query. The key is sent as the
`X-Subscription-Token` header, never in a URL. Without it the search still works — it just answers from
the model, and says so.

URLs a search hands back are checked with the same host guard as `/api/recipe`, because the app feeds
them straight back to that endpoint to be fetched: a search engine is free to return a link pointing
inside this network, and it is dropped here before the app ever sees it.

## Why the key stays server-side

The serverless functions read `process.env.GEMINI_API_KEY` / `process.env.GROQ_API_KEY`
and call the provider from the server. The key is never sent to the browser, never logged,
and never embedded in any static asset. `index.html` is a static file served to every
browser: no key may ever appear there.

This is deliberately different from the **Firebase web config** in `index.html`,
which is *meant* to be public — Firebase client config identifies the project and
is protected by Firestore security rules, not by secrecy. A provider key is a
real secret: anyone who has it can spend money against your account, so it must
never ship to the client. Never move a provider call into `index.html`.

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
| 500    | `{ "error": "Server not configured" }` | neither `GEMINI_API_KEY` nor `GROQ_API_KEY` is set |
| 502    | `{ "error": "Parse failed", "code": "busy" }` | The model is overloaded (`503`/UNAVAILABLE) — retried with backoff first |
| 502    | `{ "error": "Parse failed", "code": "quota" }` | The day's free allowance for that model is spent (`429`/RESOURCE_EXHAUSTED) |
| 502    | `{ "error": "Parse failed" }`       | Upstream error or unparseable model reply |

The function validates the model's output server-side: `qty` is coerced to a
positive integer, `category` is forced to one of the allowed values (else
`others`), and `name` is trimmed/length-capped.

## Recipe endpoint — folded into ✨ Smart add

A second function, `api/recipe.js`, extracts a shopping list from pasted recipe
text using the same server-side provider key.

```
POST /api/recipe
Request body:   { "text": "Pancakes\n200g flour\n2 eggs\n300ml milk\n..." }
Response body:  { "title": "Pancakes", "servings": 4,
                  "items": [ { "name": "flour", "qty": 1, "weight": "200g", "category": "bulk" }, ... ] }
```

Same key, same guardrails as `/api/parse` (405/400/500/502, output validated
server-side). In the app the ingredients land in the **Smart-add preview**, where
you can scale by servings, edit any item, and see which are already on your list
before adding. Until a provider key is set it returns `500` and the sheet says so.

**One entry point (v0.77).** There is no separate "Add from a recipe" button.
The **✨ Smart add** button reads the add-box text and, when it *looks like a
recipe* (a `Serves N` line, cooking verbs/steps, or measurements like
`tbsp`/`°`/`minutes` across several lines), routes to `/api/recipe` and shows the
servings scaler; otherwise it uses `/api/parse` for a plain list. Both share the
same editable preview.

## Model

Whichever provider is in use, the default is a small, fast model — plenty for grocery
parsing (`gemini-3.5-flash-lite` on Gemini, `openai/gpt-oss-20b` on Groq). To raise accuracy on messy or ambiguous input, set `GEMINI_MODEL` / `GROQ_MODEL`
to a larger model your account lists; it is a Vercel setting, not a code change. JSON mode
(`response_format: json_object`) is asked for on every call, and a fenced or wrapped answer
is still read, because a compatibility layer is free to ignore the request.

## Client wiring — "✨ Smart add"

Wired into the app: in planning mode, the **✨** button sends the add-box text to
`POST /api/parse` (or `POST /api/recipe` when the text looks like a recipe — see
above) and shows the returned items as **editable chips for preview** before
anything is committed. Each chip expands to edit **Quantity → Weight → Category →
Subcategory**. Nothing is added silently — the user reviews and confirms first. If
the key isn't set (or the call fails), Smart-add says so and plain typing keeps
working.
