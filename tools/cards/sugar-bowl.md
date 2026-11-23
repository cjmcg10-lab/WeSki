# Sugar Bowl (sugar-bowl)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**123 runs (114 named, 50.9 km), 13 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- **LOOK**: reachable from the base: 117 of 123 run pieces  
  not reachable: ['Century Club', "Duck's Quack", 'Judah Bowl', 'Roller Pass', 'South Bowl Road', 'Turn Roger']
- info: 23 joins made automatically (look at the longest ones on the map)  
  The Other One top ski 62 m; Lonesome Pine bottom ski 39 m; Lower Mactavish bottom ski 39 m; Hari-Kari Gully top ski 98 m; Judah Bowl top ski 55 m; Perco's bottom ski 38 m; None top ski 55 m; Middle Palisades top walk 56 m; Railroad Run top walk 161 m; Railroad Run bottom ski 43 m; Crow's Face bottom ski 95 m; None top ski 77 m; Beyond Gully bottom ski 87 m; Boundary Bowl top walk 84 m; Turn Roger top walk 69 m; Duck's Quack top ski 67 m; Railroad Run walk 169 m; The Palisades ski 136 m; Sherpa Creek ski 220 m; Perco's ski 49 m; Hidden Gully ski 43 m; Perco's ski 43 m; Village Gondola (bottom) ski 118 m
- info: audit: dead end: 1, lift missing: 3, no rating: 1, run missing: 6
- info: same counts as the previous build
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Magic carpet
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
