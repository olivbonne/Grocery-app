# Owner setup — the steps only the account owner can take (October 2026)

Some features are waiting on something only the owner of the Firebase and Vercel accounts can switch on. This page
lists them in the order they unlock things. Each step says what it unlocks, how to do it, and how to check it worked.

Project: Firebase **grocery-list-88109** (the web config in `index.html`), Vercel project serving `main`.

> Claude cannot reach the Firebase or Google consoles from its environment, so the console menu names below are from
> Firebase's documentation as of mid-2026 and could not be checked against the live console. If a name has moved, the
> step is the same; search the console for the bold word.

---

## 1. Publish the database rules — do this first (≈5 min, no code needed)
**Unlocks:** protection now. Without it, anyone who knows how could ask the database for every household's list.

Full steps, with the six Playground checks, are in [`firestore-rules.md`](firestore-rules.md). In short:
1. [console.firebase.google.com](https://console.firebase.google.com/) → **grocery-list-88109** → **Firestore Database** → **Rules**.
2. Copy what is there into a note (your way back).
3. Paste the whole of `firebase/firestore.rules` over it.
4. **Rules Playground**: `get /lists/<your code>` allowed; `list /lists` denied; `delete` denied.
5. **Publish**. Tick an item on one phone and check it appears on the other.

Nothing in the app changes for the household. If anything misbehaves, paste the old rules back and publish.

---

## 2. Turn on sign-in (Firebase Authentication) (≈10 min)
**First, the quiet sign-in (v2.39).** Each phone signs itself in with an anonymous account — no name, no email, nothing
for anyone to type — so the app's server can tell one phone from another (and refuse callers that are not the app).
Until you switch it on, the app quietly carries on as before.

1. Console → **Build › Authentication** → **Get started**.
2. **Sign-in method** tab → enable **Anonymous**. — **DONE by the owner (15–17 October 2026).**
3. **Settings › Authorized domains** → check the app's Vercel domain is listed (add it if not).

**Check:** open the app — Settings › Your data says "signed in quietly". Authentication › Users shows anonymous users.

Then watch the Vercel logs (Functions) for a few days for lines `[guard] … unsigned`. When only old phones still show
them, set the environment variable `API_AUTH=require` in Vercel (Settings › Environment Variables, Production) and
redeploy: from then on the AI features answer only the app. To undo, set it back to `log` and redeploy.

### 2b. Sign-in with a name, later
**Unlocks:** plan item 4 — lists only the people on them can open (a leaked link no longer opens it), your look and
cards on every phone you sign in on, and then shared prices between households (item 5) and Siri (step 5).

1. Console → **Build › Authentication** → **Get started**.
2. **Sign-in method** tab → enable **Email link (passwordless sign-in)** — **DONE by the owner (15–17 October 2026).** No passwords to remember. Optionally also
   **Apple** (needs an Apple Developer account, $99 a year — only worth it if the app goes on the App Store) and
   **Google**.
3. **Settings › Authorized domains** → check the app's Vercel domain is listed (add it if not; `localhost` is there
   by default).
4. Tell Claude it is on. Claude then builds the sign-in screen and new rules that check *who* is asking; you publish
   those rules the same way as step 1. Existing lists keep working during the move: each person signs in once and
   their list is linked to them.

Then publish the rules again (section 1) — v2.40 adds the users/{uid} rule; until then 'Your account' says the lists can't be saved to the account yet.

The sign-in email comes from noreply@<project>.firebaseapp.com and may land in spam; its text can be edited in
Authentication › Templates (menu names not checked from here).

**Check:** Authentication › Users shows your email after you sign in on the new version.

### 2c. Members by account (v2.44)

1. Publish the rules again (Firestore Database › Rules, as in section 1) — nothing below works until then.
2. For 30 days after a list's first phone opens it on v2.44, every household phone joins by itself when it opens the list.
3. After that, only links made from the app (Share link — they carry a key) let someone new in.
4. To remove someone: Settings › People › Remove. Their phone loses the list and the list gets a new link.

---

## 3. Turn on photo storage (Firebase Storage) (≈5 min)
**Unlocks:** a photo on an item ("the green bottle") shared with everyone on the list (R16). Notes already work.
Card photos stay on the phone and do not need this.

1. Console → **Build › Storage** → **Get started**. Choose a location near you (e.g. `australia-southeast1`).
   Since late 2024 Firebase asks for the **Blaze (pay as you go)** plan for new Storage buckets; the free allowance
   (a few GB) is far more than a household's item photos, but a card has to be on file. *(Could not be checked from
   here — read the console's own wording before agreeing.)*
2. Start in **production mode** (everything locked). Claude writes the Storage rules into the repo (only people on a
   list can read or add its photos), and you publish them under **Storage › Rules**, as in step 1.

**Check:** Storage shows a `lists/<code>/` folder after the first photo.

---

## 4. Notifications (web push) (≈10 min)
**Unlocks:** "Sam added 3 things", "Olive is at Coles — anything else?", the restock reminder (R18). On iPhone this
works only for the app added to the Home Screen (iOS 16.4 or later).

1. Console → ⚙ **Project settings** → **Cloud Messaging** → **Web configuration** → **Web Push certificates** →
   **Generate key pair**. Copy the public key (it is safe to be public).
2. Vercel → the project → **Settings › Environment Variables** → add `FCM_VAPID_PUBLIC_KEY` with that value.
3. Sending needs the server to act for the project — that is the service account in step 5, so do step 5 too.

---

## 5. A service account for the server (≈5 min)
**Unlocks:** notifications being sent (step 4) and Siri / Shortcuts adding to the list (R22).

1. Console → ⚙ **Project settings** → **Service accounts** → **Generate new private key**. A JSON file downloads.
   **It is a password to the whole database** — never email it, paste it in a chat, or put it in the repo.
2. Vercel → **Settings › Environment Variables** → add `FIREBASE_SERVICE_ACCOUNT`, paste the file's whole contents,
   tick **Production** only, and mark it **Sensitive**.
3. Delete the downloaded file.

Do this after step 2 (sign-in), so the endpoints can check who is asking.

---

## 6. Daily limits and a firewall (≈15 min)
**Unlocks:** nobody can run up the AI bill, even with the app's address.

1. **Upstash** — create a free Redis database at upstash.com (whether the free tier still exists could not be checked
   from here). Copy its REST URL and token into Vercel env `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and
   redeploy. The limits per phone per day are in `lib/guard.js`; change one with `QUOTA_RECEIPT`, `QUOTA_PARSE` etc.
2. **Vercel Firewall** — add a rate-limit rule on `/api/` (for example 30 requests per minute per IP). The names of the
   menus could not be checked from here.
3. **Google Cloud console** → **APIs & Services › Credentials** → the browser key → **Application restrictions:
   Websites** → add the app's domain (and `localhost` only if you test locally).

---

## 7. Decisions, not settings
- **Basket handoff** (send the list to Coles/Woolworths online): needs a retailer or affiliate agreement.
- **Market List+** (the paid tier): needs a billing provider (Stripe for the web; Apple if it goes on the App Store).
- **R24 — stay a web app or go on the App Store**: recommendation is to stay a web app until sign-in and one paid
  feature show people will pay, then wrap it.
