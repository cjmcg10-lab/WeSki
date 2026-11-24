# Perfect North Slopes (perfect-north-slopes)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**24 runs (24 named, 6.6 km), 14 lifts. 1 things to look at.**

- **LOOK**: 3 runs on the resort's list are not on the map  
  Broadway, Call Back, Cat Walk (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 3 joins made automatically (look at the longest ones on the map)  
  Hollywood bottom ski 44 m; Magic carpet (top) ski 118 m; Magic carpet (top) ski 111 m
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  23 on the list, 32 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 5 of 5 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 24 of 24 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
