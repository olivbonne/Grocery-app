# AI setup — server-side Anthropic key

Market List can call Claude to turn free-form text ("2 milk, dozen eggs, stuff
for tacos") into structured grocery items. The Anthropic API key stays on the
server so it is never exposed in the browser.

## Setting `ANTHROPIC_API_KEY` in Vercel

1. Vercel dashboard → the Market List project → **Settings → Environment
   Variables**.
2. Add a variable named `ANTHROPIC_API_KEY` with your Anthropic key as the value.
   Apply it to the Production (and Preview, if you want) environments.
3. **Redeploy.** Environment variables are baked in at deploy time — an existing
   deployment will not pick up the new value until you redeploy (merge a PR, or
   use "Redeploy" on the latest deployment).

## Why the key stays server-side

The serverless function `api/parse.js` reads `process.env.ANTHROPIC_API_KEY` and
calls the Anthropic API from the server. The key is never sent to the browser,
never logged, and never embedded in any static asset.

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
| 500    | `{ "error": "Server not configured" }` | `ANTHROPIC_API_KEY` missing           |
| 502    | `{ "error": "Parse failed" }`       | Upstream error or unparseable model reply |

## Model

Uses **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — cheap and fast, well
suited to short parsing tasks. Swapping the `model` in `api/parse.js` to a larger
model such as `claude-sonnet-5` raises parsing accuracy on messy or ambiguous
input, at higher cost per request.

## Recommended follow-up (not done yet)

Wiring this into the app UI is the natural next step but is **not implemented**.
The recommended shape is a **"✨ Smart add"** flow: the user types free-form text,
the app calls `POST /api/parse`, and the returned items are shown as **editable
chips for preview** before anything is committed to the list. Never auto-add the
parsed items silently — always let the user review and correct them first.
