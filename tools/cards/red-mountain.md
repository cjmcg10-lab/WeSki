# Red Mountain (red-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**111 runs (106 named, 86.9 km), 8 lifts. 4 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Huckleberry Flats, Pale Face, Roots Meadows, T-Bar Slope (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: lifts on the resort's list: 7 of 8 on the map  
  MISSING: Grey Mtn Chair. A missing chair or gondola usually means a missing area: find it before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json under lifts_explained)
- **LOOK**: reachable from the base: 109 of 112 run pieces  
  not reachable: ['Dr. Feel Good', 'Free as a Bird', 'Search and Destroy']
- **LOOK**: 1 runs climb more than 12 m  
  Unknown Legend 16 m
- info: 7 joins made automatically (look at the longest ones on the map)  
  Coolers top ski 48 m; Dr. Feel Good top walk 92 m; Powder Fields Traverse (upper) bottom ski 57 m; Free as a Bird top ski 50 m; Search and Destroy top ski 50 m; unnamed#99 ski 179 m; Golden Dawn ski 41 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (876354334, 140 m): OpenStreetMap: backcountry, no name (not a resort run)
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 1, run climbs: 3
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  104 on the list, 181 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
