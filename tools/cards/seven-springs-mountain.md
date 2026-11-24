# Seven Springs Mountain (seven-springs-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**54 runs (41 named, 27.0 km), 16 lifts. 2 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Alpine Meadows Glades, Helen's Trail (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: change from the previous build: runs 57 -> 54, named 43 -> 41, km 27.1 -> 27.0  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Magic carpet (bottom) ski 131 m
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  (no name) (256489053, 50 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (391426983, 36 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (391426982, 29 m): unnamed piece, not on the resort's list, leads nowhere on it
- pass: ratings checked against the resort's own list  
  41 on the list, 71 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 14 of 14 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 57 of 57 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
