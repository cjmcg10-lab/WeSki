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
- Run `npm test` before every push (134 tests; the resort tests load every built map).

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
- **Map files are in Cloudflare R2, not git** (all but Jay Peak): `node tools/maps_r2.mjs pull --all` before map work.
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
- **Price:** free map everywhere; Day $2.99, Week $3.99, Season $19.99 a year, Crew Season $34.99 a year for 4
  (set 2026-11-21 to undercut Slopes and Ski Tracks; see `docs/PAID_TIER.md`). Owner's company: Built By Roger LLC
  (exact registered name), a Connecticut LLC; the terms use Connecticut law. Contact hello@builtbyroger.app, domain
  builtbyroger.app (registered at Cloudflare). skiwithme.app belongs to someone else. The app's address is
  https://skiwithme.builtbyroger.app (custom domain in `wrangler.assets.jsonc` `routes`, owner's choice 2026-11-20); the
  workers.dev address still works. Phone storage (saved days, favourites) is per address, so the two do not share it.
- **Logo:** replaced by the owner on 2026-11-17 with a new image: three skiers in helmets and goggles (blue, white,
  orange) in front of three snowy peaks, with a white S-shaped run and blue and orange slopes, on dark navy. The original
  upload is `design/logo-original.png`; `design/logo.png` is the rounded square cropped out and made square (squeezed
  about 3% vertically). The app icons in `public/icons/` are made from it (the maskable one is the same image at 74% on
  the background colour #010c1b). The earlier peaks-and-dots logo is in git history; the concepts in "Logo work" are history.
- Launch plan document: https://claude.ai/artifact/7KCV26BCapRGtPWq5hfSFE
- Logo concepts page: https://claude.ai/artifact/R58WwJVZZNDCQLJAUZ2oLS

## Building and checking a resort

**Start with `docs/ADDING_MOUNTAINS.md`** (2026-11-21): `tools/new_resort.py` writes a config from a name and a
point, `tools/pipeline.py <id...>` runs every step below (US terrain downloaded automatically) and writes a score card
(`tools/cards/<id>.md`) listing only what needs a look, `tools/map_read.py` cuts trail maps into tiles and turns reading
notes into the official ratings file. Ratings: typed sources first, then a cheaper-model first reading with a close
second look only where it disagrees with OpenStreetMap. **Map files live in Cloudflare R2** since 2026-11-21 (all but Jay Peak):
run `node tools/maps_r2.mjs pull --all` first in any session that builds or tests maps; see "Map storage" in that doc.

**Whole resort, first time (2026-11-21):** the pipeline widens the OpenStreetMap download until nothing joined to
the resort reaches its edge (`tools/extent.py`), the build keeps everything joined to the resort even outside its
OSM outline, and every official json carries the resort's `"lifts"` (feed, or read off the trail map); the card
blocks on any listed chair or gondola missing from the map. Palisades had lost its Sherwood bowl and Snowshoe its
Silver Creek area before this. The search never crosses into a neighbour: it passes a lift outside the outline only
when the lift is on the resort's list. `tools/whole_check.py <ids>` checks built maps without rebuilding (run on all
50 on 2026-11-21: Pizol, Val Thorens, SkiWelt and La Plagne had lifts missing, now added). The 40 older mountains
with no `"lifts"` in their official json should get one (feed or map reading) so the check covers them fully.
See "Getting the whole resort" in `docs/ADDING_MOUNTAINS.md`.

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
6b. Existence: `python3 tools/verify_exists.py <id> <osm> --list` (after every `build_zones.py`; see below).
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

Status on 2026-11-21 (all 60 checked):

