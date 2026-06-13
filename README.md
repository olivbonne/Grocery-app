# Market List — setup guide

This is a real web app you host yourself for free. Once live it gives you:
- a link you can share with up to 4 people (everyone edits the same list, live)
- an icon you can add to the iPhone home screen so it opens like an app
- data that stays saved forever in a free cloud database

You'll set up two free things: a **Firebase** database and **Vercel** hosting. ~15 minutes, no coding.

---

## 1. Create the free database (Firebase)

1. Go to https://console.firebase.google.com → **Add project** → give it any name → keep clicking through (you can disable Analytics).
2. In the left menu open **Build → Firestore Database → Create database**.
   - Choose a location near you, start in **Production mode**.
3. Open the **Rules** tab and paste this, then **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /lists/{code} {
         allow read, write: if true;
       }
     }
   }
   ```
   (This keeps it simple. Anyone who knows a list's random code can edit that list — fine for a household. Ask me later if you want to lock it down with sign-in.)
4. Back on the project overview, click the **web icon `</>`** to "Add an app", register it (any nickname), and copy the `firebaseConfig` block it shows you.

## 2. Paste your config

Open **index.html**, find the block near the top marked
`/* Firebase config — PASTE YOURS HERE */`, and replace the `REPLACE_ME`
values with the ones Firebase gave you. Save the file.

## 3. Put the app online (Vercel)

Easiest, no tools:
1. Go to https://vercel.com → sign up (free).
2. On your dashboard choose **Add New → Project → Deploy** and, when asked, **drag-and-drop this whole `grocery-app` folder** (or upload it). Vercel serves static files as-is — no build settings needed.
3. After a few seconds you get a URL like `https://market-list-xyz.vercel.app`. That's your app.

(If you prefer GitHub: push this folder to a repo and "Import" it in Vercel — also free, and future edits redeploy automatically.)

## 4. Add to your iPhone home screen

1. Open your Vercel URL in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. It now launches full-screen with its own icon, like an app.

## 5. Share with friends

- The first time the app opens it creates a list code and puts it in the URL
  (`...vercel.app/?list=abc12345`). **Share that exact link.**
- Anyone who opens it joins the same list (up to 4 names). They can "Add to Home Screen" too.
- Everyone's changes sync live.

---

## Using it
- **Paste** your whole note (even with `Meat:`, `Fruit:` labels) into the top box — items file into the right category and the labels are dropped.
- Type plainly (`banana, 2 kimchi`) and items auto-sort; quantities like `2 kimchi` show as `2×`.
- **+** next to a category adds straight into that category.
- **Tap** an item to check it off; **hold** to edit name / quantity / category.
- **Clear** button moves checked items into **Buy again** at the bottom — tap any of those to add it back next time.
- Tap a category heading to collapse it; tap **Buy again** to expand/collapse it.

## Notes
- I couldn't test this against a live Firebase from here, so if something doesn't sync, double-check the config values and that the Firestore rules were published.
- Free tiers are generous; a household grocery list won't get close to any limit.
- Want true push notifications or a real App Store app instead of a home-screen web app? That's a bigger build — happy to scope it.
