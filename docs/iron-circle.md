# Iron Circle — social gym tracker (`gym.html`)

A second app living in this repo, independent of Market List. Same house style — one HTML file,
inline CSS, one module script, no build step, no framework — but a different product, a different
storage key and a different page. **Nothing in `index.html` was touched.**

Open it at `/gym.html`. Invite code for the demo circle: **`IRON-2026`**.

## What it does

| Area | Behaviour |
|---|---|
| **Auth** | Email + password, gated behind an invite code so the circle stays closed. A "sign-in link" option is included and shows the code it would have emailed — there is no server to send mail from. |
| **Live logger** | Start empty, add exercises as you do them, fill weight and reps, tick each set off. No routines or templates. A 90-second rest timer sits beside Finish. "Repeat last workout" carries the movements and weights over with the reps cleared. |
| **PRs** | A set is flagged when it beats every previous set of that exercise on weight *or* on weight × reps. Flagged live while you log, and shown in the feed, the logger and the charts. |
| **Analytics** | Volume per day over 30 days, plus a per-exercise line chart switchable between estimated 1RM, top set and session volume. PR sessions are drawn as gold points. |
| **Feed** | Recent sessions from the circle with volume, sets, PR count and per-exercise summary. Likes and comments, both deletable by their author. |
| **Leaderboard** | Ranked by total volume, or by best estimated 1RM on any single lift. Filterable by week, month or all-time. |
| **History** | Every past session, searchable by exercise, session name, note or date. Opening one gives full CRUD — edit any weight or rep, delete a set, an exercise or the whole session. |

## Decisions worth knowing

- **Weights are stored in kilograms, always.** The kg/lb setting converts at the edges only
  (`toDisp` out, `toKg` in), so switching units never rounds history away.
- **PR detection is a full recompute**, not a running high-water mark. Deleting the session that
  held a record hands it back to the next-best set — a running maximum cannot undo a flag, and
  the app has full CRUD, so it had to be a recompute. This is what `gym-v100.js` pins down.
- **Estimated 1RM is Epley**, capped at 12 reps, where the formula stops being meaningful.
- **The password digest is not security.** Everything is local to the device and there is no
  server to authenticate against; the digest only keeps the password out of plain sight in
  `localStorage`. Said plainly on the sign-in screen too.
- **Seeded demo circle.** Four lifters with eight weeks of history, so the feed, board and charts
  have something to show on first run. Progression carries a session-to-session wobble on purpose —
  without it every session beats the last one and a PR badge that appears on everything says nothing.
- **No network at runtime.** No CDN, no charting library — the two chart types are hand-rolled SVG —
  and the Outfit font is the copy already in this repo. It works offline as a home-screen app.

## Verifying

```bash
python3 -m http.server 8974 --directory /home/user/Grocery-app &
node .claude/tests/gym-v100.js 8974 /tmp/<scratch>/gym.png
```

29 checks, covering the invite gate, logging through the real controls, PR detection and reversion,
likes and comments, relaunch persistence, the leaderboard's timeframe filter, the charts, history
search and the unit round-trip.
