# Pico Mountain (pico-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**85 runs (57 named, 34.4 km), 7 lifts. 1 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Outlaw, Upper K.A. Glades (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Lower Pike ski 51 m
- info: audit: no rating: 1, run missing: 1
- info: change from the previous build: runs 86 -> 85, km 34.5 -> 34.4
- pass: ratings checked against the resort's own list  
  58 on the list, 90 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 8 of 8 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 85 of 85 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
