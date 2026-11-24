# Crystal Mountain (crystal-mountain-michigan)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**63 runs (53 named, 16.9 km), 8 lifts. 2 things to look at.**

- **LOOK**: 6 runs on the resort's list are not on the map  
  Basin Street, J.T.'s Trail, North Face Glades, Ridge Glades, Shelburg's Chute, Short Cut (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 3 shown runs rated by guess  
  (no name)
- info: 1 joins made automatically (look at the longest ones on the map)  
  The Learning Center ski 30 m
- info: audit: no rating: 7
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  58 on the list, 92 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: reachable from the base: 63 of 63 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
