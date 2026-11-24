# Sölden (solden)

Built 2026-11-24 by tools/pipeline.py. Terrain: not rebuilt (--checks-only).

**176 runs (60 named, 107.3 km), 37 lifts. 1 things to look at.**

- **LOOK**: 5 runs on the resort's list are not on the map  
  19a, 5a, 60, 63, 80 (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  4 / 5 (440291567, 347 m): hidden by hand: an OpenStreetMap piste area outline named '4 / 5': runs 4 and 5 are already drawn as lines (it doubled run 5); 1a (317826051, 286 m): hidden by hand: an OpenStreetMap piste area outline named 1a but tagged ref 1b and easy: the outline of run 1b, whose line is already drawn (it doubled 1b, rated black from the name)
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: run climbs: 3, run missing: 2, run uphill: 1, stub: 8
- info: same counts as the previous build
- info: the resort's outline relation/15961562 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  59 on the list, 61 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 30 of 30 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
