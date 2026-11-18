# SkiWithMe (repository name: WeSki)

An installable web app for ski resorts: 3D mountain from LiDAR, friend groups with live GPS,
directions, voice, stats. Vanilla JS + three.js + Vite, tests in vitest, hosted on Cloudflare.
`README.md` describes the app and the data pipeline in full. Read it first. This file holds what a new
session needs that the README does not: the rules, the state of the work, and what is next.

## Rules for working here

- Develop and push only on the branch the session names (`claude/...`). Pushing deploys: GitHub Actions
  runs tests, builds, and deploys to https://skiwithme.cjmcg10.workers.dev. No pull requests unless asked.
- Never ask for secrets in chat. The Cloudflare token is a GitHub secret and an environment network secret.
- Outside requests use the User-Agent `weski-build` and never carry the owner's name or email.
- Do not fake a browser User-Agent to get past a site that refuses automated clients. Use another source.
- The owner is not a programmer. Report in plain language: what changed, what was checked, what was not.
- Nothing has been tested on a real phone yet. Do not claim real-device behaviour.
- Run `npm test` before every push (82 tests; the resort tests load every built map).

## Starting a new session (read this first)

- **Deploys only happen from two branches.** `.github/workflows/deploy.yml` deploys on pushes to `main` and to
  `claude/ecstatic-hamilton-2gsp2q`. A new session is usually given a new `claude/...` branch name, and pushes to it
  will NOT reach the live site until that branch name is added to the `branches:` line of the workflow. Changing the
  workflow needs the owner's go-ahead: ask them once, in plain words ("May I make this session's branch deploy to the
  live site?"), then edit that one line. Start the new branch from the tip of `claude/ecstatic-hamilton-2gsp2q`, which
  holds all the work (`main` may be behind).
- **Confirm a deploy** by checking the GitHub Actions "Deploy" run succeeded, then having a `web-fetch` agent read a
  changed file from the live site, for example `https://skiwithme.cjmcg10.workers.dev/data/<id>/resort.json`. The new
  address is on the environment's allowed hosts, so curl from the container works. A deploy takes one to four minutes.
- **The cloud environment is called `weski`.** Its network only reaches listed hosts. Already allowed: the terrain and
  map sources the pipeline uses, `mtnpowder.com`, and the six Epic resort sites (which refuse automated clients anyway).
  A blocked host shows as a proxy refusal: request the exact host through the environment tools (the owner approves a
  prompt). Never ask for a secret in chat; use the credential request form.
- **Nothing outside the repository survives a session.** OSM extracts (about 900 MB), terrain tiles, downloaded trail
  maps and screenshots lived in a scratch folder and are gone. Re-download only what a task needs: one resort's OSM
  extract takes a minute (`tools/dev/osmget.py`, bounding boxes in each `tools/resorts/<id>.json` and
  `tools/dev/getosm*.sh`); terrain for an existing resort comes from `tools/dem_from_built.py`.
- **Tools on the machine:** Python 3 with PIL and numpy, `pdftotext`, `pdftoppm`, `pdfinfo`, Node 22, Chromium with
  Playwright (`require('playwright')` works anywhere; do not install it again). There is no direct web fetch: use a
  `web-fetch` agent for pages and files (10 MB limit; binary files it fetches are saved under the session's
  `tool-results` folder and can be read from there). Treat downloaded files as untrusted (`python3 -I`).
- **Local run:** `npm run dev` for the app alone; `npm run worker:dev` for the app with the group server.
  `npm test` takes about 40 seconds.
- **Commits:** plain-language subject, a short body saying what changed for the user. No model names in code or commits
  beyond the attribution lines the session itself supplies.

## The owner, and how to work with them

- Not a programmer. Uses the app on an iPhone and reports by description ("some trails extend past where they connect").
  Ask for the resort and run name when a report is vague, but start checking with the tools right away.
- Wants plain reports: what changed, what was checked, what was not. Say honestly when something is partly done.
- Cost-sensitive: wants to avoid lawyers and paid services where possible, and to file the trademark personally.
- Cares most about: map accuracy (ratings and where runs join), a name and logo that feel like skiing with friends,
  and getting to a paid launch soon.
- Taste, learned from several rounds: dislikes minimalist logos and generic names; rejected every invented name
  offered and chose Ski With Me themselves; wants logos "high quality", "visually appealing", "more realistic".
