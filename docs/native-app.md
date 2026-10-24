# The iPhone and Android app (architecture review step A4)

The plan since the October 2026 review: **wrap this same web app with Capacitor**, not rewrite it. This page says what is
ready, what only the owner can do, and the order. Claims about Apple, Google and Capacitor (prices, menu names, versions)
could not be checked from where this was written — check them when you get there.

## Ready in the code
| Piece | Since | What it means for the app |
|---|---|---|
| One door to the phone's features (`js/platform.js`) | v2.43 | Camera, photo library, location, barcode, keep-awake, share — swap the insides for Capacitor plugins without touching the screens. |
| Full server addresses (`API_ORIGIN`, `apiUrl`) | v2.49 | Inside the app, `/api/…` goes to `https://grocery-app-2-sage.vercel.app/api/…`. |
| The server accepts the app (`cors()` in `lib/guard.js`) | v2.49 | Calls from `capacitor://localhost` (iPhone) and `https://localhost` (Android) are answered. |
| A version on the list's data | v2.49 | An old copy of the app (people update apps late) can never overwrite a newer list. |
| Account deletion inside the app | v2.46 | Apple requires it. |
| Email + password sign-in | v2.41 | Works the same inside the app. **Sign in with Apple is only required when the app offers Google/Facebook sign-in — it does not**, so it is not needed today. |
| App Check (website) | v2.50 | Dormant until the owner gives a reCAPTCHA key. The apps need App Attest (iPhone) and Play Integrity (Android) instead — see below. |
| The shell itself (`native/`) | v2.50 | `capacitor.config.json`, `package.json`, `copy-web.mjs` (copies the web app into `native/www`). Kept out of the website by `.vercelignore`. |
| Add from outside (`takeOutsideText`/`onOutsideText`, `addFromOutside`) | v2.60 | Siri, Assistant and share intents call one handler. |

## What only the owner can do
1. **Accounts.** Apple Developer Program (about US$99 a year) and Google Play Console (about US$25 once). Apple needs your
   legal name or a company; an individual account shows your name as the seller.
2. **A Mac with Xcode** for the iPhone build (Android Studio works on any computer). A cloud Mac service also works.
3. **The app's ID.** Replace `com.example.marketlist` in `native/capacitor.config.json` with one you own, e.g.
   `com.<yourname>.marketlist` — it can never change after the first upload.
4. **Build:** `cd native && npm install && npx cap add ios && npx cap add android && npm run ios` (or `npm run android`).
5. **Firebase:** add an iOS app and an Android app to project grocery-list-88109 (Project settings › Your apps) with the same
   ID; in App Check register them with App Attest / Play Integrity before turning on enforcement.
6. **Links that open the app** (S15) need two files on the website, which need values only you will have:
   - `/.well-known/apple-app-site-association` — your Apple **Team ID** and the app ID;
   - `/.well-known/assetlinks.json` — the Android app ID and the **SHA-256 fingerprint** of your signing key.
   Send them over and they get added (and served with the right content type in `vercel.json`).
7. **Store listings:** name, description, screenshots (the suites already take 390×844 ones), the privacy page
   (`privacy.html`, already written for it) and the privacy questionnaires: data collected = email (if an account is made),
   list contents (synced, not used for tracking), photos (sent to the AI reader only when asked); no tracking, no ads.

## Adding from outside the app (Siri, Google Assistant, sharing)
**Today (web).** On an iPhone, a Shortcut opens the list's link ending in `?add=` with the dictated words (the person builds
it once from Settings › Smart features › Set up Siri). On Android, the manifest's share_target sends `?text=`. Both go through
`takeOutsideText()` in `js/platform.js`, then `addFromOutside()` in `js/app.js`.

**iPhone app.** An **App Intent** ("Add to Market List", with a text parameter), written in Swift inside the Capacitor iOS
project. Siri and the Shortcuts app see it with no setup, and phrases like "Add milk to Market List" work from the lock screen.
The intent hands the text to the web view — a small Capacitor plugin, or the App plugin's `appUrlOpen` with the universal link
`https://…/?add=…` (which needs the apple-app-site-association file from step 6) — and platform.js calls the `onOutsideText`
handler. Optionally `openAppWhenRun = false` with a background write: that needs the item written without the web view, i.e.
a server endpoint, which is later work.

**Android app.** Share intents (ACTION_SEND text/plain) and **Google Assistant App Actions** (shortcuts.xml with a built-in
intent for adding to a list; which built-in intent fits needs checking against Google's current catalogue — not checkable
from here). Both deliver text to the same `onOutsideText`. Android App Links (assetlinks.json, step 6) make `https://…/?add=`
open the app instead of the browser.

**What doesn't change:** the list code, the join key, the one door `addFromOutside`, the duplicate guard and the Smart add switch.

**Said out loud:** the link a Shortcut uses carries the list's code and join key, like a share link — fine for a household.
In the store apps the App Intent replaces it, and no key leaves the app.

## Still to build once the shell runs
- **Native storage (S14):** iOS can clear a web view's storage when space runs low. Move the durable keys (lists, cards,
  account) to Capacitor Preferences behind `js/platform.js`.
- **The service worker** does not run inside the shell; the files ship inside the app, so it is not needed there —
  registration is skipped when `isNativeApp()` (v2.50).
- **Cards in the phone's safe (S7):** Keychain / Keystore, or Apple Wallet passes.
- **Native App Check providers** (above) and the **links** (6).

## The order
Accounts and Mac (1–2) → app ID (3) → first build on your own phone (4) → Firebase apps + App Check (5) → links (6) →
TestFlight / internal testing → store listings (7) → review.
