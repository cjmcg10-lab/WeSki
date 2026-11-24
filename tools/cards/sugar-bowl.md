# Sugar Bowl (sugar-bowl)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**119 runs (111 named, 48.4 km), 13 lifts. 3 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Hannes Schroll (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 120 of 123 run pieces  
  not reachable: ["Duck's Quack", 'South Bowl Road', 'Turn Roger']
- **LOOK**: change from the previous build: runs 122 -> 119, named 114 -> 111, km 50.4 -> 48.4  
  fewer lifts or named runs than before: compare before pushing
- info: 21 joins made automatically (look at the longest ones on the map)  
  The Other One top ski 62 m; Lonesome Pine bottom ski 39 m; Lower Mactavish bottom ski 39 m; Hari-Kari Gully top ski 98 m; Judah Bowl top ski 55 m; Perco's bottom ski 38 m; None top ski 55 m; Middle Palisades top walk 56 m; Railroad Run top walk 161 m; Railroad Run bottom ski 43 m; Crow's Face bottom ski 95 m; None top ski 77 m; Beyond Gully bottom ski 87 m; Boundary Bowl top walk 84 m; Turn Roger top walk 69 m; Duck's Quack top ski 67 m; The Palisades ski 136 m; Perco's ski 49 m; Hidden Gully ski 43 m; Perco's ski 43 m; Village Gondola (bottom) ski 118 m
- info: 4 run pieces hidden (not on the resort's list and not a link)  
  South Bowl Road (879912959, 1272 m): hidden by hand: north of the Village, off the 2025 trail map; no lift reaches it and it leads to no lift (OpenStreetMap only); (no name) (1474498005, 503 m): unnamed piece, not on the resort's list, leads nowhere on it; Turn Roger (879912961, 391 m): hidden by hand: beside South Bowl Road north of the Village, off the 2025 trail map; no lift reaches it (OpenStreetMap only); Duck's Quack (879912962, 296 m): hidden by hand: beside South Bowl Road north of the V
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 1, lift missing: 3, no rating: 1, run missing: 6
- pass: ratings checked against the resort's own list  
  92 on the list, 158 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 12 of 12 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
