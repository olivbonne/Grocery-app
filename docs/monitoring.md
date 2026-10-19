# Seeing what the app does — errors and usage (v2.46)

The privacy page promises **no analytics and no tracking**, so the app itself sends nothing about how it is used. What can
be seen comes from the services it already runs on, plus its own crash reports. Menu names below could not be checked
from where this was written; they move from time to time.

## When something breaks on a phone
- **GitHub › Issues, label `crash`.** The app reports its own errors (at most three a day per phone, never the list): the
  version, the page, the screen size and the error's first lines. Since v2.46 the same error from many phones is **one
  issue** — its title ends in `· sig:<10 letters>`, and each new occurrence is a comment "Happened again" with the
  version and page. So the list reads as one line per problem, and the comment count says how often.
- **GitHub › Issues, labels `broken`, `looks`, `idea`, `complaint`** — what the household sent with Report a problem.
- Without a GitHub token (`FEEDBACK_GITHUB_TOKEN`, `FEEDBACK_REPO`) both land in the Vercel logs as `[feedback]` lines.

## When something breaks on the server
- **Vercel › the project › Observability (or Logs).** Every server function — Smart add, recipes, receipts, aisle signs,
  cards, Report a problem — logs the reason for each failure (`quota`, `busy`, `bad_image`, `not_configured`…), never the
  photo, the text it read or a card number.
- `[guard] <function>: unsigned (…)` lines — calls without the phone's quiet sign-in (see docs/owner-setup.md before
  switching `API_AUTH` to `require`); `over the daily limit` — a phone hit its daily cap.

## How much it is used
- **Vercel › Observability**: calls per server function per day, their errors and how long they take. This is the count
  of AI features used — the costly part.
- **Firebase › Authentication › Users**: how many phones are signed in (anonymous) and how many accounts have an email.
- **Firebase › Firestore › Usage**: reads and writes per day — the database's cost. On the free Spark plan the daily
  limits are shown there.
- **Upstash** (if set up for daily limits): the per-phone counters, kept a day.

## What is deliberately not collected
Which screens people open, what they tap, what is on their lists, where they are. Adding any of that would change the
privacy page's promise — decide that first, and change privacy.html in the same pull request.
