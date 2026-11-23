# Brighton (brighton)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**90 runs (63 named, 47.8 km), 8 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: reachable from the base: 88 of 90 run pieces  
  not reachable: ["Barrett's Glade", 'Solbright']
- **LOOK**: 2 runs climb more than 12 m  
  Scree Slope 14 m; Krista's 13 m
- info: 1 joins made automatically (look at the longest ones on the map)  
  Barrett's Glade top walk 151 m
- info: audit: dead end: 1, run climbs: 2
- info: same counts as the previous build
- info: resort feed mtnpowder 66 gave no trail list: KeyError: 'MountainAreas'
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
