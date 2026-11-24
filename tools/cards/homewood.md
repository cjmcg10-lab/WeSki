# Homewood (homewood)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**98 runs (65 named, 36.1 km), 7 lifts. 2 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Wash Pan (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 runs climb more than 12 m  
  Cedar Ridge 15 m
- info: 1 joins made automatically (look at the longest ones on the map)  
  Northern Return ski 97 m
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: run climbs: 2
- info: change from the previous build: runs 97 -> 98, km 35.5 -> 36.1
- pass: ratings checked against the resort's own list  
  63 on the list, 106 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 5 of 5 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 98 of 98 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
