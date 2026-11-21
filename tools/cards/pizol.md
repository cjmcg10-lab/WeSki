# Pizol (pizol)

Built 2026-11-21 by tools/pipeline.py. Terrain: swiss.

**85 runs (39 named, 41.6 km), 14 lifts. 2 things to look at.**

- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: 2 runs climb more than 12 m  
  Abfahrt Grosses Täli 17 m; Kappeler 16 m
- info: 2 joins made automatically (look at the longest ones on the map)  
  Abfahrt Wangs bottom ski 229 m; Talabfahrt bottom walk 174 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  (no name) (906998635, 58 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (909395849, 47 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: run climbs: 2, run missing: 1
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  38 on the list, 57 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 87 of 87 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