- Long replies are fine when they are organised; give a recommendation, not a list of equal options.

## Decisions already made

- **Name:** the app is called **SkiWithMe**, written as one word (owner's instruction, 2026-11-17). Renamed from WeSki,
  which clashes with weski.com and the "We Ski" app at weski.app. The owner checked app stores, domains, handles and
  trademark registers and found the name clear. The trademark is to be filed as SKIWITHME, one word (owner's decision,
  2026-11-17).
- **Launch order:** paid web app first (no app stores), then a native wrapper for the App Store and Google Play.
- **Price:** free map everywhere; $24.99 a year, $5.99 a week, $39.99 group plan.
- **Logo:** replaced by the owner on 2026-11-17 with a new image: three skiers in helmets and goggles (blue, white,
  orange) in front of three snowy peaks, with a white S-shaped run and blue and orange slopes, on dark navy. The original
  upload is `design/logo-original.png`; `design/logo.png` is the rounded square cropped out and made square (squeezed
  about 3% vertically). The app icons in `public/icons/` are made from it (the maskable one is the same image at 74% on
  the background colour #010c1b). The earlier peaks-and-dots logo is in git history; the concepts in "Logo work" are history.
- Launch plan document: https://claude.ai/artifact/7KCV26BCapRGtPWq5hfSFE
- Logo concepts page: https://claude.ai/artifact/R58WwJVZZNDCQLJAUZ2oLS

## Building and checking a resort

**Every mountain, new or live, must pass `docs/MOUNTAIN_CHECKLIST.md`.** It also holds a table of where each
mountain stands; update its row whenever a mountain is worked on.

The order matters. Every step is in `tools/`.

1. OSM extract: `python3 tools/dev/osmget.py <out.osm> <west> <south> <east> <north> [splits]`. The bounding
   boxes used so far are in `tools/dev/getosm*.sh`. Extracts are large and are not in the repository.
2. Terrain: USGS 1 m tiles for the USA (see `tools/dev/getdem*.sh`), `tools/fetch_dem.py` elsewhere.
   To rebuild an existing resort without downloading terrain again:
   `python3 tools/dem_from_built.py public/data/<id> <out.tif>` (exact as long as the extent does not grow).
3. `python3 tools/build_data.py tools/resorts/<id>.json <osm> public/data/<id> <dem.tif> [...]`
   Read its connectivity report. It leaves out abandoned, removed, planned and summer-only lifts and runs,
   and draws outlined glades as one line down the middle.
4. `python3 tools/build_extras.py public/data/<id>` (surrounding terrain).
5. `python3 tools/build_zones.py tools/resorts/<id>.json <osm> public/data/<id>` (zones, ratings, piste colours,
   treeline, trims loose run ends, applies official ratings). Re-runnable at any time without terrain.
6. `python3 tools/build_index.py public/data` and `python3 tools/build_globe.py public/data`.
7. Check: `python3 tools/audit.py tools/resorts/<id>.json <osm> public/data/<id> --list`, then `npm test`,
   then look at it in a browser (`tools/dev/zshot.js` takes screenshots against a local `wrangler dev`).

`tools/dev/` holds the working scripts from earlier sessions (fetch lists, `rebuild_all.sh`, screenshot and
lift checks). They contain an old scratch path at the top; change it before running. `tools/dev/zmap.txt` maps
each resort id to the name of its OSM extract.

## Trail ratings: the rule

A wrong rating can send someone down a run above their level, so:

- **A resort's own published rating wins over OpenStreetMap.** `tools/official/<id>.json` holds the resort's
  list; `build_zones.py` applies it on every build; `python3 tools/official_ratings.py check <id>` reports
  differences, official runs missing from the map, and map runs the resort does not list.
- **A resort counts as rating-checked only when `tools/official/<id>.json` exists.** Do this for every new
  resort before it goes live.
- Runs with no rating anywhere are flagged `u` (guess). Directions count them one level harder.
  Blue-black runs (`bb`) count as half a level above blue.

Status on 2026-11-18 (all 34 checked):

| Checked against the resort's list | Source |
| --- | --- |
| Steamboat, Winter Park, Mammoth, Sugarbush | resort feed, `official_ratings.py fetch mtnpowder <resortId> <id>` (6, 5, 60, 70) |
| Saddleback | trail map PDF, which has a typed "Trails & Designations" list (`pdftotext` reads it) |
| Cannon | trail map image, labels read by hand from enlarged crops (green, blue or black lettering) |
| Breckenridge, Park City, Keystone, Smugglers' Notch, Heavenly, Stowe | official trail maps the owner downloaded and uploaded to the chat (Epic and Smuggs sites refuse automated clients); symbols read by hand from enlarged tiles |
| Stratton | resort feed, `official_ratings.py fetch mtnpowder 1 stratton` |
| Killington, Sunday River, Sugarloaf, Okemo, Mount Snow, Loon, Whiteface | official trail maps (resort sites by curl, or skimap.org), read by hand from tiles (added 2026-11-18) |
| Jay Peak | trail map PDF by curl; run names are real text, so the symbol left of each name was classified by script (`pdftotext -bbox`) |
| Vail | 2026-27 maps from `scene7.vailresorts.com` (wid=4000; 8000 is refused), read by hand |
| Copper, Brundage | resort trail maps (see sources in each official json), read by hand |
| Les Contamines, La Plagne, Les Arcs (Paradiski map), Tignes – Val d'Isère, Val Thorens, Geto Kogen | official piste maps, line colours read by hand from tiles |
| Zermatt – Cervinia | Cervino Ski Paradise PDF (cervinia-api.devtherocks.it, 45 MB, curl): coloured number badges classified by script, names from the map's printed piste list |
| Saalbach, SkiWelt | Intermaps data behind the resorts' own interactive maps: `winter.intermaps.com/<map>/data?lang=de` (`saalbach_hinterglemm_leogang_fieberbrunn`, `skiwelt`): every slope with number, name and colour |
| Pizol | the resort's piste report on `www.infosnow.ch/~apgmontagne/?lang=de&id=47&tab=web-wi`: number, name and a colour icon (13 blue, 14 red, 15 black, 16 yellow = ski route) |

Stowe (2026-27 map uploaded by the owner): unlabelled upper Spruce Peak runs take their black line colour, and glades
keep the OpenStreetMap rating because the map gives glades no rating (see the note in `tools/official/stowe.json`).
Val Thorens's Orelle side was read from `les3vallees.com/media/download/plan-orelle.pdf` (web-fetch agent; curl is
refused by the proxy for that host): every Orelle run already matched OpenStreetMap.

European and Japanese ratings use `"scheme": "colour"` in the official json (0 green, 1 blue, 2 red, 3 black,
4 ski route; Japan 0, 2, 3). Resorts that number their runs instead of naming them (Saalbach, Pizol) add
`"numbers": {"30": 1, ...}`; `build_zones.py` matches them against the OpenStreetMap `ref` tag or a number at the
start of the name, but a match by number alone never makes a run easier than OpenStreetMap rates it (an OSM number
can be wrong: Saalbach's "Zwölferkogel - Nordabfahrt" carries 14 instead of 40). SkiWelt is matched by name only,
because its numbers repeat between areas. `build_zones.py` now resets each run to its OpenStreetMap rating before
applying the official list, so taking a run off the list really undoes it; it also applies the config `rename`.

mtnpowder.com feed ids with trail lists (for future resorts): Stratton 1, Snowshoe 2, Blue 3, Tremblant 4, Winter Park 5,
Steamboat 6, Deer Valley 49, Aspen 51-54, Eldora 56, Bear 57, Snow Summit 58, June 59, Mammoth 60, Palisades 61/62,
Alta 63, Snowbird 64, Solitude 65, Brighton 66, Jackson Hole 67, Big Sky 68, Sugarbush 70, Lake Louise 74, Norquay 75,
Sunshine 76, Revelstoke 77, Taos 78, Snoqualmie 79, Crystal 80. Weather only, no trail list: Killington 69, Loon 71,
Sugarloaf 72, Sunday River 73, Copper 55. Intermaps (`winter.intermaps.com`) serves many Alpine resorts' maps; a
resort's map name is in its website's map embed.

When one map run covers an upper and a lower part with different official ratings, the checker leaves it alone unless
the official json names the whole run. Give the whole run the harder rating (see the note in `cannon-mountain.json`).
Misspelled run names from OpenStreetMap are corrected with a `rename` entry in the resort config (see `saddleback.json`).

How the trail-map route works: get the official map (curl, a web-fetch agent with its 10 MB limit, or the owner's
upload), render it with `pdftoppm -r 300` or more (or open the image with PIL), cut it into overlapping tiles about
1500 px wide, read each tile, write "Run name level" lines to a notes file as you go, then turn the notes into
`tools/official/<id>.json`, run `check`, fix misspellings with `rename` in the resort config, rebuild, and compare the
rebuilt map's trail, lift and place counts with the previous build. Runs inside a named experts-only bowl or canyon
with no symbol of their own take the area's rating. Kids' adventure trails and terrain-park features carry no rating:
leave them out rather than guessing. The checker only applies a rating listed for "Lower X" to a map run called
"Lower X", never to "X" or "Upper X".

Known gaps after the checks: Mammoth and Winter Park each have about 25 to 40 official runs the map
lacks or names differently (see the `check` output). Each needs a `rename` entry in the resort config or
a fix in OpenStreetMap.

## Logo work

- Source: `design/logo-options.html` (the page published at the logo concepts link; publish that same content to the
  same artifact URL to update it). `design/lshot.js` renders it to a PNG for checking: run it from a folder holding a
  copy of the html and a `shots/` folder.
- How it is drawn: each icon is an SVG `<symbol>` on a 240 by 240 grid, clipped to a rounded square, built from shared
  pieces (`#mtn` twin peaks, `#foreground`, `#clouds`, `#pine`, `#skier`, `#pin`, three track paths `#tA #tB #tC`).
  Each card shows the icon large and at phone size.
- History: round 1 mixed concepts; round 2 less minimalist; round 3 two directions the owner asked for, a chairlift
  seen from behind with a mountain view (A1 to A4) and off-angle twin peaks with three skiers' crossing tracks (B1 to
  B4); the owner picked "Bluebird" (taken to mean the twin peaks; the chairlift version shared the name, so confirm).
  Round 4 (current file) is six more realistic twin-peak versions: 1 Tracks in the snow, 2 Closer in, 3 One colour
  each, 4 Route to a friend, 5 Meet here, 6 Your line. The owner then supplied their own logo instead (see Decisions).
- Limits to be honest about: these are vector drawings. A photographic or painted look needs an illustrator; the chosen
  composition becomes the brief. Check every version at phone size (about 46 px) before showing it.
- After the pick: export the app icons (192, 512, maskable, Apple touch icon), update `public/` and the manifest.

## Name and trademark

- Why not WeSki: weski.com is an established ski-holiday company; "We Ski & Snowboard Tracker" (weski.app) is a direct
  competitor app; a WESKI filing at the USPTO by another company was seen on an aggregator site (status unverified).
- Ski With Me: the owner checked app stores, domains, handles and the trademark registers and found it clear. Found in
  research: an old US registration SKI WITH ME was cancelled in 1998; a ski-instruction business appears to use
  "SkiWithMe" informally. Neither was judged a blocker, but say so if asked. This is not legal advice.
- The filing plan given to the owner (they file in the USPTO Trademark Center; Claude only drafts):
  - Mark: SKIWITHME (one word), standard characters. The logo is a separate, later application once final.
  - Owner: the person, or their company if one is formed first.
  - Class 42 (the one to pay for if only one): "Providing online non-downloadable software for viewing ski resort
    maps, sharing location among members of a group, and obtaining navigation directions at ski resorts."
  - Class 9 (when the store apps exist): the same as "Downloadable mobile application software for ...".
  - Basis: intent to use if filed before the paid launch; in use after it.
  - Specimen: a screenshot of the live app or its web page showing the name, a sign-up or buy button, the web address
    and the date. The rename must be live first.
  - Fee: about $350 per class, from memory. Check uspto.gov for the current fee before telling the owner a number.
  - Main risk: a "merely descriptive" refusal. Planned answer: the phrase is an invitation, not a description of
    software. Fallback: the Supplemental Register. Until filing, the owner can use the TM symbol.

## Screen design (2026-11-17)

The owner sent 15 phone mock-ups and the screens were restyled to match: header with the logo and resort name, a
mountain button top right (hidden while a status pill shows), a resort-and-weather bar above the tabs (opens weather),
dark navy panels with low-poly peaks in each title (the SVG is in `index.html`), outlined cards, teal for the main
button and selected choices. Styles are the "2026-11 look" block at the end of `src/styles.css`. Screens in
`src/main.js`: Group (mock-up 3: profile, then Create and Join cards; mock-up 2 had Join/Create tabs instead), Stats
"Your ski day", History "Your ski days" (the welcome screen with its own Start tracking button shows only when there is
no saved day at that mountain: the owner's rule), More (menu) with two sub-screens, Route preferences and Appearance &
advanced (the test mode is now "Simulated location" there, with an orange Simulation badge in the header), Map legend,
Mountain weather (Summit/Base and Today/7 days switches, "More conditions" folds). Not yet confirmed with the owner:
which Group mock-up they prefer, and putting test mode under Appearance & advanced rather than at the top of More.

Start screen (owner's mock-up, 2026-11-17): logo and "Your mountain. Your crew." over a low-poly mountain backdrop
(`.start-sky` in `index.html`, drawn in front of the globe and kept while zoomed to a resort; it fades when the dive into
the mountain starts), a smaller globe higher up (sizes in `Globe.resize`), the "Find your mountain" panel (search,
Use my location sorts by distance, Favorites filter; favourites are kept on the phone as `favorites`), a painted
thumbnail per resort (`thumbSvg`, generated, not photos), a preview card with a Favorite star, Ski Here and Join Group.
Join Group from the start screen asks for the code, looks up the group's mountain (`GET /api/groups/<code>`, served by
`roomInfo` in `worker/room.js`) and flies straight there, then joins. A group records its mountain from the first
member's hello (the creator); older groups fall back to the newest shared position. Joining from inside a mountain when
the group is elsewhere offers to go there.

## Rename (done 2026-11-17)

The name SkiWithMe is in the app screens, manifest, README, package and both wrangler configs. The Cloudflare Worker is
now `skiwithme`, so the live address is https://skiwithme.cjmcg10.workers.dev. Left as they were on purpose: the
repository name, the `weski-build` User-Agent, the cloud environment name `weski`, and the on-device storage labels
(`weski:` settings, the `weski` database, the `weski-map` cache), which users never see. The old Worker `weski` still
exists in the owner's Cloudflare account at the old address, frozen at the last version before the rename, with its own
separate group rooms. The owner can delete it in the Cloudflare dashboard, or a session can turn it into a redirect if
asked. The icons show the owner's logo.

## Walking off the trails (2026-11-18)

Directions can now start or end off the trail network: to a building, a dropped pin or a friend standing off a run.
`src/routing.js` `_walkOff` adds a straight walk of up to `WALK_MAX` (1000 m) between the place and the nearest trail
or lift point. Those parts are drawn orange and dashed (`COLORS.walk` in `src/map.js`) and listed in the map legend.
Not yet tried on a phone.

## Languages (2026-11-18)

Ten languages (en, es, fr, de, it, pt, nl, ja, ko, zh), chosen under More → Language (defaults to the phone's language).
Every English phrase has a number in `src/i18n/en.js`; each language file uses the same numbers. Code calls
`t('English text', ...)`; text put on the page is translated automatically by a watcher in `src/i18n.js` (exact phrase,
then `{0}` patterns, then " · " pieces and sentences). Mark names with `translate="no"`. **When adding UI text, add the
English to en.js with a new number and the translation to all nine files** (`tests/i18n.test.js` checks slots and gaps).
Place names: `src/placenames.js` translates common words only (hut, top station, lake…) and shows the meaning in
brackets under the real name on the map, in search and in the place card; proper names are left alone. Translations
were written by Claude, not checked by native speakers.

## Map data: things learned the hard way

- `build_data.py` (2026-11-18): `area_bbox` [west, south, east, north] is used when the resort boundary in OSM is a
  multi-part relation the script cannot read (Sugarloaf, Sunday River). `links` now also takes two runs,
  `["trail:A", "trail:B"]`, for a run whose top stops short of the run it leaves from.
- Wikimedia's upload host rate-limits after a few failed requests (HTTP 429). A `web-fetch` agent can still fetch the
  960px thumbnails; strip the `?utm_...` query that the API now adds to file URLs.

- Trail fields in `resort.json`: `d` 0 green, 1 blue, 2 black, 3 double black; `u` rating is a guess; `ok` confirmed
  against the resort's list; `bb` blue-black; `c` the European or Japanese colour class; `z` zone; `lit` night skiing.
  `src/routing.js` `level()` turns these into the difficulty directions use.
- The "left out" filter in `build_data.py` was once too strict and removed real lifts and runs (a gondola tagged
  `seasonal=summer;spring`, private pistes). It now drops only clear cases. After changing it, rebuild a French resort
  and compare lift and run counts. A resort config can force a way back in with `keep_ways`.
- Config `links` that name a lift which no longer exists crash the build: remove the link.
- Terrain must cover every lift station. Zermatt lost its Plateau Rosa lifts because the Swiss terrain stopped short;
  the fix was an extra terrain strip. When lifts vanish near an edge, suspect terrain coverage first.
- `audit.py` only counts a run as missing if it is inside the resort boundary (`area_name` in the config).
- Outlined glades are drawn as a line from their highest to lowest point; loop trails get a longer reach (220 m) when
  joining the network.
- `build_zones.py` trims run ends that overshoot their last junction by up to 45 m. If the owner still reports
  overshoots, get the run name and look at that junction before changing the limit.
- Known open items: Saddleback "Morning Glory" is not reachable from the base in the routing graph; Les Arcs has a
  loose "Droset" piece; Zermatt's planned Breitboden to Rosenritz chair was removed and should return if it opens;
  a few dead-end runs remain at several resorts (see each build's connectivity report).
- US resort feeds: only the four Alterra resorts answer on `mtnpowder.com`. Future Alterra resorts on the list
  (check which of the next ten are Alterra-owned) may work the same way: try
  `official_ratings.py fetch mtnpowder <resortId> <id>` with nearby ids before reading a map by hand.

## Paid web app: the plan in short

The full plan is in the launch plan document. In order: one-page website; sign-in by email link; checkout
through a seller-of-record service (handles sales tax; the owner chose this over raw Stripe on 2026-11-17). Checked live
on 2026-11-17: Lemon Squeezy closed new sign-ups on 2026-11-16 and shuts down 2027-03-31 (moving to Stripe Managed
Payments: 3.5% on top of Stripe's 2.9% + 30¢, plus Billing and +1.5% international cards, Checkout or Payment Links only).
Paddle: 5% + 50¢ all-in, no monthly fee, monthly payouts (minimum $100), asks for bespoke pricing under $10, reviews the
website and business before going live. Recommended Paddle. The owner was also advised to form one LLC first and open the
payment account and file the trademark in its name; paywall
(the map stays free; which features sit behind the plan is set out in the launch plan document, confirm with the owner); manage-plan screen; safety notice
shown before first use (the app is a guide, not a substitute for resort signs and ski patrol); terms and privacy
policy (location data is the sensitive part: say what is stored, for how long, who sees it); credits for OpenStreetMap
and terrain sources; a weather source licensed for commercial use; a "report a map mistake" button; an
add-to-home-screen guide for iPhone. Accounts and payments need the owner to create the outside accounts themselves;
keys go in through the credential form, never chat.

## What is next

1. Rating check: all 34 done, including Val Thorens's Orelle side.
2. (Done) Rename to SkiWithMe and new icons. Remaining: the old `weski` Worker.
3. Paid web app: sign-in by email link, checkout (Stripe or a seller-of-record service), paywall, manage-plan
   screen, safety notice, terms, privacy policy, credits, a commercially licensed weather source
   (Open-Meteo's free tier is non-commercial), "report a map mistake" button, add-to-home-screen guide,
   one-page website.
4. Next US resorts (the eight northeast ones, Killington, Sunday River, Sugarloaf, Okemo, Mount Snow, Stratton, Loon and
   Whiteface, were built on 2026-11-18): Palisades Tahoe, Big Sky, Jackson Hole, Aspen Snowmass, Beaver Creek,
   Deer Valley, Snowbird and Alta, Northstar, Telluride.
5. Native wrapper (Capacitor) for the stores: background GPS, in-app purchases, demo mode for reviewers.
6. Trademark: the owner intends to file "SKIWITHME" (one word) themselves at the USPTO; Claude drafts, the owner files.
7. Open questions from the owner's phone: frame rate dropped from 120 to 30 fps at times; motion is now capped
   at 60 fps by default ("120 fps motion" in More). Awaiting their retest. "Terrain detail by distance" is
   unbuilt and only worth doing if the retest still shows drops.
