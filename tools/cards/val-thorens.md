# Val Thorens (val-thorens)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**260 runs (103 named, 156.2 km), 33 lifts. 4 things to look at.**

- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: reachable from the base: 264 of 265 run pieces  
  not reachable: ['Le Lac de Lou par la Masse']
- **LOOK**: 2 runs climb more than 12 m  
  Caron-Lac du Lou 17 m; Plein Sud 15 m
- **LOOK**: change from the previous build: named 104 -> 103  
  fewer lifts or named runs than before: compare before pushing
- info: 15 joins made automatically (look at the longest ones on the map)  
  Caron-Lac du Lou bottom ski 64 m; Access UCPA top ski 54 m; None bottom ski 97 m; Paturages bottom walk 211 m; Paturages top ski 92 m; Boulevard Boismint top ski 42 m; Bleuets bottom ski 52 m; None bottom ski 56 m; None top ski 57 m; None top ski 144 m; None bottom ski 49 m; None top ski 56 m; Bleuets top ski 52 m; Boulevard Rosaël ski 25 m; Mont de la Chambre ski 15 m
- info: 5 run pieces hidden (not on the resort's list and not a link)  
  (no name) (142388485, 122 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (564223843, 82 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (321429138, 59 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (564354799, 56 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (108020383, 40 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 5 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 2, flat black: 1, no rating: 3, run climbs: 3, run missing: 2, run uphill: 1, stub: 3
- pass: ratings checked against the resort's own list  
  74 on the list, 118 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
