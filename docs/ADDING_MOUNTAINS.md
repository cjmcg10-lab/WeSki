# Adding mountains: the low-cost way

How to add mountains at the best map quality for the least session time (each session's work is paid for
in credits). Written 2026-11-21 at the owner's request. `docs/MOUNTAIN_CHECKLIST.md` stays the standard every
mountain must meet; this document is the cheapest route to meeting it.

## The idea in one paragraph

Let the scripts do everything that is mechanical, and spend a person's or a model's attention only where a
script says something is wrong. One command builds a mountain and prints a score card. The card lists only the
things that need a look. Ratings come from typed sources first (no image reading at all). Where a map must be
read from a picture, a smaller, cheaper model reads it against a prepared list of run names, and only the runs
where its reading disagrees with OpenStreetMap are read again closely. Mountains are done in batches that share
a source, so each kind of work is set up once.

## The commands

```
python3 tools/new_resort.py <id> "<Name>" "<State or region, Country>" <lon> <lat> [--feed mtnpowder:<n>] [--tz Area/City]
python3 tools/pipeline.py <id> [<id> ...]          # build + check + score card (tools/cards/<id>.md)
python3 tools/map_read.py tiles <map.pdf|png> <dir> # cut a trail map into readable tiles
python3 tools/map_read.py sheet <id> [--osm]        # list of run names to fill in
python3 tools/map_read.py notes <id> <notes.txt> --source "<where the map came from>" [--colour]
python3 tools/map_read.py compare <id> <osm>         # second pass: only the runs where reading and OSM disagree
python3 tools/map_read.py names <id> [--write]      # spelling fixes and upper/lower parts, into the config
python3 tools/pipeline.py <id>                      # again, after the ratings file exists
python3 tools/skimap.py find "<State>" "<name>"     # find a resort's trail maps on skimap.org
python3 tools/skimap.py maps <area id>              # its maps of the last two years, with captions
python3 tools/skimap.py get <map id> <out file>
```

- `new_resort.py` downloads OpenStreetMap around the point (a point on the mountain, from the resort's
  OpenStreetMap area or its trail map), finds the ski area's outline, and writes `tools/resorts/<id>.json` with
  the box, area name and time zone (USA: from the state).
- `pipeline.py` does steps 1 to 7 of "Building and checking a resort" in CLAUDE.md. US terrain is found and
  read automatically: it asks the USGS National Map which 1 m LiDAR surveys cover the box, takes the newest that
  covers all of it, and reads only the resort's window out of the cloud files (about 30 s, instead of
  downloading 400 MB tiles). Outside the USA, the config needs `"dem"` (see the top of `tools/pipeline.py`).
  Downloads and full logs go to the work folder (`--work`, default `/tmp/weski-pipe`); the screen shows one
  line per step and a summary table. Rebuilding an existing mountain reuses its built terrain (exact, no download).
- The score card (`tools/cards/<id>.md`, committed) says Ready or lists what to look at: ratings not checked,
  official runs missing from the map, runs rated by guess, runs not reachable from the base, joins the build
  made by itself, hidden pieces, new lifts to review, runs that climb, audit flags, and fewer lifts or named
  runs than the previous build.

US terrain fallbacks (learned on the 2026-11-21 batch): the newest survey that covers the whole box is used
first, every other survey fills its gaps, and the 10 m national model (1/3 arc-second) is always last, so there
are never holes. A 1 m tile can claim to cover the area and be mostly empty (Crystal Mountain: 70% of the area
came from the 10 m model). When that happens, write it in the config's `terrain_source`.

Tested 2026-11-21: Powder Ridge from nothing to a full map in 32 s (terrain heights within 0.5 m of the live
map, same counts); a rebuild from the existing map in 5 s, byte for byte the same; a scaffolded copy of
Mohawk from a single point in 35 s.

## Getting the whole resort, the first time (added 2026-11-21)

The owner found Palisades Tahoe missing its Sherwood Express and Sherwood bowl, and the same checks then found
Snowshoe missing its whole Silver Creek area. Two causes, both now handled by the pipeline itself:

