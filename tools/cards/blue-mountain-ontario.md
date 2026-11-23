# Blue Mountain (blue-mountain-ontario)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**70 runs (57 named, 34.5 km), 14 lifts. 3 things to look at.**

- **LOOK**: 9 runs on the resort's list are not on the map  
  Burner, Going South Glades, Lower Orchard Glades, North Glades, Old South Glades, Senator / Larway, Showcase Glades, Upper Orchard Glades, Yahoo Trail (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 2 shown runs rated by guess  
  (no name), Hell;s Half Acre
- **LOOK**: reachable from the base: 65 of 71 run pieces  
  not reachable: ['Manitou', 'Millennium', 'The Fly', 'The Pen', 'Venture', 'Vortex']
- info: 8 joins made automatically (look at the longest ones on the map)  
  Rinus Run top ski 43 m; Kandahar top ski 48 m; The Pen bottom ski 67 m; The Fly top ski 40 m; Venture top ski 145 m; Greatest Hits Freestyle Terrain top ski 43 m; Venture ski 225 m; Enchanted Forest ski 41 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (195258204, 53 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 2
- info: same counts as the previous build
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): V-Hill
- pass: ratings checked against the resort's own list  
  56 on the list, 78 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 11 of 11 on the map
- pass: resort areas mostly missing from the map: 0
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
