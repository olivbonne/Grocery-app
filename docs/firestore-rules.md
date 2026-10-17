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
| Nothing outside `lists/` and `users/` | The app uses no other collection. |

The app only ever reads or listens to `lists/{code}` and writes it whole with `setDoc` (a create, or an update).
Those are all allowed, so publishing should change nothing the household notices.

New lists also get stronger codes from v2.25 on: 128 random bits (25 characters) from the browser's cryptographic
generator, instead of 8 characters from `Math.random()`. Existing lists keep their codes. To move the household's
list to a strong code, make a new list and use Settings › Restore from a backup file, or copy items across.

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
5. If all eight come out as above, **Publish**. Then open the app on a phone, tick something, and check that it
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
