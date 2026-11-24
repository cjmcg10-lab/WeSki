# Red Mountain (red-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**108 runs (103 named, 83.6 km), 8 lifts. 3 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Huckleberry Flats, Pale Face, Roots Meadows, T-Bar Slope (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 109 of 112 run pieces  
  not reachable: ['Dr. Feel Good', 'Free as a Bird', 'Search and Destroy']
- **LOOK**: 1 runs climb more than 12 m  
  Unknown Legend 16 m
- info: 7 joins made automatically (look at the longest ones on the map)  
  Coolers top ski 48 m; Dr. Feel Good top walk 92 m; Powder Fields Traverse (upper) bottom ski 57 m; Free as a Bird top ski 50 m; Search and Destroy top ski 50 m; unnamed#99 ski 179 m; Golden Dawn ski 41 m
- info: 4 run pieces hidden (not on the resort's list and not a link)  
  Search and Destroy (876354335, 1206 m): hidden by hand: Mount Kirkup cat-skiing run: the 2025/26 trail map shows it reached by the paid Kirkup snowcat from the Grey Mountain top, not by a lift, so directions cannot use it (the map rates it black); Free as a Bird (876354333, 1084 m): hidden by hand: Mount Kirkup cat-skiing run: the 2025/26 trail map shows it reached by the paid Kirkup snowcat from the Grey Mountain top, not by a lift, so directions cannot use it (the map rates it black); Dr. Feel
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 1, run climbs: 3
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  101 on the list, 175 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 8 of 8 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
