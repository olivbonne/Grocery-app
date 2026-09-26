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

## Sending a recipe to the app from your phone

When you're looking at a recipe in your browser, you can send the page straight to Market List
and it will read the ingredients for you.

**Android** — it just works. Share the page and pick **Market List** from the share sheet.

**iPhone** — iOS doesn't let a web app appear in the share sheet on its own, so make a Shortcut once:

1. Open the **Shortcuts** app → **+** → **Add Action**
2. Search **URL** → choose **Text** if you want, but the simplest is: **Add Action → Web → Open URLs**
3. Tap the action's URL field and type: `https://YOUR-APP-ADDRESS/?import=`
4. With the cursor still at the end, tap **Shortcut Input** in the variable bar so it reads
   `https://YOUR-APP-ADDRESS/?import=` followed by the Shortcut Input variable
5. Tap the shortcut's **ⓘ** (Details) → turn on **Show in Share Sheet**
6. Under **Share Sheet Types**, leave only **URLs** ticked
7. Name it something like *Send to Market List* and save

Now, from any recipe page: **Share → Send to Market List**. The app opens on the Plan tab with
the recipe already being read.

(Replace `YOUR-APP-ADDRESS` with your own Vercel address — the same one you use to open the app.)

---

## Optional: the AI features

Smart add, reading recipes from links, TikToks and photos, and recipe search use an AI model on the
server. They need **one** free key added in Vercel — without it the app still works, you just type
items in yourself. Setup is in **[docs/ai-setup.md](docs/ai-setup.md)**.

---

## Using it

The app has three tabs: **Plan · Shop · Settings**.

**Shop** — your list.
- Tap **+** at the bottom to add items. Type plainly (`bananas, 2 milk, 500g mince`) and they file
  into the right category, with quantities and amounts kept. **✨** turns messy text or a whole
  recipe into items.
- The **+** beside a category adds straight into that category.
- **Tap** an item to put it in the cart; **press and hold** it for its options.
- The **"N in cart · Finish"** row saves what you bought to your regulars, ready to add back next time.
- Tap the list's **name at the top** to switch lists or make a new one; press and hold a list for
  rename, share, duplicate or delete.

**Plan** — the week's meals.
- Tap **+** on a day to add a recipe or a food. A recipe can start from a **search**, **a link**
  (web page or TikTok), **a photo**, or **pasted text** — the app reads the ingredients for you.
- Tap a planned recipe to add its ingredients to the Shop list; untick anything you already have.
- **⋯** beside the week saves it as a plan to reuse, applies a saved one, or clears the week.

**Settings** — Theme, text size and the measurement system (metric or imperial). The deeper
customisation — colours, bars, tiles, layout — is folded away; tap a section to open it.

## Notes
- Free tiers are generous; a household grocery list won't get close to any Firebase or Vercel limit.
- The list code in the link is the only thing protecting a list (see the Firestore rules above). Fine
  for a household; don't put anything private in it.
