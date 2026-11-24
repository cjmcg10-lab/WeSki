# Mountain High (mountain-high)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**41 runs (35 named, 17.4 km), 12 lifts. 4 things to look at.**

- **LOOK**: 14 runs on the resort's list are not on the map  
  Burn Out, Canyon, Colt 45, Creek Side, Cut Off, Drop In, Magnum, Rangers, Route 66, Sepps, Smokeout, Stampede, The Pocket, Woodworth Gulch (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: lifts on the resort's list: 7 of 8 on the map  
  MISSING: Mountain High Express. A missing chair or gondola usually means a missing area: find it before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json under lifts_explained)
- **LOOK**: reachable from the base: 27 of 43 run pieces  
  not reachable: ['Boardwalk', 'Cascade', 'Catalina', 'First Tracks', 'Goldrush', 'Olympic Bowl', 'Round-A-Bout', 'Sundance', 'Sunset', 'Wildcard', 'unnamed#29', 'unnamed#30', 'unnamed#31', 'unnamed#32', 'unnamed#39', 'unnamed#40']
- **LOOK**: change from the previous build: runs 43 -> 41, named 37 -> 35, km 18.5 -> 17.4  
  fewer lifts or named runs than before: compare before pushing
- info: 3 joins made automatically (look at the longest ones on the map)  
  First Tracks top ski 140 m; First Tracks bottom walk 187 m; Cascade walk 128 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  Round-A-Bout (330801175, 567 m): hidden by hand: North Resort run: its chair (Sunrise Quad) is tagged abandoned in OpenStreetMap and the resort's 2023 North Resort map shows only the lodge, tubing (Yeti's Snow Park) and learning carpets, no ski trails; Cascade (330801155, 490 m): hidden by hand: North Resort run: its chair (Sunrise Quad) is tagged abandoned in OpenStreetMap and the resort's 2023 North Resort map shows only the lodge, tubing (Yeti's Snow Park) and learning carpets, no ski trails
- info: audit: lift missing: 3
- info: the resort's outline relation/3185646 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  49 on the list, 44 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
