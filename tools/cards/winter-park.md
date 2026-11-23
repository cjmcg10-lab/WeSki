# Winter Park (winter-park)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**201 runs (187 named, 128.9 km), 25 lifts. 2 things to look at.**

- **LOOK**: lifts on the resort's list: 25 of 26 on the map  
  MISSING: Cirque Sled. A missing chair or gondola usually means a missing area: find it before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json under lifts_explained)
- **LOOK**: 1 shown runs rated by guess  
  Halfpipe
- info: 19 joins made automatically (look at the longest ones on the map)  
  Heart of Darkness bottom walk 165 m; G-Face top ski 87 m; Go-Joe top walk 159 m; Shadow Chute top ski 195 m; Wagon Train top ski 59 m; Halfpipe top ski 132 m; Halfpipe bottom ski 78 m; Key Hole top ski 62 m; Key Hole bottom ski 70 m; Better Not top walk 65 m; Better Not bottom walk 53 m; Brian's Run bottom ski 58 m; Corridor Mary Jane to Winter Park top ski 71 m; Corona Way top ski 62 m; None bottom walk 71 m; Jelly Roll Glades bottom ski 163 m; Freeriders bottom ski 68 m; Better Not ski 93 m; Outhouse ski 12 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (878422903, 189 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 2, flat black: 2, no rating: 2, run climbs: 1
- info: same counts as the previous build
- info: config has no osm_bbox: used the built map's extent (add osm_bbox to the config)
- pass: ratings checked against the resort's own list  
  164 on the list, 270 matched, 0 corrected from OpenStreetMap
- pass: resort areas mostly missing from the map: 0
- pass: reachable from the base: 202 of 202 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
