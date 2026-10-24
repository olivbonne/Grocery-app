# Firestore rules — kept in the repo (v2.25, the app review's R25)

Until v2.25 the database's rules lived only in the Firebase console, where nobody could review or test them.
They are now in `firebase/firestore.rules`. **The file does nothing until someone publishes it** — Claude cannot
reach the Firebase console from here, so that step is yours.

## What they enforce
Market List has no sign-in, so the rules cannot say *who* may open a list: the code in the share link is the key.
What they do:

| Rule | Why |
|---|---|
| A list is read by its exact code only (`get`), never listed (`list: false`) | Without this, anyone could ask Firestore for every list and read every household's. This is the most important line. |
| At most four people on a list | The four-person limit was only checked in the app's own code. A list that somehow already has more is not locked out; it just cannot grow. |
| No deletes | The app never deletes a list document; "Empty this list for everyone" overwrites it instead. |
| An account's record `users/{uid}` is read and written only by that signed-in person (v2.40), and holds only `lists`, `gone` and `updated` (at most 200 lists, 500 left ones) | "Your account" remembers which list codes are yours, so a new phone signed in with the same email gets them back. Nobody else can read which lists you have. |
| Members by account (v2.44): once a list has a record `access/{code}`, only the accounts marked in it (`acl`) can read or write the list; a list with no record yet works as before | A list's code is no longer the only key: a removed person's phone is refused, and an old link alone does not let a stranger in. |
| `access/{code}` is created by the first signed-in phone with itself as its only person, open for at least 20 days (the app uses 30); someone new adds only themselves — with the link's key (`joinProof` = `joinKey`), or with nothing while it is still open; a member may change anything | The household's phones move over by themselves in the open window; after that only links made from the app (they carry the key) let someone new in. |
| Shared shelf prices (v2.47): `shared/{key}` (one per chain and item) is read by any signed-in phone, never listed; an email account (not the quiet anonymous one) writes only its own entry `by.<uid>` = a unit price (`p`, 0.05–1000) and a recent time in ms (`d`); never deleted | Households who opt in pool their Coles, Woolworths and ALDI prices. Only email accounts write, so one person cannot pose as many households. |
| What a list holds (v2.49): a list document has only the fields the app writes (items, Buy again, stores, categories, plan, prices and the rest, plus `v`, the data's version, and since v2.51 `itemTomb`, the items removed in the last 30 days — at most 5,000), with lists where lists belong, at most 3,000 items and 3,000 Buy-again entries, 200 stores and a name of 200 characters | A phone, or anyone with a list's code, cannot fill the list with fields the app does not know or with something of the wrong kind that would break it on every phone. |
| The AI features' daily count (v2.53): `quota/{uid}/days/{day}` is read only by that phone, and written by the server *as that phone* (its own sign-in) — only one counter at a time, only up by exactly one, never deleted | So nobody can use Smart add or receipts without limit, with no admin key on the server; a phone cannot lower its own count. |
| Nothing outside `lists/`, `access/`, `users/`, `shared/` and `quota/` | The app uses no other collection. |

The app only ever reads or listens to `lists/{code}` and writes it whole with `setDoc` (a create, or an update).
Those are all allowed, so publishing should change nothing the household notices.

**Before publishing the v2.49 rules,** make sure every phone is on v2.49 or later (open the app once on each phone; the
version shows in Settings). An older app can write a field the new rules refuse, and its changes would stop syncing
until it updates. **The v2.51 rules** add `itemTomb`: publish them only after every phone is on v2.51. Until then an older phone's writes would be refused; until they are published, the v2.49 rules refuse a v2.51 phone's `itemTomb`, so publish them as soon as every phone has updated.

New lists also get stronger codes from v2.25 on: 128 random bits (25 characters) from the browser's cryptographic
generator, instead of 8 characters from `Math.random()`. Existing lists keep their codes. To move the household's
list to a strong code, make a new list and use Settings › Restore from a backup file, or copy items across.

## v2.58 — each item its own record (S8 step 2)
The v2.58 rules add `lists/{code}/items/{id}` (one record per item, read and written by the list's people, never deleted — a
removal is the record `{id, gone}`), allow the list record's new `parts` field, and refuse writing a split list (`v` 3) back
as an older one. **Publish them BEFORE the v2.58 release goes live.** Until they are published, the move is simply refused
and waits: the list stays exactly as it was, in one record, and the app tries again the next time it is opened — nothing
breaks. To check, open the Sandbox list on a phone on v2.58, then in the console look at Firestore › `lists` › `<code>`:
an `items` collection appears under it, and the list record shows `parts` `["items"]` and `v` `3`.

## Publishing (about five minutes)
1. Open the [Firebase console](https://console.firebase.google.com/) → the Market List project → **Firestore Database** → **Rules**.
2. **Copy what is there now** into a note first, so you can put it back.
3. Paste the whole of `firebase/firestore.rules` over it. Do not publish yet.
4. Open the **Rules Playground** (on the same page) and try these. Use your own list's code from its share link
   (the part after `?list=`):
   - `get` on `/lists/<your code>` → **allowed**
   - `list` on `/lists` → **denied**
   - `create` on `/lists/test123` with data `{"members":["A","B"]}` → **allowed**
   - `update` on `/lists/<your code>` with data `{"members":["A","B","C","D","E"]}` → **denied** (if the list has four or fewer people now)
   - `delete` on `/lists/<your code>` → **denied**
   - `get` on `/anything/else` → **denied**
   - `get` on `/users/abc123` with **Authenticated** on and the uid set to `abc123` → **allowed** (v2.40)
   - `get` on `/users/abc123` with **Authenticated** on and a different uid (say `xyz789`) → **denied**
   - (v2.44) `get` on `/lists/<a code with no access record>` → **allowed**
   - (v2.44) for a list whose `access/<code>` lists uid `A`: `get` on `/lists/<code>` authenticated as `A` → **allowed**, as `B` → **denied**
   - (v2.44) `update` on `/access/<code>` as `B`, adding only `acl.B = true` and `joinProof.B` = the record's `joinKey` → **allowed**;
     the same with a wrong key once `openUntil` has passed → **denied**
   - (v2.47) `create` on `/shared/coles__milk` authenticated as an email user (provider `password`, uid say `abc123`) with data
     `{"by":{"abc123":{"p":2.5,"d":<now in ms>}}}` → **allowed**
   - (v2.47) the same as an anonymous user (provider `anonymous`) → **denied**
5. If all of them come out as above, **Publish**. Then open the app on a phone, tick something, and check that it
   appears on another phone. If anything misbehaves, paste back the rules you copied in step 2 and publish.

With the Firebase CLI instead: `cd firebase && firebase deploy --only firestore:rules` (needs `firebase login` and the
project selected with `firebase use`).

## Not tested here
The rules were checked by reading only. Claude's environment cannot run the Firestore emulator or reach the console,
so the Playground (step 4) is the test. The syntax follows Firestore rules version 2 as documented up to mid-2026.

## What would make lists truly private
Only an identity layer (Firebase Authentication) lets the rules check *who* is asking. That is plan item 4, and it
needs your Firebase console too. With it, a list could be limited to the people who joined it, and a leaked link
would no longer open it.
