# Bear Mountain (bear-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS CA SoCal Wildfires B1 2018 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**26 runs (25 named, 13.4 km), 11 lifts. 2 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Park Run (Face), Park Run (Lower), Park Run (Upper), Pipeline (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 new lifts to review (no listed run at the top, or no listed terrain at the bottom)  
  Bear Mountain Xpress (257995919, chair, 1665 m): no run on the resort's list reaches its bottom
- info: 1 joins made automatically (look at the longest ones on the map)  
  MC3 (bottom) ski 116 m
- info: the resort's outline relation/4642684 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  26 on the list, 31 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 7 of 7 on the map
- pass: resort areas mostly missing from the map: 0
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 26 of 26 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
