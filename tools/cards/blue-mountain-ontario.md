# Blue Mountain (blue-mountain-ontario)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**63 runs (50 named, 31.9 km), 13 lifts. 3 things to look at.**

- **LOOK**: 8 runs on the resort's list are not on the map  
  Burner, Going South Glades, Lower Orchard Glades, North Glades, Old South Glades, Showcase Glades, Upper Orchard Glades, Yahoo Trail (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 2 shown runs rated by guess  
  (no name), Hell's Half Acre
- **LOOK**: change from the previous build: runs 64 -> 63, named 51 -> 50, km 32.0 -> 31.9  
  fewer lifts or named runs than before: compare before pushing
- info: 4 joins made automatically (look at the longest ones on the map)  
  Rinus Run top ski 43 m; Kandahar top ski 48 m; Greatest Hits Freestyle Terrain top ski 43 m; Enchanted Forest ski 41 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  (no name) (195258204, 53 m): unnamed piece, not on the resort's list, leads nowhere on it; Greatest Hits Freestyle Terrain (206168980, 40 m): hidden by hand: a 40 m piece of an old terrain-park name in OpenStreetMap; the resort lists its parks as Badlands, Grove, L-Park and Yahoo, not this one (resort feed, 2026-11-23)
- info: audit: no rating: 2
- pass: ratings checked against the resort's own list  
  56 on the list, 80 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 11 of 11 on the map
- pass: resort areas mostly missing from the map: 0
- pass: reachable from the base: 65 of 65 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
