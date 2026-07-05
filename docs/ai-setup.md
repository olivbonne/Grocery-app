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

## Model

Uses **`llama-3.1-8b-instant`** on Groq — the cheapest, fastest option, and
plenty for grocery parsing. To raise accuracy on messy/ambiguous input, change
`MODEL` in `api/parse.js` to `llama-3.3-70b-versatile` (still cheap, a bit
slower). Groq JSON mode (`response_format: json_object`) guarantees valid JSON.

## Client wiring — "✨ Smart add"

Wired into the app: in planning mode, the **✨** button sends the add-box text to
`POST /api/parse` and shows the returned items as **editable chips for preview**
before anything is committed. Nothing is added silently — the user reviews and
confirms first. If the key isn't set (or the call fails), Smart-add says so and
plain typing keeps working.
