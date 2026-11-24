# Powder Mountain (powder-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**225 runs (205 named, 189.1 km), 9 lifts. 5 things to look at.**

- **LOOK**: 7 runs on the resort's list are not on the map  
  Angus, Hey Maybe Not, Powder Horn, Saddle Horn, Silver Bowl, Slow-Mo, T.O.M. (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: lifts on the resort's list: 7 of 12 on the map  
  MISSING: Mary's, Primetime, Raintree, Sun Tunnel, Village. A missing chair or gondola usually means a missing area: find it before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json under lifts_explained)
- **LOOK**: reachable from the base: 213 of 225 run pieces  
  not reachable: ['8899', 'All Good', 'Carpe Diem', 'Claim', 'East', 'James Face', 'K2', 'Not 8900', "Shug'r Bowl", 'South', 'The Elevator', 'Y Chute']
- **LOOK**: 10 runs climb more than 12 m  
  Julie's Gyration 13 m; Powder Country Boundary 62 m; Candy Land 16 m; Long Goodbye 15 m; Plot Twist 16 m; Double Take 13 m; Cliffhanger 12 m; White Room 25 m; Thunderdome 42 m; Super Frank! 30 m
- **LOOK**: change from the previous build: runs 226 -> 225, lifts 14 -> 9, km 189.2 -> 189.1  
  fewer lifts or named runs than before: compare before pushing
- info: 13 joins made automatically (look at the longest ones on the map)  
  Not 8900 top ski 210 m; Dakine bottom ski 65 m; Sounder Ridge bottom ski 128 m; RK bottom walk 231 m; Dead Horse bottom walk 98 m; 8899 top ski 210 m; James Face top ski 59 m; Shug'r Bowl top walk 136 m; Y Chute top ski 133 m; Middle Kingdom bottom walk 245 m; Spring Creek bottom ski 208 m; Enchanted Forest ski 269 m; Woody's World walk 101 m
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 10, no rating: 1, run climbs: 11, run missing: 1
- pass: ratings checked against the resort's own list  
  183 on the list, 295 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
