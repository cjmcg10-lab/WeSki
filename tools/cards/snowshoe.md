# Snowshoe (snowshoe)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**63 runs (61 named, 30.6 km), 13 lifts. 2 things to look at.**

- **LOOK**: 3 runs on the resort's list are not on the map  
  Black Bear, Cubb Run Ext., Shamrock (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 45 of 64 run pieces  
  not reachable: ['Bear Claw', 'Bluehorn', 'Buck Saw', "Can't Hook", 'Cascade', 'Cubb Run', 'Cubb run', 'Flying Eagle', 'Flying Eagle Glades', 'Fox Chase', 'Greenhorn', 'Knife Blade', 'Laurel Run', 'Little Spruce', "Robertson's Run", 'Slaymaker', 'Spur', 'magic carpet slope']
- info: 1 joins made automatically (look at the longest ones on the map)  
  SunSet Glades top ski 69 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (321606898, 57 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  62 on the list, 79 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 14 of 14 on the map
- pass: resort areas mostly missing from the map: 0
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
