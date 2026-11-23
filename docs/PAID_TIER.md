# SkiWithMe Pass: the paid tier

Written 2026-11-20. The switch `PAYWALL` in both wrangler configs is `"off"` until launch: everything is free and the
pass screen says so. Turning it `"on"` (after the owner's accounts are set up) enforces everything below.

## Free and paid

| Free (everyone, no account) | SkiWithMe Pass |
| --- | --- |
| 3D map of every mountain, offline download | Turn-by-turn and spoken directions anywhere on the mountain |
| Your position and the run you are on | Creating groups (joining a friend's group stays free) |
| Search, weather (today and 7 days), legend | Full history of ski days and replays (the latest day stays free) |
| Joining a group and sharing locations | |
| Group meeting points; directions to a meeting point or to a friend in the group (owner, 2026-11-21) | |
| Tracking today's ski day, stats | |
| Report a map mistake, map help | |

Why this split: the free map is what people tell friends about; directions and group creation are what a group pays
for, and both need our server, so they can be enforced. Joining stays free so one paying friend brings the rest in.

## Plans and prices

| Plan | Price | Length | Notes |
| --- | --- | --- | --- |
| Day Pass | $2.99 | 24 hours from purchase | one-time |
| Week Pass | $3.99 | 7 days from purchase | one-time, the ski-trip pass |
| Season Pass | $19.99 / year | one year, renews | the main plan |
| Crew Season Pass | $34.99 / year | one year, renews | buyer plus 3 friends' emails |
| Free day | $0 | 24 hours | once per account |

No monthly plan: skiing is seasonal. Prices set 2026-11-21 after checking competitors (US App Store and their sites):
Slopes Plus $34.99/yr (family $59.99, up to 6), single day pass $3.99, 7 day passes $11.99; Ski Tracks $4.99/week or
$49.99/yr (from a competitor's comparison page, 2026-11-12; the App Store page refused the fetch). Ours undercut by:
Day $2.99 (25% under Slopes' $3.99), Week $3.99 (20% under Ski Tracks' $4.99 weekly, 67% under Slopes' 7 passes),
Season $19.99 (43% under Slopes Plus, 60% under Ski Tracks yearly), Crew $34.99 for 4 (42% under Slopes' family plan,
which covers 6). Slopes' free version tracks and saves days with basic stats, so tracking stays free here too.
Paddle takes 5% + 50 cents: about 22% of a $2.99 sale and 18% of $3.99, and it asks for custom terms on prices under
$10, so confirm with Paddle before launch. The constants are `PLANS` in `worker/accounts.js`; prices in Paddle must
match.

## Terms agreement

`showConsent` in `src/main.js`: a full screen before anything else (no close button, box must be ticked) until agreed.
The phone keeps `prefs consent {v, at}`; it asks again when `TERMS_V` changes (keep it equal to the legal pages' date
when the terms change), after 365 days, or when the record is missing. Signed-in accounts get a server record
(`consents` table, `POST /api/consent`, synced by `acct.syncConsent`), shown in `/api/me` as `terms`.

## How the pass is enforced (and what cannot be)

- **Server-enforced (cannot be bypassed by editing the app):**
  - Directions data. The build moves each resort's routing graph out of `resort.json` into `graph.json`
    (`vite.config.js`). The Worker returns 402 for `/data/<id>/graph.json` unless the request carries a session cookie
    of an account with an active pass. Without the graph the phone cannot compute routes.
  - Creating groups (`POST /api/groups` returns 402).
  - Exception: `graph.json?g=<group code>&m=<member id>` is served when that member id is in that group and the group
    is on that mountain (`GroupRoom.isMember`), so free members get meeting points and directions to friends. Every
    group was created by someone with a pass. The phone allows only those routes (`needRouter('group')`); directions
    to places and pins with that copy are a phone-only gate, and leaving the group drops the copy.
  - The pass itself: only Paddle's signed webhook (`/api/paddle/webhook`, HMAC-SHA256 over `ts:body`, 5-minute replay
    window, each event applied once) creates purchases. The phone never tells the server it has paid.
- **Phone-only (soft):** hiding older history days. The data is already on the phone; a determined person could edit
  the app to show it. That is acceptable: it is their own data.
- **Honest limits:** someone with a pass can save `graph.json` and pass it on, or keep using a downloaded copy offline
  after the pass ends (the service worker asks the server first and deletes the copy on a 402, but cannot stop a copy
  made by hand). OpenStreetMap's licence (ODbL) also means the derived map database must be offered on request
  (`/legal/credits.html` says so). The paid value is the working, checked, up-to-date service, not secret data.

Sign-in: email with a 6-digit code (also a link, for browsers). The code is needed because on iPhone a link in an
email opens Safari, which does not share sign-ins with the app added to the home screen. Limits: 5 emails per address
per hour, 20 per network per hour, 5 wrong codes end a code, 10 wrong codes per address per day. Sessions are a random
256-bit cookie (`sw_session`, HttpOnly, Secure, SameSite=Lax); only its SHA-256 is stored; 3 phones per account; 180
days unused signs out. All POSTs except the webhook must come from the app's own origin.

Server pieces: `worker/accounts.js` (pure logic, tested in `tests/accounts.test.js`), `worker/stores.js` (`Accounts`
Durable Object, SQLite), `worker/index.js` (routes). Phone: `src/account.js`, the `pass` sheet in `src/main.js`.

## What the owner must do before turning the paywall on

1. Form the LLC (recommended first; payments, trademark and terms in its name). Then put the company name and a
   contact email into `public/legal/*.html` (search for "to be added before the paid launch").
2. (Done 2026-11-20) The app is at https://skiwithme.builtbyroger.app; the website Paddle reviews is
   https://skiwithme.builtbyroger.app/about.
3. Resend (free up to 3,000 emails a month): create an account, verify the domain, create an API key. In Cloudflare
   (Workers → skiwithme → Settings → Variables and secrets) add secret `RESEND_API_KEY`, and tell Claude the sender
   address (for example `SkiWithMe <signin@yourdomain>`) for `MAIL_FROM`.
4. Paddle: create the account (it reviews the business and site). Create four products/prices matching the table
   (Season and Crew as yearly subscriptions). Create a notification destination for
   `https://<domain>/api/paddle/webhook` with the events `transaction.completed`, `subscription.created`,
   `subscription.updated`, `subscription.canceled`. Put its secret in Cloudflare as `PADDLE_WEBHOOK_SECRET`. Send
   Claude the client-side token and the four price ids (these are not secret). Test in Paddle's sandbox first.
5. Have a lawyer read the terms and privacy policy once (optional but recommended; Claude drafted them; they are
   not legal advice). Decide the governing-law state.
6. Then Claude sets `PAYWALL` to `"on"`, `PADDLE_ENV` to `"production"`, and checks a real purchase end to end.

Weather: Open-Meteo's free tier is for non-commercial use. Before the paid launch either buy Open-Meteo's commercial
plan or switch to MET Norway (free for commercial use with credit; the owner must accept their terms personally).

## Running costs and usage alerts

The app runs on free allowances (Cloudflare Workers Free, R2's free amount, Resend's free plan once sign-in is on). A
daily check warns before any of them runs out and says what to upgrade and what it costs: an issue labelled
`usage-alert` and a weekly summary. Read `docs/USAGE_ALERTS.md` (what is watched, the limits, the one-time steps for the
owner). The first upgrade to expect is the Workers Paid plan, $5 a month for the whole Cloudflare account.

## Owner (comp) accounts

`COMP_EMAILS` (Cloudflare secret, comma-separated emails) gives those accounts every paid feature with no end date
(`Accounts.isComp` in `worker/stores.js`; `/api/me` shows `pass.comp`). They can also add up to 3 crew emails, who
get the pass too. The emails stay out of the code and the repository.
