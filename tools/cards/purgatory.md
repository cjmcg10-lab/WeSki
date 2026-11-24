# Purgatory (purgatory)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**112 runs (103 named, 80.3 km), 12 lifts. 2 things to look at.**

- **LOOK**: 14 runs on the resort's list are not on the map  
  Apprentice, BC, Exodus, Flume, Graduate, Harris Park, Legends Bypass, Lower BD&M, Nature Trail, PHD, Pinkerton Toll Road, Professor, Skiway, Upper BD&M (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: lifts on the resort's list: 10 of 11 on the map  
  MISSING: Colorado Couloir. A missing chair or gondola usually means a missing area: find it before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json under lifts_explained)
- info: 13 joins made automatically (look at the longest ones on the map)  
  Dirty's Secret bottom ski 123 m; Sicklicious bottom ski 56 m; Pitchfork top ski 50 m; When top ski 56 m; Mark's Park top ski 39 m; Gutless bottom ski 52 m; Yote's Chute top walk 87 m; Grand Colorado Couloir top ski 44 m; None top walk 119 m; None bottom walk 220 m; Gelande bottom ski 45 m; Tribulation bottom ski 38 m; Sun Dog bottom ski 40 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1363949090, 174 m): unnamed piece, not on the resort's list, not joined to it
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 1
- info: change from the previous build: runs 113 -> 112, km 80.5 -> 80.3
- pass: ratings checked against the resort's own list  
  117 on the list, 153 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 113 of 113 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