| Checked against the resort's list | Source |
| --- | --- |
| Steamboat, Winter Park, Mammoth, Sugarbush | resort feed, `official_ratings.py fetch mtnpowder <resortId> <id>` (6, 5, 60, 70) |
| Saddleback | trail map PDF, which has a typed "Trails & Designations" list (`pdftotext` reads it) |
| Cannon | trail map image, labels read by hand from enlarged crops (green, blue or black lettering) |
| Breckenridge, Park City, Keystone, Smugglers' Notch, Heavenly, Stowe | official trail maps the owner downloaded and uploaded to the chat (Epic and Smuggs sites refuse automated clients); symbols read by hand from enlarged tiles |
| Stratton | resort feed, `official_ratings.py fetch mtnpowder 1 stratton` |
| Killington, Sunday River, Sugarloaf, Okemo, Mount Snow, Loon, Whiteface | official trail maps (resort sites by curl, or skimap.org), read by hand from tiles (added 2026-11-18) |
| Waterville Valley, Bolton Valley, Burke, Magic Mountain, Berkshire East, Catamount, Ragged, Pats Peak (Indy Pass, added 2026-11-18) | trail maps from skimap.org (`skimap.org/skiareas/view/<id>` lists them; `skimap.org/skimaps/view/<map id>` returns the file itself; the resort sites refuse the proxy), read by hand; Pats Peak from the printed list on its map |
| Mohawk Mountain, Powder Ridge, Ski Sundown, Mount Southington, Bretton Woods, Hunter, Windham, Wachusett (added 2026-11-18, the owner's four Connecticut picks plus four popular northeast mountains) | trail maps from skimap.org, read by hand from tiles. Bretton Woods prints its glades as lists with single or double diamonds; its trails are rated by line and label colour. Windham's "more difficult (advanced)" (blue square with a diamond) is stored as `bb`. Hunter's map PDF has broken text, so it was rendered at 400 dpi |
| Jay Peak | trail map PDF by curl; run names are real text, so the symbol left of each name was classified by script (`pdftotext -bbox`) |
| Vail | 2026-27 maps from `scene7.vailresorts.com` (wid=4000; 8000 is refused), read by hand |
| Copper, Brundage | resort trail maps (see sources in each official json), read by hand |
| Les Contamines, La Plagne, Les Arcs (Paradiski map), Tignes – Val d'Isère, Val Thorens, Geto Kogen | official piste maps, line colours read by hand from tiles |
| Zermatt – Cervinia | Cervino Ski Paradise PDF (cervinia-api.devtherocks.it, 45 MB, curl): coloured number badges classified by script, names from the map's printed piste list |
| Saalbach, SkiWelt | Intermaps data behind the resorts' own interactive maps: `winter.intermaps.com/<map>/data?lang=de` (`saalbach_hinterglemm_leogang_fieberbrunn`, `skiwelt`): every slope with number, name and colour |
| Palisades Tahoe, Deer Valley, Solitude, Crystal Mountain, Snowshoe (added 2026-11-21) | resort feeds, mtnpowder 61, 49, 65, 80, 2 |
| Big Sky, Snowbird, Alta, Telluride, Jackson Hole (added 2026-11-21) | trail maps from skimap.org (`tools/skimap.py`), first reading by a cheaper model, second look at disagreements with OpenStreetMap (`map_read.py compare`). Jackson Hole's map has label colours only: black there means black, or double where OpenStreetMap says double |
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
Sunshine 76, Revelstoke 77, Taos 78, Snoqualmie 79, Crystal 80. Checked 2026-11-21: only Palisades 61, Deer Valley 49, Solitude 65, Crystal 80, Snowshoe 2, Blue 3,
Tremblant 4, June 59 and Bear 57 still return trail lists; Big Sky, Jackson, Aspen, Snowbird, Alta, Brighton, Taos, Eldora
and Snoqualmie return weather only. Weather only, no trail list: Killington 69, Loon 71,
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

Completeness work (2026-11-18): the goal is that every run on the resort's own list is on the map, rated, and reachable.
- `official_ratings.py check <id>` lists official runs not on the map. An entry that is not a separate run to draw is
  explained in the official json, never just dropped: `same_as` (the resort's other name for a map run), `not_runs`
  (gates, uphill routes, terrain parks, report lines that group several runs) and `elsewhere` (a separate lift area
  outside the map, e.g. SkiWelt's Kelchsau and Schwoich). Numbered resorts also print numbers not found on the map.
- `build_data.py` now: turns a named bowl or glade mapped only as an outline into a run down its middle; uses a
  road's or lift line's `piste:name` as the run name (unless the road's own name is on the resort's list); applies
  `way_names` ({osm way id: name}) for upper and lower parts OpenStreetMap lumps together; joins loose run ends to the
  nearest run or lift end (450 m for bowls, 250 m for lines; ski across if level or above, walk if not); and finally
  joins every run whose top no lift reaches to the nearest reachable point (ski 400 m, walk 250 m). Each join is
  printed ("joined automatically", "cut-off runs joined") for review. A run counts as reachable only if its top is.
- More config keys (2026-11-19): `split_ways` {way id: [[lon, lat], "first part name", "rest name"]} cuts one OSM way
  where its name changes (empty name keeps the way's own); `as_runs` [way ids] draws an untagged track or path as a run;
  `way_names` also fixes a run OSM names wrongly (Zermatt's no. 3 "Riedweg" is Howette). In the official json,
  `not_runs` is a dict of name → explanation (lift numbers misread as runs, area names such as Heavenly's Killebrew
  Canyon, play areas, backcountry gates).
- Glades and short runs drawn between two mapped runs: the scratch helper `mid.py <id> <A> <B> f0 f1 [w]` gives the
  line between runs A and B; a run beside a lift is the lift line offset 30-45 m. Both are approximate.
- Duplicate lines (2026-11-19): `build_data.py` `drop_duplicates` leaves out a run that lies along a longer run with
  the same name (or has no name), and cuts a partly overlapping one back to its own part; the kept run takes the harder
  rating. It prints "duplicate runs left out" and "duplicate parts cut off". Before it, about 440 run pairs overlapped
  across the 50 mountains, mostly OSM mapping one run as two ways.
- Still missing after the 2026-11-19 pass (no source placed them): Stratton "Stevek" (new, not on any map found),
  Sugarbush "Rob Roy" (Mt. Ellen), Zermatt Paradise (10), Mittelritz (30) and Platte (31, orange ski routes below
  Hohtälli), Pre de Veau-Pirovano; SkiWelt 8, La Plagne Croes and Jarsey, Tignes Combe du Géant and Les Champions,
  Geto C4. The Cervino map is `cervinia-api.devtherocks.it/wp-content/uploads/2026/11/Ski-Map-Cervino-Ski-Paradise-26-27.pdf`
  (its piste list with numbers is an image: render it with pdftoppm). OnTheSnow pages link small trail-map images
  (cdn.bfldr.com, a web-fetch agent can save them): enough for big labels, too small for small ones.
- Config `links` take a third element `"hike"`: `["<lift> (top)", "trail:X", "hike"]` walks from the lift end to the
  top of X (both ways), for hike-to terrain (Keystone's bowls, Park City's Jupiter and Pinecone ridges, Whiteface's
  Slides). Directions show it as a walk.
- `two_way_lifts` in a resort config marks a lift that carries skiers both ways (Zermatt's Rote Nase).
- Intermaps resorts (Saalbach, SkiWelt): `winter.intermaps.com/<map>/` serves `grid.json` (map pixel to GPS, at twice
  the size of the run overlay `image/<map>_srm/svg/R.svg`), so the resort's own drawn runs can be placed on the ground
  (median error about 65 m against our lifts). Tried for matching Saalbach's numbers: about 1 in 5 wrong where runs share
  a slope, so it is not used to set ratings, only as a review list.
- Trail-map PDFs with real text (Mammoth) can be tied to the ground from the labels of runs we have
  (about 200 m accuracy): enough to know where to look in the aerial photos.
- Still to trace by hand (2026-11-18 evening): see the table in `docs/MOUNTAIN_CHECKLIST.md`.

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
Globe (2026-11-18): the first tap on the globe slides the mountain list down to its bar (as dragging the bar down does)
so the globe fills the space (`globe.onTap` in `openStart`); after that, tapping zooms in on that spot (`zoomAt` in `src/globe.js`, four steps down to about 220 km
up); a tap on a resort dot opens its card (`onPick`, only when no other dot is close enough to be the one meant, so tap
to zoom first in crowded areas); two fingers pinch-zoom; a wheel zooms on a computer; the round button top right
(`#globe-out`) or a tap off the globe zooms back out. Closing a card picked while zoomed in returns to that zoom.
The viewer's own position shows on the globe as a blue dot with a pulsing halo (`globe.setMe`, `showMeOnGlobe` in
`src/main.js`) when location is already allowed for the site, or once "Use my location" is used; it never asks by itself.
"Use my location" sorts purely by distance; the "Last visited" mountain keeps its tag but is only put first otherwise.
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

## Line accuracy: aerial photo check (2026-11-20)

`tools/align_trails.py <id> <naip|swiss|ign|at|gsi>` looks across every run every 10 m on aerial photos (USGS NAIP
Plus for the USA; NAIP's plain service timed out, and its ArcGIS export widens the box unless the picture has the box's
shape in degrees, which once shifted every photo by up to 200 m), marks open ground (light, smooth) against forest
(dark, textured), and follows the middle of the cut strip down the run (Viterbi path, smooth, prefers staying near the
drawn line; any strip counts the same, so a wide slope next door does not win). Reports how far the drawn line is from
the strip and the run's width. Options: `--only traced|all|names`, `--test` (moves each line 50/100/150 m sideways and
measures how well it comes back), `--debug DIR` (picture per run: photo, open ground green, other runs yellow, drawn
line red, found line cyan), `--write` (moves hand-drawn `extra_trails` in the config), `--widths` (saves widths to
`tools/widths/<id>.json`; `build_zones.py` puts them on the runs as `w`; the app's "on this run" check uses them).
Photo cells are cached in `$ALIGN_CACHE`.
- Safety rules for `--write`: only with clear evidence (strip found on 60% of the run, forest on both sides); never
  more than 70 m (beyond that it can be the neighbouring run); never onto a strip that is already another mapped run;
  never for glades or tree runs (their nearby strips are other runs).
- Measured: OpenStreetMap runs at Stowe sit 2 to 11 m from the middle of their strip. A line moved 50 m comes back to
  within about 5 to 20 m; at 100 to 150 m in a dense trail network it can latch onto a neighbour.
- Limits: above the treeline, on open bowls and in glades there is no strip, so nothing is checked there (reported as
  weak evidence). The photo is summer and may predate a new run. The 1 m terrain we use is bare earth (trees removed),
  so it shows cut runs only faintly; a first-return LiDAR surface would show them like the photo but needs point-cloud
  tools that are not installed (pip is blocked).

Full pass at all 50 (2026-11-20, second half):
- **Whole-map offset.** `align_trails.py <id> <src> --shift` (OpenStreetMap runs only) tries every shift up to 36 m and
  reports the share of run points on open ground. Ten maps sat clearly beside their cut runs and now carry `shift_m`
  [east, north] in the config (`build_data.py` moves every OSM point; config lon/lat points are not moved): Bretton Woods
  [15,-3], Loon [15,0], Mohawk [-18,3], Pats Peak [-15,3], Ragged [-15,0], Bolton [-12,3], Ski Sundown [-12,-3],
  Geto [12,3], Cannon [0,9], Hunter [-6,9]. Median distance from the strip after: 2-6 m (before 3-15 m). Shifts of 6 m
  or less were left alone (within the photos' own accuracy). Bolton's terrain file had to be padded (it is made from the
  built extent, which the shift widened).
- **Single runs.** `--write --osm` puts a corrected OSM line in the config as `way_pts` {way id: {pts, len, why}};
  `build_data.py` keeps the way's end nodes and refuses if the way's length no longer matches. `--force ids` for runs
  checked by eye beyond 70 m. Of 83 flagged runs, 16 were clearly drawn in forest beside their strip and were moved
  (Brundage Centennial Lane and To Bear, Catamount Toni Matt, Copper Iron Mask, La Plagne Dérochoir, Mammoth Ralphie's,
  The Wall, Center Bowl, Mount Snow Pat's Pitch, Pizol Prodboden, Stratton Main Line, Sugarbush Lower Moonshine, Vail Sun
  Up Catwalk, Windham Upper Wall ST, plus hand-drawn Hunter Gramercy Park, Mad Box, Bucky's Run, Madison Square and
  Ragged Home Run). The rest are open bowls, meadows (Austria), sagebrush (Park City's open south faces are not runs:
  never move Park City lines onto open ground), or above the treeline, and were left alone. Vail Cloud 9 - Lower was
  moved and put back (the moved line climbed). Breckenridge Goodbye Girl's strip turned out to be Mach 1: left alone.
- **Downhill check.** `node tools/check_downhill.mjs [ids] [--json out]` walks every run from its higher end on the
  built terrain and lists runs climbing more than 12 m. `node tools/fit_terrain.mjs <id> <osm ids> [--trim] [--write]
  [--pic DIR]` finds the nearest line that never climbs (shortest path on 5 m cells, climbing costs a lot); `--trim`
  cuts a hand-drawn run to its highest point and the lowest point after it; it refuses a line that slides onto another
  mapped run. Fitted: Keystone's eight hand-drawn Outback and bowl runs (The Windows had started 120 m below its gate),
  Copper Boulderado, Mammoth Reds Lake Run, Park City The Chutes and Lite's Out, and OSM Cannon The Saddle, Tignes
  Génépy and Vallons de la Sache, Zermatt Hohtälli. Still listed (12 to 40 m, left alone): Park City One Hundred Turns
  and Fantasy Ridge (the photo shows them on their strips; ridge runs), Pine Cone Ridge (hike), Heavenly Sky Chute (no
  safe fit), Zermatt's small rises, SkiWelt 87a (its fit is the Almbahn line).
- `tools/dev/fmt_config.py` rewrites configs with each [lon, lat] on one line; run it after any tool writes a config.

## Existence check (2026-11-20)

The owner found a lift and runs at Sunday River (Merrill Hill II and runs toward it) that are not on the resort's map.
Rule since then: **nothing is shown that the resort itself does not show.** `tools/verify_exists.py <id> <osm>` runs
after `build_zones.py` and marks `hide: reason` on runs and lifts in resort.json; the app leaves hidden ones off the
map, out of search, labels, on-trail detection and directions (lift tracking still knows them). Rules:
- a run on the resort's list (`ok`) or under `confirm` in the official json is shown;
- an unlisted run is shown only as a linking piece (`unl`): its group of touching unlisted pieces joins listed runs or
  lifts at two separate places, or ends at a shown lift's bottom station, or is a park joined at one place. The app's
  run card says "Connecting piece: not named on the resort's trail list". Everything else unlisted is hidden;
- unnamed OSM runs tagged backcountry, and anything private or ski-touring, are hidden;
- `hide` {name: reason} in the official json hides by hand (Sunday River: Merrill Hill II, a real 2023 chair built
  for future terrain and homes, per liftblog.com; Brilliant);
- lifts are never hidden by geometry: those that fail "a listed run starts at the top and listed terrain reaches the
  bottom" are printed as "lift to review". All 122 flagged on 2026-11-20 were checked by hand and are real public lifts
  (gondolas from town, glacier and beginner lifts, Saalbach's lifts whose runs match by number only).
Result on 2026-11-20: 143 run pieces (49 named) and 2 lifts hidden across the 50. Mount Snow's official list had
missed Carinthia (all terrain parks) and the Sunbrook inset; they are now under `confirm`. Named unlisted runs still
shown as links (about 450 over 300 m, most of them in Europe, where OSM names pieces differently) are the next review
list: `grep unl` in each resort.json.

Dashed lines: glades and tree runs are long dashes; the outline of a wide slope (an OSM piste area) is a thin dotted
edge in the colour of the run of the same name (it used to share the glade dash and its own, sometimes different,
rating). Both are in the map legend.

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

- Runs and lifts missing from OpenStreetMap (2026-11-18): a resort config can list `extra_trails`
  (`{"name", "pts": [[lon, lat], ...]}` top to bottom; rating from the official list; marked `traced` in resort.json)
  and `extra_lifts`. Trace them from the trail map plus a roughness picture of the 1 m terrain, where graded runs show as
  smooth strips between tree islands (the script lived in the scratch folder: hillshade, local roughness, the built
  trails drawn on top, a lon/lat grid every 0.001 degree). Used at the eight resorts added last on 2026-11-18. Aerial
  photo services are not on the network allowlist.
- `build_data.py` (2026-11-18): `area_bbox` [west, south, east, north] is used when the resort boundary in OSM is a
  multi-part relation the script cannot read (Sugarloaf, Sunday River). `links` now also takes two runs,
  `["trail:A", "trail:B"]`, for a run whose top stops short of the run it leaves from.
- Terrain at tile and state edges (2026-11-18): USGS tiles of one survey can be mostly empty, and a resort can need
  tiles from two surveys or two UTM zones (Catamount: Massachusetts and New York; Pats Peak: NH Coastal 2019 and
  NH Connecticut River North 2015). Merge them first with rasterio (merge, then `fillnodata` for seams) into one file
  and pass that to `build_data.py`; it reports "DEM has holes" otherwise.
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
- Hand-drawn `extra_trails` that are glades need `"glade": true` (names with glade/woods/trees get it automatically),
  or they draw as solid lines (fixed 2026-11-21 for Bretton Woods' Rosebrook glades and 14 others).
- `build_zones.py` trims run ends that overshoot their last junction by up to 45 m. If the owner still reports
  overshoots, get the run name and look at that junction before changing the limit.
- Known open items: Saddleback "Morning Glory" is not reachable from the base in the routing graph; Les Arcs has a
  loose "Droset" piece; Zermatt's planned Breitboden to Rosenritz chair was removed and should return if it opens;
  a few dead-end runs remain at several resorts (see each build's connectivity report).
- US resort feeds: only the four Alterra resorts answer on `mtnpowder.com`. Future Alterra resorts on the list
  (check which of the next ten are Alterra-owned) may work the same way: try
  `official_ratings.py fetch mtnpowder <resortId> <id>` with nearby ids before reading a map by hand.

## Paid tier, accounts, privacy (built 2026-11-20)

Read `docs/PAID_TIER.md` (free/paid split, plans, enforcement, the owner's to-do list) and `docs/PRIVACY_DATA.md`
(what skier data is collected and how it is stored). In short:
- Switch `PAYWALL` in both wrangler configs; `"off"` until the owner's Resend and Paddle accounts exist. With it off,
  everything is free and the pass screen says "free during the preview".
- Plans (`PLANS` in `worker/accounts.js`): Day $2.99, Week $3.99, Season $19.99/yr, Crew Season $34.99/yr (4 seats),
  one free day per account. Paid: directions, creating groups, full history (latest day free). Group meeting points
  and directions to them or to friends are free for every group member (owner, 2026-11-21): `graph.json?g=<code>&m=<id>`.
- Enforced on the server: the build moves each resort's routing graph into `dist/data/<id>/graph.json`
  (`vite.config.js`); the Worker answers 402 without a pass; `POST /api/groups` too. Purchases only arrive by Paddle's
  signed webhook. History is a phone-only soft gate. `public/sw.js` fetches graph.json network-first and drops it on 402.
- Sign-in: email with a 6-digit code (needed: an emailed link opens Safari, which does not share sign-ins with the
  home-screen app) or link. Durable Objects `Accounts` (one, SQLite) and `ResortLog` (one per resort) in
  `worker/stores.js`, migration tag v2. The phone side is `src/account.js` and the `pass` sheet in `src/main.js`.
- Opt-in "Help improve the maps", asked once when location is first turned on (active choice, never pre-ticked: the
  law requires that) and in More → Privacy & map help, sends the day after each ski day a summary: run ids and 20 m
  squares off the shown runs, only from stretches that look like skiing (not lifts, standing, lodges, car parks), no
  time or identity; server keeps counts, publishes only >= 5
  ski days (`/api/heat/<id>`). "Report a map mistake" (flag button in the map's right-hand column, pin sheet, Privacy) → `/api/reports`, public list
  at `/api/reports/<id>`. A review script for reports, and using `/api/heat` in `tools/evidence.py`, are still to do.
- Paid buttons stay visible to free users with a small "Pass" badge (`passBadge`); tapping one opens a short pop-up
  (`upsell(why)` in `src/main.js`: free day, See plans, Not now). Nothing shows while `PAYWALL` is off.
- Start screen: a "Sign in" button (account initial once signed in, teal ring with a pass) at the top right of the
  "Find your mountain" panel opens the pass sheet above the start screen (`renderAcctChip`, `#sheet.over-start`).
  Appearance & advanced has "Simulate free tier" (`acct.setSimFree`): the phone acts as if it had no pass, to try the
  badges and pop-up. Paddle sandbox is connected (prices and test token in `wrangler.assets.jsonc`).
- Buy buttons show to everyone once Paddle is connected; without an account, Buy highlights the sign-in card
  ("Create your account or sign in") and opens checkout for that plan right after the code (`buyPlan`, `S.buyAfter`).
- Links to `/legal/*` and `/about` inside the app open in a viewer over the app (`openDoc`, `#docview`, big Back
  button), so the map, group and panel stay as they were. The pages load `/legal/back.js`: inside the viewer they hide
  their own "Back to the app" bar and a link to the app closes the viewer; opened on their own they show the bar.
- Weather (2026-11-21): `/api/weather` (`worker/weather.js`) asks the US National Weather Service (USA, public domain)
  or MET Norway (elsewhere, CC BY 4.0, credit shown under the forecast) and returns Open-Meteo's field names, so
  `src/main.js` reads it unchanged. Shared through Cloudflare's cache. NWS temperatures are corrected from the grid
  cell's height to the summit and base; MET snowfall is worked out from precipitation and temperature, its gusts are
  wind x 1.5 where it gives none; freezing level comes from the summit and base temperatures where NWS gives no snow
  level. Snow depth is no longer shown (neither source has it). Open-Meteo is no longer used.
- Owner accounts: Cloudflare secret `COMP_EMAILS` (comma-separated) = every paid feature, no end date, plus crew.
- The public website for Paddle's review is `public/about.html` (served at `/about`): features, free vs pass, prices,
  install steps, contact, company. Link legal pages without `.html` (`/legal/terms`); the server redirects `.html`, and
  `public/sw.js` leaves page loads of `/legal/` and `/about` to the network (answering them broke on that redirect).
- "Before you ski" terms and safety agreement: a full screen that cannot be skipped (`showConsent`, `TERMS_V` in
  `src/main.js`; see `docs/PAID_TIER.md`). Bump `TERMS_V` whenever the terms change. Legal pages in `public/legal/` (terms, privacy,
  refunds, credits incl. the ODbL offer of the derived database). They are drafts by Claude: the contact address and
  company name are placeholders ("to be added before the paid launch"), and a lawyer's read is recommended.
- `tools/evidence.py <id>` counts public OpenStreetMap GPS traces along each run (results in `tools/evidence/`).
  Public traces are sparse (tens per resort); the app's own map-help counts are meant to become the main source.

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

**Forecast section (planned 2026-11-21, free):** ski-day scores, a comparison calendar and worldwide resort search.
Read `docs/FORECAST_PLAN.md` (plan, decisions, who works on what) and `docs/FORECAST_SPEC.md` (Connor's spec). Work is
tracked in GitHub issue #1 with sub-issues #2 to #12. Claim an issue (assign yourself) before starting it.

1. Rating check: all 50 done, including Val Thorens's Orelle side and the sixteen northeast mountains added on 2026-11-18.
2. (Done) Rename to SkiWithMe and new icons. Remaining: the old `weski` Worker.
3. Paid web app: built 2026-11-20 and switched off (see "Paid tier, accounts, privacy"). Remaining: the owner's
   accounts (LLC, domain, Resend, Paddle) and secrets, contact details in the legal pages, the one-page website,
   a report-review script, and a real purchase tested end to end.
4. Next US resorts (use `docs/ADDING_MOUNTAINS.md`; batches of ten). Built on 2026-11-18: eight northeast ones (Killington, Sunday River, Sugarloaf, Okemo, Mount Snow,
   Stratton, Loon, Whiteface), then eight Indy Pass northeast ones (Waterville Valley, Bolton Valley, Burke, Magic Mountain,
   Berkshire East, Catamount, Ragged, Pats Peak), then Mohawk, Powder Ridge, Ski Sundown, Mount Southington, Bretton Woods,
   Hunter, Windham and Wachusett. Small Connecticut hills have thin OpenStreetMap data (Southington mapped 9 of 14 runs;
   the rest were traced by hand, see `extra_trails`);
   the trail-count test now only asks for more than 7 runs where the index lists fewer than 30. Built 2026-11-21 with the new pipeline (the owner asked to work up toward 2,000+):
   Palisades Tahoe, Deer Valley, Solitude, Crystal Mountain, Snowshoe, Big Sky, Jackson Hole, Snowbird, Alta, Telluride
   (60 in all). Next: Aspen Snowmass, Beaver Creek, Northstar, Tremblant, Blue Mountain, Bear Mountain, June, Taos,
   Brighton, Sun Valley.
5. Native wrapper (Capacitor) for the stores: background GPS, in-app purchases, demo mode for reviewers.
6. Trademark: the owner intends to file "SKIWITHME" (one word) themselves at the USPTO; Claude drafts, the owner files.
7. Open questions from the owner's phone: frame rate dropped from 120 to 30 fps at times; motion is now capped
   at 60 fps by default ("120 fps motion" in More). Awaiting their retest. "Terrain detail by distance" is
   unbuilt and only worth doing if the retest still shows drops.
