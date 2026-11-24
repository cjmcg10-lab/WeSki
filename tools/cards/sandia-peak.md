# Sandia Peak (sandia-peak)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**63 runs (62 named, 25.2 km), 5 lifts. 2 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  To Chair 2 (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: change from the previous build: lifts 6 -> 5  
  fewer lifts or named runs than before: compare before pushing
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: run missing: 3, stub: 2
- info: the resort's outline relation/4644818 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  42 on the list, 57 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 3 of 4 on the map  
   Small lifts not on the map: Magic Carpet
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 63 of 63 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
