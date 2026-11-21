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
python3 tools/pipeline.py <id>                      # again, after the ratings file exists
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

Tested 2026-11-21: Powder Ridge from nothing to a full map in 32 s (terrain heights within 0.5 m of the live
map, same counts); a rebuild from the existing map in 5 s, byte for byte the same; a scaffolded copy of
Mohawk from a single point in 35 s.

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
4. **Second pass, only the disagreements.** `official_ratings.py check <id>` lists `[rating]` lines where the
   reading and OpenStreetMap differ, and official runs not found on the map. Only these are read again closely,
   by the main model, on enlarged crops (`--dpi 500`, or crop the one tile). Where the two agree, the run is
   taken as right: two independent sources gave the same rating.
   Typically 5 to 15% of runs need the second look instead of all of them.
5. Misspellings: a `rename` in the config. Then `pipeline.py <id>` once more.

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
- The deploy downloads every R2 map before `npm test`, so the tests still check every mountain, then drops them
  before the app build. If the GitHub token cannot read R2 the deploy warns and tests only Jay Peak.
- `build_index.py` keeps index entries for R2 mountains that are not downloaded.
