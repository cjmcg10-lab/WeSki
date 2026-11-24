# Beech Mountain (beech-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: not rebuilt (--checks-only).

**14 runs (11 named, 5.2 km), 8 lifts. 1 things to look at.**

- **LOOK**: 3 runs on the resort's list are not on the map  
  Carolina Caribbean, Lower Powder Bowl, Upper Powder Bowl (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: audit: stub: 1
- info: same counts as the previous build
- info: the resort's outline relation/5886546 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  19 on the list, 16 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 9 of 9 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
