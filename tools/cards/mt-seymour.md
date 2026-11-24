# Mt Seymour (mt-seymour)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**63 runs (44 named, 16.8 km), 5 lifts. 2 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Towerline (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 3 shown runs rated by guess  
  Mystery Glades, Uncle Al's Glades, Unicorn Glades
- info: 3 joins made automatically (look at the longest ones on the map)  
  None top ski 56 m; Mushroom bottom ski 39 m; Pete's Glades ski 96 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1052361699, 56 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: lift missing: 1, no rating: 6
- info: change from the previous build: runs 66 -> 63, km 17.1 -> 16.8
- pass: ratings checked against the resort's own list  
  41 on the list, 66 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 4 of 4 on the map
- pass: reachable from the base: 64 of 64 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