1. **Download box too small.** `new_resort.py` starts from one point. `pipeline.py` now downloads a margin of
   1.5 km around the box, follows every run and lift joined to the resort on the ground (`tools/extent.py`: lines
   within 150 m, 250 m for lifts, but never into another resort's named outline), and widens the download until
   nothing joined to the resort reaches its edge. It writes the larger box into the config and the card says
   "FOUND MORE" with the lifts it added.
2. **Resort outline in OpenStreetMap incomplete or in several pieces.** `build_data.py` now keeps everything
   joined to the resort, not only what is inside one outline; every outline with the resort's name counts, and
   so does another outline when most of the lifts in it are on the resort's own lift list (Palisades has one
   per valley).

   **Neighbours are not merged.** Linked resorts touch on the ground (La Plagne and Les Arcs, Les Contamines and
   Megève, Park City and Deer Valley's Empire Express). So the search only crosses a lift outside the outline
   when its name is on the resort's lift list; any other lift stops it and is listed as "lifts joined on the
   ground but not the resort's" (a neighbour, or a lift the list lacks: decide, then add it to `include_ways`).
   Runs touching such a lift are not followed, runs are followed at most 4 steps away from a lift of the
   resort, and a lift merely near the outline is not counted as inside it. Station platforms drawn as lines
   are ignored.

   **Older mountains:** `python3 tools/whole_check.py <ids>` runs the same search against a built map without
   rebuilding, and lists lifts and listed runs joined to the resort but missing from the map. Run on all 50 on
   2026-11-21, it found Pizol's gondola from Bad Ragaz, Val Thorens's Orelle gondola from the valley, four SkiWelt
   Westendorf lifts (Fleidingbahn, Gampenkogel, Windauberg, KiWest) and two Champagny beginner lifts at La Plagne;
   all were added with `include_ways` and rebuilt. Left out on purpose: Saalbach's Schanteilift (a separate
   village drag lift reached only by a ski route) and Steamboat's Wildhorse Gondola (a village gondola not on
   the resort's list). The box grows only when part of the resort lies outside it; when it does, the pipeline
   downloads terrain again, so every config needs a `dem` source (added for La Plagne, Val Thorens, SkiWelt and
   Saalbach).

And one independent check, which catches what geometry cannot (an area reached only by shuttle):

