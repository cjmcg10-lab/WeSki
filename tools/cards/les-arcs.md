# Les Arcs (les-arcs)

Built 2026-11-23 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**567 runs (128 named, 195.4 km), 78 lifts. 3 things to look at.**

- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: 11 shown runs rated by guess  
  (no name), Route des Espagnols
- **LOOK**: 1 runs climb more than 12 m  
  Arandelières 15 m
- info: 14 joins made automatically (look at the longest ones on the map)  
  Belvédère top ski 38 m; Belvédère bottom ski 38 m; Barmont bottom ski 52 m; Marsupilami bottom ski 71 m; None top ski 39 m; Barmont top ski 52 m; Clapet bottom ski 41 m; Violettes bottom walk 200 m; Bois de Saule bottom ski 77 m; Bois de Saule top ski 77 m; None top ski 119 m; None top ski 41 m; None bottom ski 222 m; unnamed#125 ski 27 m
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1267479437, 56 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1344768059, 51 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1246919974, 11 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 12 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 1, flat black: 2, no rating: 12, overlap: 2, run climbs: 1, run missing: 5, stub: 5
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  83 on the list, 136 matched, 0 corrected from OpenStreetMap
- pass: reachable from the base: 570 of 570 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
