# Eldora (eldora)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**73 runs (61 named, 35.3 km), 10 lifts. 2 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Mary's Way (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: change from the previous build: named 62 -> 61  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Sunset ski 51 m
- pass: ratings checked against the resort's own list  
  57 on the list, 84 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 9 of 9 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 73 of 73 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
