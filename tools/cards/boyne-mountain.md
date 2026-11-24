# Boyne Mountain (boyne-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**62 runs (62 named, 26.4 km), 10 lifts. 1 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Dave's Glade, Easy Out, Estelle's Way, Patty Lane (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Johnny Mac top ski 107 m
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  62 on the list, 100 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 9 of 9 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 62 of 62 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