3. **The resort's own lift list.** Every official json needs `"lifts"`: from the resort feed
   (`official_ratings.py lifts mtnpowder <n> <id>`, which also saves the feed's areas with their runs), or read
   from the trail map (`Lift: <name>` lines in the notes; ask the cheap reader for them in the same pass). The
   pipeline looks 6 km around for any listed chair or gondola the map lacks and adds it with everything joined
   to it (config `include_ways`). The card then says "lifts on the resort's list: n of m on the map" and lists
   any still missing; a missing chair means a missing area. Names that differ, or small lifts not in
   OpenStreetMap, are explained in the official json under `lifts_explained`, never left unexplained. With feed
   areas, the card also flags any area with half or more of its runs missing.

   Older mountains (issue #59, 2026-11-22): 35 of the 43 that had no list now carry one, read from the resort's
   trail map on skimap.org (the file comes from `files.skimap.org`, now on the network allowlist), with the map
   and how it was read in `lifts_source`. The last eight followed on 2026-11-23 from the resorts' own sources:
   status pages (Pizol on infosnow.ch, Val Thorens on les3vallees.com, Magic Mountain's snow report), printed
   timetables (Zermatt Bergbahnen's winter timetable, Les Contamines' piste map), and the 2026 piste maps of La
   Plagne, Paradiski (Les Arcs) and Tignes – Val d'Isère (labels from the PDF text where it has any, otherwise read
   by hand from 400 dpi tiles). Lifts on a resort's list that are drawn as railways in OpenStreetMap
   (`railway=funicular`: Tignes' Funival and Perce-Neige, Zermatt's Leisee-Shuttle) are only built when the
   config lists them under `extra_lifts` with `"rail": true`. A listed name made only of lift words ("Gondola", "Cabriolet", "Chair 12")
   cannot be matched by name, so the whole-resort search ignores it (it once matched every lift around Park City).

A separate area reached by shuttle (Snowshoe's Silver Creek) goes in `isolated_lifts` with a note.

## Ratings: cheapest source first

Stop at the first source that works:

1. **Resort feed** (no reading): `mtnpowder.com` ids are listed in CLAUDE.md (Alterra resorts and others).
   Put `"ratings_feed": {"mtnpowder": <n>}` in the config (or `--feed` on `new_resort.py`); the pipeline
   fetches it.
2. **Typed data behind an interactive map**: Intermaps (`winter.intermaps.com/<map>/data?lang=de`), infosnow
   piste reports (Switzerland). A short script, no reading.
3. **A PDF with real text**: `map_read.py tiles` reports how many words the PDF's text layer has. If the names
   are text, classify the symbol beside each name by script (`pdftotext -bbox`, as for Jay Peak) or read the
   printed trail list (Saddleback, Pats Peak).
4. **A picture of the map** (most US resorts): the two-pass reading below.

### Two-pass reading of a map picture

1. `map_read.py tiles map.pdf <dir>` (300 dpi; 400 if labels are small). `map_read.py sheet <id>` gives the run
   names on our map.
2. **First pass, cheaper model.** Hand the tiles and the sheet to a subagent on a smaller model (the Agent tool
   with `model: "sonnet"`; `"haiku"` for maps with large, clear labels). The owner asked for this cheaper route
   on 2026-11-21. Its task: for every name on the sheet, find the label on the tiles and write
   `Name | green/blue/bb/black/double` (or `| skip | why`). Add any run on the map that is not on the sheet.
   Do not show it OpenStreetMap's ratings, so its reading stays independent.
3. `map_read.py notes <id> notes.txt --source "..."` writes `tools/official/<id>.json`; run `pipeline.py <id>`.
4. **Second pass, only the disagreements.** `map_read.py compare <id> <osm>` lists the runs where the reading
   and OpenStreetMap differ (it reads OpenStreetMap itself: after a build the map already carries the reading).
   Check closely only the runs read *easier* than OpenStreetMap; a harder reading is kept (the safe side).
   A helper subagent can cut the enlarged crops and a contact sheet; the main model looks at the sheet. Only these are read again closely,
   by the main model, on enlarged crops (`--dpi 500`, or crop the one tile). Where the two agree, the run is
   taken as right: two independent sources gave the same rating.
   Typically 5 to 15% of runs need the second look instead of all of them.
5. Misspellings and upper/lower parts: `map_read.py names <id>` prints suggestions, `--write` saves them. Read
   the list first: a misreading in the notes ("Magam Annie's") must be fixed in the official json, not renamed
   onto the map. Then `pipeline.py <id>` once more.

Map choice: skimap.org's newest map for a resort is often a summer, bike or via ferrata map, or a planning
figure. Pick the latest **winter trail map** (`skimap.py maps` shows captions). Some maps rate by label colour
only (Jackson Hole): a black label means black or harder, so keep OpenStreetMap's double where it says double.
Read the map's legend first (Telluride: two diamonds = expert only, EX = extreme).

## Connections: are the runs and lifts joined the way directions use them? (2026-11-23)

`python3 tools/check_connections.py <ids> | --all` reads each built map's routing graph and lists, per mountain:
runs no lift reaches, runs whose bottom cannot get to a lift (dead ends), loose run ends within 60 m of another run
or lift station (a missing join), run ends that run on more than 45 m past their last join, lift ends with no run,
lift ends directions cannot get to or back from, long made-up joins (over 150 m skied, 300 m walked) and one-way ski
joins that climb. It moves as `src/routing.js` does (downhill on runs, up on lifts, a short gentle climb back allowed,
25 m of own-power climbing per route, hidden runs and lifts left out); only the phone's cut-across moves between
neighbouring runs, which need the terrain, are not counted.

- `tests/connections.test.js` runs it on every mountain that has `tests/fixtures/connections/<id>.json` and fails on
  any problem in the guarded kinds (unreachable, dead end, outside the network, lift end with no run, uphill join)
  that the file does not list with a reason. A run that really ends at a road or among homes (Stowe's Home Run) is
  written there with why; anything else is fixed. Give every mountain a file when it is next rebuilt.
- Fix with the config: `links` (lift end to run, run to run top, `"hike"`, and since 2026-11-23
  `["trail:A (bottom)", "trail:B"]` for a run whose bottom stops short of the run it runs out onto), `way_pts`,
  `split_ways` or `extra_trails` only with evidence; an old or lost trail OpenStreetMap still lists goes under `hide`
  in the official json. Never join what the resort does not join.
- `build_data.py` changes from the same pass: a made-up one-way ski join that climbs becomes a short walk (up to
  20 m of climb) or is left out (directions took every ski join as free, so 476 of them at the northeast mountains
  let routes ski uphill, up to 106 m); a glade or bowl drawn down its outline joins only the nearest run it can be
  skied from or onto (plus anything within 38 m) instead of every run within 220 m; a run end lying on another run
  without a shared OpenStreetMap node is now cut into it (Sugarbush's F.I.S. and Lower Exterminator led nowhere).

## What is only done when the card asks for it

- **Aerial photo check** (`align_trails.py`): only for runs drawn by hand (`extra_trails`) and runs the card
  lists as climbing or unreachable. Not for every run. The whole-map shift check (`--shift`) is cheap and runs
  once per new US mountain.
- **Screenshots**: one overview per batch, plus a close look only where the card points. Screenshots are
  read as images, which costs much more than reading a card.
- **Missing runs**: trace by hand only runs the resort lists that OpenStreetMap lacks, and only after the
  ratings pass (the list tells you which are really missing).

## Batching

- Group mountains by source: all Alterra feed resorts together, all skimap.org picture maps together, all
  Intermaps resorts together. The first one in a batch sets the method; the rest repeat it.
- Pass several ids to one `pipeline.py` run. It prints one table for the batch.
- One commit and one push per batch (each push redeploys the site). Run `npm test` before it.
- Read the cards, not the logs. Open a log (`<work>/<id>.log`) only when a step failed or a card line needs
  the detail.
- Expected pace: about 8 to 16 mountains per session including checks, more for feed resorts.
- The card's "lift ends" line is the check the tests fail on: fix it before pushing. Usual causes: a village
  gondola or base-to-base lift mapped one way (`two_way_lifts`), a lift top with no run down in OpenStreetMap
  (`links`: lift top to the nearest run below, `"hike"` if it climbs), a club or private lift (`isolated_lifts`
  with a note).
- **Joins from a run's bottom** (2026-11-23, west and Alps pass): `["trail:A (bottom)", "trail:B"]` joins every piece
  of A whose lowest end lies within 300 m of B (unless that end runs on into another piece of A) to the nearest point
  of B; `["trail:A (bottom)", "<lift> (base)"]` joins A's lowest end to a lift base. Ways may run either way in
  OpenStreetMap, so "lowest" is by terrain height. The join is skied when B is no more than 3 m above the end, walked
  otherwise. The candidates in that pass came from following the terrain downhill from each dead-end bottom to the
  nearest run that gets back to a lift (only joins up to about 300 m with no climb were made by rule; longer ones,
  up to 800 m at Telluride's Gold Hill and Palmyra basin, were looked at one by one). Each join carries its reason in
  the config's `links_notes`. Runs that leave the map for a neighbour not on it (Alta and Snowbird into each other,
  Solitude into Brighton, Park City into Deer Valley's new terrain) stay dead ends on our map and are written in
  their `tests/fixtures/connections/<id>.json`.
- `dem_from_built.py` finds the projection a map was built in from its grid (before 2026-11-23 it assumed NAD83 / UTM,
  which broke every European and Japanese rebuild). When fresh OpenStreetMap data reaches past the old map, the
  terrain made from the old map has holes: `pipeline.py` then downloads the terrain again for the larger extent.

### Measured on the 2026-11-21 batch (10 western and Snowshoe mountains)

- Machine time: about 14 minutes for the first full build of all ten (OpenStreetMap and terrain downloads; most
  of it terrain), about 2.5 minutes to rebuild all ten afterwards.
- Ratings: five came from resort feeds with no reading at all (Palisades, Deer Valley, Solitude, Crystal,
  Snowshoe). Five were read from skimap.org maps by the cheaper model (13 s to 3 min each). Of 786 runs read,
  28 (3.6%) disagreed with OpenStreetMap; 18 read easier than OpenStreetMap were checked closely, and 9 of
  those were corrected to the harder rating (the reader missed double diamonds at Telluride, Snowbird and
  Big Sky; 2 more runs it had skipped were added). So the second look is necessary: skipping it would have
  left 9 runs rated a level too easy.
- What still took attention: lift connections (4 of 10 needed a config line), spelling and upper/lower matches,
  and the runs the resort lists that OpenStreetMap lacks (6 to 114 per mountain), which are left for a later
  tracing pass.

## Emergency number (added 2026-11-23)

Every built mountain needs an entry in `src/emergency.json` (the in-app SOS sheet); `tests/emergency.test.js` fails
until it has one. Give its `country` (picks the general numbers: 911, 112, 140, 119 ...) and, only when the resort's
own page, trail map or document publishes it, the ski patrol `phone` as printed, `tel` (E.164, `,214` for an
extension), `label`, `source` URL and `checked` date. Never guess: with no reliable source, leave the phone out and the
sheet shows only the general numbers. The file is bundled into the app, so it works offline and needs no R2 upload.

## The final check

After a mountain goes live, the owner's own use and the in-app "Report a map mistake" button are the last
line: reports arrive at `/api/reports/<id>`. Fix reported runs first in the next session.

- **Reading the reports:** `python3 tools/reports.py <id>` (or `--all` for every mountain in `public/data/index.json`)
  lists the reports not seen before: kind, note, date, the run or lift it is about (named from `resort.json`; with no
  run given, the nearest run or lift within 60 m is shown as a guess) and an OpenStreetMap link to the spot. It
  remembers the last report listed per mountain in `tools/.reports_seen.json` (kept out of git, so each machine or
  session starts from the beginning). `--since 2026-12-01` lists by date instead, `--everything` lists all,
  `--keep-marker` leaves the marker alone, `--json` prints JSON. Pull the maps first so run names can be looked up.
- **Skiers' anonymous counts:** `python3 tools/evidence.py <id>` now also reads `/api/heat/<id>` (from skiers who
  switched on "Help improve the maps"; a run or 20 m square is published only once 5 different ski days reached it)
  and prints, per run, the public GPS traces next to the app's ski days, then groups of three or more touching
  squares skied off the shown runs as possible missing runs (size, ski days, nearest run, OpenStreetMap link). Both go
  into `tools/evidence/<id>.json` (`"ski"` per run and `"ski": {"days", "k", "off"}`). `--heat-only` refreshes only
  the ski counts without downloading GPS traces again. With nothing published yet (or the server unreachable) it
  carries on with zero counts.

## Map storage (Cloudflare R2)

Since 2026-11-21 every mountain's map files live in Cloudflare R2 (bucket `skiwithme-maps`), except Jay Peak, which
stays in git because the unit tests load it. 49 mountains used 46 MB (the free allowance is 10 GB storage,
1 million writes and 10 million reads a month).

- `public/data/r2.json` lists the mountains kept in R2. The Worker (`worker/maps.js`) serves `/data/<id>/...` for
  those from the bucket (`MAPS` binding in `wrangler.assets.jsonc`; `"/data/*"` is in `run_worker_first`, so each
  map file request counts as a Worker request: 100,000 a day free, about 25,000 mountain opens). Graph files keep
  the pass check. `index.json` and the globe stay in git.
- `node tools/maps_r2.mjs pull --all` **at the start of any session that builds or tests maps**: nothing outside the
  repository survives a session, so the folders are not on disk until pulled (about half a minute). `push <id...>`
  uploads (only files whose content changed), lists the id in r2.json and keeps the folder out of git;
  `pipeline.py --r2` does both (and nothing goes to R2 without `--r2`, not even for a mountain already listed: R2 is
  what the live app reads, so a trial rebuild is shown on the preview with `tools/preview/deploy.mjs` and pushed once
  approved; changed 2026-11-23 after a rebuild went live by accident). `drop` deletes the local copies.
- Compact height grids (2026-11-22): `push` also uploads `terrain.z16` and `surround.z16`, made from the `.bin` files
  (`src/heights.js`: each height predicted from its neighbours, only the difference kept, gzipped; exact, 56% smaller,
  and Cloudflare never compressed the `.bin`). The app downloads the `.z16` and falls back to the `.bin` on old
  browsers, when one is missing, or when its size does not match `resort.json`; the app build makes them for Jay Peak.
  In R2 each compact file is stored as `terrain.<first 12 characters of the .bin's md5>.z16`, and the Worker serves
  `terrain.z16` only from the copy that matches the `.bin` now in R2 (404 otherwise, so the app uses the `.bin`). An
  older tool that re-uploads a `.bin` therefore can never leave phones with heights from an earlier map. `pull` fetches
  the matching `.z16` too. `push` deletes older compact copies of the same grid.
  The 59 resorts uploaded before this have no matching compact files and serve the `.bin` until someone with R2
  access runs `node tools/maps_r2.mjs push --all` (only the new `.z16` files are sent, the rest is already current).
- The deploy downloads every R2 map before `npm test`, so the tests still check every mountain, then drops them
  before the app build. If the GitHub token cannot read R2 the deploy warns and tests only Jay Peak.
- `build_index.py` keeps index entries for R2 mountains that are not downloaded.

## Automatic builder (in progress, issue #45)

The goal is thousands of mountains with no AI in the loop. Phase 1: run `node tools/maps_r2.mjs pull --all` first
(the script exits with "Maps missing" otherwise), then `python3 -I tools/bulk/candidates.py` (`-I` because the downloads
are untrusted; they stop at 300 MB). It lists every
operating downhill resort in OpenSkiMap with at least 10 runs and 2 lifts (1,882 on 2026-11-22, 1,816 not yet built)
into `tools/bulk/candidates.json` (not in git), in build order. A resort counts as built when more than half of its
lifts (by OpenStreetMap id, from OpenSkiMap's `lifts.geojson`; lifts without an id are left out) are already on one of
our maps. A name-and-distance match only prints a "review:" line and never marks a resort built. The builder starts from these
entries rather than names typed by hand: matching by name and distance once picked Park City for Deer Valley.

## Real trees, lift and building details, and previews (2026-11-22)

- `python3 -I tools/build_canopy.py <id>` writes `public/data/<id>/canopy.z8`: tree cover and height on a grid of
  half a terrain cell, from Meta and WRI's global 1 m canopy height map (CC BY 4.0, read from
  `dataforgood-fb-data.s3.amazonaws.com`, only the resort's window). The app plants its trees from it (real density
  and placement, 9,000 trees, about four times the old random ones at half the triangles each) and colours open
  ground below the treeline as snow. Checked on Jay Peak: 90% of points on our runs fall on open ground, against 19%
  of the mountain overall. Its run widths are about twice the aerial-photo widths, so it is not used for widths.
- `python3 -I tools/enrich_osm.py <id>` adds what OpenStreetMap records to a built map without a rebuild: lift seats,
  capacity (chairs are spaced from it), bubble, heating, detachable; building roof shape and colour, wall colour or
  material, storeys. US resorts have almost none of these tags (Jay Peak, Cannon, Magic, Stowe: none); Zermatt has
  capacity on 37 of 66 lifts and 11 bubble chairs. Buildings without tags get a gabled roof along their long side.
- `pipeline.py` runs both after every build; `maps_r2.mjs` uploads and downloads `canopy.z8` when there is one.
- Runs are drawn at their measured width (`w`), or 26 m (greens 30 m) instead of 50-60 m; slope outlines are filled.
- **Preview a branch before it reaches main:** `node tools/preview/deploy.mjs <ids>` bundles the app into the
  separate Worker `skiwithme-preview` (https://skiwithme-preview.cjmcg10.workers.dev) and uploads the named
  resorts' map files from disk to R2 under `preview/data/<id>/` (the live `data/` files are not touched). Every other
  resort opens from the live map files. No groups, sign-in or purchases in the preview; weather and Forecast data come
  from the live site. Remove it with `npx wrangler delete -c tools/preview/wrangler.jsonc`.
