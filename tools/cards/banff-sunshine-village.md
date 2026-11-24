# Banff Sunshine Village (banff-sunshine-village)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**200 runs (160 named, 94.0 km), 14 lifts. 4 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 3 shown runs rated by guess  
  (no name)
- **LOOK**: reachable from the base: 195 of 200 run pieces  
  not reachable: ['Delirium Dive', 'G1', 'G2', 'Galaxy Chutes Traverse', 'Milky Way']
- **LOOK**: 1 runs climb more than 12 m  
  Delirium Dive 13 m
- info: 56 joins made automatically (look at the longest ones on the map)  
  The Waterfall top ski 62 m; Virgins top ski 46 m; Morain Gully top ski 56 m; Morain Gully bottom ski 40 m; Diamond Back bottom ski 120 m; Sugar Cubes bottom ski 44 m; Practice Cliffs bottom ski 84 m; Buffalo Jump top ski 59 m; Buffalo Jump bottom ski 41 m; Bre X top walk 83 m; Corral Cut-off bottom ski 62 m; Kid's Play bottom ski 100 m; Luxton's bottom ski 46 m; Kain Cliffs bottom walk 87 m; Engler's top ski 40 m; Engler's bottom ski 44 m; Wheeler's top walk 164 m; Wheeler's bottom ski 41 m; Kain Cliffs top walk 56 m; Kain Cliffs bottom ski 84 m; Peyto's bottom ski 41 m; Fall Line top ski 40 m; Kid's Play bottom ski 53 m; Mother-In-Law top ski 51 m; Goat's Head Soup top ski 51 m; Wildslide t
- info: audit: no rating: 3, run climbs: 1, stub: 1
- info: same counts as the previous build
- info: resort feed mtnpowder 76 gave no trail list: KeyError: 'MountainAreas'
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
