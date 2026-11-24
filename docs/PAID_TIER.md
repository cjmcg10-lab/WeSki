# SkiWithMe Pass: the paid tier

Written 2026-11-20. The switch `PAYWALL` in both wrangler configs is `"off"` until launch: everything is free and the
pass screen says so. Turning it `"on"` (after the owner's accounts are set up) enforces everything below.

## Free and paid

Changed by the owner on 2026-11-23 (issue #115): the Forecast, saved days and offline downloads moved behind the pass.

| Free (everyone, no account) | SkiWithMe Pass |
| --- | --- |
| 3D map of every mountain; the map you open stays on the phone that day, even with no signal | Turn-by-turn and spoken directions anywhere on the mountain |
| Your position and the run you are on | Creating groups (joining a friend's group stays free) |
| Search, legend, mountain weather (the weather sheet: now, today and 7 days) | All saved ski days, stats and replays, including days recorded before buying |
| Ski forecast: today's and tomorrow's score for one mountain | The full Forecast: every listed mountain, the whole week, calendar, sorting by day, trip planner |
| Joining a group and sharing locations | "Download for offline": whole mountains stored ahead of time, list with sizes, delete |
| Group meeting points; directions to a meeting point or to a friend in the group (owner, 2026-11-21) | |
| Tracking and saving every ski day (automatic), today's stats and today's saved days | |
| Emergency (SOS) sheet, offline | |
| Report a map mistake, map help | |

Why this split: the free map is what people tell friends about; directions and group creation are what a group pays
for, and both need our server, so they can be enforced. Joining stays free so one paying friend brings the rest in.
Saved days are a reason to buy that grows with use: nothing is ever deleted, so a pass bought in March opens the whole
season. The free Forecast taste shows the score is worth having; the week and the trip planner are what a trip needs.

How each gate behaves without a pass (rules in `src/passrules.js`, tested in `tests/passrules.test.js`):
- **Forecast** (`src/forecast/ui.js` `sheetTaste`, `paidAction`): one mountain (the one you are at, else the first on
  your list), two day cards (today, tomorrow) that open the day view, then "See the full week, calendar and trip
  planner with a pass". Days after tomorrow, a second mountain (Add, Keep on my list), sorting and the trip planner
  open the pop-up (`upsell('forecast')`). The rest of the list is kept for when a pass arrives.
- **Saved days** (`sheetHistory`, `sheetSession`, the start screen's History list): days from today open as before;
  earlier days are locked cards with date and mountain only, under "N ski days saved — unlock them with a pass".
  Tapping one opens the pop-up (`upsell('history')`). A pass opens all of them (nothing depends on the purchase date).
  This replaced "the latest day stays free".
- **Offline maps** (`downloadMountain`, `tidyMaps`, `offlineBlock`, `offlineListCard` in `src/main.js`): the service
  worker keeps every map file it loads, as before. The phone notes the day each mountain was opened
  (`prefs openedMaps`). With no pass, at start-up and only once the server has answered (`acct.passKnown()`: never
  while offline, on a failed request, or while "Simulate free tier" is on), map files of mountains opened on an
  earlier day are deleted from the `weski-map` cache; the map opened today is never touched. "Download for offline"
  (in the start screen's mountain card and in More) needs a pass and stores the app, `resort.json`, both terrain
  grids, the tree-cover file and, with a pass, `graph.json` (a 402 is skipped, not an error). More lists the downloaded
  mountains (`prefs offlineMaps`, size, date, Delete) and the storage the site uses (`navigator.storage.estimate`).
  The SOS numbers are bundled in the app, so they work offline for everyone.

"Simulate free tier" (Appearance & advanced) shows every gate above while `PAYWALL` is off. It never deletes anything.

## Plans and prices

| Plan | Price | Length | Notes |
| --- | --- | --- | --- |
| Day Pass | $2.99 | 24 hours from purchase* | one-time |
| Week Pass | $5.99 | 7 days from purchase* | one-time, the ski-trip pass |
| Season Pass | $24.99 / year | one year, renews | the main plan |
| Crew Season Pass | $44.99 / year | one year, renews | buyer plus 3 friends' emails |
| Free day | $0 | 24 hours | once per account |

\* Passes add up (owner, 2026-11-24): a Day or Week Pass bought while one of the account's Day or Week Passes runs starts
when that one ends (`applyPurchase` in `worker/stores.js`), and the pass sheet says when. While a yearly pass is on (own
Season or Crew, a crew seat, the owner pass) the Day and Week buttons are not shown (`planChoices` in `src/passrules.js`).
A website Season Pass shows "Upgrade" on the Crew Pass: `POST /api/pass/upgrade` asks Paddle to switch the same
subscription to the Crew price, charging the difference for the rest of the year at once (`prorated_immediately`;
nothing changes if the payment fails); Paddle's `subscription.updated` webhook then records it as Crew. This needs the
Cloudflare secret `PADDLE_API_KEY` (Paddle → Developer tools → Authentication → API key with permission to write
subscriptions); without it the button says to write to us. A Season Pass bought in the iPhone app is upgraded there
(Apple prorates within the "SkiWithMe Pass" group), so no button. Day or Week time is never credited toward a yearly pass.

Set by the owner on 2026-11-23 (before: $2.99, $3.99, $19.99, $34.99) and may still change. No monthly plan: skiing
is seasonal.

Competitors (checked 2026-11-21 and 2026-11-23): **Slopes** made its free tier much wider on 2026-11-10: tracking,
friends, unlimited saved days and weather are free. Slopes Plus is $34.99 a year (family $59.99, up to 6) and adds the
3D and 2D maps, offline maps and replays; a single day pass is $3.99, 7 day passes $11.99. **Ski Tracks**: $4.99 a week
or $49.99 a year (from a competitor's comparison page, 2026-11-12). Where we stand: Season $24.99 is 29% under Slopes
Plus and half of Ski Tracks' year; Crew $44.99 for 4 is 25% under Slopes' family plan (which covers 6); Day $2.99 is
25% under Slopes' day pass. Unlike Slopes, our 3D map and today's tracking stay free; unlike Slopes, saved days are
behind the pass (but never deleted), and directions and the ski-score forecast have no Slopes equivalent.

Paddle takes 5% + 50 cents: about 22% of a $2.99 sale and 13% of $5.99, and it asks for custom terms on prices under
$10, so confirm with Paddle before launch.

### Changing a price

The prices live in one place: `PLANS` in `worker/accounts.js`. The pass sheet and the pop-up read them from
`/api/config`. Then:
1. Change the number in `PLANS` and run `npm test`: `tests/prices.test.js` fails and names every page and document that
   still shows the old number (`public/about.html` `data-plan` cells, this file's table). Fix those.
2. Change the price in Paddle so the checkout charges the same. In the Paddle dashboard (sandbox first, then the live
   account): Catalog → Products → open the product (Day Pass, Week Pass, Season Pass, Crew Season Pass) → its price →
   Edit → set the new amount in USD (and the yearly billing period for Season and Crew) → Save. Editing the existing
   price keeps its price id, so nothing else changes. If Paddle does not allow editing it, add a new price on the same
   product instead, archive the old one, and send the new price id (it is not secret): it goes into `PADDLE_PRICES`
   in `wrangler.assets.jsonc`. Existing yearly subscribers keep the price they signed up at unless Paddle is told
   otherwise.
3. Check with a sandbox purchase that the checkout shows the new amount.

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
- **Phone-only (soft):** locking earlier saved days, the full Forecast (weather and scores come from free
  sources through our server, and the weather sheet stays free anyway), and the "Download for offline" button. The
  data is already on the phone or public; a determined person could edit the app to get round them. That is acceptable:
  saved days are their own data, and the paid value is the convenience. Removing yesterday's maps happens only once the
  server has answered, so a phone that stays offline keeps what it has until it is next online.
- **Honest limits:** someone with a pass can save `graph.json` and pass it on, or keep using a downloaded copy offline
  after the pass ends (the service worker asks the server first and deletes the copy on a 402, but cannot stop a copy
  made by hand). OpenStreetMap's licence (ODbL) also means the derived map database must be offered on request
  (`/legal/credits.html` says so). The paid value is the working, checked, up-to-date service, not secret data.

Sign-in: email with a 6-digit code (also a link, for browsers). The code is needed because on iPhone a link in an
email opens Safari, which does not share sign-ins with the app added to the home screen. Limits: 5 emails per address
per hour, 20 per network per hour, 5 wrong codes end a code, 10 wrong codes per address per day. Sessions are a random
256-bit cookie (`sw_session`, HttpOnly, Secure, SameSite=Lax); only its SHA-256 is stored; 180
days unused signs out.

Account sharing (owner, 2026-11-24, issue #134). Sign-in stays an emailed code, not a password: a password can be
passed on once and works for ever, while every new sign-in with a code needs the owner to forward a fresh code.
- **2 devices per account** (`MAX_SESSIONS` in `worker/accounts.js`). Signing in on a third signs out the device used
  longest ago. The pass sheet lists the devices signed in ("Signed in on: iPhone (this device), Mac").
- **New sign-in email.** Every sign-in to an account that already existed emails the owner the kind of device
  (`deviceName`, from the browser's User-Agent) and a "Sign out everywhere" link (`/api/auth/revoke?t=`, 7 days, once,
  only its hash stored). The link opens a page with a button; only the button's POST signs out, so an email scanner
  opening the link does nothing. The first sign-in, which creates the account, sends no notice.
- **Sign out of all devices** in the pass sheet (`POST /api/auth/signout-all`).
- **One purchase, one account.** A purchase record never moves to another account: a later payment event naming a
  different account for the same purchase is ignored (`applyPurchase`). Needed for Apple purchases (#118).
- The pass pop-up points groups at the Crew Season Pass (4 people).
- Not done on purpose: blocking by location or device fingerprint, which locks out paying customers by mistake. All POSTs except the webhook must come from the app's own origin.

Server pieces: `worker/accounts.js` (pure logic, tested in `tests/accounts.test.js`), `worker/stores.js` (`Accounts`
Durable Object, SQLite), `worker/index.js` (routes). Phone: `src/account.js`, the `pass` sheet in `src/main.js`.

## What the owner must do before turning the paywall on

Step-by-step setup for Paddle (website) and Apple (iPhone app), with what to have ready: `docs/PAYMENTS_SETUP.md`
(2026-11-24: same prices on the website and in the iPhone app, yearly plans renew until cancelled, website and
app launch together).

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
6. The daily email of map-mistake reports needs nothing to set up: it uses the sign-in mail account (Resend, step 3)
   and goes to hello@builtbyroger.app. See `docs/MAP_REPORTS.md`.
7. Then Claude sets `PAYWALL` to `"on"`, `PADDLE_ENV` to `"production"`, and checks a real purchase end to end.

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
