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
- Run `npm test` before every push (59 tests; the resort tests load every built map).

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
  trademark registers and found the name clear. The trademark draft below says SKI WITH ME; ask the owner whether to
  file it as one word or three before drafting the final form.
- **Launch order:** paid web app first (no app stores), then a native wrapper for the App Store and Google Play.
- **Price:** free map everywhere; $24.99 a year, $5.99 a week, $39.99 group plan.
- **Logo:** chosen by the owner on 2026-11-17: three peaks with three people (teal, white, orange dots) and an S-shaped
  run on dark navy. Their own image, saved as `design/logo.png`; the app icons in `public/icons/` are made from it
  (the maskable one is the same image shrunk to 74% on the navy background). The earlier concepts in "Logo work" are history.
- Launch plan document: https://claude.ai/artifact/7KCV26BCapRGtPWq5hfSFE
- Logo concepts page: https://claude.ai/artifact/R58WwJVZZNDCQLJAUZ2oLS

## Building and checking a resort

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

Status on 2026-11-17 (11 of 26 checked):

| Checked against the resort's list | Source |
| --- | --- |
| Steamboat, Winter Park, Mammoth, Sugarbush | resort feed, `official_ratings.py fetch mtnpowder <resortId> <id>` (6, 5, 60, 70) |
| Saddleback | trail map PDF, which has a typed "Trails & Designations" list (`pdftotext` reads it) |
| Cannon | trail map image, labels read by hand from enlarged crops (green, blue or black lettering) |
| Breckenridge, Park City, Keystone, Smugglers' Notch, Heavenly | official trail maps the owner downloaded and uploaded to the chat (Epic and Smuggs sites refuse automated clients); symbols read by hand from enlarged tiles |

Not yet checked (15), with what was learned about each source:

- Copper: the trail report page is filled in by script. The official maps download fine through a web-fetch agent:
  `cms.coppercolorado.com/sites/default/files/2026-11/FY27_Maps_Web_MainTrailMap.pdf`, `.../2024-10/FY25_Copper_Bowl.pdf`,
  `.../2024-10/FY25_Spaulding.pdf`. Run names are drawn artwork, not text: render and read crops.
- Jay Peak: the host is allowed; curl with the `weski-build` User-Agent downloads the 19 MB trail map PDF (`jaypeakresort.com/sites/default/files/2026-02/JPR_TrailMap_Winter_2025%2B2026_ToPRINT.pdf`).
- Brundage: `brundage.com` is now an allowed host; the map images linked from `brundage.com/winter-maps/` download with curl.
- Vail and Stowe: their sites refuse automated clients. The owner said on 2026-11-17 they would upload these two maps
  to the chat next; uploads land in the session's uploads folder.
- The ten European and Japanese resorts: not tried yet. European sites usually publish a piste list with colours.

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
  - Mark: SKI WITH ME, standard characters. The logo is a separate, later application once final.
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

## Rename (done 2026-11-17)

The name SkiWithMe is in the app screens, manifest, README, package and both wrangler configs. The Cloudflare Worker is
now `skiwithme`, so the live address is https://skiwithme.cjmcg10.workers.dev. Left as they were on purpose: the
repository name, the `weski-build` User-Agent, the cloud environment name `weski`, and the on-device storage labels
(`weski:` settings, the `weski` database, the `weski-map` cache), which users never see. The old Worker `weski` still
exists in the owner's Cloudflare account at the old address, frozen at the last version before the rename, with its own
separate group rooms. The owner can delete it in the Cloudflare dashboard, or a session can turn it into a redirect if
asked. The icons show the owner's logo.

## Map data: things learned the hard way

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
through a seller-of-record service (handles sales tax; recommended over raw Stripe for a solo owner) or Stripe; paywall
(the map stays free; which features sit behind the plan is set out in the launch plan document, confirm with the owner); manage-plan screen; safety notice
shown before first use (the app is a guide, not a substitute for resort signs and ski patrol); terms and privacy
policy (location data is the sensitive part: say what is stored, for how long, who sees it); credits for OpenStreetMap
and terrain sources; a weather source licensed for commercial use; a "report a map mistake" button; an
add-to-home-screen guide for iPhone. Accounts and payments need the owner to create the outside accounts themselves;
keys go in through the credential form, never chat.

## What is next

1. Rating check for the remaining 15 resorts (above), in order of popularity.
2. (Done) Rename to SkiWithMe and new icons. Remaining: the old `weski` Worker.
3. Paid web app: sign-in by email link, checkout (Stripe or a seller-of-record service), paywall, manage-plan
   screen, safety notice, terms, privacy policy, credits, a commercially licensed weather source
   (Open-Meteo's free tier is non-commercial), "report a map mistake" button, add-to-home-screen guide,
   one-page website.
4. Next US resorts: Palisades Tahoe, Killington, Big Sky, Jackson Hole, Aspen Snowmass, Beaver Creek,
   Deer Valley, Snowbird and Alta, Northstar, Telluride.
5. Native wrapper (Capacitor) for the stores: background GPS, in-app purchases, demo mode for reviewers.
6. Trademark: the owner intends to file "Ski With Me" themselves at the USPTO; Claude drafts, the owner files.
7. Open questions from the owner's phone: frame rate dropped from 120 to 30 fps at times; motion is now capped
   at 60 fps by default ("120 fps motion" in More). Awaiting their retest. "Terrain detail by distance" is
   unbuilt and only worth doing if the retest still shows drops.
