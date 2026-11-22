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

## The final check

After a mountain goes live, the owner's own use and the in-app "Report a map mistake" button are the last
line: reports arrive at `/api/reports/<id>`. Fix reported runs first in the next session.

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
  `pipeline.py` does both for any mountain listed there, and `--r2` for a new one. `drop` deletes the local copies.
- Compact height grids (2026-11-22): `push` also uploads `terrain.z16` and `surround.z16`, made from the `.bin` files
  (`src/heights.js`: each height predicted from its neighbours, only the difference kept, gzipped; exact, 56% smaller,
  and Cloudflare never compressed the `.bin`). The app downloads the `.z16` and falls back to the `.bin` on old
  browsers, when one is missing, or when its size does not match `resort.json`; the app build makes them for Jay Peak.
  In R2 each compact file is stored as `terrain.<first 12 characters of the .bin's md5>.z16`, and the Worker serves
  `terrain.z16` only from the copy that matches the `.bin` now in R2 (404 otherwise, so the app uses the `.bin`). An
  older tool that re-uploads a `.bin` therefore can never leave phones with heights from an earlier map. `pull` fetches
  the matching `.z16` too. Old copies stay in the bucket unused; delete them in the Cloudflare dashboard if wanted.
  The 59 resorts uploaded before this have no matching compact files and serve the `.bin` until someone with R2
  access runs `node tools/maps_r2.mjs push --all` (only the new `.z16` files are sent, the rest is already current).
- The deploy downloads every R2 map before `npm test`, so the tests still check every mountain, then drops them
  before the app build. If the GitHub token cannot read R2 the deploy warns and tests only Jay Peak.
- `build_index.py` keeps index entries for R2 mountains that are not downloaded.
