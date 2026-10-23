# Lessons learned building Market List

Principles from about two hundred releases of a small household app, written to be reused on the next
one. Each comes from something that actually went wrong, and the example is given briefly so the rule
can be judged against it.

## 1. The person using it

1. **Every wait is visible, and every wait ends.** Anything slower than a tap shows at once that it has
   started (a spinner and the step it is on) and ends in the result or a plain message, never silence.
   Give every network call a timeout. *Receipt reading looked dead on the phone: no spinner, and on iOS
   the photo picker never even reported back.*
2. **Write release notes for the people using it, not for the developers.** Two to four plain sentences
   on what they will notice. The engineering reasons go in the commit.
3. **Take the user's own example literally.** When they draw what they want, use their numbers and their
   coordinate system instead of re-deriving an approximation. *The cart count took three rounds of
   "close" until the badge used the household's own drawing coordinates.*
4. **A fix for one case must not change the others.** "Make it taller" means that row, not every row.
   State the scope of each change, and check the scope as well as the fix.
5. **Free features that build data are an investment.** A feature that is useful today and quietly
   builds something valuable (prices from receipts) is worth more than a feature that is only useful.

## 2. Design

6. **Separate content from chrome.** Content can be expressive (emoji, illustrations). Interface marks
   (buttons, toggles, status) are drawn in the text colour so they never compete with the brand.
7. **Put every colour in a token.** One place for light, dark and each theme. A colour set directly on
   an element becomes a bug in the next theme.
8. **Ship every asset with the app.** Fonts and icons are self-hosted, so an offline app is actually
   offline, and no third party sees your users.
9. **Measure layout in the state you are going to use.** A grid stretches its children, so heights read
   while stretched are not natural heights. Switch the stretch off to measure, then apply the result.

## 3. Data and state

10. **Anything that rebuilds an object from a fixed shape drops new fields.** List those places, and
    treat "add a field" as "add it to every normaliser". *This silently lost data twice.*
11. **Lists that are duplicated on purpose need a written warning beside both copies.** A preference
    left out of one copy was wiped by an unrelated action, and this happened twice.
12. **Matching text against short stems will misfire** ("toilet" contains "oil"). Put specific phrases
    first, broad stems last, and keep a test that pins the common cases.
13. **Start-up is a race.** Events such as a location fix or a sync can arrive before the app is ready.
    Hold them until start-up has finished, and do not drop them.

## 4. Security

14. **Secrets live only on the server.** Keep them out of the client, out of logs, out of responses and
    out of URLs. Code that fetches a user-supplied URL re-checks every redirect.
15. **Do not log what users send you.** A photo or a receipt is private, so log the reason for a failure
    and not the content.

## 5. Third parties

16. **Assume what you read about a third-party service is wrong until it is tested.** Free tiers, URL
    formats and model names change, and two such claims were wrong in a single month. Keep them in
    configuration, give each failure a named error code and have a fallback, so being wrong is cheap.
17. **The platform has rules that its documentation does not mention.** For example, iOS file inputs
    must be in the DOM, and portrait-only PWAs behave differently once installed. Test on the real
    device class.

## 6. Testing

18. **Make sure a check can fail.** A syntax check passed every file for weeks because it was checking
    nothing. Plant a deliberate error and confirm it is caught, every time the check runs.
19. **Keep tests in the repository.** Every suite written in a temporary folder was lost.
20. **Each check says what it protects.** When a later version changes the behaviour, rewrite the check
    in place with a note, and do not delete it or leave it failing.
21. **Flaky tests are usually real races.** A notice that appeared "sometimes" turned out to be a
    migration that reloaded the page on a fresh profile. Find the cause before adding retries.
22. **Run the full set of checks once, at the end of a batch.** While building, run the new checks only.
    Before shipping, run all of them plus a screenshot of every screen you touched.

## 7. Process

23. **Batch the requests and ship one version per batch:** one version number, one changelog row, one
    review.
24. **Split planning from the mechanical edits, and keep verification with the planner.** The editor's
    "things I noticed" notes caught bugs in the planner's own instructions more than once, so read them.
25. **Write the rules down in the repo, where the next session will read them** (`CLAUDE.md`). Memory
    outside the repo does not survive.
26. **Restart the working branch from main after every merge.** Skipping this once produced a conflict
    in the next pull request.

## 8. Architecture, from the first day

*Added 15 October 2026, after the owner pointed out that none of this was raised until they asked for an
architecture review at v2.38 — over two hundred releases in.*

27. **Raise the architecture questions on day one, without being asked.** Ask who can open the data
    (sign-in), how it grows (one record or many), where the app must run (web only, or the app stores),
    and what abuse would cost. Write the answers down before the first feature. *Market List shipped
    for months on three shortcuts that each suited one household: the share link as the only key, the
    whole list as one database record, and AI functions open to anyone. Each was reasonable on its own,
    and each now needs a migration. The owner learned all three at once, at v2.38.*
28. **Every shortcut is debt, so say it out loud when it is taken.** Say what is good enough for now,
    what would make it not good enough (strangers, more people, a store listing, a bill), and what fixing
    it costs. Put it on the open list the owner already reads (the report's "Do later"), not in a commit
    message. A trade-off nobody was told about is not a decision anyone made.
29. **Build for the strictest place the app might go.** If it might reach the App Store or Google
    Play, keep the phone's features (camera, location, storage) behind one layer and the texts in a
    translation table from the first version. Both are cheap at the start and expensive to retrofit.
30. **A limit counted on the phone is not a limit.** Anything that protects a bill or other people's
    data (daily caps, the number of people on a list) has to be enforced by the server or the database
    rules. The phone can only make it polite.

## 9. Switching protection on (October 2026, v2.49–v2.54)

31. **A security rule you cannot run is a guess.** The v2.53 daily-count rule used a function the rules
    language may not have, so production refused every count — it failed open, so nobody noticed but the
    log. Rules cannot be run in an emulator from where this app is built, so: keep a new rule as small as
    possible, make the server log *Firestore's own reason* when a write is refused (v2.54), and check the
    first real write in the console before calling it done.
32. **Protection that loads late protects nothing at first.** App Check was started alongside the database,
    so every launch's first requests went out without its proof (15% "outdated" in the console). Anything
    that vouches for the app must be in place before the first request it covers — and the console's
    numbers are the test, not the code.
33. **Watch before you enforce.** Every protection here went on in "log" mode first (sign-in on the AI
    functions, App Check in the console and on the server), and was switched to "block" only once the logs
    or the console showed the household's own phones passing. Enforcing first would have locked the
    household out twice.
34. **A key's power matters more than which service holds it.** The daily count could live in Firestore or
    in Upstash; what decided it was the key the server would need. Writing as the calling phone (its own
    sign-in, under rules that only allow +1) needs no new key at all — prefer that to any admin key.
35. **One release at a time, even when several are ready.** Pushing the next version onto a pull request
    that is still being checked mixes two releases and restarts the checks. Keep it as a local commit and
    put it on top of `main` once the first one merges (`git rebase --onto origin/main <old head>`).
36. **A slow check is not always a slow app.** A test group that took 18 minutes instead of 7 spent the
    difference downloading system packages before any test ran. Read where the time went before "fixing"
    the code.
